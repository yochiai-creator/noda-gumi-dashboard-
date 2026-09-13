/**
 * 野田組 業務ダッシュボード — アーム（建機ブーム・アーム）の出荷予定
 * ------------------------------------------------------------------
 * 役割：配車タブに「いつ・どの機種の何号機が・どこへ出るか」を出す。
 *
 * ★ どこから取るのか
 *   元データは「'001_アーム出荷明細」フォルダに毎週入る
 *   「出荷予定　日程表変更A(26年9月4日).xlsm」（4〜7MB）。
 *   これを毎回スプレッドシートに変換して読むのは重すぎる（変換だけで十数秒）。
 *
 *   すでに別プロジェクト「アーム出荷明細pdf生成」が、
 *   .xlsm が更新されるたび（15分おきのポーリング）に中身を読み、
 *   ・「アーム機種別出荷明細_YYYY-MM-DD.pdf」
 *   ・「arm_pdf_snapshot.json」（図番_号機 → 中身 のマップ）
 *   を「①出荷作業用」フォルダに書き出している。
 *   このJSONは落合さんが見ているPDFとまったく同じ内容なので、
 *   こちらはそれを読むだけにする（Driveのファイルを1つ読むだけ＝速い）。
 *
 * ★ 古いものを黙って出さない
 *   PDF生成側が止まるとJSONも古いままになる。元の .xlsm の更新日時と
 *   見比べて、JSONのほうが古ければ stale を立てて画面に出す。
 *
 * 名前の衝突に注意：GASは全ファイルが同一グローバルスコープなので、
 * このファイルの内部関数はすべて arm_ 接頭辞にしてある。
 */

var ARM_CONFIG = {
  // PDFとJSONの置き場（「①出荷作業用」）
  OUT_FOLDER_ID: '1-RrriADJSmBt2a7HsYpb_c8TUHHJpxkz',
  SNAPSHOT_NAME: 'arm_pdf_snapshot.json',
  PDF_PREFIX: 'アーム機種別出荷明細_',

  // 元の .xlsm 置き場（「'001_アーム出荷明細」）。新しさの確認だけに使う。
  SRC_FOLDER_ID: '1NS4WoClO0xlGWSxvFimFcqFGUT0jOKQL',
  SRC_KEYWORD: '日程表変更',

  DAYS: 31   // PDF生成側と同じ「直近1か月」
};

var ARM_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ===== 公開関数：アームの出荷予定（画面用・キャッシュ付き） =====
function getArmShipPlan(force) {
  return nc_cached_('armPlan', force === true, 600, getArmShipPlan_uncached_);
}

function getArmShipPlan_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    days: [],          // [{ date, label, weekday, count, byDest, rows }] 出荷日の古い順
    total: 0,
    pdfUrl: null,
    pdfName: null,
    sourceName: null,  // 元になった .xlsm
    snapshotAt: null,  // JSONがいつ作られたか
    stale: false,      // 元の .xlsm のほうが新しい＝PDF生成が追いついていない
    error: null
  };

  try {
    var snap = arm_readSnapshot_();
    if (!snap) {
      data.error = 'アームの出荷予定（' + ARM_CONFIG.SNAPSHOT_NAME + '）が見つかりません。' +
                   '「アーム出荷明細pdf生成」が動いているか確認してください。';
      return data;
    }
    data.snapshotAt = Utilities.formatDate(snap.updatedAt, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

    var src = arm_latestSource_();
    if (src) {
      data.sourceName = src.name;
      // 元のExcelのほうが新しければ、この予定は1周遅れている
      data.stale = src.updatedAt.getTime() > snap.updatedAt.getTime();
    }

    var pdf = arm_latestPdf_();
    if (pdf) { data.pdfUrl = pdf.url; data.pdfName = pdf.name; }

    data.days = arm_buildDays_(snap.map, new Date());
    for (var i = 0; i < data.days.length; i++) data.total += data.days[i].count;
  } catch (err) {
    data.error = String(err);
    Logger.log('アーム出荷予定の取得でエラー: ' + String(err));
  }
  return data;
}

/**
 * スナップショット（図番_号機 → 中身）を出荷日ごとにまとめる（純関数）。
 * @param {Object} map   arm_pdf_snapshot.json の中身
 * @param {Date}   now   基準日（この日の0時から DAYS 日ぶん）
 * @return {Array} 出荷日の古い順
 */
