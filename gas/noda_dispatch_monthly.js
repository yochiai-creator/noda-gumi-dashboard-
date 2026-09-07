/**
 * 野田組 業務ダッシュボード — 配車表からの月次出荷集計 (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：トラック運行スケジュール（配車表）の「合計」行を全期間ぶん積算して、
 *       月ごとの出荷本数を出す。
 *
 * ★ なぜこれが速いのか
 *   配車表は1ファイルに年度まるごとの列が並んでいる（21列おきに日付ブロック）。
 *   つまり最新の1ファイルを読むだけで、その年度の全日ぶんの合計が取れる。
 *   指図書PDFは1件2〜4秒 × 1,200〜2,400件で数時間かかるのに対し、
 *   こちらは1ファイルの読み取りだけなので数秒で終わる。
 *
 * ★ 指図書との違い（どちらが正しいという話ではなく、性質がちがう）
 *   配車表 … トラックに積む計画。20kと50kの2区分のみ。1ファイルで全期間。
 *   指図書 … 実際に出した1件ごとの記録。容器番号・出荷先・全サイズまで入る。
 *   5kg・8kg・10kg・30kg は配車表の「合計」行に含まれないため、
 *   配車表の月合計は指図書よりわずかに少なく出るはず（7月の実績では
 *   1,428本中22本＝約1.5%が小サイズだった）。
 *
 * ★ 検証してから使うこと
 *   この集計が実際の出荷本数と一致するかは、指図書の集計と突き合わせて
 *   確かめる必要がある。そのための関数が compareShipmentSources()。
 *   両方の月合計を並べて出すので、ずれ方を見てから採否を決める。
 *   （「合計」が「小口」「コンテナ」を含むのか別勘定なのかも、この比較で
 *     見当がつく。だから小口とコンテナも月ごとに出している。）
 *
 * 名前の衝突に注意：内部関数はすべて dmon_ 接頭辞にしてある。
 */

// ===== 公開関数：配車表から月ごとの出荷本数を出す（キャッシュ付き） =====
function getDispatchMonthlyTotals(force) {
  return nc_cached_('dispatchMonthly', force, 1800, getDispatchMonthlyTotals_uncached_);
}

function getDispatchMonthlyTotals_uncached_() {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    file: null,
    months: [],        // [{ 年月, 本数, '20k', '50k', 小口, コンテナ, 日数 }] 古い順
    columnsSeen: 0,    // 走査した日付ブロックの数（構造が読めているかの確認用）
    columnsUsed: 0,    // うち合計が取れたブロック数
    // ★ 上限(MAX_PLAUSIBLE_QTY)を超えて捨てた値。日付シリアル値をはじくための
    //   上限だが、もし本物の本数まで捨てていたら月合計が黙って少なく出てしまう。
    //   捨てた件数と最大値を必ず持ち帰って、気づけるようにしておく。
    rejectedTooLarge: 0,
    rejectedMaxValue: null,
    error: null
  };

  try {
    var file = disp_getLatestFile_(DISPATCH_CONFIG.FOLDER_ID);
    data.file = file.getName();

    var sheet = SpreadsheetApp.open(file).getSheetByName(DISPATCH_CONFIG.SHEET_NAME);
    if (!sheet) throw new Error('シート「' + DISPATCH_CONFIG.SHEET_NAME + '」が見つかりません');
    var values = sheet.getDataRange().getValues();

    var agg = dmon_walkColumns_(values);
    data.columnsSeen = agg.seen;
    data.columnsUsed = agg.used;
    data.rejectedTooLarge = agg.rejected;
    data.rejectedMaxValue = agg.rejectedMax;
    if (agg.rejected > 0) {
      Logger.log('配車表の月次集計: 上限' + DISPATCH_CONFIG.MAX_PLAUSIBLE_QTY +
                 'を超える値を' + agg.rejected + '件捨てました（最大 ' + agg.rejectedMax +
                 '）。本物の本数まで捨てていないか確認してください。');
    }
    data.months = Object.keys(agg.byMonth).sort().map(function (k) {
      var m = agg.byMonth[k];
      return {
        年月: k,
        本数: m.k20 + m.k50,
        '20k': m.k20, '50k': m.k50,
        小口: m.ko20 + m.ko50,
        コンテナ: m.ko20c + m.ko50c,
        日数: Object.keys(m.days).length
      };
    });
  } catch (err) {
    data.error = String(err);
    Logger.log('配車表の月次集計でエラー: ' + String(err));
  }
  return data;
}

