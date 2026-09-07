/**
 * 野田組 業務ダッシュボード — 受注出荷計画表 集計エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：共有ドライブに日次保存される「受注出荷計画表」PDFの最新分を読み、
 *       サイズ別の未出荷合計・総受注件数・出荷希望日が近い注文の一覧を
 *       ダッシュボードに渡す。
 *
 * PDFはテキスト埋め込み型（ActiveReports生成）。GASはPDFを直接パースできないため、
 * Driveの自動変換でPDF→Googleドキュメント化し、その本文を段落単位で読む。
 * 変換後は元の表構造がテーブル要素にはならず、PDFの1行がそのまま1段落になる。
 * 依頼番号の行は "24- 61483- 0  品名  数量  引当数  出荷先 住所..." という並びで、
 * 「新」「修」などの継続マークが行頭に付くことがあるため、正規表現は行の先頭を
 * 固定せず途中からマッチできるようにしている（末尾は$で固定）。
 * 「出荷希望日：」を含む段落は実際の日付が段落の末尾に付く（例:「...07:17 3 ページ 26/08/09」）。
 *
 * ★ 既存プロジェクトに同居させる場合は既存コードと名前が被らないよう
 *   設定は ORDER_CONFIG、内部関数は ord_ 接頭辞にしてある。
 *
 * 使い方：
 * 1. GASエディタ左メニューの「サービス」→「+」→ Drive API を追加する
 *    （Advanced Google services。これをしないと ord_convertToDoc_ でエラーになる）。
 * 2. このファイルの中身を貼り付けて保存する。
 * 3. 関数 testOrderPlanDashboard を実行 → 実行ログで数値を確認。
 */

var ORDER_CONFIG = {
  // 受注出荷計画表PDFの保存フォルダ
  FOLDER_ID: '1YU3nui2u93ZzhALjmVQKZ1I9DHtFjjqE',

  // ファイル名の日付「(26.8.6受注終了分)」を解析する正規表現
  NAME_PATTERN: /受注出荷計画表\((\d+)\.(\d+)\.(\d+)受注終了分\)/,

  RECENT_COUNT: 8   // ダッシュボードに出す「出荷希望日が近い注文」の件数（ＬＰガス容器のみ。バルク貯槽・付属品等は除外）
};

// ===== 公開関数：ダッシュボード用データを組み立てる =====
function getOrderPlanDashboardData() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    file: null,
    totalOrders: 0,
    bySize: {},        // 商品種別 → 未出荷合計
    recent: [],         // 出荷希望日が近い注文
    error: null
  };

  var tempFileId = null;
  try {
    var file = ord_getLatestFile_(ORDER_CONFIG.FOLDER_ID);
    data.file = file.getName();

    var conv = ord_convertToDoc_(file);
    tempFileId = conv.id;
    var body = DocumentApp.openById(conv.id).getBody();
    var paragraphs = body.getParagraphs(); // PDFの表構造はテーブル化されず、1行=1段落になる

    var orders = ord_parseOrdersFromParagraphs_(paragraphs);
    var lpOrders = orders.filter(function (o) { return o.name.indexOf('ＬＰガス容器') !== -1; });
    data.totalOrders = orders.length;
    data.recent = lpOrders.slice(0, ORDER_CONFIG.RECENT_COUNT).map(function (o) {
      return { date: o.date, orderNo: o.orderNo, name: o.name, qty: o.qty, dest: o.dest };
    });

    data.bySize = ord_parseSummaryFromParagraphs_(paragraphs);

    // 前日比：「前日の計画表には無かったのに、当日の計画表で新しく増えている
    // 依頼No」だけを探して、その本数を合計する（単純な合計本数の引き算だと、
    // 出荷が進んで表から消えた分が混ざり、新規分が見えなくなってしまうため）。
    // 土日はファイル自体が作られないため、「厳密に前日」ではなく「一番新しい
    // ファイルの1つ前のファイル」と比較する（配車エンジンの土日スキップと同じ考え方）。
    var sortedFiles = ord_getSortedFiles_(ORDER_CONFIG.FOLDER_ID);
    if (sortedFiles.length >= 2) {
      var prevLpOrders = ord_getLpOrdersForFile_(sortedFiles[1].file);
      var prevOrderNos = {};
      prevLpOrders.forEach(function (o) { prevOrderNos[o.orderNo] = true; });

      var newOrders = lpOrders.filter(function (o) { return !prevOrderNos[o.orderNo]; });
      data.yesterdayDiff = newOrders.reduce(function (sum, o) { return sum + (o.qty || 0); }, 0);
      data.yesterdayDiffCount = newOrders.length;
      data.yesterdayDiffFile = sortedFiles[0].file.getName();
      data.yesterdayDiffPrevFile = sortedFiles[1].file.getName();
    } else {
      data.yesterdayDiff = null;
    }
  } catch (err) {
    data.error = String(err);
  } finally {
    if (tempFileId) {
      try { Drive.Files.remove(tempFileId); } catch (e) { /* 削除失敗は無視 */ }
    }
  }

  return data;
}

