# 野田組 業務ダッシュボード

神鋼機器工業株式会社（倉吉・鳥取）のLPガス容器製造・出荷工場向け業務ダッシュボード。
Google Apps Script (GAS) + React（JSXをBabelで事前コンパイルしてHTMLに埋め込み）+
Googleスプレッドシート・Google Driveをバックエンドとして使用。

設計の詳細・注意点・過去のトラブルは [HANDOFF.md](./HANDOFF.md) を参照。

## GASプロジェクト

- Script ID: `1B2rh0SZwACil6j2_MQpI2b5VknlnkghBFSDeiHnr894Io40hq3H6_Qwl`
- アクティブなWebアプリURL:
  `https://script.google.com/a/macros/nodagumi40.com/s/AKfycbwxqaHutswueMr_P_FEKqcIl9i0ffPGv_AMxTFRIMFFuLJKgYeawNDa-GNsfDns1kM9/exec`
  - GASプロジェクトには「無題」のデプロイが2つある。**もう一方（`AKfycbzUeDeTNiC...`）は未使用なので更新しないこと。**

## リポジトリ構成

`gas/` 配下は**GASプロジェクトの実ファイルと1対1で対応**している（ファイル名も本番と一致）。
ルートの `.clasp.json` が `rootDir: "gas"` を指しているので、`clasp pull` / `clasp push` が
そのまま使える。

| ファイル | 役割 |
|---|---|
| `noda-gumi-dashboard.jsx` | **フロントエンドの正規ソース**（Reactコンポーネント一式）。GASにはpushしない |
| `gas/noda_dashboard.html` | 上の`.jsx`をBabelでコンパイルして埋め込んだ、GASにデプロイする実体 |
| `gas/配信用.js` | `doGet(e)`。既定でダッシュボード、`?page=yard` のときは野外置場の画面を返す |
| `gas/noda_common_cache.js` | 各エンジン共通のキャッシュと日付整形（`nc_` プレフィックス） |
| `gas/Noda inventory engine.js` | 在庫照会CSV集計（`getInventoryDashboardData`） |
| `gas/noda_shipping_engine.js` | 出荷作業指図書の月別フォルダ自動集計（`getShippingDashboardData`） |
| `gas/noda_orderplan_engine.js` | 受注出荷計画表PDF集計・前日比（`getOrderPlanDashboardData`） |
| `gas/noda_dispatch_engine.js` | トラック運行スケジュール集計（`getDispatchTodayData`） |
| `gas/noda_dispatch_grid.js` | 配車表をトラック×日付のグリッドで読み書き（`getDispatchGridData` / `setDispatchCell`） |
| `gas/noda_dispatch_monthly.js` | 配車表の積算による月次出荷本数 |
| `gas/noda_ship_actuals_engine.js` | 指図書の夜間パースと蓄積シート（`getShippingActualsSummary`） |
| `gas/noda_inventory_history.js` | 在庫推移の蓄積（`getInventoryTrendData`） |
| `gas/noda_order_history.js` | 受注推移の蓄積（計画表の差分） |
| `gas/noda_monthly_combined.js` | 在庫・出荷・受注を月でそろえる（`getMonthlyCombinedData`） |
| `gas/noda_yard_edit_engine.js` | **ヤードマップの全機能**（読み書き・PDFリンク検索・状態判定）。49関数 |
| `gas/noda_yard_extras.js` | **意図的に空**。中身はコメントのみ（理由はファイル内に記載） |
| `gas/noda_yard_capacity.js` | 野外置場（置場容量）のAPI。`yardDoGet_` / `getYardCapacitySummary` ほか |
| `gas/noda_yard_capacity_sheet.js` | 野外置場のシートアクセス（`置場容量` / `変更履歴`） |
| `gas/yard_capacity_index.html` | 野外置場の画面（`?page=yard` が返すHTML） |
| `gas/yard_capacity_script.html` | 同・クライアントJS（敷地レイアウト図・建物編集） |
| `gas/yard_capacity_style.html` | 同・CSS |
| `gas/appsscript.json` | マニフェスト（V8 / Drive v3 / webapp: USER_DEPLOYING・DOMAIN） |

### ファイル名・配置についての重要な注意

GASは**全ファイルが同一のグローバルスコープで、エディタのファイル順に評価される**ため、
同名関数を複数ファイルに置くと「最後に評価された定義」が勝つ。
実際に `noda_yard_extras.js` の8関数が `noda_yard_edit_engine.js` の定義を上書きし、
PDF検索の高速化（キャッシュ化）が効かなくなっていた（2026/09に発覚・修正）。

**関数を追加するときは既存ファイルに追記し、同名関数を2箇所に置かないこと。**
また、ファイルを増やす・リネームするときは、本番プロジェクト側のファイル名と
必ず一致させること（別名で`clasp push`すると重複定義が発生する）。

### 野外置場タブについて（2026/09 統合）

野外置場の画面は、もともと**別のGASプロジェクト**だった。

- 旧プロジェクト scriptId: `1JBkJt8Ry2dMeD0x3lVs5vePOzFgDKRGJhQCar2xbZuYZJq446ih6e5hn`
  （タイトル「LPG容器 屋外在庫管理」）
- データ: スプレッドシート `1eaook3wVMpKRU_MVsLxtFwL89XlwPNwKqPLY2Sujkaw`

**旧プロジェクトはまだ残っていて、Webアプリとしても生きている。**
コードは*コピー*なので、旧プロジェクトを直してもダッシュボードのタブは変わらない。
**直すのはこちら（`gas/noda_yard_capacity*.js` / `yard_capacity_*.html`）だけ。**
共有されているのはスプレッドシートだけで、どちらのアプリからでも同じ行を読み書きする。

スプレッドシートIDは `YARD_CAPACITY_FILE_ID` に直接書いてある。
スクリプトプロパティはプロジェクトごとに別物で、空のままだと
`yardGetSpreadsheet_()` が**新規作成して2021年の初期データで上書き**してしまうため。

旧プロジェクトのスクリプトプロパティ（`YARD_BUILDING_OVERRIDES` / `YARD_AREA_ZONES` /
`YARD_NOTIFY_EMAIL`）は引き継いでいない（2026/09/09時点で「手調整の覚えがない」と確認済み）。
建屋の位置は図面PDFの実測座標がコードに入っているので、既定値のままで地図は正しく出る。

満杯通知の日次トリガーは旧プロジェクト側に残っている。こちらに移すときは
`yardSetupDailyNotificationTrigger()` を実行し、旧側のトリガーを削除する。

## 開発の流れ

```bash
clasp pull                 # 本番の現状を取得（作業前に必ず実行して差分を確認）
# gas/ 配下を編集
clasp push                 # 本番プロジェクトのコードを更新（Webアプリはまだ変わらない）
clasp deployments          # デプロイ一覧
clasp redeploy <deployId>  # アクティブなデプロイを新バージョンに更新（Webアプリに反映される）
```

`.jsx` を編集した場合は、HANDOFF.md の手順でコンパイル済みHTMLを作り直してから
`gas/noda_dashboard.html` を差し替える（`.jsx`だけ変更してもWebアプリには反映されない）。
