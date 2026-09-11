// 実機に近い幅（iPhone 390px）で描画してスクリーンショットを撮る。
//
// ★ なぜ要るのか
//   このページのCSSはTailwindのビルド結果を貼り付けたもので、ビルドし直す
//   仕組みが無い。あとから書いたクラスは黙って効かない。実際 text-right が
//   18箇所で未定義のまま使われていて、数字が右揃えになっていなかった。
//   jsdomのテストは要素と座標は見られるがCSSの適用結果は見られないので、
//   最後は本物のブラウザで描いて目で見る必要がある。
//
// 使い方: npm i playwright したうえで
//   node tools/preview.js          … 受注データ無しの状態
//   node tools/preview.js orders   … 受注データ有りの状態
// 出力先はスクラッチのPNG。
const { chromium } = require('playwright');
const fs = require('fs');
const html = fs.readFileSync('/home/user/noda-gumi-dashboard-/gas/noda_dashboard.html', 'utf8');
const SP = '/tmp/claude-0/-home-user-GAS-/302da6aa-62eb-5fdd-b3ab-d0a545e5e7fd/scratchpad';

const MONTHS = [
  { 年月: '2026-04', 出荷: 16337, 在庫: null, 在庫日: null, 受注: null },
  { 年月: '2026-05', 出荷: 16354, 在庫: null, 在庫日: null, 受注: null },
  { 年月: '2026-06', 出荷: 17160, 在庫: null, 在庫日: null, 受注: 15100 },
  { 年月: '2026-07', 出荷: 12326, 在庫: null, 在庫日: null, 受注: 14700 },
  { 年月: '2026-08', 出荷: 15103, 在庫: 10014, 在庫日: '2026-08-31', 受注: 15600 },
  { 年月: '2026-09', 出荷: 4164, 出荷予定: 10076, 在庫: 7435, 在庫日: '2026-09-07', 受注: 4100 },
];
const E = { updated: '2026-09-07 16:00', error: null };
const REPLY = {
  getInventoryDashboardData: () => ({ ...E, sizes: {}, totals: { total: 7435, '50k': 3000, '20k': 4435 }, bySize: {}, byYear: {}, byMonth: {}, oldest: null }),
  getShippingDashboardData: () => ({ ...E, folder: '9月', total: 186, todayCount: 0, recent: [] }),
  getOrderPlanDashboardData: () => ({ ...E, file: 'x', totalOrders: 0, bySize: {}, recent: [], yesterdayDiff: 602 }),
  getDispatchTodayData: () => ({ ...E, file: null, dateLabel: '9/7', shipments: [], week: [] }),
  getYardMapUpdatesBothWithOrderText: () => JSON.stringify({ '50k': [], '20k': [] }),
  getYardBlockDetailWithPdf: () => ({ found: false, orders: [] }),
  getShippingActualsSummary: () => ({ ...E, sheetUrl: 'https://x.test', rowCount: 0, shipmentCount: 0, months: [], bySize: {}, topDests: [], mismatchCount: 0, needsCheckCount: 0, nonCylinderCount: 0 }),
  getInventoryTrendData: () => ({ ...E, sheetUrl: 'x', days: [], latest: null, change: null, bySizeLatest: {} }),
  getYardCapacitySummary: () => ({ updated: '2026-09-09 12:00', error: null, locations: 36,
    a20: 15880, m20: 20308, a30: 0, m30: 0, a50: 15800, m50: 19100,
    total: 31680, max: 39408, nearFull: 3, over: 1,
    sheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit' }),
  getYardCapacityUrl: () => ({ url: 'https://script.google.com/a/x/exec?page=yard', error: null }),
  getDispatchGridData: () => ({ ...E, source: 'スプレッドシート', editable: true,
    sheetUrl: 'https://x.test', weekOffset: 0, weekLabel: '9/7〜9/11', hasPrev: true, hasNext: true,
    days: [
      { col: 2, date: '2026-09-07', label: '9/7', header: '9/7(月)出', arrive: '9/8(火)着' },
      { col: 3, date: '2026-09-08', label: '9/8', header: '9/8(火)出', arrive: '9/9(水)着' },
      { col: 4, date: '2026-09-09', label: '9/9', header: '9/9(水)出', arrive: '9/10(木)着' },
      { col: 5, date: '2026-09-10', label: '9/10', header: '9/10(木)出', arrive: '9/11(金)着' },
      // ★ 実データどおり、金曜だけ出発日が同じ2列に分かれている（土着・月着）
      { col: 6, date: '2026-09-11', label: '9/11', header: '9/11(金)出', arrive: '9/12(土)着' },
      { col: 7, date: '2026-09-11', label: '9/11', header: '9/11(金)出', arrive: '9/14(月)着' },
    ],
    trucks: [
      { row: 3, company: '', truck: '10ｔ箱', cells: { 2: { kind: '運休', text: '×', q20: null, q50: null } } },
      // ★ 金曜の2列（6=土着 / 7=月着）にも予定を入れて、まとまるかを見る
      { row: 4, company: '', truck: '10ｔ箱 佐伯', cells: {
        3: { kind: '出荷', text: '岐阜県可児市', q20: 100, q50: null },
        7: { kind: '出荷', text: '北海道苫小牧市', q20: null, q50: 60 } } },
      { row: 7, company: '浅津運送 自社便', truck: '10ｔ平 野村',
        cells: { 2: { kind: '出荷', text: '熊本県山鹿市', q20: 50, q50: 30 },
                 3: { kind: '引取', text: '←60665', q20: 0, q50: 20 },
                 4: { kind: '出荷', text: '広島県東広島市 (4600L×1)', q20: null, q50: 46 },
                 6: { kind: '出荷', text: '鳥取県米子市', q20: 180, q50: 30 } } },
      { row: 10, company: '', truck: '4ｔ平標準 福安',
        cells: { 2: { kind: '出荷', text: '東京都西多摩郡瑞穂町 東京都羽村市', q20: 40, q50: 0 },
                 4: { kind: '休み', text: 'お休み', q20: null, q50: null } } },
      // ★ 週まるごと予定が入っていないトラック（空き台数の確認用）
      { row: 16, company: '', truck: '4ｔ平標準 ③', cells: {} },
      // ★ 自社便で週まるごと空き → これだけが空き台数に数えられる
      { row: 17, company: '倉吉運送 自社便', truck: '4ｔ平ﾜｲﾄﾞ ③', cells: {} },
      // ★ 傭車（スポット）。空きでも台数に数えない
      { row: 25, company: '浅津運送 庸車便', truck: '10ｔ平 傭車1', cells: {} },
      { row: 26, company: '浅津運送 庸車便', truck: '10ｔ平 傭車2', cells: {} },
      { row: 18, company: '倉吉運送 自社便', truck: '10ｔ平 ②',
        cells: { 2: { kind: '出荷', text: '南港：底黒' } } },
      { row: 27, company: '', truck: '4ｔ平ﾜｲﾄﾞ ②', cells: { 2: { kind: '出荷', text: '70246→' } } },
    ],
    totals: {
      2: { 合計20k: 235, 合計50k: 292, 小口: 15, コンテナ: 30 },
      3: { 合計20k: 100, 合計50k: 150, 小口: 0, コンテナ: 0 },
      4: { 合計20k: null, 合計50k: null, 小口: 0, コンテナ: 0 },
      5: { 合計20k: null, 合計50k: null, 小口: 0, コンテナ: 0 },
      6: { 合計20k: 180, 合計50k: 90, 小口: 5, コンテナ: 0 },
      7: { 合計20k: null, 合計50k: null, 小口: 0, コンテナ: 0 },
    } }),
  getMonthlyCombinedData: () => ({ ...E, sheetUrl: 'https://x.test', months: MONTHS,
    hasOrders: process.argv[2] === 'orders', hasPlan: true, partialMonth: '2026-09',
    出荷の出所: '配車表', asOf: '2026-09-07', startMonth: '2026-04' }),
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
    window.google = { script: { get run() { return mk(); }, host: {} } };
  }, data);
  const tmp = SP + '/disp_page.html';
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('button', { hasText: '配車・当日出荷' }).first().click();
  await page.waitForTimeout(1200);

  let pass = 0, fail = 0;
  const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
    else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

  /* ---------- 「日」表示（既定） ---------- */
  console.log('■ 日表示');
  const dayView = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const day = btns.find((b) => b.textContent.trim() === '日');
    const week = btns.find((b) => b.textContent.trim() === '週');
    return { 日ボタン: !!day, 週ボタン: !!week,
      日が選択中: day ? /rgb\(15, 41, 66\)/.test(getComputedStyle(day).backgroundColor) : null,
      表がある: !!document.querySelector('.overflow-x-auto.rounded-md') };
  });
  chk('日／週の切り替えがある', dayView.日ボタン && dayView.週ボタン, dayView);
  chk('既定は「日」', dayView.日が選択中, dayView);
  chk('既定では週の表を描いていない', !dayView.表がある, dayView);

  // データが入っている 9/7 を選ぶ
  await page.locator('button', { hasText: /^9\/7/ }).first().click();
  await page.waitForTimeout(500);

  const rows = await page.evaluate(() => {
    const list = document.querySelector('.divide-y.divide-slate-100');
    if (!list) return null;
    return [...list.children].map((b) => ({ t: b.innerText.replace(/\n/g, ' | '),
      h: Math.round(b.getBoundingClientRect().height) }));
  });
  console.log('   行:', JSON.stringify(rows, null, 0));
  chk('その日のトラックが並んでいる', rows && rows.length >= 3, rows && rows.length);
  chk('行き先が省略されていない（…が無い）',
    rows && rows.every((r) => r.t.indexOf('…') === -1), rows);
  /* ★ トラック名と行き先を横に並べると行き先が狭くなって折り返す。
       上下に分けて、行き先が1行に収まることを実測で押さえる。 */
  const dest = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.divide-y.divide-slate-100 > button')];
    return bs.map((b) => {
      const d = b.lastElementChild, cs = getComputedStyle(d);
      return { t: d.textContent.trim(), 行数: Math.round(d.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
        px: parseFloat(cs.fontSize), 幅: Math.round(d.getBoundingClientRect().width) };
    });
  });
  console.log('   行き先:', JSON.stringify(dest));
  chk('★行き先が折り返さず1行で出る', dest.length > 0 && dest.every((d) => d.行数 <= 1), dest);
  chk('行き先が15pxで出ている', dest.length > 0 && dest.every((d) => d.px >= 15), dest.map((d) => d.px));
  chk('行き先が幅いっぱいを使っている（280px以上）',
    dest.length > 0 && dest.every((d) => d.幅 >= 280), dest.map((d) => d.幅));

  // 日を選ぶチップの幅がそろっているか（「（本日）」で1つだけ広くなっていた）
  const chips = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((x) => /^\d+\/\d+/.test(x.innerText.trim()))
    .map((x) => Math.round(x.getBoundingClientRect().width)));
  chk('日のチップの幅がそろっている（差10px以内）',
    chips.length > 0 && Math.max(...chips) - Math.min(...chips) <= 10, chips);
  chk('長い行き先も全部出る（東京都西多摩郡瑞穂町 東京都羽村市）',
    dest.some((d) => d.t === '東京都西多摩郡瑞穂町 東京都羽村市'), dest.map((d) => d.t));
  chk('出荷が先に並ぶ', rows && rows[0].t.indexOf('出荷') !== -1, rows && rows[0]);
  /* 種別は行ごとではなく、変わり目の見出しでまとめて出す（「出荷」が全行に
     並ぶと邪魔なため）。色だけに頼らないことは、見出しに文字があることで担保する。 */
  const heads = rows ? rows.filter((r) => /^(出荷|引取|運休|お休み)\s*\|\s*\d+台$/.test(r.t.trim())) : [];
  chk('種別の見出しが文字で出ている（色だけに頼らない）', heads.length >= 1, rows);
  chk('見出しは種別が変わるときだけ（出荷が全行に出ていない）',
    rows && rows.filter((r) => r.t.indexOf('出荷 |') === 0).length === 1, rows);
  chk('見出しの台数が中身と合っている', (() => {
    if (!rows) return false;
    let ok = true, cur = null, n = 0;
    const flush = () => { if (cur != null && cur.n !== n) ok = false; };
    rows.forEach((r) => {
      const m = r.t.trim().match(/^(出荷|引取|運休|お休み)\s*\|\s*(\d+)台$/);
      if (m) { flush(); cur = { label: m[1], n: Number(m[2]) }; n = 0; } else { n += 1; }
    });
    flush();
    return ok;
  })(), rows);

  const foot = await page.evaluate(() => {
    const t = document.body.innerText;
    return { 予定なし: /予定なし\s*\d+台/.test(t), 合計: /20k[\s\S]{0,40}50k/.test(t),
      内訳が消えている: t.indexOf('日ごとの内訳') === -1,
      重複していない: (t.match(/この日に出発する記録/g) || []).length === 0 };
  });
  chk('予定なしのトラックがまとまっている', foot.予定なし, foot);
  chk('その日の本数が出ている', foot.合計, foot);
  chk('下の「日ごとの内訳」を消した（同じ日を3回描いていた）', foot.内訳が消えている, foot);
  chk('出荷リストの重複が無い', foot.重複していない, foot);

  const over1 = await page.evaluate(() => ({ b: document.body.scrollWidth, c: document.documentElement.clientWidth }));
  chk('日表示で横にはみ出していない', over1.b <= over1.c + 1, over1);
  await page.screenshot({ path: SP + '/disp_day.png', fullPage: false });

  /* ---------- 週の空きトラック台数 ---------- */
  console.log('■ 週の空きトラック台数');
  const idle = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.innerText
      && d.innerText.indexOf('この週の空きトラック') === 0 && d.innerText.length < 80);
    return el ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('   ', JSON.stringify(idle));
  /* モックのトラックは10台。週まるごと空なのは
     「4ｔ平ﾜｲﾄﾞ ③」（倉吉運送 自社便）、「4ｔ平標準 ③」（会社名なし）、
     「傭車1」「傭車2」（浅津運送 庸車便）の4台。
     ★ 空き台数に数えるのは自社便だけ。傭車も会社名なしも数えない → 1台。
     ★ 数えないだけで、行き先が入っていれば表示して「予定あり」に数える
       （10ｔ箱・佐伯は会社名なしだが予定があるので6台に入っている）。
     運休（×）やお休みは「予定が入っている」扱い（マスが埋まっているため）。 */
  chk('空きトラックの欄が出ている', idle !== null, idle);
  chk('★自社便だけの空き台数が出る（1台）', idle && /この週の空きトラック\s*1\s*台/.test(idle), idle);
  chk('★数えなかった内訳が出る（傭車2・社名なし1）',
    idle && /傭車2・社名なし1台は除く/.test(idle), idle);
  chk('自社便のみと書いてある', idle && /自社便のみ/.test(idle), idle);
  chk('★会社名なしでも予定があれば数える（予定あり6）',
    idle && /予定あり6/.test(idle), idle);
  chk('全台数が出る（全10）', idle && /全10/.test(idle), idle);

  /* ---------- 金曜が2列（土着・月着）に分かれている日 ---------- */
  console.log('■ 金曜の2列を1日にまとめる');
  const chipTexts = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((x) => /^\d+\/\d+/.test(x.innerText.trim()))
    .map((x) => x.innerText.replace(/\n/g, '/')));
  console.log('   チップ:', JSON.stringify(chipTexts));
  chk('★日のチップが5つ（9/11が2つに割れていない）', chipTexts.length === 5, chipTexts);
  chk('9/11のチップが1つだけ',
    chipTexts.filter((t) => t.indexOf('9/11') === 0).length === 1, chipTexts);

  await page.locator('button', { hasText: /^9\/11/ }).first().click();
  await page.waitForTimeout(500);
  const fri = await page.evaluate(() => {
    const list = document.querySelector('.divide-y.divide-slate-100');
    const rows = list ? [...list.children].map((b) => b.innerText.replace(/\n/g, ' | ')) : null;
    /* ★ 空きトラックの欄も .rounded-md.bg-slate-50 なので、最初の1つを取ると
         そちらを拾ってしまう。20kと小口が入っている方を選ぶ。 */
    const strip = [...document.querySelectorAll('.rounded-md.bg-slate-50')]
      .find((x) => /20k/.test(x.innerText) && /小口/.test(x.innerText));
    return { rows: rows, 本数: strip ? strip.innerText.replace(/\n+/g, ' ') : null };
  });
  console.log('   9/11の行:', JSON.stringify(fri.rows));
  console.log('   9/11の本数:', JSON.stringify(fri.本数));
  chk('★2つの列のトラックがまとめて出る',
    fri.rows && fri.rows.some((t) => t.indexOf('9/12(土)着') !== -1)
      && fri.rows.some((t) => t.indexOf('9/14(月)着') !== -1), fri.rows);
  chk('どちらの便かが着日で分かる',
    fri.rows && fri.rows.filter((t) => /\d+\/\d+\(.\)着/.test(t)).length >= 2, fri.rows);
  chk('★その日の本数が2列ぶんの合計（20k 180 / 50k 90）',
    fri.本数 && /20k\s*180/.test(fri.本数) && /50k\s*90/.test(fri.本数), fri.本数);

  /* ---------- 上のKPIと下の表が一致するか ---------- */
  console.log('■ 上のKPIと下の表の連動');
  const kpiWeek = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('main > div.grid > div')].map((c) => c.innerText.replace(/\n+/g, ' '));
    /* ★ カードの先頭に週のラベル（9/7〜9/12）が入るので、素の「最初の数字」を
         拾うと 9 を取ってしまう。ラベルより後ろだけを見る。 */
    const find = (k) => {
      const t = cards.find((x) => x.indexOf(k) !== -1);
      if (!t) return null;
      const m = t.slice(t.indexOf(k) + k.length).match(/([\d,]+)/);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    return { cards: cards, 台数: find('出荷台数'), k20: find('20k'), k50: find('50k'), 総計: find('総計') };
  });
  console.log('   KPI:', JSON.stringify(kpiWeek.cards));
  /* モックの合計行: 9/7 = 20k235/50k292、9/8 = 20k100/50k150、9/11 = 20k180/50k90。
     残りの日は未設定（null）。
     出荷のマス: 9/7 は 野村・福安・②・ワイド の4件、9/8 は 佐伯 の1件、
     9/9 は 野村 の1件、9/11 は 土着の野村・月着の佐伯 の2件
     （引取・運休・お休みは数えない）。金曜の2列ぶんも足す。 */
  chk('★KPIの20kが表の合計と一致する（235+100+180=515）', kpiWeek.k20 === 515, kpiWeek);
  chk('★KPIの50kが表の合計と一致する（292+150+90=532）', kpiWeek.k50 === 532, kpiWeek);
  chk('KPIの総計が20k+50k（1,047）', kpiWeek.総計 === 1047, kpiWeek);
  chk('未設定の日を0として足している', kpiWeek.k20 === 515 && kpiWeek.k50 === 532, kpiWeek);
  chk('KPIの台数が出荷のマスの数（4+1+1+2=8。金曜の2列ぶんも足す）', kpiWeek.台数 === 8, kpiWeek);
  chk('KPIにどの週かが書いてある', kpiWeek.cards.some((t) => t.indexOf('9/7〜9/11') !== -1), kpiWeek.cards);

  /* ---------- 「週」表示 ---------- */
  console.log('■ 週表示');
  await page.locator('button', { hasText: /^週$/ }).first().click();
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => {
    const sc = document.querySelector('.overflow-x-auto.rounded-md');
    const out = { スクローラ: null, 行: [], 見出し衝突: null };
    if (sc) {
      const r = sc.getBoundingClientRect();
      out.スクローラ = { 見える幅: Math.round(r.width), 中身の幅: sc.scrollWidth,
        はみ出し: sc.scrollWidth - Math.round(r.width) };
      const rows = [...sc.querySelectorAll(':scope > div > div.flex')];
      out.行数 = rows.length;
      out.行 = rows.map((x) => ({ h: Math.round(x.getBoundingClientRect().height),
        先頭: x.firstElementChild ? x.firstElementChild.innerText.replace(/\n/g, '/') : '' }));
      // 右にスクロールしたときトラック名が残るか
      sc.scrollLeft = 400;
      const name = rows[1] && rows[1].firstElementChild;
      const nr = name ? name.getBoundingClientRect() : null;
      out.右にスクロール後のトラック名 = nr ? { x: Math.round(nr.x), 見える: nr.x >= r.x - 1 } : null;
      sc.scrollLeft = 0;
      const tr = rows.find((x) => x.firstElementChild
        && x.firstElementChild.innerText.trim() === 'その日の本数');
      out.本数の欄 = tr && tr.children[1] ? tr.children[1].innerText.replace(/\n/g, ' / ') : null;
      const nomura = rows.find((x) => x.firstElementChild
        && /野村/.test(x.firstElementChild.innerText));
      out.マスの例 = nomura && nomura.children[1] ? nomura.children[1].innerText.replace(/\n/g, ' / ') : null;
      out.引取のマス = nomura && nomura.children[2] ? nomura.children[2].innerText.replace(/\n/g, ' / ') : null;
      // 本数の行が「…」で切れていないか（scrollWidth が入りきっているか）
      const qs = nomura ? nomura.children[1].querySelectorAll('span span') : [];
      const q = qs.length > 1 ? qs[1] : null;
      out.本数が切れていない = q ? q.scrollWidth <= q.clientWidth : null;
      out.本数の幅 = q ? { 必要: q.scrollWidth, 入る: q.clientWidth } : null;
      out.本数の文字 = q ? q.textContent : null;
    }
    // 週間の配車予定 の見出し
    const h2 = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('週間の配車予定'));
    if (h2) { const p = h2.parentElement, hr = h2.getBoundingClientRect();
      const note = p.querySelector('span');
      out.見出し衝突 = { 見出しの高さ: Math.round(hr.height), 見出しの幅: Math.round(hr.width),
        注記: note ? note.textContent : null,
        注記の高さ: note ? Math.round(note.getBoundingClientRect().height) : null }; }
    // カードの見出し
    out.カード見出し = [...document.querySelectorAll('main .grid .text-xs')].map((x) => x.textContent).slice(0, 6);
    return out;
  });
  console.log(JSON.stringify(m, null, 1));

  chk('表は横スクロールする（1画面に収まらない）', m.スクローラ && m.スクローラ.はみ出し > 0, m.スクローラ);
  chk('★横に送ってもトラック名が見えている',
    m.右にスクロール後のトラック名 && m.右にスクロール後のトラック名.見える, m.右にスクロール後のトラック名);
  const TOTAL_LABEL = 'その日の本数';
  const truckRows = m.行.filter((r, i) => i > 0 && r.先頭 !== TOTAL_LABEL);
  const hs = truckRows.map((r) => r.h);
  chk('トラック行の高さがそろっている', hs.length > 0 && Math.max(...hs) - Math.min(...hs) <= 2, hs);
  chk('トラック行を詰めた（1行48px以下）', hs.length > 0 && Math.max(...hs) <= 48, hs);
  /* 合計は20k/50k/小口/コンテナを別々の行にすると4行ぶん伸びるので1つの欄に
     まとめた。配車表では一番下だが、iPhoneだとスクロールしないと見えないので
     日付の見出しのすぐ下に置いている。 */
  const totalIdx = m.行.findIndex((r) => r.先頭 === TOTAL_LABEL);
  chk('本数の欄が日付の見出しのすぐ下にある', totalIdx === 1, { totalIdx: totalIdx, 行: m.行.map((r) => r.先頭) });
  chk('本数の行は1本だけ（4行に分けていない）',
    m.行.filter((r) => r.先頭 === TOTAL_LABEL).length === 1, m.行.map((r) => r.先頭));
  chk('20k/50k/小口/コンテナが1つの欄に入っている',
    m.本数の欄 && /20k/.test(m.本数の欄) && /50k/.test(m.本数の欄)
      && /小口/.test(m.本数の欄) && /筒/.test(m.本数の欄), m.本数の欄);
  chk('トラック名が切れていない（福安が出ている）',
    m.行.some((r) => r.先頭.indexOf('福安') !== -1), m.行.map((r) => r.先頭));
  chk('自社便の会社名が切れていない',
    m.行.some((r) => r.先頭.indexOf('浅津運送 自社便') !== -1), m.行.map((r) => r.先頭));
  chk('マスに行き先と本数が一緒に入っている', m.マスの例 && /熊本県山鹿市/.test(m.マスの例)
    && /20k 50/.test(m.マスの例) && /50k 30/.test(m.マスの例), m.マスの例);
  chk('0本は書かない（20k 0 と出さない）', m.引取のマス && /50k 20/.test(m.引取のマス)
    && !/20k 0/.test(m.引取のマス), m.引取のマス);
  chk('マスの本数が「…」で切れていない', m.本数が切れていない === true,
    { 切れていない: m.本数が切れていない, 文字: m.本数の文字 });
  chk('見出しと注記がぶつかっていない（注記を外した）', m.見出し衝突 === null, m.見出し衝突);
  const wk = await page.evaluate(() => {
    const t = document.body.innerText;
    const btns = [...document.querySelectorAll('button')].filter((b) => /空き(も表に出す|を隠す)/.test(b.textContent));
    return { 畳みボタン: btns.length, 文言: btns.map((b) => b.textContent.trim()),
      重複: (t.match(/この週は予定なし/g) || []).length };
  });
  /* モックは7台のうち1台が週まるごと空きなので、畳みボタンが出るのが正しい。
     31台のときの畳みと高さは tools/disp_week_height_test.js で見る。 */
  /* ★ 同じことを「空きの欄」「畳みボタン」「注記」の3か所で言っていたので、
       空きの欄のボタンに一本化した。 */
  chk('空きの出し入れボタンが1つだけ', wk.畳みボタン === 1, wk);

  chk('日付ラベルが「本日」と混ざっていない',
    m.カード見出し.every((t) => !(t.indexOf('本日') !== -1 && t.indexOf('/') !== -1)), m.カード見出し);

  // 横に送った状態を撮って、トラック名が残っているか目で見る
  await page.evaluate(() => { const sc = document.querySelector('.overflow-x-auto.rounded-md');
    if (sc) sc.scrollLeft = 220; });
  await page.waitForTimeout(400);
  const box = await page.locator('.overflow-x-auto.rounded-md').first().boundingBox();
  await page.screenshot({ path: SP + '/disp_scrolled.png',
    clip: { x: box.x - 8, y: box.y - 44, width: box.width + 16, height: box.height + 52 } });
  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
