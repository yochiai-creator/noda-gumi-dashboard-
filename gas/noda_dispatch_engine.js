/**
 * 野田組 業務ダッシュボード — 配車・本日出荷 集計エンジン (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：共有ドライブに日次保存される「トラック運行スケジュール」の
 *       最新分を読み、本日を含む今後7日間の出発（出荷）予定
 *       （運転手・車種・行き先・依頼No）をダッシュボードに渡す。
 *
 * シート構造（重要・複雑なので必読）：
 *   - シート「22年度」に、行＝トラック（運転手ごと）、列＝日付ペア
 *     （前日出発→当日着 / 当日出発→翌日着 …）が年間ずらっと並んでいる。
 *   - 同じ暦日でも「20k」「50k」の車格ごとに別の列ブロックがあり、
 *     さらに列ブロックのレイアウト（車種・運転手ラベルの位置）が
 *     シート内で完全に統一されていないため、固定の列オフセットでは
 *     ラベルを取れない箇所がある。→ 対象セルから左方向に最大12列
 *     さかのぼり、車種キーワード（10t/4t/2t等、全角ｔも正規化）を
 *     含む最初のセルをラベルとして採用する方式にしている。
 *   - 1台のトラックは数日間の周遊ルートを1行で表しており、
 *     セルの内容は「地名（そこへ届ける＝出荷）」と
 *     「←依頼No（そこから持ち帰る＝入荷）」が交互に出てくる。
 *     このエンジンは【地名が入っている列＝出荷】だけを対象にする
 *     （矢印の有無は問わない。矢印「→」付きは金曜出発に集中しており、
 *      平日は矢印なし＝地名のみの出荷が大半のため）。
 *   - 前年の同じ暦日（例: 2025年8/6）の列も存在するため、
 *     年見出し行（1行目）で当年かどうかを必ず確認してから対象にする。
 *
 *   - 運送会社名（浅津運送・倉吉運送など、自社便/庸車便の区分含む）は
 *     各ブロックの先頭行にだけ書かれ、以降の行に見出しとして適用される
 *     （下に向かって同じ会社が続く）。そのため対象行から上方向に
 *     さかのぼり、「運送」または「便」を含む最初のセルを会社名とする。
 *
 *   - シート下部（行39・行40）に「20k合計」「50k合計」という、
 *     21列ごとに繰り返される週ブロック単位の集計ラベルと数値がある
 *     （ラベルが行39、実際の数値はその1行下の行40）。これは1日単位
 *     ではなく「その週ブロック全体」の合計のため、同じ週内の日は
 *     すべて同じ値になる。
 *
 * ★ 既存プロジェクトに同居させる場合は既存コードと名前が被らないよう
 *   設定は DISPATCH_CONFIG、内部関数は disp_ 接頭辞にしてある。
 *
 * 使い方：貼り付け後、関数 testDispatchToday を実行 → 実行ログで確認。
 */

var DISPATCH_CONFIG = {
  // 「トラック運行スケジュール」ファイルの保存フォルダ（配車表と同じ場所）
  FOLDER_ID: '1lSlP68CxFF8A_ISipJniPXr87E1P_E1_',

  // ファイル名「ﾄﾗｯｸ運行ｽｹｼﾞｭｰﾙ2017年度26.8.6.xlsx」の末尾日付を解析
  NAME_PATTERN: /(\d+)\.(\d+)\.(\d+)\.xlsx$/,

  SHEET_NAME: '22年度',

  // 車種の判定キーワード（ラベル探索・全角ｔは正規化して判定）
  VEHICLE_KEYWORDS: ['10t', '4t', '2t', 'トレーラ'],

  // 都道府県名（行き先セルの判定用）
  PREFECTURES: ['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川',
    '新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山',
    '鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'],

  LABEL_SEARCH_BACK: 12,  // ラベルを左方向に何列までさかのぼって探すか

  // 「コンテナ」「小口」「合計」の行位置（0始まり。実際の行35・36・37）。
  // シート全体を通じて常に同じ行にあり、21列おきに日付ブロックが繰り返される。
  // ★ 月次集計（noda_dispatch_monthly.js）も同じ行を読むので、ここ1か所にまとめてある。
  //   シートのレイアウトが変わったときは、ここだけ直せば両方に効く。
  ROW_KONTENA: 34,
  ROW_KOGUCHI: 35,
  ROW_GOUKEI: 36,

  // これを超える値は本数ではない（日付シリアル値等）とみなす
  MAX_PLAUSIBLE_QTY: 3000
};

