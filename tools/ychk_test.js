// 入込場（50k）の区画に「チェック前／チェック済」を出すテスト。
//
// ★ 元データは実物から起こしてある（2026/10/11 の Drive）
//   ◆容器種類別/50Ｋ        … 26.10.16_26-40377-0(1)  容器No:HEP65101~HEP65180 数量:80
//                              26.10.19_26-70326-0(1)  容器No:HEP62401~HEP62600 数量:200
//   ◆チェック完了/2026年/10月/50Ｋ
//                           … 26.10.16_26-40377-0(2)  HEP65181~HEP65200 数量:20
//                              26.10.16_26-40377-0(3)  HEP65201~HEP65260 数量:60
//                              26.10.01_26-10396-0(1)  容器Noなし
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 300) : '')); } };

function sb() {
  const s = { Logger: { log: () => {} }, JSON, Object, Number, String, Math, Date, Array, isNaN };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(GAS + 'noda_yard_check.js', 'utf8'), s);
  return s;
}

const F = (name, description, url) => ({ name, description, url: url || 'https://drive/' + name });
const BEFORE = [
  F('26.10.16_26-40377-0(1)_エア・ウォーター物流(株)石狩流通センター.pdf',
    '得意先コード:0190\n数量:80\n容器No:HEP65101~HEP65180\n品名:新軽量118L(50kg)\n容器サイズ:50'),
  F('26.10.19_26-70326-0(1)_静岡ガスエネ静岡.pdf',
    '得意先コード:B432\n数量:200\n容器No:HEP62401~HEP62600\n品名:新軽量118L (50kg)\n容器サイズ:50'),
];
const DONE = [
  F('26.10.16_26-40377-0(2)_エア・ウォーター物流(株)石狩流通センター.pdf',
    '得意先コード:0190\n数量:20\n容器No:HEP65181~HEP65200\n品名:新軽量118L (50kg)\n容器サイズ:50'),
  F('26.10.16_26-40377-0(3)_エア・ウォーター物流(株)石狩流通センター.pdf',
    '得意先コード:0190\n数量:60\n容器No:HEP65201~HEP65260\n品名:新軽量118L (50kg)\n容器サイズ:50'),
  F('26.10.01_26-10396-0(1)_HE近畿 姫路.pdf', '得意先コード:5908\n容器サイズ:50'),
  F('26.10.19_26-30577-0_HE関東 前橋.pdf',
    '得意先コード:1739\n数量:10\n容器No:HEP64461~HEP64470\n容器サイズ:50'),
];

console.log('■ 名前と説明欄');
{
  const s = sb();
  const n = s.ychk_parseName_('26.10.16_26-40377-0(3)_エア・ウォーター物流(株)石狩流通センター.pdf');
  chk('依頼No・枝番・版', n.orderNo === '26-40377' && n.eda === 0 && n.ver === 3, n);
  chk('出荷希望日', n.shipDate === '10/16', n.shipDate);
  const n2 = s.ychk_parseName_('26.10.19_26-30577-0_HE関東 前橋.pdf');
  chk('版の無い名前も読む', n2 && n2.orderNo === '26-30577' && n2.ver === null, n2);
  chk('元の名前（出荷作業指図書_…）は対象外', s.ychk_parseName_('出荷作業指図書_26.10.16_26-40377-0(3).pdf') === null);

  const d = s.ychk_parseDesc_(DONE[1].description);
  chk('容器Noの範囲', d.a === 65201 && d.b === 65260 && d.qty === 60, d);
  const bad = s.ychk_parseDesc_('数量:60\n容器No:HEP65201~HEP65360');
  chk('★本数が数量と合わない範囲は使わない（読み違い）', bad.a === null && bad.qty === 60, bad);
  chk('容器Noが無ければ範囲なし', s.ychk_parseDesc_(DONE[2].description).a === null);
  chk('数量が無ければ範囲は信じない', s.ychk_parseDesc_('容器No:HEP58717~HEP58724\n_読めず:1').a === null);
}

const entries = (s) => s.ychk_dedupe_([
  ...BEFORE.map((f) => s.ychk_entry_(f, 'チェック前')),
  ...DONE.map((f) => s.ychk_entry_(f, 'チェック済')),
]);

