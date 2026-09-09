function doGet(e) {
  // ?page=yard のときは野外置場(置場容量)の画面を返す。
  // ダッシュボードの「野外置場」タブがこのURLを iframe で読み込む。
  if (e && e.parameter && e.parameter.page === 'yard') {
    return yardDoGet_();
  }
  return HtmlService.createHtmlOutputFromFile('noda_dashboard')
    .setTitle('野田組 業務ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}