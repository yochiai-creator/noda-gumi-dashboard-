// スマホ・タブレット・パソコンで見やすいかのテスト（実ブラウザで3つの幅を測る）。
//   スマホ 390px … 今までどおり1列。KPIは2列。横にはみ出さない
//   タブレット 820px … KPIは1行に並ぶ
//   パソコン 1366px … 中身を広く（1216pxまで）。段を2列に並べる。配車表は最初から週の表
// サーバの返事の見本は preview.js のものをそのまま使う。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
// preview.js の前半（REPLY など）をこのファイルの中で動かす
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 300) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  const openAt = async (w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: w < 1000 });
    const page = await ctx.newPage();
    await page.addInitScript((d) => {
      function mk() { let ok = null;
        const px = new Proxy({}, { get(t, fn) {
          if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; };
          if (fn === 'withFailureHandler') return () => px;
          if (!(fn in d)) return undefined;
          return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; };
        } }); return px; }
      window.google = { script: { get run() { return mk(); }, host: {} } };
    }, data);
    const tmp = SP + '/resp_page.html';
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp);
    await page.waitForTimeout(1500);
    return { ctx, page };
  };
  const tab = async (page, name) => { await page.locator('button', { hasText: name }).first().click(); await page.waitForTimeout(500); };
  const kpiRows = (page) => page.evaluate(() => new Set([...document.querySelectorAll('main > div.nd-kpis > div')]
    .map((c) => Math.round(c.getBoundingClientRect().top))).size);
  const kpiCols = (page) => page.evaluate(() => {
    const cs = [...document.querySelectorAll('main > div.nd-kpis > div')];
    const top = cs.length ? cs[0].getBoundingClientRect().top : 0;
    return cs.filter((c) => Math.round(c.getBoundingClientRect().top) === Math.round(top)).length;
  });
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const mainWidth = (page) => page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width));
  const sameRow = (page, a, b2) => page.evaluate(([x, y]) => {
    const find = (t) => [...document.querySelectorAll('span,div')].find((e) => e.children.length === 0 && e.textContent.trim() === t);
    const ea = find(x), eb = find(y);
    if (!ea || !eb) return null;
    return Math.abs(ea.getBoundingClientRect().top - eb.getBoundingClientRect().top) < 8 &&
      eb.getBoundingClientRect().left > ea.getBoundingClientRect().left + 200;
  }, [a, b2]);

  console.log('■ スマホ 390px（今までどおり）');
  {
    const { ctx, page } = await openAt(390, 844);
    for (const t of ['受注・指図書', 'ヤード・現場', '野外置場', '配車・当日出荷', '実績・推移']) {
      await tab(page, t);
      chk('横にはみ出さない（' + t + '）', await overflow(page) === 0, await overflow(page));
    }
    await tab(page, '野外置場');
    chk('KPIは2列', await kpiCols(page) === 2, await kpiCols(page));
    chk('段は縦に1列（生産計画の下に生産の流れ）', await sameRow(page, '生産計画', '生産の流れ') === false);
    await tab(page, '配車・当日出荷');
    chk('配車表は「日」から', await page.evaluate(() => /1日ぶんを縦に並べます/.test(document.body.innerText)));
    await ctx.close();
  }

  console.log('■ 読み込み中のリフトが画面からはみ出さない（スマホ）');
  for (const w of [390, 360]) {
    // サーバが返事をしない＝読み込み中の画面のまま
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const px = new Proxy({}, { get(t, fn) { return (fn === 'withSuccessHandler' || fn === 'withFailureHandler') ? () => px : () => px; } });
      window.google = { script: { get run() { return px; }, host: {} } };
    });
    const tmp = SP + '/resp_load.html';
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp);
    let worst = { left: 0, right: 0 };
    for (let i = 0; i < 16; i++) {   // 7秒で1往復。0.5秒ごとに8秒ぶん見る
      const r = await page.evaluate(() => {
        const el = document.querySelector('.forklift-move');
        if (!el) return null;
        const a = el.getBoundingClientRect();
        return { left: a.left, right: a.right, vw: document.documentElement.clientWidth };
      });
      if (r) worst = { left: Math.min(worst.left, r.left), right: Math.max(worst.right, r.right - r.vw) };
      await page.waitForTimeout(500);
    }
    chk('★' + w + 'px：リフトが左にはみ出さない', worst.left >= 0, worst);
    chk('★' + w + 'px：リフトが右にはみ出さない', worst.right <= 0, worst);
    chk(w + 'px：読み込み中の画面も横にはみ出さない', await overflow(page) === 0, await overflow(page));
    await ctx.close();
  }

  console.log('■ タブレット 820px');
  {
    const { ctx, page } = await openAt(820, 1180);
    await tab(page, 'ヤード・現場');
    chk('★KPIが5枚でも1行に並ぶ', await kpiRows(page) === 1, await kpiRows(page));
    chk('横にはみ出さない', await overflow(page) === 0);
    await ctx.close();
  }

  console.log('■ パソコン 1366px');
  {
    const { ctx, page } = await openAt(1366, 860);
    chk('★中身を広く（1100px以上）', await mainWidth(page) >= 1100, await mainWidth(page));
    await tab(page, '野外置場');
    chk('★生産計画と生産の流れを横に並べる', await sameRow(page, '生産計画', '生産の流れ') === true);
    chk('KPIは1行', await kpiRows(page) === 1);
    await tab(page, '受注・指図書');
    chk('★受注出荷計画表と指図書を横に並べる', await sameRow(page, '受注出荷計画表 概要', '出荷作業指図書 最新') === true);
    await tab(page, '実績・推移');
    chk('★実績・推移の見出しは「実績・推移」', await page.evaluate(() => document.querySelector('header h1').textContent === '実績・推移'));
    await tab(page, '配車・当日出荷');
    chk('★配車表は最初から週の表', await page.evaluate(() => /週ぜんぶを表で見ます/.test(document.body.innerText)));
    chk('横にはみ出さない', await overflow(page) === 0);
    await ctx.close();
  }

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
