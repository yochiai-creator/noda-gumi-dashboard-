// 月次まとめ（在庫・出荷・受注）と受注推移エンジンの統合テスト。
// GASのAPIをスタブ化し、実データに近い規模（出荷15,000本/月・在庫1万本弱）で確かめる。
const fs = require('fs'), vm = require('vm');
const GAS = __dirname + '/../gas/';
let pass = 0, fail = 0;
const check = (l, c, e) => { if (c) { pass++; console.log('  OK   ' + l); } else { fail++; console.log('  FAIL ' + l + (e ? '  -> ' + e : '')); } };

const SH = ['fileId','ファイル名','処理日','依頼No','枝番','バージョン','出荷希望日','年月','品名','サイズ','数量','レンジ本数','検算','GNo開始','GNo終了','容器接頭辞','容器No開始','容器No終了','出荷先コード','出荷先名','刻印月','取込日時'];
const IH = ['日付','fileId','ファイル名','総本数','50kg','20kg','その他','2K','5K','8K','10K','20K_三部軽量','20K_直付','30K','50K_軽量型','50K_S','取込日時'];
const OH = ['日付','ファイル名','前回日付','空白日数','新規受注件数','新規受注本数','受注残件数','受注残本数','取込日時'];

function fmt(d, tz, f) {
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear(), mo = p(d.getUTCMonth() + 1), da = p(d.getUTCDate());
  if (f === 'yyyy-MM') return y + '-' + mo;
  if (f === 'yyyy-MM-dd') return y + '-' + mo + '-' + da;
  return y + '-' + mo + '-' + da + ' 00:00:00';
}
function mkSheet(rows, headers) {
  const s = {
    __rows: rows,
    getLastRow: () => (rows.length ? rows.length + 1 : 1),
    getLastColumn: () => 25, getMaxColumns: () => 26, insertColumnsAfter: () => {},
    setFrozenRows: () => {},
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        if (r === 1) return [headers.slice()];
        const out = [];
        for (let i = 0; i < nr; i++) {
          const rr = rows[r - 2 + i] || new Array(headers.length).fill('');
          out.push(rr.slice(c - 1, c - 1 + nc));
        }
        return out;
      },
      setValues: (v) => { if (r === 1) return; v.forEach((x, i) => { rows[r - 2 + i] = x.slice(); }); },
      setFontWeight: () => {}, clearContent: () => { rows.length = 0; },
    }),
    getParent: () => null,
  };
  return s;
}
// 配車表(22年度シート)のダミー。1日付ブロック=21列、先頭2列が20k/50k。
/* 年度はじめ（4月）から今月までの [年, 月]。
   ★ テストのたびに月が進むので、固定の「4〜9月」と書くと春に壊れる。
     しかも配車表の先の月は集計から落とすようにしたので、
     未来の月をデータに入れてしまうと期待値が合わなくなる。 */
function fyMonthsUpToNow() {
  const now = new Date();
  const fy = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const cur = now.getFullYear() * 100 + (now.getMonth() + 1);
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m = 4 + i;
    const y = m <= 12 ? fy : fy + 1;
    const mm = m <= 12 ? m : m - 12;
    if (y * 100 + mm > cur) break;
    out.push([y, mm]);
  }
  return out;
}

// 今月までの直近n か月（年度の頭で足りなければ前年度から借りる）
function lastMonths(n) {
  const all = fyMonthsUpToNow();
  if (all.length >= n) return all.slice(-n);
  const now = new Date(), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push([d.getFullYear(), d.getMonth() + 1]);
  }
  return out;
}

function mkDispatch(blocks) {
  const W = blocks.length * 21 + 4;
  const rows = [];
  for (let r = 0; r < 40; r++) rows.push(new Array(W).fill(''));
  blocks.forEach((b, i) => {
    const c = i * 21;
    rows[0][c] = String(b.year) + '年';
    rows[2][c] = b.label;
    if (b.goukei) { rows[36][c] = b.goukei[0]; rows[36][c + 1] = b.goukei[1]; }
  });
  return rows;
}

