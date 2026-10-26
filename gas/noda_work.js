/**
 * 野田組 業務ダッシュボード — 作業の記録（出荷済・在庫の入出庫）と出荷の進捗
 * ------------------------------------------------------------------
 * ★ 考え方（2026/10/26 落合さん「業務の基幹のアプリとして拡張したい」）
 *   ・作業の記録は「作業記録」シートに**足していくだけ**。消さずに「取消」を付ける。
 *     誰が・いつ・何を・何本・どこから・どこへ、をあとから必ずたどれるようにする。
 *   ・今の状態（出荷済か、どこに何本あるか）は記録から計算して出す。
 *   ・自動で分かるもの（指図書が来た・チェック完了・指図書での在庫の引き当て）は人に押させない。
 *     人が押すのは現場でしか分からないことだけ（出荷済など）。
 *
 * ★ 誰が押したか
 *   野田組の全員がGoogleアカウントを持っているわけではない（2026/10/26 確認）。
 *   amingと同じく、端末で「記録する人」を名前から選んでもらい、その名前で記録する。
 *   名前は「社員」シートから選ぶ（打ち間違いで同じ人が2人にならないように）。
 *   端末でログインしているアカウントも一緒に残す（共用の端末なら共用のアカウントになる）。
 *
 * ★ 置き場所
 *   置場容量のスプレッドシート（生産ロット・機種・変更履歴と同じもの）に
 *   「社員」「作業記録」のシートを作る。入込場のマスタには書かない。
 *
 * ★ 出荷の進捗
 *   指図書（出荷実績データの「実績」シート。1ファイル1行）を出荷希望日ごとに並べ、
 *   チェックの状態（50kのみ。◆チェック完了のコピーから）と、作業記録の「出荷済」を付ける。
 *   段階は「指図書 → チェック完了 → 出荷済」。現場で押すのは出荷済だけ（落合さん：出荷済だけでよい）。
 *   ★ 出荷希望日の当日（と過ぎた日）は、押さなくても出荷済とみなす（10/26 落合さん「当日は出荷済み扱いで良い」）。
 *     押すのは、出荷希望日より前に出したときだけ。押した記録があればそちら（誰が・いつ）を出す。
 *
 * 名前の衝突に注意：内部関数はすべて work_ 接頭辞。
 */

var WORK_CONFIG = {
  STAFF_SHEET: '社員',
  STAFF_HEADERS: ['名前', '役割', '有効', '登録日時'],
  ROLES: ['事務', '出荷', '現場', '管理'],
  LOG_SHEET: '作業記録',
  LOG_HEADERS: ['記録ID', '日時', '名前', '種類', '対象', '本数', '元', '先', 'メモ', '取消', '取消日時', '取消した人', '端末アカウント'],
  // 記録の種類。出荷済は指図書ごと、それ以外は在庫の動き（次の段で使う）
  KINDS: ['出荷済', '入庫', '移動', '持ち出し', '廃棄'],
  // 出荷の進捗に出す範囲（出荷希望日）。今日から。
  // ★ 過ぎた日は押さなくても出荷済なので出さない（10/26 落合さん「23日になってる」）
  PAST_DAYS: 0,
  NEXT_DAYS: 7,
  BASE_CACHE: 'shipProgBase2',   // 指図書とチェックの状態（重い）。作業記録は毎回読み直す
  BASE_TTL: 600
};

var WORK_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ===== シート =====

function work_sheet_(name, headers) {
  var ss = yardGetSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 名前や依頼Noが数や日付に化けないように、全部文字として持つ
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  }
  return sh;
}

/* シートの値（1行目が見出し）→ [{見出し: 値}]。空の行は飛ばす（純関数） */
function work_table_(values) {
  if (!values || values.length < 2) return [];
  var hdr = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r.every(function (x) { return x === '' || x == null; })) continue;
    var o = {};
    hdr.forEach(function (h, j) {
      var v = r[j];
      o[h] = (v instanceof Date || (v && typeof v.getTime === 'function'))
        ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : String(v == null ? '' : v).trim();
    });
    o.__row = i + 1;
    out.push(o);
  }
  return out;
}

function work_readTable_(name, headers) {
  return work_table_(work_sheet_(name, headers).getDataRange().getValues());
}

function work_now_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'); }

function work_account_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// ===== 社員 =====

function work_staffList_(rows) {
  return rows.filter(function (r) { return r.名前 && r.有効 !== '0' && r.有効 !== 'いいえ'; })
    .map(function (r) { return { 名前: r.名前, 役割: r.役割 || '' }; });
}

/* 画面用：記録する人を選ぶための名前の一覧 */
function getWorkStaff() {
  var data = { staff: [], roles: WORK_CONFIG.ROLES, account: work_account_(), sheetUrl: null, error: null };
  try {
    data.staff = work_staffList_(work_readTable_(WORK_CONFIG.STAFF_SHEET, WORK_CONFIG.STAFF_HEADERS));
    data.sheetUrl = yardGetSpreadsheet_().getUrl();
  } catch (e) {
    data.error = String(e && e.message || e);
  }
  return data;
}

