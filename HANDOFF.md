# 野田組 業務ダッシュボード — Claude Codeへの引き継ぎメモ

このチャット（claude.ai）とClaude Codeは別々の環境で、自動ではファイルや会話内容が引き継がれません。
Claude Codeで作業を始めるときは、このメモと、一緒に渡した`.gs`ファイル・`.jsx`ファイルを
Claude Codeに読み込ませてから作業を始めてください。

## プロジェクトの概要

神鋼機器工業株式会社（倉吉・鳥取）のLPガス容器製造・出荷工場向けの業務ダッシュボード。
Google Apps Script (GAS) + React（JSXを事前にBabelでコンパイルしてHTMLに埋め込む方式）+
Googleスプレッドシート・Google Driveをバックエンドとして使う。

利用者（落合さん）はiPhoneのみで作業しており、PC環境はない。

## デプロイ情報（重要）

- **アクティブなWebアプリURL**：`https://script.google.com/a/macros/nodagumi40.com/s/AKfycbwxqaHutswueMr_P_FEKqcIl9i0ffPGv_AMxTFRIMFFuLJKgYeawNDa-GNsfDns1kM9/exec`
  - GASプロジェクトには「無題」のデプロイが**2つ**あるので注意。もう一方
    （`AKfycbzUeDeTNiC...`）は使われていない。間違えて更新しないこと。
- `doGet`関数は`HtmlService.createHtmlOutputFromFile('noda_dashboard')`を呼んでいる
  （ファイル名は`noda_dashboard`）。

## フロントエンドの作り方（重要）

- 正規ソースは`noda-gumi-dashboard.jsx`（Reactコンポーネント一式）。
- GASは外部CDN不可・JSXを直接実行できないため、**Babelで事前コンパイルしたJSを
  静的HTMLに埋め込む**方式を取っている。
- `.jsx`を編集したら、必ず以下の手順で`noda_dashboard.html`を作り直してから
  GASに反映すること（`.jsx`だけ変更してもWebアプリには反映されない）。
  1. import文を除去し、`export default function App()`を`function App()`に変換
  2. `useState`/`useEffect`を`React.useState`/`React.useEffect`に変換
  3. lucide-reactのアイコンをSVGパスの自作コンポーネントに置き換え
     （このファイルに埋め込み済みのアイコン定義を使う）
  4. Babel(`@babel/preset-react`, `runtime: 'classic'`)でコンパイル
  5. React 18 UMD + ReactDOM UMD + コンパイル済みJS + CSSを1つのHTMLにまとめる
  6. jsdomで実際にレンダリングして、目的の変更が反映されているか検証してから納品
- CSSは「使っているクラスだけを集めた簡易版Tailwind」。**新しいクラスを追加しても
  自動で反映されない**ので、動的な位置指定（`left-[132px]`など）は避けて、
  **直接styleプロパティで指定する**方が安全（過去に位置指定が効かず表示が消える
  事故が起きた）。

## GASファイル構成

- `noda_inventory_engine.gs`：50k/20k在庫CSV集計（`getInventoryDashboardData`）
- `noda_shipping_engine.gs`：出荷作業指図書の月別フォルダ自動集計（`getShippingDashboardData`）
- `noda_orderplan_engine.gs`：受注出荷計画表PDF集計。前日比（依頼No単位で新規注文を検出）
  （`getOrderPlanDashboardData`）
- `noda_dispatch_engine.gs`：トラック運行スケジュール集計。土日を除いた平日8日分を返す
  （`getDispatchTodayData`）
- **ヤードマップのメインエンジン**：`noda_yard_main_engine.gs`（`yard_findRefRow_`など）。
  50k/20kの入込場スプレッドシートを、「更新用一覧」タブ（位置ラベルをキーにした索引）
  経由で読み書きする。詳細はこのメモの末尾「ヤードマップの設計」を参照。
- `noda_yard_extras.gs`：依頼No→PDFリンク検索、状態(kind)のGNo有無からの
  自動判定、出荷希望日の同期。メインエンジンに依存（`yard_findRefRow_`等を呼ぶ）。
  **PDF検索結果は`CacheService`で6時間キャッシュ**し、検索範囲も
  「出荷作業指図書フォルダの今月フォルダ内」に絞ることで高速化している
  （以前は毎回Drive全体を検索し、依頼Noが数十件あるとマップの読み込みに
  1分近くかかっていた）。複数候補が残った場合は、以前はPDFの中身をOCRで
  読んで容器番号レンジと照合していたが、これも重すぎたため「最終更新日時が
  一番新しいファイルを選ぶ」（メタデータ比較のみ、高速）方式に変更済み。

