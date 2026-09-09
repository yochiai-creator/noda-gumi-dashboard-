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
  getYardCapacitySummary: () => ({ updated: '2026-09-09 12:00', error: null, locations: 36,
    a20: 15880, m20: 20308, a30: 0, m30: 0, a50: 15800, m50: 19100,
    total: 31680, max: 39408, nearFull: 3, over: 1,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit' }),
  getYardCapacityUrl: () => ({ url: 'https://script.google.com/a/x/exec?page=yard', error: null }),
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
  const tmp = SP + '/disp_page.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('button', { hasText: '配車・当日出荷' }).first().click();
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const sc = document.querySelector('.overflow-x-auto.rounded-md');
    const out = { スクローラ: null, 行: [], 見出し衝突: null };
    if (sc) {
      const r = sc.getBoundingClientRect();
      out.スクローラ = { 見える幅: Math.round(r.width), 中身の幅: sc.scrollWidth,
        はみ出し: sc.scrollWidth - Math.round(r.width) };
      const rows = [...sc.querySelectorAll(':scope > div > div.flex')];
      out.行数 = rows.length;
      out.行 = rows.slice(0, 8).map((x) => ({ h: Math.round(x.getBoundingClientRect().height),
        先頭: x.firstElementChild ? x.firstElementChild.innerText.replace(/\n/g, '/') : '' }));
      // 右にスクロールしたときトラック名が残るか
      sc.scrollLeft = 400;
      const name = rows[1] && rows[1].firstElementChild;
      const nr = name ? name.getBoundingClientRect() : null;
      out.右にスクロール後のトラック名 = nr ? { x: Math.round(nr.x), 見える: nr.x >= r.x - 1 } : null;
      sc.scrollLeft = 0;
    }
    // 週間の配車予定 の見出し
    const h2 = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('週間の配車予定'));
    if (h2) { const p = h2.parentElement, hr = h2.getBoundingClientRect();
      const note = p.querySelector('span');
      out.見出し衝突 = { 見出しの高さ: Math.round(hr.height), 見出しの幅: Math.round(hr.width),
        注記: note ? note.textContent : null,
        注記の高さ: note ? Math.round(note.getBoundingClientRect().height) : null }; }
    // カードの見出し
    out.カード見出し = [...document.querySelectorAll('main .grid .text-xs')].map((x) => x.textContent).slice(0, 6);
    return out;
  });
  console.log(JSON.stringify(m, null, 1));

  let pass = 0, fail = 0;
  const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
    else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

  chk('表は横スクロールする（1画面に収まらない）', m.スクローラ && m.スクローラ.はみ出し > 0, m.スクローラ);
  chk('★横に送ってもトラック名が見えている',
    m.右にスクロール後のトラック名 && m.右にスクロール後のトラック名.見える, m.右にスクロール後のトラック名);
  const hs = m.行.slice(1, 7).map((r) => r.h);
  chk('トラック行の高さがそろっている', hs.length > 0 && Math.max(...hs) - Math.min(...hs) <= 2, hs);
  chk('トラック名が切れていない（福安が出ている）',
    m.行.some((r) => r.先頭.indexOf('福安') !== -1), m.行.map((r) => r.先頭));
  chk('自社便の会社名が切れていない',
    m.行.some((r) => r.先頭.indexOf('浅津運送 自社便') !== -1), m.行.map((r) => r.先頭));
  chk('合計行が表の中にある', m.行.some((r) => r.先頭 === '合計20k'), m.行.map((r) => r.先頭));
  chk('見出しと注記がぶつかっていない（注記を外した）', m.見出し衝突 === null, m.見出し衝突);
  chk('日付ラベルが「本日」と混ざっていない',
    m.カード見出し.every((t) => !(t.indexOf('本日') !== -1 && t.indexOf('/') !== -1)), m.カード見出し);

  // 横に送った状態を撮って、トラック名が残っているか目で見る
  await page.evaluate(() => { const sc = document.querySelector('.overflow-x-auto.rounded-md');
    if (sc) sc.scrollLeft = 220; });
  await page.waitForTimeout(400);
  const box = await page.locator('.overflow-x-auto.rounded-md').first().boundingBox();
  await page.screenshot({ path: SP + '/disp_scrolled.png',
    clip: { x: box.x - 8, y: box.y - 44, width: box.width + 16, height: box.height + 52 } });
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
