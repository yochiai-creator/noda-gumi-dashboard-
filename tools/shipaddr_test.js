// 出荷先住所の貯め込み（shipact_fillDestAddresses_）と索引づくりのテスト。
// 出荷先コード1つにつきPDFを1回しか読まないこと、読めなかったコードを
// 毎晩読み直さないことを確かめる。
const fs = require('fs'), vm = require('vm');
const GAS = __dirname + '/../gas/';
let pass = 0, fail = 0;
const check = (l, c, e) => { if (c) { pass++; console.log('  OK   ' + l); } else { fail++; console.log('  FAIL ' + l + (e ? '  -> ' + e : '')); } };

function mkAct(a) {
  const r = new Array(25).fill('');
  r[0] = a.fileId; r[1] = '出荷作業指図書_x.pdf'; r[3] = a.no; r[4] = a.branch == null ? 0 : a.branch;
  r[5] = a.ver == null ? 0 : a.ver; r[6] = a.date; r[9] = a.size || '50kg'; r[10] = a.qty == null ? 0 : a.qty;
  r[18] = a.code;
  if (a.addr) { r[22] = a.addr; r[23] = a.pref; r[24] = a.city; }
  return r;
}

// texts: fileId → PDFの本文テキスト（null なら読めない）
function build(rows, texts, props0) {
  const store = rows.map((r) => r.slice());
  const reads = [];
  const sheet = {
    getLastRow: () => (store.length === 0 ? 1 : store.length + 1),
    getLastColumn: () => 25, getMaxColumns: () => 26, setFrozenRows: () => {},
    getParent: () => ss,
    getRange: (r, c, nr, nc) => ({
      getValues: () => store.slice(r - 2, r - 2 + nr).map((x) => x.slice(c - 1, c - 1 + nc)),
      setValues: (v) => {
        v.forEach((row, i) => row.forEach((val, j) => { store[r - 2 + i][c - 1 + j] = val; }));
      },
      setFontWeight: () => {},
    }),
  };
  const ss = { getSheetByName: () => sheet, insertSheet: () => sheet, getSheets: () => [sheet],
               getUrl: () => 'u', getId: () => 'SS' };
  const props = Object.assign({ 'shipActuals.sheetId': 'SS' }, props0 || {});
  const sb = {
    Logger: { log: (m) => sb.__logs.push(String(m)) },
    Utilities: { formatDate: (d, tz, f) => {
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    } },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: (k) => { delete props[k]; },
    }) },
    SpreadsheetApp: { openById: () => ss, create: () => ss },
    DriveApp: { getFileById: (id) => ({ getId: () => id, getName: () => id + '.pdf',
                                        getBlob: () => ({ id: id }) }) },
    Drive: { Files: { create: (meta, blob) => { reads.push(blob.id); return { id: 'TMP_' + blob.id }; },
                      remove: () => {} } },
    DocumentApp: { openById: (tid) => {
      const fid = String(tid).replace(/^TMP_/, '');
      const t = texts[fid];
      if (t == null) throw new Error('読めない');
      return { getBody: () => ({ getText: () => t }) };
    } },
    ScriptApp: { getProjectTriggers: () => [] },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, parseInt, isNaN, Boolean, Error,
  };
  sb.__logs = []; sb.__store = store; sb.__props = props; sb.__reads = reads;
  vm.createContext(sb);
  for (const f of ['noda_common_cache.js', 'noda_ship_actuals_engine.js']) {
    vm.runInContext(fs.readFileSync(GAS + f, 'utf8'), sb);
  }
  return sb;
}

const YAMAGA = '出荷先:100 ○○商事\n熊本県山鹿市鹿央町1-2\n数量: 50 本\n熊本県山鹿市鹿央町1-2';
const HAMURA = '出荷先:200 △△ガス\n東京都羽村市神明台4-5\n数量: 20 本\n東京都羽村市神明台4-5';

