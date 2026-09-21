/**
 * 野田組 業務ダッシュボード — 野外置場タブ（アプリの中で置場管理・在庫管理をする）
 * ------------------------------------------------------------------
 * ★ なぜ要るのか
 *   野外置場タブは、もとの別プロジェクト（2021年のアプリ）を iframe で
 *   そのまま埋め込んでいた。中身は使えるが、見た目も操作も他のタブと違い、
 *   入れ子のスクロールで iPhone では扱いづらかった（落合さんの指摘）。
 *   一覧・編集・履歴・推移はアプリ側で作り直し、埋め込みはやめる。
 *   敷地レイアウト図（建屋の配置編集）だけは作り直さず、
 *   「別画面で開く」のリンクを残して元のアプリに任せる。
 *
 * ★ 数字の置き場所は変えない
 *   読み書きするのは今までと同じスプレッドシート（置場容量シート）。
 *   保存も元のアプリと同じ yardUpdateLocation() を通すので、
 *   変更履歴も今までどおり「変更履歴」シートに残る。
 *
 * ★ 推移は別に貯める
 *   「変更履歴」は文字（「20kg_実績: 100 → 150」）なので、そのままでは
 *   グラフにできない。1日1行の合計を「日次在庫」シートに貯めて、
 *   そちらをグラフにする。貯め始めた日からの分しか出せない。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて yardtab_ 接頭辞にしてある。
 */

var YARD_TAB_CONFIG = {
  DAILY_SHEET: '日次在庫',
  DAILY_HEADERS: ['日付', '20kg', '30kg', '50kg', '合計', '置場数', '満杯に近い', '超過'],
  DAILY_KEEP_DAYS: 180,   // 画面に返す日数
  LOG_LIMIT: 200          // 変更履歴を読む上限（新しいほうから）
};

// ===== 公開関数：置場の一覧（画面用） =====
// ★ キャッシュは付けない。編集した直後に古い数字が出ると、直したつもりが
//   直っていないように見えて一番困る。読むのはシート1枚なので十分速い。
function getYardTabData() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    locations: [], totals: null, sheetUrl: null, error: null
  };
  try {
    var records = yardReadAllRecords_();
    data.locations = records.map(yardtab_shape_);
    data.locations.sort(function (a, b) {
      return String(a.no).localeCompare(String(b.no), 'ja', { numeric: true });
    });
    data.totals = yardtab_totals_(data.locations);
    try { data.sheetUrl = yardGetSpreadsheet_().getUrl(); } catch (e) { /* 無くても動く */ }
  } catch (err) {
    data.error = String(err);
    Logger.log('野外置場の一覧でエラー: ' + String(err));
  }
  return data;
}

/* 1行ぶんを画面で使う形にする（純関数）。
   ★ 使用率はサイズごとに出す。合計で割ると、20kgしか置かない場所に
     50kgのMAXが混ざって実態と合わなくなる。 */
function yardtab_shape_(r) {
  var n = function (v) { var x = Number(v); return isNaN(x) ? 0 : x; };
  var sizes = [
    { key: '20', label: '20kg', 実績: n(r.a20), max: n(r.m20) },
    { key: '30', label: '30kg', 実績: n(r.a30), max: n(r.m30) },
    { key: '50', label: '50kg', 実績: n(r.a50), max: n(r.m50) }
  ].filter(function (s) { return s.max > 0 || s.実績 > 0; });
  var rate = 0, 未設定 = false;
  sizes.forEach(function (s) {
    s.率 = s.max > 0 ? s.実績 / s.max : null;
    if (s.率 != null && s.率 > rate) rate = s.率;
    /* ★ 本数は入っているのに収容数が0の置場。率が出せないので今までは「—」と
         出るだけで、満杯の数にも入らず、見た目には何の問題も無いように見えた。
         実際は「あと何本置けるか」が分からない置場なので、はっきり印を付ける。 */
    if (s.max === 0 && s.実績 > 0) 未設定 = true;
  });
  return {
    no: r.no, name: r.name || '', position: r.position || '', note: r.note || '',
    a20: n(r.a20), m20: n(r.m20), a30: n(r.a30), m30: n(r.m30), a50: n(r.a50), m50: n(r.m50),
    sizes: sizes, 率: rate, 収容数なし: 未設定,
    /* 超過・満杯のほうが急ぎなので、そちらが立っていればそちらを出す。 */
    状態: rate >= 1 ? '超過' : rate >= 0.8 ? '満杯に近い' : (未設定 ? '収容数なし' : ''),
    updatedAt: r.updatedAt || '', updatedBy: r.updatedBy || ''
  };
}

function yardtab_totals_(list) {
  var t = { a20: 0, m20: 0, a30: 0, m30: 0, a50: 0, m50: 0,
            合計: 0, max: 0, 置場数: list.length, 満杯に近い: 0, 超過: 0, 収容数なし: 0 };
  list.forEach(function (r) {
    ['a20', 'm20', 'a30', 'm30', 'a50', 'm50'].forEach(function (k) { t[k] += r[k]; });
    if (r.状態 === '超過') t.超過 += 1;
    else if (r.状態 === '満杯に近い') t.満杯に近い += 1;
    /* ★ 超過・満杯と重なっていても数える。「収容数を入れ忘れている置場が
         何か所あるか」を知りたいので、状態の分類とは別に数える。 */
    if (r.収容数なし) t.収容数なし += 1;
  });
  t.合計 = t.a20 + t.a30 + t.a50;
  t.max = t.m20 + t.m30 + t.m50;
  return t;
}