## 重要な学び・注意点

- **GNo→容器番号の計算式**（実際の出荷作業指図書PDFで確認済み）
  - 20kg：`50000 + (GNo-1)×50 + 1` 〜 `50000 + GNo×50`
  - 50kg：`(GNo-1)×100 + 1` 〜 `GNo×100`
- **年ラベルは信用しない**：トラック運行スケジュールのシートでは、日付テキストが
  一致していても「年見出し行」の表記が実態と食い違うことがある。年で絞り込むと
  誤動作するため、日付テキストの一致だけで判定し、実行時の年（`todayY`）と
  一致する区画を優先する。
- **同じ日付が複数の区画に重複することがある**：短距離便・長距離便など、同じ
  出発日に複数の到着パターンが並行して存在し、片方が空欄（本当に未入力）の
  ことがある。妥当な候補をすべて合算する方式にしている。
- **受注出荷計画表には「受注日」列が存在しない**：PDFにあるのは「出荷希望日」
  （未来の予定日）のみ。「前日の受注本数」を出荷希望日でフィルタしても、
  出荷済みの案件は表から消えているため、ほぼ必ず0件になる。正しくは、
  「前日の計画表には無かった依頼Noが、当日の計画表に新規で増えている」ことを
  検出し、その本数を合計する（`ord_getLpOrdersForFile_`で個別注文を比較）。
- **土日はファイルが作られない**：配車・受注計画表のファイルは平日のみ生成される。
  「前日」を厳密な暦日で扱うと土日にファイルが無く失敗するため、「一番新しい
  ファイルと、その1つ前のファイル」を比較する方式に統一している。

## ヤードマップの設計

- 「位置ラベル(pos)」をキーにする（GNo自体をキーにしない）。GNoは容器の入れ替えで
  頻繁に変わるが、位置ラベルは固定のため。
- 「更新用一覧」タブの列：[位置ラベル, GNo, 容器番号開始, 容器番号終了, 本数,
  依頼ナンバー, GNoセルの住所(A1), 依頼Noセルの住所(A1), 状態, 出荷希望日,
  出荷希望日セルの住所(A1)]
- セルの住所は一度検索で見つけたら一覧タブにキャッシュし、次回から検索し直さない
  （結合セルのズレによる誤書き込み事故が何度も起きたため）。
- 「状態(kind)」は、一覧タブに保存された値を信用せず、**実際にGNoが入っているか
  どうかで毎回判定し直す**（`noda_yard_extras.gs`側で上書き）。保存時に状態の
  更新を忘れるバグで、GNoがあるのに「空き」表示のままになる事故が起きたため。
- 50kg・20kgの実ファイル名・フォルダIDはGASコード内の`YARD_EDIT_CONFIG`を参照。

## Google Drive フォルダ構成

- 出荷作業指図書：`13qWXWwBXgbEO9avO5qlnZ0WHDaMSaYA_` → 年サブフォルダ → 月サブフォルダ
- 受注出荷計画表：`1YU3nui2u93ZzhALjmVQKZ1I9DHtFjjqE`
- 50k在庫照会CSV：`1y3WTLWHWZ308aB9evY57jk93qpdUFPlP`
- 20k在庫照会CSV：`1gtjErF2zDDJBQEgL04vprLg0iYH-yEdy`
- トラック運行スケジュール：`1lSlP68CxFF8A_ISipJniPXr87E1P_E1_`

## 作業の進め方（踏襲すべきパターン）

1. コードを編集したら、必ずNode.jsで`node --check`（.gs）または`@babel/core`での
   コンパイル確認（.jsx）を行う
2. .jsxを変更したら、上記手順で必ず完全なHTMLを再構築し、jsdomで実際にレンダリング
   して目的の変更が反映されているか検証する（見た目の変更は特に注意）
3. GAS側の変更は、可能な限り既存関数を編集せず、新しいラッパー関数を追加する形に
   する（大きなファイルを一度に編集すると事故が起きやすいため）
4. 落合さんはスクリーンショットや実際のログ出力で問題を示すことが多い
   （文章での説明より視覚的）。曖昧なフィードバックには具体的な選択肢で
   聞き返す
5. ビジュアル変更は、可能なら先にSVGプレビューを見せて確認を取ってからコードに
   反映する