console.log('■ 区画に付ける');
{
  const s = sb();
  const raw = { '50k': [
    // 依頼Noを手で打った区画（26-70326 の200本が2区画に分かれている）
    { pos: '1', found: true, rangeStart: 62501, rangeEnd: 62600, orders: [{ no: '26-70326', url: 'orig1', src: '手入力' }] },
    { pos: '2', found: true, rangeStart: 62401, rangeEnd: 62500, orders: [{ no: '26-70326', url: 'orig1', src: '手入力' }] },
    // 26-40377 の3枚（チェック前1・済2）が1区画にまたがる
    { pos: '40', found: true, rangeStart: 65101, rangeEnd: 65260, orders: [{ no: '26-40377', url: 'orig', src: '手入力' }] },
    // 26-40377(2)(3) だけが入る区画
    { pos: '41', found: true, rangeStart: 65181, rangeEnd: 65280, orders: [] },
    // 範囲の無いファイル（26-10396）を依頼Noで結ぶ
    { pos: '5', found: true, rangeStart: 10001, rangeEnd: 10100, orders: [{ no: '10396', url: null, src: '手入力' }] },
    // 依頼Noは同じでも、範囲が重ならない枝番は付けない
    { pos: '6', found: true, rangeStart: 70001, rangeEnd: 70100, orders: [{ no: '26-40377', url: 'o', src: '手入力' }] },
    // 空き区画（-99〜0）
    { pos: '7', found: true, rangeStart: -99, rangeEnd: 0, orders: [] },
    // 何も結び付かない区画
    { pos: '8', found: true, rangeStart: 1, rangeEnd: 100, orders: [] },
  ], '20k': [{ pos: '1', found: true, rangeStart: 65101, rangeEnd: 65260, orders: [] }] };
  s.ychk_attachToBlocks_(raw, entries(s), '50k', '2026-10-11');
  const B = (p) => raw['50k'].find((r) => r.pos === p);

  chk('★チェック前の区画', B('1').check === 'チェック前' && B('2').check === 'チェック前', [B('1').check, B('2').check]);
  chk('注文にもチェック前', B('1').orders[0].check === 'チェック前');
  chk('★コピーが1枚に決まればコピーを開く', B('1').orders[0].url === 'https://drive/' + BEFORE[1].name, B('1').orders[0].url);
  chk('★3枚のうち2枚済なら「一部チェック済」', B('40').check === '一部チェック済', B('40').check);
  chk('★済だけが入る区画は「チェック済」', B('41').check === 'チェック済', B('41').check);
  chk('★依頼Noが無くても容器Noの重なりで足す（番号）・枝番ごとにボタン',
    B('41').orders.length === 2 && B('41').orders.every((o) => o.no === '26-40377' && o.src === '番号') &&
    B('41').orders.map((o) => o.ban).join() === '(2),(3)', B('41').orders);
  chk('★<40> は3枚それぞれのボタン（コピーを開く・状態も別々）',
    B('40').orders.map((o) => o.ban + o.check).join() === '(1)チェック前,(2)チェック済,(3)チェック済' &&
    B('40').orders.every((o) => /^https:\/\/drive\/26\.10\.16_26-40377/.test(o.url)), B('40').orders);
  chk('★範囲の無いファイルは依頼Noで結ぶ（年度なしでも）', B('5').check === 'チェック済' && B('5').orders[0].check === 'チェック済', B('5'));
  chk('★範囲が重ならない枝番は付けない', !B('6').check && !B('6').orders[0].check, B('6'));
  chk('空き区画には付けない', !B('7').check && B('7').orders.length === 0, B('7'));
  chk('結び付かない区画は何も出さない', !B('8').check, B('8'));
  chk('★20kは触らない', !raw['20k'][0].check && raw['20k'][0].orders.length === 0, raw['20k'][0]);
  chk('手入力の印はそのまま', B('1').orders[0].src === '手入力');
}

