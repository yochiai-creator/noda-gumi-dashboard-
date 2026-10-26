// 在庫の入出庫（noda_work_stock.js）のテスト。置場の本数は偽物（メモリ）で持つ。
// ★ 本数が正しく動く・足りなければ動かさない・片方だけ動いた状態を残さない・取り消すと戻る・記録が残る、を押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';
const src = fs.readFileSync(__dirname + '/work_test.js', 'utf8');
const head = src.slice(0, src.indexOf("const it0 = "));
const T = new Function('require', '__dirname', 'process', head + '; return { sb, chk, get pass() { return pass; }, get fail() { return fail; } };')(require, __dirname, process);
const chk = T.chk;

function ssb(opt) {
  const o = opt || {};
  const s = T.sb({ pastDays: 0 });
  const locs = o.locs || [
    { no: '7', name: '大型製缶', a20: 0, a30: 0, a50: 300 },
    { no: '12', name: '事務所', a20: 0, a30: 0, a50: 100 },
    { no: '15', name: '西下屋', a20: 50, a30: 0, a50: 0 },
  ];
  s.LOT_CONFIG = { SIZE_KEY: { '20kg': 'a20', '30kg': 'a30', '50kg': 'a50' } };
  s.lot_findLocation_ = (no) => locs.find((l) => String(l.no) === String(no)) || null;
  s.__fail = o.failTo || null;   // この置場に足すときだけ失敗させる（移動の途中で失敗したときの戻し）
  s.lot_yardMove_ = (no, size, delta) => {
    const l = s.lot_findLocation_(no);
    if (!l) return { error: '置場「' + no + '」が見つかりません' };
    const k = s.LOT_CONFIG.SIZE_KEY[size];
    if (delta > 0 && s.__fail === String(no)) return { error: '書けませんでした' };
    if (l[k] + delta < 0) return { error: '置場「' + l.name + '」の' + k + 'が' + (l[k] + delta) + '本になってしまいます' };
    l[k] += delta;
    return { error: null, 反映: true };
  };
  vm.runInContext(fs.readFileSync(GAS + 'noda_work_stock.js', 'utf8'), s);
  s.addWorkStaff('野田 太郎', '現場');
  s.__locs = locs;
  return s;
}
const L = (s, no) => s.__locs.find((l) => l.no === no);
const log = (s) => (s.__yard.sheets['作業記録'] ? s.__yard.sheets['作業記録'].rows.slice(1) : []);

console.log('■ 移動');
{
  const s = ssb();
  const d = s.recordStockMove({ kind: '移動', size: '50kg', qty: '80', from: '7', to: '12', name: '野田 太郎' });
  chk('★元から引いて先に足す', L(s, '7').a50 === 220 && L(s, '12').a50 === 180, [L(s, '7').a50, L(s, '12').a50]);
  const r = log(s)[0];
  chk('★作業記録（名前・種類・サイズ・本数・元・先）', r[2] === '野田 太郎' && r[3] === '移動' && r[4] === '50kg' && r[5] === '80' && r[6] === '7 大型製缶' && r[7] === '12 事務所', r);
  chk('一覧に出る（新しい順・元・先）', d.rows.length === 1 && d.rows[0].kind === '移動' && d.rows[0].from === '7 大型製缶' && d.rows[0].to === '12 事務所' && d.rows[0].qty === 80, d.rows);
  chk('種類・サイズごとの本数', d.totals['移動']['50kg'] === 80, d.totals);
}

console.log('■ 足りない・おかしい入力は動かさない');
{
  const s = ssb();
  const err = (req) => { try { s.recordStockMove(Object.assign({ name: '野田 太郎' }, req)); return null; } catch (e) { return e.message; } };
  let e = err({ kind: '移動', size: '50kg', qty: 400, from: '7', to: '12' });
  chk('★足りなければ断る（何本あるかを言う）', /50kgは 300本しかありません/.test(e || '') && L(s, '7').a50 === 300 && L(s, '12').a50 === 100, e);
  chk('同じ置場には移せない', /同じ置場/.test(err({ kind: '移動', size: '50kg', qty: 1, from: '7', to: '7' }) || ''));
  chk('本数が無い・0は断る', /本数/.test(err({ kind: '移動', size: '50kg', qty: '0', from: '7', to: '12' }) || ''));
  chk('桁違いは断る', /多すぎ/.test(err({ kind: '移動', size: '50kg', qty: 50000, from: '7', to: '12' }) || ''));
  chk('サイズが無いと断る（2kgなど置場の列が無いもの）', /サイズ/.test(err({ kind: '移動', size: '2kg', qty: 1, from: '7', to: '12' }) || ''));
  chk('★入庫はここでは入れない（生産の流れと二重になる）', /種類/.test(err({ kind: '入庫', size: '50kg', qty: 1, from: '7' }) || ''));
  chk('社員に無い名前は断る', /記録する人/.test((() => { try { s.recordStockMove({ kind: '廃棄', size: '50kg', qty: 1, from: '7', memo: 'x', name: '誰か' }); } catch (x) { return x.message; } })() || ''));
  chk('★断ったときは記録を残さない', log(s).length === 0);
  // 移動の途中で先に足せなかったら、元に戻す
  const s2 = ssb({ failTo: '12' });
  let e2 = null; try { s2.recordStockMove({ kind: '移動', size: '50kg', qty: 10, from: '7', to: '12', name: '野田 太郎' }); } catch (x) { e2 = x.message; }
  chk('★先に足せなかったら元の置場に戻す（片方だけ動いた状態を残さない）', e2 && L(s2, '7').a50 === 300 && L(s2, '12').a50 === 100 && log(s2).length === 0, [e2, L(s2, '7').a50]);
}

