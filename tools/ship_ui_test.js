// 「出荷の進捗」タブの画面テスト（記録する人・出荷済を押す・取消・名前を足す）。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 400) : '')); } };

const item = (key, no, ver, size, qty, dest, check) => ({ key, no, eda: 0, ver, date: '', size, qty, dest, check: check || null,
  url: 'https://drive.google.com/file/d/' + key + '/view', copyUrl: null, fileId: null, shipped: null });
const PROG = {
  updated: '2026-10-28 08:00', today: '2026-10-28', from: '2026-10-25', to: '2026-11-04', error: null,
  days: [
    { date: '2026-10-27', label: '10/27', weekday: '火', past: true, today: false, count: 1, shippedN: 0, qty: 5,
      items: [item('26-10335-0(1)', '26-10335', 1, '20kg', 5, 'イワタニ四国')] },
    { date: '2026-10-28', label: '10/28', weekday: '水', past: false, today: true, count: 2, shippedN: 0, qty: 5,
      items: [item('26-60846-0(1)', '26-60846', 1, '50kg', 2, '西日本液化 萩', 'チェック前'),
              item('26-30575-0(2)', '26-30575', 2, '50kg', 3, 'ミツウロコ', 'チェック済')] },
  ],
};

(async () => {
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({ d, prog }) => {
    // 偽のサーバ：出荷済・取消・名前を足す、を覚えておく
    const st = { prog: JSON.parse(JSON.stringify(prog)), staff: [{ 名前: '野田 太郎', 役割: '出荷' }], calls: [] };
    window.__st = st;
    const recount = () => st.prog.days.forEach((g) => { g.shippedN = g.items.filter((o) => o.shipped).length; });
    const H = {
      getShipProgress: () => st.prog,
      getWorkStaff: () => ({ staff: st.staff, roles: ['事務', '出荷', '現場', '管理'], account: 'genba@x', error: null }),
      markShipped: (req) => { st.calls.push(['mark', req]); st.prog.days.forEach((g) => g.items.forEach((o) => { if (o.key === req.key) o.shipped = { id: 'R' + st.calls.length, at: '2026-10-28 09:15', by: req.name }; })); recount(); return st.prog; },
      cancelWorkRecord: (req) => { st.calls.push(['cancel', req]); st.prog.days.forEach((g) => g.items.forEach((o) => { if (o.shipped && o.shipped.id === req.id) o.shipped = null; })); recount(); return st.prog; },
      addWorkStaff: (name, role) => { st.calls.push(['add', name, role]); st.staff.push({ 名前: name, 役割: role }); return H.getWorkStaff(); },
    };
    function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
      if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
      if (H[fn]) return (...a) => { const r = JSON.parse(JSON.stringify(H[fn](...a))); setTimeout(() => { if (ok) ok(r); }, 0); return px; };
      if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, { d: data, prog: PROG });
  fs.writeFileSync(SP + '/ship_page.html', html);
  await page.goto('file://' + SP + '/ship_page.html');
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: '出荷の進捗' }).first().click();
  await page.waitForTimeout(800);

  console.log('■ タブ・KPI・一覧');
  let t = await page.evaluate(() => document.body.innerText);
  chk('★タブの見出し', /出荷の進捗/.test(await page.evaluate(() => document.querySelector('h1').textContent)));
  chk('★KPI：今日の出荷済 0/2・過ぎた日で出荷済が無い 1', /今日の出荷済\s*0\/2/.test(t) && /過ぎた日で出荷済が無い\s*1/.test(t), t.slice(0, 500));
  chk('★日ごとに「出荷済 0/2」', /10\/28[\s\S]{0,40}出荷済 0\/2/.test(t), t.slice(t.indexOf('10/28'), t.indexOf('10/28') + 80));
  chk('1行に依頼No・サイズ・本数・チェックの状態・出荷先', /26-60846\(1\)\s*50kg\s*2本\s*チェック前/.test(t) && /西日本液化 萩/.test(t));
  chk('★過ぎた日に出荷済が付いていない枚数を出す', /過ぎた日に出荷済が付いていない指図書 1枚/.test(t));
  const disabled = await page.locator('[data-ship-row="26-60846-0(1)"] button', { hasText: '出荷済' }).isDisabled();
  chk('★名前を選ぶまで出荷済は押せない', disabled && /名前を選んでください/.test(t));
  await page.screenshot({ path: SP + '/ship_tab.png', fullPage: true });

  console.log('■ 記録する人を選んで出荷済');
  await page.locator('select').first().selectOption('野田 太郎');
  await page.waitForTimeout(200);
  chk('選んだ名前を端末に覚える', await page.evaluate(() => localStorage.getItem('nodaWorker')) === '野田 太郎');
  await page.locator('[data-ship-row="26-60846-0(1)"] button', { hasText: '出荷済' }).click();
  await page.waitForTimeout(400);
  t = await page.evaluate(() => document.body.innerText);
  const calls = await page.evaluate(() => window.__st.calls);
  chk('★サーバに指図書・名前・本数を送る', calls[0] && calls[0][0] === 'mark' && calls[0][1].key === '26-60846-0(1)' && calls[0][1].name === '野田 太郎' && calls[0][1].qty === 2, calls);
  chk('★押した行は「✓出荷済 名前 時刻」', /✓出荷済 野田 太郎 09:15/.test(t), t.slice(t.indexOf('26-60846'), t.indexOf('26-60846') + 120));
  chk('★日の数とKPIが増える', /出荷済 1\/2/.test(t) && /今日の出荷済\s*1\/2/.test(t));

  console.log('■ 取消');
  await page.locator('[data-ship-row="26-60846-0(1)"] button', { hasText: '取消' }).click();
  await page.waitForTimeout(400);
  t = await page.evaluate(() => document.body.innerText);
  chk('★取り消すと出荷済のボタンに戻る', !/✓出荷済 野田 太郎/.test(t) && /出荷済 0\/2/.test(t));

  console.log('■ まだのものだけ');
  await page.locator('[data-ship-row="26-30575-0(2)"] button', { hasText: '出荷済' }).click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: 'まだ出荷済でないもの' }).click();
  await page.waitForTimeout(200);
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-ship-row]')].map((r) => r.getAttribute('data-ship-row')));
  chk('★出荷済のものは隠す', rows.indexOf('26-30575-0(2)') < 0 && rows.indexOf('26-60846-0(1)') >= 0, rows);

  console.log('■ 名前を足す');
  await page.locator('button', { hasText: '名前を足す' }).click();
  await page.locator('input[placeholder^="名前"]').fill('森 花子');
  await page.locator('button', { hasText: /^足す$/ }).click();
  await page.waitForTimeout(400);
  const sel = await page.evaluate(() => document.querySelector('select').value);
  chk('★足した名前がそのまま「記録する人」になる', sel === '森 花子', sel);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  chk('横にはみ出さない', !over);

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
