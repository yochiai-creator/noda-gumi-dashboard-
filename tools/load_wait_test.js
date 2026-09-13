// 全部のデータがそろうまで画面を出さないかを見る。
//
// ★ なぜ要るのか
//   読み込み完了を「9件そろったら」と件数で数えていて、あとから取得を
//   足したとき（10件になった）に数を直し忘れ、最後の1件が間に合わないまま
//   画面が出て、受注や構内レイアウトに起動時の古い仮データが見えていた。
const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
const html = fs.readFileSync(__dirname + '/../gas/noda_dashboard.html', 'utf8');

let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
  else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();

  // 1つだけ返事を遅らせる。その1件を待たずに画面を出していないかを見る。
  await page.addInitScript(() => {
    const E = { updated: 'x', error: null };
    const DATA = {
      getInventoryDashboardData: { ...E, sizes: {}, totals: { total: 1, '50k': 1, '20k': 0 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null },
      getShippingDashboardData: { ...E, folder: '9月', total: 7, todayCount: 0, recent: [] },
      getOrderPlanDashboardData: { ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 0 },
      getDispatchTodayData: { ...E, file: null, dateLabel: '9/12', shipments: [], week: [] },
      getShippingActualsSummary: { ...E, sheetUrl: 'x', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 },
      getInventoryTrendData: { ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} },
      getMonthlyCombinedData: { ...E, sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null },
      getDispatchGridData: { ...E, source: 'x', editable: false, weekOffset: 0, weekLabel: null, hasPrev: false, hasNext: false, days: [], trucks: [], totals: {} },
      getYardCapacitySummary: { ...E, locations: 0, a20: 0, a50: 0, total: 0, max: 0, nearFull: 0, over: 0, sheetUrl: 'x' },
      getYardCapacityUrl: { url: null, error: null },
      getArmShipPlan: { ...E, total: 0, days: [], sourceName: null, snapshotAt: null, stale: false, pdfUrl: null, pdfName: null },
      getYardMapUpdatesBothWithOrderText: JSON.stringify({ '50k': [], '20k': [] }),
      getYardBlockDetailWithPdf: { found: false, orders: [] },
    };
    window.__slowDone = false;
    function mk() { let ok = null;
      const o = { withSuccessHandler(f) { ok = f; return o; }, withFailureHandler() { return o; } };
      Object.keys(DATA).forEach((fn) => { o[fn] = () => {
        // ★ ヤードマップだけ大きく遅らせる（実機でも一番重い）
        const wait = fn === 'getYardMapUpdatesBothWithOrderText' ? 1500 : 0;
        setTimeout(() => { if (fn === 'getYardMapUpdatesBothWithOrderText') window.__slowDone = true;
          if (ok) ok(DATA[fn]); }, wait);
        return o; }; });
      return o; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  });

  const tmp = SP + '/loadwait.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });

  await page.waitForTimeout(700);   // 遅い1件はまだ返っていない
  const mid = await page.evaluate(() => ({
    slow: window.__slowDone,
    text: document.body.innerText.slice(0, 60).replace(/\n/g, ' '),
    tabs: document.body.innerText.indexOf('受注・指図書') !== -1,
  }));
  console.log('   途中:', JSON.stringify(mid));
  chk('（前提）遅い1件はまだ返っていない', mid.slow === false, mid);
  chk('★最後の1件を待たずに画面を出さない', mid.tabs === false, mid);
  chk('読み込み中だと分かる表示になっている', /読み込/.test(mid.text), mid.text);

  await page.waitForTimeout(1500);  // 全部そろった
  const after = await page.evaluate(() => ({
    slow: window.__slowDone,
    tabs: document.body.innerText.indexOf('受注・指図書') !== -1,
    /* 起動時の仮データ（8月の値）。「202」のように短い数字は 2026年 にも
       当たってしまうので、紛れの無いものだけを見る。 */
    古い在庫合計: document.body.innerText.indexOf('6,111') !== -1,
    古い配車日付: document.body.innerText.indexOf('8/6 時点') !== -1,
    生の在庫合計: document.body.innerText.replace(/\n/g, ' '),
  }));
  console.log('   完了後:', JSON.stringify({ slow: after.slow, tabs: after.tabs,
    古い在庫合計: after.古い在庫合計, 古い配車日付: after.古い配車日付 }));
  chk('全部そろったら画面が出る', after.slow === true && after.tabs === true, after.tabs);
  chk('★起動時の古い在庫合計（6,111）が残っていない', after.古い在庫合計 === false, after.古い在庫合計);
  chk('★起動時の古い配車日付（8/6）が残っていない', after.古い配車日付 === false, after.古い配車日付);
  // モックの値（指図書7件）が出ていること＝実データで描いている
  const live = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, ' ');
    const m = t.match(/指図書 保存済[^]{0,20}?(\d[\d,]*)\s*件/);
    return { 見つかった: !!m, 値: m ? m[1] : null, 先頭: t.slice(0, 200) };
  });
  console.log('   指図書の件数:', JSON.stringify({ 見つかった: live.見つかった, 値: live.値 }));
  chk('モックで返した値が出ている（指図書7件）', live.値 === '7', live);

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
