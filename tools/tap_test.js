// 実座標でタップして反応するかを見る（jsdomではすり抜ける不具合を捕まえるため）。
// jsdomのテストは要素に直接クリックを送るので、当たり判定が他の要素の下に
// 隠れていても通ってしまう。本物のブラウザで座標を指定して押す必要がある。
const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
const html = fs.readFileSync('/home/user/noda-gumi-dashboard-/gas/noda_dashboard.html', 'utf8');

const MONTHS = [
  { 年月: '2026-04', 出荷: 16337, 在庫: null, 在庫日: null, 受注: null },
  { 年月: '2026-05', 出荷: 16354, 在庫: null, 在庫日: null, 受注: null },
  { 年月: '2026-06', 出荷: 17160, 在庫: null, 在庫日: null, 受注: 15100 },
  { 年月: '2026-07', 出荷: 12326, 在庫: null, 在庫日: null, 受注: 14700 },
  { 年月: '2026-08', 出荷: 15103, 在庫: 10014, 在庫日: '2026-08-31', 受注: 15600 },
  { 年月: '2026-09', 出荷: 4164, 出荷予定: 10076, 在庫: 7435, 在庫日: '2026-09-07', 受注: 4100 },
];
const DAYS = [];
for (let i = 0; i < 15; i++) {
  const d = new Date(Date.UTC(2026, 7, 17 + i));
  const p = (n) => String(n).padStart(2, '0');
  DAYS.push({ 日付: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()),
    総本数: 12000 + i * 10, '50kg': 7000 + i * 20, '20kg': 3800 - i * 5, その他: 1000 });
}
const E = { updated: '2026-09-07 16:00', error: null };
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {}, totals: { total: 7435, '50k': 3000, '20k': 4435 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 602 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/7', shipments: [], week: [] }),
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({ '50k': [], '20k': [] }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getYardCapacitySummary: () => ({ updated: '2026-09-09 12:00', error: null, locations: 36,
    a20: 15880, m20: 20308, a30: 0, m30: 0, a50: 15800, m50: 19100,
    total: 31680, max: 39408, nearFull: 3, over: 1,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit' }),
  getYardCapacityUrl: () => ({ url: 'https://script.google.com/a/x/exec?page=yard', error: null }),
  getDispatchGridData: () => ({ updated: 'x', error: null, source: 'Excel', editable: false,
    weekOffset: 0, weekLabel: null, hasPrev: false, hasNext: false, days: [], trucks: [], totals: {} }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'https://x.test', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'https://x.test', days: DAYS,
    latest: DAYS[DAYS.length - 1], change: { 前回日付: DAYS[DAYS.length - 2].日付, 総本数: 10, '50kg': 20, '20kg': -5 }, bySizeLatest: { '50K_軽量型': 7280 } }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'https://x.test', months: MONTHS,
    hasOrders: true, hasPlan: true, partialMonth: '2026-09', 出荷の出所: '配車表',
    asOf: '2026-09-07', startMonth: '2026-04' }),
};
let pass = 0, fail = 0;
const check = (l, c, e) => { if (c) { pass++; console.log('  OK   ' + l); } else { fail++; console.log('  FAIL ' + l + (e ? '  -> ' + e : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  await page.addInitScript((d) => {
    function mk() {
      let ok = null;
      const o = { withSuccessHandler(f) { ok = f; return o; }, withFailureHandler() { return o; } };
      Object.keys(d).forEach((fn) => { o[fn] = () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return o; }; });
      return o;
    }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, data);
  const tmp = SP + '/tap.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.locator('button', { hasText: '実績・推移' }).first().click();
  await page.waitForTimeout(700);

  const body = () => page.evaluate(() => document.body.innerText);

  console.log('■ 月次グラフ：棒の上をタップする');
  {
    // 8月の出荷の棒（実際に見えている棒）の中心を押す
    const box = await page.evaluate(() => {
      const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('path[fill="#eb6834"]'));
      const bars = [...svg.querySelectorAll('path[fill="#eb6834"]:not([opacity])')];
      const r = bars[4].getBoundingClientRect();      // 5本目 = 8月
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    const t = await body();
    check('棒をタップして数字が出る', /2026-08/.test(t) && /15,103/.test(t),
      (t.match(/月をタップ[^\n]*/) || t.match(/2026-\d\d[^\n]*/) || ['反応なし'])[0]);
  }

  console.log('■ 月次グラフ：月名の文字をタップする');
  {
    const box = await page.evaluate(() => {
      const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('path[fill="#eb6834"]'));
      const labels = [...svg.querySelectorAll('text')].filter((t) => /^\d+月$/.test(t.textContent));
      const r = labels[3].getBoundingClientRect();    // 7月
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    const t = await body();
    check('月名をタップして数字が出る', /2026-07/.test(t) && /12,326/.test(t),
      (t.match(/2026-\d\d[^\n]*/) || ['反応なし'])[0]);
  }

  console.log('■ 在庫推移：折れ線の上をタップする');
  {
    // ★ 月次グラフにも在庫の折れ線があるので polyline だけでは特定できない。
    //   在庫推移の小グラフは中に「50kg」というラベルを持っているので、それで選ぶ。
    // ★ カードは画面外にあるので、先にスクロールしてから座標を取る。
    //   （そうしないと elementFromPoint が null を返し、押せていないのに
    //     「反応しない」と誤診する）
    await page.evaluate(() => {
      const svg = [...document.querySelectorAll('svg')].find((s) =>
        [...s.querySelectorAll('text')].some((t) => t.textContent === '50kg'));
      if (svg) svg.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(200);
    const box = await page.evaluate(() => {
      const svg = [...document.querySelectorAll('svg')].find((s) =>
        [...s.querySelectorAll('text')].some((t) => t.textContent === '50kg'));
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.5 };
    });
    if (!box) { console.log('   在庫推移の小グラフが見つからない'); }
    const diag = box && await page.evaluate((b) => {
      const el = document.elementFromPoint(b.x, b.y);
      const svgs = [...document.querySelectorAll('svg')].filter((s) => s.querySelector('polyline'));
      return { tag: el && el.tagName, fill: el && el.getAttribute && el.getAttribute('fill'),
               cls: el && el.getAttribute && (el.getAttribute('class') || ''),
               polylineSvgs: svgs.length,
               rectsInFirst: svgs[0] ? svgs[0].querySelectorAll('rect[fill="transparent"]').length : -1 };
    }, box);
    console.log('   受け取る要素:', JSON.stringify(diag));
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    const t = await body();
    check('グラフの中央をタップして日付と値が出る', /8\/\d+：50kg/.test(t),
      (t.match(/グラフをタップ[^\n]*/) || t.match(/8\/\d+：[^\n]*/) || ['反応なし'])[0]);
  }

  console.log('■ 在庫推移：折れ線の端点マーカー（確実に手前にある要素）の上をタップ');
  {
    const box = await page.evaluate(() => {
      const svg = [...document.querySelectorAll('svg')].find((s) =>
        [...s.querySelectorAll('text')].some((t) => t.textContent === '50kg'));
      if (!svg) return null;
      svg.scrollIntoView({ block: 'center' });
      const c = svg.querySelector('circle');
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.waitForTimeout(200);
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    const t = await body();
    check('マーカーの上でも反応する', /\d+\/\d+：50kg/.test(t),
      (t.match(/グラフをタップ[^\n]*/) || t.match(/\d+\/\d+：[^\n]*/) || ['反応なし'])[0]);
  }

  console.log('■ 月次グラフ：凡例の下の余白（棒が無いところ）をタップ');
  {
    const box = await page.evaluate(() => {
      const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('path[fill="#eb6834"]'));
      svg.scrollIntoView({ block: 'center' });
      const r = svg.getBoundingClientRect();
      // ★ 左端12%は縦軸の目盛りラベルの余白でグラフの外。列の中に入れること。
      //   4月の列は viewBox で x=42〜91（全幅340）なので、20%あたりが中。
      //   縦は12%＝棒の上端より上の余白。棒が無い高さでも列として反応するかを見る。
      return { x: r.x + r.width * 0.20, y: r.y + r.height * 0.12 };
    });
    await page.waitForTimeout(200);
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    const t = await body();
    check('棒の無い高さでも列として反応する', /2026-04/.test(t) && /16,337/.test(t),
      (t.match(/2026-\d\d[^\n]*/) || ['反応なし'])[0]);
  }

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();
