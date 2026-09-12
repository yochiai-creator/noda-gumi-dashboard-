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

  // ★ 1件の指図書としてありうる本数の上限。
  //   指図書1件はトラック1台ぶんなので、多くても数百本（実データの最大は200本）。
  //   本数の出どころは2つあり、どちらもテキスト化の失敗で壊れることがある。
  //     ・本文の「NNN 本」   → 実例 8,662本（容器レンジは9本だった / 26-60395）
  //     ・容器Noレンジの本数 → 実例 9,160本（本文の数量は160本だった / 26-30266）
  //   壊れるのが毎回どちらとも限らないので、両方に同じ上限を当てて、
  //   超えたほうを「読めなかった」ものとして捨て、もう一方を使う。
  //   1件混ざるだけで月合計が跳ね上がる（7月の20kgが10,827本と出た。
  //   配車表では6,152本）。
  //   ★ 2つが一致しているときは、独立した出どころが同じ値を示しているので
  //     上限を超えていても信じる（本当に大口の場合に備えて）。
  MAX_PLAUSIBLE_QTY: 1000,

  // 出荷作業指図書_YY.MM.DD_依頼No-枝番(バージョン).pdf
  NAME_PATTERN: /^出荷作業指図書_(\d{2})\.(\d{2})\.(\d{2})_(\d+-\d+)-(\d+)(?:\((\d+)\))?\.pdf$/i,

  HEADERS: ['fileId', 'ファイル名', '処理日', '依頼No', '枝番', 'バージョン',
            '出荷希望日', '年月', '品名', 'サイズ', '数量', 'レンジ本数', '検算',
            'GNo開始', 'GNo終了', '容器接頭辞', '容器No開始', '容器No終了',
            '出荷先コード', '出荷先名', '刻印月', '取込日時',
            // ★ 配車表の行き先（「熊本県山鹿市」のような住所）と指図書を突き合わせる
            //   ために後から足した3列。出荷先コードごとに1回だけ入れれば足りる。
            '住所', '都道府県', '市区町村']
};

