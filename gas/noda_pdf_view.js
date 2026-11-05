/**
 * 野田組 業務ダッシュボード — 指図書（PDF）をアプリの中で見る
 * ------------------------------------------------------------------
 * ★ 2026/11/05 落合さん「指図書をアプリの中で開く仕様が良い」：
 *   今までは Drive の表示（/preview）をアプリの上に埋め込んでいたが、iPhone の Safari は埋め込んだ Google の画面に
 *   ログインを渡さないので「401 エラーが発生しました」になる。
 *   そこで、PDF の中身をこのWebアプリ（デプロイした人として動く）が Drive から読んで画面に渡し、
 *   画面側で PDF.js（Mozilla、Apache-2.0。gas/pdfjs_lib.html・pdfjs_worker.html に v3.11.174 の legacy ビルドをそのまま置いた）で描く。
 *   PDF.js は重い（約1.5MB）ので、最初に指図書を開いたときだけ読む（getPdfViewerLib）。
 * ★ このWebアプリはデプロイした人の権限で動くので、何でも読めると困る。
 *   渡すのは「PDF」で、名前に「指図書」が入っているファイルだけ。
 *
 * 名前の衝突に注意：内部関数はすべて pdfv_ 接頭辞。
 */

var PDFV_CONFIG = {
  NAME_RE: /指図書/,
  MAX_BYTES: 20 * 1024 * 1024
};

/* PDF.js（画面で eval する）。{ lib, worker } */
function getPdfViewerLib() {
  return {
    lib: HtmlService.createHtmlOutputFromFile('pdfjs_lib').getContent(),
    worker: HtmlService.createHtmlOutputFromFile('pdfjs_worker').getContent()
  };
}

/* 渡してよいファイルか（純関数） */
function pdfv_allowed_(mime, name, size) {
  if (mime !== 'application/pdf') return '指図書（PDF）ではありません';
  if (!PDFV_CONFIG.NAME_RE.test(String(name || ''))) return '指図書のファイルではありません';
  if (Number(size) > PDFV_CONFIG.MAX_BYTES) return 'ファイルが大きすぎます';
  return '';
}

/* 指図書の PDF を base64 で渡す。{ ok, name, b64 } / { ok:false, error } */
function getShipPdf(fileId) {
  try {
    var id = String(fileId || '');
    if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return { ok: false, error: 'ファイルの番号がおかしいです' };
    var f = DriveApp.getFileById(id);
    var why = pdfv_allowed_(f.getMimeType(), f.getName(), f.getSize());
    if (why) return { ok: false, error: why };
    return { ok: true, name: f.getName(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
  } catch (e) {
    return { ok: false, error: '指図書を読めませんでした：' + String(e && e.message || e) };
  }
}