function build(shipRows, invRows, ordRows, planFiles, dispatchRows) {
  const sheets = {
    '実績': mkSheet(shipRows || [], SH),
    '在庫推移': mkSheet(invRows || [], IH),
  };
  if (ordRows) sheets['受注推移'] = mkSheet(ordRows, OH);
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = mkSheet([], n === '受注推移' ? OH : IH); return sheets[n]; },
    getUrl: () => 'https://example.test/ss', getId: () => 'SSID',
  };
  Object.values(sheets).forEach((s) => { s.getParent = () => ss; });
  const sb = {
    Logger: { log: (m) => sb.__logs.push(String(m)) },
    Utilities: { formatDate: (d, tz, f) => fmt(d instanceof Date ? d : new Date(), tz, f || 'yyyy-MM-dd'), parseCsv: () => [] },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'dispatchGrid.sheetId' ? null : 'SSID'), setProperty: () => {}, deleteProperty: () => {} }) },
    SpreadsheetApp: { openById: () => ss, create: () => ss,
      open: () => ({ getSheetByName: (n) => (n === '22年度'
        ? { getDataRange: () => ({ getValues: () => (dispatchRows || mkDispatch([])) }) } : null) }) },
    DriveApp: { getFolderById: () => ({
      getFiles: () => ({ hasNext: () => false }),
      getFilesByType: () => { let i = 0; const a = [{ getName: () => 'ﾄﾗｯｸ運行ｽｹｼﾞｭｰﾙ2017年度26.9.4.xlsx' }]; return { hasNext: () => i < a.length, next: () => a[i++] }; },
    }) },
    MimeType: { MICROSOFT_EXCEL: 'x' },
    Drive: { Files: { create: () => ({ id: 't' }), remove: () => {} } },
    DocumentApp: {}, ScriptApp: {},
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, removeAll: () => {} }) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, parseInt, isNaN, Boolean, Error,
  };
  sb.__logs = []; sb.__sheets = sheets;
  vm.createContext(sb);
  for (const f of ['noda_common_cache.js', 'Noda inventory engine.js', 'noda_orderplan_engine.js',
                   'noda_dispatch_engine.js', 'noda_dispatch_grid.js', 'noda_dispatch_monthly.js',
                   'noda_ship_actuals_engine.js', 'noda_inventory_history.js',
                   'noda_order_history.js', 'noda_monthly_combined.js']) {
    vm.runInContext(fs.readFileSync(GAS + f, 'utf8'), sb);
  }
  // 計画表PDFの読み取りは重いので差し替える
  if (planFiles) {
    sb.ord_getSortedFiles_ = () => planFiles.map((f) => ({ file: { getName: () => f.name }, key: f.key }))
      .sort((a, b) => b.key - a.key);
    sb.ord_getLpOrdersForFile_ = (file) => {
      const f = planFiles.find((x) => x.name === file.getName());
      if (f.throws) throw new Error('変換失敗');
      return f.orders;
    };
  }
  return sb;
}

// --- 実データに近い規模のダミー ---
function shipRow(ym, no, size, qty, ver) {
  const r = new Array(SH.length).fill('');
  r[0] = 'f' + no; r[3] = no; r[4] = 0; r[5] = ver || 0;
  r[7] = ym; r[9] = size; r[10] = qty; r[12] = '一致'; r[18] = '8785';
  return r;
}
function invRow(dt, total) {
  const r = new Array(IH.length).fill(0);
  r[0] = dt; r[1] = 'i' + dt; r[3] = total;
  return r;
}
function ordRow(dt, newQty) {
  const r = new Array(OH.length).fill('');
  r[0] = dt; r[5] = newQty; r[7] = 20000;
  return r;
}

