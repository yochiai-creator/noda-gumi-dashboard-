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
  MAX_HITS: 6,   // 1区画に出す指図書の上限。多すぎても見られない
  /* ★ 容器Noの範囲を信じてよい指図書だけを使う。
       指図書の取込時に「数量」と「レンジから数えた本数」を突き合わせており、
       その結果が検算の列に入っている。合っていないものは範囲が壊れているので、
       重ねて当てると関係ない区画にまで当たってしまう。
       実際、50kの区画のほとんどに同じ3件（30458/30459/10647）が付いていた。 */
  OK_CHECK: { '一致': true, 'レンジ採用': true },
  /* ★ それでも広すぎる範囲は弾く。指図書1件は多くても千本台なので、
       数量の5倍を超える幅は読み取りが壊れていると見る。 */
  WIDTH_FACTOR: 5,
  WIDTH_MIN: 200
};

/* その指図書の容器No範囲を信じてよいか（純関数）。 */
function ycno_trustRange_(s) {
  if (!s || s.a == null || s.b == null) return false;
  if (!YCNO_CONFIG.OK_CHECK[String(s.check || '')]) return false;
  var width = s.b - s.a + 1;
  var qty = Number(s.qty) || 0;
  if (qty > 0) {
    var limit = Math.max(qty * YCNO_CONFIG.WIDTH_FACTOR, YCNO_CONFIG.WIDTH_MIN);
    if (width > limit) return false;
  } else if (width > YCNO_CONFIG.WIDTH_MIN) {
    return false;   // 数量が分からないのに幅が広い＝当てにできない
  }
  return true;
}

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
    if (!ycno_trustRange_(s)) return;
    var lo = Math.max(range.a, s.a), hi = Math.min(range.b, s.b);
    if (hi < lo) return;
    out.push({ no: s.no, prefix: s.prefix, date: s.date,
               重なり: hi - lo + 1, a: s.a, b: s.b });
  });
  /* ★ 同じ依頼Noは1件にする（重なりの大きいほうを残す）。
       索引は全部の行から範囲を持つので、同じ依頼Noが何本も当たることがある。 */
  var byNo = {};
  out.forEach(function (h) {
    var k = String(h.no).replace(/^\d{2}-/, '');
    if (!byNo[k] || h.重なり > byNo[k].重なり) byNo[k] = h;
  });
  out = Object.keys(byNo).map(function (k) { return byNo[k]; });
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

/* 入込場の全区画を { size, pos, range, orders } の形で集める。
   ★ 区画の一覧は画面（静的データ）側が持っていて、GASからは
     getYardMapUpdatesBothWithOrderText に「位置の一覧」を渡す決まりになっている。
     渡さないと1件も返らない。ここでは更新用一覧シートから位置を作って渡す。 */