console.log('■ 同じ指図書が両方にあればチェック済');
{
  const s = sb();
  const e = s.ychk_dedupe_([s.ychk_entry_(DONE[0], 'チェック前'), s.ychk_entry_(DONE[0], 'チェック済')]);
  chk('1つにまとめてチェック済', e.length === 1 && e[0].state === 'チェック済', e);
  const e2 = s.ychk_dedupe_([s.ychk_entry_(DONE[0], 'チェック済'), s.ychk_entry_(DONE[0], 'チェック前')]);
  chk('順番が逆でもチェック済', e2.length === 1 && e2[0].state === 'チェック済', e2);
}

console.log('■ Driveのフォルダをたどる（全角の「50Ｋ」・月のフォルダ）');
{
  const s = sb();
  const folders = {
    [s.YCHK_CONFIG.UNCHECKED_ROOT]: [{ id: 'U50', name: '50Ｋ' }, { id: 'U20', name: '20Ｋ' }, { id: 'UB', name: 'バルク' }],
    [s.YCHK_CONFIG.CHECKED_ROOT]: [{ id: 'Y26', name: '2026年' }, { id: 'Y27', name: '2027年' }],
    Y26: [{ id: 'M9', name: '9月' }, { id: 'M10', name: '10月' }, { id: 'M11', name: '11月' }, { id: 'M1', name: '1月' }],
    M10: [{ id: 'C50', name: '50Ｋ' }, { id: 'C30', name: '30Ｋ' }],
    M9: [{ id: 'C50s', name: '50K' }],
    M11: [],
  };
  const pdfs = {
    U50: BEFORE.map((f) => ({ name: f.name, description: f.description, webViewLink: f.url })),
    C50: DONE.map((f) => ({ name: f.name, description: f.description, webViewLink: f.url })),
    C50s: [{ name: '26.09.30_26-60700-0(1)_x.pdf', description: '数量:10\n容器No:HEP60001~HEP60010', webViewLink: 'u' }],
    U20: [{ name: '26.10.16_26-11111-0(1)_x.pdf', description: '', webViewLink: 'u' }],
  };
  const seen = [];
  s.Drive = { Files: { list: (o) => {
    const m = o.q.match(/'([^']+)' in parents/);
    seen.push(o);
    const id = m[1];
    if (/folder/.test(o.q)) return { files: folders[id] || [] };
    return { files: pdfs[id] || [] };
  } } };
  s.Utilities = { formatDate: (d, tz, f) => (f === 'yyyy' ? '2026' : '10') };
  const e = s.ychk_entries_('50k');
  chk('★チェック前（容器種類別/50Ｋ）を読む', e.filter((x) => x.state === 'チェック前').length === 2, e.map((x) => x.name));
  chk('★チェック済（2026年/10月/50Ｋ）を読む', e.filter((x) => x.state === 'チェック済' && /^26\.10/.test(x.name)).length === 4);
  chk('★先月（9月）も見る（半角の「50K」でも）', e.some((x) => x.orderNo === '26-60700'), e.map((x) => x.orderNo));
  chk('20Ｋのフォルダは読まない', !e.some((x) => x.orderNo === '26-11111'));
  chk('★共有ドライブの中も見る指定で呼ぶ', seen.length > 0 && seen.every((o) => o.supportsAllDrives && o.includeItemsFromAllDrives), seen[0]);
  chk('20kは空', s.ychk_entries_('20k').length === 0);
}

