/**
 * 野田組 業務ダッシュボード — 配車表（トラック運行スケジュール）の詳細グリッド
 * ------------------------------------------------------------------
 * 役割：配車表を「トラック × 日付」の表として画面に出し、アプリから編集できるようにする。
 *
 * ★ なぜGoogleスプレッドシートに移すのか
 *   元の配車表は .xlsx で、しかも毎日新しいファイルとして保存されている
 *   （ﾄﾗｯｸ運行ｽｹｼﾞｭｰﾙ...26.9.3.xlsx / ...26.9.4.xlsx …）。
 *   ・GASは .xlsx を読めるが書き込めない
 *   ・書けたとしても翌日また新しいファイルが来るので、編集が消える
 *   落合さんの判断で「アプリ側を正にする」ことにしたので、最新の .xlsx を
 *   一度だけGoogleスプレッドシートに変換し、以後はそれを読み書きする。
 *   変換後は基幹システムからのExcel出力を止めてもらう運用になる。
 *
 * ★ シートの構造（実物を解析して確定した）
 *   129行 × 2226列。21列で1週間のブロックが横に並ぶ。
 *   ブロックの先頭は「行2が『貸切便』の列」で見分けられる。
 *     +0            運送会社（グループの先頭行だけに入っている）
 *     +1            トラック名（車種＋運転手）
 *     +2 〜 +7      行き先6日分  ← ここを編集する
 *     +8            ｺﾝﾃﾅ／小口／合計／すべり止め のラベル
 *     +9 〜 +20     本数（20k/50k × 6日）
 *   行3〜33がトラック31台。行34〜37が集計行。
 *   行1に '20k'/'50k' が入っているのが本数の列、空なのが行き先の列。
 *   この違いで両者を確実に区別する（見出しの日付は両方に同じものが入る）。
 *
 * ★ セルの中身は4種類
 *   行き先（県名など）／ ←依頼No（引取）／ × （運休）／ お休み
 *
 * 名前の衝突に注意：内部関数はすべて dgrid_ 接頭辞にしてある。
 */

var DISP_GRID_CONFIG = {
  SHEET_NAME: '22年度',
  BLOCK_MARK: '貸切便',      // 行2にこれが入っている列がブロックの先頭
  BLOCK_WIDTH: 21,
  COL_COMPANY: 0,           // ブロック先頭からの相対列
  COL_TRUCK: 1,
  COL_DAY_FIRST: 2,
  COL_DAY_LAST: 7,
  ROW_YEAR: 0,              // 0始まり
  ROW_SUB: 1,               // '20k'/'50k' が入る行
  ROW_HEADER: 2,            // 「9/7(月)出 9/8(火)着」
  ROW_TRUCK_FIRST: 3,
  ROW_TRUCK_LAST: 33,

  PROP_SHEET_ID: 'dispatchGrid.sheetId',
  PROP_BACKUP_ID: 'dispatchGrid.backupId',
  SPREADSHEET_TITLE: 'トラック運行スケジュール（アプリ編集用）',
  EDIT_LOG_SHEET: '編集ログ'
};

