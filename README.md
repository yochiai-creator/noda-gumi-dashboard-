# 野田組 業務ダッシュボード

神鋼機器工業株式会社（倉吉・鳥取）のLPガス容器製造・出荷工場向け業務ダッシュボード。
Google Apps Script (GAS) + React（JSXをBabelで事前コンパイルしてHTMLに埋め込み）+
Googleスプレッドシート・Google Driveをバックエンドとして使用。

詳細な設計・注意点・過去のトラブルは [HANDOFF.md](./HANDOFF.md) を参照。

## 構成

- `noda-gumi-dashboard.jsx` — フロントエンドの正規ソース（Reactコンポーネント一式）
- `gas/noda_dashboard.html` — `.jsx`をBabelでコンパイルして埋め込んだ、GASにデプロイする実体のHTML
- `gas/noda_inventory_engine.gs` — 50k/20k在庫CSV集計
- `gas/noda_shipping_engine.gs` — 出荷作業指図書の月別フォルダ自動集計
- `gas/noda_orderplan_engine.gs` — 受注出荷計画表PDF集計・前日比
- `gas/noda_dispatch_engine.gs` — トラック運行スケジュール集計
- `gas/noda_yard_main_engine.gs` — ヤードマップのメインエンジン
- `gas/noda_yard_extras.gs` — 依頼No→PDFリンク検索、状態自動判定など（メインエンジンに依存）

## GASプロジェクト

- Script ID: `1B2rh0SZwACil6j2_MQpI2b5VknlnkghBFSDeiHnr894Io40hq3H6_Qwl`
- アクティブなWebアプリURL: `https://script.google.com/a/macros/nodagumi40.com/s/AKfycbwxqaHutswueMr_P_FEKqcIl9i0ffPGv_AMxTFRIMFFuLJKgYeawNDa-GNsfDns1kM9/exec`
  - GASプロジェクトには「無題」のデプロイが2つあるので注意（もう一方の`AKfycbzUeDeTNiC...`は未使用）。
- `doGet`は`HtmlService.createHtmlOutputFromFile('noda_dashboard')`を呼ぶ（ファイル名は`noda_dashboard`）。

このリポジトリはコードのソース管理用。実際にGASプロジェクトへ反映するには`clasp clone <Script ID>`で
別途プロジェクトをcloneし、`gas/`配下のファイルをコピーして`clasp push`する。
