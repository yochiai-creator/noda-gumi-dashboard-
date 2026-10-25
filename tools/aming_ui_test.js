// アーム出荷予定に aming の段階（未塗装・塗装済・修正済・要処置・出荷済）を出す画面のテスト。
// ★ 言葉と絞り込みは aming の一覧と同じにする（現場は aming で見ているので、ずれると迷う）。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 300) : '')); } };

const row = (zu, go, stage, extra) => Object.assign({
  kiki: 'SK300', kishu: '10型', zu, go, spec: 'SK300　3.3m10型', dest: '正和', info: '', insp: '9/1', is13: false,
  key: zu + '||' + go, stage,
  painted: stage !== '未', fixed: stage === '塗装後チェック済' || stage === '出荷済', by: stage === '塗装後チェック済' ? '田中' : '',
}, extra || {});
const PLAN = {
  updated: '2026-10-25 07:00', error: null, total: 5, aming: true,
  amingUrl: 'https://script.google.com/a/macros/nodagumi40.com/s/AMING/exec',
  sourceName: '出荷予定　日程表変更A(26年10月24日).xlsm', snapshotAt: '2026-10-25 06:33', stale: false,
  pdfUrl: 'https://drive.google.com/file/d/armpdf/view', pdfName: 'アーム出荷明細(10/24)_2026-10-25.pdf',
  byKind: [{ 名: 'SK300', 台数: 5 }],
  days: [
    { date: '2026-10-27', label: '10/27', weekday: '火', count: 3, byDest: [{ 名: '正和', 台数: 3 }], paintedN: 2, fixedN: 1,
      rows: [row('LC12B10557F1', '325', '塗装後チェック済'), row('LC12B10557F1', '328', '塗装完了'), row('LC12B10557F1', '330', '未')] },
    { date: '2026-10-28', label: '10/28', weekday: '水', count: 2, byDest: [{ 名: 'あゆみ', 台数: 2 }], paintedN: 2, fixedN: 0,
      rows: [row('LS12B10207F1', '10', '要処置', { dest: 'あゆみ' }), row('LS12B10207F1', '11', '塗装完了', { dest: 'あゆみ' })] },
  ],
};

(async () => {
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  data.getArmShipPlan = PLAN;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.addInitScript((d) => { function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
    if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
    if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } }; }, data);
  fs.writeFileSync(SP + '/aming_page.html', html);
  await page.goto('file://' + SP + '/aming_page.html');
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: 'アーム出荷予定' }).first().click();
  await page.waitForTimeout(800);

  console.log('■ 段階の印・日ごとの修正済・amingを開く');
  let t = await page.evaluate(() => document.body.innerText);
  chk('★amingを開くボタン（amingのURL）', await page.locator('a', { hasText: 'amingを開く' }).getAttribute('href') === PLAN.amingUrl);
  chk('★日の見出しは塗装完了の本数「塗装完了 2/3」（修正済の本数は出さない）', /塗装完了 2\/3/.test(t) && !/修正済 1\/3/.test(t), t.slice(0, 600));
  chk('★1本ずつに段階（修正済・田中／塗装済／未塗装）', /修正済・田中/.test(t) && /塗装済/.test(t) && /未塗装/.test(t));
  chk('★絞り込みはamingと同じ5つ（数つき）',
    /すべて\s*5/.test(t) && /未塗装\s*1/.test(t) && /塗装済\s*4/.test(t) && /未塗装後修正\s*4/.test(t) && /塗装後修正済\s*1/.test(t), t.slice(0, 800));
  await page.screenshot({ path: SP + '/aming_plan.png', fullPage: true });

  console.log('■ 絞り込み');
  await page.locator('button', { hasText: /^未塗装\s*1$/ }).first().click();
  await page.waitForTimeout(300);
  t = await page.evaluate(() => document.body.innerText);
  chk('★「未塗装」で330号機だけ', /#330/.test(t) && !/#325/.test(t) && !/#328/.test(t), t.slice(0, 800));
  chk('★該当が無い日（10/28）は出さない', !/10\/28/.test(t));
  await page.locator('button', { hasText: /^塗装後修正済\s*1$/ }).first().click();
  await page.waitForTimeout(300);
  t = await page.evaluate(() => document.body.innerText);
  chk('「塗装後修正済」で325号機だけ', /#325/.test(t) && !/#330/.test(t));
  await page.locator('button', { hasText: /^すべて\s*5$/ }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /10\/28/ }).first().click();
  await page.waitForTimeout(300);
  t = await page.evaluate(() => document.body.innerText);
  chk('要処置が出る', /要処置/.test(t));
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  chk('横にはみ出さない', !over);

  console.log('■ amingが読めないとき');
  const d2 = { ...data, getArmShipPlan: { ...PLAN, aming: false, amingError: 'amingの記録が読めませんでした（権限がありません）',
    days: PLAN.days.map((g) => ({ ...g, fixedN: undefined, rows: g.rows.map((r) => ({ ...r, stage: undefined })) })) } };
  const p2 = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p2.addInitScript((d) => { function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
    if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
    if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } }; }, d2);
  await p2.goto('file://' + SP + '/aming_page.html');
  await p2.waitForTimeout(1500);
  await p2.locator('button', { hasText: 'アーム出荷予定' }).first().click();
  await p2.waitForTimeout(600);
  const t2 = await p2.evaluate(() => document.body.innerText);
  chk('★読めないと書く', /amingの記録が読めませんでした/.test(t2));
  chk('★予定はそのまま出る（絞り込み・修正済は出さない）', /#325/.test(t2) && !/未塗装後修正/.test(t2) && !/塗装完了 \d/.test(t2));

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
