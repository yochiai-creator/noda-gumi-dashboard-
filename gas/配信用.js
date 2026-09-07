function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('noda_dashboard')
    .setTitle('野田組 業務ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}