// 作業の記録（出荷済）と出荷の進捗のテスト（サーバ側）。
// ★ 押した記録は消さない・二度押ししない・誰が押したか残る、を押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e).slice(0, 400) : '')); } };

// ---- 偽のスプレッドシート（値は2次元配列で持つ） ----
function fakeSheet(name, rows) {
  const sh = { name, rows: rows || [], frozen: 0 };
  const ensure = (r, c) => { while (sh.rows.length < r) sh.rows.push([]); sh.rows.forEach((x) => { while (x.length < c) x.push(''); }); };
  sh.getRange = (r, c, nr, nc) => ({
    setValues: (v) => { ensure(r + v.length - 1, c + v[0].length - 1); v.forEach((row, i) => row.forEach((x, j) => { sh.rows[r - 1 + i][c - 1 + j] = x; })); return sh.getRange(r, c, nr, nc); },
    setFontWeight: () => sh.getRange(r, c, nr, nc),
    setNumberFormat: () => sh.getRange(r, c, nr, nc),
  });
  sh.setFrozenRows = (n) => { sh.frozen = n; };
  sh.getMaxRows = () => 1000;
  sh.getLastRow = () => sh.rows.length;
  sh.getDataRange = () => ({ getValues: () => sh.rows.map((r) => r.slice()) });
  return sh;
}
function fakeSS(sheets) {
  return {
    sheets,
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = fakeSheet(n); return sheets[n]; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/YARD/edit',
  };
}

const ACT_H = ['fileId', 'ファイル名', '処理日', '依頼No', '枝番', 'バージョン', '出荷希望日', '年月', '品名', 'サイズ', '数量', 'レンジ本数', '検算',
  'GNo開始', 'GNo終了', '容器接頭辞', '容器No開始', '容器No終了', '出荷先コード', '出荷先名', '刻印月', '取込日時', '住所', '都道府県', '市区町村'];
const act = (o) => ACT_H.map((h) => (o[h] != null ? o[h] : ''));

