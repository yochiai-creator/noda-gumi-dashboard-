/**
 * 野田組 業務ダッシュボード — 在庫・出荷・受注の月次まとめ (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：3つの指標を「月」でそろえて1本のデータにして画面に渡す。
 *         ・月間出荷本数（配車表の合計行から）
 *         ・月末在庫本数（在庫推移シートから、その月の最終日の総本数）
 *         ・月間受注本数（受注推移シートから。※貯め始めた月以降のみ）
 *
 * ★ なぜ「月」でそろえるのか（大事なところ）
 *   出荷は約15,000本/月、在庫は総本数で1万本弱。月単位なら同じ桁なので、
 *   1つの縦軸に3つとも載せて素直に読める。
 *   （日単位だと出荷は1営業日あたり数百本になり、在庫の1万本と10倍以上
 *     離れてしまう。だから日次ではなく月次でそろえている。）
 *
 * ★ 出荷はどこから取るか（2026-09-07に決めた）
 *   配車表の「合計」行を使う。指図書PDFの積算ではない。
 *     ・配車表は1ファイルに年度まるごとの列があり、数秒で全期間が出る
 *       （指図書は1件2〜4秒 × 1,200件以上で数時間かかる）
 *     ・実データで検証したところ2026年8月は15,103本。現場の感覚と一致した
 *   指図書の取込は止めていない。容器番号・出荷先・全サイズは指図書にしか
 *   無いので、「月の本数＝配車表」「1件ごとの中身＝指図書」で使い分ける。
 *   （出荷先の上位やサイズ別内訳のカードは今も指図書を見ている）
 *
 * ★ 配車表の未来日には「予定」が入っている
 *   今日を境に実績と予定が分かれる。当月の棒は実績ぶんだけを描き、
 *   予定は薄い色で上に足して「見込み」として別に見せる。
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
    months: [],          // [{ 年月, 出荷, 出荷予定, 在庫, 受注, 在庫日, 日数 }] 古い順
    hasOrders: false,    // 受注のデータが1件でもあるか（無ければ凡例から外す）
    hasPlan: false,      // 予定（未来日）のデータがあるか
    partialMonth: null,  // 集計途中の月（当月）
    出荷の出所: '配車表',
    asOf: null,          // 実績と予定を分ける基準日
    error: null
  };

  try {
    var disp = getDispatchMonthlyTotals(false);
    if (disp.error) throw new Error('配車表の集計に失敗: ' + disp.error);
    data.asOf = disp.asOf;
    data.配車表ファイル = disp.file;

    var ship = { byMonth: {} };
    (disp.months || []).forEach(function (m) {
      ship.byMonth[m.年月] = { 本数: m.本数, 予定: m.予定, 日数: m.日数 };
      if (m.予定 > 0) data.hasPlan = true;
    });

    var inv = mcomb_invMonthEnd_();
    var ord = mcomb_ordByMonth_();
    // 元データのリンクは蓄積スプレッドシート（在庫推移・受注推移が入っている）
    data.sheetUrl = mcomb_sheetUrl_();

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
        出荷予定: s && s.予定 > 0 ? s.予定 : null,
        日数: s ? s.日数 : null,
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

// ===== 内部：蓄積スプレッドシートのURL（在庫推移・受注推移の置き場） =====
// ★ 以前はここに mcomb_shipByMonth_() があり、指図書の蓄積シートから
//   月次出荷を作っていた。配車表に切り替えたので削除した。
//   指図書ベースの月次が要るときは getShippingActualsSummary() が今も返す
//   （出荷先の上位やサイズ別内訳のカードはそちらを使っている）。
function mcomb_sheetUrl_() {
  try {
    return shipact_getSheet_().getParent().getUrl();
  } catch (err) {
    return null;
  }
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
