/**
 * 野田組 業務ダッシュボード — 在庫・出荷・受注の月次まとめ (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：3つの指標を「月」でそろえて1本のデータにして画面に渡す。
 *         ・月間出荷本数（出荷実績シートから）
 *         ・月末在庫本数（在庫推移シートから、その月の最終日の総本数）
 *         ・月間受注本数（受注推移シートから。※貯め始めた月以降のみ）
 *
 * ★ なぜ「月」でそろえるのか（大事なところ）
 *   出荷は約15,000本/月、在庫は総本数で1万本弱。月単位なら同じ桁なので、
 *   1つの縦軸に3つとも載せて素直に読める。
 *   （日単位だと出荷は1営業日あたり数百本になり、在庫の1万本と10倍以上
 *     離れてしまう。だから日次ではなく月次でそろえている。）
 *
 * ★ 在庫は「その時点の残高」、出荷と受注は「その月の合計」。
 *   種類がちがうので、画面では在庫を折れ線、出荷と受注を棒で描き分ける。
 *   単位はどれも「本」なので、同じ縦軸に載せて問題ない。
 *
 * 名前の衝突に注意：内部関数はすべて mcomb_ 接頭辞にしてある。
 */

// ===== 公開関数：画面用に月次データを組み立てて返す（キャッシュ付き） =====
function getMonthlyCombinedData(force) {
  return nc_cached_('monthlyCombined', force, 900, getMonthlyCombinedData_uncached_);
}

function getMonthlyCombinedData_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    sheetUrl: null,
    months: [],          // [{ 年月, 出荷, 在庫, 受注, 在庫日, 出荷件数 }] 古い順
    hasOrders: false,    // 受注のデータが1件でもあるか（無ければ凡例から外す）
    partialMonth: null,  // 集計途中の月（当月）
    error: null
  };

  try {
    var ship = mcomb_shipByMonth_();
    var inv = mcomb_invMonthEnd_();
    var ord = mcomb_ordByMonth_();
    data.sheetUrl = ship.sheetUrl || null;

    // 3つのどれかに登場する月を全部集めて、古い順に並べる
    var keys = {};
    Object.keys(ship.byMonth).forEach(function (k) { keys[k] = true; });
    Object.keys(inv.byMonth).forEach(function (k) { keys[k] = true; });
    Object.keys(ord.byMonth).forEach(function (k) { keys[k] = true; });

    var thisMonth = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
    data.months = Object.keys(keys).sort().map(function (k) {
      var s = ship.byMonth[k], i = inv.byMonth[k], o = ord.byMonth[k];
      return {
        年月: k,
        出荷: s ? s.本数 : null,
        出荷件数: s ? s.件数 : null,
        在庫: i ? i.総本数 : null,
        在庫日: i ? i.日付 : null,     // 月末在庫として採った日（月途中なら最新日）
        受注: o ? o.本数 : null
      };
    });
    data.hasOrders = Object.keys(ord.byMonth).length > 0;
    if (keys[thisMonth]) data.partialMonth = thisMonth;
  } catch (err) {
    data.error = String(err);
  }
  return data;
}

// ===== 内部：出荷実績シートから月ごとの本数と件数を出す =====
// 同じ (依頼No, 枝番) はバージョン最大のものだけを正とする（実績集計と同じ考え方）。
function mcomb_shipByMonth_() {
  var out = { byMonth: {}, sheetUrl: null };
  var sheet = shipact_getSheet_();
  out.sheetUrl = sheet.getParent().getUrl();
  var last = sheet.getLastRow();
  if (last < 2) return out;

  var values = sheet.getRange(2, 1, last - 1, SHIP_ACT_CONFIG.HEADERS.length).getValues();
  var H = {};
  SHIP_ACT_CONFIG.HEADERS.forEach(function (h, idx) { H[h] = idx; });

  var best = {};
  values.forEach(function (r) {
    var key = String(r[H['依頼No']]) + '_' + String(r[H['枝番']]);
    var ver = Number(r[H['バージョン']]) || 0;
    if (!best[key] || ver > best[key].__ver) best[key] = { row: r, __ver: ver };
  });

  Object.keys(best).forEach(function (k) {
    var r = best[k].row;
    // サイズが取れない行は容器以外（バルク貯槽・付属品）。本数に混ぜない。
    if (!r[H['サイズ']]) return;
    var ym = nc_dateText_(r[H['年月']], 'yyyy-MM');
    if (!ym) return;
    if (!out.byMonth[ym]) out.byMonth[ym] = { 本数: 0, 件数: 0 };
    out.byMonth[ym].本数 += Number(r[H['数量']]) || 0;
    out.byMonth[ym].件数 += 1;
  });
  return out;
}

// ===== 内部：在庫推移シートから「その月の最終日の総本数」を出す =====
// 在庫は残高なので月内を足してはいけない。月の最後に取れた日の値を採る。
function mcomb_invMonthEnd_() {
  var out = { byMonth: {} };
  var sheet = invhist_getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return out;

  var values = sheet.getRange(2, 1, last - 1, INV_HIST_CONFIG.HEADERS.length).getValues();
  var H = {};
  INV_HIST_CONFIG.HEADERS.forEach(function (h, idx) { H[h] = idx; });

  values.forEach(function (r) {
    var dt = nc_dateText_(r[H['日付']], 'yyyy-MM-dd');
    if (!dt) return;
    var ym = dt.substring(0, 7);
    var cur = out.byMonth[ym];
    // 同じ月の中では日付が一番後ろのものを残す
    if (!cur || dt > cur.日付) {
      out.byMonth[ym] = { 日付: dt, 総本数: Number(r[H['総本数']]) || 0 };
    }
  });
  return out;
}

// ===== 内部：受注推移シートから月ごとの受注本数を出す =====
// シートがまだ無い場合（貯め始める前）は空で返す。エラーにはしない。
function mcomb_ordByMonth_() {
  var out = { byMonth: {} };
  try {
    if (typeof ORD_HIST_CONFIG === 'undefined') return out;
    var sheet = ordhist_getSheetIfExists_();
    if (!sheet) return out;
    var last = sheet.getLastRow();
    if (last < 2) return out;

    var values = sheet.getRange(2, 1, last - 1, ORD_HIST_CONFIG.HEADERS.length).getValues();
    var H = {};
    ORD_HIST_CONFIG.HEADERS.forEach(function (h, idx) { H[h] = idx; });

    values.forEach(function (r) {
      var dt = nc_dateText_(r[H['日付']], 'yyyy-MM-dd');
      if (!dt) return;
      var ym = dt.substring(0, 7);
      if (!out.byMonth[ym]) out.byMonth[ym] = { 本数: 0 };
      out.byMonth[ym].本数 += Number(r[H['新規受注本数']]) || 0;
    });
  } catch (err) {
    Logger.log('受注の月次集計をとばしました: ' + String(err));
  }
  return out;
}

// ===== 動作確認 =====
function testMonthlyCombined() {
  Logger.log(JSON.stringify(getMonthlyCombinedData(true), null, 2));
}
