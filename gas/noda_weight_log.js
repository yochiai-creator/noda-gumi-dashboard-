/**
 * 野田組 業務ダッシュボード — 重量転記アプリ（LPG容器 質量転記アプリ）の記録から生産数とロットを作る
 * ------------------------------------------------------------------
 * ★ 2026/11/01 落合さん「重量転記アプリのログで生産数がわかる」
 *   重量転記アプリ（リポジトリ lpg-weight-app、スプレッドシート「LPG容器_質量入力」）は、
 *   流れてきた容器を1本ずつ量って「入力記録」に1行ずつ残している（容器番号・入力日時・容器区分）。
 *   量った＝作った、なので、これで
 *     ① 日ごとの生産本数（容器区分ごと）… 「生産実績」シートに貯める（計画と比べる・推移を見る）
 *     ② 生産の流れのロット（未受検）… 手で登録しなくても、量った容器番号から自動で作る
 *   を作る。重量転記アプリのスプレッドシートは読むだけ（書き込まない）。
 *
 * ★ 数え方は重量転記アプリの「採番表」（その日に流れた容器）と同じ
 *   状態が「有効」で、区分が 欠番・訂正・ダブり でないもの。備考「採番なし」と底黒（再搬入）は除く。
 *   同じ容器が2回出てきたら（量り直し）最初に量った日に1本と数える。
 *
 * ★ 入力記録の末尾だけ読む（年に37万行になるため）。読んだ範囲の最初の日は途中から
 *   かもしれないので、その日は書き直さない（前に貯めた数を残す）。
 *
 * ★ ロットの作り方
 *   生産日・記号（HEP等）・容器区分ごとに番号を並べ、番号が続いているところを1ロットにする。
 *   欠番などの小さな飛び（GAP本まで）はつなぐ（本数は量った本数。範囲の長さではない）。
 *   毎時見直し、量った本数が増えたら：
 *     ・まだ置場に置いていない未受検の自動ロット … 範囲と本数を広げる
 *     ・置いた後 … 範囲の外に増えたぶんは新しいロット、範囲の中で増えたぶんは本数と置場に足す
 *   手で登録したロット（番号が重なるもの）には触らず、その番号は作らない。
 *   自動ロットを「打ち間違い」で取り消したら、その番号は作り直さない。
 *   AUTO_FROM より前に量った容器はロットにしない（それまでの在庫は置場の本数に入っているため）。
 *
 * 名前の衝突に注意：内部関数はすべて wlog_ 接頭辞。
 */

var WLOG_CONFIG = {
  SS_ID: '1h0VM9ECv1NnSuwuo2jxTaiPVC6o5oYwWi1lZ9Qx1hms',   // LPG容器_質量入力（重量転記アプリの記録先）
  LOG_SHEET: '入力記録',
  LOT_SHEET: 'ロット',
  TAIL_ROWS: 20000,          // 末尾から読む行数（1日最大2,000本ほど → 10日ぶん）
  DAILY_SHEET: '生産実績',    // ダッシュボード側（置場容量のスプレッドシート）に貯める
  DAILY_HEADERS: ['日付', '容器区分', 'サイズ', '本数', '更新日時'],
  AUTO_FROM: '2026-11-01',   // これより前に量った容器はロットにしない
  GAP: 10,                   // 番号の飛びがこれ以下ならつなぐ（欠番・修正など）
  /* ★ 20kg のパレット（2026/11/02 落合さん）：36本のるパレットに、100本を3枚に分ける。
       満タン2枚＝72本 と バラ28本。満タンは「15 風呂場跡」に置く、バラは「11・19・18」のどれかに置く。
       どの番号がどちらかは、100本の組の 01〜72 を満タン、73〜00 をバラとする。
       満タンのロットは作った時点で15に置く（置場の本数に足す）。バラは現場が置場を選ぶ（画面で11・19・18を先に出す）。
       ★ 置場の番号を変えたら、ここも直すこと。 */
  PALLET20: { FULL: 72, FULL_PLACE: '15', BARA_PLACES: ['11', '19', '18'] },
  AUTO_WHO: '（自動：重量転記）',
  AUTO_NOTE: '重量転記アプリで量った容器から自動',
  SKIP_KINDS: ['欠番', '訂正', 'ダブり'],
  SOKO: '底黒'
};

