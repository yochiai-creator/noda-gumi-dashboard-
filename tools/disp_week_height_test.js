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

// 本番に近い形（トラック31台・うち12台にその週の予定がある）を作って高さを測る
const TRUCKS31 = [];
const NAMES = ['10ｔ箱', '10ｔ箱 佐伯', '10ｔ平 野村', '4ｔ平標準 福安', '10ｔ平 ②', '4ｔ平ﾜｲﾄﾞ ②',
  '10ｔ平 ③', '10ｔ箱 ②', '4ｔ平標準 ③', '10ｔ平 山根', '大型ｾﾙﾌ', '10ｔ平 ④'];
const DESTS = ['熊本県山鹿市', '←60665', '広島県東広島市 (4600L×1)', '東京都西多摩郡瑞穂町 東京都羽村市',
  '南港：底黒', '×', 'お休み', '岐阜県可児市'];
for (let i = 0; i < 31; i++) {
  const cells = {};
  if (i < 12) {
    for (let c = 2; c <= 7; c++) {
      if ((i + c) % 3 !== 0) cells[c] = { kind: DESTS[(i + c) % DESTS.length] === '×' ? '運休' : '出荷',
        text: DESTS[(i + c) % DESTS.length] };
    }
  }
  TRUCKS31.push({ row: 3 + i, company: i % 4 === 2 ? '浅津運送 自社便' : '',
    truck: i < 12 ? NAMES[i] : '4ｔ平 ' + (i + 1), cells: cells });
}
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {}, totals: { total: 7435, '50k': 1429, '20k': 4682 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 602 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/7', shipments: [], week: [] }),
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({ '50k': [], '20k': [] }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'x', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null }),
  getYardCapacitySummary: () => ({ ...E, locations: 36, a20: 0, a50: 0, total: 0, max: 0, nearFull: 0, over: 0, sheetUrl: 'x' }),
  getYardCapacityUrl: () => ({ url: null, error: null }),
  getDispatchGridData: () => ({ ...E, source: 'スプレッドシート', editable: true,
    sheetUrl: 'x', weekOffset: 0, weekLabel: '9/7〜9/12', hasPrev: true, hasNext: true,
    days: [
      { col: 2, date: '2026-09-07', label: '9/7', header: '9/7(月)出' },
      { col: 3, date: '2026-09-08', label: '9/8', header: '9/8(火)出' },
      { col: 4, date: '2026-09-09', label: '9/9', header: '9/9(水)出' },
      { col: 5, date: '2026-09-10', label: '9/10', header: '9/10(木)出' },
      { col: 6, date: '2026-09-11', label: '9/11', header: '9/11(金)出' },
      { col: 7, date: '2026-09-12', label: '9/12', header: '9/12(土)出' },
    ],
    trucks: TRUCKS31,
    totals: { 2: { '合計20k': 235, '合計50k': 292, '小口': 15, 'コンテナ': 30 },
              3: { '合計20k': 100, '合計50k': 150, '小口': 0, 'コンテナ': 0 } } }),
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
  const tmp = SP + '/h31.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('button', { hasText: '配車・当日出荷' }).first().click();
  await page.waitForTimeout(900);
  await page.locator('button', { hasText: /^週$/ }).first().click();
  await page.waitForTimeout(700);

  const meas = async () => await page.evaluate(() => {
    const sc = document.querySelector('.overflow-x-auto.rounded-md');
    const card = document.querySelector('.rounded-lg.border.border-slate-200.bg-white.p-3');
    const rows = sc ? [...sc.querySelectorAll(':scope > div > div.flex')] : [];
    return { 表の高さ: sc ? Math.round(sc.getBoundingClientRect().height) : null,
      カード全体: card ? Math.round(card.getBoundingClientRect().height) : null,
      行数: rows.length, 行の高さ: [...new Set(rows.slice(1, -4).map((r) => Math.round(r.getBoundingClientRect().height)))] };
  });
  let pass = 0, fail = 0;
  const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
    else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

  console.log('■ トラック31台・うち12台にその週の予定がある');
  const closed = await meas();
  console.log('   畳んだ状態:', JSON.stringify(closed));
  await page.screenshot({ path: SP + '/sample_5_week_collapsed.png', fullPage: true });

  /* ★ 直す前は31台ぜんぶを49pxで並べていて、表だけで
       31*49 + 見出し + 合計4行 = 約1700px あった。行を詰めて、その週に
       予定が無いトラックを畳むことで、1画面ちょっとに収める。 */
  chk('畳んだ表が700px以下になっている', closed.表の高さ <= 700, closed);
  chk('カード全体が900px以下になっている', closed.カード全体 <= 900, closed);
  chk('行を詰めた（36px以下）', Math.max(...closed.行の高さ) <= 36, closed.行の高さ);
  chk('予定のある12台＋合計4行＋見出しだけ出ている', closed.行数 === 17, closed.行数);

  await page.locator('button', { hasText: /この週は予定なし/ }).first().click();
  await page.waitForTimeout(500);
  const opened = await meas();
  console.log('   全部出した:', JSON.stringify(opened));
  chk('畳みを開くと31台ぜんぶ出る', opened.行数 === 36, opened.行数);
  chk('開いたぶんだけ縦に伸びている', opened.表の高さ > closed.表の高さ, { closed: closed.表の高さ, opened: opened.表の高さ });
  await page.screenshot({ path: SP + '/sample_4_week31.png', fullPage: true });

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
