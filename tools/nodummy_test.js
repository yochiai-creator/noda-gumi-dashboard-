// 本番で読めなかったとき・空のときに、見本（8月）の数字や一覧を出さないテスト。
//
// ★ 実際に起きていた：受注の一覧が空の日（新規受注なし）に「26/08/07 …」の見本が、
//   月初で指図書が無いときに「08/21 26-10555 …」の見本が、本物のように出ていた。
//   在庫CSVが読めないと、在庫のKPIに見本の 6,111本 などが出ていた。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 300) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const run = async (patch, failFns) => {
    const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
    Object.assign(data, patch);
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
    await page.addInitScript(([d, bad]) => {
      function mk() { let ok = null, ng = null;
        const px = new Proxy({}, { get(t, fn) {
          if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; };
          if (fn === 'withFailureHandler') return (f) => { ng = f; return px; };
          if (!(fn in d) && bad.indexOf(fn) < 0) return undefined;
          return () => { setTimeout(() => { if (bad.indexOf(fn) >= 0) { if (ng) ng(new Error('読めない')); } else if (ok) ok(d[fn]); }, 0); return px; };
        } }); return px; }
      window.google = { script: { get run() { return mk(); }, host: {} } };
    }, [data, failFns || []]);
    const tmp = SP + '/nodummy.html';
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp);
    await page.waitForTimeout(1500);
    return page;
  };
  const text = (p) => p.evaluate(() => document.body.innerText);

  console.log('■ 新規受注なし・指図書なしの日（空の一覧）');
  {
    const E = { updated: '2026-10-01 07:00', error: null };
    const p = await run({
      getOrderPlanDashboardData: { ...E, file: 'x', totalOrders: 0, bySize: { '50K_軽量型': { label: '50K(軽量型)', count: 1200 } }, recent: [], yesterdayDiff: 0 },
      getShippingDashboardData: { ...E, folder: '10月', total: 0, todayCount: 0, recent: [] },
    });
    const t = await text(p);
    chk('★見本の受注（26/08/07）を出さない', !/26\/08\/07/.test(t), t.slice(0, 400));
    chk('★見本の指図書（26-10555）を出さない', !/26-10555/.test(t));
    chk('受注が無いと書く', /前日の表から増えた受注はありません/.test(t));
    chk('指図書が無いと書く', /この月の指図書はまだありません/.test(t));
    chk('受注の合計は本物（1,200）', /受注 合計本数（LP容器）\n1,200/.test(t), t.slice(0, 300));
  }

  console.log('■ 在庫CSV・受注出荷計画表が読めなかったとき');
  {
    const p = await run({}, ['getInventoryDashboardData', 'getOrderPlanDashboardData']);
    let t = await text(p);
    chk('★受注の合計に見本（8,250）を出さず「—」', /受注 合計本数（LP容器）\n—/.test(t) && !/8,250/.test(t), t.slice(0, 300));
    chk('★見本のサイズ別受注（4,120 など）を出さない', !/4,120/.test(t));
    await p.locator('button', { hasText: 'ヤード・現場' }).first().click();
    await p.waitForTimeout(500);
    t = await text(p);
    chk('★在庫のKPIに見本の数字を出さず「—」', /50k 在庫\n—/.test(t) && /在庫合計（全サイズ）\n—/.test(t), t.slice(0, 300));
    chk('★見本の在庫合計（6,111）を出さない', !/6,111/.test(t));
    chk('画面は落ちない', !/エラーが発生しました/.test(t));
  }

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
