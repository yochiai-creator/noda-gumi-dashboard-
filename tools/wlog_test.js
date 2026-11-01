// 重量転記アプリ（LPG容器 質量転記アプリ）の入力記録から、生産数と自動ロットを作るところのテスト（2026/11/01）。
const fs = require('fs');
const vm = require('vm');
let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 500) : '')); } };

const sb = { Logger: { log() {} }, JSON, Object, Number, String, Math, Date, RegExp, Array, isNaN, Boolean, Error,
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(__dirname + '/../gas/noda_weight_log.js', 'utf8'), sb);
sb.LOT_CONFIG = { CANCELLED: '取消' };

const HEAD = ['記録ID', '入力日時', 'ロットID', 'グループNo', '容器番号', '容器区分', '表示番号', '質量(kg)', '区分', '一致結果', '入力番号(NG時)', '上書き前', 'Googleアカウント', '状態', '入力者', '端末', '取消日時', '備考'];
const row = (t, no, kind, o) => { o = o || {}; const lot = no.replace(/\d{2}$/, '01');
  return ['R', t, o.lot || lot, '', no, kind, '', '34.8', o.区分 || '通常', 'OK', '', '', 'x', o.状態 || '有効', '野田', '', '', o.備考 || '']; };

console.log('■ 数え方（採番表と同じ）');
{
  const v = [
    row('2026/11/02 9:00:01', 'HEP84001', '50kg'),
    row('2026/11/02 9:00:11', 'HEP84002', '50kg'),
    row('2026/11/02 9:00:21', 'HEP84003', '50kg', { 状態: '取消' }),
    row('2026/11/02 9:00:31', 'HEP84004', '50kg', { 区分: '欠番' }),
    row('2026/11/02 9:00:41', 'HEP84005', '50kg', { 区分: '訂正' }),
    row('2026/11/02 9:00:51', 'HEP84006', '50kg', { 区分: 'ダブり' }),
    row('2026/11/02 9:01:01', 'HEP84007', '50kg', { 区分: '底黒' }),
    row('2026/11/02 9:01:11', 'HEP84008', '50kg', { 備考: '採番なし' }),
    row('2026/11/02 9:01:21', 'HEP84009', '50kg', { 区分: '修正' }),
    row('2026/11/02 9:01:31', 'HHF96601', '50kg', { lot: 'SOKO1' }),
    row('2026/11/02 9:01:41', 'HEP84001', '50kg'),                   // 量り直し
    row('2026/11/03 8:00:00', 'HEP84002', '50kg'),                   // 次の日にもう一度
    row('2026/11/03 8:00:10', "'HXR04001", '20kg三部制'),
  ];
  const rows = sb.wlog_rows_(HEAD, v, { SOKO1: true });
  chk('★有効・通常と修正だけ（取消・欠番・訂正・ダブり・底黒・採番なし・底黒のロットは除く）',
    JSON.stringify(rows.map((r) => r.num)) === JSON.stringify([84001, 84002, 84009, 84001, 84002, 4001]), rows.map((r) => r.num));
  chk('記号・番号・桁・容器区分・日', rows[5].pre === 'HXR' && rows[5].width === 5 && rows[5].kind === '20kg三部制' && rows[5].day === '2026-11-03', rows[5]);
  const list = sb.wlog_firstSeen_(rows);
  chk('★同じ容器は最初の日に1本', list.length === 4 && list.filter((r) => r.num === 84002)[0].day === '2026-11-02');
  const d = sb.wlog_daily_(list, '');
  chk('★日・容器区分ごとの本数', JSON.stringify(d.map((x) => [x.日付, x.容器区分, x.サイズ, x.本数])) ===
    JSON.stringify([['2026-11-02', '50kg', '50kg', 3], ['2026-11-03', '20kg三部制', '20kg', 1]]), d);
  chk('★読んだ範囲の最初の日（途中から）は数えない', sb.wlog_daily_(list, '2026-11-02').length === 1);
  chk('列が無ければ止める', (() => { try { sb.wlog_rows_(['記録ID'], [], {}); return false; } catch (e) { return /入力日時/.test(e.message); } })());
}

console.log('■ サイズ・続き');
chk('20kg三部制→20kg・50kg S付→50kg・30kg把手→30kg・8kg→空', sb.wlog_size_('20kg三部制') === '20kg' && sb.wlog_size_('50kg S付') === '50kg' && sb.wlog_size_('30kg把手') === '30kg' && sb.wlog_size_('8kg') === '');
chk('★欠番くらいの飛びはつなぐ（本数は量った本数）', JSON.stringify(sb.wlog_runs_([1, 2, 3, 5, 6, 40, 41], 10)) === JSON.stringify([[1, 6, 5], [40, 41, 2]]), sb.wlog_runs_([1, 2, 3, 5, 6, 40, 41], 10));
chk('同じ番号は1回', JSON.stringify(sb.wlog_runs_([3, 3, 4], 0)) === JSON.stringify([[3, 4, 2]]));