// ===== 公開関数：未取込の指図書PDFを時間の許す範囲だけ読んでシートに貯める =====
// 何度呼んでも安全（既に取り込んだfileIdは飛ばす）。トリガーからも画面からも呼べる。
function harvestShippingActuals() {
  var started = Date.now();

  // ★ 古いトリガーからの自動移行。
  //   以前この関数を直接トリガーに登録していた時期があり、その状態のまま
  //   だと在庫推移・受注推移・本数の自動修復がどれも走らない。
  //   実際、落合さんの環境ではトリガーが harvestShippingActuals のままで、
  //   気づくまで在庫推移も受注推移も貯まっていなかった。
  //   「ensureShippingActualsTrigger を実行してください」と毎回お願いする
  //   のは筋が悪いので、古いトリガーを見つけたらこの場で貼り替える。
  //   （harvestDailyData 経由で呼ばれる通常時は古いトリガーが無いので何もしない）
  try {
    var stale = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'harvestShippingActuals';
    });
    if (stale.length > 0) {
      Logger.log('古いトリガーを見つけたので harvestDailyData に貼り替えます。');
      ensureShippingActualsTrigger();
    }
  } catch (err) {
    Logger.log('トリガーの貼り替えに失敗: ' + String(err));
  }

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
      if (doneMonths.indexOf(m.key) !== -1 && m.key < currentMonthKey) continue;

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
      // ★ 先の月（来月ぶんの指図書）を「完了」にしてはいけない。後から増えるのに
      //   二度と見に行かなくなり、配車表の来週ぶんが紐づかなくなる。
      if (monthComplete && m.key < currentMonthKey && doneMonths.indexOf(m.key) === -1) {
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
  var dailyStarted = Date.now();
  var out = { inventory: null, orders: null, shipping: null, repair: null };

  // ★ 古い判定で入った行を直す。シートを読んで判定し直すだけなので軽い
  //   （PDFは読み直さない）。直す行が無ければ何もしない。
  //   毎回「この関数を実行してください」とお願いするのは筋が悪いので、
  //   取込のついでに自動で直るようにしてある。
  try {
    out.repair = repairImplausibleQuantities();
  } catch (err) {
    out.repair = { error: String(err) };
    Logger.log('本数の修復で例外: ' + String(err));
  }

  try {
    out.inventory = harvestInventoryHistory();
  } catch (err) {
    out.inventory = { error: String(err) };
    Logger.log('在庫推移の取込で例外: ' + String(err));
  }
  // 受注推移は在庫より重く出荷より軽い（1日1ファイル・PDF変換2〜4秒）。
  // 初回だけ42件ぶんあるので数回に分かれるが、追いついた後は1日1件で済む。
  try {
    out.orders = harvestOrderHistory();
  } catch (err) {
    out.orders = { error: String(err) };
    Logger.log('受注推移の取込で例外: ' + String(err));
  }
  try {
    out.shipping = harvestShippingActuals();
  } catch (err) {
    out.shipping = { error: String(err) };
    Logger.log('出荷実績の取込で例外: ' + String(err));
  }
  // ★ 配車表の行き先（住所）と指図書を突き合わせるための住所を貯める。
  //   出荷先コード1つにつき1回PDFを読めば足りるので、日を追うごとに揃う。
  //   ★ ここまでで既に4分近く使っていることがある。GASの実行上限は6分なので、
  //     残り時間の中でだけ進める（足りなければ今日は何もしない）。
  try {
    var left = 5 * 60 * 1000 - (Date.now() - dailyStarted);
    out.destAddr = left > 20 * 1000
      ? shipact_fillDestAddresses_(Math.min(left, 60 * 1000))
      : { skipped: true };
  } catch (err) {
    out.destAddr = { error: String(err) };
    Logger.log('出荷先住所の取込で例外: ' + String(err));
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
  var msg2 = '1時間ごとの取込トリガーを作成しました（在庫推移＋受注推移＋出荷実績）' +
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
  } else if (sheet.getLastColumn() < SHIP_ACT_CONFIG.HEADERS.length) {
    // ★ 列を後から足したとき（住所など）。既存の行はそのまま、見出しだけ書き足す。
    //   足りない列は空欄のまま残り、後から shipact_fillDestAddresses_ が埋める。
    if (sheet.getMaxColumns() < SHIP_ACT_CONFIG.HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(),
                               SHIP_ACT_CONFIG.HEADERS.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, SHIP_ACT_CONFIG.HEADERS.length).setValues([SHIP_ACT_CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, SHIP_ACT_CONFIG.HEADERS.length).setFontWeight('bold');
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
    var picked = shipact_pickQuantity_(f.qty, f.rangeQty);
    var qty = picked.qty;
    var rangeQty = f.rangeQty;
    var check = picked.check;

    return [
      file.getId(), fileName, f.procDate || procDate, orderNo, branch, version,
      f.shipDate || '', ym, f.itemName || '', f.size || '', qty == null ? '' : qty,
      rangeQty == null ? '' : rangeQty, check,
      f.gnoStart == null ? '' : f.gnoStart, f.gnoEnd == null ? '' : f.gnoEnd,
      f.prefix || '', f.cnoStart == null ? '' : f.cnoStart, f.cnoEnd == null ? '' : f.cnoEnd,
      f.destCode || '', f.destName || '', f.stampMonth || '',
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
      f.addr || '', f.pref || '', f.city || ''
    ];
  } catch (err) {
    Logger.log('指図書の取込に失敗(' + fileName + '): ' + String(err));
    return null;
  }
}

/**
 * 本数をどちらの出どころから採るかを決める（純関数）。
 * @param {number|null} qty      本文の「NNN 本」から取れた本数
 * @param {number|null} rangeQty 容器Noレンジから数えた本数
 * @return {{qty: (number|null), check: string}}
 * ★ 集計とグラフに直接効くところなので、判定だけを取り出してテストできる形にしてある。
 */
function shipact_pickQuantity_(qty, rangeQty) {
  var MAX = SHIP_ACT_CONFIG.MAX_PLAUSIBLE_QTY;

  // 2つが一致しているなら、上限を超えていても信じる
  if (qty != null && rangeQty != null && qty === rangeQty) {
    return { qty: qty, check: '一致' };
  }

  var qtyOk = (qty != null && qty > 0 && qty <= MAX);
  var rangeOk = (rangeQty != null && rangeQty > 0 && rangeQty <= MAX);

  // どちらもありうる値だが食い違う → 本文を採り、目視確認に回す
  if (qtyOk && rangeOk) return { qty: qty, check: '不一致' };
  // レンジが壊れているか、そもそも無い
  if (qtyOk) return { qty: qty, check: rangeQty == null ? 'レンジ無し' : 'レンジ異常' };
  // 本文の数量が壊れているか、そもそも無い
  if (rangeOk) return { qty: rangeQty, check: qty == null ? 'レンジ採用' : '数量異常' };
  // どちらも使えない。0本と混同しないよう空欄で残す。
  if (qty == null && rangeQty == null) return { qty: null, check: '要確認' };
  return { qty: null, check: '両方異常' };
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
    destCode: null, destName: null, stampMonth: null,
    addr: null, pref: null, city: null
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

  var ad = shipact_parseAddress_(text);
  if (ad) { out.addr = ad.addr; out.pref = ad.pref; out.city = ad.city; }

  return out;
}

/**
 * 指図書の本文から出荷先の住所（都道府県＋市区町村）を取り出す（純関数）。
 *
 * ★ なぜ要るのか
 *   配車表の行き先の欄は「熊本県山鹿市」のような住所で、依頼ナンバーが
 *   書いていない便が多い。指図書側も住所を持っているので、
 *   「出荷希望日が同じ」＋「市区町村が一致」で突き合わせられる。
 *
 * ★ 一番最初に出てくる住所を採らない
 *   PDFのテキスト化は行の順番が崩れるうえ、倉吉（自社）の住所が先に
 *   出ることもある。出荷先の住所は表紙と別紙の2か所に出るので、
 *   同じ「都道府県＋市区町村」が何回出たかを数えて最頻のものを採る。
 *
 * ★ 町・村は必ず郡の下にある
 *   「東京都羽村市」を欲張らずに読むと「羽村」で切れてしまう。
 *   郡が付いているときだけ町村で終わらせ、付いていなければ市か区で
 *   終わらせる、という順で見る。
 *
 * @param {string} text 指図書の本文テキスト
 * @return {{addr: string, pref: string, city: string}|null}
 */
var SHIPACT_PREFS = ('北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|' +
  '埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|' +
  '愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|' +
  '山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県');

function shipact_parseAddress_(text) {
  var t = String(text || '');
  if (!t) return null;

  // 市区町村に使えない文字（数字・記号・空白）。ここで切れば番地を巻き込まない。
  var NG = '\\s0-9０-９,，、.。()（）:：;；/／\\-ー–—~〜～&\\[\\]「」『』*＊#＃|｜\\\\';
  var C = '[^' + NG + ']';
  var re = new RegExp('(' + SHIPACT_PREFS + ')(' +
      C + '{1,6}郡' + C + '{1,6}?[町村]' + '|' +   // 郡があるときだけ町村で終わる
      C + '{1,8}?市' + '|' +
      C + '{1,8}?区' + ')', 'g');

  var counts = {}, first = {}, m;
  while ((m = re.exec(t)) !== null) {
    var key = m[1] + '\u0000' + m[2];
    counts[key] = (counts[key] || 0) + 1;
    if (!(key in first)) first[key] = m.index;
  }
  var bestKey = null, bestN = -1;
  Object.keys(counts).forEach(function (k) {
    // 回数が同じなら先に出てきたほうを採る
    if (counts[k] > bestN || (counts[k] === bestN && first[k] < first[bestKey])) {
      bestN = counts[k]; bestKey = k;
    }
  });
  if (!bestKey) return null;
  var parts = bestKey.split('\u0000');
  return { addr: parts[0] + parts[1], pref: parts[0], city: parts[1] };
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
  nc_forget_('shipActuals');
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

// ===== 公開関数：既に貯めた行の本数を、今の判定でやり直す =====
// ★ 取込をやり直すと数時間かかるので、シートに残っている「本文の数量」と
//   「レンジ本数」から、判定だけをやり直す。PDFは読み直さない。
//   直すのは本数が変わる行だけ。何をどう変えたかはログに出す。
function repairImplausibleQuantities() {
  var sheet = shipact_getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, fixed: 0, rows: [] };

  var H = {};
  SHIP_ACT_CONFIG.HEADERS.forEach(function (h, i) { H[h] = i; });
  var values = sheet.getRange(2, 1, last - 1, SHIP_ACT_CONFIG.HEADERS.length).getValues();

  var fixed = [], changed = false;
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var cur = r[H['数量']] === '' || r[H['数量']] == null ? null : Number(r[H['数量']]);
    var rangeQty = r[H['レンジ本数']] === '' || r[H['レンジ本数']] == null ? null : Number(r[H['レンジ本数']]);
    if (cur != null && isNaN(cur)) cur = null;
    if (rangeQty != null && isNaN(rangeQty)) rangeQty = null;

    // シートに残っているのは採用後の数量。これとレンジ本数から判定をやり直す。
    var picked = shipact_pickQuantity_(cur, rangeQty);
    var newQty = picked.qty === null ? '' : picked.qty;
    var oldQty = r[H['数量']] === '' || r[H['数量']] == null ? '' : Number(r[H['数量']]);
    var qtyChanged = (String(newQty) !== String(oldQty));
    var checkChanged = (r[H['検算']] !== picked.check);

    // ★ 直した記録は上書きしない。
    //   数量をレンジの値に直すと2つが同じ値になるので、次に判定し直すと
    //   「一致」になってしまう。それで上書きすると、直した痕跡が消えるうえ
    //   毎回書き換えが起きる。これらの印が付いている行はもう触らない。
    var CORRECTED = { '数量異常': true, '両方異常': true };
    if (!qtyChanged && CORRECTED[String(r[H['検算']])]) continue;
    if (!qtyChanged && !checkChanged) continue;

    fixed.push({
      行: i + 2, 年月: nc_dateText_(r[H['年月']], 'yyyy-MM'), サイズ: r[H['サイズ']],
      依頼No: r[H['依頼No']],
      もとの数量: oldQty, 新しい数量: newQty, レンジ本数: rangeQty,
      もとの検算: r[H['検算']], 新しい検算: picked.check
    });
    if (qtyChanged) r[H['数量']] = newQty;
    r[H['検算']] = picked.check;
    changed = true;
  }

  if (changed) {
    sheet.getRange(2, 1, values.length, SHIP_ACT_CONFIG.HEADERS.length).setValues(values);
    nc_forget_('shipActuals');
    nc_forget_('monthlyCombined');
  }
  if (fixed.length > 0) {
    Logger.log('本数の判定をやり直しました。変わった行: ' + fixed.length + '件');
  }
  fixed.filter(function (f) { return String(f.もとの数量) !== String(f.新しい数量); })
    .forEach(function (f) {
      Logger.log('  ' + f.年月 + ' ' + f.サイズ + ' ' + f.依頼No + '  ' +
                 f.もとの数量 + '本 → ' + (f.新しい数量 === '' ? '空欄' : f.新しい数量 + '本') +
                 '  (レンジ' + (f.レンジ本数 == null ? '-' : f.レンジ本数) + ')  ' + f.新しい検算);
    });
  return { ok: true, fixed: fixed.length, rows: fixed };
}

