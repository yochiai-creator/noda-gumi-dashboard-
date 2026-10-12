/**
 * 野田組 業務ダッシュボード — 入込場の区画に「チェック前／チェック済」を出す（50kのみ）
 * ------------------------------------------------------------------
 * ★ どこを見るのか
 *   指図書の振り分けスクリプトが、指図書PDFのコピーを2か所に置いている。
 *     ◆容器種類別 / 50Ｋ                       … チェック前
 *     ◆チェック完了 / 2026年 / 10月 / 50Ｋ      … チェック済
 *   コピーの名前は「26.10.16_26-40377-0(3)_出荷先.pdf」。
 *   ファイルの説明欄に、振り分けのときに読んだ容器No・数量・品名が書いてある。
 *     得意先コード:0190 / 数量:60 / 容器No:HEP65201~HEP65260 / 品名:… / 容器サイズ:50
 *
 * ★ 区画とどう結び付けるか
 *   ① 区画に付いている依頼No（手入力・容器番号で当てたもの）と同じ依頼Noのファイル
 *   ② 説明欄の容器Noの範囲が、区画の容器番号の範囲と重なるファイル
 *   1つの依頼Noが枝番で何枚にも分かれ、別々の区画に置かれることがある
 *   （26-40377 は (1)(2)(3) の3枚）。範囲が読めているファイルは、範囲が区画と
 *   重なるときだけその区画のものとする。範囲が無いファイルは依頼Noだけで結ぶ。
 *
 * ★ 説明欄の容器Noも読み取りの結果なので化けることがある。
 *   範囲の本数が数量と一致したときだけ範囲を信じる（合わなければ範囲は使わない）。
 *
 * ★ 区画の状態
 *   結び付いたファイルが全部チェック済 → チェック済
 *   一部だけ                           → 一部チェック済
 *   全部チェック前                     → チェック前
 *   結び付くファイルが無い              → 何も出さない
 *
 * ★ 20kはまだ。チェック完了の側に 20Ｋ のフォルダが無いため（2026/10/11 時点）。
 *
 * 名前の衝突に注意：内部関数はすべて ychk_ 接頭辞。
 */

var YCHK_CONFIG = {
  UNCHECKED_ROOT: '1qCpeKIO3gvPWkVDqXApVREDEiWKU_3D6',  // ◆容器種類別
  CHECKED_ROOT: '1fbx7-m2RHcFSA66I7b0nk8UmjBJ8BlPE',    // ◆チェック完了
  SIZE_FOLDER: { '50k': '50K' },                        // 全角の「50Ｋ」も通す（名前はNFKCでそろえて比べる）
  STATE_BEFORE: 'チェック前',
  STATE_DONE: 'チェック済',
  STATE_PART: '一部チェック済'
};

// ===== 純関数 =====

/* 「26.10.16_26-40377-0(3)_出荷先.pdf」→ 依頼No・枝番・版・出荷希望日 */
function ychk_parseName_(name) {
  var m = String(name || '').match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})_(\d{2}-\d+)-(\d+)(?:\((\d+)\))?/);
  if (!m) return null;
  var p2 = function (x) { return (Number(x) < 10 ? '0' : '') + Number(x); };
  return {
    orderNo: m[4], eda: Number(m[5]), ver: m[6] ? Number(m[6]) : null,
    shipDate: Number(m[2]) + '/' + Number(m[3]),
    dateKey: '20' + m[1] + '-' + p2(m[2]) + '-' + p2(m[3])
  };
}

/* 説明欄から容器Noの範囲と数量。範囲は本数が数量と合うときだけ採る。 */
function ychk_parseDesc_(desc) {
  var t = String(desc || '');
  var out = { qty: null, a: null, b: null, prefix: null, ra: null, rb: null };
  var q = t.match(/数量\s*[:：]\s*(\d+)/);
  if (q) out.qty = Number(q[1]);
  var r = t.match(/容器No\s*[:：]\s*([A-Z]{2,5})(\d{5})\s*[~～〜\-]\s*(?:[A-Z]{2,5})?(\d{5})/i);
  if (r) {
    var a = Number(r[2]), b = Number(r[3]);
    // 数量が読めなくても、ありそうな範囲は「この区画ではない」の手がかりには使う
    if (b >= a && b - a + 1 <= 200) { out.ra = a; out.rb = b; }
    if (out.qty != null && b >= a && b - a + 1 === out.qty) {
      out.a = a; out.b = b; out.prefix = r[1].toUpperCase();
    }
  }
  return out;
}

