/**
 * 野田組 業務ダッシュボード — （このファイルは空です／意図的に空にしています）
 * ------------------------------------------------------------------
 * ここには以前、依頼No・PDFリンク関連の関数が置かれていましたが、
 * 現在は同じ関数がすべて `noda_yard_edit_engine.js` 側に統合されています。
 *
 * ★ 空にした理由（2026/09）
 *   GASは全ファイルが同一のグローバルスコープで、エディタのファイル順に
 *   評価されるため、同名関数が複数ファイルにあると「最後に評価された定義」が
 *   勝ちます。このファイルは noda_yard_edit_engine.js より後ろに並んでいたため、
 *   ここにあった以下8関数が edit_engine 側の定義を上書きしていました。
 *
 *     getYardBlockDetailWithPdf
 *     getYardMapUpdatesBothWithOrderText
 *     yard_extractOrderNumbers_
 *     yard_extractPdfContainerRange_
 *     yard_findOrderPdfUrl_          ← これが問題だった
 *     testGetYardBlockDetailWithPdf
 *     testGetYardMapUpdatesBothWithOrderText
 *     testPos18Kind
 *
 *   とくに yard_findOrderPdfUrl_ は、ここにあった版が「Drive全体を
 *   DriveApp.searchFiles で検索し、候補が複数ならPDFの中身をOCRで読んで
 *   容器番号レンジと照合する」という旧・低速実装でした。
 *   一方 edit_engine.js 側には「検索範囲を出荷作業指図書フォルダの今月分に絞り、
 *   結果を CacheService に6時間キャッシュする」高速版が入っています。
 *   つまり高速化の修正が上書きされて効いておらず、マップ表示のたびに
 *   依頼Noの件数だけDrive全体検索＋OCRが走る状態でした。
 *
 *   → このファイルの中身を空にすることで、edit_engine.js の高速版が
 *     正しく使われるようになります。
 *
 * ★ 関数を追加したい場合は、このファイルではなく
 *   noda_yard_edit_engine.js 側に追記してください
 *   （同名関数を2箇所に置くと、また同じ上書き事故が起きます）。
 */
