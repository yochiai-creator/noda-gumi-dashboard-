/**
 * 野田組 業務ダッシュボード — 容器在庫照会 集計エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * ★ 2026/08 修正：以前は「50kg用フォルダ」「20kg用フォルダ」の2つに
 *   分かれてCSVが保存される想定だったが、実際には1つのフォルダに、
 *   50kg・20kgその他サイズすべてが混在した1つのCSVが日次保存される
 *   運用に変わっていた（CSVの「分類」列に容器種別が入っている）。
 *   → 1つのフォルダ・1つのCSVを読み、行ごとに「分類」列からサイズ種別を
 *     判定して振り分ける方式に変更した。
 */

var INV_CONFIG = {
  FOLDER_ID: '1tsODI5CX4rV9kss07De4Yq0PgxpBECyc', // 容器在庫照会CSVの保存フォルダ（50kg・20kg等すべて混在）
  CSV_CHARSET: 'Shift_JIS',
  COL_KOKUIN: 6,
  COL_QTY: 12,
  COL_CLASS: 5  // 「分類」列（サイズ種別のラベル）
};

// CSVの「分類」列の実際の表記 → アプリ共通のサイズキーへの対応表。
// 「受注出荷計画表」側のキー（'2K','5K',...,'50K_S'）とキー名を揃えており、
// フロント側で受注タブと同じ描画ロジックを使い回せるようにしている。
// ※ CSVには全角スペース(　)が使われているので、コピペではなく直接この文字を使うこと。
var INV_SIZE_LABEL_MAP = {
  '２Ｋ　ＬＰＧ容器':       { key: '2K',          label: '2K',            weightClass: 'other' },
  '５Ｋ　ＬＰＧ容器':       { key: '5K',          label: '5K',            weightClass: 'other' },
  '８Ｋ　ＬＰＧ容器':       { key: '8K',          label: '8K',            weightClass: 'other' },
  '１０Ｋ　ＬＰＧ容器':     { key: '10K',         label: '10K',           weightClass: 'other' },
  '２０Ｋ　ＬＰＧ容器（三部）': { key: '20K_三部軽量', label: '20K(三部軽量)', weightClass: '20k' },
  '２０Ｋ　ＬＰＧ容器（直付）': { key: '20K_直付',    label: '20K(直付)',     weightClass: '20k' },
  '３０Ｋ　ＬＰＧ容器':     { key: '30K',         label: '30K',           weightClass: 'other' },
  '５０Ｋ　ＬＰＧ容器':     { key: '50K_軽量型',   label: '50K(軽量型)',    weightClass: '50k' },
  '５０Ｋ　ＬＰＧ容器（Ｓ）': { key: '50K_S',       label: '50K(S)',        weightClass: '50k' }
};
// 表示順（受注タブの「サイズ別受注本数」と同じ順序に揃える）
var INV_SIZE_ORDER = ['2K', '5K', '8K', '10K', '20K_三部軽量', '20K_直付', '30K', '50K_軽量型', '50K_S'];

function getInventoryDashboardData() {
  var today = new Date();
  var data = {
    updated: Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    file: null,
    sizes: { '50k': null, '20k': null }, // 既存フロントの互換のため、50kg/20kgクラスだけの内訳も別出しする
    totals: { total: 0, '50k': 0, '20k': 0 },
    bySize: {},
    error: null
  };

  try {
    var file = inv_getLatestCsv_(INV_CONFIG.FOLDER_ID);
    data.file = file.getName();
    var rows = inv_readCsv_(file);

    // weightClass ('50k' | '20k' | 'other') ごとに、本数・年月別集計を積み上げる
    var buckets = {
      '50k': { total: 0, ranges: 0, byYear: {}, byMonth: {}, oldest: null },
      '20k': { total: 0, ranges: 0, byYear: {}, byMonth: {}, oldest: null },
      'other': { total: 0, ranges: 0, byYear: {}, byMonth: {}, oldest: null }
    };
    var bySizeRaw = {}; // 生の分類ラベル → 合計本数（9分類の内訳用）
    var grandTotal = 0;

    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.length < 16) continue;
      var kokuin = r[INV_CONFIG.COL_KOKUIN];
      if (!kokuin) continue;
      var qty = parseInt(r[INV_CONFIG.COL_QTY], 10);
      if (isNaN(qty)) qty = 0;
      grandTotal += qty;

      var k = String(kokuin).replace(/'/g, '').trim();
      var yr = '20' + k.slice(0, 2);

      var classLabel = r[INV_CONFIG.COL_CLASS];
      var cl = classLabel ? String(classLabel).trim() : '';
      if (cl) {
        bySizeRaw[cl] = (bySizeRaw[cl] || 0) + qty;
      }

      var mapped = cl ? INV_SIZE_LABEL_MAP[cl] : null;
      var weightClass = mapped ? mapped.weightClass : 'other';
      var bucket = buckets[weightClass] || buckets['other'];

      bucket.total += qty;
      bucket.ranges++;
      bucket.byYear[yr] = (bucket.byYear[yr] || 0) + qty;
      bucket.byMonth[k] = (bucket.byMonth[k] || 0) + qty;
      if (bucket.oldest === null || k < bucket.oldest) bucket.oldest = k;
    }

    data.sizes['50k'] = buckets['50k'];
    data.sizes['20k'] = buckets['20k'];
    data.totals['50k'] = buckets['50k'].total;
    data.totals['20k'] = buckets['20k'].total;
    // ★ 総合計は50kg/20kgクラスだけでなく、その他サイズ（2K/5K/8K/10K/30K）も含む全件
    data.totals.total = grandTotal;

    // 生の分類ラベルを、アプリ共通のサイズキー(9分類)に変換する
    INV_SIZE_ORDER.forEach(function (key) {
      data.bySize[key] = { label: null, count: 0 };
    });
    Object.keys(bySizeRaw).forEach(function (rawLabel) {
      var m = INV_SIZE_LABEL_MAP[rawLabel];
      if (!m) {
        Logger.log('未対応の分類ラベル: "' + rawLabel + '"（本数: ' + bySizeRaw[rawLabel] + '）。INV_SIZE_LABEL_MAP に追加してください。');
        return;
      }
      data.bySize[m.key] = { label: m.label, count: (data.bySize[m.key] ? data.bySize[m.key].count : 0) + bySizeRaw[rawLabel] };
    });
    INV_SIZE_ORDER.forEach(function (key) {
      if (!data.bySize[key].label) {
        var found = null;
        Object.keys(INV_SIZE_LABEL_MAP).some(function (raw) {
          if (INV_SIZE_LABEL_MAP[raw].key === key) { found = INV_SIZE_LABEL_MAP[raw].label; return true; }
          return false;
        });
        data.bySize[key].label = found || key;
      }
    });
  } catch (err) {
    data.error = String(err);
    data.sizes['50k'] = { error: String(err) };
    data.sizes['20k'] = { error: String(err) };
  }

  return data;
}

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

function inv_fileDateKey_(name) {
  var m = name.match(/\((\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return (2000 + parseInt(m[1], 10)) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
}

function inv_readCsv_(file) {
  return Utilities.parseCsv(file.getBlob().getDataAsString(INV_CONFIG.CSV_CHARSET));
}

function testInventoryDashboard() {
  Logger.log(JSON.stringify(getInventoryDashboardData(), null, 2));
}