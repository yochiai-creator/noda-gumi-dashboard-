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
  // 野外置場タブ（アプリの中で一覧・編集・履歴・推移をする）
  getYardTabData: () => ({ updated: '2026-09-17 08:00', error: null,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit',
    totals: { a20: 15880, m20: 20000, a30: 0, m30: 0, a50: 15800, m50: 16000,
      合計: 31680, max: 36000, 置場数: 3, 満杯に近い: 1, 超過: 1 },
    locations: [
      { no: 7, name: '大型製缶', position: '北・北', note: '', a20: 0, m20: 0, a30: 0, m30: 0,
        a50: 2400, m50: 2400, 率: 1, 状態: '超過', updatedAt: '2026-09-16 10:00', updatedBy: 'y@x',
        sizes: [{ key: '50', label: '50kg', 実績: 2400, max: 2400, 率: 1 }] },
      { no: 8, name: '大型製缶', position: '北・南', note: '雪置場（▲300）',
        a20: 0, m20: 0, a30: 0, m30: 0, a50: 1500, m50: 1800, 率: 0.833, 状態: '満杯に近い',
        updatedAt: '', updatedBy: '',
        sizes: [{ key: '50', label: '50kg', 実績: 1500, max: 1800, 率: 0.833 }] },
      { no: 11, name: 'コンテナ', position: '西', note: '', a20: 1568, m20: 1988, a30: 0, m30: 0,
        a50: 0, m50: 0, 率: 0.789, 状態: '', updatedAt: '', updatedBy: '',
        sizes: [{ key: '20', label: '20kg', 実績: 1568, max: 1988, 率: 0.789 }] },
    ] }),
  getYardDailyTotals: () => ({ error: null, days: [
    { 日付: '2026-09-14', '20kg': 1500, '30kg': 0, '50kg': 3800, 合計: 5300 },
    { 日付: '2026-09-15', '20kg': 1540, '30kg': 0, '50kg': 3900, 合計: 5440 },
    { 日付: '2026-09-16', '20kg': 1568, '30kg': 0, '50kg': 3900, 合計: 5468 },
  ] }),
  getYardChangeLog: () => ({ error: null, rows: [
    { 日時: '2026-09-16 10:00', 操作者: 'y.ochiai@x', no: '7', 置場名: '大型製缶',
      内容: '50kg_実績: 2300 → 2400' },
    { 日時: '2026-09-15 09:00', 操作者: 'y.ochiai@x', no: '11', 置場名: 'コンテナ',
      内容: '20kg_実績: 1500 → 1568' },
  ] }),
  saveYardLocation: () => ({ ok: true, error: null }),
  getArmShipPlan: () => ({ updated: 'x', error: null, total: 0, days: [], byKind: [],
    sourceName: null, snapshotAt: null, stale: false, pdfUrl: null, pdfName: null }),
  getArmMonthlyData: () => ({ updated: 'x', error: null, months: [], kinds: [], total: 0,
    startMonth: null, today: null, currentAll: null, sourceName: null, harvestedAt: null }),
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

  /* ★ もとは元アプリを iframe で埋め込んでいた。入れ子のスクロールで
        iPhoneでは扱えなかったので、一覧・編集・履歴・推移はアプリ側で作り直した。
        敷地レイアウト図だけは元のアプリに任せる（リンクで開く）。 */
  chk('★iframeの埋め込みをやめた',
    await page.evaluate(() => document.querySelector('main iframe') === null));

  const body = await page.evaluate(() => document.body.innerText.replace(/\n/g, ' | '));
  chk('置場の一覧が出る', /置場の一覧/.test(body), body.slice(0, 200));
  chk('置場名と位置が出る', /大型製缶/.test(body) && /北・北/.test(body), body.slice(0, 400));
  chk('サイズごとに実績とMAXが出る', /2,400 \| \/ 2,400/.test(body), body.slice(0, 600));
  chk('★詰まっている置場に印が付く', /超過/.test(body) && /満杯に近い/.test(body), body.slice(0, 600));

  // 行をタップすると本数を直す欄が開く
  await page.locator('button', { hasText: 'コンテナ' }).first().click();
  await page.waitForTimeout(400);
  const edit = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('main input')]
      .map((i) => ({ v: i.value, w: Math.round(i.getBoundingClientRect().width) }));
    return { inputs, 保存: [...document.querySelectorAll('main button')]
      .some((b) => b.textContent.trim() === '保存') };
  });
  console.log('   編集欄:', JSON.stringify(edit));
  chk('★タップすると今の本数が入った欄が開く',
    edit.inputs.some((i) => i.v === '1568'), edit.inputs);
  chk('保存ボタンが出る', edit.保存, edit);

  const links = await page.evaluate(() => [...document.querySelectorAll('main a')].map((a) => a.textContent.trim()));
  chk('敷地レイアウト図は元のアプリで開ける', links.includes('敷地レイアウト図を開く'), links);
  chk('「元のシートを開く」がある', links.includes('元のシートを開く'), links);

  chk('在庫の推移が出る', /在庫の推移/.test(body), body.slice(0, 900));
  // 開いた行には、その置場だけの履歴が出る
  chk('★開いた置場の履歴がその場で出る',
    await page.evaluate(() => /20kg_実績: 1500 → 1568/.test(document.body.innerText)));

  // 全体の変更履歴は畳んである。開いたら出る
  await page.locator('button', { hasText: '変更履歴' }).first().click();
  await page.waitForTimeout(300);
  const body2 = await page.evaluate(() => document.body.innerText.replace(/\n/g, ' | '));
  chk('変更履歴が出る', /50kg_実績: 2300 → 2400/.test(body2), body2.slice(-500));
  chk('誰が直したかも出る', /y\.ochiai@x/.test(body2), body2.slice(-500));

  const over = await page.evaluate(() => ({
    bodyScrollW: document.body.scrollWidth, clientW: document.documentElement.clientWidth }));
  chk('横にはみ出していない', over.bodyScrollW <= over.clientW + 1, over);

  await page.screenshot({ path: SP + '/yardcap_tab.png', fullPage: false });
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
