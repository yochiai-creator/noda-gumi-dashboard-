// 入込場の区画を「容器番号」で指図書に当てる仕組みのテスト。
//
// ★ なぜ要るのか
//   間違った指図書を正しいものとして画面に出すのが一番まずい。
//   とくに「番号帯は接頭辞ごとに重なっている」ので、サイズを見ないと
//   別サイズの指図書を拾う。そこを押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

function sb() {
  const s = { Logger: { log: (m) => s.__logs.push(String(m)) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, isNaN, Boolean, Error };
  s.__logs = [];
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(GAS + 'noda_yard_cno_match.js', 'utf8'), s);
  return s;
}

// 実データに近いレンジ。番号帯が接頭辞をまたいで重なっているのがポイント
const ok = (o) => Object.assign({ check: '一致', qty: (o.b - o.a + 1) }, o);
const R = [
  ok({ no: '26-10001', prefix: 'HEP', a: 46201, b: 46300, date: '2026-09-20', size: '50kg' }),
  ok({ no: '26-10002', prefix: 'HEP', a: 46250, b: 46400, date: '2026-09-21', size: '50kg' }),
  // ★ 50kの区画と番号が重なる20kgの指図書。サイズを見ないとこれを拾ってしまう
  ok({ no: '26-20001', prefix: 'HXP', a: 46150, b: 46350, date: '2026-09-21', size: '20kg' }),
  ok({ no: '26-20002', prefix: 'HXP', a: 76151, b: 76200, date: '2026-09-19', size: '20kg' }),
  ok({ no: '26-30001', prefix: 'HBB', a: 77846, b: 78830, date: '2026-09-18', size: '20kg' }),
];

console.log('■ 容器番号の範囲を読む');
{
  const s = sb();
  chk('ふつうの範囲', JSON.stringify(s.ycno_parseRange_('46201〜46300')) === '{"a":46201,"b":46300}');
  chk('半角チルダ', s.ycno_parseRange_('46201~46300').a === 46201);
  chk('ハイフン', s.ycno_parseRange_('46201-46300').b === 46300);
  chk('★未入力の「〜」は範囲にしない', s.ycno_parseRange_('〜') === null);
  chk('★未入力の「-99〜0」は範囲にしない', s.ycno_parseRange_('-99〜0') === null);
  chk('逆順は範囲にしない', s.ycno_parseRange_('46300〜46201') === null);
  chk('空は null', s.ycno_parseRange_('') === null && s.ycno_parseRange_(null) === null);
}

console.log('■ サイズで絞る');
{
  const s = sb();
  const hits = s.ycno_match_('50k', { a: 46201, b: 46300 }, R);
  const nos = hits.map((h) => h.no);
  chk('★番号が重なる20kgの指図書を拾わない', nos.indexOf('26-20001') === -1, nos);
  chk('50kgのものは拾う', nos.indexOf('26-10001') >= 0 && nos.indexOf('26-10002') >= 0, nos);
  chk('★重なりの大きい順に並べる（100本 > 51本）',
    hits[0].no === '26-10001' && hits[0].重なり === 100, hits);
  chk('重なりの本数を返す', hits[1].重なり === 51, hits[1]);

  const h20 = s.ycno_match_('20k', { a: 76151, b: 76200 }, R).map((h) => h.no);
  chk('20kの区画は20kgの指図書に当たる', h20.join(',') === '26-20002', h20);
  chk('重ならなければ当たらない',
    s.ycno_match_('50k', { a: 99000, b: 99100 }, R).length === 0);
  chk('知らないサイズは当てない', s.ycno_match_('30k', { a: 46201, b: 46300 }, R).length === 0);
  chk('範囲が無ければ当てない', s.ycno_match_('50k', null, R).length === 0);
}

