/**
 * 野田組 業務ダッシュボード — 出荷作業指図書 集計エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：Gmail→Drive自動仕分けで保存される「出荷作業指図書」PDFの
 *       親フォルダから「今月（例: 8月）」のサブフォルダを自動で見つけて読み、
 *       総件数・最新の一覧・本日分件数を集計してダッシュボードに渡す。
 *
 * ★ 月フォルダの自動検出：親フォルダの中に「7月」「8月」…という名前の
 *   サブフォルダが並んでいる構造を前提に、実行時の月から自動で対象フォルダを
 *   選ぶ。月初でまだ今月フォルダが無い場合は前月フォルダにフォールバックする。
 *   → フォルダIDを毎月手動で書き換える必要はない。
 *
 * ファイル名の形式:
 *   出荷作業指図書_YY.MM.DD_依頼No-バージョン(.pdf)
 *   例: 出荷作業指図書_26.08.21_26-60584-0(1).pdf
 *       → 日付2026-08-21 / 依頼No "26-60584" / バージョン "0(1)"
 *
 * 同じ依頼No・同じ日付で複数バージョンが保存されている場合、
 * 最新バージョン（末尾の番号が最大）だけを正としてカウントする。
 *
 * ★ 既存プロジェクトに同居させる場合は既存コードと名前が被らないよう
 *   設定は SHIP_CONFIG、内部関数は ship_ 接頭辞にしてある。
 *
 * 使い方：貼り付け後、関数 testShippingDashboard を実行 → 実行ログで数値を確認。
 */

var SHIP_CONFIG = {
  // 出荷作業指図書の親フォルダ（この中に「7月」「8月」…という月別サブフォルダがある）
  FOLDER_PARENT: '11D1iee40EA7UVXqzTeK6KSxSmlb6EfDh',

  // ファイル名の正規表現: 出荷作業指図書_YY.MM.DD_依頼No-バージョン(.pdf)
  NAME_PATTERN: /出荷作業指図書_(\d{2})\.(\d{2})\.(\d{2})_(\d+-\d+)-(\d+)(?:\((\d+)\))?\.pdf/i,

  RECENT_COUNT: 5   // ダッシュボードに出す「最新件数」
};

// ===== 公開関数：ダッシュボード用データを組み立てる =====
function getShippingDashboardData() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    folder: null,
    total: 0,
    todayCount: 0,
    recent: [],
    error: null
  };

  try {
    var folder = ship_getCurrentMonthFolder_();
    data.folder = folder.getName();

    var entries = ship_listOrders_(folder);
    var deduped = ship_dedupe_(entries);
    deduped.sort(function (a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });

    var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    data.total = deduped.length;
    data.todayCount = deduped.filter(function (d) { return d.date === todayStr; }).length;
    data.recent = deduped.slice(0, SHIP_CONFIG.RECENT_COUNT).map(function (d) {
      return { date: d.date, orderNo: d.orderNo, fileName: d.fileName, url: d.url };
    });
  } catch (err) {
    data.error = String(err);
  }

  return data;
}

// ===== 親フォルダの中から「今月」のサブフォルダを自動で見つける =====
// フォルダ名は「7月」「8月」…という命名。無ければ前月のフォルダにフォールバック
// （月初でまだ今月フォルダが作られていない場合の保険）。
function ship_getCurrentMonthFolder_() {
  var parent = DriveApp.getFolderById(SHIP_CONFIG.FOLDER_PARENT);
  var now = new Date();
  var thisMonthName = (now.getMonth() + 1) + '月';
  var found = ship_findSubfolderByName_(parent, thisMonthName);
  if (found) return found;

  // フォールバック：前月
  var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var prevMonthName = (prev.getMonth() + 1) + '月';
  var foundPrev = ship_findSubfolderByName_(parent, prevMonthName);
  if (foundPrev) return foundPrev;

  throw new Error('月別フォルダが見つかりません（' + thisMonthName + ' / ' + prevMonthName + ' とも無し）');
}

function ship_findSubfolderByName_(parent, name) {
  var subs = parent.getFoldersByName(name);
  return subs.hasNext() ? subs.next() : null;
}

// ===== フォルダ内のPDFをファイル名から解析してリスト化 =====
function ship_listOrders_(folder) {
  var files = folder.getFiles();
  var out = [];
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    var m = SHIP_CONFIG.NAME_PATTERN.exec(name);
    if (!m) continue;
    var yy = m[1], mm = m[2], dd = m[3], orderNo = m[4];
    var verMain = parseInt(m[5], 10) || 0;
    var verSub = m[6] ? parseInt(m[6], 10) : 0;
    out.push({
      fileName: name,
      fileId: f.getId(),
      url: f.getUrl(),
      date: '20' + yy + '-' + mm + '-' + dd,
      orderNo: orderNo,
      version: verMain * 100 + verSub   // 比較用の合成バージョン値
    });
  }
  return out;
}

// ===== 同一（日付＋依頼No）は最大バージョンのみ残す =====
function ship_dedupe_(entries) {
  var best = {};
  entries.forEach(function (e) {
    var key = e.date + '_' + e.orderNo;
    if (!best[key] || e.version > best[key].version) best[key] = e;
  });
  var out = [];
  for (var k in best) out.push(best[k]);
  return out;
}

// ===== 動作確認：実行するとログに集計結果が出る =====
function testShippingDashboard() {
  Logger.log(JSON.stringify(getShippingDashboardData(), null, 2));
}