/* 容器区分 → 置場容量のサイズ（20kg三部制 → 20kg、50kg S付 → 50kg）。列の無いもの（8kg等）は '' */
function wlog_size_(kind) {
  var m = String(kind || '').match(/^(20|30|50)kg/);
  return m ? m[1] + 'kg' : '';
}

/* 日付を yyyy-MM-dd に（Date でも '2026/10/30 9:05:12' でも） */
function wlog_day_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  var m = String(v || '').match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

/* 入力記録の行から、量った容器を取り出す（純関数）。
   head … 見出しの行、values … データ行、sokoLots … 底黒のロットID（重量転記アプリのロットの「仕様」） */
function wlog_rows_(head, values, sokoLots) {
  var H = {};
  (head || []).forEach(function (h, i) { H[String(h).trim()] = i; });
  var need = ['入力日時', 'ロットID', '容器番号', '容器区分', '区分', '状態'];
  for (var k = 0; k < need.length; k++) if (H[need[k]] == null) throw new Error('入力記録に「' + need[k] + '」の列がありません');
  var out = [];
  (values || []).forEach(function (r) {
    if (String(r[H['状態']]) !== '有効') return;
    var kind = String(r[H['区分']] || '');
    if (WLOG_CONFIG.SKIP_KINDS.indexOf(kind) >= 0 || kind === WLOG_CONFIG.SOKO) return;
    if (H['備考'] != null && String(r[H['備考']] || '') === '採番なし') return;
    if (sokoLots && sokoLots[String(r[H['ロットID']])]) return;
    var m = String(r[H['容器番号']] || '').replace(/^'/, '').trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!m) return;
    var day = wlog_day_(r[H['入力日時']]);
    if (!day) return;
    out.push({ day: day, pre: m[1], num: Number(m[2]), width: m[2].length, kind: String(r[H['容器区分']] || '') });
  });
  return out;
}

/* 同じ容器は最初に量った日に1本（純関数）。入力記録は時刻順に足されていく */
function wlog_firstSeen_(rows) {
  var seen = {}, out = [];
  (rows || []).forEach(function (r) {
    var key = r.pre + ':' + r.num;
    if (seen[key]) { if (r.day < seen[key].day) seen[key].day = r.day; return; }
    seen[key] = r; out.push(r);
  });
  return out;
}

/* 日・容器区分ごとの本数（純関数）。after より後の日だけ（読んだ範囲の最初の日は途中からなので除く） */
function wlog_daily_(list, after) {
  var t = {};
  (list || []).forEach(function (r) {
    if (after && r.day <= after) return;
    var k = r.day + '|' + r.kind;
    t[k] = t[k] || { 日付: r.day, 容器区分: r.kind, サイズ: wlog_size_(r.kind), 本数: 0 };
    t[k].本数++;
  });
  return Object.keys(t).sort().map(function (k) { return t[k]; });
}

/* 番号を続きごとに分ける（純関数）。gap 本までの飛びはつなぐ。[[開始, 終了, 本数], …] */
function wlog_runs_(nums, gap) {
  var s = (nums || []).slice().sort(function (a, b) { return a - b; });
  var out = [];
  s.forEach(function (n, i) {
    if (i > 0 && n === s[i - 1]) return;
    var last = out[out.length - 1];
    if (last && n - last[1] <= (gap || 0) + 1) { last[1] = n; last[2]++; }
    else out.push([n, n, 1]);
  });
  return out;
}

function wlog_pad_(n, width) {
  var s = String(n);
  while (s.length < (width || 0)) s = '0' + s;
  return s;
}

/* 自動ロットを作る・広げる（純関数）。何をするかだけ返す。
   list … wlog_firstSeen_ の結果、lots … 生産ロット（lot_readAll_ の形）
   返す：[{ op:'create', 生産日, pre, kind, size, a, b, n, width } | { op:'update', id, a, b, n, add, 置場番号 }] */
function wlog_plan_(list, lots, from) {
  var acts = [];
  var groups = {};
  /* ★ 100本の組（重量転記アプリの成績表の単位）ごとに、量り始めた日を見る。始める日より前に量り始めた組の
       残りを後から量っても、新しい生産ではない（11/2 HHF96640 の1本だけのロットができた）ので作らない。 */
  var started = {};
  (list || []).forEach(function (r) {
    var gk = r.pre + ':' + Math.floor((r.num - 1) / 100);
    if (!started[gk] || r.day < started[gk]) started[gk] = r.day;
  });
  (list || []).forEach(function (r) {
    if (r.day < (from || WLOG_CONFIG.AUTO_FROM)) return;
    if (started[r.pre + ':' + Math.floor((r.num - 1) / 100)] < (from || WLOG_CONFIG.AUTO_FROM)) return;
    var k = r.day + '|' + r.pre + '|' + r.kind;
    (groups[k] = groups[k] || { day: r.day, pre: r.pre, kind: r.kind, width: r.width, nums: [] }).nums.push(r.num);
  });
  var isAuto = function (l) { return String(l.登録者 || '') === WLOG_CONFIG.AUTO_WHO; };
  var C = (typeof LOT_CONFIG !== 'undefined' && LOT_CONFIG.CANCELLED) || '取消';
  Object.keys(groups).sort().forEach(function (k) {
    var g = groups[k];
    var same = (lots || []).filter(function (l) { return String(l.容器接頭辞).toUpperCase() === g.pre; });
    // 番号をふさぐロット：手で登録したもの（取消は除く）と、自動のもの（取り消したものも。作り直さない）
    var mine = function (l) { return isAuto(l) && l.状態 !== C && l.生産日 === g.day && l.機種名 === g.kind; };
    /* ★ 20kg を満タン・バラに分けるようにした（11/2）前にできたロット（4401〜4981 のように組をまたぐもの）は、
         広げずに「ふさぐ」側に回す。広げる候補にも、ふさぐ側にも入らないと、同じ番号でロットを作り直してしまう
         （11/2 に L20261102-006 と分けたロットが重なった）。 */
    var split = wlog_size_(g.kind) === '20kg';
    var segOf = function (n) { var F = WLOG_CONFIG.PALLET20.FULL; return Math.floor((n - 1) / 100) * 2 + ((n - 1) % 100 < F ? 0 : 1); };
    var oneSeg = function (l) { return !split || segOf(Number(l.容器No開始)) === segOf(Number(l.容器No終了)); };
    var growable = function (l) { return mine(l) && l.状態 === '未受検' && !l.置場番号 && !(Number(l.出荷済本数) > 0) && oneSeg(l); };
    // 取り消したロットは後ろに（同じ番号に生きているロットがあれば、そちらで数える）
    var blocks = same.filter(function (l) { return !growable(l) && (l.状態 !== C || isAuto(l)); })
      .sort(function (x, y) { return (x.状態 === C ? 1 : 0) - (y.状態 === C ? 1 : 0); });
    var inBlock = function (n) {
      for (var i = 0; i < blocks.length; i++) {
        if (n >= Number(blocks[i].容器No開始) && n <= Number(blocks[i].容器No終了)) return blocks[i];
      }
      return null;
    };
    // 置いた後の自動ロット：範囲の中で増えたぶんは本数に足す
    var counted = {};
    g.nums.forEach(function (n) {
      var b = inBlock(n);
      if (b && mine(b)) counted[b.ロットID] = (counted[b.ロットID] || 0) + 1;
    });
    Object.keys(counted).forEach(function (id) {
      var l = blocks.filter(function (x) { return x.ロットID === id; })[0];
      if (counted[id] > Number(l.本数)) {
        acts.push({ op: 'update', id: id, a: Number(l.容器No開始), b: Number(l.容器No終了), n: counted[id],
                    add: counted[id] - Number(l.本数), 置場番号: l.置場番号 || '' });
      }
    });
    var free = g.nums.filter(function (n) { return !inBlock(n); });
    var grow = same.filter(growable);
    // 20kg は100本の組ごとに 満タン（01〜72）とバラ（73〜00）に分けて、別々のロットにする
    var segs = wlog_segments_(free, wlog_size_(g.kind) === '20kg');
    segs.forEach(function (sg) {
    wlog_runs_(sg.nums, WLOG_CONFIG.GAP).forEach(function (run) {
      // 広げられる自動ロット（範囲が重なるか、GAP以内で隣り合うもの）。分けたときは同じ区切りの中のものだけ
      var e = grow.filter(function (l) {
        if (sg.lo != null && (Number(l.容器No開始) < sg.lo || Number(l.容器No終了) > sg.hi)) return false;
        return run[0] <= Number(l.容器No終了) + WLOG_CONFIG.GAP + 1 && Number(l.容器No開始) <= run[1] + WLOG_CONFIG.GAP + 1;
      })[0];
      if (e) {
        var a = Math.min(Number(e.容器No開始), run[0]), b = Math.max(Number(e.容器No終了), run[1]);
        var n = free.filter(function (x) { return x >= a && x <= b; }).length;
        var prev = acts.filter(function (x) { return x.op === 'update' && x.id === e.ロットID; })[0];
        if (prev) { prev.a = Math.min(prev.a, a); prev.b = Math.max(prev.b, b); prev.n = free.filter(function (x) { return x >= prev.a && x <= prev.b; }).length; return; }
        if (a !== Number(e.容器No開始) || b !== Number(e.容器No終了) || n !== Number(e.本数)) {
          acts.push({ op: 'update', id: e.ロットID, a: a, b: b, n: n, add: 0, 置場番号: '' });
        }
        return;
      }
      acts.push({ op: 'create', 生産日: g.day, pre: g.pre, kind: g.kind, size: wlog_size_(g.kind),
                  a: run[0], b: run[1], n: run[2], width: g.width, part: sg.part || '',
                  place: sg.part === '満タン' ? WLOG_CONFIG.PALLET20.FULL_PLACE : '' });
    });
    });
  });
  return acts;
}

/* 番号を区切りに分ける（純関数）。split が false なら1つ（区切りなし）。
   true なら100本の組ごとに 満タン（01〜FULL）と バラ（FULL+1〜00）。[{ part, lo, hi, nums }] */
function wlog_segments_(nums, split) {
  if (!split) return [{ part: '', lo: null, hi: null, nums: (nums || []).slice() }];
  var F = WLOG_CONFIG.PALLET20.FULL, m = {}, out = [];
  (nums || []).forEach(function (n) {
    var g = Math.floor((n - 1) / 100), full = (n - 1) % 100 < F, k = g * 2 + (full ? 0 : 1);
    if (!m[k]) { m[k] = { part: full ? '満タン' : 'バラ', lo: g * 100 + (full ? 1 : F + 1), hi: g * 100 + (full ? F : 100), nums: [] }; out.push(m[k]); }
    m[k].nums.push(n);
  });
  out.sort(function (a, b) { return a.lo - b.lo; });
  return out;
}

// ===== 読む =====
function wlog_ss_() { return SpreadsheetApp.openById(WLOG_CONFIG.SS_ID); }

/* 入力記録の末尾を読む。{ head, values, firstDay } */
function wlog_readTail_(ss) {
  var sh = ss.getSheetByName(WLOG_CONFIG.LOG_SHEET);
  if (!sh) throw new Error('重量転記アプリの「' + WLOG_CONFIG.LOG_SHEET + '」シートがありません');
  var last = sh.getLastRow(), width = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, width).getValues()[0];
  if (last < 2) return { head: head, values: [], firstDay: '', all: true };
  var from = Math.max(2, last - WLOG_CONFIG.TAIL_ROWS + 1);
  var values = sh.getRange(from, 1, last - from + 1, width).getValues();
  var ti = head.map(String).indexOf('入力日時');
  var firstDay = from > 2 && values.length > 0 ? wlog_day_(values[0][ti]) : '';
  return { head: head, values: values, firstDay: firstDay, all: from === 2 };
}

