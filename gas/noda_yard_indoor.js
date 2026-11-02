/**
 * 野田組 業務ダッシュボード — 屋内の置場（ヤードマップ＝入込場マップと連動）
 * ------------------------------------------------------------------
 * ★ 2026/11/02 落合さん「ヤードマップ内の在庫は屋外から抜いて」「20〜25 屋内を追加して、これらはヤードマップと連動させて」
 *   入込場マップ（50k・20k の区画）のどの区画がどの屋内の置場にあるかを、置場容量のスプレッドシートのシート
 *   「屋内とヤードマップ」（置場番号・マップ〔50k/20k〕・区画〔例 1-19,25〕）に持つ。
 *   1時間おき（harvestDailyData）に、埋まっている区画の本数を足して、その置場の実績（50k→50kg、20k→20kg）に書く。
 *   手で直さない（書いても次の取込で上書きされる）。
 * ★ 位置が「屋内」の置場は、野外置場の合計（KPI・一覧の合計・日次在庫の推移）に入れない。屋内は別に数える。
 *
 * 名前の衝突に注意：内部関数はすべて yardin_ 接頭辞。
 */

var YARDIN_CONFIG = {
  SHEET: '屋内とヤードマップ',
  KEY: { '50k': 'a50', '20k': 'a20' },
  WHO: '（自動：ヤードマップ）',
  // どの置場にも割り当てていない区画の本数（屋内の合計に「その他の区画」として足す）
  PROP_OTHER: 'yardIndoor.other'
};

/* 位置が「屋内」か（純関数） */
function yardin_isIndoor_(r) { return String((r && r.position) || '').trim() === '屋内'; }

/* 「1-19,25」→ [1,…,19,25]（純関数） */
function yardin_blocks_(text) {
  var out = [];
  String(text == null ? '' : text).replace(/[〜～]/g, '-').split(/[,、\s]+/).forEach(function (part) {
    var m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return;
    var a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (var i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 500; i++) if (out.indexOf(i) < 0) out.push(i);
  });
  return out;
}

/* シートの行 → [{ no, map, blocks }]（純関数） */
function yardin_mappingFrom_(values) {
  var out = [];
  (values || []).forEach(function (r) {
    var no = String(r[0] == null ? '' : r[0]).trim();
    var map = String(r[1] == null ? '' : r[1]).trim().toLowerCase().replace('ｋ', 'k');
    var blocks = yardin_blocks_(r[2]);
    if (no && YARDIN_CONFIG.KEY[map] && blocks.length) out.push({ no: no, map: map, blocks: blocks });
  });
  return out;
}

/* どの置場にも割り当てていない、埋まっている区画の本数（純関数）。
   11/2 落合さん「置き場細かく指定しなくてもわかるだら？」：残りの区画まで聞かずに、屋内の「その他の区画」として数える */
function yardin_other_(mapping, raw) {
  var out = { a20: 0, a50: 0, 区画: 0 };
  ['50k', '20k'].forEach(function (map) {
    var used = [];
    (mapping || []).forEach(function (m) { if (m.map === map) used = used.concat(m.blocks); });
    ((raw && raw[map]) || []).forEach(function (b) {
      if (!b || !b.found || b.kind !== 'fill' || used.indexOf(Number(b.pos)) >= 0) return;
      out[YARDIN_CONFIG.KEY[map]] += Number(b.qty) || 0;
      out.区画++;
    });
  });
  return out;
}

/* 毎時の取込で貯めた「その他の区画」を読む（無ければ0） */
function yardin_readOther_() {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(YARDIN_CONFIG.PROP_OTHER);
    var o = v ? JSON.parse(v) : null;
    return o ? { a20: Number(o.a20) || 0, a50: Number(o.a50) || 0, 区画: Number(o.区画) || 0, at: o.at || '' } : { a20: 0, a50: 0, 区画: 0, at: '' };
  } catch (e) { return { a20: 0, a50: 0, 区画: 0, at: '' }; }
}

/* 置場ごとの本数（純関数）。raw は getYardMapUpdatesBothWithOrderText の結果（{ '50k': [区画…], '20k': […] }）。
   埋まっている区画（kind 'fill'）の qty を足す。→ { 置場番号: { a50: n, a20: n, 区画: m } } */
function yardin_sums_(mapping, raw) {
  var out = {};
  (mapping || []).forEach(function (m) {
    var o = out[m.no] = out[m.no] || { a20: 0, a50: 0, 区画: 0 };
    var key = YARDIN_CONFIG.KEY[m.map];
    ((raw && raw[m.map]) || []).forEach(function (b) {
      if (!b || !b.found || b.kind !== 'fill') return;
      if (m.blocks.indexOf(Number(b.pos)) < 0) return;
      o[key] += Number(b.qty) || 0;
      o.区画++;
    });
  });
  return out;
}

function yardin_mapping_() {
  var sh = yardGetSpreadsheet_().getSheetByName(YARDIN_CONFIG.SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return yardin_mappingFrom_(sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues());
}

/* 毎時：ヤードマップから屋内の置場の本数を書く。変わったところだけ */
function syncIndoorFromYardMap() {
  var out = { 置場: 0, 書いた: 0, error: null, 明細: [] };
  try {
    var mapping = yardin_mapping_();
    if (!mapping.length) return out;
    var q = warm_yardQueries_();
    var raw = getYardMapUpdatesBothWithOrderText(q['50k'], q['20k'], false);
    raw = typeof raw === 'string' ? JSON.parse(raw) : raw;
    var sums = yardin_sums_(mapping, raw);
    var other = yardin_other_(mapping, raw);
    other.at = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    PropertiesService.getScriptProperties().setProperty(YARDIN_CONFIG.PROP_OTHER, JSON.stringify(other));
    out.その他 = other;
    var sheet = yardGetSheet_();
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    Object.keys(sums).forEach(function (no) {
      out.置場++;
      var rowNum = yardFindRowByNo_(no);
      if (rowNum === -1) return;
      var s = sums[no], changed = false;
      ['a20', 'a50'].forEach(function (k) {
        // そのマップの区画がある置場のサイズだけ書く（20kだけの置場の50kgは触らない）
        var has = mapping.some(function (m) { return m.no === no && YARDIN_CONFIG.KEY[m.map] === k; });
        if (!has) return;
        var cell = sheet.getRange(rowNum, yardColumnIndex_(k));
        if (Number(cell.getValue()) !== s[k]) { cell.setValue(s[k]); changed = true; }
      });
      if (changed) {
        sheet.getRange(rowNum, yardColumnIndex_('updatedAt')).setValue(now);
        sheet.getRange(rowNum, yardColumnIndex_('updatedBy')).setValue(YARDIN_CONFIG.WHO);
        out.書いた++;
      }
      out.明細.push({ no: no, a20: s.a20, a50: s.a50, 区画: s.区画 });
    });
  } catch (err) {
    out.error = String(err && err.message || err);
    Logger.log('屋内の置場の取込でエラー: ' + out.error);
  }
  return out;
}

/* エディタから：今すぐ取り込む */
function 屋内の置場をヤードマップから取り込む() {
  Logger.log(JSON.stringify(syncIndoorFromYardMap()));
}
