// PDF.js（pdfjs-dist の legacy/build の min）を GAS に置ける形にする。
//   node tools/pdfjs_pack.js <pdfjs-dist を展開したフォルダ>
// ★ GAS の HtmlService は JS をそのまま .html に置くと「形式が正しくない HTML コンテンツ」で読めない（11/6 iPhone で出た）。
//   英数字だけの base64 にして <script type="text/plain"> に入れる。サーバ（gas/noda_pdf_view.js）は中の base64 を渡し、画面で戻す。
const fs = require('fs');
const dir = process.argv[2];
if (!dir) { console.error('使い方: node tools/pdfjs_pack.js <pdfjs-dist のフォルダ>'); process.exit(1); }
const ver = JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8')).version;
[['legacy/build/pdf.min.js', 'gas/pdfjs_lib.html'], ['legacy/build/pdf.worker.min.js', 'gas/pdfjs_worker.html']].forEach(([from, to]) => {
  const b64 = fs.readFileSync(dir + '/' + from).toString('base64').replace(/.{1,100}/g, '$&\n');
  fs.writeFileSync(__dirname + '/../' + to,
    '<!-- PDF.js ' + ver + ' (' + from + ') Copyright Mozilla Foundation, Apache License 2.0. base64 で入れてある（tools/pdfjs_pack.js） -->\n' +
    '<script type="text/plain" id="pdfjs-b64">\n' + b64 + '</script>\n');
  console.log(to, fs.statSync(__dirname + '/../' + to).size);
});
