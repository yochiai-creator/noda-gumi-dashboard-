// アームの出荷予定（配車タブ）のテスト。
//
// ★ なぜ要るのか
//   中身は別プロジェクトが書き出したJSONを読んでいるだけなので、
//   「読めているつもりで読めていない」「古いものを黙って出す」が起きやすい。
//   日付の丸め（ミリ秒→その日の0時）と範囲の切り方、古さの判定を押さえる。
const fs = require('fs');
const vm = require('vm');
const GAS = __dirname + '/../gas/';

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (e !== undefined ? '  -> ' + JSON.stringify(e) : '')); } };

// snap: スナップショットJSONの中身（null なら「ファイルが無い」）
// opt: { snapAt, srcAt, srcName, pdfName, noPdf }
function build(snap, opt) {
  const o = opt || {};
  const outFiles = [];
  if (snap !== null) {
    outFiles.push({ name: 'arm_pdf_snapshot.json', text: JSON.stringify(snap),
                    updated: o.snapAt || new Date('2026-09-13T06:33:00+09:00') });
  }
  if (!o.noPdf) {
    outFiles.push({ name: (o.pdfName || 'アーム機種別出荷明細_2026-09-13.pdf'),
                    updated: new Date('2026-09-13T06:33:00+09:00'), url: 'https://drive/pdf' });
    // 紛らわしい別ファイル。接頭辞で弾けているかを見る
    outFiles.push({ name: '発注書.pdf', updated: new Date('2026-09-20T00:00:00+09:00'), url: 'https://drive/x' });
  }
  const srcFiles = [
    { name: o.srcName || '出荷予定　日程表変更A(26年9月4日).xlsm',
      updated: o.srcAt || new Date('2026-09-11T23:33:00+09:00') },
    { name: 'よその資料.xlsx', updated: new Date('2026-12-01T00:00:00+09:00') },
  ];
  const mkFile = (f) => ({
    getName: () => f.name, getLastUpdated: () => f.updated, getUrl: () => f.url,
    getBlob: () => ({ getDataAsString: () => f.text }),
  });
  const mkIter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => mkFile(arr[i++]) }; };

  const sb = {
    Logger: { log: (m) => sb.__logs.push(String(m)) },
    // ★ 本番は 'Asia/Tokyo' 指定。コンテナはUTCなので、ここで+9時間して実機に合わせる。
    Utilities: { formatDate: (d, tz, f) => {
      const p = (n) => String(n).padStart(2, '0');
      const x = tz === 'Asia/Tokyo' ? new Date(d.getTime() + 9 * 3600000) : d;
      return x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate()) +
        (f.indexOf('HH') >= 0 ? ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes()) : '');
    } },
    DriveApp: { getFolderById: (id) => ({
      getFiles: () => mkIter(id === 'OUT' ? outFiles : srcFiles),
      getFilesByName: (n) => mkIter(outFiles.filter((f) => f.name === n)),
    }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    JSON, Object, Number, String, Math, Date, RegExp, Array, parseInt, isNaN, Boolean, Error,
  };
  sb.__logs = [];
  vm.createContext(sb);
  for (const f of ['noda_common_cache.js', 'noda_arm_ship.js']) {
    vm.runInContext(fs.readFileSync(GAS + f, 'utf8'), sb);
  }
  sb.ARM_CONFIG.OUT_FOLDER_ID = 'OUT';
  sb.ARM_CONFIG.SRC_FOLDER_ID = 'SRC';
  return sb;
}

// 出荷日を Date のミリ秒で作る（スナップショットは ship にミリ秒を入れている）
const at = (y, m, d) => new Date(y, m - 1, d).getTime();
// ★ 実物のキーは「図番||号機」。値のほうには図番も号機も入っていない。
const row = (ship, extra) => Object.assign(
  { insp: '9/1', kiki: 'SK300', kishu: '10型', spec: 'SK300 3.3m10型', ship: ship,
    info: '', dest: '正和', is13: false }, extra || {});

const SNAP = {
  'LC12B10557F1||325': row(at(2026, 9, 14), { info: 'グレー' }),
  'LC12B10557F1||328': row(at(2026, 9, 14), { dest: 'あゆみ' }),
  'YY12B00902F1G2||1952': row(at(2026, 9, 14),
    { kiki: '13ton仕上げ', kishu: '', dest: '正和(13ton)', is13: true }),
  'LC12B10556F1||378': row(at(2026, 9, 15)),
  // ★ 出荷日に時刻が入っていることがある。その日の0時に丸めて同じ日にまとめる
  'LC12B10556F1||379': { insp: '', kiki: 'SK300', kishu: '10型', spec: '', dest: '正和',
    is13: false, ship: new Date(2026, 8, 15, 13, 45).getTime() },
  // 範囲外（基準日より前 / 31日より先）
  'OLD||1': row(at(2026, 9, 12)),
  'FAR||1': row(at(2026, 10, 20)),
  // 壊れた行（出荷日が無い）
  'BAD||1': { kiki: 'SK200', kishu: '', dest: '正和' },
};

