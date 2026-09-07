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
function DispatchTab({ dateLabel, shipments, week }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const days = week && week.length > 0 ? week : [{ dateLabel: dateLabel, shipments: shipments, qty20k: null, qty50k: null, koguchi20k: null, koguchi50k: null, kontena20k: null, kontena50k: null }];
  const selected = days[selectedIdx] || days[0];

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle note="トラック運行スケジュール・共有ドライブ日次取得">週間の配車予定</SectionTitle>
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
                <span>{i === 0 ? "本日" : d.dateLabel}</span>
                <span className={`text-[10px] mt-0.5 ${active ? "text-slate-300" : "text-slate-400"}`}>
                  {d.shipments.length}台
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <Card className="p-4" style={{ background: NAVY }}>
            <div className="text-xs text-slate-300 mb-1">{selected.dateLabel} の出荷台数</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums text-white">{selected.shipments.length}</span>
              <span className="text-xs text-slate-400">台</span>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-slate-500 mb-1">本日出荷 20k</div>
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
            <div className="text-xs text-slate-500 mb-1">本日出荷 50k</div>
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
const MAP_20K = {"viewBox": "0 0 720 518", "blocks": [{"pos": 1, "grp": 524, "rng": "76151〜76200", "cnt": 50, "kind": "fill", "x": 16, "y": 40, "w": 42, "h": 24, "orders": [{"no": "30368", "url": "https://drive.google.com/file/d/1r1Vsfs789OInNM-8tSRt2_cVaVbexarw/view"}]}, {"pos": 2, "grp": 526, "rng": "76251〜76300", "cnt": 50, "kind": "fill", "x": 62, "y": 40, "w": 42, "h": 24, "orders": [{"no": "20237", "url": "https://drive.google.com/file/d/1hT3virTIikAtVaqtsXv_Uh3R2VWgugqg/view"}, {"no": "10536", "url": "https://drive.google.com/file/d/1pMCHcdcA8dsUvgmR-CW1s8l8xhAs9WW0/view"}, {"no": "30381", "url": "https://drive.google.com/file/d/13Bv7fqdm09C1r_xJT9kYARFO-xQMVT3T/view"}, {"no": "10539", "url": "https://drive.google.com/file/d/1FCt4NbccqmX2x8R5JjEHOhMduQXydcRZ/view"}, {"no": "20241", "url": "https://drive.google.com/file/d/1WiPHZ8Yib7lBg0gjc-U76omDnr9k5Z--/view"}, {"no": "10470", "url": "https://drive.google.com/file/d/1Sq1hAbcfVzYqQPj-4UFrt7lh3QrWXLGL/view"}]}, {"pos": 3, "grp": 398, "rng": "69851〜69900", "cnt": 50, "kind": "fill", "x": 108, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60597", "url": "https://drive.google.com/file/d/17vCvo3-GMgrAAjWz_MgUGpoVM9P_4jHN/view"}]}, {"pos": 4, "grp": 452, "rng": "42551〜42600", "cnt": 50, "kind": "fill", "x": 155, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60563", "url": "https://drive.google.com/file/d/1VxAguew80xDGJ3DaX5_FYta0SGoquL14/view"}]}, {"pos": 5, "grp": 556, "rng": "77751〜77800", "cnt": 50, "kind": "fill", "x": 216, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 6, "grp": 558, "rng": "77851〜77900", "cnt": 50, "kind": "fill", "x": 262, "y": 40, "w": 42, "h": 24, "orders": []}, {"pos": 7, "grp": 512, "rng": "75551〜75600", "cnt": 50, "kind": "fill", "x": 309, "y": 40, "w": 42, "h": 24, "orders": [{"no": "30369", "url": "https://drive.google.com/file/d/1uh_S_Hm6G9Tl_8fHWKLxQrWH7G6wHRtO/view"}, {"no": "30357", "url": "https://drive.google.com/file/d/1SzF6NlDZeSiy6Z3sVcMydhpi5FHySmBh/view"}]}, {"pos": 17, "grp": 554, "rng": "77651〜77700", "cnt": 50, "kind": "fill", "x": 355, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60585", "url": "https://drive.google.com/file/d/14U-n2NkQOUJZJ3EBoQZ0urmVc77WC_sI/view"}]}, {"pos": 51, "grp": 534, "rng": "76651〜76700", "cnt": 50, "kind": "fill", "x": 416, "y": 40, "w": 42, "h": 24, "orders": [{"no": "10465", "url": "https://drive.google.com/file/d/1Qn_i8WdqnsysItMIoaH84cddej_uxDPn/view"}, {"no": "10531", "url": "https://drive.google.com/file/d/1km26RMRkONEKZ41c-mmT5Vq7A2Wv4ZFk/view"}]}, {"pos": 52, "grp": 536, "rng": "76751〜76800", "cnt": 50, "kind": "fill", "x": 463, "y": 40, "w": 42, "h": 24, "orders": [{"no": "10513", "url": "https://drive.google.com/file/d/1BmeV0RxfIHAad9Ku2cUBZEmOzATyUz_j/view"}]}, {"pos": 53, "grp": 454, "rng": "72651〜72700", "cnt": 50, "kind": "fill", "x": 509, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60567", "url": "https://drive.google.com/file/d/1rUc_DAa_2pypbKGXMQI29hevQeWaCFDt/view"}]}, {"pos": 54, "grp": 458, "rng": "72851〜72900", "cnt": 50, "kind": "fill", "x": 555, "y": 40, "w": 42, "h": 24, "orders": [{"no": "60565", "url": "https://drive.google.com/file/d/1TLZoOQnnJ-NdX6dPc21QApXeUD_EztkC/view"}]}, {"pos": 9, "grp": 523, "rng": "76101〜76150", "cnt": 50, "kind": "fill", "x": 16, "y": 111, "w": 42, "h": 24, "orders": [{"no": "30368", "url": "https://drive.google.com/file/d/1r1Vsfs789OInNM-8tSRt2_cVaVbexarw/view"}]}, {"pos": 10, "grp": 525, "rng": "76201〜76250", "cnt": 50, "kind": "fill", "x": 62, "y": 111, "w": 42, "h": 24, "orders": [{"no": "10527", "url": "https://drive.google.com/file/d/1JDSdk8ticsXhWV4Kjg7BY5ZnTVf9E6kF/view"}]}, {"pos": 11, "grp": 397, "rng": "69801〜69850", "cnt": 50, "kind": "fill", "x": 108, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60597", "url": "https://drive.google.com/file/d/17vCvo3-GMgrAAjWz_MgUGpoVM9P_4jHN/view"}]}, {"pos": 12, "grp": 451, "rng": "72501〜72550", "cnt": 50, "kind": "fill", "x": 155, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60563", "url": "https://drive.google.com/file/d/1VxAguew80xDGJ3DaX5_FYta0SGoquL14/view"}]}, {"pos": 13, "grp": 555, "rng": "77701〜77750", "cnt": 50, "kind": "fill", "x": 216, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 14, "grp": 557, "rng": "77801〜77850", "cnt": 50, "kind": "fill", "x": 262, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 15, "grp": 511, "rng": "75501〜75550", "cnt": 50, "kind": "fill", "x": 309, "y": 111, "w": 42, "h": 24, "orders": [{"no": "30357", "url": "https://drive.google.com/file/d/1SzF6NlDZeSiy6Z3sVcMydhpi5FHySmBh/view"}]}, {"pos": 16, "grp": 544, "rng": "77161〜77200", "cnt": 40, "kind": "fill", "x": 355, "y": 111, "w": 42, "h": 24, "orders": []}, {"pos": 55, "grp": 533, "rng": "76601〜76650", "cnt": 50, "kind": "fill", "x": 416, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60575", "url": "https://drive.google.com/file/d/1DfqoKfoX1Zl0e3GqtZl3St0Uh-DnmIGD/view"}]}, {"pos": 56, "grp": 535, "rng": "76701〜76750", "cnt": 50, "kind": "fill", "x": 463, "y": 111, "w": 42, "h": 24, "orders": [{"no": "10531", "url": "https://drive.google.com/file/d/1km26RMRkONEKZ41c-mmT5Vq7A2Wv4ZFk/view"}]}, {"pos": 57, "grp": 453, "rng": "72601〜72650", "cnt": 50, "kind": "fill", "x": 509, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60566", "url": "https://drive.google.com/file/d/11--l66_4kmnYsqDHrTvW00Cl35-oBuU0/view"}]}, {"pos": 55, "grp": 457, "rng": "72801〜72850", "cnt": 50, "kind": "fill", "x": 555, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60575", "url": "https://drive.google.com/file/d/1DfqoKfoX1Zl0e3GqtZl3St0Uh-DnmIGD/view"}]}, {"pos": 55, "grp": 459, "rng": "72901〜72950", "cnt": 50, "kind": "fill", "x": 601, "y": 111, "w": 42, "h": 24, "orders": [{"no": "60575", "url": "https://drive.google.com/file/d/1DfqoKfoX1Zl0e3GqtZl3St0Uh-DnmIGD/view"}]}, {"pos": 17, "grp": null, "rng": "〜", "cnt": 40, "kind": "empty", "x": 16, "y": 218, "w": 42, "h": 24, "orders": [{"no": "60585", "url": "https://drive.google.com/file/d/14U-n2NkQOUJZJ3EBoQZ0urmVc77WC_sI/view"}]}, {"pos": 19, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 218, "w": 42, "h": 24, "orders": []}, {"pos": 29, "grp": 527, "rng": "76301〜76350", "cnt": 50, "kind": "fill", "x": 262, "y": 218, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 20, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 246, "w": 42, "h": 24, "orders": []}, {"pos": 30, "grp": 528, "rng": "76351〜76400", "cnt": 50, "kind": "fill", "x": 262, "y": 246, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 17, "grp": 549, "rng": "77401〜77450", "cnt": 50, "kind": "fill", "x": 16, "y": 274, "w": 42, "h": 24, "orders": [{"no": "60585", "url": "https://drive.google.com/file/d/14U-n2NkQOUJZJ3EBoQZ0urmVc77WC_sI/view"}]}, {"pos": 21, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 274, "w": 42, "h": 24, "orders": []}, {"pos": 31, "grp": 529, "rng": "76401〜76450", "cnt": 50, "kind": "fill", "x": 262, "y": 274, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 22, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 62, "y": 303, "w": 42, "h": 24, "orders": []}, {"pos": 32, "grp": 530, "rng": "76451〜76500", "cnt": 50, "kind": "fill", "x": 262, "y": 303, "w": 42, "h": 24, "orders": [{"no": "10474", "url": "https://drive.google.com/file/d/1g1otzj4Z2wMGS4yF60KubzW8cFwfFlzp/view"}]}, {"pos": 23, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 16, "y": 331, "w": 42, "h": 24, "orders": []}, {"pos": 33, "grp": 531, "rng": "76501〜76550", "cnt": 50, "kind": "fill", "x": 262, "y": 331, "w": 42, "h": 24, "orders": [{"no": "60572", "url": "https://drive.google.com/file/d/1FviEZg8DzmI7s9C5kssUMjcQCr8anPJL/view"}]}, {"pos": 39, "grp": 564, "rng": "78151〜78200", "cnt": 50, "kind": "fill", "x": 463, "y": 331, "w": 42, "h": 24, "orders": []}, {"pos": 45, "grp": 562, "rng": "78051〜78100", "cnt": 50, "kind": "fill", "x": 601, "y": 331, "w": 42, "h": 24, "orders": []}, {"pos": 24, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 16, "y": 360, "w": 42, "h": 24, "orders": []}, {"pos": 34, "grp": 532, "rng": "76551〜76600", "cnt": 50, "kind": "fill", "x": 262, "y": 360, "w": 42, "h": 24, "orders": [{"no": "60572", "url": "https://drive.google.com/file/d/1FviEZg8DzmI7s9C5kssUMjcQCr8anPJL/view"}]}, {"pos": 40, "grp": 563, "rng": "78101〜78150", "cnt": 50, "kind": "fill", "x": 463, "y": 360, "w": 42, "h": 24, "orders": []}, {"pos": 46, "grp": 561, "rng": "78001〜78050", "cnt": 50, "kind": "fill", "x": 601, "y": 360, "w": 42, "h": 24, "orders": []}, {"pos": 18, "grp": null, "rng": "〜", "cnt": 50, "kind": "empty", "x": 16, "y": 388, "w": 42, "h": 24, "orders": []}, {"pos": 25, "grp": 548, "rng": "77351〜77400", "cnt": 50, "kind": "fill", "x": 62, "y": 388, "w": 42, "h": 24, "orders": [{"no": "30365", "url": "https://drive.google.com/file/d/1c7Xh6TJrAOTMS0UO0-rNSM-_N76NKjWI/view"}]}, {"pos": 35, "grp": 553, "rng": "77601〜77650", "cnt": 50, "kind": "fill", "x": 262, "y": 388, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 41, "grp": 565, "rng": "78201〜78250", "cnt": 50, "kind": "fill", "x": 463, "y": 388, "w": 42, "h": 24, "orders": []}, {"pos": 47, "grp": 559, "rng": "77901〜77950", "cnt": 50, "kind": "fill", "x": 601, "y": 388, "w": 42, "h": 24, "orders": []}, {"pos": 26, "grp": 547, "rng": "77301〜77350", "cnt": 50, "kind": "fill", "x": 62, "y": 416, "w": 42, "h": 24, "orders": [{"no": "30365", "url": "https://drive.google.com/file/d/1c7Xh6TJrAOTMS0UO0-rNSM-_N76NKjWI/view"}]}, {"pos": 36, "grp": 552, "rng": "77551〜77600", "cnt": 50, "kind": "fill", "x": 262, "y": 416, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 42, "grp": 566, "rng": "78251〜78300", "cnt": 50, "kind": "fill", "x": 463, "y": 416, "w": 42, "h": 24, "orders": []}, {"pos": 48, "grp": 560, "rng": "77951〜78000", "cnt": 50, "kind": "fill", "x": 601, "y": 416, "w": 42, "h": 24, "orders": []}, {"pos": 27, "grp": 546, "rng": "77251〜77300", "cnt": 50, "kind": "fill", "x": 62, "y": 445, "w": 42, "h": 24, "orders": [{"no": "30362", "url": "https://drive.google.com/file/d/1UAJbBc4xYJBQDWwuKzREHTiANHUGSBJR/view"}]}, {"pos": 37, "grp": 551, "rng": "77501〜77550", "cnt": 50, "kind": "fill", "x": 262, "y": 445, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 43, "grp": 567, "rng": "78301〜78350", "cnt": 50, "kind": "fill", "x": 463, "y": 445, "w": 42, "h": 24, "orders": []}, {"pos": 49, "grp": 569, "rng": "78401〜78450", "cnt": 50, "kind": "fill", "x": 601, "y": 445, "w": 42, "h": 24, "orders": []}, {"pos": 28, "grp": 545, "rng": "77201〜77250", "cnt": 50, "kind": "fill", "x": 62, "y": 473, "w": 42, "h": 24, "orders": []}, {"pos": 38, "grp": 550, "rng": "77451〜77500", "cnt": 50, "kind": "fill", "x": 262, "y": 473, "w": 42, "h": 24, "orders": [{"no": "60586", "url": "https://drive.google.com/file/d/1BR55NJiejFdqyvqA5ktzbDmUp6ZvOH7J/view"}]}, {"pos": 44, "grp": 568, "rng": "78351〜78400", "cnt": 50, "kind": "fill", "x": 463, "y": 473, "w": 42, "h": 24, "orders": [{"no": "70211", "url": "https://drive.google.com/file/d/1S-SGHCM2tSoXCGa77u3o24qLFAuZabE7/view"}]}, {"pos": 50, "grp": 570, "rng": "78451〜78500", "cnt": 50, "kind": "fill", "x": 601, "y": 473, "w": 42, "h": 24, "orders": []}], "landmarks": []};

const YARD_STYLE = {
  "50k": { fill: "#dbe6f2", stroke: "#173a5e", text: "#0f2942" },
  "20k": { fill: "#d9ebe6", stroke: "#2f7d6b", text: "#134a3d" },
};

function YardBlock({ b, size, selected, onSelect }) {
  const st = YARD_STYLE[size];
  let fill = st.fill, stroke = st.stroke, tcol = st.text;
  if (b.kind === "empty") { fill = "#f8fafc"; stroke = "#cbd5e1"; tcol = "#94a3b8"; }
  const hasOrder = b.orders && b.orders.length > 0;
  if (hasOrder) { fill = "#ffe4c7"; stroke = "#ea7a17"; tcol = "#9a4b06"; }

  const narrow = b.w <= 44;
  const grpFontSize = narrow ? "9" : "10.5";
  const midY = b.y + b.h / 2 + (narrow ? 2 : 3);

  return (
    <g onClick={() => onSelect(b)} style={{ cursor: "pointer" }}>
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
  const switchSize = (s) => { setSize(s); setSel(null); setEditing(false); };

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

      {view === "map" && (
        <div className="w-full overflow-x-auto">
          <svg viewBox={data.viewBox} className="w-full h-auto" style={{ width: "100%", minWidth: 600, maxHeight: 560 }}>
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
            <YardBlock key={i} b={b} size={size} selected={sel && sel.pos === b.pos && sel.x === b.x} onSelect={selectBlock} />
          ))}
        </svg>
          <p className="text-[10px] text-slate-400 mt-1">横スクロールで全体を確認できます</p>
        </div>
      )}

      {view === "list" && (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {blocksSorted.map((b, i) => (
            <button key={i} onClick={() => selectBlock(b)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left ${sel && sel.pos === b.pos && sel.x === b.x ? "bg-amber-50" : "active:bg-slate-50"}`}>
              <span className="text-xs font-mono text-slate-400 w-9 shrink-0">{"<" + b.pos + ">"}</span>
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
export default function App() {
  const [tab, setTab] = useState("orders");
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState({ inventory: null, shipping: null, orderPlan: null, dispatch: null, loading: true, error: null });
  const [yardLive, setYardLive] = useState({ "50k": {}, "20k": {} });
  const [loadedCount, setLoadedCount] = useState(0);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const isGasEnv = typeof google !== "undefined" && google.script && google.script.run;

  const markLoaded = () => {
    setLoadedCount((prev) => {
      const next = prev + 1;
      if (next >= 5) setInitialLoadDone(true);
      return next;
    });
  };

  const tabs = [
    { id: "orders", label: "受注・指図書" },
    { id: "yard",   label: "ヤード・現場" },
    { id: "dispatch", label: "配車・当日出荷" },
  ];

  const fetchLiveData = () => {
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
      .getInventoryDashboardData();

    google.script.run
      .withSuccessHandler((sh) => { setLive((prev) => ({ ...prev, shipping: sh })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, error: String(err) })); markLoaded(); })
      .getShippingDashboardData();

    google.script.run
      .withSuccessHandler((op) => { setLive((prev) => ({ ...prev, orderPlan: op })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, error: String(err) })); markLoaded(); })
      .getOrderPlanDashboardData();

    google.script.run
      .withSuccessHandler((d) => { setLive((prev) => ({ ...prev, dispatch: d })); markLoaded(); })
      .withFailureHandler((err) => { setLive((prev) => ({ ...prev, error: String(err) })); markLoaded(); })
      .getDispatchTodayData();

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
    const timer = setInterval(fetchLiveData, 5 * 60 * 1000); // 5分ごとに自動更新
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
    dispatch: [
      { label: "週の合計トラック台数", value: String(dispatchWeekTruckTotal), unit: "台", icon: Truck, tone: "ok" },
      { label: "週の出荷合計 20k", value: dispatchWeekQty20k.toLocaleString(), unit: "本", icon: Boxes, tone: "ok" },
      { label: "週の出荷合計 50k", value: dispatchWeekQty50k.toLocaleString(), unit: "本", icon: Boxes, tone: "ok" },
      { label: "週の総計本数", value: (dispatchWeekQty20k + dispatchWeekQty50k).toLocaleString(), unit: "本", icon: Boxes, tone: "neutral" },
    ],
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
          <button onClick={fetchLiveData} className="flex items-center gap-1.5 text-[11px] text-slate-300 hover:text-white transition-colors">
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
          {tab === "yard" && <YardTab inventory={inventory} invTotal={invTotal} byYear={invByYear} oldest={invOldest} yardLive={yardLive} onRefresh={fetchLiveData} />}
          {tab === "dispatch" && <DispatchTab dateLabel={dispatchDateLabel} shipments={dispatchShipments} week={dispatchWeek} />}
        </div>

        <p className="text-center text-[10px] text-slate-400 pt-2">
          ※ GAS環境で開くと各タブの実データは最新に自動更新されます（5分ごと）。ヘッダー・KPIもタブごとに切り替わります。
        </p>
      </main>
    </div>
  );
}