console.log('■ 月次まとめ：出荷は配車表から取る');
{
  const Y = new Date().getFullYear();
  const past = new Date(Date.now() - 40 * 86400000);
  // ★ 1日あたりの値で入れること。実データの日別は1サイズ300〜800本程度で、
  //   月合計をそのまま1日のセルに入れると上限3000にはじかれる（一度やった）。
  const disp = mkDispatch([
    { year: 2026, label: '7/1(水)出', goukei: [703, 516] },
    { year: 2026, label: '7/2(木)出', goukei: [263, 610] },
    { year: 2026, label: '8/3(月)出', goukei: [781, 174] },
    { year: 2026, label: '8/4(火)出', goukei: [730, 520] },
  ]);
  const s = build(
    // 指図書シートには別の数字を入れておく。混ざったらここで気づける。
    [shipRow('2026-07', '1', '50kg', 99999)],
    [invRow('2026-08-17', 9800), invRow('2026-08-31', 9500)],
    [ordRow('2026-08-03', 5000), ordRow('2026-08-20', 6000)],
    null, disp
  );
  const d = s.getMonthlyCombinedData_uncached_();
  check('エラーなし', d.error === null, d.error);
  const jul = d.months.find((m) => m.年月 === '2026-07');
  const aug = d.months.find((m) => m.年月 === '2026-08');
  check('7月は配車表の2日ぶん合計 2,092本', jul.出荷 === 2092, jul.出荷);
  check('8月は配車表の2日ぶん合計 2,205本', aug.出荷 === 2205, aug.出荷);
  check('指図書の数字が混ざっていない', !JSON.stringify(d).includes('99999'));
  check('出所を明示している', d.出荷の出所 === '配車表', d.出荷の出所);
  check('8月の在庫は月末8/31の値', aug.在庫 === 9500, aug.在庫);
  check('8月の受注は月内合計11,000本', aug.受注 === 11000, aug.受注);
  check('上限ではじかれた値が無い', s.getDispatchMonthlyTotals_uncached_().rejectedTooLarge === 0);
}

console.log('■ 月合計を1日のセルに入れる誤りは黙って通さない');
{
  // 実データの月合計(15,103)を1日ぶんとして入れてしまったケース。
  // 上限3000ではじかれるが、黙って0になるのではなく件数として報告されること。
  const s = build([], [], [], null, mkDispatch([
    { year: 2026, label: '8/3(月)出', goukei: [7561, 7542] },
  ]));
  const dm = s.getDispatchMonthlyTotals_uncached_();
  check('はじいた件数を報告する', dm.rejectedTooLarge === 2, dm.rejectedTooLarge);
  check('はじいた最大値を報告する', dm.rejectedMaxValue === 7561, dm.rejectedMaxValue);
}

console.log('■ 未来日は「予定」として分かれる');
{
  const now = new Date(), future = new Date(Date.now() + 3 * 86400000);
  const lab = (dt) => (dt.getMonth() + 1) + '/' + dt.getDate() + '(月)出';
  const s = build([], [], [], null, mkDispatch([
    { year: now.getFullYear(), label: lab(now), goukei: [300, 400] },
    { year: future.getFullYear(), label: lab(future), goukei: [500, 600] },
  ]));
  const d = s.getMonthlyCombinedData_uncached_();
  const tot = d.months.reduce((a, m) => a + (m.出荷 || 0), 0);
  const plan = d.months.reduce((a, m) => a + (m.出荷予定 || 0), 0);
  check('実績は今日ぶんまで（700本）', tot === 700, tot);
  check('予定は別項目（1,100本）', plan === 1100, plan);
  check('予定があるフラグが立つ', d.hasPlan === true);
  check('基準日を返す', /^\d{4}-\d{2}-\d{2}$/.test(d.asOf), d.asOf);
}

console.log('■ 表示期間は年度（4月始まり）');
{
  // 実データに合わせて2025年度と2026年度の両方を入れ、2026-04以降だけ残ることを見る
  const now = new Date(), fy = (now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1);
  // 今年度ぶん（4月〜今月）。前年度の月も混ぜて、落ちることを見る。
  const fyM = fyMonthsUpToNow();
  if (fyM.length < 4) {
    console.log('  --   年度の頭なので飛ばす（今年度が' + fyM.length + 'か月しかない）');
  } else {
    const blocks = [];
    [[fy - 1, 10], [fy - 1, 12], [fy, 1], [fy, 3]]
      .forEach(([y, mo]) => blocks.push({ year: y, label: mo + '/1(月)出', goukei: [300, 400] }));
    fyM.forEach(([y, mo]) => blocks.push({ year: y, label: mo + '/1(月)出', goukei: [300, 400] }));
    const s = build([], [], [], null, mkDispatch(blocks));
    const d = s.getMonthlyCombinedData_uncached_();
    check('年度の4月始まりになる', d.startMonth === fy + '-04', d.startMonth + ' (期待 ' + fy + '-04)');
    check('前年度の10月・12月・1月・3月は落ちる', d.months.length === fyM.length,
      d.months.map((m) => m.年月).join(','));
    check('年度より前の月は出さない', d.months.every((m) => m.年月 >= d.startMonth),
      d.months.map((m) => m.年月).join(','));
  }
}

