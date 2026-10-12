// 前回のデータを端末に残して、開いた瞬間に出すテスト（実ブラウザ・390px）。
//
// ★ なぜ要るのか
//   開くたびに11本の集計を待ってから画面を出していた。前回そろったデータを
//   端末に残し、開いた瞬間はそれを出す。最新がそろったら差し替える。
//   ・前回のデータを出しているあいだは、そうと書く
//   ・画面のプログラムが変わったら前回のデータは使わない
//   ・端末の保存が使えなくても今までどおり動く
const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
const html = fs.readFileSync(__dirname + '/../gas/noda_dashboard.html', 'utf8');

const E = (t) => ({ updated: t, error: null });
// 作り置き（先読み）から1回でまとめて返すぶん。本物のサーバと同じ形
const withBundle = (r, missing) => {
  const map = { inventory: 'getInventoryDashboardData', shipping: 'getShippingDashboardData',
    orderPlan: 'getOrderPlanDashboardData', dispatch: 'getDispatchTodayData', invTrend: 'getInventoryTrendData',
    monthly: 'getMonthlyCombinedData', dispGrid: 'getDispatchGridData', armPlan: 'getArmShipPlan',
    armMonthly: 'getArmMonthlyData', yardMap: 'getYardMapUpdatesBothWithOrderText' };
  const data = {};
  Object.keys(map).forEach((k) => { if (!(missing || []).includes(k)) data[k] = r[map[k]]; });
  return { ...r, getDashboardBundle: { data, missing: missing || [] } };
};
const reply0 = (total, t) => ({
  getInventoryDashboardData: { ...E(t), sizes: {}, totals: { total, '50k': 1000, '20k': total - 1000 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null },
  getShippingDashboardData: { ...E(t), folder: '10月', total, todayCount: 0, recent: [] },
  getOrderPlanDashboardData: { ...E(t), file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 0 },
  getDispatchTodayData: { ...E(t), file: null, dateLabel: '10/11', shipments: [], week: [] },
  getYardMapUpdatesBothWithOrderText: JSON.stringify({ '50k': [], '20k': [] }),
  getInventoryTrendData: { ...E(t), sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} },
  getMonthlyCombinedData: { ...E(t), sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null },
  getYardCapacitySummary: { ...E(t), locations: 36, a20: 1, m20: 2, a30: 0, m30: 0, a50: 1, m50: 2, total: 2, max: 4, nearFull: 0, over: 0, sheetUrl: 'x' },
  getYardCapacityUrl: { url: 'x', error: null },
  getArmShipPlan: { updated: t, error: null, total: 0, days: [], byKind: [], sourceName: null, snapshotAt: null, stale: false, pdfUrl: null, pdfName: null },
  getArmMonthlyData: { updated: t, error: null, months: [], kinds: [], total: 0, startMonth: null, today: null, currentAll: null, sourceName: null, harvestedAt: null },
  getDispatchGridData: { ...E(t), source: 'Excel', editable: false, weekOffset: 0, weekLabel: null, hasPrev: false, hasNext: false, days: [], trucks: [], totals: {} },
});
const reply = (total, t, missing) => withBundle(reply0(total, t), missing);

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 300) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tmp = SP + '/snap_page.html';
  fs.writeFileSync(tmp, html);

  // サーバの返事を delay ミリ秒遅らせる。返す中身は window.__REPLY（ページごとに差し替える）
  await ctx.addInitScript(() => {
    function mk() { let ok = null;
      const px = new Proxy({}, { get(t, fn) {
        if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; };
        if (fn === 'withFailureHandler' || fn === 'withUserObject') return () => px;
        return () => { (window.__CALLS = window.__CALLS || []).push(fn);
          setTimeout(() => { if (ok) ok((window.__REPLY || {})[fn] || { error: null }); }, window.__DELAY || 0); return px; };
      } });
      return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  });
  const open = async (total, delay, extra) => {
    const page = await ctx.newPage();
    await page.addInitScript(([r, d]) => { window.__REPLY = r; window.__DELAY = d; }, [reply(total, '2026-10-11 08:00'), delay]);
    if (extra) await page.addInitScript(extra);
    await page.goto('file://' + tmp);
    return page;
  };
  const text = (p) => p.evaluate(() => document.body.innerText);

  console.log('■ 1回目：前回のデータが無いので、今までどおり読み込みを待つ');
  await ctx.newPage().then(async (p) => { await p.goto('file://' + tmp); await p.evaluate(() => localStorage.clear()); await p.close(); });
  let p = await open(7435, 1500);
  await p.waitForTimeout(500);
  chk('読み込み中の画面が出る', /データを読み込んでいます/.test(await text(p)));
  await p.waitForTimeout(3500);
  let t = await text(p);
  chk('そろったら画面が出る', /保存済\(10月\)\n7435\n/.test(t), t.slice(0, 200));
  chk('「前回のデータ」とは書かない', !/前回（/.test(t));
  // 起動のあと野外置場タブのぶんを裏で取るので、そろって落ち着いてから残る
  await p.waitForTimeout(3500);
  const saved = await p.evaluate(() => localStorage.getItem('nodaDashSnap'));
  chk('★端末に残す', !!saved && /7435/.test(saved), saved && saved.slice(0, 100));
  await p.close();

  console.log('■ 2回目：開いた瞬間に前回のデータを出す');
  p = await open(8000, 3000);
  await p.waitForTimeout(600);
  t = await text(p);
  chk('★読み込みを待たずに画面が出る', !/データを読み込んでいます/.test(t) && /保存済\(10月\)\n7435\n/.test(t), t.slice(0, 200));
  chk('★前回のデータだと書く', /前回（.*）のデータを表示中/.test(t), t.slice(0, 300));
  await p.screenshot({ path: SP + '/snap_first.png' });
  await p.waitForTimeout(4000);
  t = await text(p);
  chk('★最新がそろったら差し替わる', /保存済\(10月\)\n8000\n/.test(t) && !/保存済\(10月\)\n7435\n/.test(t), t.slice(0, 200));
  chk('★差し替わったら「前回」の帯は消える', !/前回（/.test(t));
  await p.close();

  console.log('■ 作り置きを1回でまとめて受け取る');
  await ctx.newPage().then(async (q) => { await q.goto('file://' + tmp); await q.evaluate(() => localStorage.clear()); await q.close(); });
  {
    const page = await ctx.newPage();
    await page.addInitScript(([r, d]) => { window.__REPLY = r; window.__DELAY = d; },
      [reply(6100, '2026-10-12 08:00', ['monthly']), 300]);
    await page.goto('file://' + tmp);
    await page.waitForTimeout(2500);
    const calls = await page.evaluate(() => window.__CALLS || []);
    const tt = await text(page);
    chk('★まとめて受け取る（getDashboardBundle を1回）', calls.filter((c) => c === 'getDashboardBundle').length === 1, calls);
    chk('★作り置きにあったものは1本ずつ取りに行かない',
      !calls.includes('getInventoryDashboardData') && !calls.includes('getShippingDashboardData') &&
      !calls.includes('getYardMapUpdatesBothWithOrderText') && !calls.includes('getDispatchGridData'), calls);
    chk('★作り置きに無かったもの（月次）だけ取りに行く', calls.includes('getMonthlyCombinedData'), calls);
    chk('画面が出る', /保存済\(10月\)\n6100\n/.test(tt), tt.slice(0, 200));
    chk('★野外置場タブのぶんを裏で先に取っておく', calls.includes('getYardTabData') && calls.includes('getProdLots'), calls);
    // 次の確かめ（版が違うとき）のために、端末に残るまで待つ
    await page.waitForTimeout(3000);
    chk('★野外置場タブのぶんも端末に残す', /"yardTab"/.test(await page.evaluate(() => localStorage.getItem('nodaDashSnap') || '')));
    await page.close();
  }

  console.log('■ 画面のプログラムが変わったら前回のデータは使わない');
  await ctx.newPage().then(async (q) => { await q.goto('file://' + tmp); await q.waitForTimeout(7000);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem('nodaDashSnap')); s.v = '1'; localStorage.setItem('nodaDashSnap', JSON.stringify(s)); });
    await q.close(); });
  p = await open(9000, 1500);
  await p.waitForTimeout(500);
  chk('★版が違えば読み込みを待つ', /データを読み込んでいます/.test(await text(p)));
  await p.close();

  console.log('■ 古すぎる前回のデータは使わない（24時間）');
  await ctx.newPage().then(async (q) => { await q.goto('file://' + tmp); await q.waitForTimeout(2500);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem('nodaDashSnap') || 'null');
      if (s) { s.t = Date.now() - 25 * 3600 * 1000; localStorage.setItem('nodaDashSnap', JSON.stringify(s)); } });
    await q.close(); });
  p = await open(9000, 1500);
  await p.waitForTimeout(500);
  chk('★25時間前のデータは出さない', /データを読み込んでいます/.test(await text(p)));
  await p.close();

  console.log('■ 端末の保存が使えなくても動く');
  p = await open(7000, 300, () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  });
  await p.waitForTimeout(2500);
  t = await text(p);
  chk('★保存が使えなくても画面が出る', /保存済\(10月\)\n7000\n/.test(t), t.slice(0, 200));
  await p.close();

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