function ycno_readBlocks_() {
  var q = {};
  ['50k', '20k'].forEach(function (sizeKey) {
    q[sizeKey] = yard_readRefRows_(sizeKey).map(function (r) {
      return { pos: String(r.pos) };
    });
  });
  var raw = JSON.parse(getYardMapUpdatesBothWithOrderText(q['50k'], q['20k']));
  var out = [];
  ['50k', '20k'].forEach(function (sizeKey) {
    (raw[sizeKey] || []).forEach(function (r) {
      if (!r || !r.found) return;
      var range = (r.rangeStart != null && r.rangeEnd != null && r.rangeStart !== '' && r.rangeEnd !== '')
        ? (r.rangeStart + '〜' + r.rangeEnd) : '';
      /* ★ 人が打ったものだけを数える。v202 からマップの一括取得が
           容器番号で当てたぶんも orders に足しているので、そのまま数えると
           番号で当てたものを番号で当てたものと比べることになり、
           一致が水増しされる（49区画→68区画に増えて見えた）。 */
      out.push({ size: sizeKey, pos: r.pos, range: range,
                 orders: (r.orders || [])
                   .filter(function (o) { return o && o.src !== '番号'; })
                   .map(function (o) { return o.no; }) });
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
  var all = idx.ranges || [];
  var ok = all.filter(ycno_trustRange_);
  var t = ycno_grade_(blocks, ok);
  Logger.log('指図書の容器Noレンジ ' + all.length + '件 / 当てに使えるもの ' + ok.length + '件');
  /* ★ 弾いたものの中身を見せる。多すぎるなら弾き方がきつすぎる。 */
  var ng = all.filter(function (s) { return !ycno_trustRange_(s); });
  var why = {};
  ng.forEach(function (s) {
    var k = YCNO_CONFIG.OK_CHECK[String(s.check || '')] ? '幅が広すぎる' : ('検算=' + (s.check || '空'));
    why[k] = (why[k] || 0) + 1;
  });
  Object.keys(why).sort(function (a, b) { return why[b] - why[a]; }).forEach(function (k) {
    Logger.log('  使わない ' + k + '  ' + why[k] + '件');
  });
  ng.slice().sort(function (a, b) { return (b.b - b.a) - (a.a === null ? 0 : (a.b - a.a)); })
    .slice(0, 5).forEach(function (s) {
      Logger.log('    幅の広い例 ' + s.no + '  ' + s.prefix + ' ' + s.a + '〜' + s.b +
                 '（' + (s.b - s.a + 1) + '本ぶん / 数量 ' + s.qty + ' / 検算 ' + s.check + '）');
    });
  if (blocks.length === 0) {
    /* ★ 0件で終わったときに「当たらなかった」のか「そもそも区画が読めていない」のか
         見分けが付かないと直せない。読めていないとはっきり言う。 */
    Logger.log('★ 区画が1件も読めていません。更新用一覧シートを確かめてください。');
    return t;
  }
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
    /* ★ 番号で当たらなかった依頼Noは、索引でどう入っているかを出す。
         範囲が壊れて弾かれているのか、サイズが違うのか、範囲がずれているのかが
         これで分かる。 */
    if (e.種類 === '手入力のみ' || e.種類 === '一部一致') {
      var got = {};
      String(e.番号で || '').split(',').forEach(function (x) { got[ycno_bare_(x)] = true; });
      String(e.手入力 || '').split(',').forEach(function (no) {
        var bare = ycno_bare_(no);
        if (!bare || got[bare]) return;
        var hits = all.filter(function (x) { return ycno_bare_(x.no) === bare; });
        if (hits.length === 0) {
          Logger.log('      ' + no + ' は出荷実績の索引に無い（指図書が取り込まれていない）');
          return;
        }
        hits.forEach(function (x) {
          Logger.log('      ' + no + ' の索引  ' + x.prefix + ' ' + x.a + '〜' + x.b +
                     '  サイズ ' + x.size + ' / 数量 ' + x.qty + ' / 検算 ' + x.check +
                     (ycno_trustRange_(x) ? '' : '  ← 当てに使っていない'));
        });
      });
    }
  });
  return t;
}

// ===== 区画の指図書に「容器番号で当てたぶん」を足す =====
/**
 * ★ 手入力を捨てない
 *   実測（102区画）では、番号で当てたほうが手入力より広く当たる（打ち忘れ19区画を
 *   拾えた）が、番号では当たらない区画も2つあった。どちらか一方にすると必ず損をする。
 *   両方を出して、どちらから来たかを印で分かるようにする。
 * ★ 同じ依頼Noは1つにまとめる
 *   年度の有無（60114 と 26-60114）で二重に出さない。
 * ★ PDFのURLは出荷実績シートの索引から取る
 *   Drive検索は重いうえ、番号で当てたぶんは索引に必ず載っている（索引から
 *   当てているので）。手入力だけのものは今までどおりDrive検索に回す。
 */
function ycno_attachToBlocks_(raw, idx) {
  var ranges = (idx && idx.ranges) || [];
  ['50k', '20k'].forEach(function (sizeKey) {
    (raw[sizeKey] || []).forEach(function (r) {
      if (!r || !r.found) return;
      var rng = (r.rangeStart != null && r.rangeEnd != null && r.rangeStart !== '' && r.rangeEnd !== '')
        ? { a: Number(r.rangeStart), b: Number(r.rangeEnd) } : null;
      if (!rng || isNaN(rng.a) || isNaN(rng.b)) return;

      var have = {};
      (r.orders || []).forEach(function (o) {
        o.src = '手入力';
        have[ycno_bare_(o.no)] = o;
      });

      ycno_match_(sizeKey, rng, ranges).forEach(function (h) {
        var bare = ycno_bare_(h.no);
        if (have[bare]) { have[bare].src = '両方'; return; }   // 手入力と一致
        var e = idx.byOrder ? idx.byOrder[h.no] : null;
        var one = { no: h.no, src: '番号',
                    url: e && e.fileId ? shipact_fileUrl_(e.fileId) : null,
                    date: h.date ? shipact_shortDate_(h.date) : null };
        have[bare] = one;
        r.orders.push(one);
      });
    });
  });
  return raw;
}

/* 年度の頭（26-）を外した依頼No。同じものを二重に出さないための鍵。 */
function ycno_bare_(no) { return String(no || '').replace(/^\d{2}-/, ''); }