console.log('■ 出荷日ごとにまとめる');
{
  const s = build(SNAP);
  const days = s.arm_buildDays_(SNAP, new Date(2026, 8, 13));
  chk('日付の古い順', days.map((d) => d.label).join(','), days.map((d) => d.label).join(','));
  chk('★基準日より前は出さない', !days.some((d) => d.label === '9/12'), days.map((d) => d.label));
  chk('★31日より先は出さない', !days.some((d) => d.label === '10/20'), days.map((d) => d.label));
  chk('2日ぶん', days.length === 2, days.map((d) => d.label));
  chk('9/14 は3台', days[0].label === '9/14' && days[0].count === 3, days[0]);
  chk('曜日が付く', days[0].weekday === '月', days[0].weekday);
  chk('★時刻が入っていても同じ日にまとまる', days[1].label === '9/15' && days[1].count === 2, days[1]);
  chk('出荷日の無い行は捨てる',
    !days.some((d) => d.rows.some((r) => r.zu === 'BAD')), days.map((d) => d.rows.map((r) => r.zu)));
  chk('出荷先の内訳が多い順', JSON.stringify(days[0].byDest) ===
    JSON.stringify([{ 名: '正和', 台数: 1 }, { 名: 'あゆみ', 台数: 1 }, { 名: '正和(13ton)', 台数: 1 }]) ||
    days[0].byDest.length === 3, days[0].byDest);
  chk('★13tonは後ろにまとめる',
    days[0].rows[days[0].rows.length - 1].is13 === true, days[0].rows.map((r) => r.is13));
  chk('★キーから図番と号機を取り出す',
    days[0].rows[0].zu === 'LC12B10557F1' && days[0].rows[0].go === '325', days[0].rows[0]);
  chk('号機が空のキーでも壊れない',
    s.arm_splitKey_('LC12B10557F1||').go === '' &&
    s.arm_splitKey_('LC12B10557F1||').zu === 'LC12B10557F1', s.arm_splitKey_('LC12B10557F1||'));
  chk('検査がまだの行は空で返す（「検査まだ」は画面側で出す）',
    days[1].rows.some((r) => r.insp === ''), days[1].rows.map((r) => r.insp));
  chk('情報①（塗装色など）も返す',
    days[0].rows.some((r) => r.info === 'グレー'), days[0].rows.map((r) => r.info));
}

console.log('■ 出荷先が空のとき');
{
  const s = build({});
  const days = s.arm_buildDays_(
    { 'A||1': { ship: at(2026, 9, 14), kiki: 'SK300', dest: '' } }, new Date(2026, 8, 13));
  chk('「（出荷先なし）」にまとめる', days[0].byDest[0].名 === '（出荷先なし）', days[0].byDest);
}

console.log('■ まとめて取る');
{
  const s = build(SNAP);
  const d = s.getArmShipPlan_uncached_();
  chk('エラーなし', d.error === null, d.error);
  chk('合計台数', d.total === 5, d.total);
  chk('元ファイル名を返す', /日程表変更/.test(d.sourceName), d.sourceName);
  chk('★別のxlsxを元ファイルにしない', !/よその資料/.test(d.sourceName), d.sourceName);
  chk('明細PDFのリンクを返す', d.pdfUrl === 'https://drive/pdf', d.pdfUrl);
  chk('★接頭辞の違うPDFは拾わない', !/発注書/.test(String(d.pdfName)), d.pdfName);
  chk('予定の作成日時を返す', /2026-09-13/.test(d.snapshotAt), d.snapshotAt);
  chk('元Excelのほうが古いので stale でない', d.stale === false, d.stale);
}

console.log('■ 古いまま出さない');
{
  // 元のExcelが後から更新された＝PDF生成が追いついていない
  const s = build(SNAP, { srcAt: new Date('2026-09-13T08:00:00+09:00') });
  const d = s.getArmShipPlan_uncached_();
  chk('★元Excelのほうが新しければ stale', d.stale === true, d.stale);
  chk('それでも中身は返す（見えないよりまし）', d.total === 5, d.total);
}

console.log('■ スナップショットが無い');
{
  const s = build(null);
  const d = s.getArmShipPlan_uncached_();
  chk('★黙って0台にせず、理由を返す', /見つかりません/.test(String(d.error)), d.error);
  chk('日付は空', d.days.length === 0, d.days);
}

console.log('■ PDFがまだ無い');
{
  const s = build(SNAP, { noPdf: true });
  const d = s.getArmShipPlan_uncached_();
  chk('PDFが無くても予定は出る', d.total === 5 && d.pdfUrl === null, { total: d.total, pdf: d.pdfUrl });
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
