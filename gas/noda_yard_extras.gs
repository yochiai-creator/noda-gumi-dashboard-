/**
 * 野田組 業務ダッシュボード — ヤードマップ 依頼No・PDFリンク機能 (Google Apps Script)
 * ------------------------------------------------------------------
 * 役割：メインのヤードマップエンジン（yard_findRefRow_ などが入っているファイル）に
 *       追記する形の、依頼No・PDFリンク関連の追加機能。メインエンジンの既存コードは
 *       一切編集しない（安全のため、別ファイルとして追加するだけ）。
 *
 * 含まれる関数：
 *   getYardBlockDetailWithPdf(sizeKey, pos)
 *     → ブロックをタップして詳細を開いたときに呼ぶ。実際のマップの依頼Noセルを
 *       読み、共有ドライブ内の該当PDFを検索してリンク付きで返す（重い処理）。
 *
 *   getYardMapUpdatesBothWithOrderText(queries50k, queries20k)
 *     → マップ全体を表示・更新するときに呼ぶ。依頼Noの「文字」だけを軽く読む
 *       （PDF検索はしない）。一覧・マップの丸バッジ表示用。
 *
 * ★ このファイルは、メインエンジンファイルの yard_findRefRow_ / yard_openRefSheet_ /
 *   YARD_EDIT_CONFIG / getYardBlockDetail / getYardMapUpdatesBoth に依存している。
 *   同じGASプロジェクト内に、メインエンジンとは別ファイルとして置くこと。
 */

// ===== 内部：依頼Noの文字列から、本当の依頼No部分だけを正確に抜き出す =====
// ★ セルの内容には「2026-60556-0,(1)」のような「4桁の年+ハイフン」で始まる
//   表記もあり、単純に4〜6桁の数字を全部拾うと年（2026）を依頼Noと誤認して
//   間違ったPDFを検索してしまうバグがあった。年の接頭辞だけを除外する。
// ★ 枝番号（末尾の-0、-1など）は、同じ依頼No内でも容器番号が異なる別々の
//   指図書を区別する大事な情報なので、消さずに依頼Noの一部として残す
//   （例："60556-0" と "60047-1" は別物として扱う）。
function yard_extractOrderNumbers_(text) {
  var nos = [];
  var re = /(?:20\d{2}-)?(\d{4,6}(?:-\d+)?)/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    nos.push(m[1]);
  }
  return nos;
}

// ===== ブロックをタップしたときに呼ぶ：依頼No→PDFリンクを検索して返す =====
function getYardBlockDetailWithPdf(sizeKey, pos) {
  var result = getYardBlockDetail(sizeKey, pos);
  result.orders = [];
  try {
    var row = yard_findRefRow_(sizeKey, pos);
    if (row && row.orderNoCellA1) {
      var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
      var mapSheet = SpreadsheetApp.openById(fileId).getSheets()[0];
      var liveOrderText = String(mapSheet.getRange(String(row.orderNoCellA1).trim()).getValue() || '');

      var nos = yard_extractOrderNumbers_(liveOrderText);
      var seen = {};
      for (var i = 0; i < nos.length; i++) {
        var no = nos[i];
        if (seen[no]) continue;
        seen[no] = true;
        result.orders.push({ no: no, url: yard_findOrderPdfUrl_(no, result.rangeStart, result.rangeEnd) });
      }
    }
  } catch (err) {
    result.ordersError = String(err);
  }
  return result;
}

