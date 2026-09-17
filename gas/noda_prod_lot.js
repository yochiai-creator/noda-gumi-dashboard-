/**
 * 野田組 業務ダッシュボード — 生産ロットの流れ（未受検 → 受検済 → 入庫済 → 出荷済）
 * ------------------------------------------------------------------
 * ★ 何をするものか
 *   当日生産した容器を「どの番号から何本作ったか」で登録し、
 *   検査・入庫・出荷の進み具合を追えるようにする。
 *     未受検      … 作ったが検査がまだ
 *     受検済      … 検査は通ったが、まだ置場に入れていない
 *     入庫済      … 置場に入れた（＝野外置場の実績数に入っている）
 *     出荷済      … 指図書が出て、出て行った
 *
 * ★ 出荷は人が押さない
 *   指図書（出荷実績シート）には容器Noの開始・終了が入っている。
 *   入庫済ロットの番号範囲と重なったぶんを自動で「出荷済」にして、
 *   置場の実績数からも引く。押し忘れで数字がずれるのを防ぐため。
 *
 * ★ 二重に引かない
 *   照合は毎晩走る。ロットごとに「もう何本引いたか」(出荷済本数)を持ち、
 *   前回からの差ぶんだけ置場から引く。何度走らせても結果は同じ。
 *
 * ★ 置場の数字は1か所で持つ
 *   入庫・出荷の増減は yardUpdateLocation() を通す。置場容量シートが正で、
 *   変更履歴にも残る。このシートは「流れ」だけを持ち、在庫数は持たない。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて lot_ 接頭辞にしてある。
 */

var LOT_CONFIG = {
  SHEET: '生産ロット',
  HEADERS: ['ロットID', '生産日', '機種コード', '機種名', 'サイズ',
            '容器接頭辞', '容器No開始', '容器No終了', '本数',
            '状態', '受検日', '入庫日', '置場番号', '置場名', '出荷済本数', '出荷日', '依頼No',
            '備考', '登録者', '登録日時', '更新日時'],
  // 流れは4つだけ。増やすと現場が迷う。
  STATES: ['未受検', '受検済', '入庫済', '出荷済'],
  /* 「取消」は流れの続きではなく、打ち間違えた行の打ち消し。
     行は消さずに残す。消すと、置場の数字がなぜ動いたのか後から辿れない。 */
  CANCELLED: '取消',
  /* 置場容量シートの実績列。サイズと対応させる。
     ★ 置場容量シートは20/30/50の3列しか無い。2K・5K・8K・10Kはここに無く、
       置場の在庫数には足さない（無い列に足せない）。流れだけ追う。 */
  SIZE_KEY: { '20kg': 'a20', '30kg': 'a30', '50kg': 'a50' },
  MAX_LOT: 5000   // 1ロットの上限。桁を間違えた入力を弾く
};

// ===== 公開関数：ロット一覧（画面用） =====
function getProdLots(state, limit) {
  var out = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    lots: [], totals: null, error: null
  };
  try {
    var all = lot_readAll_();
    out.totals = lot_totals_(all);
    var want = String(state || '').trim();
    /* 打ち消した行は既定では出さない。画面に残すと本数を数え間違える。
       「取消」でしぼれば見られる（履歴として消さずに残してある）。 */
    var rows = want ? all.filter(function (r) { return r.状態 === want; })
                    : all.filter(function (r) { return r.状態 !== LOT_CONFIG.CANCELLED; });
    // 新しい順（生産日→ロットID）
    rows.sort(function (a, b) {
      if (a.生産日 !== b.生産日) return a.生産日 < b.生産日 ? 1 : -1;
      return a.ロットID < b.ロットID ? 1 : -1;
    });
    out.lots = limit ? rows.slice(0, limit) : rows;
  } catch (err) {
    out.error = String(err);
    Logger.log('生産ロットの取得でエラー: ' + String(err));
  }
  return out;
}

/* 状態ごとの本数をまとめる（純関数）。
   ★ 出荷済は「今もある数」ではないので、本数ではなく件数と当月ぶんを出す。 */
