/**
 * 野田組 業務ダッシュボード — 受注推移の収集エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：受注出荷計画表PDFを日付順に並べ、隣り合う2日を比べて
 *       「新しく増えた依頼No」＝その日に入った受注を1行ずつ貯める。
 *
 * ★ なぜ差分を取るのか
 *   計画表は「まだ出していない注文」の一覧で、出荷が済んだ注文は表から
 *   消える。つまり合計本数の引き算では、出荷で減った分と受注で増えた分が
 *   打ち消し合ってしまう。
 *   → 前回の計画表に無かった依頼Noだけを拾えば、純粋に「入ってきた受注」
 *     が取れる。（この考え方はダッシュボードの前日比で既に使っている）
 *
 * ★ 限界（画面にも出すこと）
 *   1) 計画表PDFは2026年7月1日ぶんからしか残っていない。それ以前は出せない。
 *   2) 一番古い7/1には比較相手が無いので、その日は受注ゼロ扱いになる。
 *      （7月の合計は初期の受注残ぶんだけ少なく出る）
 *   3) 土日はファイルが作られない。さらに8/7→8/17のように平日が抜けている
 *      区間がある。抜けた区間に入った受注は、次に取れた日にまとめて計上される。
 *      日ごとの山は動くが、同じ月の中の抜けなら月合計は保たれる。
 *      抜けの大きさは「空白日数」列に残してあるので後から検証できる。
 *
 * ★ 重いので時間予算つき。1ファイルにPDF→Docs変換が2〜4秒かかる。
 *   途中で切れても、次回は貯めた続きから再開する。
 *
 * 名前の衝突に注意：内部関数はすべて ordhist_ 接頭辞にしてある。
 */

var ORD_HIST_CONFIG = {
  SHEET_NAME: '受注推移',
  TIME_BUDGET_MS: 4 * 60 * 1000,
  HEADERS: ['日付', 'ファイル名', '前回日付', '空白日数',
            '新規受注件数', '新規受注本数', '受注残件数', '受注残本数', '取込日時']
};