// ===== マップ全体表示時に呼ぶ：依頼NoからPDFリンクまで全部まとめて取得する =====
// ★ 読み込みに時間がかかっても、開いた瞬間から全ブロックのPDFリンクが
//   出ている状態にしたいという要望のため、一括取得の時点で全件のPDF検索を行う。
function getYardMapUpdatesBothWithOrderText(queries50k, queries20k) {
  var base = JSON.parse(getYardMapUpdatesBoth(queries50k, queries20k));
  var pdfCache = {}; // 同じ依頼Noを何度も検索しないためのキャッシュ

  ['50k', '20k'].forEach(function (sizeKey) {
    var fileId = sizeKey === '50k' ? YARD_EDIT_CONFIG.FILE_ID_50K : YARD_EDIT_CONFIG.FILE_ID_20K;
    var mapSheet = null;

    (base[sizeKey] || []).forEach(function (result) {
      if (!result || !result.found) return;

      // ★ 「状態(kind)」は、一覧タブに別途記録された値を信用せず、
      // 「実際にGNo(groupNo)が入っているかどうか」から毎回確実に判定し直す。
      // 以前は「保存時にkindを明示的に更新し忘れる」バグにより、GNoが
      // 入っているのにマップ上は「空き」の見た目のまま、というズレが起きていた。
      var hasGroupNo = result.groupNo !== null && result.groupNo !== undefined && result.groupNo !== '';
      result.kind = hasGroupNo ? 'fill' : 'empty';
      // 空きになった区画は、古い出荷希望日が残っていると紛らわしいのでクリアする
      if (!hasGroupNo) {
        result.shipDate = null;
      }

      result.orders = [];
      try {
        var row = yard_findRefRow_(sizeKey, result.pos);
        if (row && row.orderNoCellA1) {
          if (!mapSheet) mapSheet = SpreadsheetApp.openById(fileId).getSheets()[0];
          var text = mapSheet.getRange(String(row.orderNoCellA1).trim()).getValue();
          result.orderNoText = String(text || '');

          var nos = yard_extractOrderNumbers_(result.orderNoText);
          var seen = {};
          for (var i = 0; i < nos.length; i++) {
            var no = nos[i];
            if (seen[no]) continue;
            seen[no] = true;
            if (!(no in pdfCache)) {
              pdfCache[no] = yard_findOrderPdfUrl_(no, result.rangeStart, result.rangeEnd);
            }
            result.orders.push({ no: no, url: pdfCache[no] });
          }
        } else {
          result.orderNoText = '';
        }
      } catch (err) {
        Logger.log('依頼No/PDF一括取得エラー(' + sizeKey + ' pos' + result.pos + '): ' + String(err));
        result.orderNoText = '';
      }
    });
  });

  return JSON.stringify(base);
}

// ===== 内部：依頼No(数字のみ)から、共有ドライブ内の出荷作業指図書PDFを検索する =====
// 候補が複数見つかった場合は、PDFの中身（容器No部分）を実際に読んで、
// 渡された容器番号レンジ（そのブロックの本当のレンジ）と重なるものを優先する。
// 候補が1件だけなら、内容確認の手間（重い処理）をかけずそのまま採用する。
//
// ★ 2026/08 修正：以前は毎回（5分ごとの自動更新も含む）Drive検索をやり直しており、
// マップ全体で依頼No が数十件あると、その数だけDrive検索が発生し、これがマップ表示の
// ラグの主因になっていた。→ CacheService で検索結果をキャッシュし、同じ依頼No なら
// 次回以降は検索せずキャッシュから即座に返すようにする（依頼Noと実際のPDFの対応は
// 基本的に変わらないため、6時間キャッシュしても実用上問題ない）。
function yard_findOrderPdfUrl_(orderNo, expectedStart, expectedEnd) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'yardPdfUrl_' + orderNo;
  var cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached === '__NONE__' ? null : cached;
  }

  var url = yard_findOrderPdfUrl_uncached_(orderNo, expectedStart, expectedEnd);
  try {
    cache.put(cacheKey, url === null ? '__NONE__' : url, 21600); // 6時間（秒）
  } catch (cacheErr) {
    Logger.log('PDF検索結果のキャッシュ保存でエラー(依頼No' + orderNo + '): ' + String(cacheErr));
  }
  return url;
}

// ===== 内部：出荷作業指図書PDFの保存フォルダ構成（ルート→年→月）から、
// 「今月のフォルダ」のIDを解決する。毎回フォルダを辿るのは無駄なので、
// 一度見つけたら当日中はキャッシュしておく。 =====
var YARD_PDF_ROOT_FOLDER_ID = '13qWXWwBXgbEO9avO5qlnZ0WHDaMSaYA_';

function yard_findSubfolderByName_(parentFolder, name) {
  var it = parentFolder.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function yard_getCurrentMonthPdfFolderId_() {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'yardPdfMonthFolderId';
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    var now = new Date();
    var yearName = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy') + '年';
    var monthName = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'M')) + '月';

    var root = DriveApp.getFolderById(YARD_PDF_ROOT_FOLDER_ID);
    var yearFolder = yard_findSubfolderByName_(root, yearName);
    if (!yearFolder) return null;
    var monthFolder = yard_findSubfolderByName_(yearFolder, monthName);
    if (!monthFolder) return null;

    var folderId = monthFolder.getId();
    try { cache.put(cacheKey, folderId, 21600); } catch (e) { /* キャッシュ失敗は無視 */ }
    return folderId;
  } catch (err) {
    Logger.log('出荷作業指図書フォルダの解決でエラー: ' + String(err));
    return null;
  }
}

