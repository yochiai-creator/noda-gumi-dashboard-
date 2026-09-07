/**
 * 野田組 業務ダッシュボード — 在庫推移の収集エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：日次の容器在庫照会CSVから「その日の在庫本数」を1行ずつ貯めて、
 *       在庫の推移を出せるようにする。
 *
 * ★ なぜ貯める必要があるのか（重要）
 *   在庫照会CSVのフォルダには、実測したところ15件しか残っていなかった
 *   （最古 2026/08/17・最新 2026/09/04）。古いものは消えていく運用らしい。
 *   → つまり今スナップショットを取らないと、過去の在庫推移は永久に失われる。
 *   1日1件ずつ貯めれば、CSVが消えても推移は残る。
 *
 * ★ 蓄積先は出荷実績と同じスプレッドシートの別シート「在庫推移」。
 *   （データの置き場所を1つにまとめておくため）
 *
 * ★ 既存の Noda inventory engine.js は「最新のCSV1件」だけを読む。
 *   そちらは触らず、CSVの読み取り部（Shift_JIS対応・ファイル名からの日付抽出）
 *   と分類表（INV_SIZE_LABEL_MAP）だけを再利用している。
 *
 * 名前の衝突に注意：内部関数はすべて invhist_ 接頭辞にしてある。
 */

var INV_HIST_CONFIG = {
  SHEET_NAME: '在庫推移',
  // 1回の実行で使う時間の上限。初回は15件ほど、その後は1日1件なのでこれで十分。
  TIME_BUDGET_MS: 2 * 60 * 1000,
  HEADERS: ['日付', 'fileId', 'ファイル名', '総本数', '50kg', '20kg', 'その他',
            '2K', '5K', '8K', '10K', '20K_三部軽量', '20K_直付', '30K', '50K_軽量型', '50K_S',
            '取込日時']
};

// ===== 公開関数：未取込の在庫CSVを読んで「在庫推移」シートに1日1行で貯める =====
// 何度呼んでも安全（既に取り込んだfileIdは飛ばす）。
function harvestInventoryHistory() {
  var started = Date.now();
  var result = {
    started: Utilities.formatDate(new Date(started), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    added: 0, skipped: 0, failed: 0, timeUp: false, errors: [],
    unknownLabels: [],   // 分類表に無かったラベル（あれば分類表に足すこと）
    error: null
  };

  try {
    var sheet = invhist_getSheet_();
    var known = invhist_readFileIdSet_(sheet);

    var folder = DriveApp.getFolderById(INV_CONFIG.FOLDER_ID);
    var files = folder.getFiles();
    var targets = [];
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName().slice(-4).toLowerCase() !== '.csv') continue;
      targets.push(f);
    }
    // 古い順に処理する（途中で時間切れになっても古い方から埋まる）
    targets.sort(function (a, b) {
      var ka = inv_fileDateKey_(a.getName()), kb = inv_fileDateKey_(b.getName());
      if (ka === null) ka = a.getLastUpdated().getTime();
      if (kb === null) kb = b.getLastUpdated().getTime();
      return ka - kb;
    });

    var buffer = [];
    for (var i = 0; i < targets.length; i++) {
      if (Date.now() - started > INV_HIST_CONFIG.TIME_BUDGET_MS) { result.timeUp = true; break; }
      var file = targets[i];
      if (known[file.getId()]) { result.skipped++; continue; }
      var row = invhist_buildRow_(file);
      if (row && row.__unknown && Object.keys(row.__unknown).length > 0) {
        Object.keys(row.__unknown).forEach(function (k) {
          if (result.unknownLabels.indexOf(k) < 0) result.unknownLabels.push(k);
        });
      }
      if (row) {
        buffer.push(row);
        known[file.getId()] = true;
        result.added++;
      } else {
        result.failed++;
        if (result.errors.length < 10) result.errors.push(file.getName());
      }
      if (buffer.length >= 10) { invhist_appendRows_(sheet, buffer); buffer = []; }
    }
    if (buffer.length > 0) invhist_appendRows_(sheet, buffer);

    result.elapsedSec = Math.round((Date.now() - started) / 1000);
    Logger.log('在庫推移の取込: 追加' + result.added + '件 / 既存' + result.skipped +
               '件 / 失敗' + result.failed + '件 / ' + result.elapsedSec + '秒');
  } catch (err) {
    result.error = String(err);
    Logger.log('在庫推移の取込でエラー: ' + String(err));
  }
  return result;
}

