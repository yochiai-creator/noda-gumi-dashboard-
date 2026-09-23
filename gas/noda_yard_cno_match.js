/**
 * 野田組 業務ダッシュボード — 入込場の区画を「容器番号」で指図書に当てる
 * ------------------------------------------------------------------
 * ★ 今までのやり方
 *   入込場マスタの「依頼No」セルに人が打った文字を読んで、その番号のPDFを探す。
 *   打ち忘れ・打ち間違いがあるとリンクが出ない。打った人にしか直せない。
 *
 * ★ ここでやること
 *   区画は容器番号の範囲（46201〜46300 など）を持っている。
 *   指図書も容器No開始〜終了を持っている。重なれば同じ容器の話なので、
 *   人が何も打たなくても結び付けられる。生産ロットでやっているのと同じ考え方。
 *
 * ★ 番号だけでは足りない
 *   接頭辞（HEP/HXP/…）ごとに番号帯が重なっている。区画のほうは接頭辞を
 *   持っていないので、番号だけで当てると別サイズの指図書を拾う。
 *   そこで「区画のサイズ（50k/20k）と指図書のサイズが合うこと」を必須にする。
 *
 * ★ まず確かめてから使う
 *   いきなり画面に出すと、間違った指図書が正しいものとして出てしまう。
 *   人が打った依頼Noがある区画で、番号で当てた結果と突き合わせて、
 *   どれだけ一致するかを先に数える（入込場の容器番号で指図書を当ててみる）。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて ycno_ 接頭辞にしてある。
 */

var YCNO_CONFIG = {
  // 区画のサイズ → 指図書のサイズ表記（出荷実績シートの「サイズ」列）
  SIZE: { '50k': '50kg', '20k': '20kg' },
  MAX_HITS: 6   // 1区画に出す指図書の上限。多すぎても見られない
};

/* 「46201〜46300」から数の範囲を取り出す（純関数）。
   ★ 未入力の区画に "-99〜0" や "〜" が入っていることがある。範囲として扱わない。 */
function ycno_parseRange_(text) {
  var m = String(text == null ? '' : text).match(/(\d+)\s*[〜~～-]\s*(\d+)/);
  if (!m) return null;
  var a = Number(m[1]), b = Number(m[2]);
  if (!a || !b || a > b) return null;
  return { a: a, b: b };
}

/* 区画1つに当たる指図書を探す（純関数）。
   @param sizeKey '50k' | '20k'
   @param range   { a, b } 区画の容器番号の範囲
   @param ranges  shipact_index_().ranges
   ★ サイズが合うものだけを見る。番号帯は接頭辞ごとに重なっているので、
     サイズを見ないと別サイズの指図書を拾う。 */
function ycno_match_(sizeKey, range, ranges) {
  var want = YCNO_CONFIG.SIZE[sizeKey];
  if (!want || !range) return [];
  var out = [];
  (ranges || []).forEach(function (s) {
    if (!s || s.size !== want) return;
    if (s.a == null || s.b == null) return;
    var lo = Math.max(range.a, s.a), hi = Math.min(range.b, s.b);
    if (hi < lo) return;
    out.push({ no: s.no, prefix: s.prefix, date: s.date,
               重なり: hi - lo + 1, a: s.a, b: s.b });
  });
  // 重なりが大きいもの、次に新しいものを先に
  out.sort(function (x, y) {
    if (y.重なり !== x.重なり) return y.重なり - x.重なり;
    return String(y.date || '').localeCompare(String(x.date || ''));
  });
  return out.slice(0, YCNO_CONFIG.MAX_HITS);
}

/* 人が打った依頼Noと、番号で当てた結果を見比べる（純関数）。
   戻り値は数えた結果だけ。ここでは何も書き換えない。 */