function lot_totals_(list) {
  var t = { 未受検: 0, 受検済: 0, 入庫済: 0, 出荷済今月: 0, 件数: 0 };
  var thisMonth = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  list.forEach(function (r) {
    if (r.状態 === LOT_CONFIG.CANCELLED) return;   // 打ち消した行は数えない
    t.件数++;
    var nokori = r.本数 - r.出荷済本数;
    if (r.状態 === '未受検') t.未受検 += nokori;
    else if (r.状態 === '受検済') t.受検済 += nokori;
    else if (r.状態 === '入庫済') t.入庫済 += nokori;
    if (r.出荷済本数 > 0 && String(r.出荷日).substring(0, 7) === thisMonth) {
      t.出荷済今月 += r.出荷済本数;
    }
  });
  return t;
}

// ===== 公開関数：当日生産分を登録する =====
/**
 * @param {Object} lot { 生産日, 機種コード, 接頭辞, 開始, 終了, 備考 }
 *   ★ 本数は開始〜終了から出す。人に数えさせると必ずずれる。
 *   ★ 品名とサイズは機種マスタから引く。手で打たせると表記がぶれて集計が合わない。
 */
function addProdLot(lot) {
  try {
    var v = lot_validate_(lot || {}, lot_typeMap_());
    if (v.error) return { ok: false, error: v.error };

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var sheet = lot_sheet_();
      // 番号の重なりを見る。同じ容器を二重に登録すると在庫が二重になる。
      var dup = lot_findOverlap_(lot_readAll_(), v.接頭辞, v.開始, v.終了);
      if (dup) {
        return { ok: false, error: '容器番号が既に登録されています（' + dup.ロットID + ' / ' +
                 dup.容器接頭辞 + dup.容器No開始 + '〜' + dup.容器No終了 + '）' };
      }
      var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      var id = lot_newId_(sheet);
      sheet.appendRow([id, v.生産日, v.機種コード, v.機種名, v.サイズ,
                       v.接頭辞, v.開始, v.終了, v.本数,
                       '未受検', '', '', '', '', 0, '', '', v.備考,
                       lot_user_(), now, now]);
      return { ok: true, error: null, id: id, 本数: v.本数, 機種名: v.機種名 };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('生産ロットの登録でエラー: ' + String(err));
    return { ok: false, error: String(err) };
  }
}

/* 入力を確かめて、数えた本数を返す（純関数）。
   @param types 機種コード → { 品名, サイズ } のマップ */
function lot_validate_(lot, types) {
  var d = String(lot.生産日 || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: '生産日を入れてください（2026-09-17の形）' };

  var code = String(lot.機種コード || '').trim();
  var t = types && types[code];
  if (!t) return { error: '機種を選んでください' };

  var pre = String(lot.接頭辞 || '').trim().toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(pre)) return { error: '容器番号の記号（HEPなど）を入れてください' };

  var a = String(lot.開始 || '').trim(), b = String(lot.終了 || '').trim();
  if (!/^\d{1,6}$/.test(a) || !/^\d{1,6}$/.test(b)) {
    return { error: '容器番号は数字で入れてください（HEP54401 なら 54401）' };
  }
  var na = Number(a), nb = Number(b);
  if (nb < na) return { error: '終わりの番号が始まりより小さくなっています' };
  var n = nb - na + 1;
  if (n > LOT_CONFIG.MAX_LOT) {
    return { error: '本数が ' + n + ' 本になります。番号の桁を確かめてください' };
  }
  // 桁数は入力に合わせて揃える（HEP54401 と HEP054401 を混ぜない）
  var keta = Math.max(a.length, b.length);
  var pad = function (x) { var s = String(x); while (s.length < keta) s = '0' + s; return s; };
  return { 生産日: d, 機種コード: code, 機種名: t.品名, サイズ: t.サイズ || '',
           接頭辞: pre, 開始: pad(na), 終了: pad(nb), 本数: n,
           備考: String(lot.備考 || '').trim(), error: null };
}