// ===== 公開関数：最新のExcelをGoogleスプレッドシートに変換する（一度だけ） =====
// ★ 変換前のExcelはそのまま残る。変換したスプレッドシートのバックアップも
//   1つ作っておく（アプリから書き込む前の状態に戻せるようにするため）。
function 配車表をスプレッドシートに移す() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty(DISP_GRID_CONFIG.PROP_SHEET_ID);
  if (existing) {
    var url = 'https://docs.google.com/spreadsheets/d/' + existing + '/edit';
    Logger.log('すでに移してあります: ' + url);
    Logger.log('作り直したい場合は 配車表の移行をやめる を実行してから、もう一度実行してください。');
    return { ok: true, created: false, sheetId: existing, url: url };
  }

  var src = disp_getLatestFile_(DISPATCH_CONFIG.FOLDER_ID);
  Logger.log('元にするExcel: ' + src.getName());

  // Drive APIでMIMEタイプを変えてコピー＝Googleスプレッドシートに変換
  // ★ supportsAllDrives が必須。配車表は共有ドライブにあるので、これを付けないと
  //   ファイルは存在するのに「File not found」で失敗する（実際にそれで1回失敗した）。
  var converted = Drive.Files.copy(
    { name: DISP_GRID_CONFIG.SPREADSHEET_TITLE, mimeType: MimeType.GOOGLE_SHEETS },
    src.getId(),
    { supportsAllDrives: true }
  );
  var ss = SpreadsheetApp.openById(converted.id);

  // 構造が読めるか確認してから採用する（読めないものを本物にしてはいけない）
  var check = dgrid_validate_(ss);
  if (!check.ok) {
    try { Drive.Files.remove(converted.id, { supportsAllDrives: true }); } catch (e) {}
    Logger.log('★ 変換したシートの構造が読めませんでした: ' + check.reason);
    Logger.log('  移行を中止しました（作ったシートは削除しました）。');
    return { ok: false, error: check.reason };
  }

  // アプリから書き込む前の状態を1つ残す
  var backup = Drive.Files.copy(
    { name: DISP_GRID_CONFIG.SPREADSHEET_TITLE + '（移行時のバックアップ）' },
    converted.id,
    { supportsAllDrives: true }
  );

  props.setProperty(DISP_GRID_CONFIG.PROP_SHEET_ID, converted.id);
  props.setProperty(DISP_GRID_CONFIG.PROP_BACKUP_ID, backup.id);
  nc_forget_('dispatch');
  nc_forget_('dispatchMonthly');
  nc_forget_('dispatchGrid');

  var url2 = ss.getUrl();
  Logger.log('移しました。これから先はこのスプレッドシートが本物です:');
  Logger.log('  ' + url2);
  Logger.log('  トラック' + check.trucks + '台 / 週ブロック' + check.blocks + '個 / 日付' + check.days + '日ぶん');
  Logger.log('バックアップ: https://docs.google.com/spreadsheets/d/' + backup.id + '/edit');
  Logger.log('');
  Logger.log('基幹システムからのExcel出力を止めてください（止めなくても壊れませんが、');
  Logger.log('Excel側の変更はアプリに反映されなくなります）。');
  return { ok: true, created: true, sheetId: converted.id, url: url2,
           backupId: backup.id, 構造: check };
}

// ===== 公開関数：移行をやめて元のExcelを読む状態に戻す =====
// ★ 作ったスプレッドシートは消さない（編集内容が消えると困るため）。
//   参照をやめるだけ。
function 配車表の移行をやめる() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(DISP_GRID_CONFIG.PROP_SHEET_ID);
  props.deleteProperty(DISP_GRID_CONFIG.PROP_SHEET_ID);
  nc_forget_('dispatch');
  nc_forget_('dispatchMonthly');
  nc_forget_('dispatchGrid');
  Logger.log('元のExcelを読む状態に戻しました。');
  if (id) {
    Logger.log('作ったスプレッドシートは残してあります（編集内容を消さないため）:');
    Logger.log('  https://docs.google.com/spreadsheets/d/' + id + '/edit');
  }
  return { ok: true, 参照をやめたシート: id || null };
}

// ===== 内部：アプリが本物として読むシートを返す =====
// 移行済みならGoogleスプレッドシート、まだなら最新のExcel。
// ★ 既存の日次集計・月次集計もこれを通すので、移行しても画面はそのまま動く。
function dgrid_getSourceSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(DISP_GRID_CONFIG.PROP_SHEET_ID);
  if (id) {
    var sheet = SpreadsheetApp.openById(id).getSheetByName(DISP_GRID_CONFIG.SHEET_NAME);
    if (sheet) return { sheet: sheet, source: 'スプレッドシート', editable: true, id: id };
    // シート名が変わっていたら気づけるようにする
    Logger.log('★ 移行先に「' + DISP_GRID_CONFIG.SHEET_NAME + '」シートがありません。Excelを読みます。');
  }
  var file = disp_getLatestFile_(DISPATCH_CONFIG.FOLDER_ID);
  return { sheet: SpreadsheetApp.open(file).getSheetByName(DISP_GRID_CONFIG.SHEET_NAME),
           source: 'Excel', editable: false, name: file.getName() };
}