console.log('■ 先の月は実績に出さない');
{
  /* ★ 配車表には来月以降の予定も入っている。落とさないと9月半ばなのに
        「4月〜10月」の実績に見える（実際そうなった。2026/09/16）。 */
  const now = new Date();
  const cur = lastMonths(2);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const s = build([], [], [], null, mkDispatch([
    ...cur.map(([y, mo]) => ({ year: y, label: mo + '/1(月)出', goukei: [300, 400] })),
    // 来月の予定（配車表の未来日）
    { year: next.getFullYear(), label: (next.getMonth() + 1) + '/1(月)出', goukei: [500, 600] },
  ]));
  const d = s.getMonthlyCombinedData_uncached_();
  const nextKey = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0');
  check('★来月は出さない', !d.months.some((m) => m.年月 === nextKey),
    d.months.map((m) => m.年月).join(','));
  check('今月までは出る', d.months.length === cur.length, d.months.map((m) => m.年月).join(','));
}

console.log('■ 中身が無い月は出さない（0本の棒にしない）');
{
  const now = new Date();
  const y = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const mm = lastMonths(4);   // 未来の月を入れない（先の月は落とすようにしたため）
  const s = build([], [], [], null, mkDispatch([
    { year: mm[0][0], label: mm[0][1] + '/1(月)出', goukei: [300, 400] },
    { year: mm[1][0], label: mm[1][1] + '/1(月)出', goukei: ['', ''] },   // 列はあるが空
    { year: mm[2][0], label: mm[2][1] + '/1(月)出', goukei: [0, 0] },     // 0が入っている
    { year: mm[3][0], label: mm[3][1] + '/1(月)出', goukei: [200, 100] },
  ]));
  const d = s.getMonthlyCombinedData_uncached_();
  const ym = d.months.map((m) => m.年月);
  const p2 = (n) => String(n).padStart(2, '0');
  check('空の月も0の月も落とす',
    ym.length === 2 && ym[0] === mm[0][0] + '-' + p2(mm[0][1]) && ym[1] === mm[3][0] + '-' + p2(mm[3][1]),
    ym.join(','));
}

console.log('■ 凡例は表示期間の中身で決める');
{
  const now = new Date();
  const y = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  // 受注は年度より前（2025-10）にしか無い → 表示期間に出ないので凡例も出さない
  const ordOld = (() => { const r = ordRow('x', 5000); r[0] = '2025-10-05'; return r; })();
  const s = build([], [], [ordOld], null, mkDispatch(
    lastMonths(4).map(([yy, mo]) => ({ year: yy, label: mo + '/1(月)出', goukei: [300, 400] }))));
  const d = s.getMonthlyCombinedData_uncached_();
  check('期間外にしか受注が無ければ凡例に出さない', d.hasOrders === false, d.hasOrders);
  check('期間内の月だけ返す', d.months.every((m) => m.受注 == null));
}

console.log('■ 年度の頭で月数が少ないときは前年度も出す');
{
  const now = new Date();
  const y = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  // 今年度は4月の1か月だけ。前年度に月があるならそちらも含める
  const s = build([], [], [], null, mkDispatch([
    { year: y - 1, label: '10/1(月)出', goukei: [300, 400] },
    { year: y - 1, label: '12/1(月)出', goukei: [300, 400] },
    { year: y, label: '4/1(月)出', goukei: [300, 400] },
  ]));
  const d = s.getMonthlyCombinedData_uncached_();
  check('1か月しか無ければ前年度まで下げる', d.startMonth === (y - 1) + '-04', d.startMonth);
  check('前年度の月も出る', d.months.length === 3, d.months.map((m) => m.年月).join(','));
}

console.log('■ 配車表が読めないときの扱い');
{
  const s = build([], [], [], null, mkDispatch([]));   // 出発列が1つも無い
  const d = s.getMonthlyCombinedData_uncached_();
  check('落ちない', d.error === null, d.error);
  check('月が空になる', d.months.length === 0, JSON.stringify(d.months));
  check('受注シートが無くても落ちない', d.hasOrders === false);
}

