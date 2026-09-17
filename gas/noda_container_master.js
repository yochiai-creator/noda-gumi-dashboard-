/**
 * 野田組 業務ダッシュボード — 容器の機種マスタ（在庫照会CSVから取り込む）
 * ------------------------------------------------------------------
 * ★ どこから取るのか
 *   Driveの「容器在庫照会」フォルダに毎朝入る CSV（1日1本）。
 *   **文字コードは Shift_JIS**。UTF-8で読むと全部化ける。
 *
 *   1行＝容器番号のひとつづき。列は16。使うのはこの6つ。
 *     0 倉庫 / 2 O.No.コード / 3 品名 / 4 分類コード / 5 分類 / 12 本数
 *
 * ★ 何に使うのか
 *   生産ロットを登録するときに、サイズ（20k/50k）ではなく
 *   **実際の機種**（「２４Ｌ（１０ｋｇ）ＬＰガス容器（ＰＴ直付）」など）を選べるようにする。
 *   機種を手で打たせると表記がぶれて、集計が合わなくなる。
 *
 * ★ 置場の列との対応
 *   置場容量シートは 20kg / 30kg / 50kg の3列しか持っていない。
 *   分類から 20/30/50 のどれかを割り当て、それ以外（2K・5K・8K・10K）は
 *   **置場の在庫数には足さない**（流れだけ追う）。無い列に足せないため。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて cmst_ 接頭辞にしてある。
 */

var CMASTER_CONFIG = {
  FOLDER_ID: '1tsODI5CX4rV9kss07De4Yq0PgxpBECyc',   // 容器在庫照会（CSVが毎朝入る）
  CHARSET: 'Shift_JIS',
  SHEET: '機種',
  HEADERS: ['コード', '品名', '分類コード', '分類', 'サイズ', '在庫本数', '倉庫数', '更新日時'],
  // CSVの列位置（0始まり）。実ファイルで確認済み
  COL: { 倉庫: 0, 営業拠点: 1, コード: 2, 品名: 3, 分類コード: 4, 分類: 5,
         刻印月: 6, 番号開始: 7, 番号終了: 8, 実在庫数: 10, 本数: 12 },
  MIN_COLS: 13
};

// ===== 公開関数：機種マスタを取り込む =====
function harvestContainerMaster() {
  var out = { ok: false, file: null, 機種: 0, 行: 0, error: null };
  try {
    var f = cmst_latestFile_();
    if (!f) { out.error = '在庫照会のCSVが見つかりません'; return out; }
    out.file = f.getName();

    var text = f.getBlob().getDataAsString(CMASTER_CONFIG.CHARSET);
    var rows = Utilities.parseCsv(text);
    var built = cmst_buildTypes_(rows);
    out.行 = built.行;
    out.機種 = built.types.length;

    cmst_write_(built.types);
    return { ok: true, file: out.file, 機種: out.機種, 行: out.行, error: null };
  } catch (err) {
    out.error = String(err);
    Logger.log('機種マスタの取込でエラー: ' + String(err));
    return out;
  }
}

/**
 * CSVの行から機種の一覧を組み立てる（純関数）。
 * ★ 同じ機種が何行にも分かれて出るので、コードでまとめて本数を足す。
 * ★ 見出し行と桁の足りない行は落とす。
 */
function cmst_buildTypes_(rows) {
  var C = CMASTER_CONFIG.COL;
  var map = {}, n = 0;
  (rows || []).forEach(function (r, i) {
    if (!r || r.length < CMASTER_CONFIG.MIN_COLS) return;
    var code = String(r[C.コード] || '').trim();
    if (!/^\d+$/.test(code)) return;          // 見出し行はここで落ちる
    var name = cmst_clean_(r[C.品名]);
    if (!name) return;
    n++;
    var key = code;
    if (!map[key]) {
      map[key] = {
        コード: code, 品名: name,
        分類コード: String(r[C.分類コード] || '').trim(),
        分類: cmst_clean_(r[C.分類]),
        サイズ: cmst_sizeOf_(r[C.分類]),
        在庫本数: 0, 倉庫: {}
      };
    }
    var v = Number(String(r[C.本数] || '').replace(/,/g, ''));
    if (!isNaN(v)) map[key].在庫本数 += v;
    var soko = cmst_clean_(r[C.倉庫]);
    if (soko) map[key].倉庫[soko] = true;
  });

  var types = Object.keys(map).sort(function (a, b) { return Number(a) - Number(b); })
    .map(function (k) {
      var t = map[k];
      t.倉庫数 = Object.keys(t.倉庫).length;
      delete t.倉庫;
      return t;
    });
  return { types: types, 行: n };
}

/* 全角の空白や前後の空白を落とす。表記のぶれを減らす。 */
function cmst_clean_(v) {
  return String(v == null ? '' : v).replace(/[\s　]+/g, ' ').trim();
}