// ===== 内部：構造が読めるかを確かめる =====
function dgrid_validate_(ss) {
  try {
    var sheet = ss.getSheetByName(DISP_GRID_CONFIG.SHEET_NAME);
    if (!sheet) return { ok: false, reason: 'シート「' + DISP_GRID_CONFIG.SHEET_NAME + '」がありません' };
    var values = sheet.getDataRange().getValues();
    var blocks = dgrid_findBlocks_(values);
    if (blocks.length === 0) return { ok: false, reason: 'ブロック（行2の「貸切便」）が見つかりません' };
    var trucks = dgrid_readTrucks_(values, blocks[0]);
    if (trucks.length === 0) return { ok: false, reason: 'トラックの行が読めません' };
    var days = blocks.reduce(function (a, b) { return a + b.days.length; }, 0);
    if (days === 0) return { ok: false, reason: '日付の見出しが読めません' };
    return { ok: true, blocks: blocks.length, trucks: trucks.length, days: days };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

// ===== 内部：週ブロックを見つける =====
// 行2が「貸切便」の列がブロックの先頭。そこから相対位置で各列が決まる。
function dgrid_findBlocks_(values) {
  var C = DISP_GRID_CONFIG;
  var header = values[C.ROW_HEADER] || [];
  var sub = values[C.ROW_SUB] || [];
  var yearRow = values[C.ROW_YEAR] || [];
  var out = [];

  for (var c = 0; c < header.length; c++) {
    if (String(header[c] || '').trim() !== C.BLOCK_MARK) continue;
    var block = { base: c, companyCol: c + C.COL_COMPANY, truckCol: c + C.COL_TRUCK, days: [] };
    for (var d = C.COL_DAY_FIRST; d <= C.COL_DAY_LAST; d++) {
      var col = c + d;
      var h = String(header[col] || '');
      // ★ 本数の列は行1に '20k'/'50k' が入っている。行き先の列は空。
      //   見出しの日付は両方に同じものが入るので、ここで区別しないと
      //   本数の列を行き先として編集してしまう。
      if (String(sub[col] || '').trim() !== '') continue;
      var m = h.match(/^(\d{1,2})\/(\d{1,2})\s*[(（]/);
      if (!m || h.indexOf('出') === -1) continue;
      var ym = String(yearRow[col] || '').match(/(20\d{2})/);
      if (!ym) continue;
      var y = Number(ym[1]), mo = Number(m[1]), da = Number(m[2]);
      if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
      var p = function (n) { return n < 10 ? '0' + n : String(n); };
      /* ★ 金曜だけ「9/11(金)出 ⏎ 9/12(土)着」と「9/11(金)出 ⏎ 9/14(月)着」の
           2列に分かれている（土着・土積）。出発日は同じなので、見出しの
           1行目だけでは2列を見分けられない。着日も持たせる。 */
      var parts = h.split('\n');
      block.days.push({
        col: col,
        date: y + '-' + p(mo) + '-' + p(da),
        label: mo + '/' + da,
        header: parts[0].trim(),
        arrive: (parts[1] || '').trim()
      });
    }
    if (block.days.length > 0) {
      // ★ 本数の列を1か所で決めておく。行1が '20k' で、行2の見出しが
      //   行き先の列と同じ列が20kの本数列。その右隣が50k。
      //   （位置の計算に頼らず見出しで突き合わせる。列の並びは年度で変わる）
      block.days.forEach(function (d) {
        var want = String(header[d.col] || '');
        d.q20col = null; d.q50col = null;
        for (var q = block.base; q < block.base + C.BLOCK_WIDTH; q++) {
          if (String(sub[q] || '').trim() !== '20k') continue;
          if (String(header[q] || '') !== want) continue;
          d.q20col = q; d.q50col = q + 1;
          break;
        }
      });
      out.push(block);
    }
  }
  return out;
}

// ===== 内部：本数として使える値か（日付シリアル値や桁違いを弾く） =====
function dgrid_qty_(v) {
  if (v === '' || v == null) return null;
  var n = Number(v);
  if (isNaN(n) || n < 0 || n > DISPATCH_CONFIG.MAX_PLAUSIBLE_QTY) return null;
  return n;
}

// ===== 内部：トラックの一覧を読む（ブロックごとにラベルが繰り返される） =====
function dgrid_readTrucks_(values, block) {
  var C = DISP_GRID_CONFIG;
  var out = [];
  var company = '';
  for (var r = C.ROW_TRUCK_FIRST; r <= C.ROW_TRUCK_LAST; r++) {
    var row = values[r] || [];
    // ★ 会社名は「浅津運送⏎庸車便」のように改行が入っている。そのまま渡すと
    //   画面での折り返しが読めなくなるので、空白1つに正規化する。
    var co = String(row[block.companyCol] || '').replace(/\s*\n\s*/g, ' ').trim();
    // 運送会社はグループの先頭行にだけ入っていて、以降の行に適用される
    if (co) company = co;
    var name = String(row[block.truckCol] || '').replace(/\n/g, ' ').trim();
    if (!name) continue;
    out.push({ row: r, company: company, truck: name });
  }
  return out;
}

/* マスの中身が依頼ナンバーだけかどうか。
   ★ 地名の入ったマスから数字を拾ってはいけない。「広島県東広島市 (4600L×1)」の
     4600 を依頼Noと間違える。数字と矢印・記号だけのマスに限る。
   例: 「↓60688」「10428→」「30412,30458→ 30413」「←70253, 70255,70256」 */
function dgrid_isOrderNoOnly_(text) {
  var t = String(text || '').trim();
  if (t === '' || !/\d{4,6}/.test(t)) return false;
  return /^[\s0-9,，、.()（）\-ー–—→←↓↑]+$/.test(t);
}

/* マスから依頼Noを拾って、指図書PDFのリンクまで解決する。
   ★ 依頼No→PDFの検索はヤードマップと同じ関数を使う（6時間キャッシュ付き）。
     同じプロジェクトなので、そのまま呼べる。
   ★ cache は1週ぶんの呼び出しで使い回す入れもの（同じ番号を何度も引かない）。 */
function dgrid_cellOrders_(text, cache) {
  if (!dgrid_isOrderNoOnly_(text)) return null;
  var nos = yard_extractOrderNumbers_(text);
  if (!nos || nos.length === 0) return null;
  var out = [];
  for (var i = 0; i < nos.length; i++) {
    var no = nos[i];
    if (!(no in cache)) {
      cache[no] = yard_findOrderPdf_(no);
    }
    out.push({ no: no, url: cache[no].url, date: cache[no].date });
  }
  return out;
}

// ===== 内部：セルの中身を種類に分ける =====
function dgrid_cellKind_(text) {
  var t = String(text || '').trim();
  if (!t) return { kind: '', text: '' };
  if (t === '×' || t === 'x' || t === 'X') return { kind: '運休', text: t };
  if (/^お休み/.test(t)) return { kind: '休み', text: t };
  if (t.charAt(0) === '←') return { kind: '引取', text: t };
  return { kind: '出荷', text: t };
}

// ===== 公開関数：トラック×日付のグリッドを返す（キャッシュ付き） =====
// weekOffset: 0=今週を含むブロック、-1=前の週、+1=次の週
function getDispatchGridData(force, weekOffset) {
  var off = Number(weekOffset) || 0;
  return nc_cached_('dispatchGrid_' + off, force, 300, function () {
    return getDispatchGridData_uncached_(off);
  });
}

function getDispatchGridData_uncached_(weekOffset) {
  var data = {
    updated: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    source: null,        // 'スプレッドシート' か 'Excel'
    editable: false,     // Excelのままなら編集できない
    sheetUrl: null,
    weekOffset: Number(weekOffset) || 0,
    weekLabel: null,
    hasPrev: false, hasNext: false,
    days: [],            // [{ col, date, label, header }]
    trucks: [],          // [{ row, company, truck, cells: { 列番号: {kind,text} } }]
    totals: {},          // 日付列 → { 合計20k, 合計50k, 小口, コンテナ }
    error: null
  };

  try {
    var src = dgrid_getSourceSheet_();
    if (!src.sheet) throw new Error('シート「' + DISP_GRID_CONFIG.SHEET_NAME + '」が読めません');
    data.source = src.source;
    data.editable = src.editable;
    if (src.editable) data.sheetUrl = src.sheet.getParent().getUrl();
    else data.excelName = src.name;

    var values = src.sheet.getDataRange().getValues();
    var blocks = dgrid_findBlocks_(values);
    if (blocks.length === 0) throw new Error('週ブロックが見つかりません');

    // 今日を含むブロックを探す（無ければ今日より後で一番近いブロック）
    var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var idx = -1;
    for (var i = 0; i < blocks.length; i++) {
      var ds = blocks[i].days;
      if (ds[0].date <= todayStr && todayStr <= ds[ds.length - 1].date) { idx = i; break; }
    }
    if (idx < 0) {
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].days[0].date >= todayStr) { idx = j; break; }
      }
    }
    if (idx < 0) idx = blocks.length - 1;

    idx = Math.min(blocks.length - 1, Math.max(0, idx + data.weekOffset));
    var block = blocks[idx];
    data.hasPrev = idx > 0;
    data.hasNext = idx < blocks.length - 1;
    data.days = block.days;
    data.weekLabel = block.days[0].label + '〜' + block.days[block.days.length - 1].label;

    var trucks = dgrid_readTrucks_(values, block);
    var pdfCache = {};   // 同じ依頼Noを週のあいだで何度も検索しない
    data.trucks = trucks.map(function (t) {
      var cells = {};
      block.days.forEach(function (d) {
        var row = values[t.row] || [];
        var k = dgrid_cellKind_(row[d.col]);
        // ★ その便の本数。行き先が空でも本数だけ入っている行があるので、
        //   本数があればマスを作る（画面では本数だけ出る）。
        var q20 = d.q20col == null ? null : dgrid_qty_(row[d.q20col]);
        var q50 = d.q50col == null ? null : dgrid_qty_(row[d.q50col]);
        if (k.text || q20 || q50) {
          var cell = { kind: k.kind, text: k.text, q20: q20, q50: q50 };
          // マスが依頼ナンバーなら、指図書PDFまで引いておく
          var orders = dgrid_cellOrders_(k.text, pdfCache);
          if (orders) cell.orders = orders;
          cells[d.col] = cell;
        }
      });
      return { row: t.row, company: t.company, truck: t.truck, cells: cells };
    });

    // その週の本数（既存の日次集計と同じ行を読む）
    data.totals = dgrid_readTotals_(values, block);
  } catch (err) {
    data.error = String(err);
    Logger.log('配車グリッドの取得でエラー: ' + String(err));
  }
  return data;
}