console.log('■ 自動ロット');
const seen = (day, pre, kind, a, b, skip) => { const o = []; for (let n = a; n <= b; n++) if (!(skip || []).includes(n)) o.push({ day, pre, kind, num: n, width: 5 }); return o; };
const AUTO = '（自動：重量転記）';
const lot = (o) => Object.assign({ ロットID: 'L1', 生産日: '2026-11-02', 機種名: '50kg', サイズ: '50kg', 容器接頭辞: 'HEP', 容器No開始: '84001', 容器No終了: '84050', 本数: 50, 状態: '未受検', 置場番号: '', 出荷済本数: 0, 登録者: AUTO }, o);
{
  let a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84100, [84050]), [], '2026-11-01');
  chk('★続いている番号を1ロット（未受検・置場なし）。欠番1本はつなぐ', a.length === 1 && a[0].op === 'create' && a[0].a === 84001 && a[0].b === 84100 && a[0].n === 99 && a[0].size === '50kg', a);
  a = sb.wlog_plan_(seen('2026-10-31', 'HEP', '50kg', 84001, 84100), [], '2026-11-01');
  chk('★始める日より前に量ったものはロットにしない', a.length === 0, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84080), [lot({})], '2026-11-01');
  chk('★まだ置いていない自動ロットは広げる（84001〜84080・80本）', a.length === 1 && a[0].op === 'update' && a[0].id === 'L1' && a[0].a === 84001 && a[0].b === 84080 && a[0].n === 80 && a[0].add === 0, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84050), [lot({})], '2026-11-01');
  chk('変わらなければ何もしない', a.length === 0, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84080), [lot({ 置場番号: '7', 本数: 48 })], '2026-11-01');
  chk('★置いた後：範囲の外は新しいロット、範囲の中で増えたぶん（48→50）は本数と置場に足す',
    a.length === 2 && a.some((x) => x.op === 'update' && x.id === 'L1' && x.n === 50 && x.add === 2 && x.置場番号 === '7') &&
    a.some((x) => x.op === 'create' && x.a === 84051 && x.b === 84080 && x.n === 30), a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84080), [lot({ 登録者: '野田', ロットID: 'M1', 容器No終了: '84060', 本数: 60 })], '2026-11-01');
  chk('★手で登録したロットの番号は作らない（触らない）', a.length === 1 && a[0].op === 'create' && a[0].a === 84061 && a[0].b === 84080, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84050), [lot({ 状態: '取消' })], '2026-11-01');
  chk('★取り消した自動ロットは作り直さない', a.length === 0, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84050), [lot({ 登録者: '野田', 状態: '取消' })], '2026-11-01');
  chk('手で登録して取り消した番号は空きに戻す（自動で作る）', a.length === 1 && a[0].op === 'create', a);
  a = sb.wlog_plan_(seen('2026-11-03', 'HEP', '50kg', 84051, 84070), [lot({})], '2026-11-01');
  chk('★次の日に続きを量ったら、次の日のロット（前の日のロットは広げない）', a.length === 1 && a[0].op === 'create' && a[0].生産日 === '2026-11-03' && a[0].a === 84051, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HXR', '20kg三部制', 4001, 4010).concat(seen('2026-11-02', 'HEP', '50kg', 84001, 84010)), [], '2026-11-01');
  chk('記号ごとに分ける', a.length === 2 && a.some((x) => x.pre === 'HXR' && x.size === '20kg' && x.kind === '20kg三部制'), a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84080), [lot({ 状態: '受検済' })], '2026-11-01');
  chk('受検済の自動ロットは広げない（続きは新しいロット）', a.length === 1 && a[0].op === 'create' && a[0].a === 84051, a);
}

console.log('■ 画面の形');
{
  const v = [['2026-10-30', '20kg', '20kg', 739, '2026-11-01 08:00'], ['2026-10-30', '20kg三部制', '20kg', 198, '2026-11-01 08:00'],
             ['2026-10-29', '50kg', '50kg', 812, '2026-11-01 08:00'], ['2026-11-01', '8kg', '', 10, '2026-11-01 09:00']];
  const r = sb.wlog_shape_(v, '2026-11-01', 62);
  chk('★日ごと（古い順）にサイズでまとめる（20kg三部制は20kg）', r.days.length === 3 && r.days[1].日付 === '2026-10-30' && r.days[1]['20kg'] === 937 && r.days[1].区分['20kg三部制'] === 198, r.days);
  chk('★月ごと', r.months.length === 2 && r.months[0].月 === '2026-10' && r.months[0].合計 === 1749 && r.months[0].日数 === 2, r.months);
  chk('今日・今月（列の無い8kgは「その他」）', r.today && r.today.その他 === 10 && r.month.合計 === 10 && r.syncedAt === '2026-11-01 09:00', r.today);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