console.log('■ 群が2つ入った区画（実物 50k <10>「654,655」）');
{
  /* ★ 実際に起きた：GNo の欄の「654,655」をシートが数の 654655 として持っていて、
       容器番号が 65465401〜65465500 になり、指図書もチェックの状態も付かなかった。 */
  const e = { Logger: { log: () => {} }, JSON, Object, Number, String, Math, Date, Array, isNaN };
  vm.createContext(e);
  vm.runInContext(fs.readFileSync(GAS + 'noda_yard_edit_engine.js', 'utf8'), e);
  const L = (v) => JSON.stringify(e.yard_parseGnoList_(v));
  chk('★数の 654655 は 654・655', L(654655) === '[654,655]', L(654655));
  chk('文字の "654,655" も', L('654,655') === '[654,655]');
  chk('「654・655」「654、655」も', L('654・655') === '[654,655]' && L('654、655') === '[654,655]');
  chk('「654～656」は3つ', L('654～656') === '[654,655,656]', L('654～656'));
  chk('ふつうの群番号1つは今までどおり（null）', e.yard_parseGnoList_(631) === null && e.yard_parseGnoList_('631') === null);
  chk('空は null', e.yard_parseGnoList_('') === null && e.yard_parseGnoList_(null) === null);
  chk('続き番号でない6桁の数は読まない（123999）', e.yard_parseGnoList_(123999) === null);
  chk('1000を超える群は読まない', e.yard_parseGnoList_('654,1655') === null);

  const r = { found: true, pos: '10', groupNo: 654655, rangeStart: 65465401, rangeEnd: 65465500, qty: 100, orders: [] };
  e.yard_applyMultiGno_('50k', r);
  chk('★表示は「654・655」', r.groupNo === '654・655', r.groupNo);
  chk('★範囲は 65301〜65500', r.rangeStart === 65301 && r.rangeEnd === 65500, [r.rangeStart, r.rangeEnd]);
  const r20 = { groupNo: '101,102' };
  e.yard_applyMultiGno_('20k', r20);
  chk('20kの式でも', r20.rangeStart === 55001 && r20.rangeEnd === 55100, [r20.rangeStart, r20.rangeEnd]);
  const rGap = { groupNo: '654,660', rangeStart: 1, rangeEnd: 2 };
  e.yard_applyMultiGno_('50k', rGap);
  chk('飛んでいる群は範囲を出さない（1つの範囲で表せない）', rGap.rangeStart === null && rGap.groupNo === '654・660', rGap);
  const one = { groupNo: 631, rangeStart: 63001, rangeEnd: 63100 };
  e.yard_applyMultiGno_('50k', one);
  chk('1つの群は触らない', one.groupNo === 631 && one.rangeStart === 63001);

  // 直した範囲で、<10> に置いてある 26-50430（チェック前・実物）が付く
  const s2 = sb();
  const ents = s2.ychk_dedupe_([
    s2.ychk_entry_(F('26.10.19_26-50430-0(1)_ひかり工機株式会社.pdf', '得意先コード:0820\n数量:80\n容器No:HEP65301~HEP65380\n容器サイズ:50'), 'チェック前'),
    s2.ychk_entry_(F('26.10.19_26-50430-0(2)_ひかり工機株式会社.pdf', '得意先コード:0820\n数量:80\n容器No:HEP65381~HEP65460\n容器サイズ:50'), 'チェック前'),
  ]);
  const raw = { '50k': [r] };
  s2.ychk_attachToBlocks_(raw, ents, '50k', '2026-10-12');
  chk('★<10> に 26-50430 の (1)(2) が付く', r.orders.length === 2 && r.orders.every((o) => o.no === '26-50430'), r.orders);
  chk('★<10> はチェック前', r.check === 'チェック前', r.check);
}