// ===== 公開関数：在庫推移を画面用に組み立てて返す（キャッシュ付き） =====
function getInventoryTrendData(force) {
  return nc_cached_('inventoryTrend', force, 900, getInventoryTrendData_uncached_);
}

function getInventoryTrendData_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    sheetUrl: null,
    days: [],       // [{ 日付, 総本数, '50kg', '20kg', その他 }] 古い順
    latest: null,   // 最新日の1件
    change: null,   // 最新日と前回の差
    bySizeLatest: {},
    error: null
  };
  try {
    var sheet = invhist_getSheet_();
    data.sheetUrl = sheet.getParent().getUrl();
    var last = sheet.getLastRow();
    if (last < 2) return data;

    var values = sheet.getRange(2, 1, last - 1, INV_HIST_CONFIG.HEADERS.length).getValues();
    var H = {};
    INV_HIST_CONFIG.HEADERS.forEach(function (h, idx) { H[h] = idx; });

    // 同じ日付が複数行あった場合は後の行（取込が新しい方）を採用する
    var byDate = {};
    values.forEach(function (r) {
      // ★ シートが '2026-08-17' を日付として保存してしまうため Date で返ってくる。
      //   String() すると "Sun Aug 17 2026 ..." になり、画面にそのまま出るうえ
      //   sortが曜日名のアルファベット順になって日付順に並ばない。
      //   nc_dateText_ で 'yyyy-MM-dd' に直してからキーにする。
      var dt = nc_dateText_(r[H['日付']], 'yyyy-MM-dd');
      if (!dt) return;
      byDate[dt] = r;
    });

    var dates = Object.keys(byDate).sort();
    data.days = dates.map(function (dt) {
      var r = byDate[dt];
      return {
        日付: dt,
        総本数: Number(r[H['総本数']]) || 0,
        '50kg': Number(r[H['50kg']]) || 0,
        '20kg': Number(r[H['20kg']]) || 0,
        その他: Number(r[H['その他']]) || 0
      };
    });

    if (data.days.length > 0) {
      data.latest = data.days[data.days.length - 1];
      if (data.days.length > 1) {
        var prev = data.days[data.days.length - 2];
        data.change = {
          前回日付: prev.日付,
          総本数: data.latest.総本数 - prev.総本数,
          '50kg': data.latest['50kg'] - prev['50kg'],
          '20kg': data.latest['20kg'] - prev['20kg']
        };
      }
      // 最新日のサイズ別内訳
      var lr = byDate[data.latest.日付];
      ['2K', '5K', '8K', '10K', '20K_三部軽量', '20K_直付', '30K', '50K_軽量型', '50K_S']
        .forEach(function (k) {
          var v = Number(lr[H[k]]) || 0;
          if (v > 0) data.bySizeLatest[k] = v;
        });
    }
  } catch (err) {
    data.error = String(err);
  }
  return data;
}