/* 底黒（再搬入）のロット。重量転記アプリのロットの「仕様」 */
function wlog_sokoLots_(ss) {
  var sh = ss.getSheetByName(WLOG_CONFIG.LOT_SHEET);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var id = v[0].map(String).indexOf('ロットID'), sp = v[0].map(String).indexOf('仕様');
  if (id < 0 || sp < 0) return out;
  for (var i = 1; i < v.length; i++) if (String(v[i][sp]) === WLOG_CONFIG.SOKO) out[String(v[i][id])] = true;
  return out;
}

// ===== 毎時（harvestDailyData から） =====
function syncWeightLog() {
  var out = { 読んだ行: 0, 容器: 0, 日: 0, 作った: 0, 広げた: 0, error: null };
  try {
    var ss = wlog_ss_();
    var tail = wlog_readTail_(ss);
    var list = wlog_firstSeen_(wlog_rows_(tail.head, tail.values, wlog_sokoLots_(ss)));
    out.読んだ行 = tail.values.length; out.容器 = list.length;
    var daily = wlog_daily_(list, tail.all ? '' : tail.firstDay);
    out.日 = wlog_saveDaily_(daily, tail.all ? '' : tail.firstDay);
    var r = wlog_applyLots_(wlog_plan_(list, lot_readAll_(), WLOG_CONFIG.AUTO_FROM));
    out.作った = r.作った; out.広げた = r.広げた;
    if (r.error) out.error = r.error;
  } catch (err) {
    out.error = String(err && err.message || err);
    Logger.log('重量転記アプリの取込でエラー: ' + out.error);
  }
  return out;
}