// ===== 内部：日ごとの合計・小口・コンテナを読む =====
// ★ 本数は「行1に20k/50kが入っている列」に入っている。行き先の列とは別物。
//   同じ日付の見出しが両方に付くので、行1で区別して本数の列だけを読む。
function dgrid_readTotals_(values, block) {
  var out = {};
  var num = dgrid_qty_;

  block.days.forEach(function (d) {
    var t = { 合計20k: null, 合計50k: null, 小口: null, コンテナ: null };
    // 本数の列は dgrid_findBlocks_ で見出しを突き合わせて決めてある
    var c = d.q20col;
    if (c != null) {
      t.合計20k = num((values[DISPATCH_CONFIG.ROW_GOUKEI] || [])[c]);
      t.合計50k = num((values[DISPATCH_CONFIG.ROW_GOUKEI] || [])[d.q50col]);
      var k20 = num((values[DISPATCH_CONFIG.ROW_KOGUCHI] || [])[c]);
      var k50 = num((values[DISPATCH_CONFIG.ROW_KOGUCHI] || [])[d.q50col]);
      t.小口 = (k20 || 0) + (k50 || 0);
      var c20 = num((values[DISPATCH_CONFIG.ROW_KONTENA] || [])[c]);
      var c50 = num((values[DISPATCH_CONFIG.ROW_KONTENA] || [])[d.q50col]);
      t.コンテナ = (c20 || 0) + (c50 || 0);
    }
    out[d.col] = t;
  });
  return out;
}