// ===== 公開関数：ダッシュボード用データを組み立てる（本日＋週間7日分） =====
// ===== 公開関数：キャッシュ経由でダッシュボード用データを返す =====
// ★ 以前は画面を開くたび（フロントは5分ごとに自動更新）に毎回集計し直しており、
//   表示のもたつきの原因になっていた。集計結果を CacheService に持たせて、
//   有効期限内は再集計しないようにする。
//   運行スケジュールは日次更新なので15分。
// force に true を渡すとキャッシュを無視して取り直す（画面の更新ボタン用）。
function getDispatchTodayData(force) {
  return nc_cached_('dispatch', force, 900, getDispatchTodayData_uncached_);
}

// ===== 実際の集計（キャッシュ無し。元の getDispatchTodayData の中身そのまま） =====
function getDispatchTodayData_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    file: null,
    dateLabel: null,
    shipments: [],
    week: [],   // [{ dateLabel: "8/7", shipments: [...] }, ...] 本日を含む7日分
    error: null
  };

  try {
    var file = disp_getLatestFile_(DISPATCH_CONFIG.FOLDER_ID);
    data.file = file.getName();

    var ss = SpreadsheetApp.open(file);
    var sheet = ss.getSheetByName(DISPATCH_CONFIG.SHEET_NAME);
    var values = sheet.getDataRange().getValues();

    var today = new Date();
    data.dateLabel = Utilities.formatDate(today, 'Asia/Tokyo', 'M/d');

    // 土日を除いた平日を8日分集める（カレンダー上の7連続日ではない）
    var collected = 0;
    var dayOffset = 0;
    while (collected < 8) {
      var d = new Date(today.getTime() + dayOffset * 86400000);
      dayOffset++;
      var dow = d.getDay(); // 0=日, 6=土
      if (dow === 0 || dow === 6) continue; // 土日はスキップ

      var dY = d.getFullYear();
      var dLabel = Utilities.formatDate(d, 'Asia/Tokyo', 'M/d');
      var cols = disp_findTodayColumns_(values, dY, dLabel);
      var shipments = disp_extractShipments_(values, cols);
      var dailyTotals = disp_findDailyTotals_(values, dLabel, dY);
      if (collected === 0) data.shipments = shipments; // 本日分（既存の使い方との後方互換）
      data.week.push({
        dateLabel: dLabel, shipments: shipments,
        qty20k: dailyTotals.qty20k, qty50k: dailyTotals.qty50k,
        koguchi20k: dailyTotals.koguchi20k, koguchi50k: dailyTotals.koguchi50k,
        kontena20k: dailyTotals.kontena20k, kontena50k: dailyTotals.kontena50k
      });
      collected++;
    }
  } catch (err) {
    data.error = String(err);
  }

  return data;
}

// ===== フォルダ内の最新xlsxを取得（ファイル名末尾の日付を優先） =====
function disp_getLatestFile_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFilesByType(MimeType.MICROSOFT_EXCEL);
  var best = null, bestKey = -1;
  while (files.hasNext()) {
    var f = files.next();
    var m = DISPATCH_CONFIG.NAME_PATTERN.exec(f.getName());
    if (!m) continue;
    var key = (2000 + parseInt(m[1], 10)) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
    if (key > bestKey) { bestKey = key; best = f; }
  }
  if (!best) throw new Error('トラック運行スケジュールが見つかりません');
  return best;
}

