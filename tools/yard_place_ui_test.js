// 野外置場タブの「置場の中身」・敷地図からの移動／持ち出し・ピンの置き直し・並び（2026/11/01）の画面テスト。
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
// エリア（囲み）のある置場（2026/11/01）。12 事務所を囲む。壊れた値はピンのまま
recs.find((r) => r.no === '12').area = '[[8300,7800],[8900,7800],[8900,8300],[8300,8300]]';
recs.find((r) => r.no === '11').area = 'こわれた';
const locs = recs.map(s.yardtab_shape_);

(async () => {
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  Object.assign(data, {
    getYardTabData: { updated: 'x', error: null, sheetUrl: 'x', totals: s.yardtab_totals_(locs), locations: locs, site: { overrides: {}, zones: [], extra: [{ name: '集会場', points: [[12300, 9500], [12900, 9500], [12900, 9900], [12300, 9900]] }] } },
    getYardDailyTotals: { error: null, days: [] }, getYardChangeLog: { error: null, rows: [] },
    getProdLots: { error: null, lots: [], totals: {}, inYard: [
      { id: 'L20261028-001', no: '7', size: '50kg', name: '50kg容器', day: '2026-10-28', state: '受検済', pre: 'HXP', from: '10001', to: '10200', n: 200, left: 200, counted: true },
      { id: 'L20261029-001', no: '7', size: '50kg', name: '50kg容器', day: '2026-10-29', state: '入庫済', pre: 'HXP', from: '10201', to: '10300', n: 100, left: 50, counted: true },
      { id: 'L20261029-002', no: '12', size: '20kg', name: '20kg容器', day: '2026-10-29', state: '未受検', pre: 'HXP', from: '20001', to: '20100', n: 100, left: 100, counted: true } ] }, getContainerTypes: { error: null, types: [] },
    getProdPlanData: { error: null, daily: { 工場: [] }, monthly: { 行: [] } },
  });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
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
      saveYardLocation: (no, up) => { st.calls.push(['save', no, up]); return { ok: true, error: null }; },
      cancelStockMove: (req) => { st.calls.push(['cancel', req]); st.moves.forEach((m) => { if (m.id === req.id) { m.canceled = true; m.canceledBy = req.name; } }); return H.getStockMoves(); },
    };
    function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
      if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
      if (H[fn]) return (...a) => { const r = JSON.parse(JSON.stringify(H[fn](...a))); setTimeout(() => { if (ok) ok(r); }, 0); return px; };
      if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, { d: data });
  fs.writeFileSync(SP + '/place_page.html', html);
  await page.goto('file://' + SP + '/place_page.html');
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: '野外置場' }).first().click();
  await page.waitForTimeout(1200);
  const txt = async () => page.evaluate(() => document.body.innerText);
  const msg = async () => page.evaluate(() => { const m = document.querySelector('[data-move-msg]'); return m ? m.innerText : ''; });

  const order = async () => page.evaluate(() => [...document.querySelectorAll('[data-card]')].map((e) => e.getAttribute('data-card')));

  console.log('■ 並び（現場で使うものを上に）');
  let t = await txt();
  const qb = await page.locator('[data-quick] button').allInnerTexts();
  chk('★上に「地図・動かす・ロット登録・本数を直す」', JSON.stringify(qb) === JSON.stringify(['地図', '動かす', 'ロット登録', '本数を直す']), qb);
  const ord = await order();
  chk('★敷地図 → 在庫の動き → 生産の流れ → 置場の一覧 の順', JSON.stringify(ord) === JSON.stringify(['map', 'move', 'lots', 'list']), ord);
  chk('★生産計画は置場の一覧より下', t.indexOf('生産計画') > t.indexOf('置場の一覧'));

  console.log('■ エリア（囲み）');
  chk('★サーバ：エリアの文字を角の配列に（壊れた値は null）', s.yardtab_area_('[[1,2],[3,4.4],[5,6]]').join('|') === '1,2|3,4|5,6' && s.yardtab_area_('こわれた') === null && s.yardtab_area_('[[1,2],[3,4]]') === null && s.yardtab_area_('') === null);
  chk('★囲みのある置場（12）は多角形で描く', await page.locator('[data-area="12"]').count() === 1);
  chk('★囲みの真ん中に番号（ピンの代わり）', await page.evaluate(() => { const g = document.querySelector('[data-pin="12"]'); return !!g && !g.querySelector('polygon'); }));
  chk('壊れた値の置場（11）はピンのまま', await page.locator('[data-area="11"]').count() === 0 && await page.locator('[data-pin="11"]').count() === 1);
  await page.locator('[data-area="12"]').dispatchEvent('click');
  await page.waitForTimeout(200);
  chk('★囲みを押すと中身が出る', /12 事務所/.test(await page.evaluate(() => { const d = document.querySelector('[data-place-detail]'); return d ? d.innerText : ''; })));
  await page.locator('[data-area="12"]').dispatchEvent('click');
  await page.waitForTimeout(200);

  console.log('■ 後から足した建物（集会場）');
  chk('★サーバ：シート「敷地図の建物」の行を建物に（名前なし・形の壊れた行は飛ばす）', JSON.stringify(s.yardtab_extraFrom_([['集会場', '[[1,2],[3,4],[5,6]]'], ['', '[[1,2],[3,4],[5,6]]'], ['倉庫', 'x']])) === JSON.stringify([{ name: '集会場', points: [[1, 2], [3, 4], [5, 6]] }]));
  chk('★敷地図に集会場の建物を描く（名前つき）', await page.locator('[data-extra="集会場"] polygon').count() === 1 && /集会場/.test(await page.locator('[data-extra="集会場"] text').textContent()));

  console.log('■ ピンを押すと中身');
  await page.locator('[data-pin="7"]').dispatchEvent('click');
  await page.waitForTimeout(300);
  const det = async () => page.evaluate(() => { const d = document.querySelector('[data-place-detail]'); return d ? d.innerText : ''; });
  let d = await det();
  chk('★置場の名前と本数', /7 大型製缶/.test(d) && /50kg\s*300本/.test(d), d.slice(0, 200));
  chk('★ロットと番号なしに分けて出す（ロット250・番号なし50）', /ロット 250本・番号なし（前からの在庫など） 50本/.test(d), d);
  chk('★ロットの容器番号と残り（古い順）', /HXP10001〜10200\s*50kg 残り200本\s*受検済/.test(d) && /HXP10201〜10300\s*50kg 残り50\/100本\s*入庫済/.test(d) && d.indexOf('10001') < d.indexOf('10201'), d);
  chk('★ほかの置場のロットは出さない', !/HXP20001/.test(d));

  console.log('■ 中身から移動・持ち出し');
  await page.locator('[data-place-act="move"]').click();
  await page.waitForTimeout(300);
  const from = await page.locator('select[data-move="from"]').inputValue();
  t = await txt();
  chk('★「ここから移動」で、元＝7・50kg が入った状態になる', from === '7' && /どの置場へかを選んでください|「記録する人」で名前/.test(t), from);
  await page.locator('[data-place-act="out"]').click();
  await page.waitForTimeout(300);
  t = await txt();
  chk('★「入込場へ持ち出し」で、先＝50k入込場', /先：50k入込場/.test(t) && await page.locator('select[data-move="from"]').inputValue() === '7');

  console.log('■ ピンの位置を直す');
  await page.locator('[data-place-act="pin"]').click();
  await page.waitForTimeout(200);
  chk('★「場所を地図で押してください」と出る', /「7 大型製缶」の場所を地図で押してください/.test(await txt()));
  const svg = page.locator('[data-card="map"] svg').first();
  await svg.scrollIntoViewIfNeeded();
  const bb = await svg.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__st.calls);
  const sv = calls.find((c) => c[0] === 'save');
  chk('★押した所を地図X/Yに保存（敷地の真ん中あたり）', sv && sv[1] === '7' && Math.abs(sv[2].mapX - 8900) < 600 && Math.abs(sv[2].mapY - 6050) < 600 && Object.keys(sv[2]).length === 2, sv);
  chk('★置き直しが終わったら案内は消える', !/場所を地図で押してください/.test(await txt()));

  console.log('■ 拡大するとピンの下に本数');
  chk('拡大前は本数を出さない', !(await page.evaluate(() => document.querySelector('[data-pin="7"]').textContent)).includes('本'));
  await page.locator('[data-card="map"] button', { hasText: '＋' }).click();
  await page.locator('[data-card="map"] button', { hasText: '＋' }).click();
  await page.waitForTimeout(200);
  chk('★拡大するとピンの下に「300本」', (await page.evaluate(() => document.querySelector('[data-pin="7"]').textContent)).includes('300本'));

  console.log('■ 置場の一覧でも中身');
  await page.locator('[data-place-act="edit"]').click();
  await page.waitForTimeout(300);
  const lc = await page.evaluate(() => { const e = document.querySelector('[data-list-contents="7"]'); return e ? e.innerText : ''; });
  chk('★一覧の行を開くと中身（ロット・番号なし・容器番号）', /50kg ロット250・番号なし50/.test(lc) && /HXP10001〜10200/.test(lc), lc);

  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  chk('横にはみ出さない', !over);
  await page.locator('[data-card="map"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: SP + '/place_top.png', fullPage: false });
  await page.locator('[data-place-detail]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: SP + '/place_detail.png', fullPage: false });

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