// ===== 公開関数：セルを1つ書き換える =====
// ★ 配車表の本体を書き換えるので、範囲の検証を厳しくしてある。
//   ・移行済み（Googleスプレッドシート）でなければ書かない
//   ・行はトラックの行、列はそのブロックの「行き先の列」でなければ書かない
//     （本数の列やラベル列に書き込むと表が壊れる）
//   ・誰がいつ何を変えたかを編集ログに残す
function setDispatchCell(req) {
  var out = { ok: false, error: null };
  try {
    var row = Number(req && req.row), col = Number(req && req.col);
    var value = req && req.value != null ? String(req.value) : '';

    var id = PropertiesService.getScriptProperties().getProperty(DISP_GRID_CONFIG.PROP_SHEET_ID);
    if (!id) throw new Error('まだスプレッドシートに移していないので編集できません。' +
                             '配車表をスプレッドシートに移す を実行してください。');

    var ss = SpreadsheetApp.openById(id);
    var sheet = ss.getSheetByName(DISP_GRID_CONFIG.SHEET_NAME);
    if (!sheet) throw new Error('シート「' + DISP_GRID_CONFIG.SHEET_NAME + '」がありません');

    var values = sheet.getDataRange().getValues();
    var blocks = dgrid_findBlocks_(values);

    // 列がどこかのブロックの「行き先の列」であることを確かめる
    var day = null, block = null;
    for (var i = 0; i < blocks.length && !day; i++) {
      for (var j = 0; j < blocks[i].days.length; j++) {
        if (blocks[i].days[j].col === col) { day = blocks[i].days[j]; block = blocks[i]; break; }
      }
    }
    if (!day) throw new Error('その列は行き先の列ではありません（列' + col + '）');

    // 行がトラックの行であることを確かめる
    var trucks = dgrid_readTrucks_(values, block);
    var truck = null;
    for (var k = 0; k < trucks.length; k++) if (trucks[k].row === row) truck = trucks[k];
    if (!truck) throw new Error('その行はトラックの行ではありません（行' + row + '）');

    var before = String((values[row] || [])[col] || '');
    if (before === value) {
      out.ok = true; out.changed = false; out.before = before; out.after = value;
      return out;
    }

    // GASのgetRangeは1始まり。読み取りは0始まりの配列なので +1 する。
    sheet.getRange(row + 1, col + 1).setValue(value);
    dgrid_appendEditLog_(ss, {
      日付: day.date, トラック: truck.truck, 運送会社: truck.company,
      行: row + 1, 列: col + 1, 前: before, 後: value
    });

    nc_forget_('dispatch');
    nc_forget_('dispatchMonthly');
    for (var w = -4; w <= 4; w++) nc_forget_('dispatchGrid_' + w);

    out.ok = true; out.changed = true; out.before = before; out.after = value;
    out.日付 = day.date; out.トラック = truck.truck;
  } catch (err) {
    out.error = String(err);
    Logger.log('配車表の書き込みでエラー: ' + String(err));
  }
  return out;
}