// ===== 公開関数：内訳を調べる（数字が合わないときの確認用） =====
// ★ 引数なしで実行できるようにしてある（iPhoneのGASエディタでは関数を選んで
//   「実行」を押すだけなので、引数を渡すのが難しいため）。
//   引数なし … シート全体。月ごとの合計と、本数の多い順トップ15を出す。
//   引数あり … その月だけを詳しく見る。例 diagnoseShippingMonth('2026-07')
function diagnoseShippingMonth(ym) {
  var sheet = shipact_getSheet_();
  var last = sheet.getLastRow();
  var H = {};
  SHIP_ACT_CONFIG.HEADERS.forEach(function (h, i) { H[h] = i; });
  var values = last < 2 ? [] : sheet.getRange(2, 1, last - 1, SHIP_ACT_CONFIG.HEADERS.length).getValues();

  // 集計と同じ重複排除（依頼No＋枝番でバージョン最大のみ）
  var best = {};
  values.forEach(function (r) {
    var m = nc_dateText_(r[H['年月']], 'yyyy-MM');
    if (!m) return;
    if (ym && m !== ym) return;
    var key = String(r[H['依頼No']]) + '_' + String(r[H['枝番']]);
    var ver = Number(r[H['バージョン']]) || 0;
    if (!best[key] || ver > best[key].__ver) best[key] = { row: r, __ver: ver, ym: m };
  });

  var byMonth = {}, byCheck = {}, list = [], needFix = 0;
  Object.keys(best).forEach(function (k) {
    var r = best[k].row, m = best[k].ym;
    var size = r[H['サイズ']] ? String(r[H['サイズ']]) : '';
    var qty = Number(r[H['数量']]) || 0;
    var chk = String(r[H['検算']] || '');
    var rangeQty = Number(r[H['レンジ本数']]);
    byCheck[chk] = (byCheck[chk] || 0) + 1;
    // 今の判定でやり直したら本数が変わる行 ＝ 直すべき行
    var curQty = r[H['数量']] === '' || r[H['数量']] == null ? null : Number(r[H['数量']]);
    var rq = isNaN(rangeQty) ? null : rangeQty;
    var re = shipact_pickQuantity_(curQty, rq);
    if (String(re.qty === null ? '' : re.qty) !== String(curQty === null ? '' : curQty)) needFix++;

    if (!byMonth[m]) byMonth[m] = { 件数: 0, 合計: 0, サイズ別: {} };
    byMonth[m].件数++;
    if (size) {
      byMonth[m].合計 += qty;
      byMonth[m].サイズ別[size] = (byMonth[m].サイズ別[size] || 0) + qty;
    }
    list.push({ 年月: m, 依頼No: r[H['依頼No']], サイズ: size || '(なし)', 数量: qty,
                レンジ本数: r[H['レンジ本数']], 検算: chk, ファイル名: r[H['ファイル名']] });
  });
  list.sort(function (a, b) { return b.数量 - a.数量; });

  // iPhoneでも読めるよう、JSONではなく行で出す
  Logger.log('■ ' + (ym ? ym + ' の内訳' : '全期間の内訳') + '（重複排除ずみ）');
  Object.keys(byMonth).sort().forEach(function (m) {
    var b = byMonth[m];
    var sizes = Object.keys(b.サイズ別).sort().map(function (k) {
      return k + ' ' + b.サイズ別[k];
    }).join(' / ');
    Logger.log('  ' + m + '  合計' + b.合計 + '本 (' + b.件数 + '件)   ' + sizes);
  });
  Logger.log('');
  Logger.log('■ 検算の内訳');
  Object.keys(byCheck).sort().forEach(function (k) { Logger.log('  ' + (k || '(空)') + ': ' + byCheck[k] + '件'); });
  if (needFix > 0) {
    Logger.log('');
    Logger.log('★ 本数がおかしい行が ' + needFix + ' 件あります（本文の数量・容器レンジの');
    Logger.log('  どちらかが桁違い）。repairImplausibleQuantities を実行すると直ります。');
  }
  Logger.log('');
  Logger.log('■ 本数の多い順トップ15（桁違いの行があれば先頭に出ます）');
  list.slice(0, 15).forEach(function (x, i) {
    Logger.log('  ' + (i + 1) + '. ' + x.年月 + ' ' + x.サイズ + ' ' + x.数量 + '本' +
               '  レンジ' + (x.レンジ本数 === '' ? '-' : x.レンジ本数) + '  ' + x.検算 +
               '  ' + x.依頼No);
  });

  return { 対象: ym || '全期間', 月別: byMonth, 検算の内訳: byCheck,
           要修復件数: needFix, 本数の多い順トップ15: list.slice(0, 15) };
}

