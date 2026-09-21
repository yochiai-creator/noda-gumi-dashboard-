/**
 * 野田組 業務ダッシュボード — アーム（建機ブーム・アーム）の出荷予定
 * ------------------------------------------------------------------
 * 役割：配車タブに「いつ・どの機種の何号機が・どこへ出るか」を出す。
 *
 * ★ どこから取るのか
 *   元データは「'001_アーム出荷明細」フォルダ（SRC_FOLDER_ID）に毎週入る
 *   .xlsm（4〜7MB）。ファイル名は固定していない。
 *   名前に「日程表変更」を含む .xlsm を全部見て、
 *   名前の中の日付「(26年9月10日)」が一番新しいものを使う。
 *   これを毎回スプレッドシートに変換して読むのは重すぎる（変換だけで十数秒）。
 *
 *   すでに別プロジェクト「アーム出荷明細pdf生成」が、
 *   .xlsm が更新されるたび（15分おきのポーリング）に中身を読み、
 *   ・「アーム機種別出荷明細_YYYY-MM-DD.pdf」
 *   ・「arm_pdf_snapshot.json」（図番_号機 → 中身 のマップ）
 *   を「①出荷作業用」フォルダに書き出している。
 *   このJSONは落合さんが見ているPDFとまったく同じ内容なので、
 *   こちらはそれを読むだけにする（Driveのファイルを1つ読むだけ＝速い）。
 *
 * ★ 古いものを黙って出さない
 *   PDF生成側が止まるとJSONも古いままになる。元の .xlsm の更新日時と
 *   見比べて、JSONのほうが古ければ stale を立てて画面に出す。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて arm_ 接頭辞にしてある。
 */

var ARM_CONFIG = {
  // PDFとJSONの置き場（「①出荷作業用」）
  OUT_FOLDER_ID: '1-RrriADJSmBt2a7HsYpb_c8TUHHJpxkz',
  SNAPSHOT_NAME: 'arm_pdf_snapshot.json',
  /* ★ PDFの名前は前方一致で見ない。名前は実際に変わる
       （「アーム機種別出荷明細_2026-09-19.pdf」→
         「アーム出荷明細(9/18)_2026-09-21.pdf」）。
       前方一致にしていたせいで、名前が変わった日から新しいPDFが出なくなった。
       語が全部入っていれば拾う、という見方にする。 */
  PDF_KEYWORDS: ['アーム', '出荷明細'],
  PDF_EXT: '.pdf',

  // 元の .xlsm 置き場（「'001_アーム出荷明細」）。新しさの確認だけに使う。
  SRC_FOLDER_ID: '1NS4WoClO0xlGWSxvFimFcqFGUT0jOKQL',
  SRC_KEYWORD: '日程表変更',   // ファイル名は固定しない。この語を含む .xlsm を探す
  SRC_EXT: '.xlsm',

  DAYS: 31,  // PDF生成側と同じ「直近1か月」

  // ---- 月別の出荷実績を貯めるための設定 ----
  // 元の .xlsm の「出荷明細」シート。6行目からデータ。列は1始まり。
  DETAIL_SHEET: '出荷明細',
  COL: { insp: 5, kk: 6, zu: 9, go: 12, spec: 13, ship: 33, info: 40, dest: 43 },
  /* 集計結果の置き場（出荷実績の蓄積スプレッドシートの中に作る）。
     ★ 月ではなく日で貯める。月でまとめてしまうと「今月の途中まで」が作れず、
       今月の棒に先の予定まで混ざってしまう（実績として見るものなので困る）。
       集計し直すのは元ファイルが変わったときだけなので、
       「どこまでが実績か」は読むときに今日で切る。 */
  MONTH_SHEET: 'アーム日次',
  MONTH_HEADERS: ['日付', '区分', '台数'],
  // 前回どのファイルから集計したか
  PROP_SIG: 'armMonthly.sourceSignature',
  PROP_SRC: 'armMonthly.sourceName',
  PROP_AT: 'armMonthly.harvestedAt'
};