console.log('■ マップに書いてある残りの範囲を使う（実物 50k <3>・<20>）');
{
  /* ★ 実際に起きた：<3> GNo 555 はマップに「55421～55500・80本」と書き直されて
       いたのに、群番号から計算した 55401〜55500・100本 を出していた。そのため
       10/5に出荷済みの 26-60448（55401〜55420）が「番号」で付いていた。 */
  const e = { Logger: { log: () => {} }, JSON, Object, Number, String, Math, Date, Array, isNaN };
  vm.createContext(e);
  vm.runInContext(fs.readFileSync(GAS + 'noda_yard_edit_engine.js', 'utf8'), e);
  // 50ｋ刷込場シートの1〜8行目（実物の値をそのまま）
  const grid = [
    [],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '上小屋'],
    ['', '', '', '', '', '', '', '', '', '', '底黒', '', '', '', '', '', '', '', '', '', '', '', '644', '< 20 >', '残２０', '634', '< 21 >', '残１'],
    ['', '＜1＞', '626', '', '＜２＞', '625', '', '', '＜３＞', '555', '', '', '', '', '', '651', '', '< 19 >', '残５０', '', '←50/50', '64361', '～', '64400', '63301', '～', '63400'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '65001', '～', '65100', '100', '本', '', '40', '本'],
    ['', '62501', '～', '62600', '62401', '～', '62500', '', '55421', '～', '55500', '-99', '～', '0'],
    ['', '', '', '100本', '', '', '100本', '', '', '80本'],
  ];
  const run = (gno, a1) => { const r = { groupNo: gno, rangeStart: null, rangeEnd: null, qty: 100 };
    const full = e.yard_computeRangeFromGNo_('50k', gno); r.rangeStart = full.start; r.rangeEnd = full.end;
    e.yard_applyLiveRange_('50k', r, grid, a1); return r; };
  const r3 = run(555, 'J4');
  chk('★<3> は 55421〜55500', r3.rangeStart === 55421 && r3.rangeEnd === 55500, r3);
  chk('★<3> は 80本', r3.qty === 80, r3.qty);
  const r20 = run(644, 'W3');
  chk('★<20> は 64361〜64400・40本', r20.rangeStart === 64361 && r20.rangeEnd === 64400 && r20.qty === 40, r20);
  const r1 = run(626, 'C4');
  chk('<1> は書き直しなし（62501〜62600・100本のまま）', r1.rangeStart === 62501 && r1.rangeEnd === 62600 && r1.qty === 100 && !r1.rangeFromMap, r1);
  const r21 = run(634, 'Z3');
  chk('<21> も満杯のまま', r21.rangeStart === 63301 && r21.rangeEnd === 63400 && !r21.rangeFromMap, r21);
  const r19 = run(651, 'P4');
  chk('<19>（65001～65100）も満杯のまま', r19.rangeStart === 65001 && r19.rangeEnd === 65100 && !r19.rangeFromMap, r19);
  chk('★隣の区画の範囲は拾わない（<2> の群で <3> の並びを見ても使わない）',
    e.yard_liveRangeNear_(grid, 'F4', 62401, 62500).a === 62401);
  chk('空きの「-99～0」は使わない', e.yard_liveRangeNear_(grid, 'M4', 1, 100) === null);

  // 直した範囲だと、出荷済みの 26-60448 は重ならない
  const s3 = sb();
  const ents = s3.ychk_dedupe_([
    s3.ychk_entry_(F('26.10.05_26-60448-0(1)_(株)りゅうせき北部物流.pdf', '得意先コード:G716\n数量:20\n容器No:HEP55401~HEP55420'), 'チェック済'),
    s3.ychk_entry_(F('26.10.14_26-60821-0(1)_沖縄ガス 中部支社.pdf', '得意先コード:9300\n数量:80\n容器No:HEP55421~HEP55500\n品名:新軽量118L (50kg)'), 'チェック前'),
  ]);
  const blk = { found: true, pos: '3', rangeStart: 55421, rangeEnd: 55500, orders: [{ no: '26-60821', url: 'o', src: '手入力' }] };
  s3.ychk_attachToBlocks_({ '50k': [blk] }, ents, '50k', '2026-10-12');
  chk('★<3> に 26-60448 は付かない', blk.orders.length === 1 && blk.orders[0].no === '26-60821', blk.orders);
  chk('★<3> は 26-60821 だけでチェック前', blk.check === 'チェック前', blk.check);
}

