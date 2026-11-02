// 重量転記アプリの実績（計画と並べる・生産の推移）と、自動でできたロットを置場に置く画面のテスト（2026/11/01）。
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
// 今の番号（11/2〜）の 18 集会場（東）・19 臨時（池北駐車場）も置く（バラの置場）
recs.push(Object.assign({}, recs[0], { no: '18', name: '集会場', position: '東' }), Object.assign({}, recs[0], { no: '19', name: '臨時', position: '池北駐車場' }));
const locs = recs.map(s.yardtab_shape_);

(async () => {
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  Object.assign(data, {
    getYardTabData: { updated: 'x', error: null, sheetUrl: 'x', totals: s.yardtab_totals_(locs), locations: locs, site: { overrides: {}, zones: [] } },
    getYardDailyTotals: { error: null, days: [] }, getYardChangeLog: { error: null, rows: [] },
    getProdActuals: { error: null, syncedAt: '2026-11-02 10:05',
      today: { 日付: '2026-11-02', 合計: 1150, '50kg': 600, '20kg': 450, '30kg': 0, その他: 100, 区分: { '50kg': 600, '20kg': 450, '8kg': 100 } },
      months: [{ 月: '2026-10', 合計: 9000, '50kg': 5000, '20kg': 4000, '30kg': 0, その他: 0, 日数: 12, 区分: {} },
               { 月: '2026-11', 合計: 1150, '50kg': 600, '20kg': 450, '30kg': 0, その他: 100, 日数: 1, 区分: {} }],
      days: [{ 日付: '2026-10-30', 合計: 937, '50kg': 0, '20kg': 937, '30kg': 0, その他: 0, 区分: { '20kg': 739, '20kg三部制': 198 } },
             { 日付: '2026-11-02', 合計: 1150, '50kg': 600, '20kg': 450, '30kg': 0, その他: 100, 区分: { '50kg': 600, '20kg': 450, '8kg': 100 } }] },
    getProdPlanData: { error: null, daily: { 今日: true, 日付ラベル: '11月2日', 合計: 1900, 工場: [
        { 工場: '50k', 計画数: 1000, 基準: '処理', 社員: 18, 協力: 8, 工程: [{ 工程: '処理', 計画数: 1000 }] },
        { 工場: '20k', 計画数: 900, 基準: '処理', 社員: 3, 協力: 1, 工程: [{ 工程: '処理', 計画数: 900 }] }] },
      monthly: { 月: '2026-11', 合計: 20000, 行: [{ サイズ: '50kg', 月計: 12000 }, { サイズ: '20kg', 月計: 8000 }] } },
    getProdLots: { error: null, totals: { 未受検: 600, 受検済: 0, 入庫済: 0, 出荷済今月: 0 }, lots: [
      { ロットID: 'L20261102-001', 生産日: '2026-11-02', 機種名: '50kg', サイズ: '50kg', 容器接頭辞: 'HEP', 容器No開始: '84001', 容器No終了: '84600', 本数: 600, 状態: '未受検', 置場番号: '', 置場名: '', 出荷済本数: 0, 登録者: '（自動：重量転記）' },
      { ロットID: 'L20261102-009', 生産日: '2026-11-02', 機種名: '20kg', サイズ: '20kg', 容器接頭辞: 'HXR', 容器No開始: '04073', 容器No終了: '04100', 本数: 28, 状態: '未受検', 置場番号: '', 置場名: '', 出荷済本数: 0, 登録者: '（自動：重量転記）', 備考: '重量転記アプリで量った容器から自動・バラ（11・19・18のどれかに置く）' },
      { ロットID: 'L20261101-001', 生産日: '2026-11-01', 機種名: '50kg容器', サイズ: '50kg', 容器接頭辞: 'HEP', 容器No開始: '83001', 容器No終了: '83010', 本数: 10, 状態: '未受検', 置場番号: '7', 置場名: '大型製缶', 出荷済本数: 0, 登録者: '野田' }],
      inYard: [
      { id: 'L20261028-001', no: '7', size: '50kg', name: '50kg容器', day: '2026-10-28', state: '受検済', pre: 'HXP', from: '10001', to: '10200', n: 200, left: 200, counted: true },
      { id: 'L20261029-001', no: '7', size: '50kg', name: '50kg容器', day: '2026-10-29', state: '入庫済', pre: 'HXP', from: '10201', to: '10300', n: 100, left: 50, counted: true },
      { id: 'L20261029-002', no: '12', size: '20kg', name: '20kg容器', day: '2026-10-29', state: '未受検', pre: 'HXP', from: '20001', to: '20100', n: 100, left: 100, counted: true } ] }, getContainerTypes: { error: null, types: [] },
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
      placeProdLot: (id, no) => { st.calls.push(['place', id, no]); return { ok: true, error: null }; },
      saveYardLocation: (no, up) => { st.calls.push(['save', no, up]); return { ok: true, error: null }; },
      cancelStockMove: (req) => { st.calls.push(['cancel', req]); st.moves.forEach((m) => { if (m.id === req.id) { m.canceled = true; m.canceledBy = req.name; } }); return H.getStockMoves(); },
    };
    function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
      if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
      if (H[fn]) return (...a) => { const r = JSON.parse(JSON.stringify(H[fn](...a))); setTimeout(() => { if (ok) ok(r); }, 0); return px; };
      if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, { d: data });
  fs.writeFileSync(SP + '/prodact_page.html', html);
  await page.goto('file://' + SP + '/prodact_page.html');
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: '野外置場' }).first().click();
  await page.waitForTimeout(1200);
  const txt = async () => page.evaluate(() => document.body.innerText);
  const msg = async () => page.evaluate(() => { const m = document.querySelector('[data-move-msg]'); return m ? m.innerText : ''; });

  console.log('■ 生産計画に実績を並べる');
  const planText = await page.evaluate(() => [...document.querySelectorAll('[data-actual]')].map((e) => e.innerText));
  chk('★当日：50k 実績600本（60%）・20k 実績450本（50%）', planText[0] === '実績 600本（60%）' && planText[1] === '実績 450本（50%）', planText);
  chk('★当月：50kg 実績600本（5%）・20kg 450本（6%）', planText[2] === '実績 600本（5%）' && planText[3] === '実績 450本（6%）', planText);
  let t = await txt();
  chk('★何の数か・いつ取り込んだか', /実績は重量転記アプリで量った本数（欠番・底黒は数えない）。11\/02 10:05 取込/.test(t), t.slice(t.indexOf('実績は'), t.indexOf('実績は') + 80));
  chk('置場の無いサイズ（8kg等）は別に添える', /ほかに置場の無いサイズ 100本/.test(t));

  console.log('■ 自動でできたロット');
  chk('★「重量転記から」の印', await page.locator('[data-lot-auto]').count() === 2);
  chk('★手で登録は「重量転記を通らないもの」だけと書く', /手で登録（重量転記を通らないもの）/.test(t) && /1時間おきに自動でロットになります/.test(t));
  chk('★置場の無い未受検に「置場に置く」（置場のあるロットには出さない）', await page.locator('[data-lot-place]').count() === 2);
  await page.locator('[data-lot-place="L20261102-001"]').click();
  await page.waitForTimeout(200);
  chk('置場を選ばせる', /どの置場に置きましたか/.test(await txt()));
  await page.locator('[data-place-lot="7"]').first().click();
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__st.calls);
  chk('★選んだ置場でサーバに送る', calls.some((c) => c[0] === 'place' && c[1] === 'L20261102-001' && c[2] === '7'), calls);

  console.log('■ 20kg のバラ');
  chk('★満タン／バラの印', await page.locator('[data-lot-part]').count() === 1 && /バラ/.test(await page.locator('[data-lot-part]').first().innerText()));
  await page.locator('[data-lot-place="L20261102-009"]').click();
  await page.waitForTimeout(200);
  const bp = await page.evaluate(() => { const e = document.querySelector('[data-bara-places]'); return e ? [...e.querySelectorAll('button')].map((b) => b.innerText) : []; });
  chk('★バラは 11・19・18 を先に出す', bp.length === 3 && /^11 /.test(bp[0]) && /^19 /.test(bp[1]) && /^18 /.test(bp[2]), bp);

  console.log('■ 実績・推移タブに生産の推移');
  await page.locator('button', { hasText: '実績・推移' }).first().click();
  await page.waitForTimeout(700);
  t = await txt();
  chk('★生産の推移のカード', /生産の推移/.test(t) && await page.locator('[data-prod-chart] svg rect').count() > 3);
  const pick = async () => page.evaluate(() => { const e = document.querySelector('[data-prod-pick]'); return e ? e.innerText : ''; });
  chk('★最初は一番新しい日の内訳', /11\/2\s+1,150本/.test(await pick()) && /8kg 100/.test(await pick()), await pick());
  await page.locator('[data-prod-chart] svg g[style]').first().dispatchEvent('click');
  await page.waitForTimeout(200);
  chk('★棒を押すとその日の内訳（20kg三部制も）', /10\/30\s+937本/.test(await pick()) && /20kg三部制 198/.test(await pick()), await pick());
  const mt = await page.evaluate(() => document.querySelector('[data-prod-months]').innerText);
  chk('★月ごとの表（新しい月が上）', mt.indexOf('11月') < mt.indexOf('10月') && /9,000/.test(mt), mt);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  chk('横にはみ出さない', !over);
  await page.locator('[data-prod-chart]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: SP + '/prod_chart.png', fullPage: false });

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