// ===== 公開関数：出荷本数を直して、結果をその場で表示する =====
// ★ 関数名を日本語にしてある。GASエディタの関数選択欄には英語名が数十個
//   並ぶので、iPhoneの画面では目当てのものを見つけにくい。
//   「実行」を押すだけで、直す → 直った結果を出す、まで一度に終わる。
function 出荷本数を直す() {
  Logger.log('■ 直す前');
  var before = shipact_monthTotals_();
  shipact_logMonthTotals_(before);

  var r = repairImplausibleQuantities();

  Logger.log('');
  Logger.log('■ 直した行: ' + r.fixed + '件');
  if (r.fixed === 0) {
    Logger.log('  直すところはありませんでした。');
  }

  Logger.log('');
  Logger.log('■ 直した後');
  var after = shipact_monthTotals_();
  shipact_logMonthTotals_(after);

  // 変わった月だけを並べて出す
  var moved = [];
  Object.keys(after).forEach(function (m) {
    var b = before[m] ? before[m].合計 : 0;
    if (after[m].合計 !== b) moved.push('  ' + m + '  ' + b + '本 → ' + after[m].合計 + '本');
  });
  if (moved.length > 0) {
    Logger.log('');
    Logger.log('■ 変わった月');
    moved.forEach(function (l) { Logger.log(l); });
  }

  // トリガーが正しい関数を呼んでいるかも見ておく
  Logger.log('');
  Logger.log('■ 自動取込のトリガー');
  try {
    var ts = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getEventType() === ScriptApp.EventType.CLOCK;
    });
    if (ts.length === 0) {
      Logger.log('  ★ ありません。ensureShippingActualsTrigger を実行してください。');
    } else {
      ts.forEach(function (t) { Logger.log('  ' + t.getHandlerFunction() + ' を定期実行'); });
    }
  } catch (err) {
    Logger.log('  確認できませんでした: ' + String(err));
  }
  return { 直した行: r.fixed, 直す前: before, 直した後: after };
}