console.log('■ 出荷希望日が過ぎた指図書は、番号の重なりでは付けない');
{
  const s4 = sb();
  const ents = s4.ychk_dedupe_([
    s4.ychk_entry_(F('26.10.05_26-60448-0(1)_(株)りゅうせき北部物流.pdf', '数量:20\n容器No:HEP55401~HEP55420'), 'チェック済'),
  ]);
  chk('名前から日付', ents[0].dateKey === '2026-10-05', ents[0].dateKey);
  // マップが直されていない（100本のまま）でも、過ぎた指図書は付かない
  const blk = { found: true, pos: '3', rangeStart: 55401, rangeEnd: 55500, orders: [] };
  s4.ychk_attachToBlocks_({ '50k': [blk] }, ents, '50k', '2026-10-12');
  chk('★10/5出荷のものは 10/12 には付かない', blk.orders.length === 0 && !blk.check, blk);
  const blk2 = { found: true, pos: '3', rangeStart: 55401, rangeEnd: 55500, orders: [] };
  s4.ychk_attachToBlocks_({ '50k': [blk2] }, ents, '50k', '2026-10-05');
  chk('出荷当日はまだ付ける', blk2.orders.length === 1, blk2);
  const blk3 = { found: true, pos: '3', rangeStart: 55401, rangeEnd: 55500, orders: [{ no: '26-60448', src: '手入力' }] };
  s4.ychk_attachToBlocks_({ '50k': [blk3] }, ents, '50k', '2026-10-12');
  chk('人が打った依頼Noは過ぎていても残す（状態も付ける）', blk3.orders[0].check === 'チェック済', blk3.orders);

  const ycs = { Logger: { log: () => {} }, JSON, Object, Number, String, Math, Date, Array, isNaN,
    shipact_shortDate_: (d) => String(d).slice(5).replace('-', '/'), shipact_fileUrl_: (id) => 'u/' + id };
  vm.createContext(ycs);
  vm.runInContext(fs.readFileSync(GAS + 'noda_yard_cno_match.js', 'utf8'), ycs);
  const idx = { ranges: [{ no: '26-60448', prefix: 'HEP', a: 55401, b: 55420, date: '2026-10-05', size: '50kg', qty: 20, check: '一致' }], byOrder: {} };
  const raw = { '50k': [{ found: true, pos: '3', rangeStart: 55401, rangeEnd: 55500, orders: [] }], '20k': [] };
  ycs.ycno_attachToBlocks_(raw, idx, '2026-10-12');
  chk('★容器番号の索引（実績シート）からも過ぎたものは付けない', raw['50k'][0].orders.length === 0, raw['50k'][0].orders);
  const raw2 = { '50k': [{ found: true, pos: '3', rangeStart: 55401, rangeEnd: 55500, orders: [] }], '20k': [] };
  ycs.ycno_attachToBlocks_(raw2, idx, '2026-10-01');
  chk('出荷前なら付ける', raw2['50k'][0].orders.length === 1 && raw2['50k'][0].orders[0].src === '番号');
}

console.log('■ 枝番ごとにチェック済のコピーを開く（実物 50k <3> 26-60821）');
{
  /* ★ 実際に起きた：<3> の「26-60821 ✓済」を押すと、元の指図書（書き込みなし）の
       (3)（59708〜59721・<7> のもの）が開き、チェックされていないように見えた。
       ◆チェック完了 の (1) には赤のチェックと押印がある。 */
  const s5 = sb();
  const DONE_URL = 'https://drive.google.com/file/d/1ZxYyFlWEoMW_ofU0WmYs4lY2C_jK-VRC/view';
  const ents = s5.ychk_dedupe_([
    s5.ychk_entry_(F('26.10.14_26-60821-0(1)_沖縄ガス 中部支社.pdf', '得意先コード:9300\n数量:80\n容器No:HEP55421~HEP55500\n品名:新軽量118L (50kg)', DONE_URL), 'チェック済'),
    s5.ychk_entry_(F('26.10.14_26-60821-0(2)_沖縄ガス 中部支社.pdf', '得意先コード:9300\n数量:6\n品名:新軽量118L (50kg)'), 'チェック済'),
    s5.ychk_entry_(F('26.10.14_26-60821-0(3)_沖縄ガス 中部支社.pdf', '得意先コード:9300\n容器No:HEP59708~HEP59721\n品名:#1 18 L (50 kg) LPX\n_読めず:1'), 'チェック済'),
  ]);
  const b3 = { found: true, pos: '3', rangeStart: 55421, rangeEnd: 55500,
    orders: [{ no: '26-60821', url: 'https://drive.google.com/file/d/1etf6V4s_ibvwIHoTDJc-SguCYDLvJEdu/view', src: '手入力' }] };
  const b7 = { found: true, pos: '7', rangeStart: 59701, rangeEnd: 59800,
    orders: [{ no: '26-60821', url: 'orig', src: '手入力' }] };
  s5.ychk_attachToBlocks_({ '50k': [b3, b7] }, ents, '50k', '2026-10-12');
  chk('★<3> の (1) はチェック完了のコピー（書き込みあり）を開く', b3.orders[0].ban === '(1)' && b3.orders[0].url === DONE_URL, b3.orders[0]);
  chk('★<3> に (3)（59708〜59721）は付かない', !b3.orders.some((o) => o.ban === '(3)'), b3.orders.map((o) => o.ban));
  chk('<3> に範囲の分からない (2) は付ける', b3.orders.some((o) => o.ban === '(2)'));
  chk('★<7> には (3) が付く（数量が読めなくても範囲が重なる）', b7.orders.some((o) => o.ban === '(3)'), b7.orders.map((o) => o.ban));
  chk('<7> に (1)（55421〜55500）は付かない', !b7.orders.some((o) => o.ban === '(1)'));
  chk('元の指図書（書き込みなし）のURLは残らない', !b3.orders.some((o) => /1etf6V4s/.test(o.url)), b3.orders.map((o) => o.url));
}

