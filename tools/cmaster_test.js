// 容器の機種マスタ（在庫照会CSVの取り込み）のテスト。
//
// ★ なぜ要るのか
//   CSVは Shift_JIS・全角まじり。分類から置場の列（20/30/50）を決めるところと、
//   置場の列が無いサイズ（2K・5K・8K・10K）を空にするところを間違えると、
//   生産ロットが在庫を壊す。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

function build(csvRows, files) {
  const sheetRows = [];
  const sheet = {
    getLastRow: () => (sheetRows.length === 0 ? 1 : sheetRows.length + 1),
    setFrozenRows: () => {},
    getRange: (rr, c, nr, nc) => ({
      getValues: () => sheetRows.slice(rr - 2, rr - 2 + nr).map((x) => x.slice(c - 1, c - 1 + nc)),
      setValues: (v) => { v.forEach((row, i) => { sheetRows[rr - 2 + i] = row.slice(); }); },
      clearContent: () => { sheetRows.length = 0; },
      setFontWeight: () => {},
    }),
  };
  const ss = { getSheetByName: (n) => (n === '機種' ? sheet : null), insertSheet: () => sheet };
  const list = (files || [{ name: '容器在庫照会(26.9.16E)分.csv', updated: new Date('2026-09-16T23:00:00Z') }]);
  const sb = {
    Logger: { log: (m) => sb.__logs.push(String(m)) },
    Utilities: {
      formatDate: () => '2026-09-17 08:00',
      parseCsv: () => (csvRows || []).map((r) => r.slice()),
    },
    DriveApp: { getFolderById: () => ({ getFiles: () => {
      let i = 0;
      return { hasNext: () => i < list.length, next: () => {
        const f = list[i++];
        return { getName: () => f.name, getLastUpdated: () => f.updated,
                 getBlob: () => ({ getDataAsString: (cs) => { sb.__charset = cs; return 'dummy'; } }) };
      } };
    } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, isNaN, Boolean, Error,
  };
  sb.__logs = []; sb.__sheet = sheetRows; sb.__charset = null;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_common_cache.js', 'utf8'), sb);
  vm.runInContext(fs.readFileSync(GAS + 'noda_container_master.js', 'utf8'), sb);
  sb.yardGetSpreadsheet_ = () => ss;
  return sb;
}

// 実ファイル（26.9.16E）の並びどおりの行
const HEAD = ['倉庫', '営業拠点', 'O.No.', 'O.No.', '分類', '分類', '刻印月', '容器 番号', '容器 番号',
              '本社出荷日', '実在庫数', '引当済数', '引当可能数', '仕様', 'バルブ', '刻印月ソート用'];
const row = (soko, code, name, bcode, bunrui, n) =>
  [soko, soko, code, name, bcode, bunrui, "'26/09", 'HEP1', 'HEP2', '', '', '', n, '－－－', '浜井', '202609'];

console.log('■ CSVから機種をまとめる');
{
  const s = build([
    HEAD,
    row('本社', '123', '新軽量１１８Ｌ（５０ｋｇ）ＬＰガス容器', '012', '５０Ｋ　ＬＰＧ容器', 100),
    row('本社', '123', '新軽量１１８Ｌ（５０ｋｇ）ＬＰガス容器', '012', '５０Ｋ　ＬＰＧ容器', 65),
    row('本社', '165', '８７Ｌ（２０ｋｇ）ＬＰガス容器（直付）', '009', '２０Ｋ　ＬＰＧ容器（直付）', 50),
    row('倉吉', '165', '８７Ｌ（２０ｋｇ）ＬＰガス容器（直付）', '009', '２０Ｋ　ＬＰＧ容器（直付）', 30),
    row('本社', '113', '２４Ｌ（１０ｋｇ）ＬＰガス容器（ＰＴ直付）', '004', '１０Ｋ　ＬＰＧ容器', 113),
    ['短い行'],                                       // 桁足らずは落とす
  ]);
  const r = s.harvestContainerMaster();
  chk('取り込める', r.ok === true, r);
  chk('★Shift_JISで読む', s.__charset === 'Shift_JIS', s.__charset);
  chk('見出し行と短い行は数えない', r.行 === 5, r);

  const types = s.getContainerTypes().types;
  const by = {}; types.forEach((t) => { by[t.コード] = t; });
  chk('機種は3件', types.length === 3, types.map((t) => t.コード));
  chk('★同じ機種の本数を足す', by['123'].在庫本数 === 165, by['123']);
  chk('★倉庫をまたいでも1件にまとめ、倉庫数を数える',
    by['165'].在庫本数 === 80 && by['165'].倉庫数 === 2, by['165']);
  chk('コード順に並ぶ', types.map((t) => t.コード).join(',') === '113,123,165',
    types.map((t) => t.コード));
  chk('全角の空白を整える', by['123'].分類 === '５０Ｋ ＬＰＧ容器', by['123'].分類);
}

console.log('■ 分類から置場の列を決める');
{
  const s = build([]);
  const f = s.cmst_sizeOf_;
  chk('５０Ｋ → 50kg', f('５０Ｋ　ＬＰＧ容器') === '50kg', f('５０Ｋ　ＬＰＧ容器'));
  chk('５０Ｋ（Ｓ） → 50kg', f('５０Ｋ　ＬＰＧ容器（Ｓ）') === '50kg');
  chk('３０Ｋ → 30kg', f('３０Ｋ　ＬＰＧ容器') === '30kg');
  chk('２０Ｋ（直付） → 20kg', f('２０Ｋ　ＬＰＧ容器（直付）') === '20kg');
  chk('半角で書かれていても読める', f('50K LPG') === '50kg', f('50K LPG'));
  chk('★１０Ｋは置場の列が無いので空', f('１０Ｋ　ＬＰＧ容器') === '', f('１０Ｋ　ＬＰＧ容器'));
  chk('★５Ｋも空', f('５Ｋ　ＬＰＧ容器') === '');
  chk('★８Ｋも空', f('８Ｋ　ＬＰＧ容器') === '');
  chk('★２Ｋも空', f('２Ｋ　ＬＰＧ容器') === '');
  chk('読めなければ空', f('') === '' && f('なにか') === '');
}

console.log('■ 一番新しいCSVを選ぶ');
{
  const s = build([]);
  chk('名前から日付を読む',
    s.cmst_dateKeyFromName_('容器在庫照会(26.9.16E)分.csv') === 20260916,
    s.cmst_dateKeyFromName_('容器在庫照会(26.9.16E)分.csv'));
  chk('1桁の月日も読める', s.cmst_dateKeyFromName_('容器在庫照会(26.9.4E)分.csv') === 20260904);
  chk('読めなければ -1', s.cmst_dateKeyFromName_('メモ.csv') === -1);
}
{
  /* ★ 更新日時ではなく名前の日付で選ぶ。古いファイルを開き直しただけで
        更新日時が新しくなることがある（アームの日程表で実際に起きた）。 */
  const s = build([HEAD, row('本社', '123', 'x', '012', '５０Ｋ', 1)], [
    { name: '容器在庫照会(26.9.10E)分.csv', updated: new Date('2026-09-20T00:00:00Z') },
    { name: '容器在庫照会(26.9.16E)分.csv', updated: new Date('2026-09-16T23:00:00Z') },
    { name: 'よその資料.xlsx', updated: new Date('2026-12-01T00:00:00Z') },
  ]);
  const r = s.harvestContainerMaster();
  chk('★名前の日付が一番新しいものを使う', /26\.9\.16E/.test(r.file), r.file);
  chk('★CSV以外は拾わない', !/xlsx/.test(r.file), r.file);
}
{
  const s = build([], []);
  const r = s.harvestContainerMaster();
  chk('CSVが1つも無ければ理由を返す', r.ok === false && /見つかりません/.test(r.error), r);
}
{
  const s = build([]);
  chk('まだ取り込んでいなければ理由を返す',
    /取り込んでいません/.test(String(s.getContainerTypes().error)), s.getContainerTypes().error);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
