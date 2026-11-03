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
  a = sb.wlog_plan_(seen('2026-10-30', 'HHF', '20kg三部制', 96601, 96639).concat(seen('2026-11-02', 'HHF', '20kg三部制', 96640, 96640)), [], '2026-11-01');
  chk('★始める前に量り始めた100本の組の残りを後から量っても、ロットにしない（HHF96640の1本）', a.length === 0, a);
  a = sb.wlog_plan_(seen('2026-10-30', 'HHF', '20kg三部制', 96601, 96700).concat(seen('2026-11-02', 'HHF', '20kg三部制', 96701, 96750)), [], '2026-11-01');
  chk('次の組（96701〜）から量り始めたものはロットにする', a.length === 1 && a[0].a === 96701 && a[0].n === 50, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84080), [lot({ 状態: '受検済' })], '2026-11-01');
  chk('受検済の自動ロットは広げない（続きは新しいロット）', a.length === 1 && a[0].op === 'create' && a[0].a === 84051, a);
}

console.log('■ 20kg はパレット満タン（72本）とバラ（28本）に分ける');
{
  let a = sb.wlog_plan_(seen('2026-11-02', 'HXR', '20kg', 4001, 4100), [], '2026-11-01');
  const full = a.find((x) => x.part === '満タン'), bara = a.find((x) => x.part === 'バラ');
  chk('★100本 → 満タン 01〜72（72本・15に置く）とバラ 73〜00（28本・置場は選ぶ）', a.length === 2 && full && full.a === 4001 && full.b === 4072 && full.n === 72 && full.place === '15' && bara && bara.a === 4073 && bara.b === 4100 && bara.n === 28 && bara.place === '', a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HXR', '20kg', 4001, 4250), [], '2026-11-01');
  chk('★組をまたいでも、組ごとに満タンとバラ（250本 → 満タン3・バラ2・最後は 4201〜4250 の満タン50本）', a.length === 5 && a.filter((x) => x.part === '満タン').length === 3 && a[a.length - 1].a === 4201 && a[a.length - 1].b === 4250, a.map((x) => [x.part, x.a, x.b, x.n]));
  const L = (o) => lot(Object.assign({ 機種名: '20kg', サイズ: '20kg', 容器接頭辞: 'HXR' }, o));
  a = sb.wlog_plan_(seen('2026-11-02', 'HXR', '20kg', 4001, 4100), [L({ ロットID: 'F1', 容器No開始: '4001', 容器No終了: '4072', 本数: 60, 置場番号: '15' }), L({ ロットID: 'B1', 容器No開始: '4073', 容器No終了: '4085', 本数: 13 })], '2026-11-01');
  chk('★置いた満タン（15）の中で増えたぶんは本数と置場に足す（60→72）', a.some((x) => x.op === 'update' && x.id === 'F1' && x.n === 72 && x.add === 12 && x.置場番号 === '15'), a);
  chk('★まだ置いていないバラは同じ区切りの中で広げる（73〜00・28本）', a.some((x) => x.op === 'update' && x.id === 'B1' && x.a === 4073 && x.b === 4100 && x.n === 28), a);
  chk('満タンの区切りにバラを広げない', !a.some((x) => x.op === 'update' && x.id === 'B1' && x.a < 4073), a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HEP', '50kg', 84001, 84100), [], '2026-11-01');
  chk('50kg は分けない', a.length === 1 && !a[0].part, a);
  a = sb.wlog_plan_(seen('2026-11-02', 'HXR', '20kg', 4401, 4981), [L({ ロットID: 'OLD', 容器No開始: '4401', 容器No終了: '4981', 本数: 530 })], '2026-11-01');
  chk('★分ける前にできた組またぎのロットがあれば、同じ番号で作り直さない（11/2 の重なり）', !a.some((x) => x.op === 'create'), a.map((x) => [x.op, x.a, x.b]));
  a = sb.wlog_plan_(seen('2026-11-02', 'HXR', '20kg', 4401, 4472), [L({ ロットID: 'X', 状態: '取消', 容器No開始: '4401', 容器No終了: '4981', 本数: 530 }), L({ ロットID: 'F', 容器No開始: '4401', 容器No終了: '4472', 本数: 70, 置場番号: '15' })], '2026-11-01');
  chk('★取り消したロットと重なっても、生きているロットで数える（70→72）', a.some((x) => x.op === 'update' && x.id === 'F' && x.n === 72 && x.add === 2), a);
}

console.log('■ 11/3〜 重量転記アプリのロットが完了してメールで送ったら、まとめて入庫');
{
  const W = (id, pre, a, b, kind, state, sent, spec) => ({ id, pre, a, b, width: 5, kind, state, sent, spec: spec || '' });
  const L = (o) => lot(Object.assign({ 機種名: '20kg', サイズ: '20kg', 容器接頭辞: 'HXR' }, o));
  let a = sb.wlog_planSent_(seen('2026-11-03', 'HXR', '20kg', 6001, 6100, [6050]), [], [W('HXR06001', 'HXR', 6001, 6100, '20kg', '入力中', '')], '2026-11-01');
  chk('★まだ入力中（メール前）なら何もしない（量っている途中で細かく入庫しない）', a.length === 0, a);
  a = sb.wlog_planSent_(seen('2026-11-03', 'HXR', '20kg', 6001, 6100, [6050]), [], [W('HXR06001', 'HXR', 6001, 6100, '20kg', '完了', '')], '2026-11-01');
  chk('完了でもメールを送っていなければ何もしない', a.length === 0, a);
  a = sb.wlog_planSent_(seen('2026-11-03', 'HXR', '20kg', 6001, 6100, [6050]), [], [W('HXR06001', 'HXR', 6001, 6100, '20kg', '完了', '2026-11-03')], '2026-11-01');
  const f = a.find((x) => x.part === '満タン'), b = a.find((x) => x.part === 'バラ');
  chk('★送ったら20kgは満タン（6001〜6072・71本→15に入庫）とバラ（6073〜6100・28本・置場待ち）', a.length === 2 && f.a === 6001 && f.b === 6072 && f.n === 71 && f.stockIn === '15' && f.state === '受検済' && b.a === 6073 && b.b === 6100 && b.n === 28 && !b.stockIn, a);
  a = sb.wlog_planSent_(seen('2026-11-03', 'HEP', '50kg', 85001, 85100), [], [W('HEP85001', 'HEP', 85001, 85100, '50kg', '完了', '2026-11-03')], '2026-11-01');
  chk('★50kgは100本で1ロット（受検済で置場待ち）', a.length === 1 && a[0].a === 85001 && a[0].b === 85100 && a[0].n === 100 && a[0].state === '受検済' && !a[0].stockIn, a);
  a = sb.wlog_planSent_(seen('2026-11-03', 'HXU', '8kg', 81001, 81100), [], [W('HXU81001', 'HXU', 81001, 81100, '8kg', '完了', '2026-11-03')], '2026-11-01');
  chk('置場容量に列の無いサイズ（8kg）は作らない', a.length === 0);
  a = sb.wlog_planSent_(seen('2026-11-03', 'HXP', '20kg', 97801, 97900), [], [W('HXP97801-底黒', 'HXP', 97801, 97900, '20kg', '完了', '2026-11-03', '底黒')], '2026-11-01');
  chk('底黒は作らない', a.length === 0);
  a = sb.wlog_planSent_(seen('2026-10-29', 'HXR', '20kg', 4001, 4100), [], [W('HXR04001', 'HXR', 4001, 4100, '20kg', '完了', '2026-11-03')], '2026-11-01');
  chk('始める日より前に量った組は作らない', a.length === 0);
  a = sb.wlog_planSent_(seen('2026-11-02', 'HXR', '20kg', 4401, 4500), [L({ ロットID: 'F', 容器No開始: '4401', 容器No終了: '4472', 本数: 72, 置場番号: '15' }), L({ ロットID: 'B', 容器No開始: '4473', 容器No終了: '4500', 本数: 28 })],
    [W('HXR04401', 'HXR', 4401, 4500, '20kg', '完了', '2026-11-03')], '2026-11-01');
  chk('★前のやり方の自動ロットは、置いてあれば入庫済・まだなら受検済にする（作り直さない）', a.length === 2 && a.some((x) => x.op === 'update' && x.id === 'F' && x.state === '入庫済') && a.some((x) => x.op === 'update' && x.id === 'B' && x.state === '受検済') && !a.some((x) => x.op === 'create'), a);
  a = sb.wlog_planSent_(seen('2026-11-03', 'HEP', '50kg', 85001, 85100), [lot({ ロットID: 'M', 登録者: '野田', 容器No開始: '85001', 容器No終了: '85050', 本数: 50 })], [W('HEP85001', 'HEP', 85001, 85100, '50kg', '完了', '2026-11-03')], '2026-11-01');
  chk('手で登録したロットと重なる組は作らない', a.length === 0, a);
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
