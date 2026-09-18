/**
 * 野田組 業務ダッシュボード — 生産計画（当日ぶんと当月ぶん）
 * ------------------------------------------------------------------
 * ★ どこから取るのか
 *   「容器生産計画」フォルダ（年 → 種類）の中の2つ。
 *
 *   ① 当日計画  工場別当日計画(26.9.18).xlsx    ＜毎日1本、約30KB＞
 *      行＝工場（50k / 20k / 特殊）× 工程（加工・品質・処理・コイル）。
 *      列は B=工場 C=工程 D=計画数 E=社員 H=協力。
 *      工場の欄は同じ工場が続くあいだ空欄なので、上から引き継いで読む。
 *
 *   ② 当月計画  ２６年９月容器班別日程計画 Rev0.pdf
 *      1日〜末日が横に並ぶ表。テキストが埋め込まれているのでOCRは要らない。
 *      「50kg=6台 ＋0 …日ごとの数… 12,600」のような行から拾う。
 *
 * ★ どの月の計画かはファイル名で決める（更新日時では決めない）
 *   古いファイルを開き直すだけで更新日時が動くため。出荷予定表と同じ考え方。
 *
 * ★ 工場ごとの「当日◯本」は工程ごとの最大を採る
 *   同じ本数が加工→品質→処理と流れるので、足すと三重になる。
 *   当月計画のPDFも 50k加 と 50k品 に同じ数が並び、計は12,600（倍ではない）。
 *   同じ数え方にそろえてある。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて pplan_ 接頭辞にしてある。
 */

var PPLAN_CONFIG = {
  DAILY_FOLDER: '1sYnVpW178rexviG5gGtgOiZwNWt-rfzb',    // 工場別当日計画
  MONTHLY_FOLDER: '158F4Qjm_W8_CFKmFEHi5u6_eEbrUPt-V',  // 容器班別日程計画
  DAILY_PREFIX: '工場別当日計画',
  // 当日計画の列（0始まり）。実ファイルで確認済み
  COL: { 工場: 1, 工程: 2, 計画数: 3, 社員: 4, 協力: 7 },
  工場: ['50k', '20k', '特殊'],
  工程: ['加工', '品質', '処理', 'コイル'],
  TTL: 900   // 15分。1日1本のファイルなので長めでよい
};

// ===== 公開関数：画面用 =====
function getProdPlanData(force) {
  return nc_cached_('prodPlan', force, PPLAN_CONFIG.TTL, function () {
    return pplan_build_();
  });
}

function pplan_build_() {
  var out = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    daily: null, monthly: null, error: null
  };
  try { out.daily = pplan_daily_(); }
  catch (err) { out.daily = { error: String(err) }; Logger.log('当日計画でエラー: ' + String(err)); }
  try { out.monthly = pplan_monthly_(); }
  catch (err2) { out.monthly = { error: String(err2) }; Logger.log('当月計画でエラー: ' + String(err2)); }
  return out;
}

// ===== 当日計画 =====
function pplan_daily_() {
  var f = pplan_latestDaily_();
  if (!f) return { error: '当日計画のファイルが見つかりません', rows: [], 工場: [] };
  var sheet = SpreadsheetApp.open(f.file).getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var d = pplan_parseDaily_(values);
  d.fileName = f.name;
  d.fileDate = f.key;
  d.fileUrl = 'https://drive.google.com/file/d/' + f.file.getId() + '/view';
  d.今日 = f.key === Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  return d;
}

