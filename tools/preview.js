// 実機に近い幅（iPhone 390px）で描画してスクリーンショットを撮る。
//
// ★ なぜ要るのか
//   このページのCSSはTailwindのビルド結果を貼り付けたもので、ビルドし直す
//   仕組みが無い。あとから書いたクラスは黙って効かない。実際 text-right が
//   18箇所で未定義のまま使われていて、数字が右揃えになっていなかった。
//   jsdomのテストは要素と座標は見られるがCSSの適用結果は見られないので、
//   最後は本物のブラウザで描いて目で見る必要がある。
//
// 使い方: npm i playwright したうえで
//   node tools/preview.js          … 受注データ無しの状態
//   node tools/preview.js orders   … 受注データ有りの状態
// 出力先はスクラッチのPNG。
const { chromium } = require('playwright');
const fs = require('fs');
const html = fs.readFileSync('/home/user/noda-gumi-dashboard-/gas/noda_dashboard.html', 'utf8');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

const MONTHS = [
  { 年月: '2026-04', 出荷: 16337, 在庫: null, 在庫日: null, 受注: null },
  { 年月: '2026-05', 出荷: 16354, 在庫: null, 在庫日: null, 受注: null },
  { 年月: '2026-06', 出荷: 17160, 在庫: null, 在庫日: null, 受注: 15100 },
  { 年月: '2026-07', 出荷: 12326, 在庫: null, 在庫日: null, 受注: 14700 },
  { 年月: '2026-08', 出荷: 15103, 在庫: 10014, 在庫日: '2026-08-31', 受注: 15600 },
  { 年月: '2026-09', 出荷: 4164, 出荷予定: 10076, 在庫: 7435, 在庫日: '2026-09-07', 受注: 4100 },
];
const E = { updated: '2026-09-07 16:00', error: null };
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {}, totals: { total: 7435, '50k': 3000, '20k': 4435 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 602 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/7', shipments: [], week: [] }),
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({ '50k': [], '20k': [] }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'https://x.test', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} }),
  getDispatchGridData: () => ({ ...E, source: 'スプレッドシート', editable: true,
    sheetUrl: 'https://x.test', weekOffset: 0, weekLabel: '9/7〜9/12', hasPrev: true, hasNext: true,
    days: [
      { col: 2, date: '2026-09-07', label: '9/7', header: '9/7(月)出' },
      { col: 3, date: '2026-09-08', label: '9/8', header: '9/8(火)出' },
      { col: 4, date: '2026-09-09', label: '9/9', header: '9/9(水)出' },
      { col: 5, date: '2026-09-10', label: '9/10', header: '9/10(木)出' },
      { col: 6, date: '2026-09-11', label: '9/11', header: '9/11(金)出' },
      { col: 7, date: '2026-09-12', label: '9/12', header: '9/12(土)出' },
    ],
    trucks: [
      { row: 3, company: '', truck: '10ｔ箱', cells: { 2: { kind: '運休', text: '×' } } },
      { row: 4, company: '', truck: '10ｔ箱 佐伯', cells: { 3: { kind: '出荷', text: '岐阜県可児市' } } },
      { row: 7, company: '浅津運送 自社便', truck: '10ｔ平 野村',
        cells: { 2: { kind: '出荷', text: '熊本県山鹿市' }, 3: { kind: '引取', text: '←60665' },
                 4: { kind: '出荷', text: '広島県東広島市 (4600L×1)' } } },
      { row: 10, company: '', truck: '4ｔ平標準 福安',
        cells: { 2: { kind: '出荷', text: '東京都西多摩郡瑞穂町 東京都羽村市' }, 4: { kind: '休み', text: 'お休み' } } },
      { row: 18, company: '倉吉運送 自社便', truck: '10ｔ平 ②',
        cells: { 2: { kind: '出荷', text: '南港：底黒' } } },
      { row: 27, company: '', truck: '4ｔ平ﾜｲﾄﾞ ②', cells: { 2: { kind: '出荷', text: '70246→' } } },
    ],
    totals: {
      2: { 合計20k: 235, 合計50k: 292, 小口: 15, コンテナ: 30 },
      3: { 合計20k: 100, 合計50k: 150, 小口: 0, コンテナ: 0 },
      4: { 合計20k: null, 合計50k: null, 小口: 0, コンテナ: 0 },
      5: { 合計20k: null, 合計50k: null, 小口: 0, コンテナ: 0 },
      6: { 合計20k: 180, 合計50k: 90, 小口: 5, コンテナ: 0 },
      7: { 合計20k: null, 合計50k: null, 小口: 0, コンテナ: 0 },
    } }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'https://x.test', months: MONTHS,
    hasOrders: process.argv[2] === 'orders', hasPlan: true, partialMonth: '2026-09',
    出荷の出所: '配車表', asOf: '2026-09-07', startMonth: '2026-04' }),
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // 応答をそのまま埋め込む（非同期の橋渡しをすると取りこぼすため）
  const data = {};
  Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  await page.addInitScript((d) => {
    function mk() {
      let ok = null;
      const o = { withSuccessHandler(f) { ok = f; return o; }, withFailureHandler() { return o; } };
      Object.keys(d).forEach((fn) => {
        o[fn] = () => { setTimeout(() => { if (ok) { try { ok(d[fn]); } catch (e) { console.log('ERR ' + fn + ' ' + e); } } }, 0); return o; };
      });
      return o;
    }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, data);
  page.on('console', (m) => { const t = m.text(); if (/ERR|Error|error/.test(t)) console.log('[browser]', t.slice(0, 160)); });
  // ★ setContent だと addInitScript が走らない（ナビゲーションが起きないため）。
  //   一時ファイルに書いて file:// で開く。
  const tmp = SP + '/preview.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  console.log('window.google あり?', await page.evaluate(() => typeof window.google));
  await page.waitForTimeout(2500);
  const tabName = process.argv[3] === 'dispatch' ? '配車・当日出荷'
    : process.argv[3] === 'yard' ? 'ヤード・現場' : '実績・推移';
  const tab = page.locator('button', { hasText: tabName }).first();
  await tab.click();
  await page.waitForTimeout(800);
  const name = process.argv[3] === 'yard' ? 'yard_tab'
    : process.argv[3] === 'dispatch' ? 'dispatch_grid'
    : (process.argv[2] === 'orders' ? 'actuals_orders' : 'actuals');
  await page.screenshot({ path: SP + '/' + name + '.png', fullPage: true });
  // 表の実測幅を出す
  const info = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div').forEach((d) => {
      if (/月末在庫/.test(d.textContent || '') && d.className.includes('flex') && d.children.length >= 3 && d.children.length <= 5) {
        out.push([...d.children].map((c) => ({ t: c.textContent.trim().slice(0, 12), w: Math.round(c.getBoundingClientRect().width), fs: getComputedStyle(c).fontSize })));
      }
    });
    return out.slice(0, 1);
  });
  console.log('表ヘッダの実測:', JSON.stringify(info, null, 1));
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log('横スクロール発生:', over);
  await b.close();
})();
