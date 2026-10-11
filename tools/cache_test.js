// 共通キャッシュ（分けて置く）と、キャッシュの先読みのテスト。
//
// ★ なぜ要るのか
//   ・90,000文字を超えるデータは一度もキャッシュされず、開くたびに作り直していた。
//     日本語は1文字3バイトなので、それ未満でも置けていないことがあった。
//   ・キャッシュの期限（5〜15分）が開く間隔より短く、ほぼ毎回作り直していた。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 200) : '')); } };

// 本物と同じく、1つの値が100KB（UTF-8）を超えたら例外にする
function fakeCache() {
  const store = {};
  const ttl = {};
  const bytes = (s) => Buffer.byteLength(s, 'utf8');
  const c = {
    store, ttl, maxBytes: 0,
    put(k, v, t) { if (bytes(v) > 100 * 1024) throw new Error('Argument too large'); store[k] = v; ttl[k] = t;
      c.maxBytes = Math.max(c.maxBytes, bytes(v)); },
    putAll(m, t) { Object.keys(m).forEach((k) => c.put(k, m[k], t)); },
    get(k) { return k in store ? store[k] : null; },
    getAll(ks) { const o = {}; ks.forEach((k) => { if (k in store) o[k] = store[k]; }); return o; },
    remove(k) { delete store[k]; },
    removeAll(ks) { ks.forEach((k) => delete store[k]); },
  };
  return c;
}

function sb(cache) {
  const s = {
    Logger: { log: (m) => s.__logs.push(String(m)) },
    CacheService: { getScriptCache: () => cache },
    JSON, Object, Number, String, Math, Date, Array, isNaN, Error, Infinity,
  };
  s.__logs = [];
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(GAS + 'noda_common_cache.js', 'utf8'), s);
  return s;
}

console.log('■ 小さいものは今までどおり1つで置く');
{
  const c = fakeCache(); const s = sb(c);
  chk('置ける', s.nc_put_('a', { n: 1, 名前: '在庫' }, 600) === true);
  const h = s.nc_peek_('a');
  chk('取り出せる', h && h.n === 1 && h.名前 === '在庫', h);
  chk('cached が付く', h.cached === true);
  chk('キーは1つだけ', Object.keys(c.store).length === 1, Object.keys(c.store));
}

console.log('■ 大きいもの（日本語）は分けて置く');
{
  const c = fakeCache(); const s = sb(c);
  const rows = [];
  for (let i = 0; i < 6000; i++) rows.push({ 位置: i, 依頼No: '26-6' + i, 出荷先: '鳥取県倉吉市の出荷先' + i });
  const big = { rows };
  const len = JSON.stringify(big).length;
  chk('前提：90,000文字を超える大きさ', len > 90000, len);
  chk('★置ける', s.nc_put_('big', big, 1500) === true, s.__logs);
  const h = s.nc_peek_('big');
  chk('★そのまま取り出せる', h && h.rows.length === 6000 && h.rows[5999].出荷先 === '鳥取県倉吉市の出荷先5999');
  chk('★どの値も100KBを超えない', c.maxBytes <= 100 * 1024, c.maxBytes);
  chk('切れ端は目印より少し長く残す', Object.keys(c.ttl).some((k) => k.indexOf('#') > 0 && c.ttl[k] > 1500));

  // 置き直したら新しいほうが出る（前の切れ端と混ざらない）
  rows[0].出荷先 = '置き直した';
  s.nc_put_('big', { rows }, 1500);
  chk('★置き直すと新しいほうが出る', s.nc_peek_('big').rows[0].出荷先 === '置き直した');

  // 切れ端が1つ欠けたら無かったことにする
  const k = Object.keys(c.store).filter((x) => x.indexOf('#') > 0).pop();
  delete c.store[k];
  chk('★切れ端が欠けたらキャッシュ無し扱い', s.nc_peek_('big') === null);
}

console.log('■ 文字列のまま返すもの（ヤードマップ）');
{
  const c = fakeCache(); const s = sb(c);
  const str = JSON.stringify({ '50k': new Array(3000).fill({ pos: '1', 依頼: '入込場の区画' }) });
  s.nc_put_('yardMapBoth', str, 1500);
  chk('★文字列のまま取り出せる', s.nc_peek_('yardMapBoth') === str);
}

console.log('■ 絵文字（サロゲートペア）を切れ目で割らない');
{
  const c = fakeCache(); const s = sb(c);
  const parts = s.nc_splitChunks_('a' + '😀'.repeat(20), 4);
  chk('割った結果をつなぐと元どおり', parts.join('') === 'a' + '😀'.repeat(20));
  chk('どの切れ端も半端な文字で終わらない', parts.every((p) => { const x = p.charCodeAt(p.length - 1); return !(x >= 0xD800 && x <= 0xDBFF); }), parts);
}

console.log('■ 置かないもの・捨てる');
{
  const c = fakeCache(); const s = sb(c);
  chk('エラーは置かない', s.nc_put_('e', { error: 'x' }, 60) === false);
  const huge = 'あ'.repeat(30000 * 41);
  chk('大きすぎるもの（40切れ超）は置かない', s.nc_put_('h', huge, 60) === false);
  s.nc_put_('f', { rows: new Array(5000).fill('出荷先の名前') }, 60);
  s.nc_forget_('f');
  chk('捨てたら無い', s.nc_peek_('f') === null);
}

