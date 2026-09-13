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
  getYardCapacitySummary: () => ({ updated: '2026-09-09 12:00', error: null, locations: 36,
    a20: 15880, m20: 20308, a30: 0, m30: 0, a50: 15800, m50: 19100,
    total: 31680, max: 39408, nearFull: 3, over: 1,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit' }),
  getYardCapacityUrl: () => ({ url: 'https://script.google.com/a/x/exec?page=yard', error: null }),
  getArmShipPlan: () => ({ updated: 'x', error: null, total: 0, days: [],
    sourceName: null, snapshotAt: null, stale: false, pdfUrl: null, pdfName: null }),
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
  const tmp = SP + '/yardcap_page.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  let pass = 0, fail = 0;
  const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
    else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

  const tab = page.locator('button', { hasText: '野外置場' }).first();
  chk('「野外置場」タブがある', await tab.count() > 0);
  await tab.click();
  await page.waitForTimeout(1200);

  const kpi = await page.evaluate(() => [...document.querySelectorAll('main .grid > div')]
    .map((c) => c.innerText.replace(/\n+/g, ' / ')).slice(0, 4));
  console.log('   KPI:', JSON.stringify(kpi, null, 0));
  chk('KPIに合計本数が出る', kpi.some((t) => t.includes('31,680')), kpi);
  chk('KPIに20kg実績が出る', kpi.some((t) => t.includes('15,880')), kpi);
  chk('KPIに50kg実績が出る', kpi.some((t) => t.includes('15,800')), kpi);
  chk('満杯が1か所として出る', kpi.some((t) => t.includes('満杯の置場') && t.includes('1')), kpi);

  const fr = await page.evaluate(() => { const f = document.querySelector('main iframe');
    if (!f) return null; const r = f.getBoundingClientRect();
    return { src: f.getAttribute('src'), w: Math.round(r.width), h: Math.round(r.height) }; });
  console.log('   iframe:', JSON.stringify(fr));
  chk('iframeが ?page=yard を読んでいる', fr && /page=yard/.test(fr.src), fr);
  chk('iframeが画面幅いっぱい', fr && fr.w >= 300, fr);
  chk('iframeに高さがある', fr && fr.h >= 400, fr);

  const links = await page.evaluate(() => [...document.querySelectorAll('main a')].map((a) => a.textContent.trim()));
  chk('「別画面で開く」がある', links.includes('別画面で開く'), links);
  chk('「元のシートを開く」がある', links.includes('元のシートを開く'), links);

  const over = await page.evaluate(() => ({
    bodyScrollW: document.body.scrollWidth, clientW: document.documentElement.clientWidth }));
  chk('横にはみ出していない', over.bodyScrollW <= over.clientW + 1, over);

  await page.screenshot({ path: SP + '/yardcap_tab.png', fullPage: false });
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