/* 機種マスタを「コード → {品名, サイズ}」の形で引く。 */
function lot_typeMap_() {
  var map = {};
  var r = getContainerTypes();
  (r.types || []).forEach(function (t) {
    map[String(t.コード)] = { 品名: t.品名, サイズ: t.サイズ, 分類: t.分類 };
  });
  return map;
}

/* 番号が重なっているロットを探す（純関数）。接頭辞が同じものだけ見る。 */
function lot_findOverlap_(list, pre, a, b) {
  var na = Number(a), nb = Number(b);
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (r.状態 === LOT_CONFIG.CANCELLED) continue;   // 打ち消した番号は空きに戻す
    if (r.容器接頭辞 !== pre) continue;
    var ra = Number(r.容器No開始), rb = Number(r.容器No終了);
    if (na <= rb && ra <= nb) return r;
  }
  return null;
}

// ===== 公開関数：検査が通った =====
function markLotInspected(id) {
  return lot_setState_(id, '未受検', '受検済', function (row, H, now) {
    row[H['受検日']] = now.substring(0, 10);
  });
}

// ===== 公開関数：置場に入れた（入庫） =====
/**
 * ★ ここで置場の実績数に足す。足すのは yardUpdateLocation() を通すので、
 *   置場容量シートが正のまま、変更履歴にも残る。
 */
function stockInLot(id, locationNo) {
  try {
    var no = String(locationNo || '').trim();
    if (!no) return { ok: false, error: '置場を選んでください' };
    var loc = lot_findLocation_(no);
    if (!loc) return { ok: false, error: '置場「' + no + '」が見つかりません' };

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var found = lot_findRow_(id);
      if (!found) return { ok: false, error: 'ロット「' + id + '」が見つかりません' };
      if (found.lot.状態 !== '受検済') {
        return { ok: false, error: '受検済のロットだけ入庫できます（今は「' + found.lot.状態 + '」）' };
      }
      var key = LOT_CONFIG.SIZE_KEY[found.lot.サイズ];
      var add = found.lot.本数 - found.lot.出荷済本数;
      /* ★ 置場容量シートに列が無いサイズ（2K・5K・8K・10K）は在庫数に足さない。
           入庫したことだけ記録する。無い列に足すと数字が壊れる。 */
      if (key) {
        var r = lot_moveYard_(loc, key, add);
        if (r.error) return { ok: false, error: r.error };
      }

      var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      lot_writeRow_(found.rowNo, function (row, H) {
        row[H['状態']] = '入庫済';
        row[H['入庫日']] = now.substring(0, 10);
        row[H['置場番号']] = loc.no;
        row[H['置場名']] = loc.name;
        row[H['更新日時']] = now;
      });
      return { ok: true, error: null, 置場: loc.name, 本数: add,
               在庫に反映: key ? true : false };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('入庫でエラー: ' + String(err));
    return { ok: false, error: String(err) };
  }
}

// ===== 公開関数：打ち間違えたロットを取り消す =====
/**
 * ★ なぜ要るのか
 *   番号や本数を打ち間違えたロットを直す手段が無いと、置場の実績数が
 *   間違ったまま残り、現場が画面を信じなくなる。
 * ★ 行は消さない
 *   状態を「取消」にするだけ。消すと、置場の数字がなぜ動いたのか辿れない。
 * ★ 入庫済なら置場から引き戻す
 *   入庫のときに足したぶんをそのまま戻す。yardUpdateLocation() を通すので
 *   変更履歴にも残る。
 * ★ 指図書に当たったロットは取り消さない
 *   既に出荷された容器を「無かったこと」にはできない。理由を返して断る。
 */
