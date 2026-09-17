// 生産ロットの流れ（未受検 → 受検済 → 入庫済 → 出荷済）のテスト。
//
// ★ なぜ要るのか
//   置場の実績数を自動で増減させるので、間違えると現場の在庫が狂う。
//   とくに「二重に引かない」ことと「部分的に出たとき」を押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

const H = ['ロットID', '生産日', '機種コード', '機種名', 'サイズ',
           '容器接頭辞', '容器No開始', '容器No終了', '本数',
           '状態', '受検日', '入庫日', '置場番号', '置場名', '出荷済本数', '出荷日', '依頼No',
           '備考', '登録者', '登録日時', '更新日時'];

// 在庫照会CSVから取り込んだ機種マスタ（実ファイルにあったコードを使う）
const TYPES = [
  { コード: '123', 品名: '新軽量１１８Ｌ（５０ｋｇ）ＬＰガス容器', 分類: '５０Ｋ ＬＰＧ容器', サイズ: '50kg' },
  { コード: '165', 品名: '８７Ｌ（２０ｋｇ）ＬＰガス容器（直付）', 分類: '２０Ｋ ＬＰＧ容器（直付）', サイズ: '20kg' },
  { コード: '162', 品名: '７０Ｌ（３０ｋｇ）ＬＰガス容器', 分類: '３０Ｋ ＬＰＧ容器', サイズ: '30kg' },
  // ★ 置場容量シートに列が無いサイズ。在庫数には足さない
  { コード: '113', 品名: '２４Ｌ（１０ｋｇ）ＬＰガス容器（ＰＴ直付）', 分類: '１０Ｋ ＬＰＧ容器', サイズ: '' },
];

function build(lotRows, locations, ranges) {
  const rows = (lotRows || []).map((r) => r.slice());
  const locs = (locations || []).map((r) => Object.assign({}, r));
  const sheet = {
    getLastRow: () => (rows.length === 0 ? 1 : rows.length + 1),
    setFrozenRows: () => {},
    appendRow: (r) => rows.push(r.slice()),
    getRange: (rr, c, nr, nc) => ({
      getValues: () => rows.slice(rr - 2, rr - 2 + nr).map((x) => x.slice(c - 1, c - 1 + (nc || H.length))),
      setValues: (v) => { v.forEach((row, i) => { rows[rr - 2 + i] = row.slice(); }); },
      setFontWeight: () => {},
    }),
  };
  const ss = { getSheetByName: (n) => (n === '生産ロット' ? sheet : null),
               insertSheet: () => sheet, getUrl: () => 'u' };
  const sb = {
    Logger: { log: (m) => sb.__logs.push(String(m)) },
    Utilities: { formatDate: (d, tz, f) => {
      const p = (n) => String(n).padStart(2, '0');
      const x = new Date(d.getTime() + 9 * 3600000);
      return x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate()) +
        (f.indexOf('HH') >= 0 ? ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes()) : '');
    } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'y@x' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, isNaN, Boolean, Error,
  };
  sb.__logs = []; sb.__rows = rows; sb.__locs = locs; sb.__yardCalls = [];
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_common_cache.js', 'utf8'), sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_prod_lot.js', 'utf8'), sb);
  sb.yardGetSpreadsheet_ = () => ss;
  sb.yardReadAllRecords_ = () => locs.map((r) => Object.assign({}, r));
  sb.yardUpdateLocation = (no, up) => {
    sb.__yardCalls.push([no, Object.assign({}, up)]);
    const loc = locs.filter((l) => String(l.no) === String(no))[0];
    if (loc) Object.keys(up).forEach((k) => { loc[k] = up[k]; });
  };
  sb.shipact_index_ = () => ({ byOrder: {}, byDate: {}, addrByCode: {}, ranges: ranges || [] });
  sb.getContainerTypes = () => ({ types: TYPES, updated: 'x', error: null });
  return sb;
}

const lotRow = (o) => {
  const r = new Array(H.length).fill('');
  const set = (k, v) => { r[H.indexOf(k)] = v; };
  set('ロットID', o.id); set('生産日', o.生産日 || '2026-09-17'); set('サイズ', o.サイズ || '50kg');
  set('機種コード', o.機種コード || '123'); set('機種名', o.機種名 || '新軽量１１８Ｌ（５０ｋｇ）ＬＰガス容器');
  set('容器接頭辞', o.pre || 'HEP'); set('容器No開始', o.a); set('容器No終了', o.b);
  set('本数', o.本数); set('状態', o.状態 || '未受検'); set('出荷済本数', o.出荷済 || 0);
  set('置場番号', o.置場番号 == null ? '' : o.置場番号); set('置場名', o.置場名 || '');
  return r;
};
const loc = (o) => Object.assign({ no: 7, name: '大型製缶', position: '北',
  a20: 0, m20: 0, a30: 0, m30: 0, a50: 0, m50: 3000, note: '' }, o);