// ===== 内部：月ごとの合計とサイズ別（集計と同じ重複排除をする） =====
function shipact_monthTotals_() {
  var sheet = shipact_getSheet_();
  var last = sheet.getLastRow();
  var H = {};
  SHIP_ACT_CONFIG.HEADERS.forEach(function (h, i) { H[h] = i; });
  var values = last < 2 ? [] : sheet.getRange(2, 1, last - 1, SHIP_ACT_CONFIG.HEADERS.length).getValues();

  var best = {};
  values.forEach(function (r) {
    var m = nc_dateText_(r[H['年月']], 'yyyy-MM');
    if (!m) return;
    var key = String(r[H['依頼No']]) + '_' + String(r[H['枝番']]);
    var ver = Number(r[H['バージョン']]) || 0;
    if (!best[key] || ver > best[key].__ver) best[key] = { row: r, __ver: ver, ym: m };
  });

  var byMonth = {};
  Object.keys(best).forEach(function (k) {
    var r = best[k].row, m = best[k].ym;
    if (!byMonth[m]) byMonth[m] = { 件数: 0, 合計: 0, サイズ別: {} };
    byMonth[m].件数++;
    var size = r[H['サイズ']] ? String(r[H['サイズ']]) : '';
    if (!size) return;
    var qty = Number(r[H['数量']]) || 0;
    byMonth[m].合計 += qty;
    byMonth[m].サイズ別[size] = (byMonth[m].サイズ別[size] || 0) + qty;
  });
  return byMonth;
}