// ===== 内部：編集ログに1行足す =====
// ★ 配車表そのものを書き換えるので、いつ誰が何をしたかを残しておく。
//   間違えたときに前の値へ戻せるようにするため。
function dgrid_appendEditLog_(ss, e) {
  var HEAD = ['変更日時', '対象日', '運送会社', 'トラック', '行', '列', '変更前', '変更後', '変更者'];
  var sheet = ss.getSheetByName(DISP_GRID_CONFIG.EDIT_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DISP_GRID_CONFIG.EDIT_LOG_SHEET);
    sheet.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
    sheet.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  var who = '';
  try { who = Session.getActiveUser().getEmail() || ''; } catch (err) { who = ''; }
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    e.日付, e.運送会社, e.トラック, e.行, e.列, e.前, e.後, who
  ]);
}

// ===== 動作確認 =====
function testDispatchGrid() {
  var d = getDispatchGridData_uncached_(0);
  Logger.log('出所: ' + d.source + ' / 編集可: ' + d.editable);
  Logger.log('週: ' + d.weekLabel + '  日数' + d.days.length + '  トラック' + d.trucks.length + '台');
  if (d.error) { Logger.log('エラー: ' + d.error); return d; }
  d.trucks.slice(0, 12).forEach(function (t) {
    var line = d.days.map(function (dd) {
      var c = t.cells[dd.col];
      return (c ? c.text : '-').substring(0, 10);
    }).join(' | ');
    Logger.log('  ' + (t.company + ' / ' + t.truck).substring(0, 24) + '  ' + line);
  });
  return d;
}