// ===== 先読み =====
function wsb(hour, props) {
  const s = sb(fakeCache());
  const called = [];
  const triggers = [];
  Object.assign(s, {
    Utilities: { formatDate: (d, tz, f) => (f === 'H' ? String(hour) : '') },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((h) => ({ getHandlerFunction: () => h })),
      newTrigger: (h) => ({ timeBased: () => ({ everyMinutes: (m) => ({ create: () => triggers.push(h) }) }) }),
    },
  });
  const g = (name, ret) => (...a) => { called.push(name + (a[0] === true ? '' : '(force無し)')); return ret || { updated: 'x', error: null }; };
  s.getInventoryDashboardData = g('在庫');
  s.getShippingDashboardData = g('指図書');
  s.getOrderPlanDashboardData = g('受注出荷計画');
  s.getDispatchTodayData = g('当日の配車');
  s.getInventoryTrendData = g('在庫推移');
  s.getMonthlyCombinedData = g('月次');
  s.getDispatchGridData = g('配車表');
  s.getArmShipPlan = g('アーム予定');
  s.getArmMonthlyData = g('アーム月別', { error: '読めない' });
  s.getYardMapUpdatesBothWithOrderText = (q50, q20, f) => { called.push('ヤードマップ' + (f ? '' : '(force無し)') + ':' + q50.length + '/' + q20.length); return '{"50k":[]}'; };
  s.yard_readRefRows_ = (k) => (k === '50k' ? [{ pos: 1 }, { pos: 2 }] : [{ pos: 'A' }]);
  s.getProdPlanData = g('生産計画');
  vm.runInContext(fs.readFileSync(GAS + 'noda_cache_warm.js', 'utf8'), s);
  s.__called = called; s.__triggers = triggers;
  return s;
}

console.log('■ 先読み：時間帯');
{
  const s = wsb(22, {});
  chk('★夜（22時）は回さない', s.warmDashboardCaches().skipped === '時間外' && s.__called.length === 0);
  const s5 = wsb(5, {});
  chk('5時も回さない', s5.warmDashboardCaches().skipped === '時間外');
  const s6 = wsb(6, {});
  s6.warmDashboardCaches();
  chk('6時から回す', s6.__called.length === 11, s6.__called);
}

console.log('■ 先読み：何を作り直すか');
{
  const props = {};
  const s = wsb(9, props);
  const r = s.warmDashboardCaches();
  chk('★1回目は全部作り直す（11本）', s.__called.length === 11, s.__called);
  chk('★どれもキャッシュを無視して作り直す', s.__called.every((x) => x.indexOf('force無し') < 0), s.__called);
  chk('★ヤードマップには索引の位置を全部渡す', s.__called.indexOf('ヤードマップ:2/1') >= 0, s.__called);
  chk('エラーは記録に出す', r.items.find((x) => x.name === 'アーム月別').error === '読めない');

  // 10分後：1日1回しか変わらないものは作り直さない。エラーだったものは作り直す
  const s2 = wsb(9, props);
  s2.warmDashboardCaches();
  const c2 = s2.__called.map((x) => x.split(':')[0]);
  chk('★すぐ変わるものは毎回', ['指図書', '当日の配車', '配車表', 'アーム予定', 'ヤードマップ'].every((n) => c2.indexOf(n) >= 0), c2);
  chk('★1日1回のものは作ったばかりなら飛ばす', ['在庫', '受注出荷計画', '在庫推移', '月次', '生産計画'].every((n) => c2.indexOf(n) < 0), c2);
  chk('★前回エラーだったものは作り直す', c2.indexOf('アーム月別') >= 0, c2);

  // 30分経てば1日1回のものも作り直す
  const at = JSON.parse(props['warm.builtAt']);
  Object.keys(at).forEach((k) => { at[k] -= 30 * 60000; });
  props['warm.builtAt'] = JSON.stringify(at);
  const s3 = wsb(9, props);
  s3.warmDashboardCaches();
  chk('★30分経てば全部', s3.__called.length === 11, s3.__called);
}

console.log('■ 先読み：トリガー');
{
  const s = wsb(9, {});
  chk('★無ければ張る', s.warm_ensureTrigger_() === true && s.__triggers[0] === 'warmDashboardCaches');
  chk('★あれば張らない（二重にしない）', s.warm_ensureTrigger_() === false && s.__triggers.length === 1);
}

console.log('■ 期限は先読みの間隔より長い');
{
  const src = (f) => fs.readFileSync(GAS + f, 'utf8');
  const ttl = (f, re) => { const m = src(f).match(re); return m ? Number(m[1]) : null; };
  const fast = [
    ['noda_shipping_engine.js', /nc_cached_\('shipping', force, (\d+)/],
    ['noda_dispatch_engine.js', /nc_cached_\('dispatch', force, (\d+)/],
    ['noda_yard_edit_engine.js', /nc_cached_\('yardMapBoth', force === true, (\d+)/],
    ['noda_arm_ship.js', /nc_cached_\('armPlan', force === true, (\d+)/],
    ['noda_dispatch_grid.js', /var DGRID_TTL = (\d+)/],
  ];
  fast.forEach(([f, re]) => { const t = ttl(f, re); chk('すぐ変わるもの ' + f + ' は10分＋余裕より長い（' + t + '秒）', t >= 20 * 60, t); });
  const slow = [
    ['Noda inventory engine.js', /nc_cached_\('inventory', force, (\d+)/],
    ['noda_orderplan_engine.js', /nc_cached_\('orderPlan', force, (\d+)/],
    ['noda_inventory_history.js', /nc_cached_\('inventoryTrend', force, (\d+)/],
    ['noda_monthly_combined.js', /nc_cached_\('monthlyCombined', force, (\d+)/],
    ['noda_arm_ship.js', /nc_cached_\('armMonthly', force === true, (\d+)/],
    ['noda_prod_plan.js', /TTL: (\d+)/],
  ];
  slow.forEach(([f, re]) => { const t = ttl(f, re); chk('1日1回のもの ' + f + ' は35分より長い（' + t + '秒）', t >= 35 * 60, t); });
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