function shipact_logMonthTotals_(byMonth) {
  Object.keys(byMonth).sort().forEach(function (m) {
    var b = byMonth[m];
    var sizes = Object.keys(b.サイズ別).sort().map(function (k) { return k + ' ' + b.サイズ別[k]; }).join(' / ');
    Logger.log('  ' + m + '  合計' + b.合計 + '本 (' + b.件数 + '件)   ' + sizes);
  });
}

// ===== 公開関数：自動取込を直す（トリガーの貼り替え） =====
// ★ 日本語名にしてある理由は「出荷本数を直す」と同じ。
//   実行すると、今どの関数が定期実行されているかを直す前後で出す。
function 自動取込を直す() {
  Logger.log('■ 直す前のトリガー');
  shipact_logTriggers_();

  var r = ensureShippingActualsTrigger();

  Logger.log('');
  Logger.log('■ 直した後のトリガー');
  shipact_logTriggers_();
  Logger.log('');
  Logger.log(r.message);
  Logger.log('');
  Logger.log('これで1時間ごとに、在庫推移・受注推移・出荷実績の取込と');
  Logger.log('本数の自動修復がまとめて走ります。');
  return r;
}

function shipact_logTriggers_() {
  var ts = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getEventType() === ScriptApp.EventType.CLOCK;
  });
  if (ts.length === 0) { Logger.log('  （定期実行はありません）'); return; }
  ts.forEach(function (t) { Logger.log('  ' + t.getHandlerFunction() + ' を定期実行'); });
}