console.log('■ 壊れた容器No範囲を使わない');
{
  /* ★ 実際に起きた：50kの区画のほとんどに同じ3件（30458/30459/10647）が
       付いていた。取込時の検算に通っていない＝範囲が壊れている指図書。 */
  const s = sb();
  const 壊れ = [
    // 検算が通っていない
    { no: '26-30458', prefix: 'HEP', a: 54801, b: 58700, date: '2026-09-01',
      size: '50kg', qty: 100, check: '不一致' },
    { no: '26-30459', prefix: 'HEP', a: 54000, b: 59000, date: '2026-09-01',
      size: '50kg', qty: 60, check: 'レンジ異常' },
    { no: '26-10647', prefix: 'HEP', a: 55000, b: 59000, date: '2026-09-01',
      size: '50kg', qty: null, check: '要確認' },
    // 検算は通っているが幅が数量の5倍を大きく超える
    { no: '26-99999', prefix: 'HEP', a: 54801, b: 58700, date: '2026-09-01',
      size: '50kg', qty: 100, check: '一致' },
    // これが本物
    ok({ no: '26-60114', prefix: 'HEP', a: 57601, b: 57700, date: '2026-09-20', size: '50kg' }),
  ];
  chk('★検算が通っていない範囲は使わない',
    s.ycno_trustRange_(壊れ[0]) === false && s.ycno_trustRange_(壊れ[1]) === false, 壊れ[0]);
  chk('数量が分からず幅も広いものは使わない', s.ycno_trustRange_(壊れ[2]) === false);
  chk('★検算は通っていても数量の5倍を超える幅は使わない',
    s.ycno_trustRange_(壊れ[3]) === false, 壊れ[3]);
  chk('まともな範囲は使う', s.ycno_trustRange_(壊れ[4]) === true, 壊れ[4]);
  chk('「レンジ採用」も使う',
    s.ycno_trustRange_({ a: 1, b: 100, qty: 100, check: 'レンジ採用' }) === true);
  chk('小さい範囲は数量が0でも通す（200本まで）',
    s.ycno_trustRange_({ a: 1, b: 50, qty: 0, check: '一致' }) === true);

  const hits = s.ycno_match_('50k', { a: 57601, b: 57700 }, 壊れ).map((h) => h.no);
  chk('★区画に当たるのは本物だけになる', hits.join(',') === '26-60114', hits);

  // 壊れた範囲を弾いたことで、隣の区画にも巻き添えが出ない
  const h2 = s.ycno_match_('50k', { a: 54801, b: 54900 }, 壊れ);
  chk('★範囲外の区画には何も当たらない（巻き添えを消す）', h2.length === 0, h2);
}

console.log('■ 手入力の依頼Noと見比べる');
{
  const s = sb();
  const g = s.ycno_grade_([
    // 手入力と番号が一致
    { size: '20k', pos: 1, range: '76151〜76200', orders: ['26-20002'] },
    // 年度の有無が違っても同じものとして扱う
    { size: '20k', pos: 2, range: '76151〜76200', orders: ['20002'] },
    // 手入力はあるが番号では当たらない
    { size: '20k', pos: 3, range: '99000〜99100', orders: ['26-60001'] },
    // 手入力は無いが番号で当たる（ここが増えるほど得をする）
    { size: '20k', pos: 4, range: '77900〜77950', orders: [] },
    // どちらも無い空き区画
    { size: '20k', pos: 5, range: '〜', orders: [] },
    // 食い違い（手入力と番号でまったく別）
    { size: '20k', pos: 6, range: '76151〜76200', orders: ['26-99999'] },
  ], R);
  chk('区画数を数える', g.区画 === 6, g);
  chk('範囲が入っている区画を数える', g.範囲あり === 5, g);
  chk('★ぴったり一致を数える', g.一致 === 2, g);
  chk('★年度の有無は違いにしない（20002 と 26-20002）', g.一致 === 2, g);
  chk('★食い違いを数える', g.食い違い === 1, g);
  chk('番号では当たらないを数える', g.手入力のみ === 1, g);
  chk('★手入力が無くても当たったものを数える', g.番号のみ === 1, g);
  chk('どちらも無しを数える', g.どちらも無し === 1, g);
  chk('中身を見られるように例を残す', g.例.length >= 3, g.例);
  chk('★何も書き換えない（数えた結果だけ返す）',
    g.blocks === undefined && g.ranges === undefined, Object.keys(g));
}