/* ファイル1つぶんをまとめる。名前が読めないものは null。 */
function ychk_entry_(file, state) {
  var n = ychk_parseName_(file.name);
  if (!n) return null;
  var d = ychk_parseDesc_(file.description);
  return {
    orderNo: n.orderNo, eda: n.eda, ver: n.ver, shipDate: n.shipDate, dateKey: n.dateKey,
    a: d.a, b: d.b, ra: d.ra, rb: d.rb, qty: d.qty, state: state,
    url: file.url || null, name: file.name
  };
}

/* 同じ指図書（依頼No・枝番・版）が両方にあったらチェック済を採る。 */
function ychk_dedupe_(entries) {
  var by = {};
  var order = [];
  entries.forEach(function (e) {
    if (!e) return;
    var k = e.orderNo + '-' + e.eda + '(' + (e.ver == null ? '' : e.ver) + ')';
    if (!by[k]) { by[k] = e; order.push(k); return; }
    if (e.state === YCHK_CONFIG.STATE_DONE) by[k] = e;
  });
  return order.map(function (k) { return by[k]; });
}

/* 枝番と版の見出し。「-0(1)」→「(1)」、「-1(2)」→「-1(2)」、版なし →「」 */
function ychk_banLabel_(f) {
  return (f.eda ? '-' + f.eda : '') + (f.ver != null ? '(' + f.ver + ')' : '');
}

function ychk_bare_(no) { return String(no || '').replace(/^\d{2}-/, ''); }

function ychk_combine_(states) {
  if (states.length === 0) return null;
  var done = states.filter(function (s) { return s === YCHK_CONFIG.STATE_DONE; }).length;
  if (done === states.length) return YCHK_CONFIG.STATE_DONE;
  if (done > 0) return YCHK_CONFIG.STATE_PART;
  return YCHK_CONFIG.STATE_BEFORE;
}

/* 区画（50kだけ）にチェックの状態を付ける。raw は getYardMapUpdatesBoth の形。 */
function ychk_attachToBlocks_(raw, entries, sizeKey, todayKey) {
  sizeKey = sizeKey || '50k';
  if (!todayKey) todayKey = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  (raw[sizeKey] || []).forEach(function (r) {
    if (!r || !r.found) return;
    if (!r.orders) r.orders = [];
    var hasRng = r.rangeStart != null && r.rangeEnd != null && r.rangeStart !== '' && r.rangeEnd !== '';
    var ra = hasRng ? Number(r.rangeStart) : NaN, rb = hasRng ? Number(r.rangeEnd) : NaN;
    var rngOk = !isNaN(ra) && !isNaN(rb) && ra > 0;   // 空き区画は -99〜0 が入っている

    var mine = {};
    r.orders.forEach(function (o) { mine[ychk_bare_(o.no)] = o; });

    var rel = [];   // この区画のファイル
    entries.forEach(function (e) {
      var overlap = rngOk && e.a != null && e.a <= rb && ra <= e.b;
      var byNo = !!mine[ychk_bare_(e.orderNo)];
      // ★ 出荷希望日が過ぎたものは、番号の重なりだけでは付けない（もう出て行った）
      if (overlap && !byNo && e.dateKey && e.dateKey < todayKey) overlap = false;
      /* ★ 数量が読めず範囲を信じきれないファイルでも、範囲が区画と重ならないなら
           依頼Noが同じでもこの区画のものではない（26-60821 (3) は 59708〜59721 で <7>）。 */
      if (byNo && e.a == null && e.ra != null && rngOk && !(e.ra <= rb && ra <= e.rb)) byNo = false;
      // 範囲が読めているファイルは、範囲が重なるときだけこの区画のもの
      if (e.a != null ? overlap : byNo) rel.push(e);
    });
    if (rel.length === 0) return;

    // 依頼Noごとにまとめて、区画の注文に状態を付ける。無ければ足す（番号で当てたもの）
    var perNo = {};
    rel.forEach(function (e) {
      var k = ychk_bare_(e.orderNo);
      (perNo[k] = perNo[k] || []).push(e);
    });
    /* ★ 枝番ごとにボタンを分け、それぞれのコピーを開く。
         1つの依頼Noに1つのボタンだと、元の指図書（書き込みの無いもの）の、しかも
         別の区画の枝番が開いていた（<3> で 26-60821 を押すと、<7> にある (3) の
         書き込みの無い元PDFが開き「チェック済なのにチェックされていない」と見えた）。
         ◆チェック完了 のコピーには書き込み（チェックの印・押印）がある。 */
    Object.keys(perNo).forEach(function (k) {
      var files = perNo[k].slice().sort(function (x, y) {
        return (x.eda - y.eda) || ((x.ver || 0) - (y.ver || 0));
      });
      var o = mine[k];
      if (!o) {
        o = { no: files[0].orderNo, src: '番号', url: null, date: files[0].shipDate };
        r.orders.push(o);
        mine[k] = o;
      }
      var at = r.orders.indexOf(o);
      files.forEach(function (f, i) {
        var one = i === 0 ? o : { no: o.no, src: o.src };
        one.ban = ychk_banLabel_(f);
        one.url = f.url || one.url || null;
        one.check = f.state;
        one.date = f.shipDate;
        if (i > 0) r.orders.splice(at + i, 0, one);
      });
    });
    r.check = ychk_combine_(rel.map(function (e) { return e.state; }));
  });
  return raw;
}