function cancelProdLot(id, reason) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var found = lot_findRow_(id);
      if (!found) return { ok: false, error: 'ロット「' + id + '」が見つかりません' };
      var lot = found.lot;
      if (lot.状態 === LOT_CONFIG.CANCELLED) {
        return { ok: false, error: 'このロットは既に取り消してあります' };
      }
      if (lot.出荷済本数 > 0) {
        return { ok: false, error: '指図書（' + lot.依頼No + '）で ' + lot.出荷済本数 +
                 '本が出荷済です。出た容器は取り消せません。' };
      }

      // 入庫済なら、入庫のときに足したぶんを置場から引き戻す
      var 戻し = 0, 置場 = '';
      var key = LOT_CONFIG.SIZE_KEY[lot.サイズ];
      if (lot.状態 === '入庫済' && key && lot.置場番号) {
        var loc = lot_findLocation_(lot.置場番号);
        if (!loc) return { ok: false, error: '置場「' + lot.置場番号 + '」が見つかりません' };
        var r = lot_moveYard_(loc, key, -lot.本数);
        if (r.error) return { ok: false, error: r.error };
        戻し = lot.本数;
        置場 = loc.name;
      }

      var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      var why = String(reason || '').trim();
      lot_writeRow_(found.rowNo, function (row, H) {
        row[H['状態']] = LOT_CONFIG.CANCELLED;
        row[H['備考']] = (String(row[H['備考']] || '') + ' ').trim() +
                         '【取消 ' + now + (why ? ' ' + why : '') + '】';
        row[H['更新日時']] = now;
      });
      return { ok: true, error: null, 戻した本数: 戻し, 置場: 置場 };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('ロットの取消でエラー: ' + String(err));
    return { ok: false, error: String(err) };
  }
}

// ===== 公開関数：指図書と突き合わせて出荷済にする（夜間の取込から） =====
/**
 * ★ 人が押さない。指図書の容器No範囲と、入庫済ロットの番号範囲が重なったぶんを
 *   自動で引く。押し忘れで数字がずれるのを防ぐため。
 * ★ 何度走らせても同じ結果になる（ロットごとに「もう何本引いたか」を持つ）。
 */
function matchProdLotsWithOrders() {
  var out = { 照合: 0, 出荷済: 0, 引いた本数: 0, error: null, 明細: [] };
  try {
    var idx = shipact_index_();
    var ships = lot_shipRanges_(idx);
    if (ships.length === 0) return out;

    var lots = lot_readAll_().filter(function (r) { return r.状態 === '入庫済'; });
    for (var i = 0; i < lots.length; i++) {
      var lot = lots[i];
      var hit = lot_matchOne_(lot, ships);
      out.照合++;
      if (hit.本数 <= 0) continue;
      var r = lot_applyShipped_(lot, hit);
      if (r.error) { out.error = r.error; continue; }
      out.引いた本数 += hit.本数;
      if (r.出荷済) out.出荷済++;
      out.明細.push({ id: lot.ロットID, 本数: hit.本数, 依頼No: hit.依頼No, 置場: lot.置場名 });
    }
  } catch (err) {
    out.error = String(err);
    Logger.log('指図書との照合でエラー: ' + String(err));
  }
  return out;
}

/* 指図書の容器番号レンジを取り出す（純関数）。
   ★ byOrder ではなく ranges を使う。byOrder は依頼Noで1件にまとめるので、
     枝番が複数ある指図書のレンジが落ちる。 */
function lot_shipRanges_(idx) {
  var out = [];
  ((idx && idx.ranges) || []).forEach(function (e) {
    if (!e || !e.prefix || e.a == null || e.b == null) return;
    out.push({ prefix: String(e.prefix).toUpperCase(), a: Number(e.a), b: Number(e.b),
               no: e.no, date: e.date });
  });
  return out;
}

/* 1ロットが指図書とどれだけ重なるかを数える（純関数）。
   ★ 部分的に重なることがある（100本のうち80本だけ指図書に載る）。
     重なった本数を足し、まだ引いていないぶんだけを返す。 */
