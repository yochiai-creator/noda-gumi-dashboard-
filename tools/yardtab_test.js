// 野外置場タブ（置場管理・在庫管理）のサーバ側テスト。
//
// ★ なぜ要るのか
//   本数を直すところなので、間違えると現場の数字が狂う。
//   使用率の出し方（サイズごと／合計ではない）と、推移を1日1行に保つところを押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

// 置場容量シートの1行（YARD_COLUMNS の並び）
const COLS = ['no', 'name', 'position', 'a20', 'm20', 'a30', 'm30', 'a50', 'm50',
              'note', 'updatedAt', 'updatedBy', 'mapX', 'mapY'];
const rec = (o) => {
  const r = {};
  COLS.forEach((k) => { r[k] = o[k] !== undefined ? o[k] : (/^[am]\d\d$/.test(k) ? 0 : ''); });
  return r;
};

function build(records, dailyRows, historyRows) {
  const daily = (dailyRows || []).map((r) => r.slice());
  const hist = (historyRows || []).map((r) => r.slice());
  const mkSheet = (rows, headerLen) => ({
    getLastRow: () => (rows.length === 0 ? 1 : rows.length + 1),
    setFrozenRows: () => {},
    appendRow: (r) => rows.push(r),
    getRange: (rr, c, nr, nc) => ({
      getValues: () => rows.slice(rr - 2, rr - 2 + nr).map((x) => x.slice(c - 1, c - 1 + (nc || headerLen))),
      setValues: (v) => { v.forEach((row, i) => { rows[rr - 2 + i] = row.slice(); }); },
      setFontWeight: () => {},
    }),
  });
  const sheets = { '日次在庫': mkSheet(daily, 8), '変更履歴': mkSheet(hist, 5) };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = mkSheet(n === '日次在庫' ? daily : hist, 8); return sheets[n]; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/YID/edit',
  };
  const sb = {
    Logger: { log: (m) => sb.__logs.push(String(m)) },
    Utilities: { formatDate: (d, tz, f) => {
      const p = (n) => String(n).padStart(2, '0');
      const x = tz === 'Asia/Tokyo' ? new Date(d.getTime() + 9 * 3600000) : d;
      return x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate()) +
        (f.indexOf('HH') >= 0 ? ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes()) : '');
    } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, isNaN, Boolean, Error,
  };
  sb.__logs = []; sb.__daily = daily; sb.__hist = hist;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_common_cache.js', 'utf8'), sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_yard_tab.js', 'utf8'), sb);
  // 置場容量シートと元アプリ側の関数は差し替える（ここで見たいのはタブ側の組み立て）
  sb.yardReadAllRecords_ = () => records.map((r) => Object.assign({}, r));
  sb.yardGetSpreadsheet_ = () => ss;
  sb.yardGetHistorySheet_ = () => sheets['変更履歴'];
  sb.YARD_HISTORY_COLUMNS = ['日時', '操作者', '番号', '置場名', '変更内容'];
  return sb;
}

console.log('■ 置場の一覧');
{
  const s = build([
    rec({ no: 7, name: '大型製缶', position: '北・北', a50: 2400, m50: 2400 }),
    rec({ no: 11, name: 'コンテナ', position: '西', a20: 1568, m20: 1988 }),
    rec({ no: 2, name: '水処理', position: '西' }),                       // 収容の設定なし
    rec({ no: 8, name: '大型製缶', position: '北・南', a50: 1500, m50: 1800, note: '雪' }),
  ], [], []);
  const d = s.getYardTabData();
  chk('エラーなし', d.error === null, d.error);
  chk('★番号順に並ぶ（文字列比較で10が2より前に来ない）',
    d.locations.map((r) => r.no).join(',') === '2,7,8,11', d.locations.map((r) => r.no));

  const by = {}; d.locations.forEach((r) => { by[r.no] = r; });
  chk('★使用率はサイズごとに出す', by[11].sizes.length === 1 && by[11].sizes[0].label === '20kg',
    by[11].sizes);
  chk('20kgの使用率', Math.round(by[11].sizes[0].率 * 100) === 79, by[11].sizes[0].率);
  chk('★100%は「超過」', by[7].状態 === '超過', by[7].状態);
  chk('★80%以上は「満杯に近い」', by[8].状態 === '満杯に近い', { 率: by[8].率, 状態: by[8].状態 });
  chk('80%未満は印なし', by[11].状態 === '', by[11].状態);
  chk('★収容が0の置場はサイズを出さない（0÷0を出さない）', by[2].sizes.length === 0, by[2].sizes);
  chk('合計', d.totals.合計 === 2400 + 1568 + 1500, d.totals);
  chk('置場数', d.totals.置場数 === 4, d.totals.置場数);
  chk('超過と満杯に近いを数える', d.totals.超過 === 1 && d.totals.満杯に近い === 1, d.totals);
  chk('シートのURLを返す', /YID/.test(d.sheetUrl), d.sheetUrl);
}

