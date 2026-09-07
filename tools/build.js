#!/usr/bin/env node
/**
 * 野田組 業務ダッシュボード — フロントエンドのビルドスクリプト
 * ------------------------------------------------------------------
 * noda-gumi-dashboard.jsx（正規ソース）をBabelでコンパイルし、
 * gas/noda_dashboard.html（GASにデプロイする実体）を作り直す。
 *
 * ★ なぜスクリプト化したか
 *   引き継ぎメモではこの手順が手作業6ステップになっていた。実際に
 *   「HTMLの1箇所だけ React.useState になっている」「.jsxとHTMLでブロック配列の
 *   順序が違う」といった不統一が生まれていた（どちらも無害だったが、
 *   手作業だと危険な差異が混ざっても気づけない）。
 *
 * ★ 仕組み
 *   現在のHTMLを「テンプレート」として使い、アプリコードの領域だけを
 *   差し替える。React UMD・CSS・アイコン定義といった外側は現行のものを
 *   そのまま引き継ぐので、壊れようがない。
 *
 *     [ HTMLの先頭〜アイコン定義まで ]  ← そのまま
 *     [ アプリコード ]                  ← .jsx をコンパイルして差し替え
 *     [ ReactDOM.createRoot(...) 以降 ] ← そのまま
 *
 * 使い方:
 *   npm install          （初回のみ。@babel/core と @babel/preset-react）
 *   node tools/build.js  → gas/noda_dashboard.html を更新
 *   node tools/build.js --check  → 書き換えずに差分の有無だけ確認
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const JSX_PATH = path.join(ROOT, 'noda-gumi-dashboard.jsx');
const HTML_PATH = path.join(ROOT, 'gas', 'noda_dashboard.html');

// アプリコード領域の境界。この2つの文字列はHTMLと.jsxの両方に現れる必要がある。
const START_MARK = 'const NAVY = "#0f2942";';
const END_MARK = 'ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));';

function compileJsx(jsxSource) {
  // 引き継ぎメモの手順1・3：import文の除去と export default の変換。
  // （手順2の useState→React.useState は不要。HTMLの冒頭で
  //   const { useState, useEffect } = React; を宣言しているため素の useState で動く）
  let src = jsxSource;
  src = src.replace(/^import React[\s\S]*?from "react";\s*/m, '');
  src = src.replace(/^import \{[\s\S]*?\} from "lucide-react";\s*/m, '');
  src = src.replace('export default function App()', 'function App()');

  // 手順3のアイコンは、HTMLテンプレート側に同名のコンポーネントが
  // 定義済み（FileText / Package / Boxes / AlertTriangle / Clock /
  // CircleAlert / Truck / Wrench / RefreshCw）なので、ここでは何もしない。

  const out = babel.transformSync(src, {
    presets: [[require('@babel/preset-react'), { runtime: 'classic' }]],
    configFile: false,
    babelrc: false,
    compact: false,
    comments: true,
  });
  if (!out || !out.code) throw new Error('Babelのコンパイル結果が空です');
  return out.code;
}

function build() {
  const jsx = fs.readFileSync(JSX_PATH, 'utf8');
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  const sHtml = html.indexOf(START_MARK);
  const eHtml = html.indexOf(END_MARK);
  if (sHtml < 0) throw new Error('HTMLに開始マーカーが見つかりません: ' + START_MARK);
  if (eHtml < 0) throw new Error('HTMLに終了マーカーが見つかりません: ' + END_MARK);
  if (eHtml < sHtml) throw new Error('HTMLのマーカーの順序が逆です');

  const compiled = compileJsx(jsx);
  const sApp = compiled.indexOf(START_MARK);
  if (sApp < 0) throw new Error('コンパイル結果に開始マーカーが見つかりません: ' + START_MARK);

  const prefix = html.slice(0, sHtml);            // React UMD・CSS・アイコン定義
  const suffix = html.slice(eHtml);               // ReactDOM.createRoot 以降
  const appCode = compiled.slice(sApp).replace(/\s+$/, '');

  return { html: prefix + appCode + '\n' + suffix, before: html };
}

function main() {
  const checkOnly = process.argv.indexOf('--check') !== -1;
  const { html: next, before } = build();

  if (next === before) {
    console.log('差分なし（gas/noda_dashboard.html は .jsx と同期しています）');
    return 0;
  }
  if (checkOnly) {
    console.log('差分あり：node tools/build.js を実行して gas/noda_dashboard.html を更新してください');
    console.log('  現在: ' + before.length + ' 文字 / 再生成後: ' + next.length + ' 文字');
    return 1;
  }
  fs.writeFileSync(HTML_PATH, next);
  console.log('gas/noda_dashboard.html を更新しました（' + before.length + ' → ' + next.length + ' 文字）');
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error('ビルド失敗: ' + err.message);
    process.exit(2);
  }
}

module.exports = { build, compileJsx };
