// グラフの数字が読めるかを実測で押さえる。
//
// ★ なぜ要るのか
//   「数字が見にくい」と何度も言われた。原因は2つあった。
//     ・字が小さい（8〜8.5px）
//     ・縁取り（paint-order:stroke）は字の形に沿うので、字と字のすき間を
//       通った線がそのまま見えていた（在庫の折れ線が「7,435」を横切っていた）
//   実際のブラウザで描いて、字の大きさと重なりを数える。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

// preview.js のモック応答をそのまま使う（同じ数字で見比べられるように）
const src = fs.readFileSync(path.join(__dirname, 'preview.js'), 'utf8');
const REPLY = (() => {
  const a = src.indexOf('const MONTHS');
  const b = src.indexOf('(async () => {');
  return new Function('process', src.slice(a, b) + '\nreturn REPLY;')(process);
})();

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const html = fs.readFileSync(path.join(__dirname, '../gas/noda_dashboard.html'), 'utf8');
  const data = {};
  Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  await page.addInitScript((d) => {
    function mk() {
      let ok = null;
      const o = { withSuccessHandler(f) { ok = f; return o; }, withFailureHandler() { return o; } };
      Object.keys(d).forEach((fn) => { o[fn] = () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return o; }; });
      return o;
    }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, data);
  const tmp = SP + '/preview_chart.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.locator('button', { hasText: '実績・推移' }).first().click();
  await page.waitForTimeout(800);

  // グラフごとに、字の大きさ・重なり・下敷きの有無を見る
  const charts = await page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll('svg')].forEach((s) => {
      const box = s.getBoundingClientRect();
      if (box.width < 100) return;                     // アイコンのSVGは対象外
      const texts = [...s.querySelectorAll('text')].map((t) => {
        const r = t.getBoundingClientRect();
        return { t: t.textContent, x: r.x, y: r.y, w: r.width, h: r.height,
          px: parseFloat(getComputedStyle(t).fontSize), fill: t.getAttribute('fill') };
      });
      const ov = [];
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i], c = texts[j];
        if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) {
          ov.push([a.t, c.t]);
        }
      }
      // 数字（カンマ区切り）に面色の下敷きが敷いてあるか
      const nums = [...s.querySelectorAll('g')].filter((g) => {
        const t = g.querySelector(':scope > text'), r = g.querySelector(':scope > rect');
        return t && r && /^[\d,]+$/.test(t.textContent.trim());
      }).length;
      out.push({ w: Math.round(box.width), h: Math.round(box.height),
        texts, overlaps: ov, 下敷きのある数字: nums });
    });
    return out;
  });
  console.log('   グラフ数:', charts.length);
  charts.forEach((c, i) => console.log('   #' + i, JSON.stringify({
    w: c.w, h: c.h, 字: c.texts.length, 重なり: c.overlaps, 下敷き: c.下敷きのある数字,
    最小px: Math.min(...c.texts.map((t) => t.px)) })));

  chk('グラフが2つ出ている（在庫・出荷・受注／アーム 月別出荷）', charts.length === 2, charts.length);
  charts.forEach((c, i) => {
    chk('#' + i + ' 数字が重なっていない', c.overlaps.length === 0, c.overlaps);
    chk('#' + i + ' 一番小さい字でも8px以上', Math.min(...c.texts.map((t) => t.px)) >= 8,
      Math.min(...c.texts.map((t) => t.px)));
    const nums = c.texts.filter((t) => /^[\d,]+$/.test(t.t.trim()) && t.fill !== '#94a3b8');
    chk('#' + i + ' 棒や線の上の数字は10px', nums.length > 0 && nums.every((t) => t.px >= 10),
      nums.map((t) => t.t + ':' + t.px));
    chk('#' + i + ' その数字には面色の下敷きがある', c.下敷きのある数字 >= nums.length,
      { 下敷き: c.下敷きのある数字, 数字: nums.length });
    chk('#' + i + ' 字が枠からはみ出していない',
      c.texts.every((t) => t.w < c.w), c.texts.filter((t) => t.w >= c.w).map((t) => t.t));
  });

  const svg = page.locator('svg').nth(
    await page.evaluate(() => {
      const all = [...document.querySelectorAll('svg')];
      let bi = 0, bw = 0;
      all.forEach((s, i) => { const w = s.getBoundingClientRect().width; if (w > bw) { bw = w; bi = i; } });
      return bi;
    }));
  await svg.scrollIntoViewIfNeeded();
  await page.screenshot({ path: SP + '/chart.png', clip: await svg.boundingBox() });

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
