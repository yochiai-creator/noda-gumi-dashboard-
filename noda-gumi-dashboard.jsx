import React, { useState, useEffect } from "react";
import {
  FileText, Package, Boxes, AlertTriangle,
  Clock, CircleAlert, Truck, Wrench, RefreshCw
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  野田組 業務ダッシュボード（プロトタイプ / ダミーデータ）           */
/* ------------------------------------------------------------------ */

const NAVY = "#0f2942";
const NAVY_SOFT = "#173a5e";
const SAFETY = "#f2b705"; // 安全標識イエロー = アクセント

/* ---------- 読み込み中アニメーション用：フォークリフト ---------- */
function ForkliftLoader() {
  return (
    <div style={{ position: "relative", width: 320, height: 64, overflow: "hidden" }}>
      {/* 地面のライン */}
      <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, height: 2, background: "#cbd5e1" }} />
      <div className="forklift-move" style={{ position: "absolute", left: 132, bottom: 9, width: 56, height: 46 }}>
        <svg className="forklift-flip" width="56" height="46" viewBox="0 0 56 46" fill="none">
        <g className="forklift-bob">
          {/* 影 */}
          <ellipse cx="35" cy="41" rx="24" ry="2.5" fill="#94a3b8" opacity="0.25" />

          {/* フォーク（爪・平たい板） */}
          <rect x="0" y="34" width="17" height="3.4" rx="1" fill="#475569" />
          <rect x="12" y="26" width="4" height="11" rx="1" fill="#475569" />

          {/* マスト（太い1本の支柱） */}
          <rect x="15" y="4" width="6" height="34" rx="1.5" fill={NAVY_SOFT} />

          {/* 車体（黄色いシャーシ） */}
          <rect x="19" y="26" width="36" height="11" rx="2.5" fill="#FFCC00" />

          {/* ROPS（安全フレーム・大きなコの字） */}
          <path d="M25 26 V6 h26 v20" stroke={NAVY_SOFT} strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* ボンネット・座席 */}
          <rect x="26" y="18" width="17" height="9" rx="1.5" fill={NAVY_SOFT} />
          <rect x="41" y="17" width="9" height="10" rx="2" fill={NAVY} />

          {/* ハンドル */}
          <circle cx="31" cy="16" r="3" fill="none" stroke={NAVY} strokeWidth="1.4" />
          <line x1="31" y1="16" x2="31" y2="20" stroke={NAVY} strokeWidth="1.2" />

          {/* タイヤ（大小2つ、ホイールの模様付き） */}
          <g>
            <circle cx="22" cy="38" r="7.5" fill={NAVY} />
            <circle cx="22" cy="38" r="1.6" fill="#94a3b8" />
            <circle cx="22" cy="33.5" r="1.1" fill="#94a3b8" />
            <circle cx="22" cy="42.5" r="1.1" fill="#94a3b8" />
            <circle cx="17.5" cy="38" r="1.1" fill="#94a3b8" />
            <circle cx="26.5" cy="38" r="1.1" fill="#94a3b8" />
          </g>
          <g>
            <circle cx="47" cy="38" r="6.5" fill={NAVY} />
            <circle cx="47" cy="38" r="1.4" fill="#94a3b8" />
            <circle cx="47" cy="34" r="1" fill="#94a3b8" />
            <circle cx="47" cy="42" r="1" fill="#94a3b8" />
            <circle cx="43" cy="38" r="1" fill="#94a3b8" />
            <circle cx="51" cy="38" r="1" fill="#94a3b8" />
          </g>
        </g>
        </svg>
      </div>
    </div>
  );
}

// 信号色（正常 / 注意 / 要対応）
const TONE = {
  ok:     { text: "text-emerald-700", bg: "bg-emerald-50",  dot: "#059669", ring: "ring-emerald-200" },
  warn:   { text: "text-amber-700",   bg: "bg-amber-50",    dot: "#d97706", ring: "ring-amber-200" },
  alert:  { text: "text-red-700",     bg: "bg-red-50",      dot: "#dc2626", ring: "ring-red-200" },
  neutral:{ text: "text-slate-600",   bg: "bg-slate-50",    dot: "#64748b", ring: "ring-slate-200" },
};

/* ---------- ダミーデータ ---------- */
const KPIS = [
  { label: "指図書 保存済(8月)", value: "202", unit: "件", tone: "ok",      icon: FileText,      sub: "本日 " + "0" + "件" },
  { label: "当月の受注",     value: "48", unit: "件", tone: "ok",      icon: Package,       sub: "前月比 +6件" },
  { label: "在庫合計",       value: "6,111", unit: "本", tone: "neutral", icon: Boxes,         sub: "50k 1,429 / 20k 4,682" },
  { label: "要対応",         value: "1",     unit: "件", tone: "alert",   icon: AlertTriangle, sub: "下の一覧を確認" },
];


// 出荷作業指図書（8月分フォルダ）GAS実機確認の実データ。依頼No・PDFリンク付き
const SHIPPING_ORDERS_FALLBACK = [
  { date: "08/21", orderNo: "26-10555", fileName: "出荷作業指図書_26.08.21_26-10555-0(1).pdf", url: "https://drive.google.com/file/d/1dnANgjr7EHBN-hptgFkj3XRDqky5DNfo/view?usp=drivesdk" },
  { date: "08/21", orderNo: "26-50284", fileName: "出荷作業指図書_26.08.21_26-50284-0(2).pdf", url: "https://drive.google.com/file/d/1-3S5bFHPs5QXZjI4k1fx_qTaxewxfeAq/view?usp=drivesdk" },
  { date: "08/21", orderNo: "26-30392", fileName: "出荷作業指図書_26.08.21_26-30392-0(3).pdf", url: "https://drive.google.com/file/d/1tVVQsCexqL5vsflm7GgTVndesZ76l_xH/view?usp=drivesdk" },
  { date: "08/21", orderNo: "26-60556", fileName: "出荷作業指図書_26.08.21_26-60556-0(3).pdf", url: "https://drive.google.com/file/d/1VGihqtWJxEZXpSFWSRcM4IFJ9PY2YP64/view?usp=drivesdk" },
  { date: "08/21", orderNo: "26-30389", fileName: "出荷作業指図書_26.08.21_26-30389-0(1).pdf", url: "https://drive.google.com/file/d/12enlFod8p-yofBzuCPCFjNt8za1P8_k8/view?usp=drivesdk" },
];
const SHIPPING_TOTAL_FALLBACK = 202;   // 8月分フォルダの総件数（重複バージョン除去後）
const SHIPPING_TODAY_FALLBACK = 0;     // 本日分件数

// 受注出荷計画表（8/6受注終了分）GAS実機確認前の実データ。共有ドライブから日次取得予定
const ORDERPLAN_TOTAL_FALLBACK = 274;  // 総受注件数（未出荷含む全件）
const ORDERPLAN_BYSIZE_FALLBACK = [
  { label: "2K",         count: 0 },
  { label: "5K",         count: 10 },
  { label: "8K",         count: 34 },
  { label: "10K",        count: 114 },
  { label: "20K(三部軽量)", count: 70 },
  { label: "20K(直付)",   count: 4120 },
  { label: "30K",        count: 140 },
  { label: "50K(軽量型)", count: 3762 },
  { label: "50K(S)",     count: 0 },
];
const ORDERPLAN_RECENT_FALLBACK = [
  { date: "26/08/07", orderNo: "26-60562", name: "71L(30kg)LPガス容器(把手付)", qty: 30, dest: "りゅうせき" },
  { date: "26/08/07", orderNo: "26-10065", name: "新軽量118L(50kg)LPガス容器", qty: 100, dest: "甲賀協同ガス" },
  { date: "26/08/07", orderNo: "26-10066", name: "新軽量47L(20kg)LPガス容器", qty: 50, dest: "甲賀協同ガス" },
  { date: "26/08/07", orderNo: "26-60573", name: "新軽量47L(20kg)LPガス容器", qty: 10, dest: "㈱エネライフ長崎" },
];

// 配車・本日出荷（トラック運行スケジュール）GAS実機で確認済みの実データ
const DISPATCH_DATE_FALLBACK = "8/6";
const DISPATCH_SHIPMENTS_FALLBACK = [
  { vehicle: "10t平", company: "浅津運送 自社便", destination: "福岡県田川市", orderNo: null },
  { vehicle: "4t平標準", company: "浅津運送 自社便", destination: "愛知県豊川市", orderNo: null },
  { vehicle: "10t平", company: "浅津運送 庸車便", destination: "群馬県伊勢崎市 (7000L竪×2)", orderNo: null },
];

// 在庫照会CSV（8/6分）の集計。GAS実機で確定した実データ
const INVENTORY_FALLBACK = [
  { size: "50k", label: "50kg 容器", total: 1429, tone: "ok" },
  { size: "20k", label: "20kg 容器", total: 4682, tone: "ok" },
];
const INV_TOTAL_FALLBACK = 6111;

// 製造年の内訳（在庫の新しさ / 古いロットの滞留チェック）※全在庫
const INV_BY_YEAR_FALLBACK = [
  { year: "2026年 製造", count: 6101 },
  { year: "2025年 製造", count: 10 },
];
const OLDEST_KOKUIN_FALLBACK = "'25/04"; // 最古の刻印月（50k）

/* ---------- 小さな部品 ---------- */
function Dot({ tone }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TONE[tone].dot }} />;
}

function Chip({ tone, children }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${t.bg} ${t.text}`}>
      <Dot tone={tone} />{children}
    </span>
  );
}

function Card({ children, className = "", style }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`} style={style}>{children}</div>
  );
}

function SectionTitle({ children, note }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-sm font-bold text-slate-800 tracking-wide">{children}</h2>
      {note && <span className="text-xs text-slate-400">{note}</span>}
    </div>
  );
}