// ===== 内部：PDF検索の実処理（キャッシュを介さず、実際にDriveを検索する） =====
// ★ 2026/08 修正：以前は候補PDFが複数見つかった場合、それぞれの中身をOCRで読んで
// 容器番号レンジと照らし合わせていたが、この「PDFをGoogleドキュメントに変換してOCR」
// という処理が依頼Noごとに何度も走ると非常に重く、マップ全体の読み込みが1分近く
// かかる原因になっていた。
// ★ 2026/08 追加：さらに、検索範囲を「出荷作業指図書フォルダの今月フォルダ内」に
// 絞ることで、Drive全体を検索するより大幅に速く、かつ無関係な同名ファイルが
// 誤って混ざるリスクも減らす（速度と正確性の両方が改善する）。
// 今月フォルダで見つからない場合のみ、Drive全体を対象にした検索にフォールバックする
// （念のため取りこぼしを防ぐため）。
// ★ 複数候補が残った場合はOCR確認ではなく「最終更新日時が一番新しいファイル」を選ぶ
//   （メタデータだけを見るので高速。再発行された指図書は通常、最新のものが正しい版）。
function yard_findOrderPdfUrl_uncached_(orderNo, expectedStart, expectedEnd) {
  try {
    var monthFolderId = yard_getCurrentMonthPdfFolderId_();
    var candidates = [];

    if (monthFolderId) {
      var scopedQuery = "'" + monthFolderId + "' in parents and title contains '" + orderNo +
        "' and title contains '指図書' and mimeType = 'application/pdf'";
      var scopedFiles = DriveApp.searchFiles(scopedQuery);
      while (scopedFiles.hasNext() && candidates.length < 10) {
        candidates.push(scopedFiles.next());
      }
    }

    if (candidates.length === 0) {
      // 今月フォルダで見つからない場合のフォールバック：Drive全体を検索する
      var files = DriveApp.searchFiles(
        "title contains '" + orderNo + "' and title contains '指図書' and mimeType = 'application/pdf'"
      );
      while (files.hasNext() && candidates.length < 10) {
        candidates.push(files.next());
      }
    }
    if (candidates.length === 0) {
      var files2 = DriveApp.searchFiles(
        "title contains '" + orderNo + "' and mimeType = 'application/pdf'"
      );
      while (files2.hasNext() && candidates.length < 10) {
        candidates.push(files2.next());
      }
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].getUrl();

    // 複数候補があれば、最終更新日時が一番新しいものを選ぶ（メタデータ比較のみ、高速）
    var best = candidates[0];
    var bestTime = best.getLastUpdated().getTime();
    for (var i = 1; i < candidates.length; i++) {
      var t = candidates[i].getLastUpdated().getTime();
      if (t > bestTime) {
        best = candidates[i];
        bestTime = t;
      }
    }
    return best.getUrl();
  } catch (err) {
    Logger.log('PDF検索エラー(依頼No' + orderNo + '): ' + String(err));
  }
  return null;
}

// ===== 公開関数：依頼No→PDFリンクのキャッシュを手動でクリアする =====
function yard_clearPdfUrlCache() {
  Logger.log('PDFリンクのキャッシュは6時間で自動的に切れます。今すぐ更新したい場合は、対象の依頼Noが分かれば CacheService.getScriptCache().remove("yardPdfUrl_" + 依頼No) を個別に実行してください。');
}

// ===== 内部：PDFの中身をOCRで読み、「容器No: XXXXX ～ YYYYY」の部分を抜き出す =====
// 一時的にGoogleドキュメント形式に変換して文字を読み取り、読み終わったら削除する。
function yard_extractPdfContainerRange_(fileId) {
  var tempDocId = null;
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    var resource = { title: 'yard_temp_ocr_' + fileId, mimeType: MimeType.GOOGLE_DOCS };
    var tempFile = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'ja' });
    tempDocId = tempFile.id;
    var text = DocumentApp.openById(tempDocId).getBody().getText();

    var m = text.match(/容器\s*No\.?\s*[:：]?\s*[A-Za-z]*\s*(\d{3,6})\s*[~〜～]\s*[A-Za-z]*\s*(\d{3,6})/);
    if (!m) return null;
    return { start: Number(m[1]), end: Number(m[2]) };
  } catch (err) {
    Logger.log('PDF内容読み取りエラー(fileId=' + fileId + '): ' + String(err));
    return null;
  } finally {
    if (tempDocId) {
      try { Drive.Files.remove(tempDocId); } catch (cleanupErr) { /* 削除失敗は無視 */ }
    }
  }
}

// ===== 動作確認 =====
function testGetYardBlockDetailWithPdf() {
  Logger.log(JSON.stringify(getYardBlockDetailWithPdf('50k', '2'), null, 2));
}

function testGetYardMapUpdatesBothWithOrderText() {
  var q50 = [{ pos: '1' }, { pos: '2' }, { pos: '3' }];
  var json = getYardMapUpdatesBothWithOrderText(q50, []);
  Logger.log(JSON.stringify(JSON.parse(json), null, 2));
}

// ===== 動作確認：位置18の実際のkind判定結果を確認する =====
function testPos18Kind() {
  var json = getYardMapUpdatesBothWithOrderText([{ pos: '18' }], []);
  Logger.log(JSON.stringify(JSON.parse(json), null, 2));
}