var ARM_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ===== 公開関数：アームの出荷予定（画面用・キャッシュ付き） =====
function getArmShipPlan(force) {
  return nc_cached_('armPlan', force === true, 600, getArmShipPlan_uncached_);
}

function getArmShipPlan_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    days: [],          // [{ date, label, weekday, count, byDest, rows }] 出荷日の古い順
    byKind: [],        // [{ 名, 台数 }] この期間ぶんの機種別。台数の多い順
    total: 0,
    pdfUrl: null,
    pdfName: null,
    sourceName: null,  // 元になった .xlsm
    snapshotAt: null,  // JSONがいつ作られたか
    stale: false,      // 元の .xlsm のほうが新しい＝PDF生成が追いついていない
    error: null
  };

  try {
    var snap = arm_readSnapshot_();
    if (!snap) {
      data.error = 'アームの出荷予定（' + ARM_CONFIG.SNAPSHOT_NAME + '）が見つかりません。' +
                   '「アーム出荷明細pdf生成」が動いているか確認してください。';
      return data;
    }
    data.snapshotAt = Utilities.formatDate(snap.updatedAt, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

    var src = arm_latestSource_();
    if (src) {
      data.sourceName = src.name;
      // 元のExcelのほうが新しければ、この予定は1周遅れている
      data.stale = src.updatedAt.getTime() > snap.updatedAt.getTime();
    }

    var pdf = arm_latestPdf_();
    if (pdf) { data.pdfUrl = pdf.url; data.pdfName = pdf.name; }

    data.days = arm_buildDays_(snap.map, new Date());
    var kind = {};
    for (var i = 0; i < data.days.length; i++) {
      data.total += data.days[i].count;
      data.days[i].rows.forEach(function (r) {
        // ★ 機種のまとめ方は月別出荷と同じ（13ton仕上げ・13ton ｼｮｰﾄ → 13ton）。
        //   同じ言葉で数えないと、予定と実績を見比べたときに合わない。
        var k = arm_kindOf_(r.kiki);
        kind[k] = (kind[k] || 0) + 1;
      });
    }
    data.byKind = Object.keys(kind).map(function (k) { return { 名: k, 台数: kind[k] }; })
      .sort(function (a, b) { return b.台数 - a.台数; });
  } catch (err) {
    data.error = String(err);
    Logger.log('アーム出荷予定の取得でエラー: ' + String(err));
  }
  return data;
}

/**
 * スナップショット（図番_号機 → 中身）を出荷日ごとにまとめる（純関数）。
 * @param {Object} map   arm_pdf_snapshot.json の中身
 * @param {Date}   now   基準日（この日の0時から DAYS 日ぶん）
 * @return {Array} 出荷日の古い順
 */
function arm_buildDays_(map, now) {
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var end = start + ARM_CONFIG.DAYS * 86400000;

  var byDate = {};
  Object.keys(map || {}).forEach(function (key) {
    var v = map[key];
    if (!v || typeof v.ship !== 'number') return;
    // ship はミリ秒。日付の0時に丸めてから範囲を見る
    var d = new Date(v.ship);
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var ms = day.getTime();
    if (ms < start || ms >= end) return;

    var dateKey = arm_dateKey_(day);
    if (!byDate[dateKey]) {
      byDate[dateKey] = {
        date: dateKey,
        label: (day.getMonth() + 1) + '/' + day.getDate(),
        weekday: ARM_WEEKDAYS[day.getDay()],
        count: 0, byDest: [], rows: [], __dest: {}
      };
    }
    var g = byDate[dateKey];
    var dest = String(v.dest || '').trim() || '（出荷先なし）';
    // ★ 図番と号機は値の中に無い。キーが「図番||号機」なので、そこから取る。
    //   （PDF生成側は同じ出荷物を見分ける鍵としてこの形で持っている）
    var id = arm_splitKey_(key);
    g.count++;
    g.__dest[dest] = (g.__dest[dest] || 0) + 1;
    g.rows.push({
      kiki: String(v.kiki || ''), kishu: String(v.kishu || ''),
      zu: v.zu != null ? String(v.zu) : id.zu,
      go: v.go != null ? String(v.go) : id.go,
      spec: String(v.spec || ''), dest: dest,
      // 情報①は「グレー」などの塗装色の指定。現場が知りたいので出す。
      info: String(v.info || ''),
      insp: String(v.insp || ''), is13: v.is13 === true,
      key: key
    });
  });

  return Object.keys(byDate).sort().map(function (k) {
    var g = byDate[k];
    g.byDest = Object.keys(g.__dest).map(function (name) {
      return { 名: name, 台数: g.__dest[name] };
    }).sort(function (a, b) { return b.台数 - a.台数; });
    delete g.__dest;
    // PDFと同じ並び（13tonを後ろに、あとは図番順）
    g.rows.sort(function (a, b) {
      if (a.is13 !== b.is13) return a.is13 ? 1 : -1;
      return a.zu < b.zu ? -1 : a.zu > b.zu ? 1 : (Number(a.go) - Number(b.go));
    });
    return g;
  });
}