/* シートの値から当日計画を組み立てる（純関数）。 */
function pplan_parseDaily_(values) {
  var C = PPLAN_CONFIG.COL;
  var out = { 日付ラベル: '', rows: [], 工場: [], error: null };
  var cur = '';
  var byPlant = {};

  for (var r = 0; r < values.length; r++) {
    var row = values[r] || [];
    if (!out.日付ラベル) {
      for (var c = 0; c < row.length; c++) {
        var m = String(row[c] == null ? '' : row[c]).match(/(\d{1,2})月(\d{1,2})日/);
        if (m) { out.日付ラベル = m[0]; break; }
      }
    }
    var plant = pplan_text_(row[C.工場]);
    if (plant && PPLAN_CONFIG.工場.indexOf(plant) >= 0) cur = plant;
    var step = pplan_text_(row[C.工程]);
    if (!cur || PPLAN_CONFIG.工程.indexOf(step) < 0) continue;

    var n = pplan_num_(row[C.計画数]);
    if (n == null) continue;
    var rec = { 工場: cur, 工程: step, 計画数: n,
                社員: pplan_num_(row[C.社員]), 協力: pplan_num_(row[C.協力]) };
    out.rows.push(rec);

    if (!byPlant[cur]) byPlant[cur] = { 工場: cur, 計画数: 0, 社員: 0, 協力: 0, 工程: [] };
    var p = byPlant[cur];
    // ★ 同じ本数が工程を流れるので、足さずに最大を採る
    if (n > p.計画数) p.計画数 = n;
    p.社員 += rec.社員 || 0;
    p.協力 += rec.協力 || 0;
    p.工程.push({ 工程: step, 計画数: n });
  }

  PPLAN_CONFIG.工場.forEach(function (k) { if (byPlant[k]) out.工場.push(byPlant[k]); });
  out.合計 = out.工場.reduce(function (a, b) { return a + b.計画数; }, 0);
  out.人員 = out.工場.reduce(function (a, b) { return a + b.社員 + b.協力; }, 0);
  if (out.rows.length === 0) out.error = '当日計画の行が読めませんでした';
  return out;
}

function pplan_text_(v) { return String(v == null ? '' : v).replace(/[\s　]/g, ''); }

function pplan_num_(v) {
  if (v === '' || v == null) return null;
  var n = Number(String(v).replace(/[,，\s　]/g, ''));
  return isNaN(n) ? null : n;
}

/* ファイル名の日付で一番新しいものを選ぶ。更新日時では選ばない。 */
function pplan_latestDaily_() {
  var it = DriveApp.getFolderById(PPLAN_CONFIG.DAILY_FOLDER).getFiles();
  var best = null;
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    if (name.indexOf(PPLAN_CONFIG.DAILY_PREFIX) !== 0) continue;
    if (!/\.xlsx?$/i.test(name)) continue;
    var key = pplan_dateKeyFromName_(name);
    if (!key) continue;
    if (!best || key > best.key) best = { file: f, name: name, key: key };
  }
  return best;
}

/* 「工場別当日計画(26.9.18).xlsx」→ 2026-09-18。全角カッコも通す。 */
function pplan_dateKeyFromName_(name) {
  var m = String(name).match(/[(（](\d{2})\.(\d{1,2})\.(\d{1,2})[)）]/);
  if (!m) return null;
  var p = function (x) { return (Number(x) < 10 ? '0' : '') + Number(x); };
  return '20' + m[1] + '-' + p(m[2]) + '-' + p(m[3]);
}

// ===== 当月計画（PDF） =====
function pplan_monthly_() {
  var now = new Date();
  var y = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'));
  var mo = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'MM'));
  var f = pplan_latestMonthly_(y, mo);
  if (!f) return { error: y + '年' + mo + '月の容器班別日程計画が見つかりません', 行: [] };

  var text = shipact_pdfToText_(f.file);
  var m = pplan_parseMonthly_(text, new Date(y, mo, 0).getDate());
  m.fileName = f.name;
  m.fileUrl = 'https://drive.google.com/file/d/' + f.file.getId() + '/view';
  m.月 = y + '-' + (mo < 10 ? '0' : '') + mo;
  m.仮 = f.仮;
  return m;
}

/* PDFの本文から、サイズごとの月計と日別を拾う（純関数）。
   ★ 行の形：「50kg=6台 ＋0 0 0 900 … 1200 0 12,600」
     最後のカンマ付きの数が月計。その手前の並びが日別。
     頭には「=6台」「＋0」の数字が混ざるので、末尾から日数ぶんだけ採る。
   ★ 日別の合計が月計と合わないときは日別を捨てる。ずれたまま見せるより、
     月計だけ出して「日別は読めなかった」と言うほうがいい。
   ★ 日別が「何日ぶん」かは分かるが「何日の分か」は当てにしない。
     PDFから起こしたテキストは並びが崩れており、先頭が1日とは限らない。
     画面には月計だけを出し、日別は数えるためだけに持っている。 */