console.log('■ 1区画に出す件数の上限');
{
  const s = sb();
  const many = [];
  for (let i = 0; i < 20; i++) {
    many.push(ok({ no: '26-1' + (1000 + i), prefix: 'HEP', a: 46201, b: 46300,
                   date: '2026-09-01', size: '50kg' }));
  }
  chk('★多すぎても6件までにする',
    s.ycno_match_('50k', { a: 46201, b: 46300 }, many).length === 6);
}

console.log('■ 区画の読み取り（位置の一覧を渡さないと0件になる）');
{
  /* ★ 実際にこれで詰まった。getYardMapUpdatesBothWithOrderText は
       「位置の一覧」を渡さないと1件も返さない。更新用一覧シートから作って渡す。 */
  const s = sb();
  let 渡された = null;
  s.yard_readRefRows_ = (size) => (size === '50k'
    ? [{ pos: 1 }, { pos: 2 }]
    : [{ pos: 1 }, { pos: 3 }, { pos: 5 }]);
  s.getYardMapUpdatesBothWithOrderText = (q50, q20) => {
    渡された = { '50k': q50, '20k': q20 };
    return JSON.stringify({
      '50k': [{ found: true, pos: 1, rangeStart: 46201, rangeEnd: 46300,
                orders: [{ no: '26-10001', url: 'u' }] },
              { found: false, pos: 2 }],
      '20k': [{ found: true, pos: 1, rangeStart: 76151, rangeEnd: 76200, orders: [] },
              { found: true, pos: 3, rangeStart: '', rangeEnd: '', orders: [] },
              { found: true, pos: 5, rangeStart: null, rangeEnd: null, orders: [] }],
    });
  };
  const blocks = s.ycno_readBlocks_();
  chk('★位置の一覧を渡している（渡さないと0件になる）',
    渡された && 渡された['50k'].length === 2 && 渡された['20k'].length === 3, 渡された);
  chk('位置は文字で渡す', 渡された['50k'][0].pos === '1', 渡された['50k'][0]);
  chk('見つからない区画は落とす', blocks.length === 4, blocks);
  chk('範囲を組み立てる', blocks[0].range === '46201〜46300', blocks[0]);
  chk('★範囲が空文字なら空にする（「〜」を作らない）',
    blocks[2].range === '', blocks[2]);
  chk('★範囲がnullでも空にする', blocks[3].range === '', blocks[3]);
  chk('依頼Noは番号だけ取り出す', blocks[0].orders.join(',') === '26-10001', blocks[0]);

  // ★ v202 からマップの一括取得が番号で当てたぶんも orders に足している。
  //   それを「手入力」として数えると、番号の当たりを番号の当たりと比べて水増しになる。
  s.getYardMapUpdatesBothWithOrderText = () => JSON.stringify({
    '50k': [{ found: true, pos: 1, rangeStart: 46201, rangeEnd: 46300, orders: [
      { no: '26-10001', src: '手入力' },
      { no: '26-10002', src: '番号' },
      { no: '26-10003', src: '両方' },
    ] }],
    '20k': [],
  });
  const b2 = s.ycno_readBlocks_();
  chk('★番号で当てたぶんは手入力として数えない',
    b2[0].orders.indexOf('26-10002') === -1, b2[0].orders);
  chk('手入力と両方は残す', b2[0].orders.join(',') === '26-10001,26-10003', b2[0].orders);
}