console.log('■ 配車表のマスも50kはヤードと同じ（枝番ごと・コピーを開く）');
{
  const s6 = sb();
  const DONE1 = 'https://drive/done1';
  const ents = s6.ychk_dedupe_([
    s6.ychk_entry_(F('26.10.14_26-60821-0(1)_沖縄ガス 中部支社.pdf', '数量:80\n容器No:HEP55421~HEP55500', DONE1), 'チェック済'),
    s6.ychk_entry_(F('26.10.14_26-60821-0(2)_沖縄ガス 中部支社.pdf', '数量:6'), 'チェック済'),
    s6.ychk_entry_(F('26.10.14_26-60821-0(3)_沖縄ガス 中部支社.pdf', '容器No:HEP59708~HEP59721'), 'チェック前'),
    s6.ychk_entry_(F('26.10.21_26-60821-0(4)_沖縄ガス 中部支社.pdf', '数量:10'), 'チェック前'),
  ]);
  // 配車表のマス「60821→」（年度なし）
  const out = s6.ychk_splitOrders_([{ no: '60821', url: 'orig', date: '10/14' }], ents, '2026-10-14');
  chk('★枝番ごとに3つ（10/21の便の (4) は混ぜない）', out.map((o) => o.ban).join() === '(1),(2),(3)', out.map((o) => o.ban));
  chk('★(1) はチェック完了のコピーを開いて ✓済', out[0].url === DONE1 && out[0].check === 'チェック済', out[0]);
  chk('(3) はチェック前', out[2].check === 'チェック前');
  chk('依頼Noの書き方（年度なし）はそのまま', out.every((o) => o.no === '60821'));
  const g = s6.ychk_splitOrders_([{ no: '60821', url: 'x', guess: true }], ents, '2026-10-15');
  chk('推定の印も引き継ぐ・前後1日の便を拾う', g.length === 3 && g.every((o) => o.guess), g);
  const other = [{ no: '30412', url: 'u', date: '9/10' }];
  chk('コピーの無い依頼No（20kなど）はそのまま', JSON.stringify(s6.ychk_splitOrders_(other, ents, '2026-09-10')) === JSON.stringify(other));
  const far = s6.ychk_splitOrders_([{ no: '60821', url: 'x' }], ents, '2026-11-30');
  chk('日付が合うものが無ければ全部', far.length === 4, far.map((o) => o.ban));
}