/* 生産実績シートに書く。読んだ範囲の日だけ入れ替える（それより前の日は残す） */
function wlog_saveDaily_(daily, after) {
  var ss = yardGetSpreadsheet_();
  var sh = ss.getSheetByName(WLOG_CONFIG.DAILY_SHEET) || ss.insertSheet(WLOG_CONFIG.DAILY_SHEET);
  var W = WLOG_CONFIG.DAILY_HEADERS.length;
  var old = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, W).getValues() : [];
  var days = {};
  daily.forEach(function (d) { days[d.日付] = true; });
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var keep = old.filter(function (r) {
    var d = wlog_day_(r[0]);
    if (!d) return false;
    if (days[d]) return false;                  // 読み直した日は入れ替える
    if (after === '' ) return false;            // 全部読めたときは全部入れ替える
    return d <= after;                          // 読んだ範囲より前の日だけ残す
  }).map(function (r) { return [wlog_day_(r[0]), r[1], r[2], r[3], r[4]]; });
  var rows = keep.concat(daily.map(function (d) { return [d.日付, d.容器区分, d.サイズ, d.本数, now]; }));
  rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : String(a[1]) < String(b[1]) ? -1 : 1; });
  sh.clearContents();
  sh.getRange(1, 1, 1, W).setValues([WLOG_CONFIG.DAILY_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, rows.length, W).setValues(rows);
  }
  return daily.length;
}

