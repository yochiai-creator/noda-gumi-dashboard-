/**
 * 野田組 業務ダッシュボード — 在庫の入出庫（作業記録）
 * ------------------------------------------------------------------
 * ★ 何を記録するか（2026/10/26 落合さん：生産からの入庫・置場の移動・入込場への持ち出し・廃棄）
 *   ・移動        … 置場A → 置場B（サイズ・本数）
 *   ・持ち出し    … 置場A → 入込場（50kgは50k入込場、20kgは20k入込場）
 *   ・廃棄        … 手では入れない（10/27 落合さん「廃棄はログあるよ」）。廃却・欠番は本社からの書類が
 *                   Drive の「永久欠番・廃却」フォルダに残っているので、ここで二重に記録しない。
 *   ・入庫        … 生産の流れ（生産ロット）で置場に置いたとき。ロットの登録・入庫から自動で記録する
 *                   （ここで手で入れると、ロットと二重になるので入れさせない）
 *
 * ★ 置場の本数はどこが正か
 *   今までどおり置場容量シートの実績（20/30/50kg）が正。動かすときは生産の流れと同じ
 *   lot_yardMove_()（→ yardUpdateLocation()）を通すので、置場容量の「変更履歴」にも残る。
 *   作業記録には「誰が・いつ・何を・何本・どこから・どこへ」を足していくだけ。
 *   取り消しは行を消さずに「取消」を付け、置場の本数を元に戻す。
 *
 * ★ 足りない本数は動かさない（置場の本数がマイナスになる動きは断る）。
 *   移動で先に足せなかったら、元の置場に戻してから断る（片方だけ動いた状態を残さない）。
 *
 * 名前の衝突に注意：内部関数はすべて wstock_ 接頭辞。
 */

var WSTOCK_CONFIG = {
  KINDS: ['移動', '持ち出し'],                  // 画面から手で入れるもの（廃棄は書類があるので入れない）
  LOG_KINDS: ['入庫', '移動', '持ち出し', '廃棄'],  // 一覧に出すもの
  SIZES: ['20kg', '30kg', '50kg'],             // 置場容量シートに列があるサイズだけ
  YARD_OF: { '50kg': '50k入込場', '20kg': '20k入込場' },
  MAX_QTY: 5000
};

/* 置場の表し方：「7 大型製缶」。取り消しのときに番号を取り出す */
function wstock_place_(loc) { return (String(loc.no) + ' ' + (loc.name || '')).trim(); }
function wstock_placeNo_(text) { var m = String(text || '').match(/^(\S+)/); return m ? m[1] : ''; }

/* 入力を確かめる（純関数）。直したものか { error } を返す */
function wstock_validate_(req) {
  req = req || {};
  var kind = String(req.kind || '').trim();
  if (WSTOCK_CONFIG.KINDS.indexOf(kind) < 0) return { error: '種類が不明です: ' + kind };
  var size = String(req.size || '').trim();
  if (WSTOCK_CONFIG.SIZES.indexOf(size) < 0) return { error: 'サイズを選んでください（20kg・30kg・50kg）' };
  var qty = Number(String(req.qty == null ? '' : req.qty).replace(/[^\d.]/g, ''));
  if (!qty || qty !== Math.floor(qty) || qty < 1) return { error: '本数を入れてください' };
  if (qty > WSTOCK_CONFIG.MAX_QTY) return { error: '本数が多すぎます（' + qty + '本）。桁を確かめてください' };
  var from = String(req.from == null ? '' : req.from).trim();
  if (!from) return { error: 'どの置場からかを選んでください' };
  var to = String(req.to == null ? '' : req.to).trim();
  if (kind === '移動') {
    if (!to) return { error: 'どの置場へかを選んでください' };
    if (to === from) return { error: '同じ置場には移せません' };
  }
  if (kind === '持ち出し') {
    to = WSTOCK_CONFIG.YARD_OF[size] || '';
    if (!to) return { error: size + 'は入込場がありません（入込場は50kgと20kgだけ）' };
  }
  if (kind === '廃棄') to = '';
  var memo = String(req.memo || '').trim().slice(0, 200);
  if (kind === '廃棄' && !memo) return { error: '廃棄の理由を書いてください' };
  return { kind: kind, size: size, qty: qty, from: from, to: to, memo: memo };
}

/* 画面から：在庫を動かす（移動・持ち出し・廃棄） */
function recordStockMove(req) {
  req = req || {};
  var v = wstock_validate_(req);
  if (v.error) throw new Error(v.error);
  var name = work_requireStaff_(req.name);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var src = lot_findLocation_(v.from);
    if (!src) throw new Error('置場「' + v.from + '」が見つかりません');
    var dst = null;
    if (v.kind === '移動') {
      dst = lot_findLocation_(v.to);
      if (!dst) throw new Error('置場「' + v.to + '」が見つかりません');
    }
    var out = lot_yardMove_(src.no, v.size, -v.qty);
    if (out.error) throw new Error(wstock_short_(out.error, src, v));
    if (dst) {
      var inn = lot_yardMove_(dst.no, v.size, v.qty);
      if (inn.error) {
        lot_yardMove_(src.no, v.size, v.qty);   // 元に戻してから断る
        throw new Error(inn.error);
      }
    }
    work_append_({ 名前: name, 種類: v.kind, 対象: v.size, 本数: v.qty, 元: wstock_place_(src),
                   先: dst ? wstock_place_(dst) : v.to, メモ: v.memo });
  } finally { lock.releaseLock(); }
  return getStockMoves({});
}