console.log('■ 出荷先コードごとに1回だけPDFを読む');
{
  const s = build([
    mkAct({ fileId: 'F1', no: '26-1', date: '2026-09-10', code: '100' }),
    mkAct({ fileId: 'F2', no: '26-2', date: '2026-09-11', code: '100' }),   // 同じ出荷先
    mkAct({ fileId: 'F3', no: '26-3', date: '2026-09-11', code: '200' }),
  ], { F1: YAMAGA, F2: YAMAGA, F3: HAMURA });
  const r = s.shipact_fillDestAddresses_(60 * 1000);
  check('2件入る', r.filled === 2, JSON.stringify(r));
  check('★同じ出荷先コードのPDFは1回しか読まない', s.__reads.length === 2, JSON.stringify(s.__reads));
  check('住所が書き込まれる', s.__store[0][24] === '山鹿市', JSON.stringify(s.__store[0].slice(22)));
  check('都道府県も入る', s.__store[0][23] === '熊本県', s.__store[0][23]);
  check('2件目の出荷先も入る', s.__store[2][24] === '羽村市', s.__store[2][24]);
  check('同じコードの2行目は空のまま（索引には要らない）', s.__store[1][24] === '', s.__store[1][24]);
}

console.log('■ すでに住所が入っている出荷先は読まない');
{
  const s = build([
    mkAct({ fileId: 'F1', no: '26-1', date: '2026-09-10', code: '100',
            addr: '熊本県山鹿市鹿央町', pref: '熊本県', city: '山鹿市' }),
    mkAct({ fileId: 'F2', no: '26-2', date: '2026-09-11', code: '100' }),
  ], { F1: YAMAGA, F2: YAMAGA });
  const r = s.shipact_fillDestAddresses_(60 * 1000);
  check('読みに行かない', s.__reads.length === 0, JSON.stringify(s.__reads));
  check('残りは0件', r.remaining === 0 && r.done === true, JSON.stringify(r));
}

console.log('■ 読めなかった出荷先は二度と読み直さない');
{
  const s = build([
    mkAct({ fileId: 'F1', no: '26-1', date: '2026-09-10', code: '100' }),
    mkAct({ fileId: 'F2', no: '26-2', date: '2026-09-11', code: '200' }),
  ], { F1: null, F2: HAMURA });   // F1 は読めない
  const r1 = s.shipact_fillDestAddresses_(60 * 1000);
  check('読めた1件だけ入る', r1.filled === 1 && r1.failed === 1, JSON.stringify(r1));
  const before = s.__reads.length;
  const r2 = s.shipact_fillDestAddresses_(60 * 1000);
  check('★2回目は読めなかったPDFを読み直さない', s.__reads.length === before, JSON.stringify(s.__reads));
  check('2回目は何も増えない', r2.filled === 0 && r2.remaining === 0, JSON.stringify(r2));
}

console.log('■ 索引を作る');
{
  const s = build([
    mkAct({ fileId: 'F1', no: '26-10660', branch: 0, ver: 0, date: '2026-09-14', code: '100',
            addr: '熊本県山鹿市鹿央町', pref: '熊本県', city: '山鹿市' }),
    // 同じ依頼No・枝番のバージョン違い → 大きいほうが正
    mkAct({ fileId: 'F2', no: '26-10660', branch: 0, ver: 2, date: '2026-09-14', code: '100' }),
    mkAct({ fileId: 'F3', no: '26-10661', branch: 0, ver: 0, date: '2026-09-14', code: '200',
            addr: '東京都羽村市神明台', pref: '東京都', city: '羽村市' }),
  ], {});
  const idx = s.shipact_index_();
  check('★バージョンの大きいほうを採る', idx.byOrder['26-10660'].fileId === 'F2',
    JSON.stringify(idx.byOrder['26-10660']));
  check('年度を外した番号でも引ける', idx.byOrder['10660'].fileId === 'F2',
    JSON.stringify(idx.byOrder['10660']));
  check('出荷希望日ごとに並ぶ', idx.byDate['2026-09-14'].length === 2,
    JSON.stringify(idx.byDate['2026-09-14'] && idx.byDate['2026-09-14'].map((e) => e.no)));
  check('出荷先コードから住所が引ける', idx.addrByCode['100'].city === '山鹿市',
    JSON.stringify(idx.addrByCode));
  check('2回呼んでも作り直さない', s.shipact_index_() === idx);
  check('リンクの形', s.shipact_fileUrl_('F2') === 'https://drive.google.com/file/d/F2/view');
  check('日付は M/D にする', s.shipact_shortDate_('2026-09-14') === '9/14', s.shipact_shortDate_('2026-09-14'));
  check('日付が無ければnull', s.shipact_shortDate_('') === null);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