console.log('■ 区画に足す（手入力と番号の両方を出す）');
{
  const s = sb();
  const idx = {
    ranges: [
      ok({ no: '26-60114', prefix: 'HEP', a: 57601, b: 57700, date: '2026-09-20', size: '50kg' }),
      ok({ no: '26-30417', prefix: 'HEP', a: 56001, b: 56100, date: '2026-09-19', size: '50kg' }),
      ok({ no: '26-20002', prefix: 'HXP', a: 76151, b: 76200, date: '2026-09-18', size: '20kg' }),
    ],
    byOrder: {
      '26-60114': { fileId: 'F1' }, '26-30417': { fileId: 'F2' }, '26-20002': { fileId: 'F3' },
    },
  };
  s.shipact_fileUrl_ = (id) => 'https://drive/' + id;
  s.shipact_shortDate_ = (d) => String(d).slice(5);

  const raw = {
    '50k': [
      // 手入力と番号が同じもの
      { found: true, pos: 1, rangeStart: 57601, rangeEnd: 57700,
        orders: [{ no: '60114', url: 'https://old/1', date: '09-20' }] },
      // 手入力は別、番号でも当たる（両方出す）
      { found: true, pos: 22, rangeStart: 56001, rangeEnd: 56100,
        orders: [{ no: '26-20298', url: 'https://old/2', date: '09-15' }] },
      // 手入力なし。番号だけで当たる（打ち忘れを拾う）
      { found: true, pos: 5, rangeStart: 57601, rangeEnd: 57700, orders: [] },
      // 範囲が無い区画は触らない
      { found: true, pos: 9, rangeStart: '', rangeEnd: '',
        orders: [{ no: '26-11111', url: 'https://old/3' }] },
    ],
    '20k': [{ found: true, pos: 1, rangeStart: 76151, rangeEnd: 76200, orders: [] }],
  };
  const out = s.ycno_attachToBlocks_(raw, idx);
  const b = {}; out['50k'].forEach((x) => { b[x.pos] = x; });

  chk('★手入力と番号が同じなら二重に出さない', b[1].orders.length === 1, b[1].orders);
  chk('★年度の有無で二重にしない（60114 と 26-60114）',
    b[1].orders[0].src === '両方', b[1].orders[0]);
  chk('手入力のURLはそのまま残す', b[1].orders[0].url === 'https://old/1', b[1].orders[0]);

  chk('★手入力と番号が違えば両方出す', b[22].orders.length === 2, b[22].orders);
  chk('手入力のほうに印を付ける', b[22].orders[0].src === '手入力', b[22].orders[0]);
  chk('番号のほうにも印を付ける', b[22].orders[1].src === '番号', b[22].orders[1]);
  chk('★番号ぶんのPDFは索引から出す（Drive検索をしない）',
    b[22].orders[1].url === 'https://drive/F2', b[22].orders[1]);

  chk('★手入力が無くても番号で出る（打ち忘れを拾う）',
    b[5].orders.length === 1 && b[5].orders[0].no === '26-60114', b[5].orders);
  chk('日付も付ける', b[5].orders[0].date === '09-20', b[5].orders[0]);

  chk('★容器番号の範囲が無い区画は触らない',
    b[9].orders.length === 1 && b[9].orders[0].src === undefined, b[9].orders);
  chk('20kの区画にも効く', out['20k'][0].orders[0].no === '26-20002', out['20k'][0].orders);

  // 索引にPDFが無くても落ちない
  const s2 = sb();
  s2.shipact_fileUrl_ = (id) => 'https://drive/' + id;
  s2.shipact_shortDate_ = (d) => String(d).slice(5);
  const r2 = s2.ycno_attachToBlocks_(
    { '50k': [{ found: true, pos: 1, rangeStart: 57601, rangeEnd: 57700, orders: [] }], '20k': [] },
    { ranges: idx.ranges, byOrder: {} });
  chk('索引にPDFが無ければURLは空にする（落ちない）',
    r2['50k'][0].orders[0].url === null, r2['50k'][0].orders[0]);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