/* 足りないときの言い方をそろえる */
function wstock_short_(err, loc, v) {
  if (/になってしまいます/.test(String(err))) {
    var key = LOT_CONFIG.SIZE_KEY[v.size];
    var have = Number(loc[key]) || 0;
    return '置場「' + loc.no + ' ' + loc.name + '」の' + v.size + 'は ' + have + '本しかありません（' + v.qty + '本は動かせません）';
  }
  return String(err);
}

/* 画面から：在庫の動きを取り消す（行は消さずに「取消」。置場の本数を元に戻す） */
function cancelStockMove(req) {
  req = req || {};
  var id = String(req.id || '').trim();
  if (!id) throw new Error('記録が不明です');
  var name = work_requireStaff_(req.name);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = work_sheet_(WORK_CONFIG.LOG_SHEET, WORK_CONFIG.LOG_HEADERS);
    var r = work_table_(sh.getDataRange().getValues()).filter(function (x) { return x.記録ID === id; })[0];
    if (!r) throw new Error('記録が見つかりません');
    if (r.取消 === '1') return getStockMoves({});
    if (WSTOCK_CONFIG.KINDS.indexOf(r.種類) < 0) {
      throw new Error('「' + r.種類 + '」はここでは取り消せません（入庫は生産の流れの「打ち間違い」で取り消します）');
    }
    var qty = Number(r.本数) || 0, size = r.対象;
    var fromNo = wstock_placeNo_(r.元);
    if (r.種類 === '移動') {
      var toNo = wstock_placeNo_(r.先);
      var back = lot_yardMove_(toNo, size, -qty);
      if (back.error) throw new Error('取り消せません：移した先の置場にもう ' + qty + '本がありません（' + back.error + '）');
      var ret = lot_yardMove_(fromNo, size, qty);
      if (ret.error) { lot_yardMove_(toNo, size, qty); throw new Error(ret.error); }
    } else {
      var ret2 = lot_yardMove_(fromNo, size, qty);   // 持ち出し・廃棄は元の置場に戻す
      if (ret2.error) throw new Error(ret2.error);
    }
    var c = WORK_CONFIG.LOG_HEADERS.indexOf('取消') + 1;
    sh.getRange(r.__row, c, 1, 3).setValues([['1', work_now_(), name]]);
  } finally { lock.releaseLock(); }
  return getStockMoves({});
}

/* 画面用：在庫の動きの一覧（既定は直近7日。新しい順）と、種類・サイズごとの本数 */
function getStockMoves(q) {
  q = q || {};
  var data = { from: q.from || work_dayKey_(-6), to: q.to || work_dayKey_(0), rows: [], totals: {}, error: null };
  try {
    var rows = work_readTable_(WORK_CONFIG.LOG_SHEET, WORK_CONFIG.LOG_HEADERS);
    data.rows = work_logRows_(rows, data.from, data.to, WSTOCK_CONFIG.LOG_KINDS).map(function (r) {
      var src = rows.filter(function (x) { return x.記録ID === r.id; })[0] || {};
      r.from = src.元 || ''; r.to = src.先 || ''; r.memo = src.メモ || ''; r.size = src.対象 || '';
      return r;
    });
    data.totals = wstock_totals_(data.rows);
  } catch (e) {
    data.error = String(e && e.message || e);
  }
  return data;
}

/* 種類 → サイズ → 本数（取り消したものは数えない）（純関数） */
function wstock_totals_(rows) {
  var t = {};
  (rows || []).forEach(function (r) {
    if (r.canceled) return;
    var k = (t[r.kind] = t[r.kind] || {});
    k[r.size] = (k[r.size] || 0) + (r.qty || 0);
  });
  return t;
}

/* 生産の流れから呼ぶ：置場に置いた（入庫）・置き場所を変えた（移動）を作業記録に残す。
   ★ 本数はもう動かしてあるので、ここでは記録だけ。失敗しても生産の流れは止めない。 */
function wstock_logFromLot_(kind, lot, fromLoc, toLoc, qty, memo, who) {
  try {
    work_append_({ 名前: who || (typeof lot_user_ === 'function' ? lot_user_() : '') || '（生産の流れ）', 種類: kind,
                   対象: lot.サイズ || '', 本数: qty, 元: fromLoc ? wstock_place_(fromLoc) : '',
                   先: toLoc ? wstock_place_(toLoc) : '', メモ: memo || ('ロット ' + (lot.ロットID || lot.id || '')) });
  } catch (e) { Logger.log('作業記録に残せませんでした（' + kind + '）: ' + e); }
}
