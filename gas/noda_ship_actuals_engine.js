/**
 * 野田組 業務ダッシュボード — 出荷実績の収集エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：出荷作業指図書PDFを読んで「いつ・どこへ・何を・何本」出したかを
 *       専用スプレッドシートに蓄積し、月次の出荷実績を出せるようにする。
 *
 * ★ なぜ蓄積するのか
 *   指図書PDFはファイル名に本数が入っていないため、本数を知るには中身を読む
 *   しかない。PDF→Googleドキュメント変換は1件2〜4秒かかり、1か月100〜200件、
 *   12か月で1200〜2400件あるので、画面を開くたびに集計するのは不可能。
 *   → 一度読んだ結果をシートに貯め、画面はシートを読むだけにする。
 *
 * ★ 既存の noda_shipping_engine.js との違い
 *   あちらは「今月フォルダの指図書の件数」を数えるだけ（ファイル名のみ）。
 *   こちらはPDFの中身を読んで本数・サイズ・出荷先・容器番号まで取る。
 *   また、あちらの SHIP_CONFIG.FOLDER_PARENT は「2026年」フォルダを直に
 *   指しているため年をまたぐと壊れる。こちらはルート→年→月と辿るので、
 *   年が変わっても、過去年を遡っても正しく動く。
 *
 * ★ 抽出項目（実データで検証済み）
 *   処理日 / 依頼No / 枝番 / バージョン / 出荷希望日 / 品名 / サイズ /
 *   数量 / GNo（レンジ可） / 容器No開始・終了 / 出荷先コード・名 / 刻印月
 *   数量は「NNN 本」の最頻値を採り、容器Noレンジの本数と照合して検算する。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて shipact_ 接頭辞にしてある。
 */

var SHIP_ACT_CONFIG = {
  // 出荷作業指図書のルート（この下に「2026年」「2027年」…、その下に「1月」…がある）
  ROOT_FOLDER_ID: '13qWXWwBXgbEO9avO5qlnZ0WHDaMSaYA_',

  SPREADSHEET_TITLE: '出荷実績データ（ダッシュボード自動収集）',
  SHEET_NAME: '実績',

  // ScriptProperties のキー
  PROP_SHEET_ID: 'shipActuals.sheetId',
  PROP_DONE_MONTHS: 'shipActuals.doneMonths',

  // 1回の実行で使う時間の上限。GASの実行上限は6分なので余裕をみて4分で打ち切る。
  TIME_BUDGET_MS: 4 * 60 * 1000,

  // 出荷作業指図書_YY.MM.DD_依頼No-枝番(バージョン).pdf
  NAME_PATTERN: /^出荷作業指図書_(\d{2})\.(\d{2})\.(\d{2})_(\d+-\d+)-(\d+)(?:\((\d+)\))?\.pdf$/i,

  HEADERS: ['fileId', 'ファイル名', '処理日', '依頼No', '枝番', 'バージョン',
            '出荷希望日', '年月', '品名', 'サイズ', '数量', 'レンジ本数', '検算',
            'GNo開始', 'GNo終了', '容器接頭辞', '容器No開始', '容器No終了',
            '出荷先コード', '出荷先名', '刻印月', '取込日時']
};