/* 名前を足す（画面から）。同じ名前（空白の違いは同じとみなす）は足さない */
function addWorkStaff(name, role) {
  var nm = work_normName_(name);
  if (!nm) throw new Error('名前を入れてください');
  if (nm.length > 20) throw new Error('名前が長すぎます');
  if (role && WORK_CONFIG.ROLES.indexOf(role) < 0) throw new Error('役割が不明です: ' + role);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = work_readTable_(WORK_CONFIG.STAFF_SHEET, WORK_CONFIG.STAFF_HEADERS);
    var same = rows.filter(function (r) { return work_normName_(r.名前) === nm; })[0];
    if (!same) {
      var sh = work_sheet_(WORK_CONFIG.STAFF_SHEET, WORK_CONFIG.STAFF_HEADERS);
      sh.getRange(sh.getLastRow() + 1, 1, 1, WORK_CONFIG.STAFF_HEADERS.length)
        .setValues([[nm, role || '現場', '1', work_now_()]]);
    }
  } finally { lock.releaseLock(); }
  return getWorkStaff();
}

function work_normName_(s) {
  return String(s || '').replace(/[\s　]+/g, ' ').trim();
}

function work_requireStaff_(name) {
  var nm = work_normName_(name);
  var ok = work_staffList_(work_readTable_(WORK_CONFIG.STAFF_SHEET, WORK_CONFIG.STAFF_HEADERS))
    .some(function (s) { return work_normName_(s.名前) === nm; });
  if (!ok) throw new Error('「記録する人」を選んでください（社員の一覧に無い名前です: ' + nm + '）');
  return nm;
}

// ===== 作業記録 =====

/* 取消されていない記録だけ（純関数） */
function work_live_(rows) {
  return rows.filter(function (r) { return r.記録ID && r.取消 !== '1'; });
}

/* 指図書ごとの出荷済（対象 → 最新の出荷済の記録）（純関数） */
function work_shippedIndex_(rows) {
  var m = {};
  work_live_(rows).forEach(function (r) {
    if (r.種類 === '出荷済') m[r.対象] = { id: r.記録ID, at: r.日時, by: r.名前 };
  });
  return m;
}

/* 記録を1行足す（ロックの中で呼ぶ） */
function work_append_(rec) {
  var sh = work_sheet_(WORK_CONFIG.LOG_SHEET, WORK_CONFIG.LOG_HEADERS);
  var id = Utilities.getUuid().slice(0, 8);
  var row = WORK_CONFIG.LOG_HEADERS.map(function (h) {
    if (h === '記録ID') return id;
    if (h === '日時') return work_now_();
    if (h === '端末アカウント') return work_account_();
    if (h === '取消' || h === '取消日時' || h === '取消した人') return '';
    var v = rec[h];
    return v == null ? '' : String(v);
  });
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return id;
}

/* 出荷済を付ける（画面から）。同じ指図書に取消されていない出荷済があれば足さない（二度押し） */
function markShipped(req) {
  req = req || {};
  var key = String(req.key || '').trim();
  if (!/^\d{2}-\d+-\d+(\(\d+\))?$/.test(key)) throw new Error('指図書が不明です: ' + key);
  var name = work_requireStaff_(req.name);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var dup = false;
  try {
    var idx = work_shippedIndex_(work_readTable_(WORK_CONFIG.LOG_SHEET, WORK_CONFIG.LOG_HEADERS));
    if (idx[key]) dup = true;
    else work_append_({ 名前: name, 種類: '出荷済', 対象: key, 本数: req.qty || '', メモ: req.memo || '' });
  } finally { lock.releaseLock(); }
  var d = getShipProgress();
  d.dupSkipped = dup;
  return d;
}

/* 記録を取り消す（行は消さない） */
function cancelWorkRecord(req) {
  req = req || {};
  var id = String(req.id || '').trim();
  if (!id) throw new Error('記録が不明です');
  var name = work_requireStaff_(req.name);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = work_sheet_(WORK_CONFIG.LOG_SHEET, WORK_CONFIG.LOG_HEADERS);
    var rows = work_table_(sh.getDataRange().getValues());
    var r = rows.filter(function (x) { return x.記録ID === id; })[0];
    if (!r) throw new Error('記録が見つかりません');
    if (r.取消 !== '1') {
      var c = WORK_CONFIG.LOG_HEADERS.indexOf('取消') + 1;
      sh.getRange(r.__row, c, 1, 3).setValues([['1', work_now_(), name]]);
    }
  } finally { lock.releaseLock(); }
  return getShipProgress();
}

// ===== 出荷の進捗 =====

/* 「実績」シートの行 → 指図書1枚ずつ（純関数）。
   同じファイル名の指図書（依頼No-枝番(版)）が何行もあれば、取り込みの新しいほうを採る。
   from〜to は出荷希望日（'yyyy-MM-dd'）。 */