/**
 * 分類から置場の列（20kg/30kg/50kg）を決める（純関数）。
 * ★ 分類は全角（「５０Ｋ　ＬＰＧ容器（Ｓ）」）。半角に直してから数字を読む。
 * ★ 置場容量シートは20/30/50の3列しか無い。2K・5K・8K・10Kは空を返し、
 *   置場の在庫数には足さない（無い列に足せないため）。
 */
function cmst_sizeOf_(bunrui) {
  var t = cmst_toHalf_(String(bunrui == null ? '' : bunrui));
  var m = t.match(/(\d+)\s*K/i);
  if (!m) return '';
  var n = Number(m[1]);
  if (n === 50) return '50kg';
  if (n === 30) return '30kg';
  if (n === 20) return '20kg';
  return '';
}

/* 全角の英数字を半角にする。 */
function cmst_toHalf_(s) {
  return String(s).replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
}

// ===== 内部：一番新しいCSVを選ぶ =====
/* ★ 名前の日付「(26.9.16E)」で選ぶ。更新日時だと、古いファイルを開き直した
     だけで順番が入れ替わる（アームの日程表で実際に起きた）。 */
function cmst_latestFile_() {
  var folder = DriveApp.getFolderById(CMASTER_CONFIG.FOLDER_ID);
  var it = folder.getFiles(), best = null, bestKey = -1, fallback = null;
  while (it.hasNext()) {
    var f = it.next();
    var nm = f.getName();
    if (nm.toLowerCase().slice(-4) !== '.csv') continue;
    if (!fallback || f.getLastUpdated().getTime() > fallback.getLastUpdated().getTime()) fallback = f;
    var k = cmst_dateKeyFromName_(nm);
    if (k > bestKey) { bestKey = k; best = f; }
  }
  return bestKey >= 0 ? best : fallback;
}

/* 「容器在庫照会(26.9.16E)分.csv」→ 20260916。読めなければ -1。 */
function cmst_dateKeyFromName_(name) {
  var m = String(name || '').match(/\((\d{2})\.(\d{1,2})\.(\d{1,2})[A-Za-z]?\)/);
  if (!m) return -1;
  return (2000 + Number(m[1])) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

// ===== 内部：シートに書き出す（毎回まるごと入れ替え） =====
function cmst_write_(types) {
  var sheet = cmst_sheet_();
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, CMASTER_CONFIG.HEADERS.length).clearContent();
  if (types.length === 0) return;
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var rows = types.map(function (t) {
    return [t.コード, t.品名, t.分類コード, t.分類, t.サイズ, t.在庫本数, t.倉庫数, now];
  });
  sheet.getRange(2, 1, rows.length, CMASTER_CONFIG.HEADERS.length).setValues(rows);
}

function cmst_sheet_() {
  var ss = yardGetSpreadsheet_();
  var sheet = ss.getSheetByName(CMASTER_CONFIG.SHEET);
  if (!sheet) sheet = ss.insertSheet(CMASTER_CONFIG.SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CMASTER_CONFIG.HEADERS.length).setValues([CMASTER_CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, CMASTER_CONFIG.HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ===== 公開関数：機種の一覧（画面用） =====
function getContainerTypes() {
  var out = { types: [], updated: null, error: null };
  try {
    var sheet = cmst_sheet_();
    var last = sheet.getLastRow();
    if (last < 2) {
      out.error = 'まだ機種を取り込んでいません（容器の機種を取り込む を実行してください）。';
      return out;
    }
    var values = sheet.getRange(2, 1, last - 1, CMASTER_CONFIG.HEADERS.length).getValues();
    out.types = cmst_rows_(values);
    out.updated = String(values[0][7] || '');
  } catch (err) {
    out.error = String(err);
    Logger.log('機種の取得でエラー: ' + String(err));
  }
  return out;
}

/* シートの行を画面用にする（純関数）。 */
function cmst_rows_(values) {
  var out = [];
  (values || []).forEach(function (r) {
    var code = String(r[0] == null ? '' : r[0]).trim();
    if (!code) return;
    out.push({
      コード: code, 品名: String(r[1] || ''), 分類コード: String(r[2] || ''),
      分類: String(r[3] || ''), サイズ: String(r[4] || ''),
      在庫本数: Number(r[5]) || 0, 倉庫数: Number(r[6]) || 0
    });
  });
  return out;
}

// ===== 公開関数：今すぐ取り込む（手動用・確認用） =====
function 容器の機種を取り込む() {
  var r = harvestContainerMaster();
  if (r.error) { Logger.log('エラー: ' + r.error); return r; }
  Logger.log(r.file + ' から ' + r.行 + '行 / 機種 ' + r.機種 + '件');
  getContainerTypes().types.forEach(function (t) {
    Logger.log('  ' + t.コード + '  ' + t.分類 + '  [' + (t.サイズ || '置場の列なし') + ']  ' +
               t.品名 + '  在庫 ' + t.在庫本数 + '本');
  });
  return r;
}
