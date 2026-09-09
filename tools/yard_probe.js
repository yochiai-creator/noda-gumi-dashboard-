// 20kマップの右端（位置63〜70＝小容器ボビン）が見える範囲にあるかを実測する。
const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
const html = fs.readFileSync('/home/user/noda-gumi-dashboard-/gas/noda_dashboard.html', 'utf8');
const E = { updated: '2026-09-09 12:00', error: null };
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {}, totals: { total: 7435, '50k': 1429, '20k': 4682 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 602 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/9', shipments: [], week: [] }),
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({ '50k': [], '20k': [] }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'x', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null }),
  getDispatchGridData: () => ({ ...E, source: 'Excel', editable: false, weekOffset: 0, weekLabel: null, hasPrev: false, hasNext: false, days: [], trucks: [], totals: {} }),
};
(async () => {
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
  const tmp = SP + '/yard.html'; fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.locator('button', { hasText: 'ヤード・現場' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: '20k 入込場' }).first().click();
  await page.waitForTimeout(800);

  // ★「小容器ボビンへ」を押して、その一帯が読める大きさになるかを測る
  const btn = page.locator('button', { hasText: '小容器ボビン' }).first();
  const hasBtn = await btn.count() > 0;
  console.log('「小容器ボビンへ」ボタン:', hasBtn ? 'あり' : '★なし');
  const before = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('svg')].find((s) => s.getAttribute('viewBox') && s.querySelector('rect'));
    const t = [...svg.querySelectorAll('text')].find((x) => x.textContent === '小容器ボビン');
    const r = t ? t.getBoundingClientRect() : null;
    const b = [...svg.querySelectorAll('text')].filter((x) => /^<?(6[3-9]|70)>?$/.test(x.textContent || ''));
    return { 見出し: t ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
             区画ラベル幅: b.length ? Math.round(b[0].getBoundingClientRect().width) : null };
  });
  console.log('寄る前 :', JSON.stringify(before));
  if (hasBtn) {
    await btn.click(); await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const svg = [...document.querySelectorAll('svg')].find((s) => s.getAttribute('viewBox') && s.querySelector('rect'));
      const t = [...svg.querySelectorAll('text')].find((x) => x.textContent === '小容器ボビン');
      const cr = svg.parentElement.getBoundingClientRect();
      const b = [...svg.querySelectorAll('text')].filter((x) => /^<?(6[3-9]|70)>?$/.test(x.textContent || ''));
      const vis = b.filter((x) => { const r = x.getBoundingClientRect(); return r.x >= cr.x - 1 && r.right <= cr.right + 1 && r.width > 0; });
      return { viewBox: svg.getAttribute('viewBox'),
               見出し幅: t ? Math.round(t.getBoundingClientRect().width) : null,
               区画ラベル幅: b.length ? Math.round(b[0].getBoundingClientRect().width) : null,
               見える区画数: vis.length + '/' + b.length };
    });
    console.log('寄った後:', JSON.stringify(after));
    await page.screenshot({ path: SP + '/yard_focus.png', fullPage: false });
    await page.locator('button', { hasText: '全体に戻す' }).first().click();
    await page.waitForTimeout(400);
  }

  const info = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('svg')].find((s) => s.getAttribute('viewBox') && s.querySelector('rect'));
    if (!svg) return { err: 'svgなし' };
    const cont = svg.parentElement;
    const cs = getComputedStyle(cont);
    const cr = cont.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    // 位置番号のテキストから、各区画の画面上の位置を拾う
    const marks = [];
    svg.querySelectorAll('text').forEach((t) => {
      const m = (t.textContent || '').match(/^<?(\d+)>?$/);
      if (!m) return;
      const r = t.getBoundingClientRect();
      marks.push({ pos: Number(m[1]), x: Math.round(r.x), w: Math.round(r.width), visible: r.x >= cr.x - 1 && r.right <= cr.right + 1 });
    });
    return {
      viewBox: svg.getAttribute('viewBox'),
      container: { x: Math.round(cr.x), w: Math.round(cr.width), overflowX: cs.overflowX, overflowY: cs.overflowY },
      svg: { x: Math.round(sr.x), w: Math.round(sr.width) },
      scrollW: cont.scrollWidth, clientW: cont.clientWidth,
      marks: marks.sort((a, b) => a.pos - b.pos),
    };
  });
  console.log('viewBox      :', info.viewBox);
  console.log('コンテナ     :', JSON.stringify(info.container));
  console.log('SVG          :', JSON.stringify(info.svg));
  console.log('スクロール幅 :', info.scrollW, '/ 見える幅', info.clientW);
  const outdoor = (info.marks || []).filter((m) => m.pos >= 63);
  const inner = (info.marks || []).filter((m) => m.pos < 63);
  console.log('区画数       : 全' + (info.marks || []).length + ' / 63以上 ' + outdoor.length);
  console.log('63以上の区画 :', JSON.stringify(outdoor));
  console.log('見えない区画 :', JSON.stringify((info.marks || []).filter((m) => !m.visible).map((m) => m.pos)));
  await page.screenshot({ path: SP + '/yard_20k.png', fullPage: false });
  await b.close();
})();