function work_orders_(values, from, to) {
  var rows = work_table_(values);
  var by = {};
  rows.forEach(function (r) {
    var date = String(r.出荷希望日 || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to) return;
    if (!r.依頼No) return;
    // ★ ファイル名に「(N)」が無い指図書は、版が 0 で入っている。名前と同じく「(0)」は付けない
    //   （付けるとチェックのコピーの名前「…-0_出荷先.pdf」と突き合わなくなる）
    var ver = Number(r.バージョン) || null;
    var key = r.依頼No + '-' + (r.枝番 || '0') + (ver ? '(' + ver + ')' : '');
    var cur = by[key];
    if (cur && String(cur.取込日時) > String(r.取込日時)) return;
    by[key] = {
      key: key, no: r.依頼No, eda: Number(r.枝番) || 0, ver: ver,
      date: date, size: r.サイズ || '', qty: Number(r.数量) || 0,
      dest: r.出荷先名 || '', destCode: r.出荷先コード || '',
      url: r.fileId ? 'https://drive.google.com/file/d/' + r.fileId + '/view' : null,
      取込日時: r.取込日時
    };
  });
  return Object.keys(by).map(function (k) { var o = by[k]; delete o.取込日時; return o; });
}

/* チェックのコピー（ychk_entries_）を指図書に付ける（純関数） */
function work_attachCheck_(orders, entries) {
  var m = {};
  (entries || []).forEach(function (e) {
    m[e.orderNo + '-' + e.eda + (e.ver != null ? '(' + e.ver + ')' : '')] = e;
  });
  orders.forEach(function (o) {
    var e = m[o.key];
    o.check = e ? e.state : null;          // チェック前／チェック済／null（20kなどチェックの運用が無い）
    o.copyUrl = e ? e.url : null;
    o.fileId = e && e.state === YCHK_CONFIG.STATE_BEFORE ? e.fileId : null;  // 書き込みアプリで開く
  });
  return orders;
}

/* 出荷済を付けて日ごとにまとめる（純関数）。
   出荷希望日が今日か過ぎていれば、押した記録が無くても出荷済（auto）。 */
function work_progressDays_(orders, shipped, todayKey) {
  var byDate = {};
  orders.forEach(function (o) {
    var s = shipped[o.key];
    o.shipped = s ? { id: s.id, at: s.at, by: s.by }
      : (o.date <= todayKey ? { auto: true, at: o.date } : null);
    (byDate[o.date] = byDate[o.date] || []).push(o);
  });
  return Object.keys(byDate).sort().map(function (date) {
    var items = byDate[date].sort(function (a, b) {
      return (a.size || '').localeCompare(b.size || '') || a.no.localeCompare(b.no) ||
        (a.eda - b.eda) || ((a.ver || 0) - (b.ver || 0));
    });
    var d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
    return {
      date: date, label: (d.getMonth() + 1) + '/' + d.getDate(), weekday: WORK_WEEKDAYS[d.getDay()],
      past: date < todayKey, today: date === todayKey,
      count: items.length, shippedN: items.filter(function (o) { return o.shipped; }).length,
      qty: items.reduce(function (a, o) { return a + o.qty; }, 0),
      // ★ 画面は本数で出す（10/26 落合さん：枚数ではなく本数）
      shippedQty: items.reduce(function (a, o) { return a + (o.shipped ? o.qty : 0); }, 0),
      checkBeforeQty: items.reduce(function (a, o) { return a + (o.check === YCHK_CONFIG.STATE_BEFORE ? o.qty : 0); }, 0),
      items: items
    };
  });
}

function work_dayKey_(offset) {
  var d = new Date(Date.now() + (offset || 0) * 86400000);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/* 重いほう（指図書の一覧とチェックの状態）。先読みで作っておく */
function getShipProgressBase(force) {
  return nc_cached_(WORK_CONFIG.BASE_CACHE, force === true, WORK_CONFIG.BASE_TTL, function () {
    var from = work_dayKey_(-WORK_CONFIG.PAST_DAYS), to = work_dayKey_(WORK_CONFIG.NEXT_DAYS);
    var sheet = shipact_getSheet_();
    var orders = work_orders_(sheet.getDataRange().getValues(), from, to);
    var entries = [];
    try { entries = ychk_entries_('50k'); } catch (e) { Logger.log('チェックの状態が読めない: ' + e); }
    work_attachCheck_(orders, entries);
    return { updated: work_now_(), from: from, to: to, orders: orders, error: null };
  });
}

/* 画面用：出荷の進捗。作業記録は毎回読み直す（押した直後に必ず反映されるように） */
function getShipProgress(force) {
  var data = { updated: work_now_(), today: work_dayKey_(0), days: [], error: null };
  try {
    var base = getShipProgressBase(force === true);
    if (base.error) { data.error = base.error; return data; }
    var orders = JSON.parse(JSON.stringify(base.orders || []));
    var shipped = work_shippedIndex_(work_readTable_(WORK_CONFIG.LOG_SHEET, WORK_CONFIG.LOG_HEADERS));
    data.days = work_progressDays_(orders, shipped, data.today);
    data.from = base.from; data.to = base.to;
  } catch (e) {
    data.error = String(e && e.message || e);
    Logger.log('出荷の進捗でエラー: ' + data.error);
  }
  return data;
}