function arm_buildDays_(map, now) {
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var end = start + ARM_CONFIG.DAYS * 86400000;

  var byDate = {};
  Object.keys(map || {}).forEach(function (key) {
    var v = map[key];
    if (!v || typeof v.ship !== 'number') return;
    // ship はミリ秒。日付の0時に丸めてから範囲を見る
    var d = new Date(v.ship);
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var ms = day.getTime();
    if (ms < start || ms >= end) return;

    var dateKey = arm_dateKey_(day);
    if (!byDate[dateKey]) {
      byDate[dateKey] = {
        date: dateKey,
        label: (day.getMonth() + 1) + '/' + day.getDate(),
        weekday: ARM_WEEKDAYS[day.getDay()],
        count: 0, byDest: [], rows: [], __dest: {}
      };
    }
    var g = byDate[dateKey];
    var dest = String(v.dest || '').trim() || '（出荷先なし）';
    // ★ 図番と号機は値の中に無い。キーが「図番||号機」なので、そこから取る。
    //   （PDF生成側は同じ出荷物を見分ける鍵としてこの形で持っている）
    var id = arm_splitKey_(key);
    g.count++;
    g.__dest[dest] = (g.__dest[dest] || 0) + 1;
    g.rows.push({
      kiki: String(v.kiki || ''), kishu: String(v.kishu || ''),
      zu: v.zu != null ? String(v.zu) : id.zu,
      go: v.go != null ? String(v.go) : id.go,
      spec: String(v.spec || ''), dest: dest,
      // 情報①は「グレー」などの塗装色の指定。現場が知りたいので出す。
      info: String(v.info || ''),
      insp: String(v.insp || ''), is13: v.is13 === true,
      key: key
    });
  });

  return Object.keys(byDate).sort().map(function (k) {
    var g = byDate[k];
    g.byDest = Object.keys(g.__dest).map(function (name) {
      return { 名: name, 台数: g.__dest[name] };
    }).sort(function (a, b) { return b.台数 - a.台数; });
    delete g.__dest;
    // PDFと同じ並び（13tonを後ろに、あとは図番順）
    g.rows.sort(function (a, b) {
      if (a.is13 !== b.is13) return a.is13 ? 1 : -1;
      return a.zu < b.zu ? -1 : a.zu > b.zu ? 1 : (Number(a.go) - Number(b.go));
    });
    return g;
  });
}

/* 「図番||号機」を分ける。号機が空のときは末尾が「||」になる。
   ★ 後ろの「||」で切る（図番に「||」が入ることは無いが、入っても図番側に残す）。 */
function arm_splitKey_(key) {
  var k = String(key || '');
  var i = k.lastIndexOf('||');
  if (i < 0) return { zu: k, go: '' };
  return { zu: k.substring(0, i), go: k.substring(i + 2) };
}

function arm_dateKey_(d) {
  var p = function (n) { return n < 10 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ===== 内部：スナップショットJSONを読む =====
function arm_readSnapshot_() {
  var folder = DriveApp.getFolderById(ARM_CONFIG.OUT_FOLDER_ID);
  var it = folder.getFilesByName(ARM_CONFIG.SNAPSHOT_NAME);
  if (!it.hasNext()) return null;
  var f = it.next();
  return { map: JSON.parse(f.getBlob().getDataAsString('UTF-8')), updatedAt: f.getLastUpdated() };
}

// ===== 内部：一番新しい「日程表変更」.xlsm =====
// ★ ファイル名の日付ではなく更新日時で見る。名前の日付は「その週の版」を表していて、
//   同じ名前のまま中身だけ差し替わることがあるため。
function arm_latestSource_() {
  var folder = DriveApp.getFolderById(ARM_CONFIG.SRC_FOLDER_ID);
  var it = folder.getFiles(), best = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(ARM_CONFIG.SRC_KEYWORD) < 0) continue;
    if (!best || f.getLastUpdated().getTime() > best.getLastUpdated().getTime()) best = f;
  }
  return best ? { name: best.getName(), updatedAt: best.getLastUpdated() } : null;
}

// ===== 内部：一番新しいアーム出荷明細PDF =====
function arm_latestPdf_() {
  var folder = DriveApp.getFolderById(ARM_CONFIG.OUT_FOLDER_ID);
  var it = folder.getFiles(), best = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(ARM_CONFIG.PDF_PREFIX) !== 0) continue;
    if (!best || f.getLastUpdated().getTime() > best.getLastUpdated().getTime()) best = f;
  }
  return best ? { name: best.getName(), url: best.getUrl() } : null;
}

// ===== 公開関数：中身を確かめる（診断用） =====
function アームの出荷予定を確認する() {
  var d = getArmShipPlan(true);
  if (d.error) { Logger.log('エラー: ' + d.error); return d; }
  Logger.log('元ファイル: ' + d.sourceName);
  Logger.log('予定の作成日時: ' + d.snapshotAt + (d.stale ? '（元のExcelのほうが新しい）' : ''));
  Logger.log('PDF: ' + d.pdfName);
  Logger.log('合計 ' + d.total + '台 / ' + d.days.length + '日');
  d.days.slice(0, 8).forEach(function (g) {
    Logger.log('  ' + g.label + '(' + g.weekday + ') ' + g.count + '台  ' +
               g.byDest.map(function (x) { return x.名 + ' ' + x.台数; }).join(' / '));
  });
  return d;
}