/* 自動ロットを書く */
function wlog_applyLots_(acts) {
  var out = { 作った: 0, 広げた: 0, error: null };
  if (!acts || acts.length === 0) return out;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = lot_sheet_();
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    acts.forEach(function (x) {
      try {
        if (x.op === 'create') {
          var id = lot_newId_(sheet);
          var row = LOT_CONFIG.HEADERS.map(function () { return ''; });
          var put = function (h, v) { row[LOT_CONFIG.HEADERS.indexOf(h)] = v; };
          put('ロットID', id); put('生産日', x.生産日); put('機種名', x.kind); put('サイズ', x.size);
          put('容器接頭辞', x.pre); put('容器No開始', "'" + wlog_pad_(x.a, x.width)); put('容器No終了', "'" + wlog_pad_(x.b, x.width));
          put('本数', x.n); put('状態', '未受検'); put('出荷済本数', 0);
          put('備考', WLOG_CONFIG.AUTO_NOTE + (x.part ? '・' + x.part + (x.part === 'バラ' ? '（' + WLOG_CONFIG.PALLET20.BARA_PLACES.join('・') + 'のどれかに置く）' : '（パレット満タン）') : ''));
          put('登録者', WLOG_CONFIG.AUTO_WHO); put('登録日時', now); put('更新日時', now);
          sheet.appendRow(row);
          out.作った++;
          // 満タンのパレットは決まった置場に置く（置いた時点で置場の本数に足し、作業記録に入庫）
          if (x.place && typeof placeProdLot === 'function') {
            var pr = placeProdLot(id, x.place);
            if (pr && pr.ok === false) out.error = 'ロット ' + id + ' を置場 ' + x.place + ' に置けませんでした：' + pr.error;
          }
          return;
        }
        var found = lot_findRow_(x.id);
        if (!found) return;
        var cur = found.lot;
        var width = String(cur.容器No開始).length;
        // 置いた後に範囲の中で増えたぶんは、置場にも足す
        if (x.add > 0 && cur.置場番号) {
          var mv = lot_yardMove_(cur.置場番号, cur.サイズ, x.add);
          if (mv.error) { out.error = mv.error; return; }
          if (mv.反映 && typeof wstock_logFromLot_ === 'function') {
            wstock_logFromLot_('入庫', cur, null, lot_findLocation_(cur.置場番号), x.add,
              'ロット ' + cur.ロットID + ' に重量転記で量った ' + x.add + '本を足した', WLOG_CONFIG.AUTO_WHO);
          }
        }
        lot_writeRow_(found.rowNo, function (row, H) {
          row[H['容器No開始']] = "'" + wlog_pad_(x.a, width);
          row[H['容器No終了']] = "'" + wlog_pad_(x.b, width);
          row[H['本数']] = x.n;
          row[H['更新日時']] = now;
        });
        out.広げた++;
      } catch (e) {
        out.error = String(e && e.message || e);
        Logger.log('自動ロットでエラー: ' + out.error);
      }
    });
  } finally {
    lock.releaseLock();
  }
  return out;
}

