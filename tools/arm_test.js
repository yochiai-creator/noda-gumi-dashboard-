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
  const srcFiles = o.srcFiles || [
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

console.log('■ どの .xlsm を元にしたかを正しく出す');
{
  /* ★ 実データでこうなっていた：
       「9月4日」の版を後から開き直したせいで更新日時だけ新しくなっていて、
       更新日時で選ぶと古い版を「出所」として出してしまう。
       PDF生成側は名前の日付で選んでいるので、こちらも合わせる。 */
  const s = build(SNAP, { srcFiles: [
    { name: '出荷予定　日程表変更A(26年9月4日).xlsm', updated: new Date('2026-09-13T06:49:00+09:00') },
    { name: '出荷予定　日程表変更A(26年9月10日).xlsm', updated: new Date('2026-09-11T23:31:00+09:00') },
    { name: 'よその資料.xlsx', updated: new Date('2026-12-01T00:00:00+09:00') },
  ] });
  const d = s.getArmShipPlan_uncached_();
  chk('★名前の日付が一番新しいものを元ファイルにする',
    /9月10日/.test(d.sourceName), d.sourceName);
  chk('★更新日時だけ新しい古い版に引きずられない',
    !/9月4日/.test(d.sourceName), d.sourceName);
  chk('その版は予定より古いので stale にしない', d.stale === false, d.stale);
}
{
  // ファイル名は固定していない。名前に「日程表変更」を含む .xlsm だけを見る
  const s = build(SNAP, { srcFiles: [
    { name: '出荷予定　日程表変更A(26年9月10日).xlsm', updated: new Date('2026-09-11T23:31:00+09:00') },
    // ★ 同じ語を含むPDFやメモが置かれても拾わない
    { name: '出荷予定　日程表変更A(26年12月1日).pdf', updated: new Date('2026-12-01T00:00:00+09:00') },
    { name: '日程表変更のメモ.docx', updated: new Date('2026-12-02T00:00:00+09:00') },
    { name: 'まったく別の予定表(26年12月3日).xlsm', updated: new Date('2026-12-03T00:00:00+09:00') },
  ] });
  const d = s.getArmShipPlan_uncached_();
  chk('★「日程表変更」を含む .xlsm だけを見る', /日程表変更A\(26年9月10日\)\.xlsm/.test(d.sourceName),
    d.sourceName);
}
{
  // 名前から日付が読めないものしか無いときは更新日時で代用する
  const s = build(SNAP, { srcFiles: [
    { name: '出荷予定　日程表変更A.xlsm', updated: new Date('2026-09-01T00:00:00+09:00') },
    { name: '出荷予定　日程表変更A（最新）.XLSM', updated: new Date('2026-09-11T00:00:00+09:00') },
  ] });
  const d = s.getArmShipPlan_uncached_();
  chk('名前に日付が無ければ更新日時で選ぶ', /最新/.test(d.sourceName), d.sourceName);
  chk('拡張子の大文字小文字は問わない', /\.XLSM$/.test(d.sourceName), d.sourceName);
}
{
  const s = build(SNAP);
  chk('日付キー', s.arm_dateKeyFromName_('出荷予定　日程表変更A(26年9月10日).xlsm') === 20260910,
    s.arm_dateKeyFromName_('出荷予定　日程表変更A(26年9月10日).xlsm'));
  chk('1桁の月日も読める', s.arm_dateKeyFromName_('A(26年9月4日).xlsm') === 20260904,
    s.arm_dateKeyFromName_('A(26年9月4日).xlsm'));
  chk('読めなければ -1', s.arm_dateKeyFromName_('A.xlsm') === -1);
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

console.log('■ 月別の集計（元の .xlsm から）');
{
  const s = build(SNAP);
  // 出荷明細シートの3列ぶん（機器 / 仕様 / 最新出荷日）
  const kk = [['SK300　10型'], ['SK200　B165'], ['13ton仕上げ'], ['13ton ｼｮｰﾄ'],
              ['SK300　ﾛﾝｸﾞ'], ['特機'], [''], ['SK200　B145'], ['SK300　10型']];
  const sp = [['SK300 3.3m'], ['SK200 HD'], ['2.38m GD'], ['2.2m'],
              ['ブームブラケット'], ['B162'], [''], ['SK200 HD'], ['SK300 3.3m']];
  const sh = [[new Date(2026, 3, 10)], [new Date(2026, 3, 28)], [new Date(2026, 3, 2)],
              [new Date(2026, 4, 7)], [new Date(2026, 4, 9)], [new Date(2026, 4, 20)],
              [''], [new Date(2026, 2, 15)], ['出荷日が日付でない']];
  const a = s.arm_aggregateRows_(kk, sp, sh);
  // 9行のうち、空欄1・文字列1・ブームブラケット1を除いた6行が対象
  chk('出荷日が日付でない行は数えない', a.rowCount === 6, a);
  chk('★出荷日ごとに持つ（月にまとめない）',
    a.days.map((d) => d.日付).join(',') ===
      '2026-03-15,2026-04-02,2026-04-10,2026-04-28,2026-05-07,2026-05-20',
    a.days.map((d) => d.日付));
  const byDay = {}; a.days.forEach((d) => { byDay[d.日付] = d.区分別; });
  chk('★13tonはまとめる（仕上げ・ｼｮｰﾄを分けない）',
    byDay['2026-04-02']['13ton'] === 1 && byDay['2026-05-07']['13ton'] === 1, a.days);
  chk('★ブームブラケットは除く（5/9は行ごと無い）', byDay['2026-05-09'] === undefined, a.days);
  chk('機種は区分に混ぜない（SK300　10型 → SK300）',
    byDay['2026-04-10']['SK300'] === 1, byDay['2026-04-10']);
  chk('特機も1つの区分', byDay['2026-05-20']['特機'] === 1, byDay['2026-05-20']);
  chk('区分', s.arm_kindOf_('SK200　SRHﾃｨｱ') === 'SK200', s.arm_kindOf_('SK200　SRHﾃｨｱ'));
  chk('半角スペース区切りも切る', s.arm_kindOf_('SK400 3.45m') === 'SK400', s.arm_kindOf_('SK400 3.45m'));
  chk('空欄は「その他」', s.arm_kindOf_('') === 'その他');
}

console.log('■ 年度はじめから出す');
{
  const s = build(SNAP);
  chk('4月〜3月が年度', s.arm_fiscalStart_(new Date(2026, 8, 13)) === '2026-04',
    s.arm_fiscalStart_(new Date(2026, 8, 13)));
  chk('★1〜3月は前の年の4月から', s.arm_fiscalStart_(new Date(2027, 1, 5)) === '2026-04',
    s.arm_fiscalStart_(new Date(2027, 1, 5)));
  chk('4月ちょうど', s.arm_fiscalStart_(new Date(2026, 3, 1)) === '2026-04');

  const rows = [
    ['2026-03-20', 'SK200', 30],   // 前年度。出さない
    ['2026-04-10', 'SK200', 90], ['2026-04-28', '13ton', 50],
    ['2026-05-07', 'SK200', 80],
    ['2026-05-09', 'SK300', 0],    // 0台は行ごと落とす
  ];
  const b = s.arm_monthsFromRows_(rows, '2026-04', '2026-09-13');
  chk('★年度より前の月は出さない', !b.months.some((m) => m.年月 === '2026-03'),
    b.months.map((m) => m.年月));
  chk('月の台数を合算', b.months[0].台数 === 140, b.months[0]);
  chk('合計', b.total === 220, b.total);
  chk('区分は多い順', b.kinds[0] === 'SK200', b.kinds);
  chk('0台の区分は持たない', b.months[1].区分別['SK300'] === undefined, b.months[1]);
  chk('その月の最終日を持つ', b.months[0].最終日 === '2026-04-28', b.months[0].最終日);
}

console.log('■ 先の予定は実績に混ぜない');
{
  const s = build(SNAP);
  const rows = [
    ['2026-09-10', 'SK200', 5],   // 今日より前 → 実績
    ['2026-09-13', 'SK200', 3],   // 今日 → 入れる
    ['2026-09-14', 'SK200', 9],   // 明日 → 予定なので出さない
    ['2026-10-02', 'SK300', 7],   // 来月 → 出さない
  ];
  const b = s.arm_monthsFromRows_(rows, '2026-04', '2026-09-13');
  chk('★来月の予定は出さない', !b.months.some((m) => m.年月 === '2026-10'),
    b.months.map((m) => m.年月));
  chk('★今月は今日までで切る（明日の9台を入れない）', b.months[0].台数 === 8, b.months[0]);
  chk('今日ぶんは入れる', b.months[0].最終日 === '2026-09-13', b.months[0].最終日);
  // 切らなければ全部入る＝落としているのは untilDate のおかげだと確かめる
  chk('切らなければ24台', s.arm_monthsFromRows_(rows, '2026-04', null).total === 24,
    s.arm_monthsFromRows_(rows, '2026-04', null).total);
}
{
  // シートが日付型で返してくることがある
  const s = build(SNAP);
  const b = s.arm_monthsFromRows_([[new Date(2026, 3, 1), 'SK200', 5]], '2026-04', '2026-09-13');
  chk('★日付がDateで返ってきても読める', b.months.length === 1 && b.months[0].年月 === '2026-04',
    b.months);
  const c = s.arm_monthsFromRows_([["'2026-04-01", 'SK200', 5]], '2026-04', '2026-09-13');
  chk("先頭の ' が付いていても読める", c.months.length === 1 && c.months[0].年月 === '2026-04', c.months);
}

console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
process.exit(fail ? 1 : 0);