/* ---------- タブ本体 ---------- */
function DispatchTab({ dateLabel, shipments, week, grid, onSaveCell, onWeek, saving }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const days = week && week.length > 0 ? week : [{ dateLabel: dateLabel, shipments: shipments, qty20k: null, qty50k: null, koguchi20k: null, koguchi50k: null, kontena20k: null, kontena50k: null }];
  const selected = days[selectedIdx] || days[0];
  /* ★ 先頭を無条件に「本日」と呼んでいたが、週の先頭は土日をとばした最初の
       平日なので、土日に見ると月曜が「本日」と出てしまう。日付で判定する。 */
  const todayLabel = (() => { const n = new Date(); return (n.getMonth() + 1) + "/" + n.getDate(); })();
  const isToday = (d) => d && d.dateLabel === todayLabel;
  const dayWord = isToday(selected) ? "本日" : selected.dateLabel;

  return (
    <div className="space-y-6">
      {/* ---- 配車表（トラック×日付）。細かく見て、その場で直せる ---- */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2">
          <div className="text-sm font-bold" style={{ color: NAVY }}>トラック運行スケジュール</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {grid && grid.source ? "出所：" + grid.source : ""}
          </div>
        </div>
        <DispatchGrid grid={grid} onSave={onSaveCell} onWeek={onWeek} saving={saving} />
      </div>

      <div>
        {/* ★ 注記が長すぎて見出しを95pxまで押しつぶし、両方2行に折り返していた。
            上の表と同じ出所なので注記そのものを外す。 */}
        <SectionTitle>日ごとの内訳</SectionTitle>
        <div className="flex gap-1 mb-3 overflow-x-auto -mx-1 px-1">
          {days.map((d, i) => {
            const active = i === selectedIdx;
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  active ? "text-white" : "text-slate-500 bg-slate-100"
                }`}
                style={active ? { background: NAVY } : undefined}
              >
                <span>{d.dateLabel}{isToday(d) ? "（本日）" : ""}</span>
                <span className={`text-[10px] mt-0.5 ${active ? "text-slate-300" : "text-slate-400"}`}>
                  {d.shipments.length}台
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <Card className="p-4" style={{ background: NAVY }}>
            <div className="text-xs text-slate-300 mb-1">{dayWord} の出荷台数</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-white">{selected.shipments.length}</span>
              <span className="text-xs text-slate-400">台</span>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-slate-500 mb-1">{dayWord} 出荷 20k</div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums text-slate-900">
                {selected.qty20k != null ? selected.qty20k : "—"}
              </span>
              <span className="text-[10px] text-slate-400">本</span>
            </div>
            {selected.koguchi20k != null && selected.koguchi20k > 0 && (
              <div className="text-[10px] text-slate-400 mt-0.5">うち小口 {selected.koguchi20k}本</div>
            )}
            {selected.kontena20k != null && selected.kontena20k > 0 && (
              <div className="text-[10px] text-slate-400 mt-0.5">うちコンテナ {selected.kontena20k}本</div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-xs text-slate-500 mb-1">{dayWord} 出荷 50k</div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums text-slate-900">
                {selected.qty50k != null ? selected.qty50k : "—"}
              </span>
              <span className="text-[10px] text-slate-400">本</span>
            </div>
            {selected.koguchi50k != null && selected.koguchi50k > 0 && (
              <div className="text-[10px] text-slate-400 mt-0.5">うち小口 {selected.koguchi50k}本</div>
            )}
            {selected.kontena50k != null && selected.kontena50k > 0 && (
              <div className="text-[10px] text-slate-400 mt-0.5">うちコンテナ {selected.kontena50k}本</div>
            )}
          </Card>
        </div>

        {selected.shipments.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-slate-400">この日に出発する記録はありませんでした。</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-100">
              {selected.shipments.map((s, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Truck size={16} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{s.company}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {s.vehicle} ・ {s.destination}{s.orderNo ? ` ・ 依頼No ${s.orderNo}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        ※ 地名が入っている行き先のみを出荷として表示しています。依頼No（容器番号）は分かる場合のみ表示されます。
      </p>
    </div>
  );
}

function OrdersTab({ orders, total, today, planBySize, planRecent, monthLabel }) {
  const planLpTotal = planBySize.reduce((sum, s) => sum + s.count, 0);
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle note="共有ドライブ・日次自動取得">受注出荷計画表 概要</SectionTitle>
        <Card className="p-4 mb-3" style={{ background: NAVY }}>
          <div className="text-xs text-slate-300 mb-1">LP容器 合計本数</div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums text-white">{planLpTotal.toLocaleString()}</span>
            <span className="text-xs text-slate-400">本</span>
          </div>
        </Card>
        <SectionTitle note="LP容器・サイズ別未出荷数">サイズ別受注本数</SectionTitle>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {planBySize.map((s, i) => (
            <Card key={i} className="p-3">
              <div className="text-[11px] text-slate-500 mb-0.5 truncate">{s.label}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold tabular-nums text-slate-900">{s.count.toLocaleString()}</span>
                <span className="text-[10px] text-slate-400">本</span>
              </div>
            </Card>
          ))}
        </div>
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100">
            {planRecent.map((o, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs font-mono tabular-nums text-slate-400 w-20 shrink-0">{o.date}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{o.name}</div>
                  <div className="text-xs text-slate-500 truncate">依頼No. {o.orderNo} ・ {o.dest}</div>
                </div>
                <span className="text-sm font-bold tabular-nums text-slate-700 shrink-0">{o.qty}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle note={`${monthLabel}分フォルダ・GAS実データ`}>出荷作業指図書 最新</SectionTitle>
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100">
            {orders.map((o, i) => (
              <a key={i} href={o.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <span className="text-xs font-mono tabular-nums text-slate-400 w-10 shrink-0">{o.date}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">依頼No. {o.orderNo}</div>
                  <div className="text-xs text-slate-500 truncate">{o.fileName}</div>
                </div>
                <FileText size={16} className="text-blue-600 shrink-0" />
              </a>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: `指図書 保存済（${monthLabel}・累計）`, value: String(total), unit: "件", icon: FileText, tone: "ok" },
          { label: "本日 保存分",              value: String(today), unit: "件", icon: Clock,    tone: today > 0 ? "warn" : "neutral" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={TONE[s.tone].text} />
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums text-slate-900">{s.value}</span>
                <span className="text-xs text-slate-400">{s.unit}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}







const MAP_50K = {"viewBox": "0 0 632 443", "blocks": [{"pos": 1, "grp": 463, "rng": "46201〜46300", "cnt": 100, "kind": "fill", "x": 39, "y": 33, "w": 44, "h": 26, "orders": []}, {"pos": 2, "grp": 464, "rng": "46301〜46400", "cnt": 100, "kind": "fill", "x": 84, "y": 33, "w": 44, "h": 26, "orders": []}, {"pos": 3, "grp": null, "rng": null, "cnt": null, "kind": "empty", "x": 144, "y": 33, "w": 44, "h": 26, "orders": []}, {"pos": 4, "grp": 465, "rng": "46401〜46500", "cnt": 100, "kind": "fill", "x": 24, "y": 177, "w": 44, "h": 26, "orders": []}, {"pos": 5, "grp": null, "rng": null, "cnt": null, "kind": "empty", "x": 24, "y": 213, "w": 44, "h": 26, "orders": []}, {"pos": 6, "grp": 456, "rng": "45501〜45600", "cnt": 100, "kind": "fill", "x": 24, "y": 249, "w": 44, "h": 26, "orders": []}, {"pos": 7, "grp": 457, "rng": "45601〜45700", "cnt": 100, "kind": "fill", "x": 24, "y": 285, "w": 44, "h": 26, "orders": []}, {"pos": 8, "grp": 421, "rng": "42001〜42100", "cnt": 100, "kind": "fill", "x": 24, "y": 321, "w": 44, "h": 26, "orders": []}, {"pos": 9, "grp": 119, "rng": "11801〜11900", "cnt": 100, "kind": "fill", "x": 234, "y": 393, "w": 44, "h": 26, "orders": []}, {"pos": 10, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 234, "y": 357, "w": 44, "h": 26, "orders": []}, {"pos": 11, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 234, "y": 321, "w": 44, "h": 26, "orders": []}, {"pos": 12, "grp": 471, "rng": "47001〜47100", "cnt": 100, "kind": "fill", "x": 234, "y": 285, "w": 44, "h": 26, "orders": []}, {"pos": 13, "grp": 470, "rng": "46901〜47000", "cnt": 100, "kind": "fill", "x": 234, "y": 249, "w": 44, "h": 26, "orders": []}, {"pos": 14, "grp": 469, "rng": "46801〜46900", "cnt": 100, "kind": "fill", "x": 234, "y": 213, "w": 44, "h": 26, "orders": []}, {"pos": 15, "grp": 467, "rng": "46601〜46700", "cnt": 100, "kind": "fill", "x": 234, "y": 177, "w": 44, "h": 26, "orders": []}, {"pos": 16, "grp": 466, "rng": "46501〜46600", "cnt": 100, "kind": "fill", "x": 234, "y": 141, "w": 44, "h": 26, "orders": []}, {"pos": 17, "grp": 472, "rng": "47101〜47200", "cnt": 100, "kind": "fill", "x": 234, "y": 105, "w": 44, "h": 26, "orders": []}, {"pos": 18, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 234, "y": 69, "w": 44, "h": 26, "orders": []}, {"pos": 19, "grp": 473, "rng": "47201〜47300", "cnt": 100, "kind": "fill", "x": 234, "y": 33, "w": 44, "h": 26, "orders": []}, {"pos": 20, "grp": 478, "rng": "47701〜47800", "cnt": 100, "kind": "fill", "x": 324, "y": 24, "w": 44, "h": 26, "orders": []}, {"pos": 21, "grp": 468, "rng": "46701〜46800", "cnt": 100, "kind": "fill", "x": 369, "y": 24, "w": 44, "h": 26, "orders": []}, {"pos": 22, "grp": 479, "rng": "47801〜47900", "cnt": 100, "kind": "fill", "x": 414, "y": 24, "w": 44, "h": 26, "orders": []}, {"pos": 23, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 369, "y": 132, "w": 44, "h": 26, "orders": []}, {"pos": 24, "grp": 454, "rng": "45301〜45400", "cnt": 100, "kind": "fill", "x": 369, "y": 186, "w": 44, "h": 26, "orders": []}, {"pos": 25, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 414, "y": 132, "w": 44, "h": 26, "orders": []}, {"pos": 26, "grp": null, "rng": null, "cnt": null, "kind": "empty", "x": 414, "y": 186, "w": 44, "h": 26, "orders": []}, {"pos": 27, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 489, "y": 96, "w": 44, "h": 26, "orders": []}, {"pos": 28, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 489, "y": 60, "w": 44, "h": 26, "orders": []}, {"pos": 29, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 489, "y": 24, "w": 44, "h": 26, "orders": []}, {"pos": 30, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 564, "y": 24, "w": 44, "h": 26, "orders": []}, {"pos": 31, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 564, "y": 60, "w": 44, "h": 26, "orders": []}, {"pos": 32, "grp": null, "rng": null, "cnt": 100, "kind": "empty", "x": 564, "y": 96, "w": 44, "h": 26, "orders": []}], "landmarks": []};
const MAP_20K = {"viewBox": "0 0 890 518", "blocks": [{"pos": 1, "grp": 524, "rng": "76151〜76200", "cnt": 50, "kind": "fill", "x": 16, "y": 40, "w": 42, "h": 24, "orders": [{"no": "30368", "url": "https://drive.google.com/file/d/1r1Vsfs789OInNM-8tSRt2_cVaVbexarw/view"}]}, {"pos": 3, "grp": 526, "rng": "76251〜76300", "cnt": 50, "kind": "fill", "x": 62, "y": 40, "w": 42, "h": 24, "orders": [{"no": "20237", "url": "https://drive.google.com/file/d/1hT3virTIikAtVaqtsXv_Uh3R2VWgugqg/view"}, {"no": "10536", "url": "https://drive.google.com/file/d/1pMCHcdcA8dsUvgmR-CW1s8l8xhAs9WW0/view"}, {"no": "30381", "url": "https://drive.google.com/file/d/13Bv7fqdm09C1r_xJT9kYARFO-xQMVT3T/view"}, {"no": "10539", "url": "https://drive.google.com/file/d/1FCt4NbccqmX2x8R5JjEHOhMduQXydcRZ/view"}, {"no": "20241", "url": "https://drive.google.com/file/d/1WiPHZ8Yib7lBg0gjc-U76omDnr9k5Z--/view"}, {"no": "10470", "url": "https://drive.google.com/file/d/1Sq1hAbcfVzYqQPj-4UFrt7lh3QrWXLGL/view"}]}, {"pos": 5, "grp": 398, "rng": "69851〜69900", "cnt": 50, "kind": "fill", "x": 108, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60597", "url": "https://drive.google.com/file/d/17vCvo3-GMgrAAjWz_MgUGpoVM9P_4jHN/view"}]}, {"pos": 7, "grp": 452, "rng": "42551〜42600", "cnt": 50, "kind": "fill", "x": 155, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60563", "url": "https://drive.google.com/file/d/1VxAguew80xDGJ3DaX5_FYta0SGoquL14/view"}]}, {"pos": 9, "grp": 556, "rng": "77751〜77800", "cnt": 50, "kind": "fill", "x": 216, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 11, "grp": 558, "rng": "77851〜77900", "cnt": 50, "kind": "fill", "x": 262, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 13, "grp": 512, "rng": "75551〜75600", "cnt": 50, "kind": "fill", "x": 309, "y": 40, "w": 42, "h": 24, "orders": [{"no": "30369", "url": "https://drive.google.com/file/d/1uh_S_Hm6G9Tl_8fHWKLxQrWH7G6wHRtO/view"}, {"no": "30357", "url": "https://drive.google.com/file/d/1SzF6NlDZeSiy6Z3sVcMydhpi5FHySmBh/view"}]}, {"pos": 15, "grp": 554, "rng": "77651〜77700", "cnt": 50, "kind": "fill", "x": 355, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60585", "url": "https://drive.google.com/file/d/14U-n2NkQOUJZJ3EBoQZ0urmVc77WC_sI/view"}]}, {"pos": 41, "grp": 534, "rng": "76651〜76700", "cnt": 50, "kind": "fill", "x": 416, "y": 40, "w": 42, "h": 24, "orders": [{"no": "10465", "url": "https://drive.google.com/file/d/1Qn_i8WdqnsysItMIoaH84cddej_uxDPn/view"}, {"no": "10531", "url": "https://drive.google.com/file/d/1km26RMRkONEKZ41c-mmT5Vq7A2Wv4ZFk/view"}]}, {"pos": 43, "grp": 536, "rng": "76751〜76800", "cnt": 50, "kind": "fill", "x": 463, "y": 40, "w": 42, "h": 24, "orders": [{"no": "10513", "url": "https://drive.google.com/file/d/1BmeV0RxfIHAad9Ku2cUBZEmOzATyUz_j/view"}]}, {"pos": 45, "grp": 454, "rng": "72651〜72700", "cnt": 50, "kind": "fill", "x": 509, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60567", "url": "https://drive.google.com/file/d/1rUc_DAa_2pypbKGXMQI29hevQeWaCFDt/view"}]}, {"pos": 47, "grp": 458, "rng": "72851〜72900", "cnt": 50, "kind": "fill", "x": 555, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60565", "url": "https://drive.google.com/file/d/1TLZoOQnnJ-NdX6dPc21QApXeUD_EztkC/view"}]}, {"pos": 49, "grp": 632, "rng": "81551〜81600", "cnt": 50, "kind": "fill", "x": 601, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 63, "grp": 672, "rng": "83551〜83600", "cnt": 50, "kind": "fill", "x": 690, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 65, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 736, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 67, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 782, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 69, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 828, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 2, "grp": 523, "rng": "76101〜76150", "cnt": 50, "kind": "fill", "x": 16, "y": 111, "w": 42, "h": 24, "orders": [{"no": "30368", "url": "https://drive.google.com/file/d/1r1Vsfs789OInNM-8tSRt2_cVaVbexarw/view"}]}, {"pos": 4, "grp": 525, "rng": "76201〜76250", "cnt": 50, "kind": "fill", "x": 62, "y": 111, "w": 42, "h": 24, "orders": [{"no": "10527", "url": "https://drive.google.com/file/d/1JDSdk8ticsXhWV4Kjg7BY5ZnTVf9E6kF/view"}]}, {"pos": 6, "grp": 397, "rng": "69801〜69850", "cnt": 50, "kind": "fill", "x": 108, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60597", "url": "https://drive.google.com/file/d/17vCvo3-GMgrAAjWz_MgUGpoVM9P_4jHN/view"}]}, {"pos": 8, "grp": 451, "rng": "72501〜72550", "cnt": 50, "kind": "fill", "x": 155, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60563", "url": "https://drive.google.com/file/d/1VxAguew80xDGJ3DaX5_FYta0SGoquL14/view"}]}, {"pos": 10, "grp": 555, "rng": "77701〜77750", "cnt": 50, "kind": "fill", "x": 216, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 12, "grp": 557, "rng": "77801〜77850", "cnt": 50, "kind": "fill", "x": 262, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 14, "grp": 511, "rng": "75501〜75550", "cnt": 50, "kind": "fill", "x": 309, "y": 111, "w": 42, "h": 24, "orders": [{"no": "30357", "url": "https://drive.google.com/file/d/1SzF6NlDZeSiy6Z3sVcMydhpi5FHySmBh/view"}]}, {"pos": 16, "grp": 544, "rng": "77161〜77200", "cnt": 40, "kind": "fill", "x": 355, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 42, "grp": 533, "rng": "76601〜76650", "cnt": 50, "kind": "fill", "x": 416, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60575", "url": "https://drive.google.com/file/d/1DfqoKfoX1Zl0e3GqtZl3St0Uh-DnmIGD/view"}]}, {"pos": 44, "grp": 535, "rng": "76701〜76750", "cnt": 50, "kind": "fill", "x": 463, "y": 111, "w": 42, "h": 24, "orders": [{"no": "10531", "url": "https://drive.google.com/file/d/1km26RMRkONEKZ41c-mmT5Vq7A2Wv4ZFk/view"}]}, {"pos": 46, "grp": 453, "rng": "72601〜72650", "cnt": 50, "kind": "fill", "x": 509, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60566", "url": "https://drive.google.com/file/d/11--l66_4kmnYsqDHrTvW00Cl35-oBuU0/view"}]}, {"pos": 48, "grp": 457, "rng": "72801〜72850", "cnt": 50, "kind": "fill", "x": 555, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60575", "url": "https://drive.google.com/file/d/1DfqoKfoX1Zl0e3GqtZl3St0Uh-DnmIGD/view"}]}, {"pos": 50, "grp": 459, "rng": "72901〜72950", "cnt": 50, "kind": "fill", "x": 601, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60575", "url": "https://drive.google.com/file/d/1DfqoKfoX1Zl0e3GqtZl3St0Uh-DnmIGD/view"}]}, {"pos": 64, "grp": 671, "rng": "83501〜83550", "cnt": 50, "kind": "fill", "x": 690, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 66, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 736, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 68, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 782, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 70, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 828, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 17, "grp": null, "rng": "〜", "cnt": 40, "kind": "empty", "x": 16, "y": 218, "w": 42, "h": 24, "orders": [{"no": "60585", "url": "https://drive.google.com/file/d/14U-n2NkQOUJZJ3EBoQZ0urmVc77WC_sI/view"}]}, {"pos": 19, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 218, "w": 42, "h": 24, "orders": []}, {"pos": 31, "grp": 527, "rng": "76301〜76350", "cnt": 50, "kind": "fill", "x": 262, "y": 218, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 20, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 246, "w": 42, "h": 24, "orders": []}, {"pos": 32, "grp": 528, "rng": "76351〜76400", "cnt": 50, "kind": "fill", "x": 262, "y": 246, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 18, "grp": 549, "rng": "77401〜77450", "cnt": 50, "kind": "fill", "x": 16, "y": 274, "w": 42, "h": 24, "orders": [{"no": "60585", "url": "https://drive.google.com/file/d/14U-n2NkQOUJZJ3EBoQZ0urmVc77WC_sI/view"}]}, {"pos": 21, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 274, "w": 42, "h": 24, "orders": []}, {"pos": 33, "grp": 529, "rng": "76401〜76450", "cnt": 50, "kind": "fill", "x": 262, "y": 274, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 22, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 303, "w": 42, "h": 24, "orders": []}, {"pos": 34, "grp": 530, "rng": "76451〜76500", "cnt": 50, "kind": "fill", "x": 262, "y": 303, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 23, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 16, "y": 331, "w": 42, "h": 24, "orders": []}, {"pos": 35, "grp": 531, "rng": "76501〜76550", "cnt": 50, "kind": "fill", "x": 262, "y": 331, "w": 42, "h": 24, "orders": [{"no": "60572", "url": "https://drive.google.com/file/d/1FviEZg8DzmI7s9C5kssUMjcQCr8anPJL/view"}]}, {"pos": 51, "grp": 564, "rng": "78151〜78200", "cnt": 50, "kind": "fill", "x": 463, "y": 331, "w": 42, "h": 24, "orders": []}, {"pos": 57, "grp": 562, "rng": "78051〜78100", "cnt": 50, "kind": "fill", "x": 601, "y": 331, "w": 42, "h": 24, "orders": []}, {"pos": 24, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 16, "y": 360, "w": 42, "h": 24, "orders": []}, {"pos": 36, "grp": 532, "rng": "76551〜76600", "cnt": 50, "kind": "fill", "x": 262, "y": 360, "w": 42, "h": 24, "orders": [{"no": "60572", "url": "https://drive.google.com/file/d/1FviEZg8DzmI7s9C5kssUMjcQCr8anPJL/view"}]}, {"pos": 52, "grp": 563, "rng": "78101〜78150", "cnt": 50, "kind": "fill", "x": 463, "y": 360, "w": 42, "h": 24, "orders": []}, {"pos": 58, "grp": 561, "rng": "78001〜78050", "cnt": 50, "kind": "fill", "x": 601, "y": 360, "w": 42, "h": 24, "orders": []}, {"pos": 25, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 16, "y": 388, "w": 42, "h": 24, "orders": []}, {"pos": 27, "grp": 548, "rng": "77351〜77400", "cnt": 50, "kind": "fill", "x": 62, "y": 388, "w": 42, "h": 24, "orders": [{"no": "30365", "url": "https://drive.google.com/file/d/1c7Xh6TJrAOTMS0UO0-rNSM-_N76NKjWI/view"}]}, {"pos": 37, "grp": 553, "rng": "77601〜77650", "cnt": 50, "kind": "fill", "x": 262, "y": 388, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 53, "grp": 565, "rng": "78201〜78250", "cnt": 50, "kind": "fill", "x": 463, "y": 388, "w": 42, "h": 24, "orders": []}, {"pos": 59, "grp": 559, "rng": "77901〜77950", "cnt": 50, "kind": "fill", "x": 601, "y": 388, "w": 42, "h": 24, "orders": []}, {"pos": 28, "grp": 547, "rng": "77301〜77350", "cnt": 50, "kind": "fill", "x": 62, "y": 416, "w": 42, "h": 24, "orders": [{"no": "30365", "url": "https://drive.google.com/file/d/1c7Xh6TJrAOTMS0UO0-rNSM-_N76NKjWI/view"}]}, {"pos": 38, "grp": 552, "rng": "77551〜77600", "cnt": 50, "kind": "fill", "x": 262, "y": 416, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 54, "grp": 566, "rng": "78251〜78300", "cnt": 50, "kind": "fill", "x": 463, "y": 416, "w": 42, "h": 24, "orders": []}, {"pos": 60, "grp": 560, "rng": "77951〜78000", "cnt": 50, "kind": "fill", "x": 601, "y": 416, "w": 42, "h": 24, "orders": []}, {"pos": 26, "grp": null, "rng": "〜", "cnt": null, "kind": "empty", "x": 16, "y": 437, "w": 42, "h": 24, "orders": []}, {"pos": 29, "grp": 546, "rng": "77251〜77300", "cnt": 50, "kind": "fill", "x": 62, "y": 445, "w": 42, "h": 24, "orders": [{"no": "30362", "url": "https://drive.google.com/file/d/1UAJbBc4xYJBQDWwuKzREHTiANHUGSBJR/view"}]}, {"pos": 39, "grp": 551, "rng": "77501〜77550", "cnt": 50, "kind": "fill", "x": 262, "y": 445, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 55, "grp": 567, "rng": "78301〜78350", "cnt": 50, "kind": "fill", "x": 463, "y": 445, "w": 42, "h": 24, "orders": []}, {"pos": 61, "grp": 569, "rng": "78401〜78450", "cnt": 50, "kind": "fill", "x": 601, "y": 445, "w": 42, "h": 24, "orders": []}, {"pos": 30, "grp": 545, "rng": "77201〜77250", "cnt": 50, "kind": "fill", "x": 62, "y": 473, "w": 42, "h": 24, "orders": []}, {"pos": 40, "grp": 550, "rng": "77451〜77500", "cnt": 50, "kind": "fill", "x": 262, "y": 473, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 56, "grp": 568, "rng": "78351〜78400", "cnt": 50, "kind": "fill", "x": 463, "y": 473, "w": 42, "h": 24, "orders": [{"no": "70211", "url": "https://drive.google.com/file/d/1S-SGHCM2tSoXCGa77u3o24qLFAuZabE7/view"}]}, {"pos": 62, "grp": 570, "rng": "78451〜78500", "cnt": 50, "kind": "fill", "x": 601, "y": 473, "w": 42, "h": 24, "orders": []}], "landmarks": [
  /* ★ 位置63〜70の一帯。名前は20kマスタの見出しどおり
       「小容器ﾎﾞﾋﾞﾝ（50本単位ｴﾘｱ)」。
       位置63〜70を足したときにマップ幅を890に広げたため全体が36%まで縮み、
       右端のこの一帯は区画ラベルが6pxで読めなくなっていた。
       見出しを置いて、縮尺が小さいままでも場所が分かるようにする。 */
  {"x": 676, "y": 8, "w": 210, "h": 24, "label": "小容器ボビン", "kind": "area"}
], "focus": [
  /* ズームで一発で寄れるようにする範囲 */
  {"label": "小容器ボビン", "x": 668, "y": 4, "w": 222, "h": 145}
]};

const YARD_STYLE = {
  "50k": { fill: "#dbe6f2", stroke: "#173a5e", text: "#0f2942" },
  "20k": { fill: "#d9ebe6", stroke: "#2f7d6b", text: "#134a3d" },
};

function YardBlock({ b, size, selected, matched, dimmed, onSelect }) {
  const st = YARD_STYLE[size];
  let fill = st.fill, stroke = st.stroke, tcol = st.text;
  if (b.kind === "empty") { fill = "#f8fafc"; stroke = "#cbd5e1"; tcol = "#94a3b8"; }
  const hasOrder = b.orders && b.orders.length > 0;
  if (hasOrder) { fill = "#ffe4c7"; stroke = "#ea7a17"; tcol = "#9a4b06"; }

  const narrow = b.w <= 44;
  const grpFontSize = narrow ? "9" : "10.5";
  const midY = b.y + b.h / 2 + (narrow ? 2 : 3);

  return (
    <g onClick={() => onSelect(b)} style={{ cursor: "pointer", opacity: dimmed ? 0.25 : 1 }}>
      {/* 検索ヒットは外側に太い枠を出す（塗りは変えないので状態の色が読める） */}
      {matched && (
        <rect x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx="5"
          fill="none" stroke="#2563eb" strokeWidth="2.5" />
      )}
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill={fill}
        stroke={selected ? SAFETY : stroke} strokeWidth={selected ? 3 : 1.2}
        strokeDasharray={b.kind === "empty" ? "4 3" : undefined} />

      {/* 上段：位置番号（左）とバッジ（右）— 群番号と重ならないよう上端に固定 */}
      <text x={b.x + 3} y={b.y + 8} textAnchor="start" fontSize="5.5" fontWeight="700"
        fill={b.kind === "empty" ? tcol : stroke}>{"<" + b.pos + ">"}</text>
      {hasOrder && (
        <>
          <circle cx={b.x + b.w - 6} cy={b.y + 6} r="4.5" fill="#ea7a17" />
          <text x={b.x + b.w - 6} y={b.y + 8} textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff">{b.orders.length}</text>
        </>
      )}

      {b.kind === "empty" ? (
        <text x={b.x + b.w / 2} y={b.y + b.h - 4} textAnchor="middle" fontSize="6.5" fill="#b6c0cc">空き</text>
      ) : (
        <>
          <text x={b.x + b.w / 2} y={midY} textAnchor="middle" fontSize={grpFontSize} fontWeight="700" fill={tcol}>{b.grp}</text>
          {b.cnt != null && <text x={b.x + b.w / 2} y={b.y + b.h - 3} textAnchor="middle" fontSize="6.5" fill="#475569">{b.cnt + "本"}</text>}
        </>
      )}
    </g>
  );
}

// ISO形式の日付文字列("2026-08-21T07:00:00.000Z"など)が来た場合は「8月21日」形式に、
// すでに「8月21日」「8/21(2件)」のようなテキストならそのまま表示する
function yard_formatShipDateDisplay(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (m) return `${Number(m[2])}月${Number(m[3])}日`;
  return String(v);
}

function YardMap({ yardLive, onRefresh }) {
  const [size, setSize] = useState("50k");
  const [view, setView] = useState("map");
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ grpNo: "", rangeStart: "", rangeEnd: "", qty: "" });
  const [saveStatus, setSaveStatus] = useState(null); // null | "saving" | "done" | "error"
  const rawData = size === "50k" ? MAP_50K : MAP_20K;
  const liveForSize = (yardLive && yardLive[size]) || {};
  // 見た目（位置・建屋配置）は静的データのまま、群番号・容器番号・本数・依頼No・状態だけ
  // 実際のスプレッドシートの最新値（あれば）で上書きする
  const data = {
    ...rawData,
    blocks: rawData.blocks.map((b) => {
      const liveB = liveForSize[String(b.pos)];
      if (!liveB) return b;
      // GAS側が依頼No＋PDFリンクまで一括で解決して返してくるので、そのまま使う
      const orders = liveB.orders != null ? liveB.orders : b.orders;
      return {
        ...b,
        grp: liveB.groupNo != null ? liveB.groupNo : b.grp,
        rng: (liveB.rangeStart != null && liveB.rangeEnd != null) ? `${liveB.rangeStart}〜${liveB.rangeEnd}` : b.rng,
        cnt: liveB.qty != null ? liveB.qty : b.cnt,
        kind: liveB.kind || b.kind,
        shipDate: liveB.shipDate || b.shipDate,
        orders,
      };
    }),
  };
  /* ---------- 区画検索 ---------- */
  // 依頼No / 容器番号 / GNo / 位置ラベル で該当区画を探す。
  // 検索に必要な値はすべてこの時点の data.blocks に揃っているので、
  // GASへの問い合わせは不要（＝入力するたびに即座に絞り込める）。
  const [query, setQuery] = useState("");

  // "76151〜76200" のような表記から数値の範囲を取り出す
  const parseRange = (rng) => {
    if (!rng) return null;
    const m = String(rng).match(/(\d+)\s*[〜~～-]\s*(\d+)/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    if (!a || !b || a > b) return null;   // "-99〜0"（未入力）は範囲として扱わない
    return { start: a, end: b };
  };

  const matchBlock = (b, q) => {
    const hit = [];
    // 位置ラベル（完全一致のみ。部分一致だと1と10などが混ざる）
    if (String(b.pos) === q) hit.push("位置");
    // GNo（完全一致）
    if (b.grp != null && String(b.grp) === q) hit.push("GNo");
    // 依頼No（部分一致。「30462」でも「26-30462」でも引っかかるように）
    if (b.orders && b.orders.some((o) => o && o.no && String(o.no).indexOf(q) !== -1)) hit.push("依頼No");
    // 容器番号（数字ならレンジに含まれるかを見る）
    const n = Number(q);
    if (q !== "" && !isNaN(n)) {
      const r = parseRange(b.rng);
      if (r && n >= r.start && n <= r.end) hit.push("容器番号");
    }
    return hit;
  };

  const q = query.trim();
  // ヒットした区画の位置ラベル→ヒット理由
  const searchHits = {};
  let hitCount = 0;
  if (q) {
    data.blocks.forEach((b) => {
      const why = matchBlock(b, q);
      if (why.length > 0) { searchHits[String(b.pos)] = why; hitCount++; }
    });
  }
  const isHit = (b) => q !== "" && !!searchHits[String(b.pos)];

  /* ---------- マップのピンチズーム／パン ---------- */
  // viewBoxを書き換える方式にしている（CSSのtransformだとタップ位置と
  // 図形のずれが出るため）。zoom が null のときは等倍・全体表示。
  const [zoom, setZoom] = useState(null);   // null | { x, y, scale }
  const svgRef = React.useRef(null);
  // ジェスチャ中の一時的な値。再描画に関係ないのでrefに置く
  const gest = React.useRef({ mode: null, moved: 0, px: 0, py: 0, startZoom: null, startDist: 0, suppressClick: false });

  const vbNums = data.viewBox.split(" ").map(Number);   // [x, y, w, h]
  const baseX = vbNums[0], baseY = vbNums[1], baseW = vbNums[2], baseH = vbNums[3];
  const MIN_SCALE = 1, MAX_SCALE = 5;
  const curScale = zoom ? zoom.scale : 1;
  const curViewBox = zoom
    ? zoom.x + " " + zoom.y + " " + (baseW / zoom.scale) + " " + (baseH / zoom.scale)
    : data.viewBox;

  // 表示範囲がマップの外に出ないように収める
  const clampZoom = (x, y, scale) => {
    const s = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
    const w = baseW / s, h = baseH / s;
    return {
      x: Math.min(Math.max(x, baseX), baseX + baseW - w),
      y: Math.min(Math.max(y, baseY), baseY + baseH - h),
      scale: s,
    };
  };
  // 画面上の1pxが viewBox 何単位に相当するか
  const unitPerPx = () => {
    const el = svgRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    if (!rect || !rect.width) return baseW / 360;
    return (baseW / curScale) / rect.width;
  };
  const midOf = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });
  const distOf = (t1, t2) => {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  // 画面座標 → viewBox座標
  const toVb = (clientX, clientY, z) => {
    const el = svgRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    if (!rect || !rect.width) return { x: baseX, y: baseY };
    const w = baseW / z.scale, h = baseH / z.scale;
    return {
      x: z.x + (clientX - rect.left) * (w / rect.width),
      y: z.y + (clientY - rect.top) * (h / rect.height),
    };
  };

  const onTouchStart = (e) => {
    const t = e.touches;
    const z = zoom || { x: baseX, y: baseY, scale: 1 };
    gest.current.moved = 0;
    gest.current.startZoom = z;
    if (t.length === 2) {
      gest.current.mode = "pinch";
      gest.current.startDist = distOf(t[0], t[1]);
      const m = midOf(t[0], t[1]);
      gest.current.anchorVb = toVb(m.x, m.y, z);
    } else if (t.length === 1) {
      gest.current.mode = "pan";
      gest.current.px = t[0].clientX;
      gest.current.py = t[0].clientY;
    }
  };

  const onTouchMove = (e) => {
    const t = e.touches;
    const g = gest.current;
    if (g.mode === "pinch" && t.length === 2 && g.startDist > 0) {
      const ratio = distOf(t[0], t[1]) / g.startDist;
      const nextScale = Math.min(Math.max(g.startZoom.scale * ratio, MIN_SCALE), MAX_SCALE);
      const m = midOf(t[0], t[1]);
      const el = svgRef.current;
      const rect = el ? el.getBoundingClientRect() : null;
      g.moved = 999;   // ピンチはタップ扱いにしない
      if (rect && rect.width) {
        const w = baseW / nextScale, h = baseH / nextScale;
        // つまんだ点がずれないように、その点を基準に表示範囲を決める
        const nx = g.anchorVb.x - (m.x - rect.left) * (w / rect.width);
        const ny = g.anchorVb.y - (m.y - rect.top) * (h / rect.height);
        setZoom(clampZoom(nx, ny, nextScale));
      } else {
        setZoom(clampZoom(g.startZoom.x, g.startZoom.y, nextScale));
      }
    } else if (g.mode === "pan" && t.length === 1) {
      const dx = t[0].clientX - g.px;
      const dy = t[0].clientY - g.py;
      g.moved += Math.abs(dx) + Math.abs(dy);
      g.px = t[0].clientX;
      g.py = t[0].clientY;
      if (zoom) {   // 等倍のときは動かさない（区画のタップを邪魔しないため）
        const u = unitPerPx();
        setZoom(clampZoom(zoom.x - dx * u, zoom.y - dy * u, zoom.scale));
      }
    }
  };

  const onTouchEnd = () => {
    // 指を動かしていたらタップ扱いにしない（パン中に区画が選択されるのを防ぐ）
    if (gest.current.moved > 8) gest.current.suppressClick = true;
    gest.current.mode = null;
  };

  const onClickCapture = (e) => {
    if (gest.current.suppressClick) {
      gest.current.suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const zoomBy = (mul) => {
    const z = zoom || { x: baseX, y: baseY, scale: 1 };
    const nextScale = Math.min(Math.max(z.scale * mul, MIN_SCALE), MAX_SCALE);
    if (nextScale === 1) { setZoom(null); return; }
    // 表示中の中心を保ったまま拡大縮小する
    const w = baseW / z.scale, h = baseH / z.scale;
    const cx = z.x + w / 2, cy = z.y + h / 2;
    const nw = baseW / nextScale, nh = baseH / nextScale;
    setZoom(clampZoom(cx - nw / 2, cy - nh / 2, nextScale));
  };
  const resetZoom = () => setZoom(null);

  // ★ 指定した範囲が画面いっぱいになるように寄る。
  //   マップ全体が36%まで縮んでいて、小容器ボビンのように端にある一帯は
  //   最初の表示では区画の判別ができない。1タップで寄れるようにする。
  const zoomToRect = (r) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(baseW / r.w, baseH / r.h)));
    if (s <= MIN_SCALE) { setZoom(null); return; }
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    setZoom(clampZoom(cx - (baseW / s) / 2, cy - (baseH / s) / 2, s));
  };

  const switchSize = (s) => { setSize(s); setSel(null); setEditing(false); setZoom(null); };

  const [orderLookupStatus, setOrderLookupStatus] = useState(null); // null | "loading" | "done" | "error"

  // ブロックをタップしたときに、実際のドライブ内の指図書PDFリンクを取得する
  // （マップ全体の一括更新では行わない＝Drive検索が重いため、タップ時だけ）
  const selectBlock = (b) => {
    setSel(b);
    setEditing(false);
    if (typeof google !== "undefined" && google.script && google.script.run) {
      setOrderLookupStatus("loading");
      google.script.run
        .withSuccessHandler((detail) => {
          setOrderLookupStatus("done");
          if (detail && detail.found && detail.orders) {
            setSel((prev) => (prev && prev.pos === b.pos && prev.x === b.x) ? { ...prev, orders: detail.orders } : prev);
          }
        })
        .withFailureHandler((err) => {
          setOrderLookupStatus("error: " + String(err));
        })
        .getYardBlockDetailWithPdf(size, String(b.pos));
    } else {
      setOrderLookupStatus("no-gas-env");
    }
  };

  const startEdit = () => {
    if (!sel) return;
    const [rs, re] = (sel.rng || "").split("〜");
    setEditForm({
      grpNo: sel.grp != null ? String(sel.grp) : "",
      rangeStart: rs || "",
      rangeEnd: re || "",
      qty: sel.cnt != null ? String(sel.cnt) : "",
    });
    setSaveStatus(null);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!sel) return;
    if (typeof google === "undefined" || !google.script || !google.script.run) {
      setSaveStatus("error");
      return;
    }
    setSaveStatus("saving");
    google.script.run
      .withSuccessHandler((res) => {
        if (res && res.success) {
          setSaveStatus("done");
          setEditing(false);
          // ローカル表示も即座に反映（次回の自動更新で実データに置き換わる）
          sel.grp = editForm.grpNo ? Number(editForm.grpNo) : sel.grp;
          sel.rng = editForm.rangeStart && editForm.rangeEnd ? `${editForm.rangeStart}〜${editForm.rangeEnd}` : sel.rng;
          sel.cnt = editForm.qty ? Number(editForm.qty) : sel.cnt;
          sel.kind = editForm.grpNo ? "fill" : "empty";
          setSel({ ...sel });
          // 保存直後は、まだ古いライブデータ(yardLive)がキャッシュされたままなので、
          // 再取得しないとマップ・一覧側の表示がすぐ古い数字に上書きされてしまう。
          // ここで最新データを取り直す。
          if (onRefresh) onRefresh();
        } else {
          setSaveStatus("error");
        }
      })
      .withFailureHandler(() => setSaveStatus("error"))
      .updateYardBlock({
        sizeKey: size,
        pos: String(sel.pos),
        groupNo: editForm.grpNo,
        rangeStart: editForm.rangeStart,
        rangeEnd: editForm.rangeEnd,
        qty: editForm.qty,
        // GNoが入っていれば「在庫(fill)」として明示的に記録する。
        // 指定しないと一覧タブの状態(kind)が古い「空き」のままになり、
        // マップのアイコンが空き表示のままになってしまうため。
        kind: editForm.grpNo ? "fill" : "empty",
      });
  };

  const statusOf = (b) => (b.orders && b.orders.length > 0) ? "引当済" : b.kind === "empty" ? "空き" : "在庫";
  const toneOf = (b) => (b.orders && b.orders.length > 0) ? "warn" : b.kind === "empty" ? "neutral" : "ok";
  const blocksSorted = [...data.blocks].sort((a, b) => {
    const ao = a.orders && a.orders.length ? 0 : 1;
    const bo = b.orders && b.orders.length ? 0 : 1;
    return ao - bo || a.pos - b.pos;
  });
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1">
          {["50k", "20k"].map((s) => (
            <button key={s} onClick={() => switchSize(s)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${size === s ? "text-white" : "text-slate-500 bg-slate-100"}`}
              style={size === s ? { background: NAVY } : undefined}>
              {s} 入込場
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {[["map", "マップ"], ["list", "一覧"]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${view === v ? "text-white" : "text-slate-500 bg-slate-100"}`}
              style={view === v ? { background: NAVY } : undefined}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 検索欄。依頼No・容器番号・GNo・位置ラベルのどれでも引ける */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="依頼No / 容器番号 / GNo / 位置"
          style={{ flex: 1, minWidth: 0, padding: "7px 10px", fontSize: 13, borderRadius: 6,
                   border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a" }}
        />
        {q !== "" && (
          <button onClick={() => setQuery("")}
            style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", padding: "4px 2px" }}>
            クリア
          </button>
        )}
      </div>
      {q !== "" && (
        <div style={{ fontSize: 11, marginBottom: 8, color: hitCount > 0 ? "#1d4ed8" : "#b45309" }}>
          {hitCount > 0
            ? hitCount + "件ヒット（" + Object.keys(searchHits).map((p) => "<" + p + ">").join(" ") + "）"
            : "該当する区画がありません"}
        </div>
      )}

      {view === "map" && (
        <div>
          <div
            style={{ width: "100%", overflow: "hidden", touchAction: "none", borderRadius: 8 }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            onClickCapture={onClickCapture}
          >
          <svg ref={svgRef} viewBox={curViewBox} className="w-full h-auto" style={{ width: "100%", maxHeight: 560, display: "block" }}>
          <rect x="6" y="6" width={data.viewBox.split(" ")[2] - 12} height={data.viewBox.split(" ")[3] - 12} rx="8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
          {data.landmarks.map((l, i) => (
            <g key={"lm" + i}>
              <rect x={l.x} y={l.y} width={l.w} height={l.h} rx="4"
                fill={l.kind === "shed" ? "#ece4d3" : "#e2e8f0"} stroke={l.kind === "shed" ? "#b9a77e" : "#94a3b8"} />
              <text x={l.x + l.w / 2} y={l.y + l.h / 2 + (l.sub ? -1 : 3)} textAnchor="middle" fontSize="9" fontWeight="700" fill={l.kind === "shed" ? "#6b5b34" : "#475569"}>{l.label}</text>
              {l.sub && <text x={l.x + l.w / 2} y={l.y + l.h / 2 + 9} textAnchor="middle" fontSize="7" fill="#8a7a4e">{l.sub}</text>}
            </g>
          ))}
          {data.blocks.map((b, i) => (
            <YardBlock key={i} b={b} size={size} selected={sel && sel.pos === b.pos && sel.x === b.x}
              matched={isHit(b)} dimmed={q !== "" && hitCount > 0 && !isHit(b)} onSelect={selectBlock} />
          ))}
        </svg>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <button onClick={() => zoomBy(1 / 1.6)} disabled={curScale <= 1}
              style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cbd5e1",
                       background: "#fff", fontSize: 16, lineHeight: 1, color: curScale <= 1 ? "#cbd5e1" : "#334155" }}>−</button>
            <button onClick={() => zoomBy(1.6)} disabled={curScale >= 5}
              style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cbd5e1",
                       background: "#fff", fontSize: 16, lineHeight: 1, color: curScale >= 5 ? "#cbd5e1" : "#334155" }}>＋</button>
            <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums", minWidth: 38 }}>
              {Math.round(curScale * 100) + "%"}
            </span>
            {zoom && (
              <button onClick={resetZoom}
                style={{ fontSize: 11, fontWeight: 600, color: NAVY, background: "none", border: "none",
                         padding: "4px 2px", whiteSpace: "nowrap" }}>
                全体に戻す
              </button>
            )}
            {/* ★ 端にある一帯（小容器ボビンなど）へ1タップで寄れるようにする。
                  マップのデータに focus があるサイズだけボタンが出る。 */}
            {(data.focus || []).map((r) => (
              <button key={r.label} onClick={() => zoomToRect(r)}
                style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: NAVY,
                         border: "none", borderRadius: 6, padding: "5px 9px", whiteSpace: "nowrap" }}>
                {r.label}
              </button>
            ))}
            <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto", textAlign: "right" }}>
              {zoom ? "1本指で移動・2本指でズーム" : "2本指でズームできます"}
            </span>
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {(q !== "" && hitCount > 0 ? blocksSorted.filter(isHit) : blocksSorted).map((b, i) => (
            <button key={i} onClick={() => selectBlock(b)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left ${sel && sel.pos === b.pos && sel.x === b.x ? "bg-amber-50" : "active:bg-slate-50"}`}>
              <span className="text-xs font-mono w-9 shrink-0"
                style={{ color: isHit(b) ? "#1d4ed8" : "#94a3b8", fontWeight: isHit(b) ? 700 : 400 }}>{"<" + b.pos + ">"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800">{b.grp ? "GNo " + b.grp : "（空き・予定）"}</div>
                <div className="text-[11px] text-slate-500 tabular-nums">{b.rng && b.rng !== "-99〜0" ? b.rng : "—"}{b.cnt != null ? " ・ " + b.cnt + "本" : ""}</div>
              </div>
              <Chip tone={toneOf(b)}>{statusOf(b)}</Chip>
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-slate-800">位置 &lt;{sel.pos}&gt;{sel.grp ? ` ・ GNo ${sel.grp}` : ""}</span>
            <div className="flex items-center gap-2">
              {!editing && <button onClick={startEdit} className="text-xs font-semibold" style={{ color: NAVY }}>編集</button>}
              <button onClick={() => { setSel(null); setEditing(false); }} className="text-xs text-slate-400">閉じる</button>
            </div>
          </div>

          {editing ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500">
                  群番号
                  <input type="text" value={editForm.grpNo}
                    onChange={(e) => {
                      const g = e.target.value;
                      if (size === "20k" && g && /^\d+$/.test(g)) {
                        // 20kgは「容器番号 = 50000 + (群番号-1) × 50 + 1」で規則的に決まる（番号早見表で確認済み）
                        const gn = Number(g);
                        const rs = 50000 + (gn - 1) * 50 + 1;
                        const re = 50000 + gn * 50;
                        setEditForm({ ...editForm, grpNo: g, rangeStart: String(rs), rangeEnd: String(re) });
                      } else if (size === "50k" && g && /^\d+$/.test(g)) {
                        // 50kgは「容器番号 = (群番号-1) × 100 + 1」〜「群番号 × 100」で規則的に決まる
                        // （実際の出荷作業指図書で確認済み。20kgと違い50000のオフセットは無い）
                        const gn = Number(g);
                        const rs = (gn - 1) * 100 + 1;
                        const re = gn * 100;
                        setEditForm({ ...editForm, grpNo: g, rangeStart: String(rs), rangeEnd: String(re) });
                      } else {
                        setEditForm({ ...editForm, grpNo: g });
                      }
                    }}
                    className="mt-0.5 w-full text-sm px-2 py-1 rounded border border-slate-300" />
                </label>
                <label className="text-[11px] text-slate-500">
                  本数
                  <input type="number" value={editForm.qty}
                    onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })}
                    className="mt-0.5 w-full text-sm px-2 py-1 rounded border border-slate-300" />
                </label>
                <label className="text-[11px] text-slate-500">
                  容器番号（開始）
                  <input type="number" value={editForm.rangeStart} readOnly
                    onChange={(e) => setEditForm({ ...editForm, rangeStart: e.target.value })}
                    className={`mt-0.5 w-full text-sm px-2 py-1 rounded border border-slate-300 bg-slate-100 text-slate-500`} />
                </label>
                <label className="text-[11px] text-slate-500">
                  容器番号（終了）
                  <input type="number" value={editForm.rangeEnd} readOnly
                    onChange={(e) => setEditForm({ ...editForm, rangeEnd: e.target.value })}
                    className={`mt-0.5 w-full text-sm px-2 py-1 rounded border border-slate-300 bg-slate-100 text-slate-500`} />
                </label>
              </div>
              <p className="text-[10px] text-slate-400">
                {size === "20k"
                  ? "※ 20kgは群番号から容器番号を自動計算します（50000＋(群番号−1)×50＋1）"
                  : "※ 50kgは群番号から容器番号を自動計算します（(群番号−1)×100＋1 〜 群番号×100）"}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={saveEdit} disabled={saveStatus === "saving"}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: NAVY }}>
                  {saveStatus === "saving" ? "保存中…" : "保存"}
                </button>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-500 bg-slate-100">
                  キャンセル
                </button>
                {saveStatus === "error" && <span className="text-[11px] text-red-600">保存に失敗しました（GAS環境でのみ保存できます）</span>}
              </div>
            </div>
          ) : (
            <>
              {sel.shipDate && (
                <div className="text-center mb-2">
                  <div className="text-[10px] text-slate-400">出荷希望日</div>
                  <div className="text-xl font-bold text-slate-900">{yard_formatShipDateDisplay(sel.shipDate)}</div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[10px] text-slate-400">容器番号</div><div className="text-xs font-medium text-slate-700 tabular-nums">{sel.rng && sel.rng !== "-99〜0" ? sel.rng : "—"}</div></div>
                <div><div className="text-[10px] text-slate-400">本数</div><div className="text-base font-bold text-slate-900 tabular-nums">{sel.cnt != null ? sel.cnt + " 本" : "—"}</div></div>
                <div><div className="text-[10px] text-slate-400">状態</div><div className="text-xs font-medium">{sel.orders && sel.orders.length > 0 ? "引当済" : sel.kind === "empty" ? "空き・予定" : "在庫"}</div></div>
              </div>
              {saveStatus === "done" && <p className="text-[11px] text-emerald-600 mt-1.5">保存しました（スプレッドシートに反映済み）</p>}
            </>
          )}

          {!editing && orderLookupStatus === "loading" && (!sel.orders || sel.orders.length === 0) && (
            <p className="text-[11px] text-slate-400 mt-2">指図書PDFを検索中…</p>
          )}
          {!editing && orderLookupStatus && orderLookupStatus.indexOf("error") === 0 && (
            <p className="text-[11px] text-red-500 mt-2">検索エラー: {orderLookupStatus}</p>
          )}
          {!editing && sel.orders && sel.orders.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-200">
              <div className="text-[10px] text-slate-400 mb-1.5">出荷作業指図書</div>
              <div className="flex flex-wrap gap-1.5">
                {sel.orders.map((o, i) =>
                  o.url ? (
                    <a key={i} href={o.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                      style={{ background: "#2563eb" }}>
                      <FileText size={12} />26-{o.no} を開く
                    </a>
                  ) : (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-400 bg-slate-100">
                      26-{o.no}（PDF未検出）
                    </span>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#dbe6f2", border: "1px solid #173a5e" }} />50k 在庫</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#d9ebe6", border: "1px solid #2f7d6b" }} />20k 在庫</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-slate-300" style={{ background: "#f8fafc" }} />空き・予定</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#ffe4c7", border: "1px solid #ea7a17" }} />引当済</span>
        <span className="text-slate-400">ブロックをタップで明細</span>
      </div>
    
    </Card>
  );
}

function YardTab({ inventory, invTotal, byYear, oldest, yardLive, onRefresh }) {
  const maxYear = Math.max(...byYear.map((y) => y.count));
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle note="入込場マップ（実配置）">構内レイアウト</SectionTitle>
        <YardMap yardLive={yardLive} onRefresh={onRefresh} />
      </div>
      <div>
        <SectionTitle note="在庫照会 8/6 時点">サイズ別 在庫本数</SectionTitle>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {inventory.map((s) => (
            <Card key={s.size} className="p-3">
              <div className="text-[11px] text-slate-500 mb-0.5 truncate">{s.label}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold tabular-nums text-slate-900">{s.total.toLocaleString()}</span>
                <span className="text-[10px] text-slate-400">本{s.approx ? "※" : ""}</span>
              </div>
            </Card>
          ))}
          <Card className="p-3" style={{ background: NAVY }}>
            <div className="text-[11px] text-slate-300 mb-0.5">合計</div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums text-white">{invTotal.toLocaleString()}</span>
              <span className="text-[10px] text-slate-400">本</span>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <SectionTitle note="全在庫 実データ">製造年の内訳</SectionTitle>
          <Card className="p-4 space-y-3">
            {byYear.map((y, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-slate-700">{y.year}</span>
                  <span className="text-sm font-bold tabular-nums text-slate-900">{y.count.toLocaleString()} 本</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(y.count / maxYear) * 100}%`, background: NAVY_SOFT }} />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-slate-400 pt-1">最古の刻印月：{oldest}（古いロットの滞留チェック用）</p>
          </Card>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">※ GAS環境で開くと在庫照会の最新データに自動更新されます（5分ごと）。</p>
    </div>
  );
}

/* ---------- ルート ---------- */
/* ------------------------------------------------------------------ */
/*  実績・推移タブ                                                     */
/*  グラフは外部ライブラリが使えない（GASは外部CDN不可）ので            */
/*  インラインSVGを手書きしている。                                     */
/*  配色は検証済みのカテゴリ配色スロット1・2（青・橙）。                */
/*  CVD（色覚特性）分離 ΔE 24.7 で、色が見分けにくい人でも区別できる。  */
/* ------------------------------------------------------------------ */

const VIZ = {
  s1: "#2a78d6",      // 系列1：50kg
  s2: "#eb6834",      // 系列2：20kg / 出荷
  s3: "#7c3aed",      // 系列3：受注
  /* ★ 3色は scripts/validate_palette.js で検証済み。
       色覚特性がある場合でも隣り合う色の差はΔE 24.7以上、
       通常の見え方では33.6。色だけに頼らず凡例と直接ラベルも併用する。 */
  grid: "#e2e8f0",    // 目盛り線（面色から1段だけ違う色。実線のヘアライン）
  ink: "#0f172a",     // 本文
  ink2: "#475569",    // 補助
  muted: "#94a3b8",   // 目盛りラベル
  divider: "#cbd5e1", // 月の区切り線（目盛り線より1段はっきりさせる）
  surface: "#ffffff", // 面色（マーカーのリングに使う）
};

// 目盛りを切りのいい数字にする（0 / 500 / 1,000 のように）
function vizNiceTicks(maxValue, wantCount) {
  if (!maxValue || maxValue <= 0) return { max: 1, ticks: [0, 1] };
  const raw = maxValue / wantCount;
  const mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const max = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return { max, ticks };
}

const vizComma = (n) => (n == null ? "—" : Number(n).toLocaleString("ja-JP"));

/* 日付・年月の表示。
   ★ サーバ側で 'yyyy-MM-dd' / 'yyyy-MM' の文字列に整えて渡しているが、
     スプレッドシートが日付として保存してしまう性質があるので、万一
     "Sun Aug 17 2026 00:00:00 GMT+0900 (日本標準時)" のような値が来ても
     画面にそのまま出さないよう、ここでも受け止める。 */
const VIZ_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function vizDateParts(v) {
  const s = String(v == null ? "" : v);
  const m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: m[3] ? Number(m[3]) : null };
  // "Mon Aug 17 2026 00:00:00 GMT+0900 (日本標準時)" 形式。
  // ★ ここで new Date() を通さないこと。文字列は日本時間の0時なので、
  //   端末のタイムゾーンがずれていると前日になってしまう。文字から直接読む。
  const m2 = s.match(/^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/);
  if (m2) {
    const mi = VIZ_MON.indexOf(m2[1]);
    if (mi >= 0) return { y: Number(m2[3]), m: mi + 1, d: Number(m2[2]) };
  }
  return null;
}
const vizShortDate = (v) => { const p = vizDateParts(v); return p && p.d ? p.m + "/" + p.d : String(v == null ? "" : v); };
const vizMonthLabel = (v) => { const p = vizDateParts(v); return p ? p.m + "月" : String(v == null ? "" : v); };
const vizYearMonth = (v) => { const p = vizDateParts(v); return p ? p.y + "-" + (p.m < 10 ? "0" + p.m : p.m) : String(v == null ? "" : v); };

/* 日の並びから「月が変わる位置」を拾う。
   在庫推移は日ごとの点を全期間ぶん並べるので、どこで月が替わったのかが
   わからないと読めない。区切り線と月の見出しを入れるための下ごしらえ。
   返す i は「新しい月の最初の点」の位置。区切り線はその1つ前との中間に引く。 */
function vizMonthBounds(days, dateKey) {
  const out = [];
  let prev = null;
  days.forEach((d, i) => {
    const p = vizDateParts(d[dateKey]);
    if (!p) return;
    const ym = p.y + "-" + p.m;
    if (prev !== null && ym !== prev) out.push({ i: i, label: p.m + "月" });
    prev = ym;
  });
  return out;
}

/* SVGの文字幅のおおよその見積り。ラベルが重なるかどうかの判定に使う。
   （SVGには折り返しも自動回避も無いので、重なりは自分で防ぐしかない） */
function vizTextW(str, fontSize) {
  let w = 0;
  for (const ch of String(str)) w += (ch.charCodeAt(0) > 0x2e80 ? 1.0 : 0.56) * fontSize;
  return w;
}

/* x軸に置くラベルを決める（純関数）。
   「最初の日付 → 月の見出し → 最後の日付」の順に置いていき、
   SVGは文字が重なっても勝手に避けてくれないので、置く前に幅を見て
   ぶつかるものは落とす。優先順位は 最初の日付 > 月の見出し > 最後の日付。
   （最後の日付はカードの見出しにも出ているので、落ちても情報は失われない）
   ★ グラフ本体から切り出してあるのは、日数が増えたときに
     ラベルが重ならないかを、描画せずに数だけで検証できるようにするため。 */
function vizXAxisItems(days, bounds, dateKey, xAt, padL, plotW, fontSize) {
  const FS = fontSize, GAP = 4;
  const items = [];
  if (!days || days.length === 0) return items;

  const startTxt = vizShortDate(days[0][dateKey]);
  items.push({ x: padL, anchor: "start", text: startTxt,
               l: padL, r: padL + vizTextW(startTxt, FS) });

  bounds.forEach((b) => {
    const bx = xAt(b.i - 0.5) + 2;
    const w = vizTextW(b.label, FS);
    if (bx + w > padL + plotW) return;                       // 右端からはみ出す
    if (items.some((it) => bx < it.r + GAP && bx + w + GAP > it.l)) return;
    items.push({ x: bx, anchor: "start", text: b.label,
                 l: bx, r: bx + w, month: true });
  });

  if (days.length > 1) {
    const endTxt = vizShortDate(days[days.length - 1][dateKey]);
    const w = vizTextW(endTxt, FS);
    const r = padL + plotW, l = r - w;
    if (!items.some((it) => l < it.r + GAP && r + GAP > it.l)) {
      items.push({ x: r, anchor: "end", text: endTxt, l: l, r: r });
    }
  }
  return items;
}


// 上だけ角を丸めた棒（下端は台に接するので角張らせる）
function vizTopRoundedPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return "M" + x + "," + (y + h) +
    " L" + x + "," + (y + rr) +
    " Q" + x + "," + y + " " + (x + rr) + "," + y +
    " L" + (x + w - rr) + "," + y +
    " Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + rr) +
    " L" + (x + w) + "," + (y + h) + " Z";
}

/* ---------- 在庫推移：小グラフを2段に並べる ---------- */
/* ★ 最初は50kgと20kgを1つのグラフに重ねて、縦軸を0から描いていた。
     しかし実データに近い値（50kg 約7,000・20kg 約4,000で日々の変動は±200程度）で
     描いてみたら、線がほぼ平らになって「増えているのか減っているのか」が
     まったく読めなかった。
     水準が大きく違う2つの指標を1つの縦軸に載せると、どちらの変動も潰れる。
     （第2軸を足すのは禁じ手。読み手が誤解する）
     → サイズごとに小さなグラフを分け、それぞれの値の範囲に合わせて縦軸を取る。
       縦軸が0から始まらないので、その旨を明記する。 */
function InventoryTrendMini({ label, color, dataKey, days, bounds, pick, setPick, showX }) {
  const W = 340, H = 96;
  const padL = 40, padR = 48, padT = 8, padB = showX ? 18 : 6;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const vals = days.map((d) => d[dataKey]);
  const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  // 変動が読めるように、データの範囲に少し余白を足した範囲を使う
  const span = Math.max(hi - lo, 1);
  const pad = span * 0.35;
  const yMin = Math.max(0, lo - pad), yMax = hi + pad;
  const mid = Math.round((yMin + yMax) / 2);
  const axisVals = [yMax, mid, yMin];

  // i は小数でもよい（月の区切り線を点と点の中間に置くため）
  const xAt = (i) => padL + (days.length <= 1 ? plotW / 2 : (plotW * i) / (days.length - 1));
  const yAt = (v) => padT + plotH - (plotH * (v - yMin)) / (yMax - yMin);
  const lastI = days.length - 1;
  const sel = pick != null && days[pick] ? days[pick] : null;

  return (
    <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
      {axisVals.map((v, i) => (
        <g key={"t" + i}>
          <line x1={padL} y1={yAt(v)} x2={padL + plotW} y2={yAt(v)} stroke={VIZ.grid} strokeWidth="1" />
          <text x={padL - 6} y={yAt(v) + 3} textAnchor="end" fontSize="7.5" fill={VIZ.muted}
            style={{ fontVariantNumeric: "tabular-nums" }}>{vizComma(Math.round(v))}</text>
        </g>
      ))}
      {/* 月の区切り線。値の目盛り線より1段はっきりした色にして、
          「これは目盛りではなく月の境目」だとわかるようにする。
          位置は月末の点と月初の点のちょうど中間（境目は観測点の間にある）。 */}
      {bounds.map((b) => (
        <line key={"mb" + b.i} x1={xAt(b.i - 0.5)} y1={padT} x2={xAt(b.i - 0.5)} y2={padT + plotH}
          stroke={VIZ.divider} strokeWidth="1" />
      ))}

      {/* サイズ名はグラフの中に置く。1系列なので凡例の箱は不要 */}
      <text x={padL + 3} y={padT + 8} fontSize="9" fontWeight="700" fill={VIZ.ink2}>{label}</text>

      {sel && <line x1={xAt(pick)} y1={padT} x2={xAt(pick)} y2={padT + plotH} stroke={VIZ.muted} strokeWidth="1" />}

      <polyline points={days.map((dd, i) => xAt(i) + "," + yAt(dd[dataKey])).join(" ")}
        fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xAt(lastI)} cy={yAt(days[lastI][dataKey])} r="4"
        fill={color} stroke={VIZ.surface} strokeWidth="2" />
      <text x={xAt(lastI) + 8} y={yAt(days[lastI][dataKey]) + 3} fontSize="9" fontWeight="700"
        fill={VIZ.ink2} style={{ fontVariantNumeric: "tabular-nums" }}>{vizComma(days[lastI][dataKey])}</text>
      {sel && <circle cx={xAt(pick)} cy={yAt(sel[dataKey])} r="3.5"
        fill={color} stroke={VIZ.surface} strokeWidth="2" />}

      {showX && (
        <g>
          {vizXAxisItems(days, bounds, "日付", xAt, padL, plotW, 7.5).map((it, k) => (
            <text key={"x" + k} x={it.x} y={H - 4} textAnchor={it.anchor} fontSize="7.5"
              fontWeight={it.month ? "700" : "400"}
              fill={it.month ? VIZ.ink2 : VIZ.muted}>{it.text}</text>
          ))}
        </g>
      )}

      {/* ★ 当たり判定は最後（＝一番手前）に置く。理由は月次グラフ側のコメント参照。
            縦はグラフの高さいっぱいに取り、指で押しやすくしてある。 */}
      {days.map((dd, i) => {
        const half = days.length <= 1 ? plotW / 2 : plotW / (days.length - 1) / 2;
        return (
          <rect key={"hit" + i} x={xAt(i) - half} y={0} width={half * 2} height={H}
            fill="transparent" onClick={() => setPick(pick === i ? null : i)} style={{ cursor: "pointer" }} />
        );
      })}
    </svg>
  );
}

function InventoryTrendChart({ days }) {
  const [pick, setPick] = useState(null);
  const sel = pick != null && days[pick] ? days[pick] : null;
  // 区切り位置は親で1回だけ求めて両方のグラフに渡す（上下でずれないように）
  const bounds = vizMonthBounds(days, "日付");
  return (
    <div>
      <div style={{ fontSize: 10, color: VIZ.muted, marginBottom: 2, textAlign: "right" }}>
        {sel
          ? vizShortDate(sel.日付) + "：50kg " + vizComma(sel["50kg"]) + " / 20kg " + vizComma(sel["20kg"])
          : "グラフをタップすると値が出ます"}
      </div>
      <InventoryTrendMini label="50kg" color={VIZ.s1} dataKey="50kg" days={days} bounds={bounds}
        pick={pick} setPick={setPick} showX={false} />
      <InventoryTrendMini label="20kg" color={VIZ.s2} dataKey="20kg" days={days} bounds={bounds}
        pick={pick} setPick={setPick} showX={true} />
      <div style={{ fontSize: 9, color: VIZ.muted, marginTop: 2 }}>
        ※ 縦の線は月の区切り。日々の変動が読めるように、縦軸は0から始めていません
      </div>
    </div>
  );
}

/* ---------- 月次出荷実績：棒グラフ（1系列なので凡例は不要） ---------- */
function MonthlyShipChart({ months }) {
  const W = 340, H = 168;
  const padL = 40, padR = 8, padT = 14, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const asc = [...months].reverse();     // 古い順に左から並べる
  const maxVal = Math.max(1, ...asc.map((m) => m.本数));
  const { max, ticks } = vizNiceTicks(maxVal, 4);
  const band = plotW / asc.length;
  const barW = Math.min(24, band - 8);   // 24px上限。枠いっぱいにはしない
  const yAt = (v) => padT + plotH - (plotH * v) / max;

  return (
    <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((t, i) => (
        <g key={"t" + i}>
          <line x1={padL} y1={yAt(t)} x2={padL + plotW} y2={yAt(t)} stroke={VIZ.grid} strokeWidth="1" />
          <text x={padL - 6} y={yAt(t) + 3} textAnchor="end" fontSize="8" fill={VIZ.muted}
            style={{ fontVariantNumeric: "tabular-nums" }}>{vizComma(t)}</text>
        </g>
      ))}
      {asc.map((m, i) => {
        const cx = padL + band * i + band / 2;
        const y = yAt(m.本数);
        const h = padT + plotH - y;
        return (
          <g key={m.年月}>
            <path d={vizTopRoundedPath(cx - barW / 2, y, barW, Math.max(h, 1), 4)} fill={VIZ.s1} />
            {/* 月数が少ないので上端に値を出せる。入らない場合は表で読む */}
            <text x={cx} y={y - 4} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={VIZ.ink2}
              style={{ fontVariantNumeric: "tabular-nums" }}>{vizComma(m.本数)}</text>
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="8.5" fill={VIZ.muted}>{vizMonthLabel(m.年月)}</text>
          </g>
        );
      })}
    </svg>
  );
}


/* ---------- 在庫・出荷・受注を1つのグラフに（月次） ---------- */
/* ★ なぜ「月」なのか、なぜ1つの縦軸でよいのか
     出荷は約15,000本/月、在庫は総本数で1万本弱。月単位なら同じ桁なので
     1つの縦軸に3つとも載せて素直に読める。
     （日単位にすると出荷は1営業日あたり数百本になり、在庫の1万本と
       10倍以上離れて、出荷の棒が軸の底に貼りついてしまう。）
     第2縦軸は使わない。線が交差した位置に意味があるように見えてしまうが、
     実際は軸の取り方でどこでも交差させられるので、読み手が必ず誤解する。

   ★ 描き分け
     出荷・受注 … その月に積み上がった量（フロー）なので棒
     在庫       … その時点の残高（ストック）なので折れ線と点
     単位はどれも「本」なので同じ縦軸でよい。 */
function MonthlyCombinedChart({ months, hasOrders, hasPlan, partialMonth }) {
  const [pick, setPick] = useState(null);
  const W = 340, H = 190;
  const padL = 42, padR = 10, padT = 24, padB = 34;   // padT は棒の上の数字ぶん広げてある
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const vals = [];
  months.forEach((m) => {
    // 予定は実績の上に積むので、軸の最大値は積んだ高さで決める
    if (m.出荷 != null) vals.push(m.出荷 + (m.出荷予定 || 0));
    if (m.在庫 != null) vals.push(m.在庫);
    if (m.受注 != null) vals.push(m.受注);
  });
  const { max, ticks } = vizNiceTicks(Math.max(1, ...vals), 4);
  const band = plotW / Math.max(months.length, 1);
  const yAt = (v) => padT + plotH - (plotH * v) / max;
  const cxAt = (i) => padL + band * i + band / 2;

  // 棒は2本（出荷・受注）を並べる。受注がまだ無い月は出荷だけ中央に置く。
  const nBars = hasOrders ? 2 : 1;
  const barW = Math.min(16, Math.max(4, (band - 10) / nBars - 2));
  const barX = (i, k) => cxAt(i) - (nBars * barW + (nBars - 1) * 2) / 2 + k * (barW + 2);

  const invPts = months.map((m, i) => (m.在庫 == null ? null : [cxAt(i), yAt(m.在庫)]))
    .filter((p) => p !== null);
  const sel = pick != null && months[pick] ? months[pick] : null;

  return (
    <div>
      {/* 凡例。3系列あるので必ず出す（色だけに頼らない） */}
      <div className="flex items-center gap-3 mb-1 text-[10px]" style={{ color: VIZ.ink2 }}>
        <span className="flex items-center gap-1">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: VIZ.s2, display: "inline-block" }} />出荷
        </span>
        {hasPlan && (
          <span className="flex items-center gap-1">
            <span style={{ width: 9, height: 9, borderRadius: 2, background: VIZ.s2,
              opacity: 0.35, display: "inline-block" }} />出荷予定
          </span>
        )}
        {hasOrders && (
          <span className="flex items-center gap-1">
            <span style={{ width: 9, height: 9, borderRadius: 2, background: VIZ.s3, display: "inline-block" }} />受注
          </span>
        )}
        <span className="flex items-center gap-1">
          <span style={{ width: 12, height: 2, background: VIZ.s1, display: "inline-block" }} />月末在庫
        </span>
      </div>

      <div className="text-[10px] mb-1 text-right" style={{ color: VIZ.muted }}>
        {sel
          ? vizYearMonth(sel.年月) + "：出荷 " + vizComma(sel.出荷) +
            (sel.出荷予定 ? "（予定 +" + vizComma(sel.出荷予定) + "）" : "") +
            (hasOrders ? " / 受注 " + vizComma(sel.受注) : "") +
            " / 在庫 " + vizComma(sel.在庫)
          : "月をタップすると数字が出ます"}
      </div>

      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
        {ticks.map((t, i) => (
          <g key={"t" + i}>
            <line x1={padL} y1={yAt(t)} x2={padL + plotW} y2={yAt(t)} stroke={VIZ.grid} strokeWidth="1" />
            <text x={padL - 6} y={yAt(t) + 3} textAnchor="end" fontSize="8" fill={VIZ.muted}
              style={{ fontVariantNumeric: "tabular-nums" }}>{vizComma(t)}</text>
          </g>
        ))}

        {sel && <rect x={padL + band * pick} y={padT} width={band} height={plotH}
          fill={VIZ.grid} opacity="0.45" />}

        {months.map((m, i) => (
          <g key={"b" + m.年月}>
            {m.出荷 != null && (
              <path d={vizTopRoundedPath(barX(i, 0), yAt(m.出荷), barW,
                Math.max(padT + plotH - yAt(m.出荷), 1), 3)} fill={VIZ.s2} />
            )}
            {/* 予定は実績の上に薄く積む。別の系列ではなく同じ「出荷」の
                まだ来ていないぶんなので、色は変えずに薄さで区別する。
                実績との境目は面色の2pxの隙間であけて、積み上げだと分かるようにする。 */}
            {m.出荷 != null && m.出荷予定 > 0 && (() => {
              const topY = yAt(m.出荷 + m.出荷予定);
              const h = Math.max(yAt(m.出荷) - topY - 2, 1);
              return <path d={vizTopRoundedPath(barX(i, 0), topY, barW, h, 3)}
                fill={VIZ.s2} opacity="0.35" />;
            })()}
            {hasOrders && m.受注 != null && (
              <path d={vizTopRoundedPath(barX(i, 1), yAt(m.受注), barW,
                Math.max(padT + plotH - yAt(m.受注), 1), 3)} fill={VIZ.s3} />
            )}
          </g>
        ))}

        {/* 出荷の本数を棒の上に出す。
            ★ 狭い幅に6か月ぶん並ぶので、隣とぶつかるものは出さない。
              SVGは文字が重なっても避けてくれないので、置く前に幅を見て判定する。
              優先は左から順（古い月から）。
            ★ 予定が積んである月は、数字が指しているのは実績ぶんなので、
              実績の棒の上端に置く（積んだ一番上に置くと、予定込みの値だと
              誤読される）。予定は薄い色なので上に文字が乗っても読める。 */}
        {(() => {
          const FS = 8.5, GAP = 3;
          const placed = [];
          return months.map((m, i) => {
            if (m.出荷 == null) return null;
            const txt = vizComma(m.出荷);
            const w = vizTextW(txt, FS);
            const cx = barX(i, 0) + barW / 2;
            const l = cx - w / 2, r = cx + w / 2;
            if (l < padL - 2 || r > padL + plotW + 2) return null;          // 端からはみ出す
            if (placed.some((p) => l < p.r + GAP && r + GAP > p.l)) return null;  // 隣とぶつかる
            placed.push({ l: l, r: r });
            // ★ 文字の幅は棒より広いので、隣の受注の棒の上にはみ出す。
            //   受注のほうが高い月（7月・8月など）は数字が棒に重なって読めなく
            //   なるので、その月の「濃い棒」のうち高いほうより上に置く。
            //   予定（薄い棒）は高さの判定に入れない。入れると当月の数字が
            //   予定の一番上まで飛んで、予定込みの値だと誤読されるため。
            const top = Math.min(yAt(m.出荷), m.受注 != null ? yAt(m.受注) : Infinity);
            return (
              <text key={"bl" + m.年月} x={cx} y={top - 4} textAnchor="middle"
                fontSize={FS} fontWeight="700" fill={VIZ.ink2}
                stroke={VIZ.surface} strokeWidth="3" paintOrder="stroke"
                style={{ fontVariantNumeric: "tabular-nums" }}>{txt}</text>
            );
          });
        })()}

        {/* 在庫は残高なので線。棒より前面に、面色のリングを付けた点で置く */}
        {invPts.length > 1 && (
          <polyline points={invPts.map((p) => p[0] + "," + p[1]).join(" ")} fill="none"
            stroke={VIZ.s1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {invPts.map((p, i) => (
          <circle key={"ip" + i} cx={p[0]} cy={p[1]} r="3.5" fill={VIZ.s1}
            stroke={VIZ.surface} strokeWidth="2" />
        ))}
        {/* 在庫は最新の1点だけ値を直接書く。
            ★ 在庫推移を貯め始めたのが8/17なので、当面この線は右端の
              2〜3点しかない。棒に埋もれて気づかれないので、直接ラベルで
              「これが在庫」とわかるようにしておく。
              点が増えても値を書くのは最新の1つだけ（全点に数字を振らない）。 */}
        {invPts.length > 0 && (() => {
          const last = invPts[invPts.length - 1];
          const v = vizComma(months[months.length - 1].在庫 != null
            ? months[months.length - 1].在庫
            : months.filter((m) => m.在庫 != null).slice(-1)[0].在庫);
          const w = vizTextW(v, 8.5);
          // 右端で切れるなら点の左側に出す
          const right = last[0] + 7 + w <= padL + plotW;
          return (
            // 面色で縁取りしておく。棒や別の線に重なっても数字が読めるようにするため。
            <text x={last[0] + (right ? 7 : -7)} y={last[1] - 5}
              textAnchor={right ? "start" : "end"} fontSize="8.5" fontWeight="700"
              fill={VIZ.s1} stroke={VIZ.surface} strokeWidth="3" paintOrder="stroke"
              style={{ fontVariantNumeric: "tabular-nums" }}>{v}</text>
          );
        })()}

        {months.map((m, i) => (
          <text key={"x" + m.年月} x={cxAt(i)} y={H - 12} textAnchor="middle" fontSize="8.5"
            fontWeight={pick === i ? "700" : "400"}
            fill={pick === i ? VIZ.ink2 : VIZ.muted}>{vizMonthLabel(m.年月)}</text>
        ))}
        {partialMonth && months.length > 0 &&
          months[months.length - 1].年月 === partialMonth && (
          <text x={cxAt(months.length - 1)} y={H - 3} textAnchor="middle" fontSize="7"
            fill={VIZ.muted}>集計中</text>
        )}

        {/* ★ 当たり判定は必ず最後に置く（＝一番手前）。
              以前は目盛りの直後に置いていたので、棒・折れ線・月名の文字が
              上に重なり、それらの上を押すとタップが吸われて反応しなかった。
              jsdomのテストは要素へ直接クリックを送るので、この不具合を
              すり抜けていた。実機の座標で押すテスト（tools/tap_test.js）で発覚。
              透明なので見た目には影響しない。縦は目盛りの外まで広げて、
              月名のあたりを押しても反応するようにしてある。 */}
        {months.map((m, i) => (
          <rect key={"hit" + i} x={padL + band * i} y={0} width={band} height={H}
            fill="transparent" onClick={() => setPick(pick === i ? null : i)}
            style={{ cursor: "pointer" }} />
        ))}
      </svg>
    </div>
  );
}


/* ---------- 配車表：トラック×日付のグリッド（編集できる） ---------- */
/* ★ 元の配車表は21列で1週間、行3〜33がトラック。その形をそのまま画面に出す。
     セルは4種類：行き先 / ←依頼No（引取） / ×（運休） / お休み。
     色だけで区別すると分からないので、運休は「×」の字をそのまま出し、
     引取は「←」を残す。文字が種類を表している。 */
const DGRID_KIND_STYLE = {
  "出荷": { bg: "#ffffff", fg: VIZ.ink },
  "引取": { bg: "#f1f5f9", fg: VIZ.ink2 },
  "運休": { bg: "#f8fafc", fg: VIZ.muted },
  "休み": { bg: "#f8fafc", fg: VIZ.muted },
  "":     { bg: "#ffffff", fg: VIZ.muted },
};

function DispatchGrid({ grid, onSave, onWeek, saving }) {
  const [edit, setEdit] = useState(null);      // { row, col, value, truck, day }
  const g = grid;

  if (!g) return <div className="text-xs text-slate-400 py-4 text-center">読み込み中…</div>;
  if (g.error) return <div className="text-xs text-amber-700 py-2">取得エラー：{g.error}</div>;
  if (!g.days || g.days.length === 0) {
    return <div className="text-xs text-slate-500 py-2">配車表の週が読み取れませんでした。</div>;
  }

  const cellW = 76;   // 1日ぶんの幅。iPhoneでは横スクロールで見る
  const nameW = 96;
  const rowH = 48;    // 行の高さをそろえる（実測で45〜53px とバラついていた）

  /* ★ 実測（iPhone 390px）: 表の中身は600px、見えているのは332pxで268px隠れる。
       横に送るとトラック名が x=-240 まで出て行ってしまい、どの行がどのトラック
       なのか分からなくなっていた。1列目を貼り付けて、日付だけが動くようにする。 */
  const stickyName = {
    width: nameW, flex: "0 0 auto",
    position: "sticky", left: 0, zIndex: 2,
    boxShadow: "1px 0 0 " + VIZ.divider + ", 3px 0 6px -3px rgba(15,41,66,.18)",
  };
  const todayKey = (() => {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  })();
  /* ★ 行き先が長いとマスが縦に伸びて、行の高さがバラバラになり読みにくい
       （「東京都西多摩郡瑞穂町 東京都羽村市」で3行になった）。
       2行で打ち切って行の高さを揃える。全文はタップしたときの入力欄に出るので
       情報は失われない。 */
  const clamp2 = {
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
    overflow: "hidden", lineHeight: 1.35,
  };

  return (
    <div>
      {/* 週の移動 */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onWeek(g.weekOffset - 1)} disabled={!g.hasPrev || saving}
          className="text-[13px] font-semibold px-3 py-2 rounded border border-slate-200 disabled:opacity-50"
          style={{ color: NAVY }}>◀ 前の週</button>
        <div className="text-[13px] font-bold" style={{ color: NAVY }}>{g.weekLabel}</div>
        <button onClick={() => onWeek(g.weekOffset + 1)} disabled={!g.hasNext || saving}
          className="text-[13px] font-semibold px-3 py-2 rounded border border-slate-200 disabled:opacity-50"
          style={{ color: NAVY }}>次の週 ▶</button>
      </div>

      {!g.editable && (
        <div className="text-[11px] mb-2 px-2 py-2 rounded bg-amber-50 text-amber-800">
          まだExcelを読んでいるので編集できません。GASエディタで
          「配車表をスプレッドシートに移す」を実行してください。
        </div>
      )}

      {/* 表本体。横に長いのでこの中だけ横スクロールさせる（ページ全体は動かさない） */}
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <div style={{ minWidth: nameW + cellW * g.days.length }}>
          {/* 見出し */}
          <div className="flex border-b border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 px-2 py-2 bg-slate-50"
              style={stickyName}>トラック</div>
            {g.days.map((d) => {
              const isToday = d.date === todayKey;
              return (
                <div key={d.col}
                  className="text-[11px] font-semibold px-2 py-2 border-l border-slate-200"
                  style={{ width: cellW, flex: "0 0 auto",
                    /* ★ 今日の列に色を付けて、横に送ったとき今どこを見ているか
                          分かるようにする */
                    background: isToday ? "#e8eef5" : "#f8fafc",
                    color: isToday ? NAVY : "#475569",
                    boxShadow: isToday ? "inset 0 2px 0 " + NAVY : "none" }}>
                  {d.header}
                </div>
              );
            })}
          </div>

          {/* トラックごとの行 */}
          {g.trucks.map((t, i) => (
            <div key={t.row} className="flex border-b border-slate-100"
              style={{ background: i % 2 ? "#fcfdfe" : "#ffffff" }}>
              <div className="px-2" style={{ ...stickyName, background: i % 2 ? "#fcfdfe" : "#ffffff",
                height: rowH, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {/* ★ 1行で切ると「4ｔ平標準 福安」「浅津運送 自社便」が
                      「4ｔ平標準…」になってしまう。行の高さは固定したまま
                      2行まで折り返す。 */}
                <div className="text-[11px] font-semibold" style={{ color: NAVY, lineHeight: 1.15,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden", wordBreak: "break-all" }}>{t.truck}</div>
                {t.company && <div className="text-[9px] text-slate-400" style={{ lineHeight: 1.15,
                  display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
                  overflow: "hidden", wordBreak: "break-all" }}>{t.company}</div>}
              </div>
              {g.days.map((d) => {
                const c = t.cells[d.col];
                const kind = c ? c.kind : "";
                const st = DGRID_KIND_STYLE[kind] || DGRID_KIND_STYLE[""];
                return (
                  <button key={d.col}
                    onClick={() => g.editable && setEdit({ row: t.row, col: d.col,
                      value: c ? c.text : "", truck: t.truck, day: d.header })}
                    className="px-2 border-l border-slate-200 text-left"
                    style={{ width: cellW, flex: "0 0 auto",
                      /* 予定なしのマスは、今日の列だけほんのり色を残す */
                      background: st.bg !== "transparent" ? st.bg
                        : (d.date === todayKey ? "#f4f7fb" : "transparent"),
                      height: rowH,    // 行の高さをそろえる（指で押せる大きさは確保）
                      display: "flex", alignItems: "center",
                      cursor: g.editable ? "pointer" : "default" }}>
                    <span className="text-[11px]" style={{ color: st.fg,
                      wordBreak: "break-all", ...clamp2 }}>
                      {c ? c.text : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* その日の本数（配車表の合計行そのまま） */}
          {["合計20k", "合計50k", "小口", "コンテナ"].map((k) => (
            <div key={k} className={`flex bg-slate-50 ${k === "合計20k" ? "border-t-2" : "border-t"} border-slate-200`}>
              <div className="text-[11px] font-semibold text-slate-500 px-2 py-2 bg-slate-50"
                style={stickyName}>{k}</div>
              {g.days.map((d) => {
                const t = g.totals[d.col] || {};
                return (
                  <div key={d.col} className="px-2 py-2 border-l border-slate-200 text-right text-[12px] tabular-nums"
                    style={{ width: cellW, flex: "0 0 auto", color: VIZ.ink2,
                      background: d.date === todayKey ? "#eef2f7" : "transparent" }}>
                    {t[k] == null ? "—" : vizComma(t[k])}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] mt-2" style={{ color: VIZ.muted }}>
        横に指で送ると先の日が見えます（トラック名は残ります）。
        {g.editable ? "マスをタップすると直せます。" : ""}
        ← は引取、× は運休です。
      </div>

      {/* 編集の入力。1マスずつ確認して保存する（まとめて保存はしない） */}
      {edit && (
        <div className="mt-3 rounded-md border p-3" style={{ borderColor: NAVY }}>
          <div className="text-[12px] font-bold mb-1" style={{ color: NAVY }}>
            {edit.truck} ／ {edit.day}
          </div>
          <input value={edit.value} autoFocus
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            placeholder="行き先（空にすると予定なし）"
            className="w-full text-[15px] px-2 py-2 rounded border border-slate-300 mb-2" />
          <div className="flex items-center gap-2 mb-2">
            {["×", "お休み", ""].map((v) => (
              <button key={v || "clear"} onClick={() => setEdit({ ...edit, value: v })}
                className="text-[11px] px-2 py-1.5 rounded border border-slate-200 text-slate-600">
                {v === "×" ? "運休(×)" : v === "お休み" ? "お休み" : "空にする"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { onSave(edit); setEdit(null); }} disabled={saving}
              className="text-[13px] font-bold px-3 py-2 rounded text-white disabled:opacity-50"
              style={{ background: NAVY }}>{saving ? "保存中…" : "保存"}</button>
            <button onClick={() => setEdit(null)}
              className="text-[13px] px-3 py-2 rounded border border-slate-200 text-slate-600">やめる</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 実績・推移タブ本体 ---------- */
function ActualsTab({ shipActuals, invTrend, monthly, onRefresh }) {
  const [showTable, setShowTable] = useState(false);
  const inv = invTrend, act = shipActuals, mc = monthly;

  const Card = ({ title, note, children, extra }) => (
    <div className="rounded-lg border border-slate-200 bg-white p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-bold" style={{ color: NAVY }}>{title}</div>
          {note && <div className="text-[10px] text-slate-400 mt-0.5">{note}</div>}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );

  const mcMonths = mc && mc.months ? mc.months : null;

  return (
    <div>
      {/* ---- 在庫・出荷・受注をまとめて（月次） ----
           ★「元データ」のリンクは落合さんの指示で外した（別タブが開くのが邪魔）。
             スプレッドシートのURLはサーバ側が今も返しているので、必要になれば
             Card に extra を戻すだけで復活する。月次出荷実績のカードも同様。 */}
      <Card title="在庫・出荷・受注"
        note={mc && mc.startMonth
          ? vizDateParts(mc.startMonth).y + "年" + vizMonthLabel(mc.startMonth) + "〜（年度）"
          : "月ごと"}
        >
        {!mc ? (
          <div className="text-xs text-slate-400 py-4 text-center">読み込み中…</div>
        ) : mc.error ? (
          <div className="text-xs text-amber-700 py-2">取得エラー：{mc.error}</div>
        ) : !mcMonths || mcMonths.length === 0 ? (
          <div className="text-xs text-slate-500 py-2">
            まだデータが貯まっていません。1時間ごとに取り込んで集計します。
          </div>
        ) : (
          <div>
            <MonthlyCombinedChart months={mcMonths} hasOrders={mc.hasOrders}
              hasPlan={mc.hasPlan} partialMonth={mc.partialMonth} />

            {/* グラフだけに数字を閉じ込めない。表でも読めるようにする */}
            <div className="mt-3 rounded-md border border-slate-200 overflow-hidden">
              {/* ★ 列は4つまでにする。iPhoneの幅で5列にすると数字が窮屈になるので、
                     「予定」は独立した列にせず、出荷の下に小さく添える。 */}
              <div className="flex text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-2">
                <span className="w-16">月</span>
                <span className="flex-1 text-right">出荷</span>
                {mc.hasOrders && <span className="flex-1 text-right">受注</span>}
                <span className="flex-1 text-right">月末在庫</span>
              </div>
              {/* 年度の累計。★ 在庫は「残高」なので足さないこと。
                  4月〜9月の月末在庫を合計しても意味のない数字になる。
                  足せるのは出荷・予定・受注（その月に積み上がった量）だけ。 */}
              {(() => {
                const sum = (k) => mcMonths.reduce((a, m) => a + (m[k] || 0), 0);
                const range = mcMonths.length > 1
                  ? vizMonthLabel(mcMonths[0].年月) + "〜" + vizMonthLabel(mcMonths[mcMonths.length - 1].年月)
                  : vizMonthLabel(mcMonths[0].年月);
                return (
                  <div className="flex items-start text-[15px] px-2.5 py-2.5 border-t-2 border-slate-300 bg-slate-50 font-bold">
                    <span className="w-16 text-[13px] text-slate-600 pt-0.5">{range}</span>
                    <span className="flex-1 text-right tabular-nums" style={{ color: NAVY }}>
                      {vizComma(sum("出荷"))}
                      {mc.hasPlan && sum("出荷予定") > 0 && (
                        <span className="block text-[11px] font-semibold text-slate-400">
                          予定 +{vizComma(sum("出荷予定"))}
                        </span>
                      )}
                    </span>
                    {mc.hasOrders && (
                      <span className="flex-1 text-right tabular-nums text-slate-700">
                        {vizComma(sum("受注"))}
                      </span>
                    )}
                    {/* 在庫は残高なので累計を出さない */}
                    <span className="flex-1 text-right text-slate-300">—</span>
                  </div>
                );
              })()}

              {mcMonths.slice().reverse().map((m) => (
                <div key={m.年月} className="flex items-start text-[15px] px-2.5 py-2.5 border-t border-slate-100">
                  <span className="w-16 text-[13px] text-slate-600 pt-0.5">{vizMonthLabel(m.年月)}</span>
                  <span className="flex-1 text-right tabular-nums font-semibold" style={{ color: NAVY }}>
                    {m.出荷 == null ? "—" : vizComma(m.出荷)}
                    {m.出荷予定 > 0 && (
                      <span className="block text-[11px] font-semibold text-slate-400">
                        予定 +{vizComma(m.出荷予定)}
                      </span>
                    )}
                  </span>
                  {mc.hasOrders && (
                    <span className="flex-1 text-right tabular-nums text-slate-700">
                      {m.受注 == null ? "—" : vizComma(m.受注)}
                    </span>
                  )}
                  <span className="flex-1 text-right tabular-nums text-slate-700">
                    {m.在庫 == null ? "—" : vizComma(m.在庫)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---- 在庫推移 ---- */}
      <Card title="在庫推移"
        note={inv && inv.days && inv.days.length > 0
          ? inv.days.length + "日分（" + inv.days[0].日付 + " 〜 " + inv.days[inv.days.length - 1].日付 + "）"
          : null}>
        {!inv ? (
          <div className="text-xs text-slate-400 py-4 text-center">読み込み中…</div>
        ) : inv.error ? (
          <div className="text-xs text-amber-700 py-2">取得エラー：{inv.error}</div>
        ) : !inv.days || inv.days.length === 0 ? (
          <div className="text-xs text-slate-500 py-2">
            まだ在庫の履歴が貯まっていません。1時間ごとの自動収集で溜まっていきます。
          </div>
        ) : (
          <div>
            {/* 見出しの数字。大きい数字に等幅は使わない（間延びして見える） */}
            <div className="flex items-end gap-4 mb-3">
              <div>
                <div className="text-[10px] text-slate-500">総本数（{inv.latest.日付}）</div>
                <div className="text-2xl font-bold" style={{ color: NAVY }}>{vizComma(inv.latest.総本数)}</div>
              </div>
              {inv.change && (
                <div className="pb-1">
                  <div className="text-[10px] text-slate-500">前回（{inv.change.前回日付}）比</div>
                  <div className="text-sm font-semibold" style={{ color: VIZ.ink2 }}>
                    {(inv.change.総本数 > 0 ? "▲ " : inv.change.総本数 < 0 ? "▼ " : "± ") +
                      vizComma(Math.abs(inv.change.総本数))}
                  </div>
                </div>
              )}
            </div>
            {inv.days.length >= 2
              ? <InventoryTrendChart days={inv.days} />
              : <div className="text-xs text-slate-500 py-2">推移グラフは2日分以上貯まると出ます。</div>}
          </div>
        )}
      </Card>

      {/* ---- 月次出荷実績 ---- */}
      <Card title="月次出荷実績"
        note={act && act.shipmentCount ? act.shipmentCount + "件の指図書から集計" : null}
        >
        {!act ? (
          <div className="text-xs text-slate-400 py-4 text-center">読み込み中…</div>
        ) : act.error ? (
          <div className="text-xs text-amber-700 py-2">取得エラー：{act.error}</div>
        ) : !act.months || act.months.length === 0 ? (
          <div className="text-xs text-slate-500 py-2">
            まだ出荷実績が貯まっていません。指図書PDFを1時間ごとに読み込んで集計します
            （初回は全期間ぶんあるので数日かかります）。
          </div>
        ) : (
          <div>
            <MonthlyShipChart months={act.months} />

            {/* 表はグラフの代わりに読める形。グラフだけに値を閉じ込めない */}
            <div className="mt-3 rounded-md border border-slate-200 overflow-hidden">
              <div className="flex text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-1.5">
                <span className="w-14">月</span>
                <span className="flex-1 text-right">本数</span>
                <span className="w-12 text-right">件数</span>
                <span className="flex-1 text-right">内訳</span>
              </div>
              {act.months.map((m) => (
                <div key={m.年月} className="flex text-[11px] px-2 py-1.5 border-t border-slate-100">
                  <span className="w-14 text-slate-600">{vizYearMonth(m.年月)}</span>
                  <span className="flex-1 text-right font-semibold tabular-nums" style={{ color: NAVY }}>{vizComma(m.本数)}</span>
                  <span className="w-12 text-right text-slate-500 tabular-nums">{m.件数}</span>
                  <span className="flex-1 text-right text-slate-500 text-[10px]">
                    {Object.keys(m.サイズ別).sort().map((k) => k + " " + vizComma(m.サイズ別[k])).join(" / ")}
                  </span>
                </div>
              ))}
            </div>

            {/* 出荷先。名称はPDFのテキスト化で化けることがあるのでコードも出す */}
            {act.topDests && act.topDests.length > 0 && (
              <div className="mt-3">
                <button onClick={() => setShowTable(!showTable)}
                  className="text-[11px] font-semibold" style={{ color: NAVY }}>
                  {showTable ? "出荷先を隠す" : "出荷先の上位を見る"}
                </button>
                {showTable && (
                  <div className="mt-2 rounded-md border border-slate-200 overflow-hidden">
                    {act.topDests.map((dst) => (
                      <div key={dst.コード} className="flex items-center text-[11px] px-2 py-1.5 border-t border-slate-100 first:border-t-0">
                        <span className="text-slate-400 tabular-nums w-10">{dst.コード}</span>
                        <span className="flex-1 truncate text-slate-700">{dst.名}</span>
                        <span className="text-right font-semibold tabular-nums w-14" style={{ color: NAVY }}>{vizComma(dst.本数)}</span>
                        <span className="text-right text-slate-400 tabular-nums w-10">{dst.件数}件</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 取り込みの品質。おかしい件数を隠さず出しておく */}
            {(act.mismatchCount > 0 || act.needsCheckCount > 0 || act.nonCylinderCount > 0) && (
              <div className="mt-3 text-[10px] text-slate-500 leading-relaxed">
                {act.mismatchCount > 0 && <div>数量と容器番号レンジが食い違う指図書：{act.mismatchCount}件</div>}
                {act.needsCheckCount > 0 && <div>PDFの文字が読めず要確認：{act.needsCheckCount}件</div>}
                {act.nonCylinderCount > 0 && <div>容器以外（バルク貯槽など）で本数集計から除外：{act.nonCylinderCount}件</div>}
              </div>
            )}
          </div>
        )}
      </Card>

      <button onClick={onRefresh}
        className="w-full py-2 rounded-lg text-xs font-semibold text-white" style={{ background: NAVY }}>
        最新に更新
      </button>
    </div>
  );
}

/* ---------- 野外置場タブ ---------- */
/*  もとは別プロジェクトのGASアプリ（LPG容器 屋外置場 在庫管理）。同じスクリプト
    プロジェクトに取り込んで、?page=yard で開けるようにした（gas/配信用.js）。
    中身は47KBの独自UI（敷地レイアウト図・建物編集・変更履歴）なので、Reactに
    書き直さずそのまま iframe で読み込む。旧アプリ側も setXFrameOptionsMode(ALLOWALL)
    が入っていて、もともと埋め込む前提で書かれていた。 */
function YardCapacityTab({ summary, url, onRefresh }) {
  const err = (summary && summary.error) || (url && url.error) || null;
  const src = url && url.url ? url.url : null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        {/* ヘッダーがすでに「野外置場」なので、ここは中身の説明にする */}
        <SectionTitle note={summary ? summary.locations + " か所" : ""}>置場容量（実績数 / 収容MAX）</SectionTitle>
        {err && (
          <p className="text-xs text-red-700 bg-red-50 rounded-md px-3 py-2 mb-2">
            読み込めませんでした：{err}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {src && (
            <a href={src} target="_blank" rel="noopener"
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white"
              style={{ background: NAVY, textDecoration: "none" }}>
              別画面で開く
            </a>
          )}
          {summary && summary.sheetUrl && (
            <a href={summary.sheetUrl} target="_blank" rel="noopener"
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 bg-slate-100"
              style={{ textDecoration: "none" }}>
              元のシートを開く
            </a>
          )}
          <button onClick={onRefresh}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 bg-slate-100">
            数字を取り直す
          </button>
          {summary && summary.updated && (
            <span className="text-[10px] text-slate-400 ml-auto">{summary.updated} 時点</span>
          )}
        </div>
      </Card>

      {src ? (
        /* ★ 画面が狭いと入れ子のスクロールがつらいので、高さは広めに取って
              外側のページを送ってもらう。全画面で使いたいときは上の
              「別画面で開く」を押す。 */
        <Card className="p-0" style={{ overflow: "hidden" }}>
          <iframe src={src} title="野外置場 在庫管理"
            style={{ display: "block", width: "100%", height: "78vh", minHeight: 480, border: "none" }} />
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-xs text-slate-500">
            GAS環境で開くと、ここに野外置場の在庫管理画面が出ます。
          </p>
        </Card>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("orders");
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState({ inventory: null, shipping: null, orderPlan: null, dispatch: null, shipActuals: null, invTrend: null, monthly: null, dispGrid: null, yardCap: null, yardCapUrl: null, loading: true, error: null });
  // 配車グリッドは週を切り替えるので、ほかの集計とは別に持つ
  const [gridWeek, setGridWeek] = useState(0);
  const [gridSaving, setGridSaving] = useState(false);
  const [yardLive, setYardLive] = useState({ "50k": {}, "20k": {} });
  const [loadedCount, setLoadedCount] = useState(0);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const isGasEnv = typeof google !== "undefined" && google.script && google.script.run;

  const markLoaded = () => {
    setLoadedCount((prev) => {
      const next = prev + 1;
      if (next >= 9) setInitialLoadDone(true);   // 4集計 + ヤード + 出荷実績 + 在庫推移 + 月次まとめ + 配車グリッド
      return next;
    });
  };

  const tabs = [
    { id: "orders", label: "受注・指図書" },
    { id: "yard",   label: "ヤード・現場" },
    { id: "dispatch", label: "配車・当日出荷" },
    { id: "actuals", label: "実績・推移" },
    { id: "yardcap", label: "野外置場" },
  ];

  // force が true のときはキャッシュを無視して取り直す（更新ボタン・編集直後用）。
  // 配車グリッドの取得。週を切り替えたときはこれだけ呼ぶ（ほかを取り直さない）
  const fetchDispatchGrid = (week, force, done) => {
    if (!isGasEnv) { if (done) done(); return; }
    google.script.run
      .withSuccessHandler((g) => { setLive((prev) => ({ ...prev, dispGrid: g })); if (done) done(); })
      .withFailureHandler((err) => {
        setLive((prev) => ({ ...prev, dispGrid: { error: String(err) } })); if (done) done();
      })
      .getDispatchGridData(force === true, week);
  };

  // マスを1つ保存する。
  // ★ 保存できたらサーバから取り直す。画面だけ書き換えると、本当は保存できて
  //   いないのに直ったように見える状態を作ってしまう（配車表は本番のデータ）。
  const saveDispatchCell = (e) => {
    if (!isGasEnv) return;
    setGridSaving(true);
    google.script.run
      .withSuccessHandler((r) => {
        setGridSaving(false);
        if (r && r.error) { window.alert("保存できませんでした：" + r.error); return; }
        fetchDispatchGrid(gridWeek, true);
      })
      .withFailureHandler((err) => {
        setGridSaving(false);
        window.alert("保存できませんでした：" + String(err));
      })
      .setDispatchCell({ row: e.row, col: e.col, value: e.value });
  };

  const changeGridWeek = (week) => {
    setGridWeek(week);
    setLive((prev) => ({ ...prev, dispGrid: null }));
    fetchDispatchGrid(week, true);
  };

  const fetchLiveData = (force) => {
    setNow(new Date());
    // GAS環境(google.script.run が使える)でだけ実データを取りに行く。
    // それ以外（このプレビューなど）ではダミー/前回確認済みの値のままにする。
    if (!isGasEnv) {
      setLive((prev) => ({ ...prev, loading: false }));
      setInitialLoadDone(true);
      return;
    }
    setLive((prev) => ({ ...prev, loading: true, error: null }));

    google.script.run
      .withSuccessHandler((inv) => { setLive((prev) => ({ ...prev, inventory: inv, loading: false })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, error: String(err), loading: false })); markLoaded(); })
      .getInventoryDashboardData(force === true);

    google.script.run
      .withSuccessHandler((sh) => { setLive((prev) => ({ ...prev, shipping: sh })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, error: String(err) })); markLoaded(); })
      .getShippingDashboardData(force === true);

    google.script.run
      .withSuccessHandler((op) => { setLive((prev) => ({ ...prev, orderPlan: op })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, error: String(err) })); markLoaded(); })
      .getOrderPlanDashboardData(force === true);

    google.script.run
      .withSuccessHandler((d) => { setLive((prev) => ({ ...prev, dispatch: d })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, error: String(err) })); markLoaded(); })
      .getDispatchTodayData(force === true);

    // 蓄積シートから月次出荷実績を取得（シートを読むだけなので軽い）
    google.script.run
      .withSuccessHandler((sa) => { setLive((prev) => ({ ...prev, shipActuals: sa })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, shipActuals: { error: String(err) } })); markLoaded(); })
      .getShippingActualsSummary(force === true);

    // 蓄積シートから在庫推移を取得
    google.script.run
      .withSuccessHandler((it) => { setLive((prev) => ({ ...prev, invTrend: it })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, invTrend: { error: String(err) } })); markLoaded(); })
      .getInventoryTrendData(force === true);

    // 在庫・出荷・受注を月でそろえたまとめ
    google.script.run
      .withSuccessHandler((mc) => { setLive((prev) => ({ ...prev, monthly: mc })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, monthly: { error: String(err) } })); markLoaded(); })
      .getMonthlyCombinedData(force === true);

    // 配車表のトラック×日付グリッド
    fetchDispatchGrid(gridWeek, force === true, markLoaded);

    // 野外置場（置場容量）の合計と、埋め込むURL。
    // URLは変わらないので1回取れれば取り直さない。
    google.script.run
      .withSuccessHandler((yc) => { setLive((prev) => ({ ...prev, yardCap: yc })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, yardCap: { error: String(err) } })); markLoaded(); })
      .getYardCapacitySummary();

    google.script.run
      .withSuccessHandler((u) => { setLive((prev) => ({ ...prev, yardCapUrl: u })); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, yardCapUrl: { error: String(err) } })); })
      .getYardCapacityUrl();

    // ヤードマップ（50k/20k）を、実際のスプレッドシートの最新状態に合わせて取得
    const q50k = MAP_50K.blocks.map((b) => ({ pos: String(b.pos) }));
    const q20k = MAP_20K.blocks.map((b) => ({ pos: String(b.pos) }));
    google.script.run
      .withSuccessHandler((json) => {
        markLoaded();
        try {
          const parsed = JSON.parse(json);
          const toMap = (arr) => {
            const m = {};
            (arr || []).forEach((r) => { if (r && r.found && r.pos != null) m[String(r.pos)] = r; });
            return m;
          };
          setYardLive({ "50k": toMap(parsed["50k"]), "20k": toMap(parsed["20k"]) });
        } catch (e) {
          // パース失敗時は静的データのまま（何もしない）
        }
      })
      .withFailureHandler(() => markLoaded())
      .getYardMapUpdatesBothWithOrderText(q50k, q20k);
  };

  useEffect(() => {
    fetchLiveData();
    const timer = setInterval(() => fetchLiveData(false), 5 * 60 * 1000); // 5分ごとに自動更新（キャッシュ利用）
    return () => clearInterval(timer);
  }, []);

  const dateLabel = now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const timeLabel = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  // ライブデータがあれば優先、無ければフォールバック（ダミー/前回確認済み値）を使う
  const shippingTotal = live.shipping ? live.shipping.total : SHIPPING_TOTAL_FALLBACK;
  const shippingToday = live.shipping ? live.shipping.todayCount : SHIPPING_TODAY_FALLBACK;
  // 指図書フォルダは月ごとに自動判定される（GAS側で実施済み）。表示ラベルも
  // 実際に使われた月（live.shipping.folder、例:"9月"）に合わせる。
  // 未取得時は現在の日本時間の月をフォールバックとして使う。
  const shippingMonthLabel = (live.shipping && live.shipping.folder)
    ? live.shipping.folder
    : `${new Date().getMonth() + 1}月`;
  const shippingOrders = live.shipping && live.shipping.recent && live.shipping.recent.length > 0
    ? live.shipping.recent.map((o) => ({
        date: o.date.slice(5).replace("-", "/"),
        orderNo: o.orderNo,
        fileName: o.fileName,
        url: o.url,
      }))
    : SHIPPING_ORDERS_FALLBACK;

  const planTotal = live.orderPlan ? live.orderPlan.totalOrders : ORDERPLAN_TOTAL_FALLBACK;
  const planRecent = live.orderPlan && live.orderPlan.recent && live.orderPlan.recent.length > 0
    ? live.orderPlan.recent
    : ORDERPLAN_RECENT_FALLBACK;
  let planBySize = ORDERPLAN_BYSIZE_FALLBACK;
  if (live.orderPlan && live.orderPlan.bySize) {
    const by = live.orderPlan.bySize;
    const order = ["2K", "5K", "8K", "10K", "20K_三部軽量", "20K_直付", "30K", "50K_軽量型", "50K_S"];
    const picked = order
      .map((key) => (by[key] ? { label: by[key].label, count: by[key].count } : null))
      .filter(Boolean);
    if (picked.length > 0) planBySize = picked;
  }
  const planLpTotalForKpi = planBySize.reduce((sum, s) => sum + s.count, 0);

  const dispatchDateLabel = live.dispatch && live.dispatch.dateLabel ? live.dispatch.dateLabel : DISPATCH_DATE_FALLBACK;
  const dispatchShipments = live.dispatch && live.dispatch.shipments ? live.dispatch.shipments : DISPATCH_SHIPMENTS_FALLBACK;
  const dispatchWeek = live.dispatch && live.dispatch.week && live.dispatch.week.length > 0
    ? live.dispatch.week
    : [{ dateLabel: dispatchDateLabel, shipments: dispatchShipments, qty20k: 6, qty50k: 282, koguchi20k: 6, koguchi50k: 32, kontena20k: 0, kontena50k: 0 }];

  const inv50 = live.inventory && live.inventory.sizes && live.inventory.sizes["50k"] ? live.inventory.sizes["50k"].total : INVENTORY_FALLBACK[0].total;
  const inv20 = live.inventory && live.inventory.sizes && live.inventory.sizes["20k"] ? live.inventory.sizes["20k"].total : INVENTORY_FALLBACK[1].total;
  const invTotal = live.inventory ? live.inventory.totals.total : INV_TOTAL_FALLBACK;
  const inventory = [
    { size: "50k", label: "50kg 容器", total: inv50, tone: "ok" },
    { size: "20k", label: "20kg 容器", total: inv20, tone: "ok" },
  ];

  let invByYear = INV_BY_YEAR_FALLBACK;
  let invOldest = OLDEST_KOKUIN_FALLBACK;
  if (live.inventory && live.inventory.sizes) {
    const merged = {};
    let oldestKey = null;
    ["50k", "20k"].forEach((sz) => {
      const s = live.inventory.sizes[sz];
      if (!s || !s.byYear) return;
      Object.keys(s.byYear).forEach((yr) => { merged[yr] = (merged[yr] || 0) + s.byYear[yr]; });
      if (s.oldest && (oldestKey === null || s.oldest < oldestKey)) oldestKey = s.oldest;
    });
    const years = Object.keys(merged).sort();
    if (years.length > 0) {
      invByYear = years.map((y) => ({ year: y + "年 製造", count: merged[y] })).reverse();
      invOldest = "'" + oldestKey;
    }
  }

  // タブごとのヘッダー見出し・KPIカードを組み立てる
  const tabHeaders = {
    orders: { title: "受注・指図書", subtitle: dateLabel },
    yard: { title: "ヤード・現場", subtitle: dateLabel },
    dispatch: { title: "配車・当日出荷", subtitle: dispatchDateLabel + " 時点" },
    yardcap: { title: "野外置場", subtitle: dateLabel },
  };
  const currentHeader = tabHeaders[tab] || tabHeaders.orders;

  const dispatchWeekTruckTotal = dispatchWeek.reduce((sum, d) => sum + (d.shipments ? d.shipments.length : 0), 0);
  const dispatchWeekQty20k = dispatchWeek.reduce((sum, d) => sum + (d.qty20k != null ? d.qty20k : 0), 0);
  const dispatchWeekQty50k = dispatchWeek.reduce((sum, d) => sum + (d.qty50k != null ? d.qty50k : 0), 0);

  const tabKpis = {
    orders: [
      { label: `指図書 保存済(${shippingMonthLabel})`, value: String(shippingTotal), unit: "件", icon: FileText, tone: "ok" },
      {
        label: "受注計画 前日比",
        value: (() => {
          const d = live.orderPlan && live.orderPlan.yesterdayDiff != null ? live.orderPlan.yesterdayDiff : null;
          if (d == null) return "—";
          return (d > 0 ? "+" : "") + d.toLocaleString();
        })(),
        unit: "本", icon: Package, tone: "ok"
      },
      { label: "LP容器 合計本数", value: planLpTotalForKpi.toLocaleString(), unit: "本", icon: Boxes, tone: "neutral" },
    ],
    yard: [
      { label: "50k 在庫", value: inv50.toLocaleString(), unit: "本", icon: Boxes, tone: "ok" },
      { label: "20k 在庫", value: inv20.toLocaleString(), unit: "本", icon: Boxes, tone: "ok" },
      { label: "在庫合計", value: invTotal.toLocaleString(), unit: "本", icon: Boxes, tone: "neutral" },
    ],
    // 実績・推移タブ。ほかのタブと同じ大きな数字のタイルを出す。
    // ★ 在庫は残高なので累計を出さない（4月〜9月の月末在庫を足しても意味が無い）。
    //   代わりに「最新の残高」と「年度はじめから何本増えたか」を出す。
    actuals: (() => {
      const mc = live.monthly;
      const ms = mc && mc.months ? mc.months : [];
      const cur = ms.length > 0 ? ms[ms.length - 1] : null;
      const sum = (k) => ms.reduce((a, m) => a + (m[k] || 0), 0);
      // ★ 在庫の履歴は2026年8月17日から貯め始めたので、年度はじめ（4月）の
      //   在庫は存在しない。比較相手は「在庫データがある最初の月」であって
      //   年度はじめではない。ラベルにその月名を出して、何と比べているかを
      //   はっきりさせる（「年度はじめ比」と書くと嘘になる）。
      const invMonths = ms.filter((m) => m.在庫 != null);
      const invNow = invMonths.length > 0 ? invMonths[invMonths.length - 1].在庫 : null;
      const invFirst = invMonths.length > 1 ? invMonths[0].在庫 : null;
      const invDiff = invNow != null && invFirst != null ? invNow - invFirst : null;
      const invBase = invMonths.length > 1 ? vizMonthLabel(invMonths[0].年月) + "末比" : "";
      const range = ms.length > 0 ? vizMonthLabel(ms[0].年月) + "〜" + vizMonthLabel(ms[ms.length - 1].年月) : "";
      return [
        { label: "出荷 累計" + (range ? "（" + range + "）" : ""),
          value: ms.length ? vizComma(sum("出荷")) : "—",
          unit: "本", icon: Boxes, tone: "ok" },
        { label: cur ? vizMonthLabel(cur.年月) + " 出荷" : "今月 出荷",
          value: cur && cur.出荷 != null ? vizComma(cur.出荷) : "—", unit: "本",
          icon: Package, tone: "ok",
          sub: cur && cur.出荷予定 > 0 ? "予定 +" + vizComma(cur.出荷予定) + " 本" : undefined },
        { label: "LP容器 在庫", value: invNow != null ? vizComma(invNow) : "—",
          unit: "本", icon: Boxes, tone: "neutral",
          sub: invDiff != null ? (invDiff > 0 ? "+" : "") + vizComma(invDiff) + " 本（" + invBase + "）" : undefined },
      ];
    })(),
    dispatch: [
      { label: "週の合計トラック台数", value: String(dispatchWeekTruckTotal), unit: "台", icon: Truck, tone: "ok" },
      { label: "週の出荷合計 20k", value: dispatchWeekQty20k.toLocaleString(), unit: "本", icon: Boxes, tone: "ok" },
      { label: "週の出荷合計 50k", value: dispatchWeekQty50k.toLocaleString(), unit: "本", icon: Boxes, tone: "ok" },
      { label: "週の総計本数", value: (dispatchWeekQty20k + dispatchWeekQty50k).toLocaleString(), unit: "本", icon: Boxes, tone: "neutral" },
    ],
    yardcap: (() => {
      const y = live.yardCap;
      const n = (v) => (v == null ? "—" : Number(v).toLocaleString());
      // 満杯(100%以上)が1つでもあれば赤、80%以上だけなら黄。
      const fullTone = y && y.over > 0 ? "alert" : (y && y.nearFull > 0 ? "warn" : "ok");
      return [
        { label: "野外置場 合計本数", value: n(y && y.total), unit: "本", icon: Boxes, tone: "neutral" },
        { label: "20kg 実績", value: n(y && y.a20), unit: "本", icon: Boxes, tone: "ok" },
        { label: "50kg 実績", value: n(y && y.a50), unit: "本", icon: Boxes, tone: "ok" },
        {
          label: y && y.over > 0 ? "満杯の置場" : "満杯に近い置場(80%以上)",
          value: y ? String(y.over > 0 ? y.over : y.nearFull) : "—",
          unit: "か所", icon: AlertTriangle, tone: fullTone
        },
      ];
    })(),
  };
  const currentKpis = tabKpis[tab] || tabKpis.orders;

  // GAS環境で、まだ実データが揃っていない間は、古い数字を見せずに読み込み中の画面を出す
  if (isGasEnv && !initialLoadDone) {
    return (
      <div className="bg-slate-100 text-slate-900 flex items-center justify-center" style={{ position: "fixed", inset: 0, fontFamily: '"Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", sans-serif' }}>
        <div className="flex flex-row items-center gap-3">
          <p className="text-sm text-slate-500">データを読み込んでいます…</p>
          <ForkliftLoader />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: '"Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", sans-serif' }}>
      {/* ヘッダー（タブごとに内容が変わる） */}
      <header style={{ background: NAVY }} className="text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-1.5 h-9 rounded-full" style={{ background: SAFETY }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-wide">{currentHeader.title}</h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />稼働中
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">{currentHeader.subtitle}</p>
          </div>
          <button onClick={() => fetchLiveData(true)} className="flex items-center gap-1.5 text-[11px] text-slate-300 hover:text-white transition-colors">
            <RefreshCw size={13} className={live.loading ? "animate-spin" : ""} />
            <span className="tabular-nums">{timeLabel} 更新</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-6">
        {/* KPI（タブごとに内容が変わる） */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {currentKpis.map((k, i) => {
            const Icon = k.icon;
            const t = TONE[k.tone];
            return (
              <Card key={i} className={`p-3.5 ${k.tone === "alert" ? "ring-2 ring-red-200" : ""}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon size={15} className={t.text} />
                  <span className="text-[11px] text-slate-500 leading-tight">{k.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{k.value}</span>
                  <span className="text-[11px] text-slate-400">{k.unit}</span>
                </div>
              </Card>
            );
          })}
        </div>


        {/* タブ */}
        <div>
          <div className="flex gap-1 mb-4 overflow-x-auto -mx-1 px-1">
            {tabs.map((tb) => {
              const active = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? "text-white" : "text-slate-500 hover:text-slate-800 bg-white border border-slate-200"
                  }`}
                  style={active ? { background: NAVY } : undefined}
                >
                  {tb.label}
                </button>
              );
            })}
          </div>

          {tab === "orders" && <OrdersTab orders={shippingOrders} total={shippingTotal} today={shippingToday} planBySize={planBySize} planRecent={planRecent} monthLabel={shippingMonthLabel} />}
          {tab === "yard" && <YardTab inventory={inventory} invTotal={invTotal} byYear={invByYear} oldest={invOldest} yardLive={yardLive} onRefresh={() => fetchLiveData(true)} />}
          {tab === "actuals" && <ActualsTab shipActuals={live.shipActuals} invTrend={live.invTrend} monthly={live.monthly} onRefresh={() => fetchLiveData(true)} />}
          {tab === "dispatch" && <DispatchTab dateLabel={dispatchDateLabel} shipments={dispatchShipments} week={dispatchWeek}
            grid={live.dispGrid} onSaveCell={saveDispatchCell} onWeek={changeGridWeek} saving={gridSaving} />}
          {tab === "yardcap" && <YardCapacityTab summary={live.yardCap} url={live.yardCapUrl} onRefresh={() => fetchLiveData(true)} />}
        </div>

        <p className="text-center text-[10px] text-slate-400 pt-2">
          ※ GAS環境で開くと各タブの実データは最新に自動更新されます（5分ごと）。ヘッダー・KPIもタブごとに切り替わります。
        </p>
      </main>
    </div>
  );
}