console.log('■ 生産の登録');
{
  const s = build([], [loc({})], []);
  const r = s.addProdLot({ 生産日: '2026-09-17', 機種コード: '123', 接頭辞: 'hep', 開始: '54401', 終了: '54480' });
  chk('登録できる', r.ok === true, r);
  chk('★本数は番号から数える（人に数えさせない）', r.本数 === 80, r);
  const all = s.getProdLots('', 0).lots;
  chk('未受検で入る', all[0].状態 === '未受検', all[0]);
  chk('記号は大文字にそろえる', all[0].容器接頭辞 === 'HEP', all[0].容器接頭辞);

  chk('★同じ番号は二重に登録できない',
    s.addProdLot({ 生産日: '2026-09-17', 機種コード: '123', 接頭辞: 'HEP', 開始: '54450', 終了: '54500' }).ok === false);
  chk('重ならなければ登録できる',
    s.addProdLot({ 生産日: '2026-09-17', 機種コード: '123', 接頭辞: 'HEP', 開始: '54481', 終了: '54500' }).ok === true);
  chk('記号が違えば重ならない',
    s.addProdLot({ 生産日: '2026-09-17', 機種コード: '165', 接頭辞: 'HXP', 開始: '54401', 終了: '54410' }).ok === true);
}
console.log('■ 入力の確かめ');
{
  const s = build([], [], []);
  const bad = (o) => s.addProdLot(Object.assign({ 生産日: '2026-09-17', 機種コード: '123',
    接頭辞: 'HEP', 開始: '1', 終了: '10' }, o));
  chk('生産日が無ければ断る', bad({ 生産日: '' }).ok === false);
  chk('★機種を選ばなければ断る', bad({ 機種コード: '' }).ok === false);
  chk('マスタに無い機種は断る', bad({ 機種コード: '999' }).ok === false);
  chk('記号が無ければ断る', bad({ 接頭辞: '' }).ok === false);
  chk('★終わりが始まりより小さければ断る', bad({ 開始: '100', 終了: '10' }).ok === false);
  chk('★桁を間違えた大量入力を断る', bad({ 開始: '1', 終了: '99999' }).ok === false);
  chk('1本でも登録できる', bad({ 開始: '5', 終了: '5' }).ok === true);
}

console.log('■ 機種はマスタから引く');
{
  const s = build([], [loc({})], []);
  s.addProdLot({ 生産日: '2026-09-17', 機種コード: '165', 接頭辞: 'HXP', 開始: '1', 終了: '50' });
  const l = s.getProdLots('', 0).lots[0];
  chk('★機種名はマスタから入る（手打ちさせない）',
    l.機種名 === '８７Ｌ（２０ｋｇ）ＬＰガス容器（直付）', l.機種名);
  chk('★サイズも分類から決まる', l.サイズ === '20kg', l.サイズ);
  chk('機種コードを持つ', l.機種コード === '165', l.機種コード);
}
{
  // 置場容量シートに列が無いサイズ（10K）は在庫数に足さない
  const s = build([], [loc({})], []);
  s.addProdLot({ 生産日: '2026-09-17', 機種コード: '113', 接頭辞: 'HCZ', 開始: '1', 終了: '100' });
  const id = s.getProdLots('', 0).lots[0].ロットID;
  s.markLotInspected(id);
  const r = s.stockInLot(id, 7);
  chk('入庫はできる', r.ok === true, r);
  chk('★置場の列が無いサイズは在庫数に足さない', s.__yardCalls.length === 0, s.__yardCalls);
  chk('足していないことを返す', r.在庫に反映 === false, r);
  chk('置場は記録される', s.getProdLots('', 0).lots[0].置場名 === '大型製缶');
}

console.log('■ 受検と入庫');
{
  const s = build([lotRow({ id: 'L1', a: '54401', b: '54480', 本数: 80 })], [loc({})], []);
  chk('★受検前は入庫できない', s.stockInLot('L1', 7).ok === false, s.stockInLot('L1', 7));
  chk('受検OK', s.markLotInspected('L1').ok === true);
  chk('2回目の受検は断る', s.markLotInspected('L1').ok === false);

  const r = s.stockInLot('L1', 7);
  chk('入庫できる', r.ok === true, r);
  chk('★置場の実績数に足す（yardUpdateLocationを通す）',
    s.__yardCalls.length === 1 && s.__yardCalls[0][0] === 7 && s.__yardCalls[0][1].a50 === 80,
    s.__yardCalls);
  const lot = s.getProdLots('', 0).lots[0];
  chk('状態が入庫済になる', lot.状態 === '入庫済', lot.状態);
  chk('置場を覚える', lot.置場番号 === '7' && lot.置場名 === '大型製缶', lot);
  chk('無い置場は断る', s.stockInLot('L1', 99).ok === false);
}