// ===== 公開関数：アプリがどのファイルを読み書きしているかを確かめる =====
// ★ 移行のときに「本物」と「バックアップ」の2つを作るので、どちらを触れば
//   アプリに反映されるのかが外から見て分からなくなる（名前を付け替えると
//   なおさら）。GASエディタからこれを実行してログのURLを開くこと。
function 配車表のファイルを確認する() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(DISP_GRID_CONFIG.PROP_SHEET_ID);
  var backupId = props.getProperty(DISP_GRID_CONFIG.PROP_BACKUP_ID);
  var url = function (x) { return x ? 'https://docs.google.com/spreadsheets/d/' + x + '/edit' : '(なし)'; };

  Logger.log('■ アプリが読み書きしているファイル');
  if (!id) {
    Logger.log('  まだ移行していません。Excelを読んでいます（編集はできません）。');
  } else {
    try {
      var ss = SpreadsheetApp.openById(id);
      Logger.log('  名前: ' + ss.getName());
      Logger.log('  URL : ' + url(id));
      Logger.log('  ★ 直すならこのファイルです。');
      var sheet = ss.getSheetByName(DISP_GRID_CONFIG.SHEET_NAME);
      Logger.log('  シート「' + DISP_GRID_CONFIG.SHEET_NAME + '」: ' + (sheet ? 'あります' : '★ありません'));
      if (sheet) {
        var v = sheet.getDataRange().getValues();
        var blocks = dgrid_findBlocks_(v);
        var days = blocks.reduce(function (a, b) { return a + b.days.length; }, 0);
        var withQty = 0;
        blocks.forEach(function (b) {
          b.days.forEach(function (d) { if (d.q20col != null) withQty++; });
        });
        Logger.log('  週ブロック' + blocks.length + '個 / 日付' + days + '日ぶん / '
          + 'うち本数の列が見つかった日 ' + withQty + '日');

        // ★ 今の週の列の並びをそのまま出す。「土着」「土積」のように1日が
        //   2列に分かれている場合、どう書かれているかが分からないと
        //   1つにまとめる処理が書けない。
        var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
        var bi = -1;
        for (var i2 = 0; i2 < blocks.length; i2++) {
          var ds = blocks[i2].days;
          if (ds[0].date <= todayStr && todayStr <= ds[ds.length - 1].date) { bi = i2; break; }
        }
        if (bi < 0) bi = blocks.length - 1;
        var blk = blocks[bi];
        // ★ 傭車（スポット）を空き台数から外すために、会社名の書かれ方を見たい
        var trucks2 = dgrid_readTrucks_(v, blocks[0]);
        var seen = {};
        trucks2.forEach(function (t) {
          var key = t.company || '(会社名なし)';
          seen[key] = (seen[key] || 0) + 1;
        });
        Logger.log('');
        Logger.log('■ トラックの会社名（' + trucks2.length + '台）');
        Object.keys(seen).forEach(function (k) {
          var spot = /傭車|庸車|用車|スポット/.test(k) ? '  ←傭車として空き台数から外す' : '';
          Logger.log('  ' + seen[k] + '台  ' + k + spot);
        });

        Logger.log('');
        Logger.log('■ 今の週（' + blk.days[0].label + '〜' + blk.days[blk.days.length - 1].label + '）の列');
        var hdr = v[DISP_GRID_CONFIG.ROW_HEADER] || [];
        var sub2 = v[DISP_GRID_CONFIG.ROW_SUB] || [];
        for (var c2 = blk.base; c2 < blk.base + DISP_GRID_CONFIG.BLOCK_WIDTH; c2++) {
          var h2 = String(hdr[c2] == null ? '' : hdr[c2]).replace(/\n/g, ' ⏎ ').trim();
          var s2 = String(sub2[c2] == null ? '' : sub2[c2]).trim();
          if (!h2 && !s2) continue;
          var role = '';
          for (var d2 = 0; d2 < blk.days.length; d2++) {
            if (blk.days[d2].col === c2) role = '←行き先の列(' + blk.days[d2].label + ')';
            else if (blk.days[d2].q20col === c2) role = '←20kの本数(' + blk.days[d2].label + ')';
            else if (blk.days[d2].q50col === c2) role = '←50kの本数(' + blk.days[d2].label + ')';
          }
          Logger.log('  列' + (c2 - blk.base) + ' 行1[' + s2 + '] 行2[' + h2 + '] ' + role);
        }
      }
    } catch (err) {
      Logger.log('  ★開けませんでした: ' + err);
    }
  }
  Logger.log('');
  Logger.log('■ 移行時のバックアップ（触っても画面は変わりません）');
  Logger.log('  URL : ' + url(backupId));
}