// ===== 公開関数：未取込の計画表を古い順に読んで「受注推移」シートに貯める =====
// 何度呼んでも安全（既に取り込んだ日付は飛ばす）。
function harvestOrderHistory() {
  var started = Date.now();
  var result = {
    started: Utilities.formatDate(new Date(started), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    added: 0, skipped: 0, failed: 0, timeUp: false, errors: [], error: null
  };

  try {
    var sheet = ordhist_getSheet_();
    var known = ordhist_readDateSet_(sheet);

    // 古い順に並べる（ord_getSortedFiles_ は新しい順に返すので反転する）
    var files = ord_getSortedFiles_(ORDER_CONFIG.FOLDER_ID).slice().reverse();
    if (files.length === 0) { result.error = '計画表PDFが見つかりません'; return result; }

    var buffer = [];
    var prev = null;   // { dateStr, orderNos, file } 直前に読んだ計画表

    for (var i = 0; i < files.length; i++) {
      if (Date.now() - started > ORD_HIST_CONFIG.TIME_BUDGET_MS) { result.timeUp = true; break; }

      var file = files[i].file;
      var dateStr = ordhist_keyToDate_(files[i].key);

      // 既に取り込んだ日でも、次の日の比較相手として中身は必要になる。
      // ただしPDF変換は重いので、次の日も取込済みなら読まずに飛ばす。
      var nextDone = (i + 1 < files.length) && known[ordhist_keyToDate_(files[i + 1].key)];
      if (known[dateStr] && nextDone) {
        result.skipped++;
        prev = null;   // 連続性が切れるので、次に読む日は「比較相手なし」になる
        continue;
      }

      var cur;
      try {
        cur = { dateStr: dateStr, orders: ord_getLpOrdersForFile_(file) };
      } catch (err) {
        result.failed++;
        if (result.errors.length < 10) result.errors.push(file.getName() + ': ' + String(err));
        prev = null;
        continue;
      }

      if (known[dateStr]) { result.skipped++; prev = cur; continue; }

      if (prev === null) {
        // 比較相手が無い日（一番古い日、または前の日の読み取りに失敗した日）。
        // 受注ゼロではなく「不明」として空欄で入れる。0本と誤読させないため。
        buffer.push(ordhist_row_(cur, null, null));
      } else {
        buffer.push(ordhist_row_(cur, prev, ordhist_dayGap_(prev.dateStr, cur.dateStr)));
      }
      known[dateStr] = true;
      result.added++;
      prev = cur;

      if (buffer.length >= 5) { ordhist_appendRows_(sheet, buffer); buffer = []; }
    }
    if (buffer.length > 0) ordhist_appendRows_(sheet, buffer);

    result.elapsedSec = Math.round((Date.now() - started) / 1000);
    Logger.log('受注推移の取込: 追加' + result.added + '件 / 既存' + result.skipped +
               '件 / 失敗' + result.failed + '件 / ' + result.elapsedSec + '秒' +
               (result.timeUp ? '（時間切れ。次回続きから）' : ''));
  } catch (err) {
    result.error = String(err);
    Logger.log('受注推移の取込でエラー: ' + String(err));
  }
  return result;
}

// ===== 内部：シート1行分を組み立てる =====
function ordhist_row_(cur, prev, gap) {
  var backlogQty = cur.orders.reduce(function (s, o) { return s + (o.qty || 0); }, 0);
  var newCount = '', newQty = '';
  if (prev !== null) {
    var prevNos = {};
    prev.orders.forEach(function (o) { prevNos[o.orderNo] = true; });
    var fresh = cur.orders.filter(function (o) { return !prevNos[o.orderNo]; });
    newCount = fresh.length;
    newQty = fresh.reduce(function (s, o) { return s + (o.qty || 0); }, 0);
  }
  return [cur.dateStr, '', prev ? prev.dateStr : '', gap === null ? '' : gap,
          newCount, newQty, cur.orders.length, backlogQty,
          Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')];
}

// ===== 内部：ファイル名の日付キー(YYYYMMDD)を 'yyyy-MM-dd' にする =====
function ordhist_keyToDate_(key) {
  var y = Math.floor(key / 10000), mo = Math.floor((key % 10000) / 100), d = key % 100;
  return y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d);
}

// ===== 内部：2つの日付が何日離れているか =====
function ordhist_dayGap_(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  var da = Date.UTC(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
  var db = Date.UTC(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
  return Math.round((db - da) / 86400000);
}

// ===== 内部：シートを用意する（出荷実績と同じスプレッドシート内） =====
function ordhist_getSheet_() {
  var ss = shipact_getSheet_().getParent();
  var sheet = ss.getSheetByName(ORD_HIST_CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(ORD_HIST_CONFIG.SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ORD_HIST_CONFIG.HEADERS.length).setValues([ORD_HIST_CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, ORD_HIST_CONFIG.HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 月次まとめから呼ばれる。まだ貯め始めていない場合は作らずに null を返す。
function ordhist_getSheetIfExists_() {
  try {
    return shipact_getSheet_().getParent().getSheetByName(ORD_HIST_CONFIG.SHEET_NAME);
  } catch (err) {
    return null;
  }
}

function ordhist_readDateSet_(sheet) {
  var set = {};
  var last = sheet.getLastRow();
  if (last < 2) return set;
  var vals = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var d = nc_dateText_(vals[i][0], 'yyyy-MM-dd');
    if (d) set[d] = true;
  }
  return set;
}

function ordhist_appendRows_(sheet, rows) {
  if (!rows || rows.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ORD_HIST_CONFIG.HEADERS.length)
       .setValues(rows);
}

// ===== 公開関数：受注推移の蓄積を空にして取り直す =====
function resetOrderHistory() {
  var sheet = ordhist_getSheet_();
  var last = sheet.getLastRow();
  var cleared = 0;
  if (last > 1) {
    cleared = last - 1;
    sheet.getRange(2, 1, cleared, ORD_HIST_CONFIG.HEADERS.length).clearContent();
  }
  nc_forget_('monthlyCombined');
  Logger.log('受注推移の蓄積をリセットしました（' + cleared + '行を削除）。');
  return { ok: true, clearedRows: cleared };
}

// ===== 動作確認 =====
function testHarvestOrderHistory() {
  Logger.log(JSON.stringify(harvestOrderHistory(), null, 2));
}