// ===== 公開関数：本数を直す（画面から） =====
// ★ 保存そのものは元のアプリと同じ yardUpdateLocation() に任せる。
//   変更履歴の残り方を2通りにしないため。
function saveYardLocation(no, updates) {
  try {
    yardUpdateLocation(no, updates || {});
    return { ok: true, error: null };
  } catch (err) {
    Logger.log('野外置場の保存でエラー: ' + String(err));
    return { ok: false, error: String(err) };
  }
}

// ===== 公開関数：変更履歴（新しい順） =====
/**
 * @param {string|number} no  置場番号。空なら全部
 * @param {number} limit      返す件数
 */
function getYardChangeLog(no, limit) {
  var out = { rows: [], error: null };
  try {
    var sheet = yardGetHistorySheet_();
    var last = sheet.getLastRow();
    if (last < 2) return out;
    // 新しいほうだけ読む（全期間を読むと行が増え続ける）
    var n = Math.min(last - 1, YARD_TAB_CONFIG.LOG_LIMIT);
    var values = sheet.getRange(last - n + 1, 1, n, YARD_HISTORY_COLUMNS.length).getValues();
    out.rows = yardtab_logRows_(values, no, limit);
  } catch (err) {
    out.error = String(err);
    Logger.log('変更履歴の取得でエラー: ' + String(err));
  }
  return out;
}

/* シートの行を画面用にする（純関数）。新しい順。 */
function yardtab_logRows_(values, no, limit) {
  var want = String(no == null ? '' : no).trim();
  var rows = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var v = values[i];
    if (!v || (!v[0] && !v[4])) continue;
    if (want !== '' && String(v[2]).trim() !== want) continue;
    rows.push({
      日時: nc_dateText_(v[0], 'yyyy-MM-dd HH:mm'),
      操作者: String(v[1] || ''),
      no: String(v[2] == null ? '' : v[2]),
      置場名: String(v[3] || ''),
      内容: String(v[4] || '')
    });
    if (limit && rows.length >= limit) break;
  }
  return rows;
}

// ===== 公開関数：日次の合計（推移グラフ用） =====
function getYardDailyTotals() {
  var out = { days: [], error: null };
  try {
    var sheet = yardtab_dailySheet_();
    var last = sheet.getLastRow();
    if (last < 2) return out;
    var n = Math.min(last - 1, YARD_TAB_CONFIG.DAILY_KEEP_DAYS);
    var values = sheet.getRange(last - n + 1, 1, n, YARD_TAB_CONFIG.DAILY_HEADERS.length).getValues();
    out.days = yardtab_dailyRows_(values);
  } catch (err) {
    out.error = String(err);
    Logger.log('野外置場の推移でエラー: ' + String(err));
  }
  return out;
}

function yardtab_dailyRows_(values) {
  var days = [];
  values.forEach(function (v) {
    var d = nc_dateText_(v[0], 'yyyy-MM-dd');
    if (!d) return;
    d = String(d).substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    days.push({ 日付: d, '20kg': Number(v[1]) || 0, '30kg': Number(v[2]) || 0,
                '50kg': Number(v[3]) || 0, 合計: Number(v[4]) || 0 });
  });
  days.sort(function (a, b) { return a.日付 < b.日付 ? -1 : a.日付 > b.日付 ? 1 : 0; });
  return days;
}

// ===== 公開関数：今日の合計を1行だけ貯める（夜間の取込から呼ぶ） =====
// ★ 同じ日に何度呼んでも1行のまま（最後の値で上書きする）。
function harvestYardDailyTotals() {
  var out = { ok: false, date: null, 合計: 0, 上書き: false, error: null };
  try {
    var list = yardReadAllRecords_().map(yardtab_shape_);
    var t = yardtab_totals_(list);
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var row = [today, t.a20, t.a30, t.a50, t.合計, t.置場数, t.満杯に近い, t.超過];

    var sheet = yardtab_dailySheet_();
    var last = sheet.getLastRow();
    var rowNo = -1;
    if (last >= 2) {
      var dates = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = dates.length - 1; i >= 0; i--) {
        var d = nc_dateText_(dates[i][0], 'yyyy-MM-dd');
        if (String(d).substring(0, 10) === today) { rowNo = i + 2; break; }
      }
    }
    if (rowNo > 0) {
      sheet.getRange(rowNo, 1, 1, row.length).setValues([row]);
      out.上書き = true;
    } else {
      sheet.appendRow(row);
    }
    out.ok = true; out.date = today; out.合計 = t.合計;
  } catch (err) {
    out.error = String(err);
    Logger.log('野外置場の日次記録でエラー: ' + String(err));
  }
  return out;
}

function yardtab_dailySheet_() {
  var ss = yardGetSpreadsheet_();
  var sheet = ss.getSheetByName(YARD_TAB_CONFIG.DAILY_SHEET);
  if (!sheet) sheet = ss.insertSheet(YARD_TAB_CONFIG.DAILY_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, YARD_TAB_CONFIG.DAILY_HEADERS.length)
         .setValues([YARD_TAB_CONFIG.DAILY_HEADERS]);
    sheet.getRange(1, 1, 1, YARD_TAB_CONFIG.DAILY_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ===== 公開関数：今すぐ記録する（手動用） =====
function 野外置場の今日ぶんを記録する() {
  var r = harvestYardDailyTotals();
  Logger.log(r.error ? ('エラー: ' + r.error)
    : (r.date + ' 合計 ' + r.合計 + '本を記録しました' + (r.上書き ? '（上書き）' : '')));
  return r;
}