console.log('■ 受注推移：前日に無かった依頼Noだけ数える');
{
  const files = [
    { name: 'p1', key: 20260701, orders: [{ orderNo: 'A', qty: 100 }, { orderNo: 'B', qty: 200 }] },
    { name: 'p2', key: 20260702, orders: [{ orderNo: 'B', qty: 200 }, { orderNo: 'C', qty: 50 }] },
    { name: 'p3', key: 20260703, orders: [{ orderNo: 'C', qty: 50 }, { orderNo: 'D', qty: 300 }, { orderNo: 'E', qty: 10 }] },
  ];
  const s = build([], [], [], files);
  const r = s.harvestOrderHistory();
  check('3件取り込む', r.added === 3, 'added=' + r.added);
  const rows = s.__sheets['受注推移'].__rows;
  check('一番古い日は比較相手が無いので空欄（0本にしない）', rows[0][5] === '', JSON.stringify(rows[0][5]));
  check('7/2の新規はCの50本', rows[1][5] === 50, rows[1][5]);
  check('7/2の新規件数は1件（Aが消えても新規に数えない）', rows[1][4] === 1, rows[1][4]);
  check('7/3の新規はD+Eの310本', rows[2][5] === 310, rows[2][5]);
  check('受注残は当日の全部（7/3は360本）', rows[2][7] === 360, rows[2][7]);
  check('前回日付を残す', rows[2][2] === '2026-07-02', rows[2][2]);
  check('空白日数を残す', rows[2][3] === 1, rows[2][3]);
}

console.log('■ 受注推移：日が飛んでいる区間');
{
  const files = [
    { name: 'p1', key: 20260807, orders: [{ orderNo: 'A', qty: 100 }] },
    { name: 'p2', key: 20260817, orders: [{ orderNo: 'A', qty: 100 }, { orderNo: 'Z', qty: 900 }] },
  ];
  const s = build([], [], [], files);
  s.harvestOrderHistory();
  const rows = s.__sheets['受注推移'].__rows;
  check('空白10日と記録される', rows[1][3] === 10, rows[1][3]);
  check('抜けた区間の受注はまとめて計上される', rows[1][5] === 900, rows[1][5]);
  check('同じ8月内なので月合計は保たれる',
    s.getMonthlyCombinedData_uncached_().months[0].受注 === 900);
}

console.log('■ 受注推移：再実行と失敗の扱い');
{
  const files = [
    { name: 'p1', key: 20260701, orders: [{ orderNo: 'A', qty: 100 }] },
    { name: 'p2', key: 20260702, orders: [{ orderNo: 'B', qty: 50 }] },
  ];
  const s1 = build([], [], [], files);
  s1.harvestOrderHistory();
  const kept = s1.__sheets['受注推移'].__rows.map((r) => r.slice());
  const s2 = build([], [], kept, files);
  const r2 = s2.harvestOrderHistory();
  check('2回目は追加しない', r2.added === 0, 'added=' + r2.added);

  const bad = [
    { name: 'p1', key: 20260701, orders: [{ orderNo: 'A', qty: 100 }] },
    { name: 'p2', key: 20260702, throws: true },
    { name: 'p3', key: 20260703, orders: [{ orderNo: 'A', qty: 100 }, { orderNo: 'C', qty: 7 }] },
  ];
  const s3 = build([], [], [], bad);
  const r3 = s3.harvestOrderHistory();
  check('1件失敗しても続行する', r3.failed === 1 && r3.added === 2, 'failed=' + r3.failed + ' added=' + r3.added);
  const rows3 = s3.__sheets['受注推移'].__rows;
  check('失敗の次の日は比較相手なし扱い（誤った差分を出さない）', rows3[1][5] === '', JSON.stringify(rows3[1][5]));
}

console.log('■ 在庫・受注の日付がDate型で返ってきても崩れない');
{
  const s = build([], [invRow(new Date(Date.UTC(2026, 7, 31)), 9500)],
    [(() => { const r = ordRow('x', 5000); r[0] = new Date(Date.UTC(2026, 7, 3)); return r; })()],
    null, mkDispatch([{ year: 2026, label: '8/3(月)出', goukei: [781, 174] }]));
  const d = s.getMonthlyCombinedData_uncached_();
  check('年月が yyyy-MM になる', d.months[0].年月 === '2026-08', d.months[0].年月);
  check('3つとも同じ月にそろう',
    d.months.length === 1 && d.months[0].出荷 === 955 && d.months[0].在庫 === 9500 && d.months[0].受注 === 5000,
    JSON.stringify(d.months));
  check('長いDate文字列が混ざっていない', !JSON.stringify(d).includes('GMT'));
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail === 0 ? 0 : 1);