// ===== 内部：住所がまだ入っていない出荷先コードを、PDFを読んで埋める =====
/**
 * ★ 出荷先コードと住所は1対1なので、コード1つにつき1件だけPDFを読めば足りる。
 *   全行を読み直すと1000件超×3秒で何日もかかるが、コード単位なら数十件で済む。
 * ★ 読めなかったコードは印を付けて二度と読み直さない。毎晩同じPDFを読み続けて
 *   後ろのコードに永久に順番が回らなくなるのを防ぐ。
 * @param {number} budgetMs この呼び出しで使ってよい時間
 */
function shipact_fillDestAddresses_(budgetMs) {
  var started = Date.now();
  var out = { filled: 0, failed: 0, remaining: 0, done: false };
  var sheet = shipact_getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) { out.done = true; return out; }

  var H = {};
  SHIP_ACT_CONFIG.HEADERS.forEach(function (h, i) { H[h] = i; });
  var values = sheet.getRange(2, 1, last - 1, SHIP_ACT_CONFIG.HEADERS.length).getValues();

  // すでに住所が分かっているコードと、読んでも取れなかったコード
  var known = {};
  var giveUp = shipact_readGiveUpCodes_();
  var todo = {};   // コード → 最初に見つかった行（1始まり・シート上の行番号）
  for (var i = 0; i < values.length; i++) {
    var code = values[i][H['出荷先コード']];
    if (!code) continue;
    code = String(code);
    if (String(values[i][H['市区町村']] || '').trim() !== '') { known[code] = true; continue; }
    if (!(code in todo)) todo[code] = i + 2;
  }

  var codes = Object.keys(todo).filter(function (c) { return !known[c] && !giveUp[c]; });
  out.remaining = codes.length;

  for (var j = 0; j < codes.length; j++) {
    if (Date.now() - started > budgetMs) return out;
    var rowNo = todo[codes[j]];
    var fileId = String(values[rowNo - 2][H['fileId']] || '');
    if (!fileId) { out.failed++; giveUp[codes[j]] = true; continue; }
    var ad = null;
    try {
      var text = shipact_pdfToText_(DriveApp.getFileById(fileId));
      ad = text ? shipact_parseAddress_(text) : null;
    } catch (err) {
      Logger.log('出荷先住所の読み取りに失敗(' + fileId + '): ' + String(err));
    }
    if (ad) {
      sheet.getRange(rowNo, H['住所'] + 1, 1, 3).setValues([[ad.addr, ad.pref, ad.city]]);
      out.filled++;
    } else {
      out.failed++;
      giveUp[codes[j]] = true;
    }
    out.remaining--;
  }
  shipact_writeGiveUpCodes_(giveUp);
  out.done = out.remaining === 0;
  return out;
}

var SHIPACT_PROP_GIVEUP = 'shipActuals.addrGiveUp';

function shipact_readGiveUpCodes_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SHIPACT_PROP_GIVEUP);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (err) { return {}; }
}

function shipact_writeGiveUpCodes_(map) {
  try {
    PropertiesService.getScriptProperties().setProperty(SHIPACT_PROP_GIVEUP, JSON.stringify(map));
  } catch (err) { /* 記録できなくても動作に支障はない */ }
}

// ===== 公開関数：出荷先の住所を今すぐ貯める（手動用） =====
// 夜間の取込でも少しずつ進むが、配車の紐づけを早く効かせたいときに使う。
function 出荷先の住所を集める() {
  var r = shipact_fillDestAddresses_(4 * 60 * 1000);
  Logger.log('出荷先の住所: 追加' + r.filled + '件 / 読めず' + r.failed + '件 / 残り' +
             r.remaining + '件' + (r.done ? '（全部そろいました）' : '（続きは次回）'));
  return r;
}

