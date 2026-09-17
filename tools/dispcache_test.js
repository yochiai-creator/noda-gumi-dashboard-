// 配車グリッドの「週を変えたときの重さ」を押さえるテスト。
//
// ★ なぜ要るのか
//   週ごとに別キャッシュなので、切り替えるたびにキャッシュ外れになり、
//   そのたびにシート全体の読み取りと出荷実績の索引作りをやり直していた。
//   重いのはこの2つで、どちらも週によらず同じ。1回の読み取りで前後の週まで
//   作って置く、という直しが効いているかをここで見る。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

function build() {
  const store = new Map();
  const sb = {
    Logger: { log: (m) => sb.__logs.push(String(m)) },
    Utilities: { formatDate: () => '2026-09-17 10:00' },
    CacheService: { getScriptCache: () => ({
      get: (k) => (store.has(k) ? store.get(k) : null),
      put: (k, v) => { sb.__puts.push(k); store.set(k, v); },
      remove: (k) => store.delete(k),
      removeAll: (ks) => ks.forEach((k) => store.delete(k)),
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    SpreadsheetApp: {}, DriveApp: {}, Session: { getActiveUser: () => ({ getEmail: () => 'y@x' }) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, isNaN, Boolean, Error,
  };
  sb.__logs = []; sb.__puts = []; sb.__store = store;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_common_cache.js', 'utf8'), sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_dispatch_grid.js', 'utf8'), sb);

  // 重い2つ（シート読み取り・出荷実績の索引）は呼ばれた回数だけ数える
  sb.__ctxCalls = 0;
  sb.dgrid_context_ = () => { sb.__ctxCalls++; return { fake: true }; };
  sb.__weeks = [];
  sb.dgrid_buildWeek_ = (ctx, w) => {
    sb.__weeks.push(w);
    return { weekOffset: w, weekLabel: '週' + w, days: [], trucks: [], totals: {}, error: null };
  };
  return sb;
}

console.log('■ 週を変えたときの読み直し');
{
  const s = build();
  const r = s.getDispatchGridData(false, 0);
  chk('今週が返る', r.weekOffset === 0 && r.weekLabel === '週0', r);
  chk('取り出したてだと分かる', r.cached === false, r);
  chk('★シートの読み取りは1回だけ', s.__ctxCalls === 1, s.__ctxCalls);
  chk('★前後2週ぶんまとめて作る（-2〜+2の5件）',
    s.__weeks.slice().sort((a, b) => a - b).join(',') === '-2,-1,0,1,2', s.__weeks);

  // ここが本題：次の週に切り替えても読み直しが起きない
  const before = s.__ctxCalls;
  const n1 = s.getDispatchGridData(false, 1);
  chk('★次の週はシートを読み直さない', s.__ctxCalls === before, s.__ctxCalls);
  chk('次の週が返る', n1.weekOffset === 1, n1);
  chk('キャッシュから来たと分かる', n1.cached === true, n1);
  s.getDispatchGridData(false, -1);
  s.getDispatchGridData(false, 2);
  s.getDispatchGridData(false, -2);
  chk('★前後2週までは読み直さない', s.__ctxCalls === before, s.__ctxCalls);

  // 3週ぶん先は範囲外なので、そこで1回だけ読み直す
  s.getDispatchGridData(false, 3);
  chk('3週先は読み直す（作っていないので当然）', s.__ctxCalls === before + 1, s.__ctxCalls);
  chk('そのとき作るのは1〜5週（既にある1,2は作り直さない）',
    s.__weeks.filter((w) => w >= 3).sort((a, b) => a - b).join(',') === '3,4,5', s.__weeks);
}

console.log('■ 更新ボタン（force）');
{
  const s = build();
  s.getDispatchGridData(false, 0);
  const before = s.__ctxCalls;
  const r = s.getDispatchGridData(true, 0);
  chk('★forceならキャッシュを無視して取り直す', s.__ctxCalls === before + 1, s.__ctxCalls);
  chk('取り直したものが返る', r.cached === false, r);
}

console.log('■ 読めなかったとき');
{
  const s = build();
  s.dgrid_context_ = () => { throw new Error('シートが読めません'); };
  const r = s.getDispatchGridData(false, 0);
  chk('画面が期待する形で返す',
    r && r.error && Array.isArray(r.days) && Array.isArray(r.trucks) && r.totals, r);
  chk('★エラーはキャッシュしない（次にすぐ試せる）',
    s.__puts.length === 0, s.__puts);
}

console.log('■ 編集したら作り置きも消える');
{
  const s = build();
  s.getDispatchGridData(false, 0);
  chk('5週ぶん置いてある', s.__store.size === 5, s.__store.size);
  // 矢印で先の週まで見ていくと、作り置きは前後に伸びる
  s.getDispatchGridData(false, 9);
  chk('先の週まで見ると作り置きが増える', s.__store.size > 5, s.__store.size);
  s.dgrid_forgetAll_();
  chk('★編集したら作り置きを1つ残らず捨てる（古い数字を出さない）',
    s.__store.size === 0, [...s.__store.keys()]);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
