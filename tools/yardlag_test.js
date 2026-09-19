// 入込場マップを指で動かしたときの重さを実測する。
//
// ★ なぜ要るのか
//   「50kg入れ込み場がラグい」の直しを守るため。原因は2つあった。
//     (1) touchmove のたびに setZoom していたので、指を動かすたびにマップ全体が
//         React で描き直されていた
//     (2) 区画の文字（20kのマップで232個）の描き直しが重い
//   どちらも数字で見ないと直したか分からないので、実測する。
//
// ★ CPUを6分の1に落として測る。デスクトップのままだと速すぎて差が出ない。
const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
const html = fs.readFileSync('/home/user/noda-gumi-dashboard-/gas/noda_dashboard.html', 'utf8');
const E = { updated: '2026-09-19 08:00', error: null };

// 50k は32区画。実運用では指図書が付く。live で全区画に指図書を載せて重い側に寄せる
const live50 = {}, live20 = {};
for (let p = 1; p <= 32; p++) {
  live50[String(p)] = { groupNo: 400 + p, rangeStart: 40000 + p * 100, rangeEnd: 40099 + p * 100,
    qty: 100, kind: 'fill', shipDate: '2026-09-20',
    orders: [{ no: '26-3' + (1000 + p), url: 'https://drive.google.com/file/d/x' + p + '/view' }] };
}
for (let p = 1; p <= 70; p++) {
  live20[String(p)] = { groupNo: 500 + p, rangeStart: 70000 + p * 50, rangeEnd: 70049 + p * 50,
    qty: 50, kind: 'fill', shipDate: '2026-09-20',
    orders: [{ no: '26-6' + (1000 + p), url: 'https://drive.google.com/file/d/y' + p + '/view' }] };
}
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {}, totals: { total: 7435, '50k': 1429, '20k': 4682 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 0 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/19', shipments: [], week: [] }),
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({ '50k': live50, '20k': live20 }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'x', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null }),
  getYardCapacitySummary: () => ({ ...E, locations: 36, a20: 0, m20: 0, a30: 0, m30: 0, a50: 0, m50: 0, total: 0, max: 0, nearFull: 0, over: 0, sheetUrl: 'x' }),
  getYardCapacityUrl: () => ({ url: 'x', error: null }),
  getArmShipPlan: () => ({ updated: 'x', error: null, total: 0, days: [], byKind: [], sourceName: null, snapshotAt: null, stale: false, pdfUrl: null, pdfName: null }),
  getArmMonthlyData: () => ({ updated: 'x', error: null, months: [], kinds: [], total: 0, startMonth: null, today: null, currentAll: null, sourceName: null, harvestedAt: null }),
  getDispatchGridData: () => ({ ...E, source: 'Excel', editable: false, weekOffset: 0, weekLabel: null, hasPrev: false, hasNext: false, days: [], trucks: [], totals: {} }),
};
(async () => {
  let pass = 0, fail = 0;
  const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
    else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  await page.addInitScript((d) => {
    function mk() { let ok = null;
      const o = { withSuccessHandler(f) { ok = f; return o; }, withFailureHandler() { return o; } };
      Object.keys(d).forEach((fn) => { o[fn] = () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return o; }; });
      return o; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, data);
  const tmp = SP + '/yardlag.html'; fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.locator('button', { hasText: 'ヤード・現場' }).first().click();
  await page.waitForTimeout(1500);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

  // 計測そのものの重さ（床）。これ以下には下がらない
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'floor';
    d.style.cssText = 'position:fixed;left:0;top:300px;width:300px;height:200px;z-index:9999';
    document.body.appendChild(d);
  });
  const drag = async (sel, opts) => page.evaluate(async ([sel, opts]) => {
    /* ★ querySelector('main svg') は24pxのアイコンを拾ってしまう。
         マップを指すときは一番大きいSVGを選ぶ。 */
    const el = sel
      ? document.querySelector(sel)
      : [...document.querySelectorAll('main svg')]
          .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t],
        bubbles: true, cancelable: true });
    };
    const frames = []; let last = performance.now(); let stop = false;
    const tick = () => { const n = performance.now(); frames.push(n - last); last = n;
      if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const vb0 = el.getAttribute('viewBox');
    el.dispatchEvent(mk('touchstart', cx, cy));
    let midDrag = null;
    for (let i = 0; i < 40; i++) {
      el.dispatchEvent(mk('touchmove', cx - i * 2, cy - i));
      await new Promise((r) => requestAnimationFrame(r));
      if (i === 20) {
        const t = el.querySelector('text');
        midDrag = { cls: el.getAttribute('class') || '',
          文字が見えている: !!(t && getComputedStyle(t).display !== 'none'),
          viewBox: el.getAttribute('viewBox') };
      }
    }
    const vbEnd = el.getAttribute('viewBox');
    el.dispatchEvent(mk('touchend', cx - 80, cy - 40));
    stop = true;
    await new Promise((r) => setTimeout(r, 200));
    const t2 = el.querySelector('text');
    const fs = frames.slice(3); fs.sort((a, b) => a - b);
    return {
      中央値ms: Math.round(fs[Math.floor(fs.length / 2)] || 0),
      最悪ms: Math.round(fs[fs.length - 1] || 0),
      ノード: el.querySelectorAll('*').length,
      前のviewBox: vb0, 動かし中: midDrag, 離す直前のviewBox: vbEnd,
      離したあとのviewBox: el.getAttribute('viewBox'),
      離したあとのclass: el.getAttribute('class') || '',
      離したあと文字が見えている: !!(t2 && getComputedStyle(t2).display !== 'none'),
    };
  }, [sel, opts]);

  const floor = await drag('#floor');
  console.log('   床（計測そのものの重さ）:', floor.中央値ms + 'ms');

  console.log('■ 50k入込場を指で動かす');
  const zin = page.locator('main button', { hasText: '＋' }).first();
  if (await zin.count()) { await zin.click(); await zin.click(); await page.waitForTimeout(500); }
  const r50 = await drag(null);
  console.log('   50k:', JSON.stringify({ 中央値ms: r50.中央値ms, 最悪ms: r50.最悪ms, ノード: r50.ノード }));
  chk('★指に付いてくる（1コマが床の2倍以内）', r50.中央値ms <= floor.中央値ms * 2,
    { 測定: r50.中央値ms, 床: floor.中央値ms });
  chk('動かすと表示範囲が変わる', r50.動かし中 && r50.動かし中.viewBox !== r50.前のviewBox,
    [r50.前のviewBox, r50.動かし中 && r50.動かし中.viewBox]);
  chk('★動かしているあいだは区画の文字を消す（描き直しが重いのは文字）',
    r50.動かし中 && !r50.動かし中.文字が見えている, r50.動かし中);
  chk('★指を離したら文字が戻る', r50.離したあと文字が見えている === true, r50);
  chk('離したあとに印が残らない', r50.離したあとのclass.indexOf('ymap-drag') === -1,
    r50.離したあとのclass);
  chk('★離したあとも表示範囲が戻らない（stateに移せている）',
    r50.離したあとのviewBox === r50.離す直前のviewBox,
    [r50.離す直前のviewBox, r50.離したあとのviewBox]);

  console.log('■ 20k入込場も同じ');
  await page.locator('main button', { hasText: '20k' }).first().click();
  await page.waitForTimeout(800);
  const z2 = page.locator('main button', { hasText: '＋' }).first();
  if (await z2.count()) { await z2.click(); await z2.click(); await page.waitForTimeout(500); }
  const r20 = await drag(null);
  console.log('   20k:', JSON.stringify({ 中央値ms: r20.中央値ms, 最悪ms: r20.最悪ms, ノード: r20.ノード }));
  chk('★区画が倍あっても指に付いてくる', r20.中央値ms <= floor.中央値ms * 2,
    { 測定: r20.中央値ms, 床: floor.中央値ms, ノード: r20.ノード });
  chk('動かしているあいだは文字を消す', r20.動かし中 && !r20.動かし中.文字が見えている, r20.動かし中);
  chk('指を離したら文字が戻る', r20.離したあと文字が見えている === true, r20);

  console.log('■ 区画のタップ');
  {
    /* ★ 指で動かしたあとは click が飛んでこないので、「タップ扱いにしない」印が
         残ったままになり、次の本物のタップが1回分食われていた。
       ★ マップは画面のずっと下にあり当たり判定が使えないので、区画の <g> に
         直接イベントを送って確かめる。 */
    const tapBlock = async (idx) => page.evaluate(async (idx) => {
      const el = [...document.querySelectorAll('main svg')]
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      // 区画は <g onClick> の中の rect。背景の rect（親がsvg）ではない
      const rects = [...el.querySelectorAll('g > rect')];
      const r = rects[idx % rects.length];
      if (!r) return { err: '区画が見つからない' };
      const snap = () => document.querySelector('main').innerHTML.length;
      const before = snap();
      const box = r.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const mk = (type) => {
        const t = new Touch({ identifier: 2, target: r, clientX: x, clientY: y });
        return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t],
          bubbles: true, cancelable: true });
      };
      r.dispatchEvent(mk('touchstart'));
      r.dispatchEvent(mk('touchend'));          // 動かさない＝タップ
      r.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true,
        clientX: x, clientY: y }));
      await new Promise((k) => setTimeout(k, 350));
      return { before, after: snap() };
    }, idx);

    await page.locator('main button', { hasText: '全体に戻す' }).first().click();
    await page.waitForTimeout(400);
    const plain = await tapBlock(3);
    chk('区画をタップすると中身が開く（動かす前）', !plain.err && plain.after !== plain.before, plain);

    // 指で動かしてから、続けてタップする
    await drag(null);
    // ★ さっきと違う区画をタップする。同じ区画だと中身が変わらず、
    //   直っていても直っていなくても差が出ない
    const afterDrag = await tapBlock(9);
    chk('★動かした直後でも1回のタップで開く',
      !afterDrag.err && afterDrag.after !== afterDrag.before, afterDrag);
  }

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