// ===== 「今日出発→翌日着」の見出しを持つ列を、当年のものだけ探す =====
function disp_findTodayColumns_(values, todayY, todayLabel) {
  var cols = [];
  var headerRow = values[2] || [];   // 3行目（見出し行）= index 2
  var yearRow = values[0] || [];     // 1行目（年）= index 0
  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '');
    if (h.indexOf(todayLabel + '(') === 0 || h.indexOf(todayLabel + '（') === 0) {
      if (h.indexOf('出') === -1) continue;
      var yearText = String(yearRow[c] || '');
      if (yearText.indexOf(String(todayY)) === -1) continue; // 前年の同じ暦日を除外
      cols.push(c);
    }
  }
  return cols;
}

// ===== その日の20k合計・50k合計・小口・コンテナを探す（日別・正確な値） =====
// 「合計」（行37固定）「小口」（行36固定）「コンテナ」（行35固定）は
// シート全体を通じて常に同じ行にあり、21列おきに日付ブロックが繰り返される。
// 同じ出発日でも「翌日着」の短距離便と「週末をまたぐ長距離便」など、
// 複数の到着日パターンが並行して存在することがあり、それぞれが別々の
// 実データを持つ（片方が0本でもう片方に本当の本数がある、片方の値しか
// 埋まっていない、というケースも実在する）。そのため、年ラベルが実行時点の
// 年と一致する候補をすべて対象に、各項目・各サイズを独立して合算する
// （「合計」に値が無くても「コンテナ」には値がある、というケースを
//  取りこぼさないよう、項目ごとに判定する）。
function disp_findDailyTotals_(values, todayLabel, todayY) {
  var GOUKEI_ROW = DISPATCH_CONFIG.ROW_GOUKEI;
  var KOGUCHI_ROW = DISPATCH_CONFIG.ROW_KOGUCHI;
  var KONTENA_ROW = DISPATCH_CONFIG.ROW_KONTENA;
  var MAX_PLAUSIBLE_QTY = DISPATCH_CONFIG.MAX_PLAUSIBLE_QTY;
  var headerRow = values[2] || [];
  var yearRow = values[0] || [];

  function isPlausibleQty(v) {
    if (v === null || v === undefined || v === '') return false; // 空欄は候補として扱わない
    var n = Number(v);
    return !isNaN(n) && n >= 0 && n <= MAX_PLAUSIBLE_QTY;
  }

  var sum20k = 0, sum50k = 0, sumK20 = 0, sumK50 = 0, sumC20 = 0, sumC50 = 0;
  var matchedGoukei = 0, matchedAny = 0;

  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '');
    if ((h.indexOf(todayLabel + '(') === 0 || h.indexOf(todayLabel + '（') === 0) && h.indexOf('出') !== -1) {
      var yearText = String(yearRow[c] || '');
      if (yearText.indexOf(String(todayY)) === -1) continue; // 年が一致しない区画は対象外
      matchedAny++;

      // 合計（20k/50kとも妥当な値が揃っている場合のみ採用）
      var v20 = values[GOUKEI_ROW] ? values[GOUKEI_ROW][c] : null;
      var v50 = values[GOUKEI_ROW] ? values[GOUKEI_ROW][c + 1] : null;
      if (isPlausibleQty(v20) && isPlausibleQty(v50)) {
        sum20k += Number(v20);
        sum50k += Number(v50);
        matchedGoukei++;

        var k20 = values[KOGUCHI_ROW] ? values[KOGUCHI_ROW][c] : null;
        var k50 = values[KOGUCHI_ROW] ? values[KOGUCHI_ROW][c + 1] : null;
        sumK20 += isPlausibleQty(k20) ? Number(k20) : 0;
        sumK50 += isPlausibleQty(k50) ? Number(k50) : 0;
      }

      // コンテナ（20k・50kの片方だけでも値があれば採用。合計の有無とは独立して判定）
      var c20 = values[KONTENA_ROW] ? values[KONTENA_ROW][c] : null;
      var c50 = values[KONTENA_ROW] ? values[KONTENA_ROW][c + 1] : null;
      if (isPlausibleQty(c20)) sumC20 += Number(c20);
      if (isPlausibleQty(c50)) sumC50 += Number(c50);
    }
  }

  if (matchedAny === 0) {
    return { qty20k: null, qty50k: null, koguchi20k: null, koguchi50k: null, kontena20k: null, kontena50k: null };
  }
  return {
    qty20k: matchedGoukei > 0 ? sum20k : null,
    qty50k: matchedGoukei > 0 ? sum50k : null,
    koguchi20k: matchedGoukei > 0 ? sumK20 : null,
    koguchi50k: matchedGoukei > 0 ? sumK50 : null,
    kontena20k: sumC20,
    kontena50k: sumC50
  };
}

