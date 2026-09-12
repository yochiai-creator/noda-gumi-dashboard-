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

console.log('■ 依頼Noの拾い方');
{
  const s = build();
  const ex = s.yard_extractOrderNumbers_;
  /* ★ 年度の頭（26-）を落としていたので、画面では一律「26-」を付けて表示し、
       PDF検索も数字だけで探していた（別の年度の同じ番号を拾える）。 */
  chk('年度の頭を付けたまま拾う', JSON.stringify(ex('依頼No.26-30425(10)')) === '["26-30425"]',
    JSON.stringify(ex('依頼No.26-30425(10)')));
  chk('24年度の区画は24-のまま', JSON.stringify(ex('依頼No.24-10555')) === '["24-10555"]',
    JSON.stringify(ex('依頼No.24-10555')));
  chk('★2件目の年度が省かれていたら引き継ぐ',
    JSON.stringify(ex('依頼No.26-70261，60683')) === '["26-70261","26-60683"]',
    JSON.stringify(ex('依頼No.26-70261，60683')));
  chk('番号が入っていない行は空', JSON.stringify(ex('依頼No.26-')) === '[]', JSON.stringify(ex('依頼No.26-')));
  chk('同じ番号は1つにまとめる',
    JSON.stringify(ex('26-30425 26-30425')) === '["26-30425"]', JSON.stringify(ex('26-30425 26-30425')));
  chk('括弧の中の小さい数字は拾わない',
    JSON.stringify(ex('依頼No.26-60639(3/13)')) === '["26-60639"]', JSON.stringify(ex('依頼No.26-60639(3/13)')));
  chk('空文字でも落ちない', JSON.stringify(ex('')) === '[]', JSON.stringify(ex('')));
}

console.log('■ PDFの日付');
{
  const s = build();
  const d = s.yard_pdfDateFromName_;
  chk('ファイル名から日付を取る', d('出荷作業指図書_26.08.21_26-30425-0(1).pdf') === '8/21',
    d('出荷作業指図書_26.08.21_26-30425-0(1).pdf'));
  chk('1桁の月日も取れる', d('出荷作業指図書_26.9.3_26-1.pdf') === '9/3', d('出荷作業指図書_26.9.3_26-1.pdf'));
  chk('日付が無い名前は null', d('指図書.pdf') === null, d('指図書.pdf'));
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
