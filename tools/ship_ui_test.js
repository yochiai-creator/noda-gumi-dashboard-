// 「出荷の進捗」タブの画面テスト。
// 段階は 指図書 → マーク → ダブルチェック → チェック完了 → 出荷（10/26 落合さん）。
// 記録する人・次の段階のボタン・取消・名前を足す・数は本数・チェックの実績、を押さえる。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/preview.js', 'utf8');
const head = src.slice(0, src.indexOf('(async () => {'));
const { chromium, REPLY, html } = new Function('require', '__dirname', 'process', head + '; return { chromium, REPLY, html };')(require, __dirname, { argv: [] });
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 400) : '')); } };

const item = (key, no, ver, size, qty, dest, check, extra) => Object.assign({ key, no, eda: 0, ver, date: '', size, qty, dest, check: check || null,
  url: 'https://drive.google.com/file/d/' + key + '/view', copyUrl: null, fileId: null, mark: null, dcheck: null, shipped: null }, extra || {});
const PROG = {
  updated: '2026-10-28 08:00', today: '2026-10-28', from: '2026-10-28', to: '2026-11-04', error: null,
  days: [
    // 今日：出荷は自動で済。マークはまだ
    { date: '2026-10-28', label: '10/28', weekday: '水', past: false, today: true, count: 1, qty: 4,
      items: [item('26-20380-0(1)', '26-20380', 1, '50kg', 4, '鳥取', 'チェック済', { shipped: { auto: true, at: '2026-10-28' } })] },
    { date: '2026-10-30', label: '10/30', weekday: '金', past: false, today: false, count: 2, qty: 5,
      items: [item('26-60846-0(1)', '26-60846', 1, '50kg', 2, '西日本液化 萩', 'チェック前'),
              item('26-30608-0', '26-30608', null, '20kg', 3, 'ミツウロコ')] },
  ],
};