// ===== Drive から読む =====

function ychk_norm_(s) {
  try { return String(s || '').normalize('NFKC').replace(/\s/g, ''); } catch (e) { return String(s || ''); }
}

function ychk_list_(q, fields) {
  var out = [];
  var token = null;
  do {
    var res = Drive.Files.list({
      q: q, fields: 'nextPageToken, files(' + fields + ')', pageSize: 1000,
      supportsAllDrives: true, includeItemsFromAllDrives: true, pageToken: token || undefined
    });
    (res.files || []).forEach(function (f) { out.push(f); });
    token = res.nextPageToken;
  } while (token);
  return out;
}

/* 親フォルダの直下から、名前（全角半角をそろえて）が一致するフォルダ */
function ychk_subFolder_(parentId, name) {
  var want = ychk_norm_(name);
  var hits = ychk_list_("'" + parentId + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                        'id, name');
  for (var i = 0; i < hits.length; i++) if (ychk_norm_(hits[i].name) === want) return hits[i].id;
  return null;
}

function ychk_pdfsIn_(folderId) {
  return ychk_list_("'" + folderId + "' in parents and mimeType = 'application/pdf' and trashed = false",
                    'id, name, description, webViewLink')
    .map(function (f) { return { name: f.name, description: f.description, url: f.webViewLink }; });
}

/* 50kのコピーを全部集める。チェック完了は先月・今月・来月を見る
   （月の変わり目をまたいで置かれている区画があるため）。 */
function ychk_entries_(sizeKey) {
  var sizeName = YCHK_CONFIG.SIZE_FOLDER[sizeKey];
  if (!sizeName) return [];
  var entries = [];

  var before = ychk_subFolder_(YCHK_CONFIG.UNCHECKED_ROOT, sizeName);
  if (before) ychk_pdfsIn_(before).forEach(function (f) { entries.push(ychk_entry_(f, YCHK_CONFIG.STATE_BEFORE)); });

  var now = new Date();
  var y = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'));
  var m = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'M'));
  [-1, 0, 1].forEach(function (d) {
    var mm = m + d, yy = y;
    if (mm < 1) { mm += 12; yy -= 1; }
    if (mm > 12) { mm -= 12; yy += 1; }
    var yf = ychk_subFolder_(YCHK_CONFIG.CHECKED_ROOT, yy + '年');
    var mf = yf ? ychk_subFolder_(yf, mm + '月') : null;
    var sf = mf ? ychk_subFolder_(mf, sizeName) : null;
    if (sf) ychk_pdfsIn_(sf).forEach(function (f) { entries.push(ychk_entry_(f, YCHK_CONFIG.STATE_DONE)); });
  });
  return ychk_dedupe_(entries);
}

// ===== 公開関数：手で確かめる（何も書き換えない） =====
function 入込場のチェック状態を確かめる() {
  var entries = ychk_entries_('50k');
  var done = entries.filter(function (e) { return e.state === YCHK_CONFIG.STATE_DONE; }).length;
  var withRng = entries.filter(function (e) { return e.a != null; }).length;
  Logger.log('50Ｋのコピー ' + entries.length + '件（チェック済 ' + done + ' ／ チェック前 ' + (entries.length - done) +
             '）  容器Noが使えるもの ' + withRng + '件');
  var q = warm_yardQueries_();
  var raw = JSON.parse(getYardMapUpdatesBothWithOrderText(q['50k'], q['20k'], true));
  var blocks = (raw['50k'] || []).filter(function (r) { return r && r.found && r.check; });
  var count = {};
  blocks.forEach(function (r) { count[r.check] = (count[r.check] || 0) + 1; });
  Logger.log('区画: ' + Object.keys(count).map(function (k) { return k + ' ' + count[k]; }).join(' / '));
  blocks.forEach(function (r) {
    Logger.log('  <' + r.pos + '> ' + r.check + '  ' + r.orders.filter(function (o) { return o.check; })
      .map(function (o) { return o.no + ' ' + o.check; }).join('、'));
  });
  return { entries: entries.length, blocks: count };
}
