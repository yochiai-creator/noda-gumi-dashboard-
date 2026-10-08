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
 * ★ 工場ごとの「当日◯本」は【処理】の本数を出す
 *   同じ本数が加工→品質→処理と流れるので、足すと三重になる。
 *   そのうち処理が最終工程で、ここを通ったぶんが置場に入る。置場の話と
 *   並べて見るのだから、置場に入ってくる本数を出すのが筋。
 *   処理の行が無い工場（特殊など）は、その工場の最後の工程を採る。
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
  /* ★ キャッシュ名を変えた（prodPlan → prodPlan2 → prodPlan3）。
       prodPlan3 は、数が並んだ欄を1つの数に詰めて読んでいた結果を残さないため。
       prodPlan2 は、フォルダが月ごとに分けられて
       読めなかった結果が15分残っていると、直しても当日計画が出ないままになるため。 */
  var KEY = 'prodPlan3';
  if (!force) {
    var hit = nc_peek_(KEY);
    if (hit) return hit;
  }
  var d = pplan_build_();
  /* ★ 当日・当月のどちらかでも読めなかったときはキャッシュしない。
       読めなかった結果を15分出し続けないように（全体のエラーではないので
       nc_cached_ だと残ってしまう）。 */
  if (!(d.daily && d.daily.error) && !(d.monthly && d.monthly.error)) {
    nc_put_(KEY, d, PPLAN_CONFIG.TTL);
  }
  d.cached = false;
  return d;
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
  var todayKey = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var f = pplan_latestDaily_(todayKey);
  if (!f) return { error: '当日計画のファイルが見つかりません', rows: [], 工場: [] };
  var sheet = SpreadsheetApp.open(f.file).getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var d = pplan_parseDaily_(values);
  d.fileName = f.name;
  d.fileDate = f.key;
  d.fileUrl = 'https://drive.google.com/file/d/' + f.file.getId() + '/view';
  d.今日 = f.key === todayKey;
  d.区分 = f.区分;   // 今日 ／ 次（今日のぶんが無く、先のぶんを出している） ／ 前
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
        var v = row[c];
        if (v instanceof Date) {
          // ★ 「9月18日(Fri)」のセルが日付として返ってくることがある
          out.日付ラベル = (v.getMonth() + 1) + '月' + v.getDate() + '日';
          break;
        }
        var m = String(v == null ? '' : v).match(/(\d{1,2})月(\d{1,2})日/);
        if (m) { out.日付ラベル = m[0]; break; }
      }
    }
    var plant = pplan_text_(row[C.工場]);
    if (plant && PPLAN_CONFIG.工場.indexOf(plant) >= 0) cur = plant;
    var step = pplan_text_(row[C.工程]);
    if (!cur || PPLAN_CONFIG.工程.indexOf(step) < 0) continue;

    /* ★ 1つの欄に数が並ぶことがある（10/8 の 20k 処理「200　　　1100」、
         10/9 の 50k 処理「100　　　200　　　　1100」）。空白を詰めて1つの数に
         すると 2,001,100本 になる。数を1つずつ拾って足し、内訳も持っておく
         （足した数だけ見せると、元の表と見比べられない）。 */
    var parts = pplan_nums_(row[C.計画数]);
    if (parts.length === 0) continue;
    var n = parts.reduce(function (a, b) { return a + b; }, 0);
    var rec = { 工場: cur, 工程: step, 計画数: n,
                社員: pplan_num_(row[C.社員]), 協力: pplan_num_(row[C.協力]) };
    if (parts.length > 1) rec.内訳 = parts;
    out.rows.push(rec);

    if (!byPlant[cur]) byPlant[cur] = { 工場: cur, 計画数: 0, 基準: '', 社員: 0, 協力: 0, 工程: [] };
    var p = byPlant[cur];
    p.社員 += rec.社員 || 0;
    p.協力 += rec.協力 || 0;
    p.工程.push(rec.内訳 ? { 工程: step, 計画数: n, 内訳: rec.内訳 } : { 工程: step, 計画数: n });
  }

  PPLAN_CONFIG.工場.forEach(function (k) {
    if (!byPlant[k]) return;
    var p = byPlant[k];
    /* ★ 足さずに【処理】の1つを採る。同じ本数が工程を流れるので足すと三重になる。
         処理が最終工程で、ここを通ったぶんが置場に入る。
         処理の行が無い工場（特殊など）は最後の工程で代える。 */
    var hit = null;
    for (var i = 0; i < p.工程.length; i++) {
      if (p.工程[i].工程 === '処理') hit = p.工程[i];
    }
    if (!hit && p.工程.length > 0) hit = p.工程[p.工程.length - 1];
    p.計画数 = hit ? hit.計画数 : 0;
    p.基準 = hit ? hit.工程 : '';
    if (hit && hit.内訳) p.内訳 = hit.内訳;
    out.工場.push(p);
  });
  out.合計 = out.工場.reduce(function (a, b) { return a + b.計画数; }, 0);
  out.人員 = out.工場.reduce(function (a, b) { return a + b.社員 + b.協力; }, 0);
  if (out.rows.length === 0) out.error = '当日計画の行が読めませんでした';
  return out;
}