// ===== 公開関数：アプリが読み書きするファイルと、バックアップを入れ替える =====
// ★ もう一度実行すると元に戻る（入れ替えるだけなので）。
//   切り替える前に、切り替え先の構造が読めるかを必ず確かめる。読めないものを
//   本物にすると画面が全部止まるため。
//   編集ログの件数も両方出す。アプリから直した内容は編集ログに残っているので、
//   置いていくものがあるかどうかがこれで分かる。
function 配車表の本物を入れ替える() {
  var props = PropertiesService.getScriptProperties();
  var cur = props.getProperty(DISP_GRID_CONFIG.PROP_SHEET_ID);
  var bak = props.getProperty(DISP_GRID_CONFIG.PROP_BACKUP_ID);
  var url = function (x) { return 'https://docs.google.com/spreadsheets/d/' + x + '/edit'; };

  if (!cur || !bak) {
    Logger.log('★ 入れ替えられません。本物かバックアップのIDが入っていません。');
    Logger.log('  本物: ' + (cur || '(なし)') + ' / バックアップ: ' + (bak || '(なし)'));
    return { ok: false, error: 'IDが揃っていません' };
  }

  var target;
  try {
    target = SpreadsheetApp.openById(bak);
  } catch (err) {
    Logger.log('★ 切り替え先を開けませんでした: ' + err);
    return { ok: false, error: String(err) };
  }

  var check = dgrid_validate_(target);
  if (!check.ok) {
    Logger.log('★ 切り替え先の構造が読めません: ' + check.reason);
    Logger.log('  入れ替えをやめました（今のままです）。');
    return { ok: false, error: check.reason };
  }

  // 置いていくものが無いかを見るため、両方の編集ログの件数を出す
  var logCount = function (id) {
    try {
      var sh = SpreadsheetApp.openById(id).getSheetByName(DISP_GRID_CONFIG.EDIT_LOG_SHEET);
      return sh ? Math.max(0, sh.getLastRow() - 1) : 0;
    } catch (e) { return -1; }
  };
  var curLog = logCount(cur), bakLog = logCount(bak);

  props.setProperty(DISP_GRID_CONFIG.PROP_SHEET_ID, bak);
  props.setProperty(DISP_GRID_CONFIG.PROP_BACKUP_ID, cur);
  nc_forget_('dispatch');
  nc_forget_('dispatchMonthly');
  for (var w = -4; w <= 4; w++) nc_forget_('dispatchGrid_' + w);

  Logger.log('入れ替えました。');
  Logger.log('');
  Logger.log('■ これからアプリが読み書きするファイル');
  Logger.log('  名前: ' + target.getName());
  Logger.log('  URL : ' + url(bak));
  Logger.log('  トラック' + check.trucks + '台 / 週ブロック' + check.blocks + '個 / 日付' + check.days + '日ぶん');
  Logger.log('  アプリからの編集ログ: ' + (bakLog < 0 ? '(読めません)' : bakLog + '件'));
  Logger.log('');
  Logger.log('■ これからバックアップ扱いになるファイル（触っても画面は変わりません）');
  Logger.log('  URL : ' + url(cur));
  Logger.log('  アプリからの編集ログ: ' + (curLog < 0 ? '(読めません)' : curLog + '件'));
  if (curLog > bakLog) {
    Logger.log('  ★ こちらにだけ、アプリから直した記録が ' + (curLog - bakLog) + '件あります。');
    Logger.log('    その内容は新しい本物には入っていません。必要なら手で移してください。');
  }
  Logger.log('');
  Logger.log('元に戻したいときは、この関数をもう一度実行してください。');
  return { ok: true, sheetId: bak, backupId: cur };
}