// ===== 画面（390px） =====
(async () => {
  const { chromium } = require('playwright');
  const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
  const html = fs.readFileSync(GAS + 'noda_dashboard.html', 'utf8');
  const E = { updated: '2026-10-11 12:00', error: null };
  const yard = JSON.stringify({ '50k': [
    { pos: '4', found: true, kind: 'fill', groupNo: 627, rangeStart: 62601, rangeEnd: 62700, qty: 100, check: 'チェック済',
      orders: [{ no: '26-20354', ban: '(1)', url: 'https://drive.google.com/file/d/a/view', date: '10/16', src: '手入力', check: 'チェック済' },
               { no: '26-20355', url: 'https://drive.google.com/file/d/b/view', date: '10/16', src: '番号', check: 'チェック前' }] },
    { pos: '6', found: true, kind: 'fill', groupNo: 647, rangeStart: 64601, rangeEnd: 64700, qty: 100, check: 'チェック前',
      orders: [{ no: '26-50406', url: 'https://drive.google.com/file/d/c/view', date: '10/13', src: '手入力', check: 'チェック前' },
               { no: '26-60768', url: 'https://drive.google.com/file/d/d/view', date: '10/14', src: '手入力' }] },
  ], '20k': [] });
  const data = {
    getInventoryDashboardData: { ...E, sizes: {}, totals: { total: 1, '50k': 1, '20k': 0 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null },
    getShippingDashboardData: { ...E, folder: '10月', total: 1, todayCount: 0, recent: [] },
    getOrderPlanDashboardData: { ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 0 },
    getDispatchTodayData: { ...E, file: null, dateLabel: '10/11', shipments: [], week: [] },
    getYardMapUpdatesBothWithOrderText: yard,
    getInventoryTrendData: { ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} },
    getMonthlyCombinedData: { ...E, sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null },
    getYardCapacitySummary: { ...E, locations: 1, a20: 0, m20: 0, a30: 0, m30: 0, a50: 0, m50: 0, total: 0, max: 0, nearFull: 0, over: 0, sheetUrl: 'x' },
    getYardCapacityUrl: { url: 'x', error: null },
    getArmShipPlan: { updated: 'x', error: null, total: 0, days: [], byKind: [], sourceName: null, snapshotAt: null, stale: false, pdfUrl: null, pdfName: null },
    getArmMonthlyData: { updated: 'x', error: null, months: [], kinds: [], total: 0, startMonth: null, today: null, currentAll: null, sourceName: null, harvestedAt: null },
    getDispatchGridData: { ...E, source: 'Excel', editable: false, weekOffset: 0, weekLabel: null, hasPrev: false, hasNext: false, days: [], trucks: [], totals: {} },
  };
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await page.addInitScript((d) => {
    window.open = () => null;
    function mk() { let ok = null;
      const px = new Proxy({}, { get(t, fn) {
        if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; };
        if (fn === 'withFailureHandler') return () => px;
        return () => { setTimeout(() => { if (ok) ok(d[fn] || { error: null }); }, 0); return px; };
      } });
      return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, data);
  const tmp = SP + '/ychk_page.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: 'ヤード・現場' }).first().click();
  await page.waitForTimeout(800);

  console.log('■ 画面：マップの印・明細・凡例・一覧');
  const marks = await page.evaluate(() => [...document.querySelectorAll('svg circle')]
    .filter((c) => c.getAttribute('stroke') === '#059669').map((c) => c.getAttribute('fill')));
  chk('★チェック済の区画に緑の印（チェック前には出さない）', marks.length === 1 && marks[0] === '#059669', marks);
  chk('凡例に「チェック済」', /チェック済（白抜きは一部）/.test(await page.evaluate(() => document.body.innerText)));

  await page.evaluate(() => {
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<4>');
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  let t = await page.evaluate(() => document.body.innerText);
  chk('★明細の状態にチェック済', /引当済\nチェック済/.test(t), t.slice(t.indexOf('状態'), t.indexOf('状態') + 60));
  chk('★指図書ボタンに「✓済」と「チェック前」', /26-20354\(1\)（10\/16） を開く\n?✓済/.test(t) && /26-20355（10\/16） を開く\n?番号\n?チェック前/.test(t),
    t.slice(t.indexOf('出荷作業指図書'), t.indexOf('出荷作業指図書') + 200));
  await page.screenshot({ path: SP + '/ychk_detail.png' });

  await page.locator('button', { hasText: '一覧' }).first().click();
  await page.waitForTimeout(300);
  t = await page.evaluate(() => document.body.innerText);
  chk('★一覧にも「✓済」', /<4>[\s\S]{0,60}✓済/.test(t), t.slice(t.indexOf('<4>'), t.indexOf('<4>') + 80));
  chk('チェック前は一覧に出さない（引当済で分かる）', !/<6>[\s\S]{0,60}✓済/.test(t));

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