// ===== 公開関数：未取込の指図書PDFを時間の許す範囲だけ読んでシートに貯める =====
// 何度呼んでも安全（既に取り込んだfileIdは飛ばす）。トリガーからも画面からも呼べる。
function harvestShippingActuals() {
  var started = Date.now();
  var result = {
    started: Utilities.formatDate(new Date(started), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    scannedMonths: [], added: 0, skipped: 0, failed: 0,
    timeUp: false, allDone: false, errors: [], error: null
  };

  try {
    var sheet = shipact_getSheet_();
    var known = shipact_readFileIdSet_(sheet);
    var props = PropertiesService.getScriptProperties();
    var doneMonths = shipact_readDoneMonths_(props);
    var currentMonthKey = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');

    var buffer = [];
    var months = shipact_listMonthFolders_();   // 古い順（年→月）

    for (var i = 0; i < months.length; i++) {
      var m = months[i];
      // 取り込み済みの月は丸ごと飛ばす（今月だけは毎回見る＝新しいPDFが増えるため）
      if (doneMonths.indexOf(m.key) !== -1 && m.key !== currentMonthKey) continue;

      result.scannedMonths.push(m.key);
      var monthComplete = true;
      var files = m.folder.getFiles();

      while (files.hasNext()) {
        if (Date.now() - started > SHIP_ACT_CONFIG.TIME_BUDGET_MS) {
          result.timeUp = true;
          monthComplete = false;
          break;
        }
        var file = files.next();
        var name = file.getName();
        var nm = SHIP_ACT_CONFIG.NAME_PATTERN.exec(name);
        if (!nm) { continue; }                       // 指図書以外のファイルは対象外
        if (known[file.getId()]) { result.skipped++; continue; }

        var row = shipact_buildRow_(file, nm);
        if (row) {
          buffer.push(row);
          known[file.getId()] = true;
          result.added++;
        } else {
          result.failed++;
          if (result.errors.length < 10) result.errors.push(name);
        }

        // 途中で落ちても取り込み済み分が残るように、ある程度貯まったら書き出す
        if (buffer.length >= 20) { shipact_appendRows_(sheet, buffer); buffer = []; }
      }

      if (buffer.length > 0) { shipact_appendRows_(sheet, buffer); buffer = []; }

      // 過去月を最後まで読み切れたら「完了」に記録して次回から飛ばす
      if (monthComplete && m.key !== currentMonthKey && doneMonths.indexOf(m.key) === -1) {
        doneMonths.push(m.key);
        props.setProperty(SHIP_ACT_CONFIG.PROP_DONE_MONTHS, JSON.stringify(doneMonths));
      }

      if (result.timeUp) break;
    }

    if (buffer.length > 0) shipact_appendRows_(sheet, buffer);
    result.allDone = !result.timeUp;
    result.elapsedSec = Math.round((Date.now() - started) / 1000);
    result.doneMonths = doneMonths.slice().sort();
    Logger.log('出荷実績の取込: 追加' + result.added + '件 / 既存' + result.skipped +
               '件 / 失敗' + result.failed + '件 / ' + result.elapsedSec + '秒' +
               (result.timeUp ? '（時間切れ。次回続きから）' : '（最後まで到達）'));
  } catch (err) {
    result.error = String(err);
    Logger.log('出荷実績の取込でエラー: ' + String(err));
  }
  return result;
}

// ===== 公開関数：蓄積シートから月次実績を組み立てて返す（画面用・キャッシュ付き） =====
function getShippingActualsSummary(force) {
  return nc_cached_('shipActuals', force, 900, getShippingActualsSummary_uncached_);
}

function getShippingActualsSummary_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    sheetUrl: null, rowCount: 0, shipmentCount: 0,
    months: [],        // [{ 年月, 本数, 件数, サイズ別:{...} }] 新しい順
    bySize: {},        // サイズ → 総本数
    topDests: [],      // [{ 名, 本数, 件数 }] 上位
    mismatchCount: 0,     // 数量と容器レンジ本数が食い違った件数
    needsCheckCount: 0,   // どちらも取れずテキストが読めていない件数
    nonCylinderCount: 0,  // LPガス容器以外（バルク貯槽など）の件数
    pending: null,        // 取込済みの月
    error: null
  };

  try {
    var sheet = shipact_getSheet_();
    data.sheetUrl = sheet.getParent().getUrl();
    var last = sheet.getLastRow();
    if (last < 2) return data;

    var values = sheet.getRange(2, 1, last - 1, SHIP_ACT_CONFIG.HEADERS.length).getValues();
    data.rowCount = values.length;

    var H = {};
    SHIP_ACT_CONFIG.HEADERS.forEach(function (h, idx) { H[h] = idx; });

    // 同じ (依頼No, 枝番) はバージョン最大のものだけを正とする
    var best = {};
    values.forEach(function (r) {
      var key = String(r[H['依頼No']]) + '_' + String(r[H['枝番']]);
      var ver = Number(r[H['バージョン']]) || 0;
      if (!best[key] || ver > best[key].__ver) { best[key] = { row: r, __ver: ver }; }
    });

    var monthMap = {}, destMap = {};
    Object.keys(best).forEach(function (k) {
      var r = best[k].row;
      var size = r[H['サイズ']] ? String(r[H['サイズ']]) : '';
      var qty = Number(r[H['数量']]) || 0;
      // ★ シートが '2026-07' を日付として保存してしまうため Date で返ってくる。
      //   nc_dateText_ で 'yyyy-MM' の文字列に直す（詳細は noda_common_cache.js）。
      var ym = nc_dateText_(r[H['年月']], 'yyyy-MM') || '不明';
      var chk = String(r[H['検算']] || '');

      data.shipmentCount++;
      if (chk === '不一致') data.mismatchCount++;
      if (chk === '要確認') data.needsCheckCount++;

      // サイズが取れない行はLPガス容器以外（バルク貯槽・付属品など）。
      // 本数の集計には入れず、件数だけ別に数える。
      if (!size) { data.nonCylinderCount++; return; }

      if (!monthMap[ym]) monthMap[ym] = { 年月: ym, 本数: 0, 件数: 0, サイズ別: {} };
      monthMap[ym].本数 += qty;
      monthMap[ym].件数 += 1;
      monthMap[ym].サイズ別[size] = (monthMap[ym].サイズ別[size] || 0) + qty;

      data.bySize[size] = (data.bySize[size] || 0) + qty;

      // ★ 出荷先名はPDFのテキスト化で文字化けすることが多いので
      //   （「(株)ㄌㄨㄏㄚ北関東」のようになる）、集計キーは数字の出荷先コードにする。
      //   表示名はそのコードで最も多く現れた表記を採用する。
      var code = r[H['出荷先コード']] ? String(r[H['出荷先コード']]) : '不明';
      var nm = r[H['出荷先名']] ? String(r[H['出荷先名']]) : '';
      if (!destMap[code]) destMap[code] = { コード: code, 名: '', 本数: 0, 件数: 0, __names: {} };
      destMap[code].本数 += qty;
      destMap[code].件数 += 1;
      if (nm) destMap[code].__names[nm] = (destMap[code].__names[nm] || 0) + 1;
    });

    data.months = Object.keys(monthMap).sort().reverse().map(function (k) { return monthMap[k]; });
    data.topDests = Object.keys(destMap).map(function (code) {
      var d = destMap[code];
      var bestName = '', bestN = -1;
      Object.keys(d.__names).forEach(function (n) {
        if (d.__names[n] > bestN) { bestN = d.__names[n]; bestName = n; }
      });
      return { コード: d.コード, 名: bestName || ('コード' + d.コード), 本数: d.本数, 件数: d.件数 };
    }).sort(function (a, b) { return b.本数 - a.本数; }).slice(0, 10);

    var doneMonths = shipact_readDoneMonths_(PropertiesService.getScriptProperties());
    data.pending = { 取込済みの月: doneMonths.slice().sort() };
  } catch (err) {
    data.error = String(err);
  }
  return data;
}