function sb(opt) {
  const o = opt || {};
  const today = o.today || '2026-10-28';
  const yardSS = fakeSS(o.yardSheets || {});
  const actSheet = fakeSheet('実績', [ACT_H].concat(o.actRows || []));
  const store = {};
  let uuid = 0;
  const s = {
    Logger: { log() {} }, JSON, Object, Number, String, Math, Date, Array, RegExp, Error, isNaN,
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = (n) => String(n).padStart(2, '0');
        // 今日は固定（テストの日付）。日付の足し引きは Date.now をずらして作るので、差だけ使う
        const base = new Date(today + 'T12:00:00Z').getTime();
        const x = new Date(base + (d.getTime() - s.__now));
        const ymd = x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate());
        return f === 'yyyy-MM-dd' ? ymd : ymd + ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes());
      },
      getUuid: () => 'id' + String(++uuid).padStart(6, '0') + '-x',
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => o.email || 'genba@nodagumi40.com' }) },
    CacheService: { getScriptCache: () => ({ get: (k) => store[k] || null, put: (k, v) => { store[k] = v; }, remove: (k) => { delete store[k]; }, getAll: (ks) => { const r = {}; ks.forEach((k) => { if (store[k]) r[k] = store[k]; }); return r; }, putAll: (m) => Object.assign(store, m) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  };
  s.__now = Date.now();
  vm.createContext(s);
  for (const f of ['noda_common_cache.js', 'noda_work.js']) vm.runInContext(fs.readFileSync(GAS + f, 'utf8'), s);
  s.yardGetSpreadsheet_ = () => yardSS;
  s.shipact_getSheet_ = () => actSheet;
  s.YCHK_CONFIG = { STATE_BEFORE: 'チェック前', STATE_DONE: 'チェック済' };
  s.ychk_entries_ = () => o.entries || [];
  s.__yard = yardSS;
  return s;
}

const ROWS = [
  act({ fileId: 'F1', 依頼No: '26-60846', 枝番: '0', バージョン: '1', 出荷希望日: '2026-10-28', サイズ: '50kg', 数量: '2', 出荷先名: '西日本液化 萩', 取込日時: '2026-10-23 1:00' }),
  act({ fileId: 'F2', 依頼No: '26-30575', 枝番: '0', バージョン: '2', 出荷希望日: '2026-10-30', サイズ: '50kg', 数量: '3', 出荷先名: 'ミツウロコ', 取込日時: '2026-10-23 1:00' }),
  act({ fileId: 'F3', 依頼No: '26-10335', 枝番: '0', バージョン: '1', 出荷希望日: '2026-10-27', サイズ: '20kg', 数量: '5', 出荷先名: 'イワタニ四国', 取込日時: '2026-10-22 1:00' }),
  // 範囲の外（古い・先すぎる）は出さない
  act({ fileId: 'F4', 依頼No: '26-10001', 枝番: '0', バージョン: '1', 出荷希望日: '2026-10-01', サイズ: '20kg', 数量: '5', 取込日時: '2026-09-30 1:00' }),
  act({ fileId: 'F5', 依頼No: '26-10002', 枝番: '0', バージョン: '1', 出荷希望日: '2026-12-01', サイズ: '20kg', 数量: '5', 取込日時: '2026-10-20 1:00' }),
  // 同じ指図書を取り込み直した行（新しいほうを採る）
  act({ fileId: 'F2b', 依頼No: '26-30575', 枝番: '0', バージョン: '2', 出荷希望日: '2026-10-30', サイズ: '50kg', 数量: '3', 出荷先名: 'ミツウロコ東関東', 取込日時: '2026-10-24 1:00' }),
];
const ENTRIES = [
  { orderNo: '26-60846', eda: 0, ver: 1, state: 'チェック前', url: 'https://copy/60846', fileId: 'COPY1' },
  { orderNo: '26-30575', eda: 0, ver: 2, state: 'チェック済', url: 'https://done/30575', fileId: 'DONE2' },
];

console.log('■ 指図書の一覧（実績シートから）');
{
  const s = sb({ actRows: ROWS, entries: ENTRIES });
  const d = s.getShipProgress();
  chk('エラーなし', !d.error, d.error);
  const keys = d.days.map((g) => g.date + ':' + g.items.map((o) => o.key).join(','));
  chk('★出荷希望日ごと（範囲の外は出さない）', JSON.stringify(keys) === JSON.stringify(['2026-10-27:26-10335-0(1)', '2026-10-28:26-60846-0(1)', '2026-10-30:26-30575-0(2)']), keys);
  const it = (k) => d.days.reduce((a, g) => a.concat(g.items), []).find((o) => o.key === k);
  chk('★取り込み直した行は新しいほう（出荷先名）', it('26-30575-0(2)').dest === 'ミツウロコ東関東', it('26-30575-0(2)'));
  chk('★チェック前・チェック済を付ける', it('26-60846-0(1)').check === 'チェック前' && it('26-30575-0(2)').check === 'チェック済');
  chk('★チェック前は書き込みアプリで開くファイルID', it('26-60846-0(1)').fileId === 'COPY1' && it('26-30575-0(2)').fileId === null);
  chk('20kgはチェックの状態なし', it('26-10335-0(1)').check === null);
  chk('指図書のPDFのURL', it('26-10335-0(1)').url === 'https://drive.google.com/file/d/F3/view');
  const g27 = d.days[0], g28 = d.days[1];
  chk('★過ぎた日・今日の印', g27.past === true && g28.today === true && !g28.past, [g27.past, g28.today]);
  chk('日ごとの枚数と本数', g28.count === 1 && g28.qty === 2);
  chk('★出荷希望日の当日・過ぎた日は押さなくても出荷済（auto）', it('26-60846-0(1)').shipped && it('26-60846-0(1)').shipped.auto === true &&
    it('26-10335-0(1)').shipped && it('26-10335-0(1)').shipped.auto === true && g28.shippedN === 1 && g27.shippedN === 1, [it('26-60846-0(1)').shipped, g28.shippedN]);
  chk('★先の日はまだ出荷済でない', it('26-30575-0(2)').shipped === null && d.days[2].shippedN === 0);
}

console.log('■ 記録する人（社員）');
{
  const s = sb({ actRows: ROWS });
  let st = s.getWorkStaff();
  chk('★社員のシートが無ければ作る（見出しだけ）', s.__yard.sheets['社員'] && s.__yard.sheets['社員'].rows.length === 1 && st.staff.length === 0, s.__yard.sheets['社員'] && s.__yard.sheets['社員'].rows);
  st = s.addWorkStaff('  野田　太郎 ', '出荷');
  chk('★名前を足す（空白はそろえる）', st.staff.length === 1 && st.staff[0].名前 === '野田 太郎' && st.staff[0].役割 === '出荷', st.staff);
  st = s.addWorkStaff('野田 太郎', '現場');
  chk('★同じ名前は足さない', st.staff.length === 1);
  let threw = null; try { s.addWorkStaff('', '現場'); } catch (e) { threw = e.message; }
  chk('空の名前は足さない', /名前/.test(threw || ''), threw);
  threw = null; try { s.addWorkStaff('a', '社長'); } catch (e) { threw = e.message; }
  chk('知らない役割は足さない', /役割/.test(threw || ''), threw);
  chk('端末のアカウントも返す', st.account === 'genba@nodagumi40.com');
}

console.log('■ 出荷済を押す・取り消す');
{
  const s = sb({ actRows: ROWS, entries: ENTRIES });
  s.addWorkStaff('野田 太郎', '出荷');
  let threw = null; try { s.markShipped({ key: '26-60846-0(1)', name: '知らない人' }); } catch (e) { threw = e.message; }
  chk('★社員に無い名前では押せない', /記録する人/.test(threw || ''), threw);
  threw = null; try { s.markShipped({ key: 'あいう', name: '野田 太郎' }); } catch (e) { threw = e.message; }
  chk('指図書が変なら押せない', /指図書/.test(threw || ''), threw);

  const K = '26-30575-0(2)';   // 先の日（10/30）の指図書。前もって出したときに押す
  let d = s.markShipped({ key: K, name: '野田 太郎', qty: 3 });
  const it = (dd, k) => dd.days.reduce((a, g) => a.concat(g.items), []).find((o) => o.key === k);
  chk('★押すと出荷済（誰が・いつ）', it(d, K).shipped && it(d, K).shipped.by === '野田 太郎' && !it(d, K).shipped.auto, it(d, K));
  chk('日の出荷済の数が増える', d.days[2].shippedN === 1);
  const log = s.__yard.sheets['作業記録'].rows;
  chk('★作業記録に1行（種類・対象・本数・端末アカウント）', log.length === 2 && log[1][3] === '出荷済' && log[1][4] === K && log[1][5] === '3' && log[1][12] === 'genba@nodagumi40.com', log[1]);

  d = s.markShipped({ key: K, name: '野田 太郎' });
  chk('★二度押ししても1行のまま（ほかの端末で押されていたら知らせる）', s.__yard.sheets['作業記録'].rows.length === 2 && d.dupSkipped === true);

  const id = it(d, K).shipped.id;
  d = s.cancelWorkRecord({ id, name: '野田 太郎' });
  chk('★取り消すと出荷済が外れる（先の日なので）', it(d, K).shipped === null);
  const row = s.__yard.sheets['作業記録'].rows[1];
  chk('★行は消さずに「取消」の印と、取り消した人', s.__yard.sheets['作業記録'].rows.length === 2 && row[9] === '1' && row[11] === '野田 太郎', row);

  d = s.markShipped({ key: K, name: '野田 太郎' });
  chk('取り消したあとはもう一度押せる', it(d, K).shipped && s.__yard.sheets['作業記録'].rows.length === 3);

  d = s.markShipped({ key: '26-60846-0(1)', name: '野田 太郎' });
  chk('当日の指図書も押せば押した人が出る（記録が自動より優先）', it(d, '26-60846-0(1)').shipped.by === '野田 太郎' && !it(d, '26-60846-0(1)').shipped.auto);
}

console.log('■ 出荷済の索引（純関数）');
{
  const s = sb({});
  const rows = s.work_table_([['記録ID', '日時', '名前', '種類', '対象', '取消'],
    ['a', '2026-10-28 09:00', 'A', '出荷済', 'K1', ''],
    ['b', '2026-10-28 09:05', 'B', '出荷済', 'K2', '1'],
    ['c', '2026-10-28 09:10', 'C', '移動', 'K3', ''],
    ['', '', '', '', '', '']]);
  const idx = s.work_shippedIndex_(rows);
  chk('★取消は数えない・出荷済だけ・空の行は飛ばす', Object.keys(idx).join(',') === 'K1' && idx.K1.by === 'A', idx);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