function pplan_parseMonthly_(text, daysInMonth) {
  var out = { 行: [], error: null };
  var lines = String(text || '').split(/[\r\n]+/);
  var want = [
    { key: '50kg', re: /^\s*50kg(?:=[^\s]*)?\s*[＋+]/ },
    { key: '20kg', re: /^\s*20kg(?:=[^\s]*)?\s*[＋+]/ }
  ];
  lines.forEach(function (ln) {
    want.forEach(function (w) {
      if (!w.re.test(ln)) return;
      if (out.行.some(function (x) { return x.サイズ === w.key; })) return;   // 最初の1本だけ
      /* ★ 「50kg=6台」の 50 や 6 を日別に混ぜないため、「＋」から後ろだけを読む。
           ＋の直後の数（＋0 の 0）は前月からの繰り越しなので日別ではない。 */
      var after = ln.substring(ln.search(/[＋+]/) + 1);
      var nums = (after.match(/-?[\d,]+/g) || []).map(function (x) {
        return Number(String(x).replace(/,/g, ''));
      }).filter(function (n) { return !isNaN(n); });
      if (nums.length < 3) return;
      var total = nums[nums.length - 1];            // 末尾が月計
      var days = nums.slice(1, nums.length - 1);    // 先頭の繰り越しと末尾の月計を外す
      /* 日数より1つ多い並びで出てくる（末尾に表の外の列が1つ混じる）。
         頭から日数ぶんを採り、合計が月計と合うかで確かめる。 */
      var dim = Number(daysInMonth) || 31;
      var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
      var head = days.slice(0, dim);
      var pick = sum(head) === total ? head : (sum(days) === total ? days : null);
      out.行.push({ サイズ: w.key, 月計: total,
                    日別: pick, 日別が読めた: pick != null });
    });
  });
  if (out.行.length === 0) out.error = '当月計画の行が読めませんでした';
  out.合計 = out.行.reduce(function (a, b) { return a + b.月計; }, 0);
  return out;
}

/* その月のPDFのうち、Rev番号が一番大きいもの。無ければ「仮」を使う。 */
function pplan_latestMonthly_(year, month) {
  var it = DriveApp.getFolderById(PPLAN_CONFIG.MONTHLY_FOLDER).getFiles();
  var want = pplan_kanjiMonth_(year, month);
  var best = null;
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    if (!/\.pdf$/i.test(name)) continue;
    if (name.indexOf(want) < 0) continue;
    var rev = name.match(/Rev\s*(\d+)/i);
    var score = rev ? 100 + Number(rev[1]) : 0;   // 確定版（Rev）を仮より優先
    if (!best || score > best.score) {
      best = { file: f, name: name, score: score, 仮: !rev };
    }
  }
  return best;
}

/* 2026年9月 → 「２６年９月」。ファイル名は全角の年月で書かれている。 */
function pplan_kanjiMonth_(year, month) {
  var z = function (s) {
    return String(s).replace(/\d/g, function (d) {
      return String.fromCharCode(0xFF10 + Number(d));
    });
  };
  return z(String(year).slice(2)) + '年' + z(month) + '月';
}

// ===== 公開関数：手で確かめる =====
function 生産計画を確かめる() {
  var r = pplan_build_();
  var d = r.daily || {};
  Logger.log('当日計画: ' + (d.fileName || '—') + '  ' + (d.日付ラベル || ''));
  (d.工場 || []).forEach(function (p) {
    Logger.log('  ' + p.工場 + '  ' + p.計画数 + '本  社員' + p.社員 + ' 協力' + p.協力 +
               '  (' + p.工程.map(function (x) { return x.工程 + x.計画数; }).join(' ') + ')');
  });
  if (d.error) Logger.log('  エラー: ' + d.error);

  var m = r.monthly || {};
  Logger.log('当月計画: ' + (m.fileName || '—') + (m.仮 ? '（仮）' : ''));
  (m.行 || []).forEach(function (x) {
    Logger.log('  ' + x.サイズ + '  月計 ' + x.月計 + '本  日別' +
               (x.日別が読めた ? x.日別.length + '日ぶん' : '読めず'));
  });
  if (m.error) Logger.log('  エラー: ' + m.error);
  return r;
}