console.log('■ 指図書と自動で照合する');
{
  // ロット HEP54401〜54480（80本）に、指図書が 54401〜54480 まるごと出た
  const s = build([lotRow({ id: 'L1', a: '54401', b: '54480', 本数: 80, 状態: '入庫済',
    置場番号: 7, 置場名: '大型製缶' })], [loc({ a50: 80 })],
    [{ no: '26-10660', prefix: 'HEP', a: 54401, b: 54480, date: '2026-09-14' }]);
  const r = s.matchProdLotsWithOrders();
  chk('★人が押さなくても引かれる', r.引いた本数 === 80, r);
  chk('出荷済になる', r.出荷済 === 1, r);
  chk('★置場の実績数から引く', s.__locs[0].a50 === 0, s.__locs[0]);
  const lot = s.getProdLots('', 0).lots[0];
  chk('依頼Noを覚える', lot.依頼No === '26-10660', lot.依頼No);
  chk('出荷日を覚える', lot.出荷日 === '2026-09-14', lot.出荷日);

  // もう一度走らせても二重に引かない
  const again = s.matchProdLotsWithOrders();
  chk('★2回目は何も引かない（二重に引かない）', again.引いた本数 === 0, again);
  chk('置場の数字も動かない', s.__locs[0].a50 === 0, s.__locs[0]);
}
{
  // 部分的に出た（80本のうち30本だけ指図書に載った）
  const s = build([lotRow({ id: 'L1', a: '54401', b: '54480', 本数: 80, 状態: '入庫済',
    置場番号: 7, 置場名: '大型製缶' })], [loc({ a50: 80 })],
    [{ no: '26-1', prefix: 'HEP', a: 54401, b: 54430, date: '2026-09-14' }]);
  const r = s.matchProdLotsWithOrders();
  chk('★重なったぶんだけ引く', r.引いた本数 === 30, r);
  chk('まだ出荷済にしない', r.出荷済 === 0 && s.getProdLots('', 0).lots[0].状態 === '入庫済', r);
  chk('置場は50本になる', s.__locs[0].a50 === 50, s.__locs[0]);

  // 残りが後から出た
  s.shipact_index_ = () => ({ ranges: [
    { no: '26-1', prefix: 'HEP', a: 54401, b: 54430, date: '2026-09-14' },
    { no: '26-2', prefix: 'HEP', a: 54431, b: 54480, date: '2026-09-15' },
  ] });
  const r2 = s.matchProdLotsWithOrders();
  chk('★残りぶんだけ引く', r2.引いた本数 === 50, r2);
  chk('全部出たら出荷済', s.getProdLots('', 0).lots[0].状態 === '出荷済');
  chk('置場は0本', s.__locs[0].a50 === 0, s.__locs[0]);
  chk('依頼Noは両方残る', /26-1/.test(s.getProdLots('', 0).lots[0].依頼No) &&
    /26-2/.test(s.getProdLots('', 0).lots[0].依頼No), s.getProdLots('', 0).lots[0].依頼No);
}
{
  // 記号が違えば当たらない／入庫していないロットは照合しない
  const s = build([
    lotRow({ id: 'L1', pre: 'HXP', a: '54401', b: '54480', 本数: 80, 状態: '入庫済', 置場番号: 7, 置場名: 'x' }),
    lotRow({ id: 'L2', pre: 'HEP', a: '54401', b: '54480', 本数: 80, 状態: '受検済' }),
  ], [loc({ a50: 80 })], [{ no: '26-1', prefix: 'HEP', a: 54401, b: 54480, date: '2026-09-14' }]);
  const r = s.matchProdLotsWithOrders();
  chk('★容器の記号が違えば引かない', r.引いた本数 === 0, r);
  chk('★入庫していないロットは照合しない', r.照合 === 1, r);
}
{
  // 指図書のレンジが重なって数えすぎないこと
  const s = build([lotRow({ id: 'L1', a: '1', b: '10', 本数: 10, 状態: '入庫済', 置場番号: 7, 置場名: 'x' })],
    [loc({ a50: 10 })], [
      { no: 'A', prefix: 'HEP', a: 1, b: 10, date: '2026-09-14' },
      { no: 'B', prefix: 'HEP', a: 1, b: 10, date: '2026-09-15' },   // 同じ範囲が2件
    ]);
  const r = s.matchProdLotsWithOrders();
  chk('★重複した指図書で本数を超えて引かない', r.引いた本数 === 10, r);
  chk('置場がマイナスにならない', s.__locs[0].a50 === 0, s.__locs[0]);
}

console.log('■ 状態ごとの本数');
{
  const s = build([
    lotRow({ id: 'L1', a: '1', b: '100', 本数: 100, 状態: '未受検' }),
    lotRow({ id: 'L2', a: '201', b: '250', 本数: 50, 状態: '受検済' }),
    lotRow({ id: 'L3', a: '301', b: '380', 本数: 80, 状態: '入庫済', 置場番号: 7, 置場名: 'x' }),
  ], [loc({})], []);
  const t = s.getProdLots('', 0).totals;
  chk('未受検', t.未受検 === 100, t);
  chk('受検済・未入庫', t.受検済 === 50, t);
  chk('入庫済', t.入庫済 === 80, t);
  chk('★状態でしぼれる', s.getProdLots('入庫済', 0).lots.length === 1);
  chk('しぼっても合計は全部ぶん', s.getProdLots('入庫済', 0).totals.未受検 === 100);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