// ===== 対象列から「地名が入っている行＝出荷」を抜き出す =====
function disp_extractShipments_(values, targetCols) {
  var results = [];
  targetCols.forEach(function (c) {
    for (var r = 0; r < values.length; r++) {
      var cell = values[r][c];
      if (!cell) continue;
      var cellText = String(cell);
      if (!disp_containsPrefecture_(cellText)) continue;

      var labelInfo = disp_findVehicleLabel_(values, r, c);
      var company = disp_findCompany_(values, r, labelInfo ? labelInfo.col : c);
      var orderNo = disp_extractOrderNo_(cellText);
      results.push({
        vehicle: labelInfo ? disp_vehicleTypeOnly_(labelInfo.text) : '(不明)',
        company: company || '(不明)',
        destination: cellText.replace(/\n/g, ' ').trim(),
        orderNo: orderNo
      });
    }
  });
  return results;
}

function disp_containsPrefecture_(text) {
  return DISPATCH_CONFIG.PREFECTURES.some(function (p) { return text.indexOf(p) !== -1; });
}

// ===== 車種・運転手ラベルを左方向にさかのぼって探す（全角ｔを正規化） =====
// 戻り値: { text: ラベル文字列, col: 見つかった列番号 } または null
function disp_findVehicleLabel_(values, r, c) {
  var back = DISPATCH_CONFIG.LABEL_SEARCH_BACK;
  for (var lc = c - 1; lc >= Math.max(0, c - back); lc--) {
    var v = values[r][lc];
    if (!v) continue;
    var norm = String(v).replace(/ｔ/g, 't');
    var hit = DISPATCH_CONFIG.VEHICLE_KEYWORDS.some(function (k) { return norm.indexOf(k) !== -1; });
    if (hit) return { text: norm.replace(/\n/g, ' ').trim(), col: lc };
  }
  return null;
}

// ===== 会社名（運送会社＋自社便/庸車便）を上方向にさかのぼって探す =====
// 会社名は各ブロックの先頭行にだけ書かれ、以降の行に見出しとして適用される。
// 車種ラベルの列から少し左〜同列あたりの範囲で「運送」「便」を含むセルを、
// 現在行から上方向に探す。
function disp_findCompany_(values, r, labelCol) {
  var colRange = 4, maxUp = 60;
  for (var rr = r; rr >= Math.max(0, r - maxUp); rr--) {
    for (var cc = labelCol - colRange; cc <= labelCol + 1; cc++) {
      if (cc < 0) continue;
      var v = values[rr][cc];
      if (v && (String(v).indexOf('運送') !== -1 || String(v).indexOf('便') !== -1)) {
        return String(v).replace(/\n/g, ' ').trim();
      }
    }
  }
  return null;
}

// ===== 行き先セルの中に依頼No（4〜5桁の数字）が含まれていれば拾う =====
// 「7000L」のような容量表記（数字の直後にL）は依頼Noではないので除外する。
function disp_extractOrderNo_(text) {
  var m = text.match(/\d{4,5}(?!L)/);
  return m ? m[0] : null;
}

// ===== ラベル文字列（車種＋運転手名）から車種部分だけを取り出す =====
// 例: "10t平 野村" → "10t平" / "4t平ワイド 井上" → "4t平ワイド"
function disp_vehicleTypeOnly_(label) {
  var m = /^([0-9]+t[^\s]*)/.exec(label);
  return m ? m[1] : label;
}

// ===== 動作確認：実行するとログに集計結果が出る =====
function testDispatchToday() {
  Logger.log(JSON.stringify(getDispatchTodayData(), null, 2));
}