// ===== 画面用：生産の実績（日別・容器区分別） =====
function getProdActuals(days) {
  var out = { updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
              days: [], months: [], today: null, month: null, error: null };
  try {
    var sh = yardGetSpreadsheet_().getSheetByName(WLOG_CONFIG.DAILY_SHEET);
    if (!sh || sh.getLastRow() < 2) return out;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, WLOG_CONFIG.DAILY_HEADERS.length).getValues();
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var r = wlog_shape_(v, today, days || 62);
    out.days = r.days; out.months = r.months; out.today = r.today; out.month = r.month; out.syncedAt = r.syncedAt;
  } catch (err) {
    out.error = String(err && err.message || err);
  }
  return out;
}

/* 生産実績シートの行 → 画面の形（純関数）。
   days … [{日付, 合計, 50kg, 20kg, 30kg, その他, 区分:{容器区分:本数}}]（新しい日から n 日ぶん、古い順）
   months … [{月, 合計, 50kg, 20kg, 30kg, その他}]、today・month … 今日・今月のぶん */
function wlog_shape_(values, today, n) {
  var byDay = {}, byMonth = {}, synced = '';
  var add = function (o, size, kind, q) {
    var k = size || 'その他';
    o[k] = (o[k] || 0) + q; o.合計 += q;
    o.区分[kind] = (o.区分[kind] || 0) + q;
  };
  (values || []).forEach(function (r) {
    var d = wlog_day_(r[0]); if (!d) return;
    var q = Number(r[3]) || 0;
    var dd = byDay[d] = byDay[d] || { 日付: d, 合計: 0, '50kg': 0, '20kg': 0, '30kg': 0, その他: 0, 区分: {} };
    add(dd, String(r[2] || ''), String(r[1] || ''), q);
    var m = d.slice(0, 7);
    var mm = byMonth[m] = byMonth[m] || { 月: m, 合計: 0, '50kg': 0, '20kg': 0, '30kg': 0, その他: 0, 区分: {}, 日数: 0 };
    add(mm, String(r[2] || ''), String(r[1] || ''), q);
    var at = r[4] instanceof Date ? Utilities.formatDate(r[4], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : String(r[4] || '');
    if (at > synced) synced = at;
  });
  Object.keys(byDay).forEach(function (d) { byMonth[d.slice(0, 7)].日数++; });
  var days = Object.keys(byDay).sort().map(function (d) { return byDay[d]; });
  return {
    days: days.slice(-n),
    months: Object.keys(byMonth).sort().map(function (m) { return byMonth[m]; }),
    today: byDay[today] || null,
    month: byMonth[String(today).slice(0, 7)] || null,
    syncedAt: synced
  };
}

/* エディタから：今すぐ取り込む（何をしたかをログに出す） */
function 重量転記アプリから生産数とロットを取り込む() {
  Logger.log(JSON.stringify(syncWeightLog()));
}

/* エディタから：何も書き換えずに、取り込んだらどうなるかを見る */
function 重量転記アプリの取込を試す() {
  var ss = wlog_ss_();
  var tail = wlog_readTail_(ss);
  var list = wlog_firstSeen_(wlog_rows_(tail.head, tail.values, wlog_sokoLots_(ss)));
  var daily = wlog_daily_(list, tail.all ? '' : tail.firstDay);
  var acts = wlog_plan_(list, lot_readAll_(), WLOG_CONFIG.AUTO_FROM);
  Logger.log('読んだ行 ' + tail.values.length + '（最初の日 ' + (tail.firstDay || '全部') + '）・容器 ' + list.length);
  daily.slice(-10).forEach(function (d) { Logger.log(d.日付 + ' ' + d.容器区分 + ' ' + d.本数 + '本'); });
  acts.forEach(function (a) { Logger.log(JSON.stringify(a)); });
}
