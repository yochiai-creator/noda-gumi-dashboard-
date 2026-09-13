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

### ★ リポジトリに入っていなかった本番の改修（2026/09 復元）

本番の `noda_dashboard.html` は、過去にGASエディタで直接編集されたことがある。
その改修は `.jsx` に反映されておらず、gitの全履歴を探しても一度も入っていなかった。
`tools/build.js` は `.jsx` からHTMLを作り直すので、ビルドするたびに黙って消えていた。

復元したもの（2026/09/10）:

| 失われていたもの | 何が起きていたか |
|---|---|
| `yardEmpty50k` / `yardEmpty20k` | ヤードタブの「50kg/20kg 搬入可能数」タイルが消えていた |
| `yard_mergeLiveBlocks_` の shipDate 修正 | 空き区画にGASが `shipDate: null` を返しても、静的データの古い日付に戻り「空きなのに出荷希望日が出る」 |
| `ErrorBoundary` | 描画エラーで画面が真っ白になり、原因が分からなくなる |
| `invBySize`（9分類） | 「サイズ別 在庫本数」が 50kg/20kg の2つだけになっていた（本来は2K〜50K(S)の9分類） |
| `Math.max(1, ...)` のガード | `byYear` が空だと棒グラフの幅が `NaN%` になる |

復元していないもの: 読み込み中のフォークリフトの排気（`exhaust-puff`）。見た目だけなので後回し。

**本番のHTMLを直接編集しないこと。** 直すのは `.jsx` で、`node tools/build.js` を通す。
`clasp pull` して `gas/noda_dashboard.html` に差分が出たときは、ビルドし直す前に
その差分が「本番だけの改修」でないかを必ず確かめる。

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

### 配車表と出荷指図書の紐づけ（2026/09）

配車の「日」表示で、そのトラックがどの出荷指図書のものかを出している。
拾い方は2通りあり、画面でも見分けが付くようにしてある。

| 出どころ | 条件 | 画面 |
| --- | --- | --- |
| 依頼ナンバー | マスの中身が数字と矢印だけ（`↓60688` `30412,30458→ 30413`） | 青ベタのボタン |
| 行き先の住所 | マスが住所（`熊本県山鹿市`）で、出荷希望日と市区町村が一致 | 青枠のボタン＋「行き先と出荷日から推定」 |

住所での突き合わせには、指図書PDFから読んだ**出荷先の住所**が要る。
出荷先コードと住所は1対1なので、`実績` シートの `住所 / 都道府県 / 市区町村` の
3列に**出荷先コードごとに1行だけ**入れてある。埋めるのは
`shipact_fillDestAddresses_()`（夜間の `harvestDailyData` から残り時間ぶんだけ）。
すぐ効かせたいときは `出荷先の住所を集める()` を手で実行する。

読んでも住所が取れなかった出荷先コードはスクリプトプロパティ
`shipActuals.addrGiveUp` に控えて二度と読み直さない（毎晩同じPDFで足止めされ、
後ろのコードに順番が回らなくなるため）。

注意点：

- 住所からの紐づけは**推定**。市区町村と出荷希望日（前後1日まで）しか見ていない。
  同じ市に同じ日で複数の指図書があれば全部出る。
- 引取（`←`）のマスは住所からは引かない（出荷の指図書ではないため）。
- 指図書PDFのリンクは `実績` シートの `fileId` から作るので、Drive検索が要らず速い。
  シートにまだ無い依頼ナンバーだけ、今までどおり `yard_findOrderPdf_()` で検索する。

### アーム出荷予定（2026/09）

配車タブの下に「アーム出荷予定」を出している。LPガス容器とは別の製品
（建機のブーム・アーム。SK200/SK300/13ton など）で、出荷先は
正和・あゆみ・本間・東条など。

元データは「'001_アーム出荷明細」フォルダに毎週入る
`出荷予定　日程表変更A(26年9月4日).xlsm`（4〜7MB）。
**ダッシュボードはこの .xlsm を直接読まない。** 変換だけで十数秒かかるため。

代わりに、別プロジェクト **「アーム出荷明細pdf生成」**
（scriptId `1ZIg-_3vYA1UTAHcUJiHPNtI9m12VTx5MdFJ2WUOJZqt-wrIq1ZAZSl54`）が
.xlsm の更新を15分おきに見て書き出している2つのファイルを使う。
置き場は「①出荷作業用」フォルダ `1-RrriADJSmBt2a7HsYpb_c8TUHHJpxkz`。

| ファイル | 中身 |
| --- | --- |
| `アーム機種別出荷明細_YYYY-MM-DD.pdf` | 落合さんが見ている明細。画面からリンクで開く |
| `arm_pdf_snapshot.json` | `図番\|\|号機` → `{insp, kiki, kishu, spec, ship(ミリ秒), info, dest, is13}` |

`gas/noda_arm_ship.js` はこのJSONを読んで出荷日ごとにまとめるだけ
（Driveのファイルを1つ読むだけなので速い）。

注意点：

- **図番と号機は値の中に無い。** キーが `図番||号機` なので、そこから取り出している。
- PDF生成側が止まるとJSONも古いまま残る。元の .xlsm の更新日時と見比べて、
  JSONのほうが古ければ `stale` を立てて画面に警告を出す。
- 対象は「実行日から31日」。PDF生成側の `DAYS` と合わせてある。
- **トラック（どの便で運ぶか）はまだどこにも無い**（2026/09/13 落合さん確認）。
  決まったら日の見出しの横に足す。

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
