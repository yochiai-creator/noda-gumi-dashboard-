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
  s.ychk_attachToBlocks_(raw, entries(s), '50k');
  const B = (p) => raw['50k'].find((r) => r.pos === p);

  chk('★チェック前の区画', B('1').check === 'チェック前' && B('2').check === 'チェック前', [B('1').check, B('2').check]);
  chk('注文にもチェック前', B('1').orders[0].check === 'チェック前');
  chk('★コピーが1枚に決まればコピーを開く', B('1').orders[0].url === 'https://drive/' + BEFORE[1].name, B('1').orders[0].url);
  chk('★3枚のうち2枚済なら「一部チェック済」', B('40').check === '一部チェック済', B('40').check);
  chk('★済だけが入る区画は「チェック済」', B('41').check === 'チェック済', B('41').check);
  chk('★依頼Noが無くても容器Noの重なりで足す（番号）',
    B('41').orders.length === 1 && B('41').orders[0].no === '26-40377' && B('41').orders[0].src === '番号', B('41').orders);
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
  s2.ychk_attachToBlocks_(raw, ents, '50k');
  chk('★<10> に 26-50430 が付く', r.orders.length === 1 && r.orders[0].no === '26-50430', r.orders);
  chk('★<10> はチェック前', r.check === 'チェック前', r.check);
}

// ===== 画面（390px） =====
(async () => {
  const { chromium } = require('playwright');
  const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
  const html = fs.readFileSync(GAS + 'noda_dashboard.html', 'utf8');
  const E = { updated: '2026-10-11 12:00', error: null };
  const yard = JSON.stringify({ '50k': [
    { pos: '4', found: true, kind: 'fill', groupNo: 627, rangeStart: 62601, rangeEnd: 62700, qty: 100, check: 'チェック済',
      orders: [{ no: '26-20354', url: 'https://drive.google.com/file/d/a/view', date: '10/16', src: '手入力', check: 'チェック済' },
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
  chk('★指図書ボタンに「✓済」と「チェック前」', /26-20354（10\/16） を開く\n?✓済/.test(t) && /26-20355（10\/16） を開く\n?番号\n?チェック前/.test(t),
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