console.log('■ 入込場への持ち出し・廃棄');
{
  const s = ssb();
  s.recordStockMove({ kind: '持ち出し', size: '50kg', qty: 100, from: '7', name: '野田 太郎' });
  chk('★持ち出しは置場から引き、先は50k入込場', L(s, '7').a50 === 200 && log(s)[0][7] === '50k入込場', log(s)[0]);
  s.recordStockMove({ kind: '持ち出し', size: '20kg', qty: 10, from: '15', name: '野田 太郎' });
  chk('20kgは20k入込場', log(s)[1][7] === '20k入込場');
  let e = null; try { s.recordStockMove({ kind: '持ち出し', size: '30kg', qty: 1, from: '7', name: '野田 太郎' }); } catch (x) { e = x.message; }
  chk('30kgは入込場が無いので断る', /入込場がありません/.test(e || ''), e);
  e = null; try { s.recordStockMove({ kind: '廃棄', size: '50kg', qty: 3, from: '7', name: '野田 太郎' }); } catch (x) { e = x.message; }
  chk('★廃棄は理由が要る', /理由/.test(e || ''), e);
  s.recordStockMove({ kind: '廃棄', size: '50kg', qty: 3, from: '7', memo: 'へこみ', name: '野田 太郎' });
  chk('★廃棄は置場から引き、理由を残す', L(s, '7').a50 === 197 && log(s)[2][3] === '廃棄' && log(s)[2][8] === 'へこみ' && log(s)[2][7] === '', log(s)[2]);
}

console.log('■ 取り消すと本数が戻る');
{
  const s = ssb();
  let d = s.recordStockMove({ kind: '移動', size: '50kg', qty: 80, from: '7', to: '12', name: '野田 太郎' });
  d = s.cancelStockMove({ id: d.rows[0].id, name: '野田 太郎' });
  chk('★移動の取消：先から引いて元に戻す', L(s, '7').a50 === 300 && L(s, '12').a50 === 100);
  chk('★行は消さずに「取消」と取り消した人', log(s).length === 1 && log(s)[0][9] === '1' && log(s)[0][11] === '野田 太郎' && d.rows[0].canceled, log(s)[0]);
  chk('取り消したものは本数の合計に入れない', !d.totals['移動'], d.totals);
  d = s.cancelStockMove({ id: d.rows[0].id, name: '野田 太郎' });
  chk('二度取り消しても本数は動かない', L(s, '7').a50 === 300 && L(s, '12').a50 === 100);
  d = s.recordStockMove({ kind: '持ち出し', size: '50kg', qty: 50, from: '7', name: '野田 太郎' });
  const id = d.rows.find((r) => r.kind === '持ち出し').id;
  s.cancelStockMove({ id, name: '野田 太郎' });
  chk('★持ち出しの取消：元の置場に戻す', L(s, '7').a50 === 300);
  // 移した先から、もう出てしまっていたら取り消せない
  d = s.recordStockMove({ kind: '移動', size: '50kg', qty: 80, from: '7', to: '12', name: '野田 太郎' });
  const mv = d.rows.find((r) => r.kind === '移動' && !r.canceled).id;
  s.recordStockMove({ kind: '持ち出し', size: '50kg', qty: 150, from: '12', name: '野田 太郎' });
  let e = null; try { s.cancelStockMove({ id: mv, name: '野田 太郎' }); } catch (x) { e = x.message; }
  chk('★移した先にもう無ければ取り消さない（本数を壊さない）', /取り消せません/.test(e || '') && L(s, '7').a50 === 220 && L(s, '12').a50 === 30, [e, L(s, '7').a50, L(s, '12').a50]);
}

console.log('■ 生産の流れからの入庫も作業記録に残る');
{
  const s = ssb();
  s.lot_user_ = () => 'genba@nodagumi40.com';
  s.wstock_logFromLot_('入庫', { サイズ: '50kg', ロットID: 'L001' }, null, L(s, '7'), 80, 'ロット L001 を置いた');
  const d = s.getStockMoves({});
  chk('★入庫として一覧に出る（先・本数・誰が）', d.rows.length === 1 && d.rows[0].kind === '入庫' && d.rows[0].to === '7 大型製缶' && d.rows[0].qty === 80 && d.rows[0].name === 'genba@nodagumi40.com', d.rows);
  let e = null; try { s.cancelStockMove({ id: d.rows[0].id, name: '野田 太郎' }); } catch (x) { e = x.message; }
  chk('★入庫はここでは取り消さない（生産の流れの「打ち間違い」で）', /生産の流れ/.test(e || ''), e);
}

console.log('\n===== ' + T.pass + ' PASS / ' + T.fail + ' FAIL =====');
process.exit(T.fail ? 1 : 0);