function lot_matchOne_(lot, ships) {
  var pre = String(lot.容器接頭辞).toUpperCase();
  var a = Number(lot.容器No開始), b = Number(lot.容器No終了);
  var covered = 0, nos = [], dates = [];
  ships.forEach(function (s) {
    if (s.prefix !== pre) return;
    var lo = Math.max(a, s.a), hi = Math.min(b, s.b);
    if (hi < lo) return;
    covered += hi - lo + 1;
    nos.push(s.no);
    if (s.date) dates.push(s.date);
  });
  if (covered > lot.本数) covered = lot.本数;     // 指図書が重複していても本数は超えない
  var nokori = covered - lot.出荷済本数;
  dates.sort();
  return { 本数: nokori > 0 ? nokori : 0, 累計: covered,
           依頼No: nos.join(','), 出荷日: dates.length ? dates[dates.length - 1] : '' };
}

/* 出荷ぶんを置場から引いて、ロットの状態を進める。 */
function lot_applyShipped_(lot, hit) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var found = lot_findRow_(lot.ロットID);
    if (!found) return { error: 'ロット「' + lot.ロットID + '」が見つかりません' };
    // 読み直したら既に引かれていた（別の実行とぶつかった）
    if (found.lot.出荷済本数 >= hit.累計) return { error: null, 出荷済: false };

    var sub = hit.累計 - found.lot.出荷済本数;
    var key = LOT_CONFIG.SIZE_KEY[found.lot.サイズ];
    if (key && found.lot.置場番号) {
      var loc = lot_findLocation_(found.lot.置場番号);
      if (loc) {
        var r = lot_moveYard_(loc, key, -sub);
        if (r.error) return { error: r.error };
      }
    }
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    var done = hit.累計 >= found.lot.本数;
    lot_writeRow_(found.rowNo, function (row, H) {
      row[H['出荷済本数']] = hit.累計;
      row[H['依頼No']] = hit.依頼No;
      row[H['出荷日']] = hit.出荷日;
      if (done) row[H['状態']] = '出荷済';
      row[H['更新日時']] = now;
    });
    return { error: null, 出荷済: done };
  } finally {
    lock.releaseLock();
  }
}

// ===== 内部：置場の実績数を増減する =====
// ★ 直接シートに書かず yardUpdateLocation() を通す。置場容量シートが正で、
//   変更履歴にも残るようにするため。
function lot_moveYard_(loc, key, delta) {
  if (!key) return { error: 'サイズが置場の列と対応していません' };
  var cur = Number(loc[key]) || 0;
  var next = cur + delta;
  if (next < 0) {
    return { error: '置場「' + loc.name + '」の' + key + 'が' + next + '本になってしまいます' };
  }
  var up = {};
  up[key] = next;
  yardUpdateLocation(loc.no, up);
  return { error: null, before: cur, after: next };
}

function lot_findLocation_(no) {
  var want = String(no).trim();
  var recs = yardReadAllRecords_();
  for (var i = 0; i < recs.length; i++) {
    if (String(recs[i].no).trim() === want) return recs[i];
  }
  return null;
}

// ===== 内部：状態を1つ進める（汎用） =====
function lot_setState_(id, from, to, fill) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var found = lot_findRow_(id);
      if (!found) return { ok: false, error: 'ロット「' + id + '」が見つかりません' };
      if (found.lot.状態 !== from) {
        return { ok: false, error: '「' + from + '」のロットだけです（今は「' + found.lot.状態 + '」）' };
      }
      var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      lot_writeRow_(found.rowNo, function (row, H) {
        row[H['状態']] = to;
        row[H['更新日時']] = now;
        if (fill) fill(row, H, now);
      });
      return { ok: true, error: null };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('状態の更新でエラー: ' + String(err));
    return { ok: false, error: String(err) };
  }
}

