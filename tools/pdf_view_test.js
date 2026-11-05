// 指図書をアプリの中で見る（PDF.js）テスト（11/5 落合さん「指図書をアプリの中で開く仕様が良い」。Drive の埋め込みは iPhone で 401 になる）
// 本物の PDF.js（gas/pdfjs_*.html）で、テスト用に作った2ページの PDF を描けるかを見る。サーバは偽物。
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 400) : '')); } };

console.log('■ サーバ：渡してよいファイル');
{
  const s = { HtmlService: {}, DriveApp: {}, Utilities: {}, String, Number, RegExp };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/../gas/noda_pdf_view.js', 'utf8'), s);
  chk('★指図書のPDFは渡す', s.pdfv_allowed_('application/pdf', '出荷作業指図書_26.10.30_26-60846-0(1).pdf', 80000) === '');
  chk('★PDFでないものは渡さない', s.pdfv_allowed_('application/vnd.google-apps.spreadsheet', '指図書の表', 10) !== '');
  chk('★指図書でないPDFは渡さない（このアプリはデプロイした人の権限で動くため）', s.pdfv_allowed_('application/pdf', '給与明細.pdf', 10) !== '');
  const files = { '26-60846-0': { mime: 'application/pdf', name: '出荷作業指図書_x.pdf', size: 3, bytes: [1, 2, 3] }, 'xxxxxxxxxxxx': { mime: 'application/pdf', name: '契約書.pdf', size: 3, bytes: [1] } };
  s.DriveApp.getFileById = (id) => { const f = files[id]; if (!f) throw new Error('not found'); return { getMimeType: () => f.mime, getName: () => f.name, getSize: () => f.size, getBlob: () => ({ getBytes: () => f.bytes }) }; };
  s.Utilities.base64Encode = (b) => Buffer.from(b).toString('base64');
  let r = s.getShipPdf('26-60846-0');
  chk('getShipPdf は base64 で渡す', r.ok && r.b64 === 'AQID', r);
  r = s.getShipPdf('xxxxxxxxxxxx');
  chk('getShipPdf は指図書でないPDFを断る', !r.ok && /指図書/.test(r.error), r);
  r = s.getShipPdf('../etc');
  chk('おかしな番号は断る', !r.ok, r);
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  // テスト用の2ページの PDF（本物の指図書は客先の情報があるので使わない）
  const mkp = await (await b.newContext()).newPage();
  await mkp.setContent('<div style="font:40px sans-serif;height:900px;border:8px solid #000">出荷作業指図書 1ページ目</div><div style="page-break-before:always;font:40px sans-serif">2ページ目</div>');
  const pdfB64 = (await mkp.pdf({ format: 'A4' })).toString('base64');
  const LIB = { lib: fs.readFileSync(__dirname + '/../gas/pdfjs_lib.html', 'utf8'), worker: fs.readFileSync(__dirname + '/../gas/pdfjs_worker.html', 'utf8') };

  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  const item = (key, no) => ({ key, no, eda: 0, ver: 1, date: '', size: '50kg', qty: 2, dest: '萩', check: 'チェック前', url: 'https://drive.google.com/file/d/' + key + '/view', copyUrl: null, fileId: null, mark: null, dcheck: null, shipped: null });
  const PROG = { updated: '2026-11-05 08:00', today: '2026-11-05', from: '2026-11-05', to: '2026-11-12', error: null,
    days: [{ date: '2026-11-06', label: '11/6', weekday: '金', past: false, today: false, count: 2, qty: 4,
      items: [item('PDFOK00000', '26-60918'), item('PDFNG00000', '26-60919')] }] };
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(({ d, prog, lib, pdf }) => {
    const st = { calls: [] }; window.__st = st;
    const H = {
      getShipProgress: () => prog,
      getWorkStaff: () => ({ staff: [], roles: [], account: 'x', error: null }),
      getPdfViewerLib: () => { st.calls.push('lib'); return lib; },
      getShipPdf: (id) => { st.calls.push('pdf:' + id); return id === 'PDFOK00000' ? { ok: true, name: '出荷作業指図書.pdf', b64: pdf } : { ok: false, error: '指図書のファイルではありません' }; },
    };
    function mk() { let ok = null; const px = new Proxy({}, { get(t, fn) {
      if (fn === 'withSuccessHandler') return (f) => { ok = f; return px; }; if (fn === 'withFailureHandler') return () => px;
      if (H[fn]) return (...a) => { const r = H[fn](...a); setTimeout(() => { if (ok) ok(r); }, 30); return px; };
      if (!(fn in d)) return undefined; return () => { setTimeout(() => { if (ok) ok(d[fn]); }, 0); return px; }; } }); return px; }
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, { d: data, prog: PROG, lib: LIB, pdf: pdfB64 });
  fs.writeFileSync(SP + '/pdf_page.html', html);
  await page.goto('file://' + SP + '/pdf_page.html');
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: '出荷の進捗' }).first().click();
  await page.waitForTimeout(800);

  console.log('■ 画面：アプリの中で開く');
  const link = page.locator('a[href*="PDFOK00000"]').first();
  chk('指図書のリンクがある', await link.count() === 1);
  await link.click();
  await page.waitForSelector('[data-pdf-viewer]', { timeout: 5000 });
  chk('★アプリの中にかぶせて開く（Drive の埋め込みは使わない）', await page.locator('[data-pdf-viewer] iframe').count() === 0 && page.url().startsWith('file://'));
  await page.waitForFunction(() => document.querySelectorAll('canvas[data-pdf-page]').length === 2 && !document.querySelector('[data-pdf-status]'), null, { timeout: 15000 }).catch(() => {});
  const info = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas[data-pdf-page]')];
    return { n: cs.length, w: cs.map((c) => [c.width, c.style.width]), status: (document.querySelector('[data-pdf-status]') || {}).innerText || '',
      ink: cs.map((c) => { const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < x.length; i += 16) if (x[i] < 128) k++; return k; }),
      text: document.querySelector('[data-pdf-viewer]').innerText };
  });
  chk('★2ページとも描く', info.n === 2 && info.ink.every((k) => k > 200), info);
  chk('★画面の幅に合わせて、細かく（iPhoneの画素で）描く', parseInt(info.w[0][1]) <= 374 && parseInt(info.w[0][1]) >= 340 && info.w[0][0] > 900, info.w);
  chk('全何ページかを出す', /全2ページ/.test(info.text), info.text);
  chk('PDF.js は最初の1回だけ読む・PDFはサーバから', JSON.stringify(await page.evaluate(() => window.__st.calls)) === JSON.stringify(['lib', 'pdf:PDFOK00000']), await page.evaluate(() => window.__st.calls));
  await page.screenshot({ path: SP + '/pdf_view.png' });

  await page.locator('[data-pdf-zoom="in"]').click();
  await page.waitForTimeout(1200);
  const z = await page.evaluate(() => { const c = document.querySelector('canvas[data-pdf-page]'); const box = document.querySelector('[data-pdf-box]'); return { css: parseInt(c.style.width), scroll: box.scrollWidth > box.clientWidth }; });
  chk('★＋で拡大して、横にもずらせる', z.css > 500 && z.scroll, z);
  await page.locator('button', { hasText: '閉じる' }).click();
  await page.waitForTimeout(300);
  chk('閉じれば元の画面', await page.locator('[data-pdf-viewer]').count() === 0 && /出荷の進捗/.test(await page.evaluate(() => document.body.innerText)));

  console.log('■ 開けないとき');
  await page.locator('a[href*="PDFNG00000"]').first().click();
  await page.waitForFunction(() => /開けませんでした/.test((document.querySelector('[data-pdf-status]') || {}).innerText || ''), null, { timeout: 5000 }).catch(() => {});
  const ng = await page.evaluate(() => document.querySelector('[data-pdf-viewer]').innerText);
  chk('★理由と「Drive で開く」を出す', /開けませんでした：指図書のファイルではありません/.test(ng) && /Drive で開く/.test(ng), ng);
  chk('2回目は PDF.js を読み直さない', (await page.evaluate(() => window.__st.calls)).filter((c) => c === 'lib').length === 1);
  chk('画面のエラーなし', errs.length === 0, errs);
  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