function pplan_text_(v) { return String(v == null ? '' : v).replace(/[\s　]/g, ''); }

/* 欄の中の数を全部拾う。「1,100」「1，100」は1つの数。空白で区切られた数は別々。 */
function pplan_nums_(v) {
  if (v === '' || v == null) return [];
  if (typeof v === 'number') return isNaN(v) ? [] : [v];
  var t = String(v).replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); });
  var m = t.match(/\d{1,3}(?:[,，]\d{3})+|\d+(?:\.\d+)?/g) || [];
  return m.map(function (x) { return Number(x.replace(/[,，]/g, '')); });
}

/* 1つの数として読む（社員・協力）。数が並んでいたら足す。数が無ければ null。 */
function pplan_num_(v) {
  var a = pplan_nums_(v);
  return a.length ? a.reduce(function (x, y) { return x + y; }, 0) : null;
}

/* フォルダの直下と、その1つ下のフォルダにあるファイルを全部返す。
   ★ 当日計画のフォルダが月ごと（1月〜12月）に分けられ、直下にファイルが
     無くなった日から当日計画が出なくなった。分け方が変わっても拾えるように、
     1つ下のフォルダまで見る。 */
function pplan_filesIn_(folderId) {
  var out = [];
  var root = DriveApp.getFolderById(folderId);
  var it = root.getFiles();
  while (it.hasNext()) out.push(it.next());
  var subs = root.getFolders();
  while (subs.hasNext()) {
    var fit = subs.next().getFiles();
    while (fit.hasNext()) out.push(fit.next());
  }
  return out;
}

/* どの日のファイルを出すか。ファイル名の日付で決める（更新日時では選ばない）。
   ★ 翌日ぶんのファイルは前の日の夕方（18時ごろ）に置かれる。一番新しいものを
     選ぶと、夕方から「明日の計画」が当日計画として出てしまっていた。
     ① 今日のぶんがあれば今日
     ② 無ければ（休日など）一番近い先のぶん＝次の稼働日
     ③ それも無ければ一番新しい過去のぶん */
function pplan_latestDaily_(todayKey) {
  if (!todayKey) todayKey = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var files = pplan_filesIn_(PPLAN_CONFIG.DAILY_FOLDER);
  var cands = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var name = f.getName();
    if (name.indexOf(PPLAN_CONFIG.DAILY_PREFIX) !== 0) continue;
    if (!/\.xlsx?$/i.test(name)) continue;
    var key = pplan_dateKeyFromName_(name);
    if (!key) continue;
    cands.push({ file: f, name: name, key: key });
  }
  return pplan_pickDaily_(cands, todayKey);
}

