/**
 * 野田組 業務ダッシュボード — 在庫集計エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * ★ 既存プロジェクト「配車・在庫ファイル自動保存」に “新しいスクリプトファイル”
 *   として追加する前提の版。既存コードと名前がぶつからないよう、設定は INV_CONFIG、
 *   内部関数は inv_ 接頭辞にしてある。Web配信用の doGet は既存プロジェクトの
 *   doGet と衝突するため、ここには入れていない（配信は後の工程で用意）。
 *
 * 役割：共有ドライブに日次保存される「50k / 20k 在庫照会CSV」の最新分を読み、
 *       サイズ別の在庫本数・製造年月（刻印月）の内訳を集計する。
 * 新品を製造・出荷する工場のため、再検査の概念は扱わない。
 *
 * 使い方：貼り付け後、関数 testInventoryDashboard を実行 → 実行ログで数値を確認。
 */

// ===== 設定（ここだけ環境に合わせて調整） =====
var INV_CONFIG = {
  FOLDER_50K: '1y3WTLWHWZ308aB9evY57jk93qpdUFPlP',  // 50k在庫照会CSVのフォルダ
  FOLDER_20K: '1gtjErF2zDDJBQEgL04vprLg0iYH-yEdy',  // 20k在庫照会CSVのフォルダ
  CSV_CHARSET: 'Shift_JIS',   // 神鋼システム出力のためShift-JIS
  COL_KOKUIN: 6,   // 刻印月の列（0始まり）  例: '25/04
  COL_QTY:    12   // 本数の列＝引当可能数。実在庫数で数える場合は 10 に変更
};

// ===== 公開関数：ダッシュボード用データを組み立てる =====
function getInventoryDashboardData() {
  var today = new Date();
  var data = {
    updated: Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    sizes: {},
    totals: { total: 0, '50k': 0, '20k': 0 }
  };

  var sources = [['50k', INV_CONFIG.FOLDER_50K], ['20k', INV_CONFIG.FOLDER_20K]];
  sources.forEach(function (s) {
    var label = s[0], folderId = s[1];
    try {
      var file = inv_getLatestCsv_(folderId);
      var summary = inv_summarize_(inv_readCsv_(file));
      summary.file = file.getName();
      data.sizes[label] = summary;
      data.totals[label] = summary.total;
      data.totals.total += summary.total;
    } catch (err) {
      data.sizes[label] = { error: String(err) };
    }
  });

  return data;
}

// ===== フォルダ内の最新CSVを取得（ファイル名の日付を優先、無ければ更新日時） =====
function inv_getLatestCsv_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var best = null, bestKey = -1;
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().slice(-4).toLowerCase() !== '.csv') continue;
    var key = inv_fileDateKey_(f.getName());
    if (key === null) key = f.getLastUpdated().getTime();
    if (key > bestKey) { bestKey = key; best = f; }
  }
  if (!best) throw new Error('CSVが見つかりません: ' + folderId);
  return best;
}

// 「(26.8.6E分)」→ 比較用キー（20260806）
function inv_fileDateKey_(name) {
  var m = name.match(/\((\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return (2000 + parseInt(m[1], 10)) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
}

// ===== Shift-JIS CSVを2次元配列に =====
function inv_readCsv_(file) {
  return Utilities.parseCsv(file.getBlob().getDataAsString(INV_CONFIG.CSV_CHARSET));
}

// ===== 在庫の集計 =====
function inv_summarize_(rows) {
  var total = 0, ranges = 0, byYear = {}, byMonth = {}, oldest = null;
  for (var i = 1; i < rows.length; i++) {   // 0行目はヘッダー
    var r = rows[i];
    if (!r || r.length < 16) continue;
    var kokuin = r[INV_CONFIG.COL_KOKUIN];
    if (!kokuin) continue;

    var qty = parseInt(r[INV_CONFIG.COL_QTY], 10);
    if (isNaN(qty)) qty = 0;
    total += qty;
    ranges++;

    var k = String(kokuin).replace(/'/g, '').trim();  // "25/04"
    var yr = '20' + k.slice(0, 2);
    byYear[yr] = (byYear[yr] || 0) + qty;
    byMonth[k] = (byMonth[k] || 0) + qty;
    if (oldest === null || k < oldest) oldest = k;
  }
  return { total: total, ranges: ranges, byYear: byYear, byMonth: byMonth, oldest: oldest };
}

// ===== 動作確認：実行するとログに集計結果が出る =====
function testInventoryDashboard() {
  Logger.log(JSON.stringify(getInventoryDashboardData(), null, 2));
}