function ycno_grade_(blocks, ranges) {
  var t = { 区画: 0, 範囲あり: 0, 手入力あり: 0,
            一致: 0, 一部一致: 0, 食い違い: 0,
            手入力のみ: 0, 番号のみ: 0, どちらも無し: 0, 例: [] };
  (blocks || []).forEach(function (b) {
    t.区画++;
    var rng = ycno_parseRange_(b.range);
    if (rng) t.範囲あり++;
    var typed = (b.orders || []).map(function (x) { return String(x).replace(/^\d{2}-/, ''); });
    if (typed.length) t.手入力あり++;

    var hits = rng ? ycno_match_(b.size, rng, ranges) : [];
    var got = hits.map(function (h) { return String(h.no).replace(/^\d{2}-/, ''); });

    if (typed.length === 0 && got.length === 0) { t.どちらも無し++; return; }
    if (typed.length === 0) {
      t.番号のみ++;
      if (t.例.length < 12) t.例.push({ 種類: '番号のみ', 区画: b.size + '#' + b.pos,
                                        範囲: b.range, 番号で: got.join(',') });
      return;
    }
    if (got.length === 0) {
      t.手入力のみ++;
      if (t.例.length < 12) t.例.push({ 種類: '手入力のみ', 区画: b.size + '#' + b.pos,
                                        範囲: b.range, 手入力: typed.join(',') });
      return;
    }
    var hitSet = {};
    got.forEach(function (n) { hitSet[n] = true; });
    var shared = typed.filter(function (n) { return hitSet[n]; });
    if (shared.length === typed.length && typed.length === got.length) t.一致++;
    else if (shared.length > 0) {
      t.一部一致++;
      if (t.例.length < 12) t.例.push({ 種類: '一部一致', 区画: b.size + '#' + b.pos,
                                        範囲: b.range, 手入力: typed.join(','), 番号で: got.join(',') });
    } else {
      t.食い違い++;
      if (t.例.length < 12) t.例.push({ 種類: '食い違い', 区画: b.size + '#' + b.pos,
                                        範囲: b.range, 手入力: typed.join(','), 番号で: got.join(',') });
    }
  });
  return t;
}

/* 入込場の全区画を { size, pos, range, orders } の形で集める。 */
function ycno_readBlocks_() {
  var raw = JSON.parse(getYardMapUpdatesBothWithOrderText(null, null));
  var out = [];
  ['50k', '20k'].forEach(function (sizeKey) {
    (raw[sizeKey] || []).forEach(function (r) {
      if (!r || !r.found) return;
      var range = (r.rangeStart != null && r.rangeEnd != null)
        ? (r.rangeStart + '〜' + r.rangeEnd) : '';
      out.push({ size: sizeKey, pos: r.pos, range: range,
                 orders: (r.orders || []).map(function (o) { return o.no; }) });
    });
  });
  return out;
}

// ===== 公開関数：確かめるだけ（何も書き換えない） =====
function 入込場の容器番号で指図書を当ててみる() {
  var idx, blocks;
  try {
    idx = shipact_index_();
    blocks = ycno_readBlocks_();
  } catch (err) {
    Logger.log('エラー: ' + String(err));
    return { error: String(err) };
  }
  var t = ycno_grade_(blocks, idx.ranges || []);
  Logger.log('指図書の容器Noレンジ ' + (idx.ranges || []).length + '件');
  Logger.log('区画 ' + t.区画 + '（容器番号の範囲が入っている ' + t.範囲あり + '）');
  Logger.log('  手入力の依頼Noがある区画 ' + t.手入力あり);
  Logger.log('    ぴったり一致 ' + t.一致 + ' / 一部一致 ' + t.一部一致 + ' / 食い違い ' + t.食い違い);
  Logger.log('    番号では当たらない ' + t.手入力のみ);
  Logger.log('  手入力は無いが番号で当たった区画 ' + t.番号のみ);
  Logger.log('  どちらも無し ' + t.どちらも無し);
  t.例.forEach(function (e) {
    Logger.log('  [' + e.種類 + '] ' + e.区画 + '  ' + e.範囲 +
               (e.手入力 ? '  手入力 ' + e.手入力 : '') +
               (e.番号で ? '  番号で ' + e.番号で : ''));
  });
  return t;
}