// ===== 内部：全列を走査して月ごとに積み上げる =====
// 日付ブロックの見つけ方は disp_findDailyTotals_ と同じ考え方だが、
// あちらは「特定の1日を探す」、こちらは「全部の日を拾う」ので向きが逆。
// 同じ出発日が複数の列ブロックに現れることがある（翌日着の短距離便と
// 週末をまたぐ長距離便など）。それぞれ別の実データを持つので合算する。
function dmon_walkColumns_(values) {
  var GOUKEI = DISPATCH_CONFIG.ROW_GOUKEI;
  var KOGUCHI = DISPATCH_CONFIG.ROW_KOGUCHI;
  var KONTENA = DISPATCH_CONFIG.ROW_KONTENA;
  var MAXQ = DISPATCH_CONFIG.MAX_PLAUSIBLE_QTY;

  var yearRow = values[0] || [];
  var headerRow = values[2] || [];
  var out = { byMonth: {}, seen: 0, used: 0, rejected: 0, rejectedMax: null };

  function plausible(v) {
    if (v === null || v === undefined || v === '') return false;
    var n = Number(v);
    if (isNaN(n) || n < 0) return false;
    if (n > MAXQ) {
      // 日付シリアル値（45000台）ならただのレイアウトずれ。
      // それより小さいのに上限を超えている場合は、本物の本数を捨てている
      // 可能性があるので数えておく。
      if (n < 40000) {
        out.rejected++;
        if (out.rejectedMax === null || n > out.rejectedMax) out.rejectedMax = n;
      }
      return false;
    }
    return true;
  }
  function bucket(ym) {
    if (!out.byMonth[ym]) {
      out.byMonth[ym] = { k20: 0, k50: 0, ko20: 0, ko50: 0, ko20c: 0, ko50c: 0, days: {} };
    }
    return out.byMonth[ym];
  }

  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '');
    // 「8/6(出発)」のような見出しから月日を取る。出発の列だけを対象にする。
    var m = h.match(/^(\d{1,2})\/(\d{1,2})[(（]/);
    if (!m || h.indexOf('出') === -1) continue;

    // 年は1行目の年ラベルから取る。前年の同じ暦日の列も存在するため、
    // ここを飛ばすと去年の数字が混ざる。
    var yearText = String(yearRow[c] || '');
    var ym4 = yearText.match(/(20\d{2})/);
    if (!ym4) continue;
    var year = Number(ym4[1]);
    var mo = Number(m[1]), da = Number(m[2]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;

    out.seen++;
    var ymKey = year + '-' + (mo < 10 ? '0' + mo : mo);
    var b = bucket(ymKey);
    b.days[mo + '/' + da] = true;

    // 合計は20k・50kの両方がそろっている場合だけ採る（片方だけの列は
    // レイアウトのずれや書きかけの可能性があるため）。
    var v20 = values[GOUKEI] ? values[GOUKEI][c] : null;
    var v50 = values[GOUKEI] ? values[GOUKEI][c + 1] : null;
    if (plausible(v20) && plausible(v50)) {
      b.k20 += Number(v20);
      b.k50 += Number(v50);
      out.used++;

      var g20 = values[KOGUCHI] ? values[KOGUCHI][c] : null;
      var g50 = values[KOGUCHI] ? values[KOGUCHI][c + 1] : null;
      if (plausible(g20)) b.ko20 += Number(g20);
      if (plausible(g50)) b.ko50 += Number(g50);
    }

    // コンテナは合計の有無と独立して判定する（合計が空でもコンテナに
    // 値が入っている列が実在する）。
    var c20 = values[KONTENA] ? values[KONTENA][c] : null;
    var c50 = values[KONTENA] ? values[KONTENA][c + 1] : null;
    if (plausible(c20)) b.ko20c += Number(c20);
    if (plausible(c50)) b.ko50c += Number(c50);
  }
  return out;
}

// ===== 公開関数：配車表と指図書の月合計を並べて比べる（検証用） =====
// ★ どちらを使うか決めるための関数。GASエディタから実行してログを見る。
//   配車表のほうが桁違いに速いので、指図書と十分近ければ乗り換えられる。
//   小サイズ（5/8/10/30kg）が配車表に無いぶん、配車表がやや少なく出るはず。
function compareShipmentSources() {
  var disp = getDispatchMonthlyTotals(true);
  var act = getShippingActualsSummary(true);

  var byMonth = {};
  (disp.months || []).forEach(function (m) {
    byMonth[m.年月] = { 年月: m.年月, 配車表: m.本数, 配車表20k: m['20k'], 配車表50k: m['50k'],
                        小口: m.小口, コンテナ: m.コンテナ, 日数: m.日数, 指図書: null };
  });
  (act.months || []).forEach(function (m) {
    if (!byMonth[m.年月]) byMonth[m.年月] = { 年月: m.年月, 配車表: null };
    byMonth[m.年月].指図書 = m.本数;
    byMonth[m.年月].指図書サイズ別 = m.サイズ別;
  });

  var rows = Object.keys(byMonth).sort().map(function (k) {
    var r = byMonth[k];
    if (r.配車表 != null && r.指図書 != null && r.指図書 > 0) {
      r.差 = r.配車表 - r.指図書;
      r.比率 = Math.round((r.配車表 / r.指図書) * 1000) / 1000;
    }
    return r;
  });

  var out = {
    配車表ファイル: disp.file,
    走査した日付ブロック: disp.columnsSeen,
    合計が取れたブロック: disp.columnsUsed,
    指図書の取込済み月: act.pending ? act.pending.取込済みの月 : null,
    注意: '指図書の取込が途中の月は、指図書側が少なく出ます。取込済みの月だけで比べてください。',
    月別: rows,
    配車表エラー: disp.error, 指図書エラー: act.error
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// ===== 動作確認 =====
function testDispatchMonthlyTotals() {
  Logger.log(JSON.stringify(getDispatchMonthlyTotals(true), null, 2));
}