(async () => {
  const data = {}; Object.keys(REPLY).forEach((k) => { data[k] = REPLY[k](); });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({ d, prog }) => {
    // 偽のサーバ：段階・取消・名前を足す、を覚えておく（サーバと同じ決まり）
    const st = { prog: JSON.parse(JSON.stringify(prog)), staff: [{ 名前: '野田 太郎', 役割: '出荷' }], calls: [], n: 0, log: [] };
    window.__st = st;
    const field = { 'マーク': 'mark', 'ダブルチェック': 'dcheck', '出荷済': 'shipped' };
    const each = (f) => st.prog.days.forEach((g) => g.items.forEach(f));
    const H = {
      getShipProgress: () => st.prog,
      getWorkStaff: () => ({ staff: st.staff, roles: ['事務', '出荷', '現場', '管理'], account: 'genba@x', error: null }),
      recordShipStep: (req) => {
        st.calls.push(['step', req]);
        each((o) => { if (o.key === req.key) {
          if (req.step === 'ダブルチェック' && !o.mark) throw new Error('先にマーク');
          const id = 'R' + (++st.n);
          o[field[req.step]] = { id, at: '2026-10-28 09:15', by: req.name };
          o.pending = !o.mark || !o.dcheck || o.check === 'チェック前';
          st.log.unshift({ id, at: '2026-10-28 09:15', name: req.name, kind: req.step, target: req.key, qty: req.qty, canceled: false });
        } });
        return st.prog;
      },
      cancelWorkRecord: (req) => { st.calls.push(['cancel', req]); st.log.forEach((x) => { if (x.id === req.id) x.canceled = true; });
        each((o) => ['mark', 'dcheck', 'shipped'].forEach((k) => { if (o[k] && o[k].id === req.id) o[k] = null; o.pending = !o.mark || !o.dcheck || o.check === 'チェック前'; })); return st.prog; },
      addWorkStaff: (name, role) => { st.calls.push(['add', name, role]); st.staff.push({ 名前: name, 役割: role }); return H.getWorkStaff(); },
      getWorkLog: (q) => ({ from: q.from, to: q.to, rows: st.log, sheetUrl: 'https://docs.google.com/x', error: null }),
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
  const row = (k) => page.locator('[data-ship-row="' + k + '"]');
  const txt = async () => page.evaluate(() => document.body.innerText);

  console.log('■ タブ・KPI・一覧');
  let t = await txt();
  chk('★タブの見出し', /出荷の進捗/.test(await page.evaluate(() => document.querySelector('h1').textContent)));
  chk('★KPIは本数：今日 4本・今日でまだ 4本・次の出荷日 10/30 5本・まだ 5本',
    /今日の出荷\s*4\s*本/.test(t) && /今日でまだのもの\s*4\s*本/.test(t) && /次の出荷日 10\/30\(金\)\s*5\s*本/.test(t) && /次の出荷日でまだのもの\s*5\s*本/.test(t) && !/枚/.test(t.slice(0, 500)), t.slice(0, 500));
  chk('★日の見出しにマーク・ダブル・出荷済の本数', /10\/30[\s\S]{0,60}マーク 0\/5[\s\S]{0,20}ダブル 0\/5[\s\S]{0,20}出荷済 0\/5/.test(t), t.slice(t.indexOf('10/30'), t.indexOf('10/30') + 120));
  const rt = (await row('26-60846-0(1)').innerText()).replace(/\s+/g, ' ');
  chk('★段階の札：マーク › ダブルチェック › チェック前 › 出荷', /マーク › ダブルチェック › チェック前 › 出荷/.test(rt), rt);
  chk('★今日の行：出荷は自動で済・マークのボタンが出る', /✓出荷（出荷日）/.test(await row('26-20380-0(1)').innerText()) &&
    await row('26-20380-0(1)').locator('button', { hasText: /^マーク$/ }).count() === 1);
  chk('★20kgはチェック「—」', /チェック —/.test(await row('26-30608-0').innerText()));
  // ★ ボタンは止めない。名前がまだなら押したときにそう言う（何も起きないように見せない）
  await row('26-60846-0(1)').locator('button', { hasText: /^マーク$/ }).click();
  await page.waitForTimeout(300);
  let msg = await page.evaluate(() => { const m = document.querySelector('[data-ship-msg]'); return m ? m.innerText : ''; });
  chk('★名前がまだなら、押すと「先に名前を選んで」と出て、記録はしない', /名前を選んでください/.test(msg) && (await page.evaluate(() => window.__st.calls.length)) === 0, msg);
  await page.screenshot({ path: SP + '/ship_tab.png', fullPage: true });

  console.log('■ マーク → ダブルチェック → 出荷済（前もって）');
  await page.locator('select').first().selectOption('野田 太郎');
  await page.waitForTimeout(200);
  chk('選んだ名前を端末に覚える', await page.evaluate(() => localStorage.getItem('nodaWorker')) === '野田 太郎');
  await row('26-60846-0(1)').locator('button', { hasText: /^マーク$/ }).click();
  await page.waitForTimeout(400);
  let calls = await page.evaluate(() => window.__st.calls);
  chk('★サーバに指図書・段階・名前・本数を送る', calls[0] && calls[0][1].key === '26-60846-0(1)' && calls[0][1].step === 'マーク' && calls[0][1].name === '野田 太郎' && calls[0][1].qty === 2, calls);
  msg = await page.evaluate(() => { const m = document.querySelector('[data-ship-msg]'); return m ? m.innerText : ''; });
  chk('★押したら「記録しました」と出る', /✓ 26-60846\(1\) のマーク を記録しました/.test(msg), msg);
  let r = (await row('26-60846-0(1)').innerText()).replace(/\s+/g, ' ');
  chk('★マークが済むと「✓マーク 名前」、次はダブルチェックのボタン', /✓マーク 野田 太郎/.test(r) && await row('26-60846-0(1)').locator('button', { hasText: /^ダブルチェック$/ }).count() === 1, r);
  t = await txt();
  chk('日の見出しのマークが増える（2本）', /マーク 2\/5/.test(t));
  await row('26-60846-0(1)').locator('button', { hasText: /^ダブルチェック$/ }).click();
  await page.waitForTimeout(400);
  r = (await row('26-60846-0(1)').innerText()).replace(/\s+/g, ' ');
  chk('★ダブルチェックが済むと次は出荷済（先の日なので）', /✓ダブルチェック 野田 太郎/.test(r) && await row('26-60846-0(1)').locator('button', { hasText: /^出荷済$/ }).count() === 1, r);

  console.log('■ 取消は最後の段階から');
  await row('26-60846-0(1)').locator('button', { hasText: 'ダブルチェックを取消' }).click();
  await page.waitForTimeout(400);
  r = (await row('26-60846-0(1)').innerText()).replace(/\s+/g, ' ');
  calls = await page.evaluate(() => window.__st.calls);
  chk('★最後の段階（ダブルチェック）を取り消す', calls[calls.length - 1][0] === 'cancel' && !/✓ダブルチェック/.test(r) && /✓マーク/.test(r) && /マークを取消/.test(r), r);

  console.log('■ まだのものだけ');
  await row('26-30608-0').locator('button', { hasText: /^マーク$/ }).click();
  await page.waitForTimeout(300);
  await row('26-30608-0').locator('button', { hasText: /^ダブルチェック$/ }).click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: 'まだのもの' }).click();
  await page.waitForTimeout(200);
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-ship-row]')].map((x) => x.getAttribute('data-ship-row')));
  chk('★済んだもの（20kg：マーク・ダブルチェック済）は隠す、まだのものは出す', rows.indexOf('26-30608-0') < 0 && rows.indexOf('26-60846-0(1)') >= 0 && rows.indexOf('26-20380-0(1)') >= 0, rows);
  await page.locator('button', { hasText: /^すべて$/ }).click();

  console.log('■ チェックの実績（記録の一覧）');
  await page.locator('button', { hasText: 'チェックの実績' }).click();
  await page.waitForTimeout(500);
  const logRows = await page.evaluate(() => [...document.querySelectorAll('[data-log-row]')].map((x) => x.innerText.replace(/\s+/g, ' ')));
  chk('★押した記録が新しい順に出る（日時・名前・段階・指図書・本数）', logRows.length === 4 && /09:15 野田 太郎 ダブルチェック 26-30608-0 3本/.test(logRows[0]), logRows);
  chk('★取り消した記録も「取消」と残す', logRows.some((x) => /ダブルチェック 26-60846-0\(1\)/.test(x) && /取消/.test(x)), logRows);
  t = await txt();
  chk('★人ごと・段階ごとの本数', /野田 太郎[\s\S]{0,40}マーク 5本[\s\S]{0,20}ダブルチェック 3本/.test(t), t.slice(t.indexOf('チェックの実績'), t.indexOf('チェックの実績') + 300));

  console.log('■ 名前を足す');
  await page.locator('button', { hasText: '名前を足す' }).click();
  await page.locator('input[placeholder^="名前"]').fill('森 花子');
  await page.locator('button', { hasText: /^足す$/ }).click();
  await page.waitForTimeout(400);
  const sel = await page.evaluate(() => document.querySelector('select').value);
  chk('★足した名前がそのまま「記録する人」になる', sel === '森 花子', sel);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  chk('横にはみ出さない', !over);
  await page.screenshot({ path: SP + '/ship_tab2.png', fullPage: true });

  await b.close();
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