// ===== フォルダ内の最新PDFを取得（ファイル名の日付を優先） =====
function ord_getLatestFile_(folderId) {
  var files = ord_getSortedFiles_(folderId);
  if (files.length === 0) throw new Error('受注出荷計画表PDFが見つかりません');
  return files[0].file;
}

// ===== フォルダ内の受注出荷計画表PDFを、日付の新しい順に並べて返す =====
// 戻り値: [{ file, key }, ...]（keyが大きいほど新しい）
function ord_getSortedFiles_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var list = [];
  while (files.hasNext()) {
    var f = files.next();
    var m = ORDER_CONFIG.NAME_PATTERN.exec(f.getName());
    if (!m) continue;
    var key = (2000 + parseInt(m[1], 10)) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
    list.push({ file: f, key: key });
  }
  list.sort(function (a, b) { return b.key - a.key; }); // 新しい順
  return list;
}

// ===== 指定したPDFファイルの、LP容器の個別注文一覧（依頼No・本数）を取得する =====
// （前日比の計算用。依頼No単位で新規注文を検出するために使う）
function ord_getLpOrdersForFile_(file) {
  var tempFileId = null;
  try {
    var conv = ord_convertToDoc_(file);
    tempFileId = conv.id;
    var body = DocumentApp.openById(conv.id).getBody();
    var paragraphs = body.getParagraphs();
    var orders = ord_parseOrdersFromParagraphs_(paragraphs);
    return orders.filter(function (o) { return o.name.indexOf('ＬＰガス容器') !== -1; });
  } finally {
    if (tempFileId) {
      try { Drive.Files.remove(tempFileId); } catch (e) { /* 削除失敗は無視 */ }
    }
  }
}

// ===== PDFをGoogle Docsに変換（Drive API v3） =====
function ord_convertToDoc_(file) {
  var blob = file.getBlob();
  var resource = { name: file.getName() + '_tmp_text', mimeType: 'application/vnd.google-apps.document' };
  return Drive.Files.create(resource, blob);
}

// ===== 個別受注のパース（段落単位） =====
// 「出荷希望日：」を含む段落は、末尾に実際の出荷希望日（例:26/08/09）が付いている。
// 受注行は "24- 61483- 0  品名  数量  引当数  出荷先 住所..." という並び。
function ord_parseOrdersFromParagraphs_(paragraphs) {
  var orders = [];
  var currentDate = null;
  var datePat = /(\d{2}\/\d{2}\/\d{2})/g;
  var orderPat = /(\d{2})\s*-\s*(\d+)\s*-\s*\d+\s+(.+?)\s+(\d+)\s+(\d+)\s+(\S.+)$/;

  paragraphs.forEach(function (p) {
    var t = p.getText().trim();
    if (!t) return;

    if (t.indexOf('出荷希望日') !== -1) {
      var dates = t.match(datePat);
      if (dates && dates.length > 0) currentDate = dates[dates.length - 1];
      return;
    }

    var om = orderPat.exec(t);
    if (om) {
      var destFull = om[6].trim();
      var dest = destFull.split(' ')[0]; // 半角スペースの手前までが出荷先名（住所と分離）
      orders.push({
        date: currentDate,
        orderNo: om[1] + '-' + om[2],
        name: om[3].trim(),
        qty: parseInt(om[4], 10) || 0,
        assigned: parseInt(om[5], 10) || 0,
        dest: dest
      });
    }
  });
  return orders;
}