// ===== 内部：CSV1件を読んでシート1行分にする =====
function invhist_buildRow_(file) {
  try {
    var rows = inv_readCsv_(file);   // 既存エンジンの読み取り（Shift_JIS対応）を再利用
    var s = invhist_summarize_(rows);

    // 日付はファイル名から取る（例: 容器在庫照会(26.9.4E)分.csv → 2026-09-04）
    var key = inv_fileDateKey_(file.getName());
    var dateStr;
    if (key !== null) {
      var y = Math.floor(key / 10000), mo = Math.floor((key % 10000) / 100), da = key % 100;
      dateStr = y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (da < 10 ? '0' + da : da);
    } else {
      dateStr = Utilities.formatDate(file.getLastUpdated(), 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    var out = [dateStr, file.getId(), file.getName(),
               s.total, s.weight['50k'], s.weight['20k'], s.weight['other']];
    out.__unknown = s.unknown;   // 収集結果に持ち帰るための印（シートには書かない）
    ['2K', '5K', '8K', '10K', '20K_三部軽量', '20K_直付', '30K', '50K_軽量型', '50K_S']
      .forEach(function (k) { out.push(s.bySize[k] || 0); });
    out.push(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'));
    return out;
  } catch (err) {
    Logger.log('在庫CSVの取込に失敗(' + file.getName() + '): ' + String(err));
    return null;
  }
}

// ===== 内部：CSVの行を集計する =====
// 既存エンジンの分類ロジックと同じ考え方（「分類」列→INV_SIZE_LABEL_MAPで
// サイズキーと重量クラスに振り分ける）。既存関数は触らずに済むよう独立させてある。
function invhist_summarize_(rows) {
  var weight = { '50k': 0, '20k': 0, 'other': 0 };
  var bySize = {};
  var total = 0;
  // ★ 分類表(INV_SIZE_LABEL_MAP)に無いラベルは「その他」に落ちる。
  //   新しい容器の種類が増えたときや、CSVの表記が変わったときに、
  //   50kg・20kgの本数が黙って減ることになる。気づけるよう拾っておく。
  var unknown = {};

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length < 16) continue;
    if (!r[INV_CONFIG.COL_KOKUIN]) continue;      // 刻印が無い行は集計対象外
    var qty = parseInt(r[INV_CONFIG.COL_QTY], 10);
    if (isNaN(qty)) qty = 0;
    total += qty;

    var cl = r[INV_CONFIG.COL_CLASS] ? String(r[INV_CONFIG.COL_CLASS]).trim() : '';
    var mapped = cl ? INV_SIZE_LABEL_MAP[cl] : null;
    if (mapped) {
      bySize[mapped.key] = (bySize[mapped.key] || 0) + qty;
      weight[mapped.weightClass] = (weight[mapped.weightClass] || 0) + qty;
    } else {
      weight['other'] += qty;
      if (cl) unknown[cl] = (unknown[cl] || 0) + qty;
    }
  }
  var unknownLabels = Object.keys(unknown);
  if (unknownLabels.length > 0) {
    Logger.log('★ 分類表に無いラベルがありました（その他に入れています）: ' +
               unknownLabels.map(function (k) { return k + ' ' + unknown[k] + '本'; }).join(' / '));
  }
  return { total: total, weight: weight, bySize: bySize, unknown: unknown };
}

// ===== 内部：シートを用意する（出荷実績と同じスプレッドシート内の別シート） =====
function invhist_getSheet_() {
  var ss = shipact_getSheet_().getParent();   // 出荷実績のスプレッドシートを流用
  var sheet = ss.getSheetByName(INV_HIST_CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(INV_HIST_CONFIG.SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, INV_HIST_CONFIG.HEADERS.length).setValues([INV_HIST_CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, INV_HIST_CONFIG.HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function invhist_readFileIdSet_(sheet) {
  var set = {};
  var last = sheet.getLastRow();
  if (last < 2) return set;
  var ids = sheet.getRange(2, 2, last - 1, 1).getValues();   // B列 = fileId
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0]) set[String(ids[i][0])] = true;
  }
  return set;
}

function invhist_appendRows_(sheet, rows) {
  if (!rows || rows.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, INV_HIST_CONFIG.HEADERS.length)
       .setValues(rows);
}

// ===== 動作確認 =====
function testHarvestInventoryHistory() {
  Logger.log(JSON.stringify(harvestInventoryHistory(), null, 2));
}

function testInventoryTrend() {
  Logger.log(JSON.stringify(getInventoryTrendData(true), null, 2));
}