/* 「図番||号機」を分ける。号機が空のときは末尾が「||」になる。
   ★ 後ろの「||」で切る（図番に「||」が入ることは無いが、入っても図番側に残す）。 */
function arm_splitKey_(key) {
  var k = String(key || '');
  var i = k.lastIndexOf('||');
  if (i < 0) return { zu: k, go: '' };
  return { zu: k.substring(0, i), go: k.substring(i + 2) };
}

function arm_dateKey_(d) {
  var p = function (n) { return n < 10 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ===== 内部：スナップショットJSONを読む =====
function arm_readSnapshot_() {
  var folder = DriveApp.getFolderById(ARM_CONFIG.OUT_FOLDER_ID);
  var it = folder.getFilesByName(ARM_CONFIG.SNAPSHOT_NAME);
  if (!it.hasNext()) return null;
  var f = it.next();
  return { map: JSON.parse(f.getBlob().getDataAsString('UTF-8')), updatedAt: f.getLastUpdated() };
}

// ===== 内部：一番新しい「日程表変更」.xlsm =====
/* ★ 更新日時ではなく「ファイル名の日付」で選ぶ。
     どちらで選ぶかで答えが変わる。実際にこうなっていた：
       出荷予定　日程表変更A(26年9月4日).xlsm   更新 9/13 06:49
       出荷予定　日程表変更A(26年9月10日).xlsm  更新 9/11 23:31
     新しい版は「9月10日」のほうなのに、更新日時で見ると「9月4日」が勝ってしまう
     （古い版を後から開き直しただけで更新日時は新しくなる）。
   ★ PDF生成側（アーム出荷明細pdf生成）も名前の日付で選んでいる。
     ここが食い違うと、画面に出す「出所」が実際に使われたファイルと別物になる。
   ★ 名前から日付が読めないものしか無いときだけ、更新日時で代用する。 */
function arm_latestSource_() {
  var f = arm_latestSourceFile_();
  return f ? { name: f.getName(), updatedAt: f.getLastUpdated() } : null;
}

// 「…A(26年9月10日).xlsm」→ 20260910。読めなければ -1。
function arm_dateKeyFromName_(name) {
  var m = String(name || '').match(/\((\d{2})年(\d{1,2})月(\d{1,2})日\)/);
  if (!m) return -1;
  return (2000 + Number(m[1])) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/* 名前がアームの出荷明細PDFらしいか（純関数）。
   ★ 前方一致にしない。「アーム機種別出荷明細_…」でも
     「アーム出荷明細(9/18)_…」でも拾えるようにする。 */
function arm_isPdfName_(name) {
  var nm = String(name || '');
  if (nm.toLowerCase().slice(-ARM_CONFIG.PDF_EXT.length) !== ARM_CONFIG.PDF_EXT) return false;
  for (var i = 0; i < ARM_CONFIG.PDF_KEYWORDS.length; i++) {
    if (nm.indexOf(ARM_CONFIG.PDF_KEYWORDS[i]) < 0) return false;
  }
  return true;
}

/* ファイル名の中の「2026-09-21」を日付の数にする（純関数）。
   ★ 名前に日付が2つ入ることがある（「アーム出荷明細(9/18)_2026-09-21.pdf」の
     (9/18)は元の日程表の日付、後ろが作った日）。作った日で新しさを決めたいので
     yyyy-mm-dd の形のものだけを見て、一番後ろのものを採る。 */
function arm_pdfDateKey_(name) {
  var all = String(name || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/g);
  if (!all || all.length === 0) return -1;
  var m = all[all.length - 1].match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

// ===== 内部：一番新しいアーム出荷明細PDF =====
// ★ 名前の日付で選ぶ。更新日時では選ばない（古いPDFを開き直すだけで動くため）。
//   日付が読めないものしか無いときだけ更新日時で代える。
function arm_latestPdf_() {
  var folder = DriveApp.getFolderById(ARM_CONFIG.OUT_FOLDER_ID);
  var it = folder.getFiles();
  var best = null, bestKey = -1, fallback = null;
  while (it.hasNext()) {
    var f = it.next();
    if (!arm_isPdfName_(f.getName())) continue;
    if (!fallback || f.getLastUpdated().getTime() > fallback.getLastUpdated().getTime()) fallback = f;
    var k = arm_pdfDateKey_(f.getName());
    if (k > bestKey) { bestKey = k; best = f; }
  }
  var pick = bestKey >= 0 ? best : fallback;
  return pick ? { name: pick.getName(), url: pick.getUrl() } : null;
}

// ===== 公開関数：中身を確かめる（診断用） =====
function アームの出荷予定を確認する() {
  var d = getArmShipPlan(true);
  if (d.error) { Logger.log('エラー: ' + d.error); return d; }
  Logger.log('元ファイル: ' + d.sourceName);
  Logger.log('予定の作成日時: ' + d.snapshotAt + (d.stale ? '（元のExcelのほうが新しい）' : ''));
  Logger.log('PDF: ' + d.pdfName);
  Logger.log('合計 ' + d.total + '台 / ' + d.days.length + '日');
  Logger.log('機種別: ' + d.byKind.map(function (x) { return x.名 + ' ' + x.台数; }).join(' / '));
  d.days.slice(0, 8).forEach(function (g) {
    Logger.log('  ' + g.label + '(' + g.weekday + ') ' + g.count + '台  ' +
               g.byDest.map(function (x) { return x.名 + ' ' + x.台数; }).join(' / '));
  });
  return d;
}

/* ===================================================================
 * 月別の出荷実績（年度はじめから）
 * -------------------------------------------------------------------
 * ★ こちらは直近1か月のJSONでは足りない。
 *   arm_pdf_snapshot.json は「今日から31日」しか入っていないので、
 *   4月からの実績は元の .xlsm を読むしかない。
 *
 * ★ .xlsm は4〜7MB。スプレッドシートへの変換だけで数十秒かかるので、
 *   画面を開くたびにはやらない。元ファイルが変わったときだけ集計して、
 *   結果（年月×区分の台数）をシートに貯める。画面はそのシートを読むだけ。
 * =================================================================== */

// ===== 公開関数：月別の出荷実績を集計してシートに貯める =====
/**
 * @param {boolean} force  元ファイルが変わっていなくても集計し直す
 * @param {number}  budgetMs 使ってよい時間（足りなければ何もしない）
 */
function harvestArmMonthly(force, budgetMs) {
  var started = Date.now();
  var out = { converted: false, days: 0, rows: 0, skipped: null, sourceName: null, error: null };
  try {
    var src = arm_latestSourceFile_();
    if (!src) { out.skipped = '元ファイル（日程表変更 .xlsm）が見つかりません'; return out; }
    out.sourceName = src.getName();

    var props = PropertiesService.getScriptProperties();
    var sig = src.getId() + '_' + src.getLastUpdated().getTime();
    if (force !== true && props.getProperty(ARM_CONFIG.PROP_SIG) === sig) {
      out.skipped = '前回と同じファイルなので集計しません';
      return out;
    }
    // 変換は数十秒かかる。残り時間が足りないなら手を付けない（途中で切れるより良い）
    if (budgetMs != null && budgetMs < 90 * 1000) {
      out.skipped = '時間が足りないので次回にまわします';
      return out;
    }

    var agg = arm_aggregateSource_(src);
    arm_writeMonthly_(agg);
    out.converted = true;
    out.days = agg.days.length;
    out.rows = agg.rowCount;

    props.setProperty(ARM_CONFIG.PROP_SIG, sig);
    props.setProperty(ARM_CONFIG.PROP_SRC, src.getName());
    props.setProperty(ARM_CONFIG.PROP_AT,
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'));
    Logger.log('アーム日次: ' + src.getName() + ' から ' + agg.rowCount + '件 / ' +
               agg.days.length + '日 ／ ' + Math.round((Date.now() - started) / 1000) + '秒');
  } catch (err) {
    out.error = String(err);
    Logger.log('アーム月次の集計でエラー: ' + String(err));
  }
  return out;
}

// ===== 内部：.xlsm を読んで 年月×区分 の台数にする =====
function arm_aggregateSource_(src) {
  // xlsm → スプレッドシート（読み取り用の一時コピー）。必ず消す。
  var conv = Drive.Files.create(
    { name: 'tmp_arm_monthly', mimeType: MimeType.GOOGLE_SHEETS },
    src.getBlob(), { supportsAllDrives: true });
  var convId = conv.id;
  try {
    var sh = SpreadsheetApp.openById(convId).getSheetByName(ARM_CONFIG.DETAIL_SHEET);
    if (!sh) throw new Error('シート「' + ARM_CONFIG.DETAIL_SHEET + '」が見つかりません');
    var last = sh.getLastRow();
    if (last < 6) return { days: [], rowCount: 0 };
    var n = last - 5;
    var C = ARM_CONFIG.COL;
    var kk = sh.getRange(6, C.kk, n, 1).getValues();
    var spec = sh.getRange(6, C.spec, n, 1).getValues();
    var ship = sh.getRange(6, C.ship, n, 1).getValues();
    return arm_aggregateRows_(kk, spec, ship);
  } finally {
    try { Drive.Files.remove(convId); } catch (e) { /* 消せなくても集計は済んでいる */ }
  }
}

/**
 * 出荷日×区分に数える（純関数）。
 * ★ PDF生成側と同じく「ブームブラケット」は除く（アーム本体ではないため）。
 * ★ 区分は機器の欄の先頭（全角スペースの前）。「13ton仕上げ」「13ton ｼｮｰﾄ」などは
 *   まとめて 13ton にする。現場は13tonかどうかで見ている。
 */
function arm_aggregateRows_(kk, spec, ship) {
  var map = {}, rowCount = 0;
  for (var i = 0; i < ship.length; i++) {
    var s = ship[i][0];
    if (!(s instanceof Date) || isNaN(s.getTime())) continue;
    var kkv = String((kk[i] && kk[i][0]) || '');
    var specv = String((spec[i] && spec[i][0]) || '');
    if (kkv.indexOf('ブームブラケット') >= 0 || specv.indexOf('ブームブラケット') >= 0) continue;

    var date = arm_dateKey_(s);
    var kind = arm_kindOf_(kkv);
    if (!map[date]) map[date] = {};
    map[date][kind] = (map[date][kind] || 0) + 1;
    rowCount++;
  }
  var days = Object.keys(map).sort().map(function (d) {
    return { 日付: d, 区分別: map[d] };
  });
  return { days: days, rowCount: rowCount };
}

function arm_kindOf_(kk) {
  var t = String(kk || '').trim();
  if (t === '') return 'その他';
  if (t.indexOf('13ton') === 0) return '13ton';
  var sp = t.indexOf('　');            // 全角スペース区切り（「SK300　10型」）
  if (sp < 0) sp = t.indexOf(' ');
  return (sp > 0 ? t.substring(0, sp) : t).trim();
}

// ===== 内部：集計結果をシートに書き出す（毎回まるごと入れ替え） =====
function arm_writeMonthly_(agg) {
  var sheet = arm_getMonthSheet_();
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, ARM_CONFIG.MONTH_HEADERS.length).clearContent();

  var rows = [];
  agg.days.forEach(function (d) {
    Object.keys(d.区分別).sort().forEach(function (kind) {
      // ★ 日付は文字列のまま入れる。Dateで入れるとシートの表示形式しだいで
      //   読み戻したとき時差の分だけ前日になることがある。
      rows.push(["'" + d.日付, kind, d.区分別[kind]]);
    });
  });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, ARM_CONFIG.MONTH_HEADERS.length).setValues(rows);
  }
}

function arm_getMonthSheet_() {
  // 出荷実績の蓄積スプレッドシートに間借りする（管理するファイルを増やさない）
  var ss = shipact_getSheet_().getParent();
  var sheet = ss.getSheetByName(ARM_CONFIG.MONTH_SHEET);
  if (!sheet) sheet = ss.insertSheet(ARM_CONFIG.MONTH_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ARM_CONFIG.MONTH_HEADERS.length).setValues([ARM_CONFIG.MONTH_HEADERS]);
    sheet.getRange(1, 1, 1, ARM_CONFIG.MONTH_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* 元ファイル（Fileオブジェクトのまま返す）。名前の日付で選ぶ理由は
   arm_latestSource_ のコメントを参照。 */
function arm_latestSourceFile_() {
  var folder = DriveApp.getFolderById(ARM_CONFIG.SRC_FOLDER_ID);
  var it = folder.getFiles(), best = null, bestKey = -1, fallback = null;
  while (it.hasNext()) {
    var f = it.next();
    var nm = f.getName();
    if (nm.indexOf(ARM_CONFIG.SRC_KEYWORD) < 0) continue;
    // ★ 拡張子も見る。同じ名前でPDFやメモが置かれたときに拾わないため
    //   （PDF生成側も .xlsm だけを見ている）。
    if (nm.toLowerCase().slice(-ARM_CONFIG.SRC_EXT.length) !== ARM_CONFIG.SRC_EXT) continue;
    if (!fallback || f.getLastUpdated().getTime() > fallback.getLastUpdated().getTime()) fallback = f;
    var k = arm_dateKeyFromName_(nm);
    if (k > bestKey) { bestKey = k; best = f; }
  }
  return bestKey >= 0 ? best : fallback;
}

// ===== 公開関数：月別の出荷実績（画面用・キャッシュ付き） =====
function getArmMonthlyData(force) {
  return nc_cached_('armMonthly', force === true, 900, getArmMonthlyData_uncached_);
}

function getArmMonthlyData_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    months: [],        // [{ 年月, 台数, 区分別 }] 古い順（年度はじめから）
    kinds: [],         // 出てくる区分（台数の多い順）
    total: 0,
    startMonth: null,  // 年度はじめ
    today: null,       // ここまでの実績、という日
    /* ★ 今月ぶんだけは「予定こみ」も出す。グラフと表は実績だけだが、
         今月あと何台出るのかは現場が知りたいので、KPIに1つだけ出す。 */
    currentAll: null,  // { 年月, 台数, 区分別 } 今月まるごと（先の予定も入れた数）
    sourceName: null,
    harvestedAt: null,
    error: null
  };
  try {
    var props = PropertiesService.getScriptProperties();
    data.sourceName = props.getProperty(ARM_CONFIG.PROP_SRC);
    data.harvestedAt = props.getProperty(ARM_CONFIG.PROP_AT);

    var sheet = arm_getMonthSheet_();
    var last = sheet.getLastRow();
    if (last < 2) {
      data.error = 'まだ集計していません。夜の取込で貯まります（すぐ見たいときは ' +
                   'アームの出荷実績を集める を実行してください）。';
      return data;
    }
    var values = sheet.getRange(2, 1, last - 1, ARM_CONFIG.MONTH_HEADERS.length).getValues();
    var now = new Date();
    data.today = arm_dateKey_(now);
    data.startMonth = arm_fiscalStart_(now);
    // ★ 今日より後は出さない（この表は実績）。今月は途中までになる。
    var built = arm_monthsFromRows_(values, data.startMonth, data.today);
    data.months = built.months;
    data.kinds = built.kinds;
    data.total = built.total;

    // 今月まるごと（今日で切らない＝先の予定も入れた数）
    var ym = data.today.substring(0, 7);
    var all = arm_monthsFromRows_(values, ym, null);
    data.currentAll = all.months.length > 0 && all.months[0].年月 === ym
      ? all.months[0]
      : { 年月: ym, 台数: 0, 区分別: {} };

  } catch (err) {
    data.error = String(err);
    Logger.log('アーム月次の取得でエラー: ' + String(err));
  }
  return data;
}

/* シートの行（日付・区分・台数）を月ごとにまとめる（純関数）。
   ★ 年度はじめ（4月）より前は出さない。
   ★ untilDate（'yyyy-MM-dd'）より後の日は出さない。
     この表は「実績」なので、先の予定を混ぜてはいけない。今月は途中までになる。 */
function arm_monthsFromRows_(values, startMonth, untilDate) {
  var map = {}, kindTotal = {}, total = 0;
  values.forEach(function (r) {
    var day = arm_dayKeyFromCell_(r[0]);
    if (!day) return;
    if (untilDate && day > untilDate) return;
    var ym = day.substring(0, 7);
    if (startMonth && ym < startMonth) return;
    var kind = String(r[1] || 'その他');
    var n = Number(r[2]) || 0;
    if (n <= 0) return;
    if (!map[ym]) map[ym] = { 年月: ym, 台数: 0, 区分別: {}, 最終日: day };
    map[ym].台数 += n;
    map[ym].区分別[kind] = (map[ym].区分別[kind] || 0) + n;
    if (day > map[ym].最終日) map[ym].最終日 = day;
    kindTotal[kind] = (kindTotal[kind] || 0) + n;
    total += n;
  });
  return {
    months: Object.keys(map).sort().map(function (k) { return map[k]; }),
    kinds: Object.keys(kindTotal).sort(function (a, b) { return kindTotal[b] - kindTotal[a]; }),
    total: total
  };
}

/* シートの日付セルを 'yyyy-MM-dd' にする。
   ★ 文字列で入れているが、Dateで返ってくることもある。先頭の ' も落とす。 */
function arm_dayKeyFromCell_(v) {
  if (v instanceof Date || (typeof v === 'object' && v && typeof v.getTime === 'function')) {
    return isNaN(v.getTime()) ? '' : arm_dateKey_(v);
  }
  var t = String(v == null ? '' : v).replace(/^'/, '').trim();
  var m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (!m) return '';
  var p = function (n) { return Number(n) < 10 ? '0' + Number(n) : String(Number(n)); };
  return m[1] + '-' + p(m[2]) + '-' + p(m[3]);
}

// 年度はじめ（4月）の 'yyyy-MM'。1〜3月は前の年の4月。
function arm_fiscalStart_(now) {
  var y = now.getFullYear();
  if (now.getMonth() + 1 < 4) y -= 1;
  return y + '-04';
}

// ===== 公開関数：今すぐ集計する（手動用） =====
function アームの出荷実績を集める() {
  var r = harvestArmMonthly(true, 5 * 60 * 1000);
  if (r.error) { Logger.log('エラー: ' + r.error); return r; }
  if (!r.converted) { Logger.log(r.skipped); return r; }
  Logger.log('集計しました: ' + r.sourceName + ' / ' + r.rows + '件 / ' + r.days + '日');
  var d = getArmMonthlyData(true);
  d.months.forEach(function (m) {
    Logger.log('  ' + m.年月 + '  ' + m.台数 + '台  ' +
      Object.keys(m.区分別).sort().map(function (k) { return k + ' ' + m.区分別[k]; }).join(' / '));
  });
  return r;
}
