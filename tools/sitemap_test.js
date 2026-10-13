// 野外置場の敷地図（元アプリの敷地レイアウト図をダッシュボードに入れたもの）のテスト。
// 置場のデータは 2026/10/13 の置場容量シートの実物（番号・名前・本数・収容数・地図X/Y）。
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 300) : '')); } };

const s = { Logger: { log() {} }, JSON, Object, Number, String, Math, Date, Array, isNaN,
  Utilities: { formatDate: () => '2026-10-13 08:00' } };
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/../gas/noda_yard_tab.js', 'utf8'), s);
const rows = JSON.parse(fs.readFileSync(__dirname + '/sitemap_rows.json', 'utf8'));
const recs = rows.map((r) => ({ no: r[0], name: r[1], position: r[2], a20: r[3], m20: r[4], a30: r[5], m30: r[6], a50: r[7], m50: r[8], mapX: r[9], mapY: r[10], note: '' }));

console.log('■ サーバ：地図の位置と建屋の手直しも返す');
{
  const r2 = s.yardtab_shape_(recs.find((r) => r.no === '2'));
  chk('地図X/Yを数で返す（2 水処理 6230,5649）', r2.mapX === 6230 && r2.mapY === 5649, r2);
  const r1 = s.yardtab_shape_(recs.find((r) => r.no === '1'));
  chk('★地図X/Yが空なら null（0にしない。0は本物の位置かもしれない）', r1.mapX === null && r1.mapY === null, r1);
  s.yardReadAllRecords_ = () => recs;
  s.yardGetSpreadsheet_ = () => ({ getUrl: () => 'u' });
  s.yardGetBuildingOverrides = () => ({ 'shape:3': { dx: 10, dy: 0, rotation: 15, scale: 1 } });
  s.yardGetAreaZones = () => [{ id: 'a', name: '雪置場', x: 1, y: 2, w: 3, h: 4 }];
  const d = s.getYardTabData();
  chk('★建屋の手直しを返す', d.site && d.site.overrides['shape:3'].rotation === 15, d.site);
  chk('★囲みのエリアを返す', d.site.zones.length === 1 && d.site.zones[0].name === '雪置場');
  s.yardGetBuildingOverrides = () => { throw new Error('x'); };
  const d2 = s.getYardTabData();
  chk('手直しが読めなくても一覧は返す', !d2.error && d2.locations.length === recs.length && d2.site.overrides, d2.error);
}

