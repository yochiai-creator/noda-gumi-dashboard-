// 20kマップの右端（位置63〜70＝小容器ボビン）が見える範囲にあるかを実測する。
const { chromium } = require('playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';
const html = fs.readFileSync('/home/user/noda-gumi-dashboard-/gas/noda_dashboard.html', 'utf8');
const E = { updated: '2026-09-09 12:00', error: null };
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {},
    totals: { total: 7435, '50k': 1429, '20k': 4682 },
    // 在庫照会CSVの「分類」列から出した9分類の内訳
    bySize: {
      '2K': { label: '2K', count: 12 }, '5K': { label: '5K', count: 8 },
      '8K': { label: '8K', count: 38 }, '10K': { label: '10K', count: 18 },
      '20K_三部軽量': { label: '20K(三部軽量)', count: 3120 },
      '20K_直付': { label: '20K(直付)', count: 1562 },
      '30K': { label: '30K', count: 123 },
      '50K_軽量型': { label: '50K(軽量型)', count: 1200 },
      '50K_S': { label: '50K(S)', count: 229 },
    },
    byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 602 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/9', shipments: [], week: [] }),
  // ★ 静的データでは位置1・2は在庫。ライブで両方とも空きにする。
  //    静的データのまま数えていると 14区画=1,400本、ライブを見ていれば
  //    16区画=1,600本になる。KPIがライブを見ているかがこれで分かる。
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({
    '50k': [
      { pos: '1', found: true, kind: 'empty', shipDate: null, orders: [] },
      { pos: '2', found: true, kind: 'empty', shipDate: null, orders: [] },
      // ★ 指図書つきの区画（タップするとPDFのボタンが出る）
      { pos: '4', found: true, kind: 'fill', groupNo: 465, rangeStart: 46401, rangeEnd: 46500, qty: 100,
        orders: [{ no: '26-30425', url: 'https://drive.google.com/file/d/x/view', date: '8/21' },
                 { no: '24-30426', url: null, date: null }] },
      // ★ 指図書が1件だけの区画。タップでそのままPDFが開く
      { pos: '6', found: true, kind: 'fill', groupNo: 456, rangeStart: 45501, rangeEnd: 45600, qty: 100,
        orders: [{ no: '26-60639', url: 'https://drive.google.com/file/d/one/view', date: '9/10' }] },
      // ★ PDFが2つある区画。どれを開くか決められないので勝手には開かない
      { pos: '7', found: true, kind: 'fill', groupNo: 457, rangeStart: 45601, rangeEnd: 45700, qty: 100,
        orders: [{ no: '26-60640', url: 'https://drive.google.com/file/d/a/view', date: '9/1' },
                 { no: '26-60641', url: 'https://drive.google.com/file/d/b/view', date: '9/2' }] },
    ],
    '20k': [] }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'x', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'x', months: [], hasOrders: false, hasPlan: false, partialMonth: null, startMonth: null }),
  getYardCapacitySummary: () => ({ updated: '2026-09-09 12:00', error: null, locations: 36,
    a20: 15880, m20: 20308, a30: 0, m30: 0, a50: 15800, m50: 19100,
    total: 31680, max: 39408, nearFull: 3, over: 1,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit' }),
  getYardCapacityUrl: () => ({ url: 'https://script.google.com/a/x/exec?page=yard', error: null }),
  getArmShipPlan: () => ({ updated: 'x', error: null, total: 0, days: [],
    sourceName: null, snapshotAt: null, stale: false, pdfUrl: null, pdfName: null }),
  getDispatchGridData: () => ({ ...E, source: 'Excel', editable: false, weekOffset: 0, weekLabel: null, hasPrev: false, hasNext: false, days: [], trucks: [], totals: {} }),
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
    // ★ タップのたびにDriveを検索し直していないかを数える
    window.__calls = [];
    function mk2() { let ok = null;
      const o = { withSuccessHandler(f) { ok = f; return o; }, withFailureHandler() { return o; } };
      Object.keys(d).forEach((fn) => { o[fn] = () => {
        window.__calls.push(fn);
        setTimeout(() => { if (ok) ok(d[fn]); }, 0); return o; }; });
      return o; }
    window.google = { script: { get run() { return mk2(); }, host: {} } };
    // ★ タップでPDFが開くかを見るため window.open を記録に差し替える
    window.__opened = [];
    window.open = (u) => { window.__opened.push(u); return null; };
  }, data);
  const tmp = SP + '/yardkpi.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.locator('button', { hasText: 'ヤード・現場' }).first().click();
  await page.waitForTimeout(1200);

  let pass = 0, fail = 0;
  const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
    else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

  const kpi = await page.evaluate(() => [...document.querySelectorAll('main > div.grid > div')]
    .map((c) => c.innerText.replace(/\n+/g, ' ')));
  console.log('   KPI:', JSON.stringify(kpi));
  chk('ヤードのKPIが5枚ある', kpi.length === 5, kpi.length);
  chk('50kg 搬入可能数がある', kpi.some((t) => t.indexOf('50kg 搬入可能数') !== -1), kpi);
  chk('20kg 搬入可能数がある', kpi.some((t) => t.indexOf('20kg 搬入可能数') !== -1), kpi);

  /* 静的データの空きは 50k=14区画・20k=15区画。ライブで位置1・2を空きにしたので
     50k は 16区画。→ 50k 16*100=1,600本 / 20k は変更なしで 15*50=750本 */
  const t50 = kpi.find((t) => t.indexOf('50kg 搬入可能数') !== -1) || '';
  const t20 = kpi.find((t) => t.indexOf('20kg 搬入可能数') !== -1) || '';
  chk('★50kgがライブの空きを見ている（静的の1,400ではなく1,600）',
    /1,600/.test(t50) && !/1,400/.test(t50), t50);
  chk('20kgの本数が空き区画×50になっている', /750/.test(t20), t20);

  /* 位置1（ライブで空きにした区画）をタップして、詳細が出ることと、
     状態が「空き」になっていることを見る。
     ★ 出荷希望日の null の扱いは tools/yard_merge_test.js で直接見ている
        （静的データに shipDate を持つ区画が無いので、ここでは確かめられない）。 */
  const detail = await page.evaluate(() => {
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<1>');
    if (!t) return { ok: false, why: '位置1が見つからない' };
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { ok: true };
  });
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /状態/.test(d.innerText) && d.innerText.length < 400);
    return el ? el.innerText.replace(/\n+/g, ' / ') : null;
  });
  console.log('   位置1の詳細:', JSON.stringify(panel));
  chk('位置1をタップできる', detail.ok, detail);
  chk('ライブで空きにした区画が「空き」と出る',
    panel !== null && /空き/.test(panel), panel);

  /* ★ サイズ別在庫が9分類に戻っているか。50kg/20kgの2つだけになっていた。 */
  const sizes = await page.evaluate(() => {
    /* ★ 見出しは畳めるようになって h2 ではなく button になった。
         「たたむ ▲」を含むボタンを探して、そのすぐ下の中身を見る。 */
    const btn = [...document.querySelectorAll('button')]
      .find((x) => x.innerText.indexOf('サイズ別 在庫本数') !== -1);
    if (!btn) return null;
    const body = btn.nextElementSibling;
    const grid = body && body.querySelector('.grid');
    return grid ? [...grid.children].map((c) => c.innerText.replace(/\n+/g, ' ')) : null;
  });
  console.log('   サイズ別:', JSON.stringify(sizes));
  chk('サイズ別在庫が9分類＋合計で10枚ある', sizes && sizes.length === 10, sizes && sizes.length);
  chk('20K(三部軽量)が出ている', sizes && sizes.some((t) => t.indexOf('20K(三部軽量)') !== -1), sizes);
  chk('50K(S)が出ている', sizes && sizes.some((t) => t.indexOf('50K(S)') !== -1), sizes);
  chk('本数が入っている（3,120本）', sizes && sizes.some((t) => /3,120/.test(t)), sizes);

  /* ★ 描画エラーで真っ白にならないよう ErrorBoundary で包んである。 */
  const guarded = await page.evaluate(() => {
    const s = document.documentElement.innerHTML;
    return /createElement\(ErrorBoundary/.test(s) || /ErrorBoundary/.test(s);
  });
  chk('ErrorBoundaryで包んである', guarded, guarded);

  /* ★ 見出しをタップして畳めること（ヤードタブも同じ作りにした） */
  const before = await page.evaluate(() => document.body.scrollHeight);
  await page.locator('button', { hasText: 'サイズ別 在庫本数' }).first().click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.body.scrollHeight);
  chk('★サイズ別在庫を畳める', after < before, { before: before, after: after });
  await page.locator('button', { hasText: 'サイズ別 在庫本数' }).first().click();
  await page.waitForTimeout(400);
  chk('もう一度押すと戻る', (await page.evaluate(() => document.body.scrollHeight)) === before, before);

  /* ★ 指図書PDFはタップすれば前から開けたが、どこにあるか分からなかった。
       凡例と件数を出して、何を見ればよいか分かるようにした。 */
  const legend = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.innerText
      && d.innerText.indexOf('指図書あり') === 0 && d.innerText.length < 200);
    return el ? el.innerText.replace(/\n+/g, ' / ') : null;
  });
  console.log('   凡例:', JSON.stringify(legend));
  chk('★指図書の凡例が出ている', legend && /指図書あり/.test(legend), legend);
  chk('タップすれば出ることが書いてある', legend && /タップ/.test(legend), legend);
  chk('この図に何区画あるか出る（3区画）', legend && /指図書 3 区画/.test(legend), legend);

  // 指図書つきの区画をタップするとPDFのボタンが出る
  const tapped = await page.evaluate(() => {
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<4>');
    if (!t) return { ok: false };
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { ok: true };
  });
  await page.waitForTimeout(600);
  const pdf = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')].filter((a) => /を開く/.test(a.textContent));
    const dim = [...document.querySelectorAll('span')].filter((x) => /PDF未検出/.test(x.textContent));
    return { 開くボタン: links.map((a) => a.textContent.trim()), href: links[0] ? links[0].getAttribute('href') : null,
      未検出: dim.map((x) => x.textContent.trim()) };
  });
  console.log('   指図書:', JSON.stringify(pdf));
  chk('区画をタップすると指図書のボタンが出る', tapped.ok && pdf.開くボタン.length === 1, pdf);
  chk('ボタンにPDFのリンクが入っている', pdf.href && /drive\.google\.com/.test(pdf.href), pdf.href);
  chk('PDFが見つからない依頼Noはそう書く', pdf.未検出.length === 1 && /30426/.test(pdf.未検出[0]), pdf.未検出);
  /* ★ 一律「26-」を付けて表示していたので、24年度の区画も26-と出ていた。
       PDFの日付も出して、古い月のものかどうかを見分けられるようにした。 */
  chk('★年度の頭をそのまま出す（26-30425）', /26-30425/.test(pdf.開くボタン[0]), pdf.開くボタン);
  chk('★PDFの日付が出る（8/21）', /8\/21/.test(pdf.開くボタン[0]), pdf.開くボタン);
  chk('★24年度の区画に26-を付けない', /24-30426/.test(pdf.未検出[0]), pdf.未検出);

  /* ★ 指図書が1件だけの区画は、タップした流れでそのままPDFを開く */
  const one = await page.evaluate(() => {
    window.__opened = [];
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<6>');
    if (!t) return { ok: false };
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { ok: true, opened: window.__opened };
  });
  console.log('   1件の区画をタップ:', JSON.stringify(one));
  chk('★指図書1件の区画はタップでPDFが開く',
    one.ok && one.opened.length === 1 && /file\/d\/one/.test(one.opened[0]), one);

  /* 開けるPDFが1つに決まるときだけ開く。2つあるとどれを開くか決められない。 */
  const many = await page.evaluate(() => {
    window.__opened = [];
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<7>');
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return window.__opened;
  });
  chk('★PDFが2つあるときは勝手に開かない（ボタンで選んでもらう）', many.length === 0, many);

  const oneOfTwo = await page.evaluate(() => {
    window.__opened = [];
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<4>');
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return window.__opened;
  });
  chk('依頼Noが2件でもPDFが1つなら開く', oneOfTwo.length === 1, oneOfTwo);

  const none = await page.evaluate(() => {
    window.__opened = [];
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<1>');
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return window.__opened;
  });
  chk('指図書が無い区画では開かない', none.length === 0, none);

  /* ★ タップのたびに「指図書PDFを検索中…」が出て待たされていた。
       一括取得で全区画ぶん解決済みなので、取り直さない。 */
  const lookup = await page.evaluate(() => {
    window.__calls = [];
    ['<6>', '<4>', '<1>', '<7>'].forEach((label) => {
      const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === label);
      if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return { 検索: window.__calls.filter((c) => c === 'getYardBlockDetailWithPdf').length,
             すべて: window.__calls };
  });
  console.log('   4区画タップしたときのDrive検索:', JSON.stringify(lookup));
  chk('★タップのたびに検索し直さない（0回）', lookup.検索 === 0, lookup);
  const spinner = await page.evaluate(() => /指図書PDFを検索中/.test(document.body.innerText));
  chk('「検索中…」が出ない', spinner === false, spinner);

  /* 一括取得に入っていなかった区画（このモックでは位置9）は、
     今までどおりその場で取りに行く。取りこぼしを作らないこと。 */
  const fallback = await page.evaluate(() => {
    window.__calls = [];
    const t = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '<9>');
    if (!t) return { ok: false };
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { ok: true, 検索: window.__calls.filter((c) => c === 'getYardBlockDetailWithPdf').length };
  });
  chk('一括取得に無い区画は今までどおり取りに行く', fallback.ok && fallback.検索 === 1, fallback);

  await page.screenshot({ path: SP + '/yard_kpi.png', fullPage: false });
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