console.log('■ 変更履歴');
{
  const rows = [
    ['2026-09-14 09:00', 'a@x', 7, '大型製缶', '50kg_実績: 2200 → 2300'],
    ['2026-09-15 09:00', 'b@x', 11, 'コンテナ', '20kg_実績: 1500 → 1568'],
    ['2026-09-16 10:00', 'a@x', 7, '大型製缶', '50kg_実績: 2300 → 2400'],
  ];
  const s = build([], [], rows);
  const all = s.getYardChangeLog('', 10);
  chk('★新しい順', all.rows[0].内容 === '50kg_実績: 2300 → 2400', all.rows.map((r) => r.日時));
  chk('3件', all.rows.length === 3, all.rows.length);
  const one = s.getYardChangeLog(7, 10);
  chk('★置場で絞れる', one.rows.length === 2 && one.rows.every((r) => r.no === '7'),
    one.rows.map((r) => r.no));
  chk('件数を絞れる', s.getYardChangeLog('', 1).rows.length === 1);
  chk('記録が無くても落ちない', build([], [], []).getYardChangeLog('', 10).rows.length === 0);
}

console.log('■ 在庫の推移（1日1行）');
{
  const s = build([
    rec({ no: 7, name: '大型製缶', a50: 2400, m50: 2400 }),
    rec({ no: 11, name: 'コンテナ', a20: 1568, m20: 1988 }),
  ], [], []);
  const r1 = s.harvestYardDailyTotals();
  chk('記録できる', r1.ok === true && r1.合計 === 3968, r1);
  chk('1行', s.__daily.length === 1, s.__daily);

  // 同じ日にもう一度呼んでも行は増えない（最後の値で上書き）
  s.yardReadAllRecords_ = () => [rec({ no: 7, name: '大型製缶', a50: 2500, m50: 2400 })];
  const r2 = s.harvestYardDailyTotals();
  chk('★同じ日に2回呼んでも1行のまま', s.__daily.length === 1, s.__daily);
  chk('上書きしたと分かる', r2.上書き === true, r2);
  chk('新しい値で上書きされる', s.__daily[0][4] === 2500, s.__daily[0]);

  const got = s.getYardDailyTotals();
  chk('推移として読める', got.days.length === 1 && got.days[0].合計 === 2500, got.days);
}
{
  // 日付が古い順に並ぶ（シートの並びが崩れていても）
  const s = build([], [
    ['2026-09-16', 10, 0, 20, 30, 3, 0, 0],
    ['2026-09-14', 8, 0, 18, 26, 3, 0, 0],
    ['', 0, 0, 0, 0, 0, 0, 0],            // 空行は落とす
  ], []);
  const got = s.getYardDailyTotals();
  chk('★古い順に並べ直す', got.days.map((d) => d.日付).join(',') === '2026-09-14,2026-09-16',
    got.days.map((d) => d.日付));
  chk('空行は落とす', got.days.length === 2, got.days.length);
}

console.log('■ 保存');
{
  const s = build([rec({ no: 7, name: '大型製缶', a50: 2400, m50: 2400 })], [], []);
  const calls = [];
  s.yardUpdateLocation = (no, up) => { calls.push([no, up]); };
  const r = s.saveYardLocation(7, { a50: 2300, note: 'x' });
  chk('★保存は元アプリと同じ関数に通す（履歴の残り方を2通りにしない）',
    calls.length === 1 && calls[0][0] === 7 && calls[0][1].a50 === 2300, calls);
  chk('okを返す', r.ok === true && r.error === null, r);

  s.yardUpdateLocation = () => { throw new Error('番号が見つかりません'); };
  const bad = s.saveYardLocation(99, { a50: 1 });
  chk('★失敗は握りつぶさず理由を返す', bad.ok === false && /見つかりません/.test(bad.error), bad);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
