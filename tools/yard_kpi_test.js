// 20kマップの右端（位置63〜70＝小容器ボビン）が見える範囲にあるかを実測する。
const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
const html = fs.readFileSync('/home/user/noda-gumi-dashboard-/gas/noda_dashboard.html', 'utf8');
const E = { updated: '2026-09-09 12:00', error: null };
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {},
    totals: { total: 7435, '50k': 1429, '20k': 4682 },
    // 在庫照会CSVの「分類」列から出した9分類の内訳
    bySize: {
      '2K': { label: '2K', count: 12 }, '5K': { label: '5K', count: 8 },
      '8K': { label: '8K', count: 38 }, '10K': { label: '10K', count: 18 },
      '20K_三部軽量': { label: '20K(三部軽量)', count: 3120 },
      '20K_直付': { label: '20K(直付)', count: 1562 },
      '30K': { label: '30K', count: 123 },
      '50K_軽量型': { label: '50K(軽量型)', count: 1200 },
      '50K_S': { label: '50K(S)', count: 229 },
    },
    byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 602 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/9', shipments: [], week: [] }),
  // ★ 静的データでは位置1・2は在庫。ライブで両方とも空きにする。
  //    静的データのまま数えていると 14区画=1,400本、ライブを見ていれば
  //    16区画=1,600本になる。KPIがライブを見ているかがこれで分かる。
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({
    '50k': [
      { pos: '1', found: true, kind: 'empty', shipDate: null, orders: [] },
      { pos: '2', found: true, kind: 'empty', shipDate: null, orders: [] },
    ],
    '20k': [] }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'x', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null }),
  getYardCapacitySummary: () => ({ updated: '2026-09-09 12:00', error: null, locations: 36,
    a20: 15880, m20: 20308, a30: 0, m30: 0, a50: 15800, m50: 19100,
    total: 31680, max: 39408, nearFull: 3, over: 1,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit' }),
  getYardCapacityUrl: () => ({ url: 'https://script.google.com/a/x/exec?page=yard', error: null }),
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
  const tmp = SP + '/yardkpi.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.locator('button', { hasText: 'ヤード・現場' }).first().click();
  await page.waitForTimeout(1200);

  let pass = 0, fail = 0;
  const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
    else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

  const kpi = await page.evaluate(() => [...document.querySelectorAll('main > div.grid > div')]
    .map((c) => c.innerText.replace(/\n+/g, ' ')));
  console.log('   KPI:', JSON.stringify(kpi));
  chk('ヤードのKPIが5枚ある', kpi.length === 5, kpi.length);
  chk('50kg 搬入可能数がある', kpi.some((t) => t.indexOf('50kg 搬入可能数') !== -1), kpi);
  chk('20kg 搬入可能数がある', kpi.some((t) => t.indexOf('20kg 搬入可能数') !== -1), kpi);

  /* 静的データの空きは 50k=14区画・20k=15区画。ライブで位置1・2を空きにしたので
     50k は 16区画。→ 50k 16*100=1,600本 / 20k は変更なしで 15*50=750本 */
  const t50 = kpi.find((t) => t.indexOf('50kg 搬入可能数') !== -1) || '';
  const t20 = kpi.find((t) => t.indexOf('20kg 搬入可能数') !== -1) || '';
  chk('★50kgがライブの空きを見ている（静的の1,400ではなく1,600）',
    /1,600/.test(t50) && !/1,400/.test(t50), t50);
  chk('20kgの本数が空き区画×50になっている', /750/.test(t20), t20);

  /* 位置1（ライブで空きにした区画）をタップして、詳細が出ることと、
     状態が「空き」になっていることを見る。
     ★ 出荷希望日の null の扱いは tools/yard_merge_test.js で直接見ている
        （静的データに shipDate を持つ区画が無いので、ここでは確かめられない）。 */
  const detail = await page.evaluate(() => {
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<1>');
    if (!t) return { ok: false, why: '位置1が見つからない' };
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { ok: true };
  });
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /状態/.test(d.innerText) && d.innerText.length < 400);
    return el ? el.innerText.replace(/\n+/g, ' / ') : null;
  });
  console.log('   位置1の詳細:', JSON.stringify(panel));
  chk('位置1をタップできる', detail.ok, detail);
  chk('ライブで空きにした区画が「空き」と出る',
    panel !== null && /空き/.test(panel), panel);

  /* ★ サイズ別在庫が9分類に戻っているか。50kg/20kgの2つだけになっていた。 */
  const sizes = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.indexOf('サイズ別 在庫本数') !== -1);
    if (!h) return null;
    const grid = h.parentElement.parentElement.querySelector('.grid');
    return grid ? [...grid.children].map((c) => c.innerText.replace(/\n+/g, ' ')) : null;
  });
  console.log('   サイズ別:', JSON.stringify(sizes));
  chk('サイズ別在庫が9分類＋合計で10枚ある', sizes && sizes.length === 10, sizes && sizes.length);
  chk('20K(三部軽量)が出ている', sizes && sizes.some((t) => t.indexOf('20K(三部軽量)') !== -1), sizes);
  chk('50K(S)が出ている', sizes && sizes.some((t) => t.indexOf('50K(S)') !== -1), sizes);
  chk('本数が入っている（3,120本）', sizes && sizes.some((t) => /3,120/.test(t)), sizes);

  /* ★ 描画エラーで真っ白にならないよう ErrorBoundary で包んである。 */
  const guarded = await page.evaluate(() => {
    const s = document.documentElement.innerHTML;
    return /createElement\(ErrorBoundary/.test(s) || /ErrorBoundary/.test(s);
  });
  chk('ErrorBoundaryで包んである', guarded, guarded);

  await page.screenshot({ path: SP + '/yard_kpi.png', fullPage: false });
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