/* 候補から1つ選ぶ（純関数）。区分 = 今日 ／ 次 ／ 前 */
function pplan_pickDaily_(cands, todayKey) {
  var today = null, next = null, prev = null;
  cands.forEach(function (c) {
    if (c.key === todayKey) today = c;
    else if (c.key > todayKey) { if (!next || c.key < next.key) next = c; }
    else if (!prev || c.key > prev.key) prev = c;
  });
  var hit = today || next || prev;
  if (!hit) return null;
  hit.区分 = hit === today ? '今日' : hit === next ? '次' : '前';
  return hit;
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
   ★ 行で区切って探さない
     PDFから起こしたテキストは、どこで改行が入るかが変換のしかたで変わる。
     行頭が「50kg」である保証は無いので、本文全体から形で探す。
   ★ 探す形：「50kg=6台 ＋0 0 0 900 … 1200 0 12,600」
     ・サイズの直後（12文字以内）に「＋」が来るものだけが計画の行。
       「20kg3P」や「残20kg 600 …」には＋が続かないので引っかからない。
     ・＋の直後の数は前月からの繰り越しで、日別ではない。
     ・日別は3桁までなのでカンマが付かない。最初に出るカンマ付きの数が月計。
       そこで打ち切るので、後ろに続く別の行の数字を巻き込まない。
   ★ 日別の合計が月計と合わないときは日別を捨てる。ずれたまま見せるより、
     月計だけ出して「日別は読めなかった」と言うほうがいい。
   ★ 日別が「何日ぶん」かは分かるが「何日の分か」は当てにしない。
     並びが崩れており、先頭が1日とは限らない。画面には月計だけを出す。 */
function pplan_parseMonthly_(text, daysInMonth) {
  var out = { 行: [], error: null };
  var t = String(text || '').replace(/[\r\n]+/g, ' ');
  var dim = Number(daysInMonth) || 31;
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };

  ['50kg', '20kg'].forEach(function (size) {
    var re = new RegExp(size + '[^＋+]{0,12}[＋+]', 'g');
    var m;
    while ((m = re.exec(t)) !== null) {
      var hit = pplan_readPlanRow_(t.substring(m.index + m[0].length), dim, sum);
      if (!hit) continue;
      hit.サイズ = size;
      out.行.push(hit);
      return;   // 同じサイズは最初の1本だけ。加工と品質に同じ数が並ぶので倍にしない
    }
  });

  if (out.行.length === 0) out.error = '当月計画の行が読めませんでした';
  out.合計 = out.行.reduce(function (a, b) { return a + b.月計; }, 0);
  return out;
}

/* 「＋」の直後から、カンマ付きの数（＝月計）に当たるまで数を拾う。 */
function pplan_readPlanRow_(rest, dim, sum) {
  var tk = /(\d{1,3}(?:,\d{3})+)|(\d+)/g;
  var nums = [], total = null, m;
  while ((m = tk.exec(rest)) !== null) {
    if (m[1]) { total = Number(m[1].replace(/,/g, '')); break; }
    nums.push(Number(m[2]));
    if (nums.length > 70) break;   // 月計に当たらないまま流れた＝別の行
  }
  if (total == null || nums.length < 3) return null;

  var days = nums.slice(1);        // 先頭は前月からの繰り越し
  var head = days.slice(0, dim);
  var pick = sum(head) === total ? head : (sum(days) === total ? days : null);
  return { 月計: total, 日別: pick, 日別が読めた: pick != null };
}

/* その月のPDFのうち、Rev番号が一番大きいもの。無ければ「仮」を使う。 */
function pplan_latestMonthly_(year, month) {
  // 当日計画と同じく、月ごとのフォルダに分けられても拾えるようにしておく
  var files = pplan_filesIn_(PPLAN_CONFIG.MONTHLY_FOLDER);
  var want = pplan_kanjiMonth_(year, month);
  var best = null;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
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
  Logger.log('当日計画: ' + (d.fileName || '—') + '  ' + (d.日付ラベル || '') + '  [' + (d.区分 || '') + ']');
  (d.工場 || []).forEach(function (p) {
    Logger.log('  ' + p.工場 + '  ' + p.計画数 + '本' + (p.内訳 ? '（' + p.内訳.join('＋') + '）' : '') +
               '  社員' + p.社員 + ' 協力' + p.協力 +
               '  (' + p.工程.map(function (x) { return x.工程 + x.計画数; }).join(' ') + ')');
  });
  if (d.error) Logger.log('  エラー: ' + d.error);

  var m = r.monthly || {};
  Logger.log('当月計画: ' + (m.fileName || '—') + (m.仮 ? '（仮）' : ''));
  (m.行 || []).forEach(function (x) {
    Logger.log('  ' + x.サイズ + '  月計 ' + x.月計 + '本  日別' +
               (x.日別が読めた ? x.日別.length + '日ぶん' : '読めず'));
  });
  if (m.error) {
    Logger.log('  エラー: ' + m.error);
    /* ★ 読めなかったときは本文の手がかりを出す。PDFの変換のされ方が変わると
         探す形が合わなくなるので、直すには実際の本文が要る。 */
    try {
      var f = pplan_latestMonthly_(
        Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy')),
        Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MM')));
      if (f) {
        var t = String(shipact_pdfToText_(f.file) || '').replace(/[\r\n]+/g, ' ');
        var at = t.indexOf('50kg');
        Logger.log('  本文の長さ ' + t.length + ' / 「50kg」の位置 ' + at);
        Logger.log('  手がかり: ' + t.substring(Math.max(0, at - 60), at + 400));
      }
    } catch (err) { Logger.log('  手がかりも取れず: ' + String(err)); }
  }
  return r;
}