// ===== 公開関数：トリガーから呼ばれる「日次データ収集」の入口 =====
// 在庫推移と出荷実績の両方を1回で進める。
// 在庫推移を先にやるのは、こちらが軽い（初回15件・以降1日1件）ため。
// 出荷実績は重いので、残り時間で進むところまで進める。
function harvestDailyData() {
  var out = { inventory: null, shipping: null };
  try {
    out.inventory = harvestInventoryHistory();
  } catch (err) {
    out.inventory = { error: String(err) };
    Logger.log('在庫推移の取込で例外: ' + String(err));
  }
  try {
    out.shipping = harvestShippingActuals();
  } catch (err) {
    out.shipping = { error: String(err) };
    Logger.log('出荷実績の取込で例外: ' + String(err));
  }
  return out;
}

// ===== 公開関数：取込を自動で回すトリガーを用意する（無ければ作る） =====
// ★ 初回バックフィルは実時間で1〜3時間かかるため、1時間ごとに実行して
//   少しずつ進める。追いついた後は、その月の新しいPDFだけを見るので
//   数秒で終わる（完了した月は丸ごと飛ばす）。
// ★ 以前は handler が harvestShippingActuals だった。在庫推移も一緒に
//   回すようにしたので、古いトリガーが残っていたら自動で貼り替える
//   （落合さんの手作業を増やさないため）。
function ensureShippingActualsTrigger() {
  var handler = 'harvestDailyData';
  var oldHandler = 'harvestShippingActuals';
  var migrated = 0, already = false;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === oldHandler) { ScriptApp.deleteTrigger(t); migrated++; }
    else if (fn === handler) { already = true; }
  });

  if (already) {
    var msg1 = '既にトリガーが設定されています' +
               (migrated > 0 ? '（古いトリガー' + migrated + '件を削除しました）' : '');
    Logger.log(msg1);
    return { ok: true, created: false, migrated: migrated, message: msg1 };
  }

  ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
  var msg2 = '1時間ごとの取込トリガーを作成しました（在庫推移＋出荷実績）' +
             (migrated > 0 ? '。古いトリガー' + migrated + '件は貼り替えました' : '');
  Logger.log(msg2);
  return { ok: true, created: true, migrated: migrated, message: msg2 };
}

function removeShippingActualsTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'harvestDailyData' || fn === 'harvestShippingActuals') {
      ScriptApp.deleteTrigger(t); removed++;
    }
  });
  Logger.log('取込トリガーを' + removed + '件削除しました');
  return { ok: true, removed: removed };
}

// ===== 内部：蓄積用スプレッドシートとシートを用意する =====
// 初回だけ新規作成し、そのIDをScriptPropertiesに覚える（マスタには一切書かない）。
function shipact_getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SHIP_ACT_CONFIG.PROP_SHEET_ID);
  var ss = null;

  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(SHIP_ACT_CONFIG.SPREADSHEET_TITLE);
    props.setProperty(SHIP_ACT_CONFIG.PROP_SHEET_ID, ss.getId());
    Logger.log('出荷実績の蓄積スプレッドシートを作成しました: ' + ss.getUrl());
  }

  var sheet = ss.getSheetByName(SHIP_ACT_CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHIP_ACT_CONFIG.SHEET_NAME);
    // 新規作成時に付いてくる「シート1」は邪魔なので消す
    var first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
    if (first && ss.getSheets().length > 1) { try { ss.deleteSheet(first); } catch (e) {} }
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SHIP_ACT_CONFIG.HEADERS.length).setValues([SHIP_ACT_CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, SHIP_ACT_CONFIG.HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ===== 内部：既に取り込んだ fileId の集合を作る =====
function shipact_readFileIdSet_(sheet) {
  var set = {};
  var last = sheet.getLastRow();
  if (last < 2) return set;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var v = ids[i][0];
    if (v) set[String(v)] = true;
  }
  return set;
}

function shipact_readDoneMonths_(props) {
  var raw = props.getProperty(SHIP_ACT_CONFIG.PROP_DONE_MONTHS);
  if (!raw) return [];
  try {
    var arr = JSON.parse(raw);
    return Object.prototype.toString.call(arr) === '[object Array]' ? arr : [];
  } catch (err) {
    return [];
  }
}

function shipact_appendRows_(sheet, rows) {
  if (!rows || rows.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, SHIP_ACT_CONFIG.HEADERS.length)
       .setValues(rows);
}

// ===== 内部：ルート→年→月 とフォルダを辿り、月フォルダを古い順に並べる =====
// ★ noda_shipping_engine.js は「2026年」フォルダを直に指しているため年をまたぐと
//   壊れる。こちらは年フォルダから辿るので年が変わっても過去年も正しく扱える。
function shipact_listMonthFolders_() {
  var out = [];
  var root = DriveApp.getFolderById(SHIP_ACT_CONFIG.ROOT_FOLDER_ID);
  var years = root.getFolders();
  while (years.hasNext()) {
    var yf = years.next();
    var ym = /^(\d{4})年$/.exec(yf.getName());
    if (!ym) continue;
    var year = Number(ym[1]);
    var months = yf.getFolders();
    while (months.hasNext()) {
      var mf = months.next();
      var mm = /^(\d{1,2})月$/.exec(mf.getName());
      if (!mm) continue;
      var month = Number(mm[1]);
      out.push({
        key: year + '-' + (month < 10 ? '0' + month : String(month)),
        year: year, month: month, folder: mf
      });
    }
  }
  out.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
  return out;
}

// ===== 内部：1件のPDFを読んでシート1行分の配列にする =====
function shipact_buildRow_(file, nameMatch) {
  var fileName = file.getName();
  try {
    var text = shipact_pdfToText_(file);
    if (!text) return null;
    var f = shipact_parseText_(text);

    // ファイル名は表記が安定しているので、依頼No・枝番・バージョンはこちらを正とする
    var orderNo = nameMatch[4];
    var branch = nameMatch[5];
    var version = nameMatch[6] ? Number(nameMatch[6]) : 0;
    var procDate = '20' + nameMatch[1] + '-' + nameMatch[2] + '-' + nameMatch[3];

    // 集計に使う「年月」は出荷希望日を優先し、無ければファイル名の日付を使う
    var basis = f.shipDate || procDate;
    var ym = basis.substring(0, 7);

    // 数量の決め方（実データを見て決めた）
    //   両方取れた → 一致/不一致を記録（不一致は目視確認したい）
    //   本文の「NNN 本」が取れない → 容器Noレンジの本数を数量として採用
    //   容器Noが無い → バルク貯槽など容器以外。数量はそのまま採用
    //   どちらも無い → テキストが読めていない。要確認として残す
    var qty = f.qty;
    var rangeQty = f.rangeQty;
    var check;
    if (qty != null && rangeQty != null) {
      check = (qty === rangeQty) ? '一致' : '不一致';
    } else if (qty == null && rangeQty != null) {
      qty = rangeQty;
      check = 'レンジ採用';
    } else if (qty != null && rangeQty == null) {
      check = 'レンジ無し';
    } else {
      check = '要確認';
    }

    return [
      file.getId(), fileName, f.procDate || procDate, orderNo, branch, version,
      f.shipDate || '', ym, f.itemName || '', f.size || '', qty == null ? '' : qty,
      rangeQty == null ? '' : rangeQty, check,
      f.gnoStart == null ? '' : f.gnoStart, f.gnoEnd == null ? '' : f.gnoEnd,
      f.prefix || '', f.cnoStart == null ? '' : f.cnoStart, f.cnoEnd == null ? '' : f.cnoEnd,
      f.destCode || '', f.destName || '', f.stampMonth || '',
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
    ];
  } catch (err) {
    Logger.log('指図書の取込に失敗(' + fileName + '): ' + String(err));
    return null;
  }
}

// ===== 内部：PDFをGoogleドキュメントに変換して本文テキストを取り出す =====
// 指図書はテキスト埋め込み型なのでOCRは不要（OCRは重く、誤認識も混ざる）。
// 変換用の一時ファイルは必ず削除する。
function shipact_pdfToText_(file) {
  var tempId = null;
  try {
    var blob = file.getBlob();
    var created = Drive.Files.create(
      { name: file.getName() + '_tmp_text', mimeType: 'application/vnd.google-apps.document' },
      blob
    );
    tempId = created.id;
    return DocumentApp.openById(tempId).getBody().getText();
  } finally {
    if (tempId) {
      try { Drive.Files.remove(tempId); } catch (err) { /* 削除失敗は無視 */ }
    }
  }
}

// ===== 内部：指図書の本文テキストから各項目を抽出する =====
// ★ レイアウトが崩れるため「容器No:」の直後を素直に読む方式は使えない
//   （開始と終了の間に無関係な行が挟まる）。容器番号トークン（接頭辞+数字）を
//   すべて拾って最小・最大を採る方式にしてある。これは本数の検算にもなる。
// ★ グループNOは「615」のように単一のことも「521 ~ 522」のようにレンジのことも
//   あるので両対応。
// ★ 品名の表記は「47L(20kg)」「118L (50kg)」のようにスペースが揺れる。
function shipact_parseText_(text) {
  var out = {
    procDate: null, orderNo: null, shipDate: null, itemName: null, size: null,
    qty: null, rangeQty: null, gnoStart: null, gnoEnd: null,
    prefix: null, cnoStart: null, cnoEnd: null,
    destCode: null, destName: null, stampMonth: null
  };
  var m;

  m = /処理日\s*(\d{2})\/(\d{2})\/(\d{2})/.exec(text);
  if (m) out.procDate = '20' + m[1] + '-' + m[2] + '-' + m[3];

  m = /依頼\s*No\.?\s*(\d{4})\s*-\s*(\d+)/.exec(text);
  if (m) out.orderNo = m[1].substring(2) + '-' + m[2];

  m = /出荷先:\s*(\d+)\s*(.+)/.exec(text);
  if (m) { out.destCode = m[1]; out.destName = m[2].replace(/\s+$/, ''); }

  m = /名:\s*(.+)/.exec(text);
  if (m) out.itemName = m[1].replace(/\s+$/, '');

  m = /(\d+)\s*L\s*\(\s*(\d+)\s*kg\s*\)/.exec(text);
  if (m) out.size = m[2] + 'kg';

  m = /グループ\s*NO\s*[:：]\s*(\d+)(?:\s*\\?\s*[~〜～]\s*(\d+))?/.exec(text);
  if (m) {
    out.gnoStart = Number(m[1]);
    out.gnoEnd = m[2] ? Number(m[2]) : Number(m[1]);
  }

  m = /出荷希望日\s*[:：]?\s*(\d{4})\/(\d{2})\/(\d{2})/.exec(text);
  if (m) out.shipDate = m[1] + '-' + m[2] + '-' + m[3];

  m = /刻印月[\s\S]{0,20}?(\d{4})\/(\d{2})/.exec(text);
  if (m) out.stampMonth = m[1] + '-' + m[2];

  // 数量：「NNN 本」が表紙・別紙・各ページに繰り返し出るので最頻値を採る
  var qtyCounts = {}, qm, qre = /(\d+)\s*本/g;
  while ((qm = qre.exec(text)) !== null) {
    var v = Number(qm[1]);
    qtyCounts[v] = (qtyCounts[v] || 0) + 1;
  }
  var bestQty = null, bestCount = -1;
  Object.keys(qtyCounts).forEach(function (k) {
    if (qtyCounts[k] > bestCount) { bestCount = qtyCounts[k]; bestQty = Number(k); }
  });
  out.qty = bestQty;

  // 容器番号：接頭辞+5桁の数字を拾い、最も多い接頭辞の最小・最大を採る
  // ★ 桁数を5桁に固定し、直後に数字が続くものは捨てるのが要点。
  //   PDFのテキスト化では「HEP39020|」の縦棒が「1」と誤読されて
  //   「THEP390201」のような壊れたトークンになることがあり、これを
  //   容器番号として拾うと最大値が壊れて本数が異常値になる（実データで発生）。
  // ★ 接頭辞は直前の記号が文字と誤読されて「THEP」のように増えることがあるため、
  //   末尾3文字だけを採る（実データの接頭辞は HXP/HEP/HXU/HRH/HCZ/HHZ と3文字）。
  var prefCounts = {}, nums = {}, cm, cre = /([A-Z]{2,5})(\d{5})(?!\d)/g;
  while ((cm = cre.exec(text)) !== null) {
    var p = cm[1].length > 3 ? cm[1].substring(cm[1].length - 3) : cm[1];
    prefCounts[p] = (prefCounts[p] || 0) + 1;
    if (!nums[p]) nums[p] = [];
    nums[p].push(Number(cm[2]));
  }
  var bestPref = null, bestPrefCount = -1;
  Object.keys(prefCounts).forEach(function (p) {
    if (prefCounts[p] > bestPrefCount) { bestPrefCount = prefCounts[p]; bestPref = p; }
  });
  if (bestPref) {
    var list = nums[bestPref].slice().sort(function (a, b) { return a - b; });
    out.prefix = bestPref;
    out.cnoStart = list[0];
    out.cnoEnd = list[list.length - 1];
    out.rangeQty = list[list.length - 1] - list[0] + 1;
  }

  return out;
}

// ===== 公開関数：蓄積を空にして最初から取り直す =====
// ★ パーサを直したときに使う。スプレッドシート自体は作り直さず、
//   データ行と「完了した月」の記録だけ消すので、次回の取込が1月から走り直す。
//   （壊れた値で取り込んでしまった行を捨てるための機能）
function resetShippingActuals() {
  var sheet = shipact_getSheet_();
  var last = sheet.getLastRow();
  var cleared = 0;
  if (last > 1) {
    cleared = last - 1;
    sheet.getRange(2, 1, cleared, SHIP_ACT_CONFIG.HEADERS.length).clearContent();
  }
  PropertiesService.getScriptProperties().deleteProperty(SHIP_ACT_CONFIG.PROP_DONE_MONTHS);
  try { CacheService.getScriptCache().remove('nodaDash_shipActuals'); } catch (err) {}
  Logger.log('出荷実績の蓄積をリセットしました（' + cleared + '行を削除）。' +
             '次回の取込で最初から読み直します。');
  return { ok: true, clearedRows: cleared };
}

// ===== 動作確認：実行するとログに結果が出る =====
function testHarvestShippingActuals() {
  Logger.log(JSON.stringify(harvestShippingActuals(), null, 2));
}

function testShippingActualsSummary() {
  Logger.log(JSON.stringify(getShippingActualsSummary(true), null, 2));
}
