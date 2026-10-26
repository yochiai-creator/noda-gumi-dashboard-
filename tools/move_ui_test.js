// 野外置場タブの「在庫の動き」（移動・入込場への持ち出し・廃棄）の画面テスト。
// 置場は 2026/10/13 の置場容量シートの実物（sitemap_rows.json）。サーバは偽物。
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 400) : '')); } };

const s = { Logger: { log() {} }, JSON, Object, Number, String, Math, Date, Array, isNaN, Utilities: { formatDate: () => '2026-10-27 08:00' } };
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/../gas/noda_yard_tab.js', 'utf8'), s);
const rows = JSON.parse(fs.readFileSync(__dirname + '/sitemap_rows.json', 'utf8'));
const recs = rows.map((r) => ({ no: r[0], name: r[1], position: r[2], a20: r[3], m20: r[4], a30: r[5], m30: r[6], a50: r[7], m50: r[8], mapX: r[9], mapY: r[10], note: '' }));
// 50kg を置いた置場を作っておく（7 大型製缶 に 300本）
recs.find((r) => r.no === '7').a50 = '300';
const locs = recs.map(s.yardtab_shape_);

(async () => {
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  Object.assign(data, {
    getYardTabData: { updated: 'x', error: null, sheetUrl: 'x', totals: s.yardtab_totals_(locs), locations: locs, site: { overrides: {}, zones: [] } },
    getYardDailyTotals: { error: null, days: [] }, getYardChangeLog: { error: null, rows: [] },
    getProdLots: { error: null, lots: [], totals: {} }, getContainerTypes: { error: null, types: [] },
    getProdPlanData: { error: null, daily: { 工場: [] }, monthly: { 行: [] } },
  });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({ d }) => {
    const st = { calls: [], moves: [{ id: 'L1', at: '2026-10-27 07:30', name: 'genba@nodagumi40.com', kind: '入庫', target: '50kg', size: '50kg', qty: 80, from: '', to: '7 大型製缶', memo: 'ロット L001 を置いた（生産の流れ）', canceled: false }], n: 0 };
    window.__st = st;
    const totals = () => { const t = {}; st.moves.filter((m) => !m.canceled).forEach((m) => { t[m.kind] = t[m.kind] || {}; t[m.kind][m.size] = (t[m.kind][m.size] || 0) + m.qty; }); return t; };
    const H = {
      getWorkStaff: () => ({ staff: [{ 名前: '野田 太郎', 役割: '現場' }], roles: [], account: 'x', error: null }),
      getStockMoves: () => ({ rows: st.moves, totals: totals(), error: null }),
      recordStockMove: (req) => { st.calls.push(['move', req]);
        st.moves.unshift({ id: 'M' + (++st.n), at: '2026-10-27 09:00', name: req.name, kind: req.kind, size: req.size, qty: req.qty, from: req.from + ' 大型製缶', to: req.kind === '移動' ? req.to + ' 事務所' : req.kind === '持ち出し' ? '50k入込場' : '', memo: req.memo, canceled: false });
        return H.getStockMoves(); },
      cancelStockMove: (req) => { st.calls.push(['cancel', req]); st.moves.forEach((m) => { if (m.id === req.id) { m.canceled = true; m.canceledBy = req.name; } }); return H.getStockMoves(); },
    };
    function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
      if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
      if (H[fn]) return (...a) => { const r = JSON.parse(JSON.stringify(H[fn](...a))); setTimeout(() => { if (ok) ok(r); }, 0); return px; };
      if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, { d: data });
  fs.writeFileSync(SP + '/move_page.html', html);
  await page.goto('file://' + SP + '/move_page.html');
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: '野外置場' }).first().click();
  await page.waitForTimeout(1200);
  const txt = async () => page.evaluate(() => document.body.innerText);
  const msg = async () => page.evaluate(() => { const m = document.querySelector('[data-move-msg]'); return m ? m.innerText : ''; });

  console.log('■ 在庫の動き');
  let t = await txt();
  chk('★野外置場タブに「在庫の動き」', /在庫の動き/.test(t));
  chk('★生産の流れの入庫が一覧に出る（取消ボタンは出さない）', /入庫\s*50kg 80本\s*生産 → 7 大型製缶/.test(t) && await page.locator('[data-move-row]').first().locator('button', { hasText: '取消' }).count() === 0, t.slice(t.indexOf('直近7日'), t.indexOf('直近7日') + 200));
  chk('★名前がまだなら、何をすればよいかを出す', /「記録する人」で名前を選んでください/.test(t));
  const fromOpts = await page.locator('select[data-move="from"] option').allInnerTexts();
  chk('★元の置場は、そのサイズ（50kg）がある置場だけ（本数つき）', fromOpts.some((x) => /^7 大型製缶.*50kg 300本/.test(x)) && !fromOpts.some((x) => /^2 水処理/.test(x)), fromOpts.slice(0, 5));

  console.log('■ 移動を記録する');
  await page.locator('select').filter({ has: page.locator('option', { hasText: '名前を選ぶ' }) }).first().selectOption('野田 太郎');
  await page.locator('select[data-move="from"]').selectOption('7');
  await page.locator('input[data-move="qty"]').fill('400');
  t = await txt();
  chk('★足りない本数は、押す前に「◯本しかありません」', /50kgは 300本しかありません/.test(t));
  await page.locator('input[data-move="qty"]').fill('80');
  await page.locator('select[data-move="to"]').selectOption('12');
  t = await txt();
  chk('★押す前に「7 大型製缶 → 12 事務所 50kg 80本」と出る', /7 大型製缶 → 12 事務所\s+50kg 80本/.test(t), t.slice(t.indexOf('記録する'), t.indexOf('記録する') + 120));
  await page.locator('button[data-move="submit"]').click();
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => window.__st.calls);
  chk('★サーバに 種類・サイズ・本数・元・先・名前 を送る', calls[0] && calls[0][1].kind === '移動' && calls[0][1].size === '50kg' && calls[0][1].qty === 80 && calls[0][1].from === '7' && calls[0][1].to === '12' && calls[0][1].name === '野田 太郎', calls);
  chk('★「記録しました」と出る', /✓ 移動 50kg 80本 を記録しました/.test(await msg()), await msg());
  t = await txt();
  chk('★一覧の先頭に出る', /移動\s*50kg 80本\s*7 大型製缶 → 12 事務所\s*野田 太郎/.test(t));

  console.log('■ 廃棄は理由が要る・持ち出しは入込場へ');
  await page.locator('button', { hasText: /^廃棄$/ }).click();
  await page.locator('select[data-move="from"]').selectOption('7');
  await page.locator('input[data-move="qty"]').fill('3');
  t = await txt();
  chk('★廃棄は理由を書くまで記録しない', /廃棄の理由を書いてください/.test(t));
  await page.locator('button[data-move="submit"]').click();
  chk('理由が無いまま押してもサーバに送らない', (await page.evaluate(() => window.__st.calls.length)) === 1);
  await page.locator('button', { hasText: '入込場へ持ち出し' }).click();
  t = await txt();
  chk('★持ち出しの先は50k入込場（サイズで決まる・30kgは選べない）', /先：50k入込場/.test(t) && await page.locator('button', { hasText: /^30kg$/ }).count() === 0);

  console.log('■ 取消');
  await page.locator('[data-move-row]').first().locator('button', { hasText: '取消' }).click();
  await page.waitForTimeout(400);
  const c2 = await page.evaluate(() => window.__st.calls);
  chk('★取消をサーバに送る（名前つき）', c2[c2.length - 1][0] === 'cancel' && c2[c2.length - 1][1].id === 'M1' && c2[c2.length - 1][1].name === '野田 太郎', c2);
  t = await txt();
  chk('★取り消した行は「取消（名前）」と残る', /取消（野田 太郎）/.test(t));
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  chk('横にはみ出さない', !over);
  const card = page.locator('text=在庫の動き').first();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: SP + '/move_card.png', fullPage: false });

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