// ===== 内部：シート =====
function lot_sheet_() {
  var ss = yardGetSpreadsheet_();
  var sheet = ss.getSheetByName(LOT_CONFIG.SHEET);
  if (!sheet) sheet = ss.insertSheet(LOT_CONFIG.SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, LOT_CONFIG.HEADERS.length).setValues([LOT_CONFIG.HEADERS]);
    sheet.getRange(1, 1, 1, LOT_CONFIG.HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function lot_headerIndex_() {
  var H = {};
  LOT_CONFIG.HEADERS.forEach(function (h, i) { H[h] = i; });
  return H;
}

function lot_readAll_() {
  var sheet = lot_sheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, LOT_CONFIG.HEADERS.length).getValues();
  return lot_shapeRows_(values);
}

/* シートの行を画面で使う形にする（純関数）。 */
function lot_shapeRows_(values) {
  var H = lot_headerIndex_();
  var out = [];
  values.forEach(function (r) {
    var id = String(r[H['ロットID']] || '').trim();
    if (!id) return;
    out.push({
      ロットID: id,
      生産日: lot_dateText_(r[H['生産日']]),
      機種コード: String(r[H['機種コード']] == null ? '' : r[H['機種コード']]).trim(),
      機種名: String(r[H['機種名']] || ''),
      サイズ: String(r[H['サイズ']] || ''),
      容器接頭辞: String(r[H['容器接頭辞']] || '').toUpperCase(),
      容器No開始: String(r[H['容器No開始']] || ''),
      容器No終了: String(r[H['容器No終了']] || ''),
      本数: Number(r[H['本数']]) || 0,
      状態: String(r[H['状態']] || '未受検'),
      受検日: lot_dateText_(r[H['受検日']]),
      入庫日: lot_dateText_(r[H['入庫日']]),
      置場番号: r[H['置場番号']] === '' || r[H['置場番号']] == null ? '' : String(r[H['置場番号']]),
      置場名: String(r[H['置場名']] || ''),
      出荷済本数: Number(r[H['出荷済本数']]) || 0,
      出荷日: lot_dateText_(r[H['出荷日']]),
      依頼No: String(r[H['依頼No']] || ''),
      備考: String(r[H['備考']] || ''),
      登録者: String(r[H['登録者']] || '')
    });
  });
  return out;
}

function lot_dateText_(v) {
  var t = nc_dateText_(v, 'yyyy-MM-dd');
  return String(t || '').substring(0, 10);
}

function lot_findRow_(id) {
  var want = String(id || '').trim();
  if (!want) return null;
  var sheet = lot_sheet_();
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var values = sheet.getRange(2, 1, last - 1, LOT_CONFIG.HEADERS.length).getValues();
  var H = lot_headerIndex_();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][H['ロットID']]).trim() === want) {
      return { rowNo: i + 2, lot: lot_shapeRows_([values[i]])[0] };
    }
  }
  return null;
}

function lot_writeRow_(rowNo, fill) {
  var sheet = lot_sheet_();
  var row = sheet.getRange(rowNo, 1, 1, LOT_CONFIG.HEADERS.length).getValues()[0];
  fill(row, lot_headerIndex_());
  sheet.getRange(rowNo, 1, 1, LOT_CONFIG.HEADERS.length).setValues([row]);
}

/* ロットIDは「生産日＋連番」。人が見て何日のものか分かるようにする。 */
function lot_newId_(sheet) {
  var last = sheet.getLastRow();
  var n = last < 2 ? 0 : last - 1;
  return 'L' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd') + '-' +
         ('000' + (n + 1)).slice(-3);
}

function lot_user_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// ===== 公開関数：今すぐ照合する（手動用・確認用） =====
function 生産ロットを指図書と照合する() {
  var r = matchProdLotsWithOrders();
  if (r.error) { Logger.log('エラー: ' + r.error); return r; }
  Logger.log('照合したロット ' + r.照合 + '件 / 引いた本数 ' + r.引いた本数 +
             ' / 出荷済になった ' + r.出荷済 + '件');
  r.明細.forEach(function (m) {
    Logger.log('  ' + m.id + '  ' + m.本数 + '本  依頼No ' + m.依頼No + '  ' + m.置場);
  });
  return r;
}

// ===== 診断：ロットと指図書の容器Noが噛み合っているか見る =====
/**
 * ★ なぜ要るのか
 *   照合が「0本」で終わったとき、理由が2つあって見分けが付かない。
 *     (1) まだ指図書が出ていないだけ（正常）
 *     (2) 接頭辞や桁が食い違っていて、永久に当たらない（不具合）
 *   この関数は両者を分けて言い切る。数字を動かさない、見るだけの関数。
 */