(async () => {
  const locs = recs.map(s.yardtab_shape_);
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  Object.assign(data, {
    getYardTabData: { updated: 'x', error: null, sheetUrl: 'x', totals: s.yardtab_totals_(locs), locations: locs,
      site: { overrides: {}, zones: [{ id: 'z1', name: '雪置場', x: 9000, y: 9000, w: 800, h: 400 }] } },
    getYardDailyTotals: { error: null, days: [] }, getYardChangeLog: { error: null, rows: [] },
    getProdLots: { error: null, lots: [], totals: {} }, getContainerTypes: { error: null, types: [] },
    getProdPlanData: { error: null, daily: { 工場: [] }, monthly: { 行: [] } },
  });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.addInitScript((d) => { function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
    if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
    if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } }; }, data);
  fs.writeFileSync(SP + '/sitemap_page.html', html);
  await page.goto('file://' + SP + '/sitemap_page.html');
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: '野外置場' }).first().click();
  await page.waitForTimeout(1200);

  console.log('■ 画面：敷地図');
  const info = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('svg')].find((x) => x.getAttribute('viewBox') && x.getAttribute('viewBox').indexOf('-300 -300') === 0);
    if (!svg) return null;
    const pins = [...svg.querySelectorAll('g > circle')].map((c) => ({ no: c.parentNode.querySelector('text').textContent, fill: c.getAttribute('fill') }));
    return { pins, polys: svg.querySelectorAll('polygon').length, zoneText: [...svg.querySelectorAll('text')].some((t) => t.textContent === '雪置場') };
  });
  chk('★敷地図が出る', !!info, info);
  // 元アプリの18か所＋紙の配置図から写した置場（このデータでは 1・5・6・13・16・17・21）。14 資材倉庫だけ位置が無い
  const placedNos = ['1','2','3','4','5','6','7','8','9','10','11','12','13','15','16','17','19','21','22','23','25','27','29','32','33'];
  chk('★位置のある置場25か所にピン', info && info.pins.length === 25 && placedNos.every((n) => info.pins.some((p) => p.no === n)), info && info.pins.map((p) => p.no));
  chk('建屋・敷地の線・池が描かれる（多角形が30以上）', info && info.polys > 30, info && info.polys);
  chk('囲みのエリアの名前が出る', info && info.zoneText);
  const fillOf = (n) => info.pins.find((p) => p.no === n).fill;
  chk('★12 事務所（50kg 1600/1900＝84%）は満杯に近い色', fillOf('12') === '#f2a30f', fillOf('12'));
  chk('★2 水処理（収容数なし）は灰色', fillOf('2') === '#9aa2af', fillOf('2'));
  chk('7 大型製缶（0/2400）は余裕の色', fillOf('7') === '#2f9e58');
  const t = await page.evaluate(() => document.body.innerText);
  const unplacedText = t.slice(t.indexOf('地図に位置が無い置場'), t.indexOf('ピンの位置は'));
  chk('★位置の無い置場を書く（14 資材倉庫）', /地図に位置が無い置場/.test(t) && /14 資材倉庫/.test(unplacedText), unplacedText);
  chk('★紙の配置図から写した置場は「位置が無い」に出ない（1 駐車場・21 風呂場跡）', !/\b1 駐車場/.test(unplacedText) && !/21 風呂場跡/.test(unplacedText), unplacedText);
  chk('凡例に数（満杯に近い 2）', /満杯に近い（80%〜） 2/.test(t), t.slice(t.indexOf('満杯（'), t.indexOf('満杯（') + 80));

  // ピンを押すと本数
  await page.evaluate(() => { const tx = [...document.querySelectorAll('svg text')].find((x) => x.textContent === '12'); tx.parentNode.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.waitForTimeout(300);
  let t2 = await page.evaluate(() => document.body.innerText);
  chk('★ピンを押すとその置場の本数が出る', /12 事務所/.test(t2) && /1,600/.test(t2) && /84%/.test(t2), t2.slice(t2.indexOf('12 事務所'), t2.indexOf('12 事務所') + 80));
  // 本数を直す → 一覧でその置場をひらく
  await page.locator('button', { hasText: '本数を直す' }).first().click();
  await page.waitForTimeout(400);
  const kw = await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find((x) => /置場名/.test(x.placeholder || '')); return i && i.value; });
  chk('★「本数を直す」で一覧をその置場にしぼってひらく', kw === '12', kw);
  chk('一覧に直す欄が出る', await page.evaluate(() => /今ある本数を直す/.test(document.body.innerText)));

  // ＋で拡大
  const vb0 = await page.evaluate(() => [...document.querySelectorAll('svg')].find((x) => (x.getAttribute('viewBox') || '').indexOf('-300 -300') === 0 || x.getAttribute('preserveAspectRatio') === 'xMidYMid meet').getAttribute('viewBox'));
  await page.getByRole('button', { name: '＋', exact: true }).click();
  await page.waitForTimeout(200);
  const vb1 = await page.evaluate(() => [...document.querySelectorAll('svg')].find((x) => x.getAttribute('preserveAspectRatio') === 'xMidYMid meet').getAttribute('viewBox'));
  chk('★＋で拡大（見える範囲が狭くなる）', Number(vb1.split(' ')[2]) < Number(vb0.split(' ')[2]), [vb0, vb1]);
  chk('「全体に戻す」が出る', await page.locator('button', { hasText: '全体に戻す' }).count() === 1);
  chk('横にはみ出さない', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) === 0);

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