// ===== 末尾の総括表（商品種別ごとの合計）のパース =====
// 段落の区切りが元のPDFの行区切りと一致しておらず、複数項目が1段落に
// まとめて詰め込まれることがあるため、範囲全体を1つの文章として連結し、
// LP容器の全サイズ（2K/5K/8K/10K/20K各種/25K/30K/50K各種）を
// それぞれ個別に検索する。ラベルの直後に出てくる「数字＋空白＋数字」の
// 2番目の数字を合計（グランドトータル）として採用する。受注が無いサイズは0。
function ord_parseSummaryFromParagraphs_(paragraphs) {
  var result = {};
  var startIdx = -1, endIdx = -1;

  for (var i = 0; i < paragraphs.length; i++) {
    var t = paragraphs[i].getText();
    if (startIdx === -1 && t.indexOf('受注出荷計画総括表（容器）') !== -1) { startIdx = i; continue; }
    if (startIdx !== -1 && t.indexOf('受注出荷計画総括表（機械') !== -1) { endIdx = i; break; }
  }
  if (startIdx === -1) return result;
  if (endIdx === -1) endIdx = paragraphs.length;

  var section = '';
  for (var j = startIdx + 1; j < endIdx; j++) {
    section += ' ' + paragraphs[j].getText();
  }

  function grab(anchorPattern) {
    var re = new RegExp(anchorPattern + '[^0-9]{0,12}([0-9,]{2,})\\s+([0-9,]{2,})');
    var m = re.exec(section);
    return m ? parseInt(m[2].replace(/,/g, ''), 10) : null;
  }

  // LP容器の全サイズ（総括表に載っている順）
  var items = [
    { key: '2K',           label: '2K',        anchor: '２Ｋ[^０-９]{0,4}ＬＰＧ容器(?!（)' },
    { key: '5K',           label: '5K',         anchor: '５Ｋ[^０-９]{0,4}ＬＰＧ容器(?!（)' },
    { key: '8K',           label: '8K',         anchor: '８Ｋ[^０-９]{0,4}ＬＰＧ容器(?!（)' },
    { key: '10K',          label: '10K',        anchor: '１０Ｋ[^０-９]{0,4}ＬＰＧ容器(?!（)' },
    { key: '20K_三部軽量',  label: '20K(三部軽量)', anchor: '２０Ｋ[^０-９]{0,12}三部軽量' },
    { key: '20K_直付',     label: '20K(直付)',   anchor: '２０Ｋ[^０-９]{0,12}直付' },
    { key: '30K',          label: '30K',        anchor: '３０Ｋ[^０-９]{0,4}ＬＰＧ容器' },
    { key: '50K_軽量型',    label: '50K(軽量型)', anchor: '５０Ｋ[^０-９]{0,12}軽量型' },
    { key: '50K_S',        label: '50K(S)',     anchor: '５０Ｋ[^０-９]{0,12}（Ｓ）' }
  ];

  items.forEach(function (it) {
    var v = grab(it.anchor);
    result[it.key] = { label: it.label, count: v || 0 };
  });

  return result;
}

// ===== 動作確認：実行するとログに集計結果が出る =====
function testOrderPlanDashboard() {
  Logger.log(JSON.stringify(getOrderPlanDashboardData(), null, 2));
}

// ===== デバッグ用：変換後の実際のテキストを確認する =====
// startIndex から40件、そのままログに出す。全体の先頭を見る場合は startIndex=0、
// 総括表付近を見る場合は debugOrderPlanFindSummarySection() で位置を特定してから使う。
function debugOrderPlanRawText(startIndex) {
  startIndex = startIndex || 0;
  var file = ord_getLatestFile_(ORDER_CONFIG.FOLDER_ID);
  var conv = ord_convertToDoc_(file);
  try {
    var body = DocumentApp.openById(conv.id).getBody();
    var n = body.getNumChildren();
    var out = [];
    var count = 0;
    for (var i = startIndex; i < n && count < 40; i++) {
      var el = body.getChild(i);
      var type = el.getType();
      var text = '';
      if (type === DocumentApp.ElementType.PARAGRAPH) text = el.asParagraph().getText();
      else if (type === DocumentApp.ElementType.TABLE) text = '[TABLE]';
      else text = '[' + type + ']';
      if (text.trim() === '') continue;
      out.push('[' + i + '] ' + text);
      count++;
    }
    Logger.log(out.join('\n---\n'));
  } finally {
    Drive.Files.remove(conv.id);
  }
}

// ===== デバッグ用：総括表(容器)の実際のテキストを直接見る =====
function debugOrderPlanSummaryText() {
  debugOrderPlanRawText(2024);
}
// ===== デバッグ用：「受注出荷計画総括表（容器）」が段落の何番目にあるかを探す =====
function debugOrderPlanFindSummarySection() {
  var file = ord_getLatestFile_(ORDER_CONFIG.FOLDER_ID);
  var conv = ord_convertToDoc_(file);
  try {
    var body = DocumentApp.openById(conv.id).getBody();
    var n = body.getNumChildren();
    for (var i = 0; i < n; i++) {
      var el = body.getChild(i);
      if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
      var t = el.asParagraph().getText();
      if (t.indexOf('受注出荷計画総括表') !== -1) {
        Logger.log('見つかった位置: ' + i + ' / テキスト: ' + t);
      }
    }
  } finally {
    Drive.Files.remove(conv.id);
  }
}