function lot_diagnose_(lots, ships) {
  var lines = [], warn = 0;
  var byPre = {};
  (ships || []).forEach(function (s) {
    var p = String(s.prefix || '').toUpperCase();
    if (!byPre[p]) byPre[p] = { n: 0, lo: s.a, hi: s.b };
    byPre[p].n++;
    if (s.a < byPre[p].lo) byPre[p].lo = s.a;
    if (s.b > byPre[p].hi) byPre[p].hi = s.b;
  });
  var pres = Object.keys(byPre).sort(function (a, b) { return byPre[b].n - byPre[a].n; });

  lines.push('指図書の容器Noレンジ ' + (ships || []).length + '件 / 接頭辞 ' + pres.length + '種類');
  pres.slice(0, 12).forEach(function (p) {
    lines.push('  ' + p + '  ' + byPre[p].n + '件  ' + byPre[p].lo + '〜' + byPre[p].hi);
  });
  if (pres.length > 12) lines.push('  …ほか ' + (pres.length - 12) + '種類');
  if (!(ships || []).length) {
    lines.push('★ 指図書側に容器Noのレンジが1件も無い。PDFの読み取りを先に直す必要がある。');
    warn++;
  }

  lines.push('ロット ' + (lots || []).length + '件');
  (lots || []).forEach(function (lot) {
    var pre = String(lot.容器接頭辞 || '').toUpperCase();
    var a = Number(lot.容器No開始), b = Number(lot.容器No終了);
    lines.push('  ' + lot.ロットID + '  ' + (pre || '(接頭辞なし)') + ' ' + a + '〜' + b +
               '  ' + lot.本数 + '本  ' + lot.状態 +
               (lot.出荷済本数 ? '  引き済 ' + lot.出荷済本数 + '本' : ''));
    var hit = lot_matchOne_(lot, ships || []);
    var same = byPre[pre];
    if (!pre) {
      lines.push('    ★ ロットに接頭辞が入っていない。登録しなおしが要る。');
      warn++;
    } else if (!same) {
      lines.push('    ★ この接頭辞「' + pre + '」は指図書側に1件も無い。' +
                 (pres.length ? '指図書側は ' + pres.slice(0, 5).join(' / ') + ' を使っている。'
                              : ''));
      warn++;
    } else if (hit.累計 > 0) {
      lines.push('    重なった ' + hit.累計 + '本  依頼No ' + hit.依頼No);
    } else if (String(a).length !== String(same.hi).length) {
      /* ★「番号が範囲の外」では判定にしない。作ったばかりのロットは
           出荷済のどれより番号が大きくて当たり前で、それは正常。
           本当に危ないのは桁数そのものが違うとき。 */
      lines.push('    ★ 接頭辞は合うが桁数が違う（ロット ' + String(a).length +
                 '桁 / 指図書 ' + String(same.hi).length + '桁）。入力の取り違えかもしれない。');
      warn++;
    } else {
      lines.push('    重なり無し。桁は指図書(' + same.lo + '〜' + same.hi +
                 ')と同じ → まだ指図書が出ていないだけ。仕組みは動く。');
    }
    if (lot.状態 !== '入庫済' && lot.状態 !== '出荷済') {
      lines.push('    ※ 状態が「' + lot.状態 + '」。照合の対象は入庫済だけ。');
    }
  });
  return { lines: lines, 要確認: warn };
}

// ===== 公開関数：見比べるだけ（数字は動かさない） =====
function ロットと指図書の番号を見比べる() {
  var r;
  try {
    r = lot_diagnose_(lot_readAll_(), lot_shipRanges_(shipact_index_()));
  } catch (err) {
    Logger.log('見比べでエラー: ' + String(err));
    return { error: String(err) };
  }
  r.lines.forEach(function (s) { Logger.log(s); });
  Logger.log(r.要確認 ? '★ 要確認 ' + r.要確認 + '件' : '食い違いは見つからなかった');
  return r;
}
