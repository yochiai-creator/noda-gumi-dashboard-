// ヤードマップの一括取得にキャッシュが効いているかを見る。
//
// ★ なぜ要るのか
//   一括取得は依頼NoごとにDriveを検索するので重い。今まで毎回やっていて、
//   ヤードタブを開くたび・区画をタップするたびに待たされていた。
//   「効いているつもり」で効いていないと気づけないので、呼び出し回数で押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  OK  ', name); }
  else { fail++; console.log('  ★NG ', name, extra === undefined ? '' : JSON.stringify(extra)); } };

function build() {
  const store = {};
  const sandbox = {
    console,
    CacheService: { getScriptCache: () => ({
      get: (k) => (store[k] === undefined ? null : store[k]),
      put: (k, v) => { store[k] = v; },
      remove: (k) => { delete store[k]; },
    }) },
    Logger: { log: () => {} },
    Utilities: { formatDate: () => '2026-09-12 00:00' },
    SpreadsheetApp: { openById: () => { throw new Error('呼ばれないはず'); } },
    DriveApp: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(GAS + 'noda_common_cache.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(GAS + 'noda_yard_edit_engine.js', 'utf8'), ctx);
  // 重い本体を、回数を数えるだけのものに差し替える
  sandbox.__calls = 0;
  vm.runInContext(`
    getYardMapUpdatesBothWithOrderText_uncached_ = function () {
      __calls++;
      return { '50k': [{ pos: '1', found: true }], '20k': [] };
    };
  `, ctx);
  return sandbox;
}

console.log('■ 一括取得のキャッシュ');
{
  const s = build();
  s.getYardMapUpdatesBothWithOrderText([], []);
  chk('1回目は本体を呼ぶ', s.__calls === 1, s.__calls);
  s.getYardMapUpdatesBothWithOrderText([], []);
  s.getYardMapUpdatesBothWithOrderText([], []);
  chk('★2回目以降は呼ばない（キャッシュが効く）', s.__calls === 1, s.__calls);

  const a = s.getYardMapUpdatesBothWithOrderText([], []);
  chk('キャッシュからでも中身は同じ', JSON.parse(JSON.stringify(a))['50k'][0].pos === '1', a);
}
{
  const s = build();
  s.getYardMapUpdatesBothWithOrderText([], []);
  s.getYardMapUpdatesBothWithOrderText([], [], true);
  chk('force を渡すと取り直す', s.__calls === 2, s.__calls);
}
{
  const s = build();
  s.getYardMapUpdatesBothWithOrderText([], []);
  chk('（前提）1回だけ呼ばれている', s.__calls === 1, s.__calls);
  // 区画を直したらキャッシュを捨てる
  s.nc_forget_('yardMapBoth');
  s.getYardMapUpdatesBothWithOrderText([], []);
  chk('★キャッシュを捨てると取り直す', s.__calls === 2, s.__calls);
}
{
  // updateYardBlock が本当に捨てているか（書き込みは失敗させてよい）
  const s = build();
  s.getYardMapUpdatesBothWithOrderText([], []);
  const before = s.__calls;
  const r = s.updateYardBlock({ sizeKey: '20k', pos: '1' });
  s.getYardMapUpdatesBothWithOrderText([], []);
  chk('区画の保存に失敗したときはキャッシュを残す',
    r.success === false && s.__calls === before, { r: r.error, calls: s.__calls });
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