// ===== 内部：日付を 'yyyy-MM-dd' に揃える =====
// シートは '2026-09-14' の文字列で返すことも Date で返すこともある。
function shipact_dateKey_(v) {
  var t = nc_dateText_(v, 'yyyy-MM-dd');
  if (!t) return '';
  var m = String(t).match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (!m) return '';
  var p = function (n) { return Number(n) < 10 ? '0' + Number(n) : String(Number(n)); };
  return m[1] + '-' + p(m[2]) + '-' + p(m[3]);
}

/**
 * 蓄積シートから「依頼No→指図書」「出荷希望日→指図書」「出荷先コード→住所」の
 * 索引を作る。配車表と指図書を突き合わせるために使う。
 *
 * ★ 1回の実行の中では作り直さない（配車グリッドは週ごとに何度も呼ばれる）。
 * ★ 同じ依頼No・枝番でバージョン違いがあるときは、番号の大きいものが正。
 */
var SHIPACT_INDEX_MEMO_ = null;

function shipact_index_() {
  if (SHIPACT_INDEX_MEMO_) return SHIPACT_INDEX_MEMO_;
  var idx = { byOrder: {}, byDate: {}, addrByCode: {}, rows: 0, error: null };
  try {
    var sheet = shipact_getSheet_();
    var last = sheet.getLastRow();
    if (last >= 2) {
      var H = {};
      SHIP_ACT_CONFIG.HEADERS.forEach(function (h, i) { H[h] = i; });
      var values = sheet.getRange(2, 1, last - 1, SHIP_ACT_CONFIG.HEADERS.length).getValues();
      var best = {};   // 依頼No_枝番 → 最新バージョンの1件
      values.forEach(function (r) {
        var fileId = String(r[H['fileId']] || '');
        if (!fileId) return;
        var no = String(r[H['依頼No']] || '').trim();
        if (!no) return;
        var key = no + '_' + String(r[H['枝番']]);
        var ver = Number(r[H['バージョン']]) || 0;
        if (best[key] && best[key].ver >= ver) return;
        best[key] = {
          no: no, ver: ver, fileId: fileId,
          date: shipact_dateKey_(r[H['出荷希望日']]),
          code: r[H['出荷先コード']] ? String(r[H['出荷先コード']]) : '',
          size: String(r[H['サイズ']] || ''),
          qty: Number(r[H['数量']]) || 0
        };
        var code = best[key].code;
        var city = String(r[H['市区町村']] || '').trim();
        if (code && city && !idx.addrByCode[code]) {
          idx.addrByCode[code] = { pref: String(r[H['都道府県']] || '').trim(), city: city };
        }
      });
      Object.keys(best).forEach(function (k) {
        var e = best[k];
        idx.rows++;
        // 依頼Noは年度付き（26-10660）で入っている。年度を外した形でも引けるようにする。
        shipact_putOrder_(idx.byOrder, e.no, e);
        var bare = e.no.replace(/^\d{2}-/, '');
        if (bare !== e.no) shipact_putOrder_(idx.byOrder, bare, e);
        if (e.date) {
          if (!idx.byDate[e.date]) idx.byDate[e.date] = [];
          idx.byDate[e.date].push(e);
        }
      });
    }
  } catch (err) {
    idx.error = String(err);
    Logger.log('出荷実績の索引づくりでエラー: ' + String(err));
  }
  SHIPACT_INDEX_MEMO_ = idx;
  return idx;
}

// 年度を外した番号は年をまたぐと重なる。新しい出荷希望日のほうを残す。
function shipact_putOrder_(map, key, e) {
  var prev = map[key];
  if (!prev || String(e.date) > String(prev.date)) map[key] = e;
}

function shipact_fileUrl_(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/view';
}

// 'yyyy-MM-dd' → 'M/D'（画面に出す短い形）
function shipact_shortDate_(key) {
  var m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Number(m[2]) + '/' + Number(m[3]) : null;
}
