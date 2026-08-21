/**
 * Chế độ DỮ LIỆU — Phase 8 §6, một bản kê kiểm toán được của gói đã ship.
 *
 * Chín khối, thứ tự chốt ở §6.1:
 *   1. NGUỒN & NIÊN BẢN — niên bản, mốc đóng băng, và **những nguồn ta đã TỪ CHỐI**
 *   2. TỔNG CUNG        — mỗi con số kèm mẫu số và phạm vi ranh giới
 *   3. ĐÃ LOẠI          — năm phép lọc, `trước − đã loại = còn lại`
 *   4. CHUẨN PHÍCH      — chuẩn súng + đối soát súng/cổng
 *   5. PHỦ TỪNG CỘT     — 61 cột lưới, cả những cột phủ 100 % (§2.2)
 *   6. KHOẢNG TRỐNG     — sáu bảng, bốn trạng thái, ba mẫu số (§2.2/§2.3)
 *   7. GIÁ TRỊ ĐÁNG NGỜ — INVALID, ZERO_NO_WEIGHT, cột hằng, khoá CHƯA ĐO (§0.4/§9-8)
 *   8. 34 TỈNH          — bảng sức khoẻ toàn quốc + ngưỡng loại trừ (§2.8)
 *   9. HỒ SƠ NGÀY + BẢNG DỮ LIỆU GỐC — small multiples, bảng phẳng sáu bảng, xuất dữ liệu
 *
 * Ba luật thị giác chi phối mọi pixel dưới đây:
 *
 *   • **Thanh đo chỉ được vẽ cho một tỉ lệ mà MẪU SỐ của nó có trên màn hình** (§6.2). Một
 *     thanh không có mẫu số là cách 33,41 % trở thành một lời nói dối.
 *   • **KHÔNG ÁP DỤNG không bao giờ đỏ, không bao giờ hổ phách, không bao giờ là một thanh
 *     vơi.** Nó là một chip luật trung tính, đặt vào đúng chỗ lẽ ra là thanh.
 *   • **Không có điểm sức khoẻ tổng hợp** (§6.3). Một tỉnh có thể phủ 100 % mà 0 % thông tin
 *     (`snow_frac`), hoặc phủ 33 % mà 99 % dân còn nguyên (Khánh Hoà). Bình quân hai thứ đó
 *     là phá đúng phân biệt mà cả pha này dựng ra.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
} from "lucide-react";

import {
  columnRows,
  connectorGap,
  fullyCoveredColumns,
  gateFor,
  type BlockGate,
  type ColumnRow,
} from "../data/data-health";
import {
  DATA_TABLES,
  fetchShapeClasses,
  fetchTablePage,
  getTableSchema,
  isSuperseded,
  tableMeta,
  type DataModeTableId,
  type TablePage,
} from "../data/datamode";
import { exportDataset, fileCountFor, type ExportFormat } from "../data/export";
import { pct, type Manifest } from "../data/manifest";
import {
  NULL_STATE_HATCH_DEG,
  NULL_STATE_LABEL,
  NULL_STATE_WARNS,
  checkRowValidity,
  resolveRowNullState,
  type NullState,
  type TableId,
} from "../data/null-states";
import type { StationOccupancy } from "../data/occupancy";
import { CONSTANTS, constantShort } from "../fields";
import { shapeDayProfiles, type ShapeProfile } from "../viz/occ";
import { HAIRLINE_HEX, HATCH_HEX, RAMP_HEX } from "../viz/palette";
import { formatFixed, formatValue } from "./format";

const SERIES = RAMP_HEX[4]!;
const vn = (n: number) => n.toLocaleString("vi-VN");

export function DataMode({
  manifest,
  occupancy,
}: {
  manifest: Manifest | null;
  occupancy: StationOccupancy | null;
}) {
  if (!manifest) {
    return <div className="p-6 text-title text-ink-muted">Đang nạp manifest…</div>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-basemap">
      <div className="mx-auto max-w-[1240px] px-6 py-6 space-y-8">
        <ProvenanceBlock manifest={manifest} />
        <KpiBlock manifest={manifest} />
        <FiltersBlock manifest={manifest} />
        <ConnectorsBlock manifest={manifest} />
        <CoverageBlock manifest={manifest} />
        <NullStatesBlock manifest={manifest} />
        <SuspectValuesBlock manifest={manifest} />
        <ProvincesBlock manifest={manifest} />
        <ShapeMultiplesBlock manifest={manifest} occupancy={occupancy} />
        <RawDataTableBlock manifest={manifest} />
      </div>
    </div>
  );
}

function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-hairline bg-panel p-5 shadow-xs">
      <div className="border-b border-hairline/60 pb-3 mb-4">
        <h2 className="text-body font-bold tracking-wider text-ink uppercase">{title}</h2>
        {subtitle && <div className="mt-1 text-note text-ink-muted leading-relaxed">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Khối VẮNG MẶT, kèm lý do — AC-19.
 *
 * Đây là thứ thay cho câu mặc định. Khối KHOẢNG TRỐNG trên một manifest không có `null_states`
 * từng in ra *"Bảng grid có 100 % độ phủ trên toàn bộ các cột"*: một giấy chứng nhận sức khoẻ
 * dựng trên dữ liệu VẮNG MẶT, tệ hơn hẳn một khối trống.
 */
function AbsentBlock({ title, gate }: { title: string; gate: Extract<BlockGate, { render: false }> }) {
  return (
    <Block title={title}>
      <div className="flex items-start gap-2 rounded border border-hairline bg-basemap p-3 text-note text-ink-2">
        <Info className="h-4 w-4 shrink-0 text-ink-muted mt-0.5" />
        <div>
          <div>{gate.reason}</div>
          <div className="mt-1 font-mono text-[11px] text-ink-muted">
            khoá vắng: {gate.missing.join(", ")}
          </div>
        </div>
      </div>
    </Block>
  );
}

/** Vân theo trạng thái — §6.4. Bốn góc cách nhau 45°, phân biệt được ở nét 1 px. */
function hatch(state: NullState): string {
  return `repeating-linear-gradient(${NULL_STATE_HATCH_DEG[state]}deg, ${HATCH_HEX} 0 1px, transparent 1px 5px)`;
}

function StateSwatch({ state }: { state: NullState }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 shrink-0 rounded-[2px] border border-hairline align-middle"
      style={{ backgroundImage: hatch(state) }}
    />
  );
}

// ── 1. NGUỒN & NIÊN BẢN (§2.6 & §6.1-1) ───────────────────────────────────────────────

const B1 = "1. Nguồn & niên bản dữ liệu";

function ProvenanceBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("provenance", manifest);
  if (!gate.render) return <AbsentBlock title={B1} gate={gate} />;

  const v = manifest.vintage!;
  const f = manifest.freshness;
  const sn = manifest.snapshots;

  // Tuổi tính so với `exported_utc`, KHÔNG so với đồng hồ người xem (§2.7). Một gói mở ra năm
  // 2027 không được phép tự nhận là mới, và múi giờ của người xem không phải một số đo.
  const ageDays = (iso?: string | null): string => {
    if (!iso || !f?.exported_utc) return "";
    const a = Date.parse(iso);
    const b = Date.parse(f.exported_utc);
    if (Number.isNaN(a) || Number.isNaN(b)) return "";
    return ` · ${vn(Math.round((b - a) / 86_400_000))} ngày trước khi xuất`;
  };

  const cards: Array<{ label: string; value: string; note: string }> = [
    {
      label: "Niên bản hành chính",
      value: v.name,
      note: `Hiệu lực ${v.valid_from} · ${vn(v.n_provinces)} tỉnh · ${vn(v.n_communes)} xã/phường`,
    },
    {
      label: "Mạng đường OSM PBF",
      value: f?.inputs.osm_pbf ?? sn?.osm_pbf ?? "—",
      note: `Đóng băng đồ thị dẫn đường${ageDays(f?.inputs.osm_pbf)}`,
    },
    {
      label: "Danh mục trạm sạc canonical",
      value: f?.inputs.stations_canonical ?? sn?.stations_canonical ?? "—",
      note: `Trạm công cộng chuẩn hoá${ageDays(f?.inputs.stations_canonical)}`,
    },
    {
      label: "Cửa sổ quan sát telemetry",
      value: sn?.occupancy_snapshot_id ?? "—",
      note: sn?.occupancy_window
        ? `${sn.occupancy_window[0].slice(0, 10)} → ${sn.occupancy_window[1].slice(0, 10)}`
        : "manifest không khai cửa sổ quan sát",
    },
  ];

  return (
    <Block
      title={B1}
      subtitle={
        <>
          Niên bản hành chính chính thức, các mốc đóng băng của nguồn thượng nguồn, và những
          nguồn ứng viên đã bị <strong>từ chối</strong> kèm lý do đo được. Tuổi tính so với thời
          điểm xuất gói, không so với đồng hồ máy bạn.
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 pb-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded border border-hairline bg-basemap p-3">
            <div className="text-note text-ink-muted">{c.label}</div>
            <div className="mt-0.5 font-semibold text-ink">{c.value}</div>
            <div className="mt-1 text-note text-ink-muted">{c.note}</div>
          </div>
        ))}
      </div>

      {v.rejected && Object.keys(v.rejected).length > 0 && (
        <div className="mt-2 border-t border-hairline pt-3">
          <div className="mb-2 text-note font-semibold text-ink">
            Nguồn ứng viên đã từ chối, và vì sao — lý do ta KHÔNG dùng một nguồn là thứ bảo vệ
            được nhất trong bộ dữ liệu này:
          </div>
          <div className="space-y-2">
            {Object.entries(v.rejected).map(([srcName, reason]) => (
              <div
                key={srcName}
                className="flex items-start gap-2 rounded border border-hairline bg-basemap p-2.5 text-note text-ink-2"
              >
                <span className="shrink-0 font-mono text-warn">✕</span>
                <div>
                  <span className="font-mono font-medium text-ink">{srcName}</span>: {reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Block>
  );
}

// ── 2. TỔNG CUNG (§2.1 & §6.1-2) ──────────────────────────────────────────────────────

const B2 = "2. Tổng cung & chất lượng quan sát";

function KpiBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("kpi", manifest);
  if (!gate.render) return <AbsentBlock title={B2} gate={gate} />;

  const tt = manifest.totals!;
  const occOk = tt.occ_status_ok;
  const dropped = tt.private_ac_dropped;
  const preFilter = manifest.filters?.private_ac_charge_points;

  return (
    <Block
      title={B2}
      subtitle="Tổng tài sản lắp đặt (ASSET) và chất lượng báo cáo telemetry. Mọi con số ghi rõ mẫu số và phạm vi ranh giới — một tỉ lệ không có mẫu số trên màn hình thì không được vẽ thành thanh."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="trạm công cộng"
          value={vn(tt.in_scope.n_stations)}
          sub={`+${vn(tt.buffer.n_stations)} trạm vành đệm · ${vn(tt.all.n_stations)} tổng cộng`}
          scope="IN"
        />
        <Tile
          label="cổng lắp đặt"
          value={vn(tt.in_scope.n_ports)}
          sub={
            tt.in_scope.n_ports_missing > 0
              ? `chặn dưới — ${vn(tt.in_scope.n_ports_missing)}/${vn(tt.in_scope.n_stations)} trạm khuyết n_ports`
              : `mọi trạm trong ${vn(tt.in_scope.n_stations)} đều khai cổng`
          }
          scope="IN"
        />
        <Tile
          label="công suất lắp đặt"
          value={`${tt.in_scope.power_mw.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MW`}
          sub={
            tt.in_scope.power_missing > 0
              ? `chặn dưới — ${vn(tt.in_scope.power_missing)}/${vn(tt.in_scope.n_stations)} trạm khuyết kW`
              : `mọi trạm trong ${vn(tt.in_scope.n_stations)} đều khai kW`
          }
          scope="IN"
        />
        <Tile
          label="trạm báo cáo đủ chuẩn"
          value={occOk ? pct(occOk.share) : "—"}
          sub={occOk ? `${vn(occOk.n_ok)}/${vn(occOk.n_total)} trạm có hồ sơ 30 ngày` : "chưa đo"}
          scope="IN"
        />
        {/* AC-7: tỉ lệ 71,84 % là 1.811/2.521, KHÔNG phải trên 939 hay trên 710. Mẫu số của nó
            đứng ngay trong cùng một ô chứ không nằm ở một khối khác. */}
        <Tile
          label="điểm sạc cá nhân ĐÃ LOẠI"
          value={dropped ? vn(dropped.n) : "—"}
          sub={
            dropped
              ? `${pct(dropped.share_stations)} của ${vn(preFilter?.before ?? 0)} trạm trước lọc · chỉ ${pct(dropped.share_power)} công suất`
              : "chưa đo"
          }
          scope="pre-filter"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-hairline bg-basemap p-2 text-note text-ink-2">
        <span className="font-medium text-ink">Trạng thái vận hành:</span>
        {Object.entries(tt.op_status)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => (
            <span key={k} className="tabular-nums">
              {constantShort(k)}: <strong>{vn(v)}</strong>
            </span>
          ))}
        <span className="text-ink-muted">/ {vn(tt.all.n_stations)} trạm (IN+BUFFER)</span>
      </div>
    </Block>
  );
}

function Tile({
  label,
  value,
  sub,
  scope,
}: {
  label: string;
  value: string;
  sub: string;
  scope?: string;
}) {
  return (
    <div className="rounded border border-hairline bg-basemap p-3">
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-readout font-bold leading-none text-ink">{value}</div>
        {scope && (
          <span className="shrink-0 rounded border border-hairline bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
            {scope}
          </span>
        )}
      </div>
      <div className="pt-2 text-body font-medium text-ink">{label}</div>
      <div className="pt-0.5 text-note leading-tight text-ink-muted">{sub}</div>
    </div>
  );
}

// ── 3. ĐÃ LOẠI (§2.9 & §6.1-3) ────────────────────────────────────────────────────────

const B3 = "3. Đã loại — năm phép lọc của pipeline";

function FiltersBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("filters", manifest);
  if (!gate.render) return <AbsentBlock title={B3} gate={gate} />;
  const filters = manifest.filters!;

  return (
    <Block
      title={B3}
      subtitle={
        <>
          Bản kê các phép lọc có chủ đích, mỗi phép một dòng{" "}
          <span className="font-mono">trước − đã loại = còn lại</span> kèm mẫu số riêng. Dòng
          điểm sạc cá nhân là con số hệ trọng nhất trong gói: nó gỡ đi phần lớn số TRẠM nhưng
          rất ít CÔNG SUẤT, và mọi thống kê theo trạm trong app tính SAU phép lọc đó. Dòng POI
          là <strong>ngoại lệ có chủ ý</strong>: hai phép trích giao nhau một phần, không phải
          một phép loại, nên cột “đã loại” của nó là một dấu gạch chứ không phải một con số.
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-note">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-muted">
              <th className="py-2 pr-3 font-semibold">Tên bộ lọc</th>
              <th className="py-2 pr-3 font-semibold">Quy tắc &amp; nguồn</th>
              <th className="py-2 pr-3 text-right font-semibold">Trước lọc</th>
              <th className="py-2 pr-3 text-right font-semibold">Đã loại</th>
              <th className="py-2 pr-3 text-right font-semibold">Còn lại</th>
              <th className="py-2 pr-3 font-semibold">Mẫu số &amp; tác động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {Object.entries(filters).map(([k, f]) => (
              <tr key={k} className="hover:bg-basemap/50">
                <td className="py-2 pr-3 font-medium text-ink">{f.name}</td>
                <td className="max-w-[260px] py-2 pr-3 font-mono text-[11px] text-ink-muted">
                  <div className="truncate" title={f.rule_const}>
                    {f.rule_const}
                  </div>
                  <div className="text-[10px] text-ink-muted/70">{f.source_file}</div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{vn(f.before)}</td>
                {/* `removed: null` ⇒ KHÔNG có phép loại nào. In một dấu gạch chứ không in 0:
                    một số 0 đọc thành "không có gì bị loại", một câu khác hẳn "câu hỏi không
                    áp dụng cho cặp này". */}
                <td className="py-2 pr-3 text-right font-semibold tabular-nums text-warn">
                  {f.removed === null ? (
                    <span className="font-normal text-ink-muted">—</span>
                  ) : (
                    `−${vn(f.removed)}`
                  )}
                </td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums text-cold-2">
                  {vn(f.after)}
                </td>
                <td className="py-2 pr-3 text-ink-2">
                  <div>{f.denominator}</div>
                  {f.share_removed_stations !== undefined && (
                    <div className="text-[11px] text-ink-muted">
                      Loại {pct(f.share_removed_stations)} số trạm, nhưng chỉ{" "}
                      {pct(f.share_removed_power ?? 0)} công suất
                      {f.share_removed_ports !== undefined &&
                        ` · ${pct(f.share_removed_ports)} số cổng`}
                    </div>
                  )}
                  {f.kind === "two_sets" && f.n_both !== undefined && (
                    <div className="text-[11px] text-ink-muted">
                      Giao nhau MỘT PHẦN, không lồng nhau: {vn(f.n_both)} chung ·{" "}
                      {vn(f.n_visual_only ?? 0)} chỉ trực quan · {vn(f.n_demand_only ?? 0)} chỉ
                      nhu cầu.
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

// ── 4. CHUẨN PHÍCH (§2.1 & §6.1-4) ────────────────────────────────────────────────────

const B4 = "4. Chuẩn phích & đối soát súng / cổng";

function ConnectorsBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("connectors", manifest);
  if (!gate.render) return <AbsentBlock title={B4} gate={gate} />;

  const c = manifest.totals!.connectors;
  const g = connectorGap(manifest)!;

  // Từ vựng chuẩn phích đọc TỪ DỮ LIỆU. Một danh sách gõ tay `["CCS2","TYPE2","UNKNOWN"]` âm
  // thầm đánh rơi một chuẩn thứ tư, và tệ hơn: nó cũng đánh rơi chuẩn ấy khỏi MẪU SỐ, nên mọi
  // phần trăm còn lại đọc sai (AC-20).
  const entries = Object.entries(c.by_standard)
    .map(([k, v]) => ({ k, v: v.n_guns }))
    .filter((e) => e.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = c.n_guns || entries.reduce((s, e) => s + e.v, 0) || 1;

  return (
    <Block
      title={B4}
      subtitle={
        <>
          Đoạn <span className="font-mono">UNKNOWN</span> vẽ vân xám vì nó là{" "}
          <strong>vắng thông tin</strong>, không phải một chuẩn thứ ba.
        </>
      }
    >
      {/* §2.1: hai con số này đo hai thứ khác nhau và phải đứng trên CÙNG một phạm vi. So
          `n_guns` (IN+BUFFER) với `in_scope.n_ports` (chỉ IN) là lật dấu của chính khoảng
          chênh đang muốn nói. */}
      <div className="mb-3 rounded border border-hairline bg-basemap p-3 text-note text-ink-2">
        <div className="font-medium text-ink">
          Đối soát trên cùng phạm vi {g.scope}:{" "}
          <span className="tabular-nums">{vn(g.nGuns)}</span> súng báo cáo (LIVE) so với{" "}
          <span className="tabular-nums">{vn(g.nPorts)}</span> cổng lắp đặt (ASSET) —{" "}
          <span className="tabular-nums font-semibold text-warn">
            {g.gap >= 0 ? "thiếu" : "thừa"} {vn(Math.abs(g.gap))} súng
          </span>
          .
        </div>
        <div className="mt-1">
          Hai vế KHÔNG đếm cùng một thứ: {vn(g.nStationsWithoutConnectors)}/
          {vn(g.nStationsTotal)} trạm không có dòng connector nào, nên vế LIVE chỉ trải trên{" "}
          {vn(g.nStationsWithConnectors)} trạm. Phép đối soát đầy đủ là một câu hỏi thượng
          nguồn còn treo (§10-3); tới lúc đó khối này <strong>nêu khoảng chênh</strong> chứ
          không ngụ ý hai vế đếm cùng một thứ.
        </div>
      </div>

      <div className="flex h-7 w-full overflow-hidden rounded border border-hairline">
        {entries.map((e, i) => (
          <div
            key={e.k}
            style={{
              width: `${(e.v / total) * 100}%`,
              background:
                e.k === "UNKNOWN"
                  ? `repeating-linear-gradient(${NULL_STATE_HATCH_DEG.MISSING}deg, ${HATCH_HEX} 0 1px, transparent 1px 5px)`
                  : i === 0
                    ? RAMP_HEX[5]
                    : RAMP_HEX[2],
            }}
            title={`${e.k}: ${vn(e.v)} súng`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 text-body text-ink">
        {entries.map((e) => (
          <span key={e.k} className="tabular-nums">
            <span className="font-semibold">
              {e.k === "UNKNOWN" ? "không khớp registry (UNKNOWN)" : e.k}
            </span>
            : {vn(e.v)} súng ({pct(e.v / total)} của {vn(total)})
          </span>
        ))}
      </div>
    </Block>
  );
}

// ── 5. PHỦ TỪNG CỘT (§2.2) ────────────────────────────────────────────────────────────

const B5 = "5. Phủ từng cột của lưới";

/**
 * Bản đầy đủ của thứ rail chỉ hé ra qua badge ⚠ — cả 61 cột, kể cả 57 cột phủ 100 %.
 *
 * Khối KHOẢNG TRỐNG bên dưới chỉ liệt kê cột CÓ ô trống (§3.1), nên nếu chỉ có nó thì 57 cột
 * sạch biến mất khỏi màn hình và `manifest.coverage` — hợp đồng của Phase 4 — không còn ai
 * đọc. "Không có ô trống nào" cũng là một số đo, và nó phải kiểm được.
 */
function CoverageBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("coverage", manifest);
  const [onlyGaps, setOnlyGaps] = useState(false);
  if (!gate.render) return <AbsentBlock title={B5} gate={gate} />;

  const all = Object.entries(manifest.coverage);
  // "% dân" chỉ dựng khi bộ dữ liệu CÓ lớp dân số. 23 dòng cùng ghi "chưa có lớp dân số" là
  // 23 lần nói một câu — nói một lần rồi bỏ cột đi thì đọc được hơn, và nó không để một cột
  // trống trông như một cột đo được 0.
  const hasPop = all.some(([, c]) => c.pop_share !== undefined);
  const gaps = all.filter(([, c]) => c.cell_share < 1);
  const rows = (onlyGaps ? gaps : all).sort((a, b) => a[1].cell_share - b[1].cell_share);
  const clean = fullyCoveredColumns(manifest);

  return (
    <Block
      title={B5}
      subtitle={
        hasPop ? (
          <>
            Hai con số là hai nghĩa khác nhau và chúng phải đi cùng nhau: <strong>% ô</strong>{" "}
            hỏi “bao nhiêu ô có giá trị”, <strong>% dân</strong> hỏi “những ô đó chứa bao nhiêu
            người”. Một cột phủ ít ô mà nhiều dân không phải “đo kém” — nó chỉ tồn tại ở nơi
            câu hỏi có nghĩa. <strong>{vn(clean.length)}</strong> cột phủ 100 %.
          </>
        ) : (
          <>
            Bộ dữ liệu này <strong>chưa có lớp dân số</strong>, nên chỉ có “% ô”. Cột “% dân” bị
            bỏ hẳn chứ không để trống: một phủ theo dân tính bằng trọng số đều sẽ đọc thành dân
            số thật.
            {manifest.missing_layers && ` ${manifest.missing_layers.reason}.`}
          </>
        )
      }
    >
      <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-body text-ink-2">
        <input
          type="checkbox"
          checked={onlyGaps}
          onChange={(e) => setOnlyGaps(e.target.checked)}
          className="accent-cold-2"
        />
        chỉ hiện cột chưa phủ 100% ({vn(gaps.length)}/{vn(all.length)})
      </label>
      <div className="max-h-[420px] overflow-auto rounded border border-hairline">
        <table className="w-full min-w-[640px] text-body">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-hairline text-left text-ink-2">
              <th className="py-1 pr-2 font-normal">cột</th>
              <th className="w-[150px] py-1 pr-2 font-normal">% ô</th>
              {hasPop && <th className="w-[150px] py-1 pr-2 font-normal">% dân</th>}
              <th className="py-1 pr-2 text-right font-normal">số ô có giá trị</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([col, c]) => (
              <tr key={col} className="border-b border-hairline align-middle">
                <td className="py-1 pr-2 font-mono text-note text-ink">{col}</td>
                <td className="py-1 pr-2">
                  <Meter share={c.cell_share} />
                </td>
                {hasPop && (
                  <td className="py-1 pr-2">
                    {/* Vắng `pop_share` ⇒ in CHỮ, không vẽ một meter dài 0 px. Một meter rỗng
                        đọc thành "0% dân" — đúng cái ràng buộc 1 cấm. */}
                    {c.pop_share === undefined ? (
                      <span className="italic text-ink-muted">không đo được</span>
                    ) : (
                      <Meter share={c.pop_share} />
                    )}
                  </td>
                )}
                <td className="py-1 text-right tabular-nums text-ink-2">
                  {vn(c.n_present)}/{vn(manifest.n_cells)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function Meter({ share }: { share: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 flex-1 bg-hairline">
        <span
          className="block h-2"
          style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: SERIES }}
        />
      </span>
      <span className="w-[46px] shrink-0 text-right tabular-nums text-ink-2">{pct(share)}</span>
    </span>
  );
}

// ── 6. KHOẢNG TRỐNG (§2.2, §2.3, §6.1-5) ──────────────────────────────────────────────

const B6 = "6. Khoảng trống — bốn trạng thái, ba mẫu số";

const STATE_ORDER: NullState[] = ["NOT_APPLICABLE", "FILTERED", "NOT_MEASURED", "MISSING"];

function NullStatesBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("nullStates", manifest);
  const tableKeys = Object.keys(manifest.null_states ?? {});
  const [selected, setSelected] = useState<string>(tableKeys[0] ?? "grid");
  if (!gate.render) return <AbsentBlock title={B6} gate={gate} />;

  const active = tableKeys.includes(selected) ? selected : tableKeys[0]!;
  const rows = columnRows(manifest, active);

  return (
    <Block
      title={B6}
      subtitle={
        <>
          Một ô trống chưa phải khuyết tật cho tới khi ta nói nó là <em>loại</em> ô trống nào.
          Xếp theo <strong>thiếu nguồn + chưa đo</strong> giảm dần — hai trạng thái nghĩa là{" "}
          <em>ta không biết</em>. Xếp theo số ô trống thô sẽ đưa một cột 97,2 % trống nhưng hoàn
          toàn khoẻ mạnh lên đầu một danh sách tiêu đề “vấn đề”.
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {STATE_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <StateSwatch state={s} />
                <span className={NULL_STATE_WARNS[s] ? "text-warn" : ""}>
                  {NULL_STATE_LABEL[s]}
                  {s === "NOT_APPLICABLE" && " (rời mẫu số)"}
                </span>
              </span>
            ))}
          </div>
        </>
      }
    >
      <div className="flex flex-wrap gap-2 pb-3">
        {tableKeys.map((t) => (
          <button
            key={t}
            onClick={() => setSelected(t)}
            className={`cursor-pointer rounded px-2.5 py-1 font-mono text-note transition-colors ${
              active === t
                ? "bg-cold-2 font-semibold text-basemap"
                : "border border-hairline bg-basemap text-ink-muted hover:text-ink"
            }`}
          >
            {t} ({vn(Object.keys(manifest.null_states![t] ?? {}).length)} cột khuyết)
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-note">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-muted">
              <th className="py-2 pr-3 font-semibold">Cột</th>
              <th className="w-[190px] py-2 pr-3 font-semibold">Phủ trên phần ÁP DỤNG</th>
              <th className="w-[130px] py-2 pr-3 font-semibold">Phủ trên TOÀN bảng</th>
              <th className="py-2 pr-3 font-semibold">% dân</th>
              <th className="py-2 pr-3 font-semibold">Phân giải ô trống</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <NullStateRow key={r.column} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function NullStateRow({ r }: { r: ColumnRow }) {
  // §6.2 — KHÔNG ÁP DỤNG không bao giờ là một thanh vơi. Cột mà mọi ô trống đều "không áp
  // dụng" thì phủ-trên-phần-áp-dụng đúng bằng 100 %: chỗ đó nhận một CHIP LUẬT trung tính,
  // không nhận một thanh. `n_guns_imputed` (97,2 % trống) và `commune.quality_flag` (98,4 %
  // trống) là hai ca mà pha này tồn tại để giữ cho sạch.
  const allNotApplicable = r.nUnknown === 0 && r.shareApplicable >= 1;

  return (
    <tr className="hover:bg-basemap/50">
      <td className="py-2 pr-3 font-mono font-medium text-ink">
        {r.column}
        {r.nResidual > 0 && (
          <span className="ml-1.5 rounded bg-warn/20 px-1 py-0.5 text-[10px] font-semibold text-warn">
            §9
          </span>
        )}
      </td>

      <td className="py-2 pr-3">
        {allNotApplicable ? (
          <div className="inline-flex items-center gap-1.5 rounded border border-hairline bg-basemap px-2 py-1 text-[11px] text-ink-2">
            <StateSwatch state="NOT_APPLICABLE" />
            phủ đủ trên phần câu hỏi có nghĩa
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded border border-hairline bg-basemap">
              <div
                className="h-full"
                style={{
                  width: `${r.shareApplicable * 100}%`,
                  background: r.warns ? RAMP_HEX[4] : SERIES,
                }}
              />
            </div>
            <span className="tabular-nums font-semibold text-ink">{pct(r.shareApplicable)}</span>
          </div>
        )}
        {/* Mẫu số của thanh, ngay dưới thanh — §6.2. */}
        <div className="text-[10px] text-ink-muted">
          mẫu số {vn(r.nApplicable)}/{vn(r.nRows)} dòng
        </div>
      </td>

      {/* AC-4: mẫu số THÔ đứng cạnh mẫu số THẬT. `util_cell` đọc 9,9 % ở cột này và 97,3 % ở
          cột trước; cả hai đều đúng, và chỉ một trong hai đáng báo động. */}
      <td className="py-2 pr-3">
        <span className="tabular-nums text-ink-2">{pct(r.shareRows)}</span>
        <div className="text-[10px] text-ink-muted">
          {vn(r.nPresent)}/{vn(r.nRows)} dòng
        </div>
      </td>

      <td className="py-2 pr-3 tabular-nums text-ink">
        {r.popShare !== undefined ? (
          pct(r.popShare)
        ) : (
          <span className="text-[11px] italic text-ink-muted">không đo được</span>
        )}
      </td>

      <td className="py-2 pr-3">
        <div className="flex flex-wrap gap-1.5">
          {r.buckets.map((b) => {
            const st = b.state as NullState;
            const warn = NULL_STATE_WARNS[st];
            const residual = b.basis === "residual";
            return (
              <span
                key={b.key}
                title={
                  residual
                    ? b.rule
                    : `${b.basis === "table_invariant" ? "tuyên bố mức bảng" : "vị từ theo hàng"}: ${b.rule}${b.verifiedBy ? ` · đối chiếu ${b.verifiedBy}` : ""}`
                }
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
                  residual
                    ? "border-warn/60 bg-warn/20 font-semibold text-warn"
                    : warn
                      ? "border-warn/30 bg-warn/10 text-warn"
                      : "border-hairline bg-basemap text-ink-muted"
                }`}
              >
                <StateSwatch state={st} />
                {warn && "⚠ "}
                {vn(b.n)} {NULL_STATE_LABEL[st]}
                <span className="font-mono opacity-70">
                  {residual ? "· không luật nào giải thích" : `· ${b.rule}`}
                </span>
                {b.basis === "table_invariant" && (
                  <span className="opacity-60" title={`đối chiếu ${b.verifiedBy}`}>
                    · mức bảng
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

// ── 7. GIÁ TRỊ ĐÁNG NGỜ & ĐỘ TƯƠI (§0.4, §2.7, §9-8) ──────────────────────────────────

const B7 = "7. Giá trị đáng ngờ & độ tươi dữ liệu";

function SuspectValuesBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("suspect", manifest);
  if (!gate.render) return <AbsentBlock title={B7} gate={gate} />;

  const inv = manifest.invalid_values ?? {};
  const degen = manifest.degenerate_columns ?? {};
  const notMeasured = manifest.not_measured ?? {};
  const freshness = manifest.freshness;

  return (
    <Block
      title={B7}
      subtitle="Ba thứ mà không bộ đếm ô trống nào thấy được: giá trị CÓ MẶT nhưng đã trượt một phép kiểm, số 0 mã hoá một ô trống, và cột phủ 100 % mà không chở thông tin nào. Cộng thêm những khoá đã khai nhưng phép đo chưa từng chạy."
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="text-note font-semibold text-ink">
              Giá trị mang nhãn cảnh báo — chúng ĐƯỢC SHIP, kèm nhãn:
            </div>
            {Object.keys(inv).length === 0 ? (
              <div className="mt-1 text-note italic text-ink-muted">
                Manifest không khai giá trị mang nhãn nào.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {Object.entries(inv).map(([k, item]) => (
                  <div key={k} className="rounded border border-hairline bg-basemap p-3 text-note">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono font-bold text-ink">{k}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-warn">
                        {vn(item.n)} dòng
                        {item.share_rows !== undefined && ` (${pct(item.share_rows)})`}
                        {item.share_pop !== undefined && ` · ${pct(item.share_pop)} dân`}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-ink-2">{item.rule}</div>
                    <div className="mt-0.5 text-[11px] text-ink-muted">
                      Xử lý: {item.disposition}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {Object.keys(notMeasured).length > 0 && (
            <div className="border-t border-hairline pt-3">
              {/* §9-8: một dấu gạch đứng cạnh các số đã đo đọc thành "không đáng kể". Nó phải
                  nói ra rằng phép đo CHƯA TỪNG CHẠY. */}
              <div className="text-note font-semibold text-ink">
                Khoá đã khai nhưng phép đo chưa từng chạy:
              </div>
              <div className="mt-2 space-y-2">
                {Object.entries(notMeasured).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded border border-hairline bg-basemap p-2.5 text-note text-ink-2"
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <StateSwatch state="NOT_MEASURED" />
                      <span className="font-mono font-medium text-ink">{k}</span>
                      <span className="text-warn">— chưa đo</span>
                    </div>
                    <div className="mt-1">{v.reason}.</div>
                    <div className="mt-0.5 text-[11px] text-ink-muted">
                      Hệ quả: {v.consequence} · câu hỏi thượng nguồn {v.upstream_ask}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-note font-semibold text-ink">
              Cột hằng số — phủ 100 %, thông tin 0 %:
            </div>
            {Object.keys(degen).length === 0 ? (
              <div className="mt-1 text-note italic text-ink-muted">
                Không cột nào của lưới mang đúng một giá trị.
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(degen).map(([col, val]) => (
                  <span
                    key={col}
                    className="rounded border border-hairline bg-basemap px-2 py-1 font-mono text-note text-ink-2"
                  >
                    {col} = <strong className="text-ink">{String(val)}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          {freshness?.row_level && (
            <div className="border-t border-hairline pt-3">
              <div className="text-note font-semibold text-ink">
                Phân phối độ tươi trạm ({freshness.row_level.column})
              </div>
              {/* §2.7 + AC-11 — PHÂN PHỐI, không phải một con số, và không vạch ngưỡng nào.
                  Cột này không có đơn vị, không có mốc thời gian, không có định nghĩa ở bất
                  kỳ đâu trong repo (§10-1). Tô nó bằng một thang "cũ dần" là bịa ra một
                  thang đo. */}
              <div className="mt-0.5 text-note text-ink-muted">
                {freshness.row_level.note} — <strong>đơn vị chưa định nghĩa ở thượng nguồn</strong>
                , nên không vạch ngưỡng, không tô thang, không gộp vào điểm nào (§10-1).
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-note">
                {[
                  ["Trung vị (p50)", freshness.row_level.p50],
                  ["Phân vị 90", freshness.row_level.p90],
                  ["Lớn nhất", freshness.row_level.max],
                ].map(([label, v]) => (
                  <div key={String(label)} className="rounded border border-hairline bg-basemap p-2">
                    <div className="text-[11px] text-ink-muted">{label}</div>
                    <div className="font-bold text-ink">{v ?? "—"}</div>
                  </div>
                ))}
                <div className="rounded border border-hairline bg-basemap p-2">
                  <div className="text-[11px] text-ink-muted">Số trạm có</div>
                  <div className="font-bold text-ink">
                    {vn(freshness.row_level.n_present)}/{vn(freshness.row_level.n_rows)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Block>
  );
}

// ── 8. 34 TỈNH (§2.8 & §6.1-7) ────────────────────────────────────────────────────────

const B8 = "8. Sức khoẻ 34 tỉnh & đề nghị loại trừ";

interface ProvinceHealthRow {
  province_code: string;
  province_name: string;
  n_stations: number | null;
  quality_flags: string[];
  share_cells_reachable: number | null;
  share_pop_unreachable: number | null;
  share_stations_measured: number | null;
  share_communes_zero_poi: number | null;
  vnsdi_anchor_ratio: number | null;
  excluded: boolean;
  exclusion_reasons: string[];
  poi_not_interpretable: boolean;
}

interface ProvinceHealth {
  thresholds: Record<string, number>;
  source: string;
  provinces: ProvinceHealthRow[];
}

function ProvincesBlock({ manifest }: { manifest: Manifest }) {
  const [data, setData] = useState<ProvinceHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const here = manifest.province?.province_code ?? null;

  // Nạp LƯỜI, một file 34 dòng. Không chép bảng này vào cả 34 manifest: đó là 34 bản có thể
  // lệch nhau, và web thì đằng nào cũng cần cả bảng để nói "tỉnh này đứng đâu".
  useEffect(() => {
    let dead = false;
    void fetch("data/province_health.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ProvinceHealth) => !dead && setData(j))
      .catch((e: unknown) => !dead && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      dead = true;
    };
  }, []);

  const th = data?.thresholds ?? {};
  const rows = data?.provinces ?? [];
  const nExcluded = rows.filter((r) => r.excluded).length;
  const nPoiBad = rows.filter((r) => r.poi_not_interpretable).length;

  return (
    <Block
      title={B8}
      subtitle={
        <>
          Suy thoái <strong>không đều</strong> giữa các tỉnh, và nó đo được. Ngưỡng in ra dưới
          dạng <em>giả định đã khai</em> kèm tên hằng — chúng là quyết định, không phải phát
          hiện:{" "}
          {Object.entries(th).map(([k, v], i) => (
            <span key={k} className="font-mono text-ink">
              {i > 0 && " · "}
              {k} = {v}
            </span>
          ))}
          .
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded border border-hairline bg-basemap p-3 text-note text-ink-2">
          Không nạp được bảng sức khoẻ 34 tỉnh ({err}). Bảng này nằm ở{" "}
          <span className="font-mono">data/province_health.json</span>.
        </div>
      )}
      {!err && !data && (
        <div className="py-2 text-note italic text-ink-muted">Đang nạp bảng 34 tỉnh…</div>
      )}

      {data && (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-note">
            <span className="rounded border border-warn/50 bg-warn/10 px-2 py-1 text-ink">
              <strong className="text-warn">{vn(nExcluded)}</strong>/{vn(rows.length)} tỉnh đề
              nghị loại khỏi phân tích chính
            </span>
            <span className="rounded border border-hairline bg-basemap px-2 py-1 text-ink-2">
              <strong className="text-ink">{vn(nPoiBad)}</strong>/{vn(rows.length)} tỉnh cấm diễn
              giải mật độ POI
            </span>
            <span className="rounded border border-hairline bg-basemap px-2 py-1 text-ink-muted">
              nguồn: <span className="font-mono">{data.source}</span>
            </span>
          </div>

          <div className="max-h-[460px] overflow-auto rounded border border-hairline">
            <table className="w-full min-w-[900px] text-note">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-hairline text-left text-ink-muted">
                  <th className="py-2 pl-2 pr-3 font-semibold">Tỉnh</th>
                  <th className="py-2 pr-3 text-right font-semibold">Trạm</th>
                  <th className="py-2 pr-3 text-right font-semibold">Ô tới được</th>
                  <th className="py-2 pr-3 text-right font-semibold">Dân KHÔNG tới được</th>
                  <th className="py-2 pr-3 text-right font-semibold">Trạm đo được</th>
                  <th className="py-2 pr-3 text-right font-semibold">Xã không POI</th>
                  <th className="py-2 pr-3 text-right font-semibold">Neo dân số</th>
                  <th className="py-2 pr-3 font-semibold">Cờ &amp; đề nghị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r) => (
                  <tr
                    key={r.province_code}
                    className={r.province_code === here ? "bg-cold-2/10" : "hover:bg-basemap/50"}
                  >
                    <td className="py-1.5 pl-2 pr-3 text-ink">
                      <span className="font-mono text-ink-muted">{r.province_code}</span>{" "}
                      {r.province_name}
                      {r.province_code === here && (
                        <span className="ml-1 text-[10px] font-semibold text-cold-2">
                          đang xem
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ink-2">
                      {r.n_stations === null ? "—" : vn(r.n_stations)}
                    </td>
                    {/* Phủ ô và phần dân đi CÙNG NHAU. Một mình "33 % ô tới được" đọc thành
                        mất hai phần ba dữ liệu; cạnh nó "0,9 % dân" nói ra sự thật. */}
                    <Num v={r.share_cells_reachable} />
                    <Num v={r.share_pop_unreachable} warnAbove={0.05} />
                    <Num
                      v={r.share_stations_measured}
                      warnBelow={th["MIN_OCC_MEASURED_SHARE"] ?? 0.5}
                    />
                    <Num
                      v={r.share_communes_zero_poi}
                      warnAbove={th["POI_ZERO_COMMUNE_MAX"] ?? 0.5}
                    />
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ink-2">
                      {r.vnsdi_anchor_ratio === null ? "—" : formatFixed(r.vnsdi_anchor_ratio, 3)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {r.excluded && (
                          <span className="inline-flex items-center gap-1 rounded border border-warn/60 bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                            <AlertTriangle className="h-3 w-3" /> đề nghị loại
                          </span>
                        )}
                        {r.poi_not_interpretable && (
                          <span className="rounded border border-hairline bg-basemap px-1.5 py-0.5 text-[10px] text-ink-2">
                            POI không diễn giải
                          </span>
                        )}
                        {r.quality_flags.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-cold-2">
                            <CheckCircle2 className="h-3 w-3" /> không cờ nào
                          </span>
                        ) : (
                          r.quality_flags.map((fl) => (
                            <span
                              key={fl}
                              title={fl}
                              className="rounded border border-hairline bg-basemap px-1.5 py-0.5 text-[10px] text-ink-muted"
                            >
                              {constantShort(fl) || fl}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Block>
  );
}

function Num({
  v,
  warnAbove,
  warnBelow,
}: {
  v: number | null;
  warnAbove?: number;
  warnBelow?: number;
}) {
  const warn =
    v !== null &&
    ((warnAbove !== undefined && v > warnAbove) || (warnBelow !== undefined && v < warnBelow));
  return (
    <td
      className={`py-1.5 pr-3 text-right tabular-nums ${warn ? "font-semibold text-warn" : "text-ink-2"}`}
    >
      {v === null ? "—" : pct(v)}
    </td>
  );
}

// ── 9. HỒ SƠ NGÀY THEO DẠNG NHỊP (§3f-5, §2.5 & §6.1-8) ───────────────────────────────

const B9 = "9. Hồ sơ ngày theo dạng nhịp";
const SPARK_W = 220;
const SPARK_H = 62;

function ShapeMultiplesBlock({
  manifest,
  occupancy,
}: {
  manifest: Manifest;
  occupancy: StationOccupancy | null;
}) {
  const [classes, setClasses] = useState<Map<string, string> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const gate = gateFor("shapes", manifest);
  const unusable = manifest.unusable_layers?.find((u) => u.layer === "occupancy") ?? null;
  const occOk = manifest.totals?.occ_status_ok;
  const occCounts = manifest.totals?.occ_status_counts;
  const utilCell = manifest.coverage?.["util_cell"];

  useEffect(() => {
    void fetchShapeClasses().then(setClasses, (e: unknown) =>
      setErr(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const profiles: ShapeProfile[] = useMemo(() => {
    if (!occupancy || !classes) return [];
    return shapeDayProfiles(
      occupancy.profiles,
      (s) => classes.get(occupancy.stations[s]!.code) ?? null,
    );
  }, [occupancy, classes]);

  const top = useMemo(() => {
    const hi = profiles.reduce((m, p) => Math.max(m, ...p.hours.map((v) => v ?? 0)), 0);
    return hi > 0 ? hi * 1.08 : 1;
  }, [profiles]);

  if (!gate.render) return <AbsentBlock title={B9} gate={gate} />;

  return (
    <Block
      title={B9}
      subtitle="Năm dạng của shape_class, mỗi dạng một hồ sơ 24 giờ (Σ cổng bận ÷ Σ cổng lắp đặt, gộp trên cả tuần). CÙNG thang y cho cả năm."
    >
      {/* §3f-5 + §2.5: khi cổng lớp nổ, lý do lên ĐẦU KHỐI chứ không nằm ở một chú thích. */}
      {unusable && (
        <div className="mb-4 flex items-start gap-2 rounded border border-warn/60 bg-warn/10 p-3 text-note text-ink">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div>
            <strong>Lớp occupancy không đọc được:</strong> {unusable.reason} ({unusable.measured}).
          </div>
        </div>
      )}

      {/* §2.5 — HAI con số khác nhau cùng gọi là "phủ telemetry", và chúng phải đứng cạnh
          nhau với mẫu số riêng: phủ theo TRẠM, và phủ theo Ô CÓ TRẠM. */}
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 rounded border border-hairline bg-basemap p-2.5 text-note text-ink-2">
        {occOk && (
          <span>
            Telemetry theo <strong className="text-ink">trạm</strong>:{" "}
            <span className="tabular-nums font-semibold text-ink">
              {vn(occOk.n_ok)}/{vn(occOk.n_total)}
            </span>{" "}
            ({pct(occOk.share)}) trạm đủ chuẩn báo cáo
          </span>
        )}
        {utilCell?.share_measured_among_cells_with_station !== undefined && (
          <span>
            Telemetry theo <strong className="text-ink">ô</strong>:{" "}
            <span className="tabular-nums font-semibold text-ink">
              {vn(utilCell.n_present)}/{vn(utilCell.cells_with_station ?? 0)}
            </span>{" "}
            ({pct(utilCell.share_measured_among_cells_with_station)}) ô CÓ TRẠM đo được
          </span>
        )}
        {occCounts && (
          <span>
            Chưa đo tách theo lý do:{" "}
            {Object.entries(occCounts)
              .filter(([k]) => k !== "OK")
              .map(([k, v]) => `${constantShort(k) || k} ${vn(v)}`)
              .join(" · ") || "không có"}
          </span>
        )}
      </div>

      {err && <div className="text-note text-warn">Không đọc được shape_class: {err}</div>}
      {!err && profiles.length === 0 && (
        <div className="py-2 text-note italic text-ink-muted">
          {occupancy ? "Không trạm nào có nhãn dạng nhịp." : "Đang gộp hồ sơ 168 giờ…"}
        </div>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {profiles.map((p) => (
          <div key={p.cls}>
            <div className="flex items-baseline gap-2 pb-1 text-note">
              <span className="font-semibold text-ink">{CONSTANTS[p.cls]?.short ?? p.cls}</span>
              <span className="tabular-nums text-ink-muted">{vn(p.nStations)} trạm</span>
            </div>
            <Spark hours={p.hours} top={top} />
          </div>
        ))}
      </div>
      {profiles.length > 0 && (
        <div className="pt-2 text-[11px] text-note text-ink-muted">
          Trục y chung: 0 – {(top * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}% ·
          trục x: 0h → 23h · nét đứt = chưa đủ quan sát.
        </div>
      )}
    </Block>
  );
}

function Spark({ hours, top }: { hours: (number | null)[]; top: number }) {
  const x = (h: number) => (h / 23) * (SPARK_W - 2) + 1;
  const y = (v: number) => SPARK_H - 3 - (v / top) * (SPARK_H - 6);
  let d = "";
  let pen = false;
  hours.forEach((v, h) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(h).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      className="block rounded border border-hairline bg-basemap"
    >
      <line
        x1="0"
        y1={SPARK_H - 3}
        x2={SPARK_W}
        y2={SPARK_H - 3}
        stroke={HAIRLINE_HEX}
        strokeWidth="1"
      />
      <path d={d} fill="none" stroke={SERIES} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── 10. BẢNG DỮ LIỆU GỐC & XUẤT (§4, §5, §6.1-9) ──────────────────────────────────────

const B10 = "10. Bảng dữ liệu gốc & xuất dữ liệu";
const EXPORT_FORMATS: ExportFormat[] = ["csv", "parquet", "arrow", "json", "ndjson", "geojson"];

function RawDataTableBlock({ manifest }: { manifest: Manifest }) {
  const gate = gateFor("table", manifest);
  const [selectedTable, setSelectedTable] = useState<DataModeTableId>("grid");
  const [sort, setSort] = useState<string | null>(null);
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filter, setFilter] = useState("");
  // `filter` là thứ đang GÕ; `committedFilter` là thứ các con số đang NÓI VỀ. Chuỗi gõ
  // trễ 250 ms trước khi thành chuỗi cam kết: mỗi WHERE mới là một cặp query count+page
  // trượt cache, và hàng đợi DuckDB serial toàn app — gõ "vinfast" không debounce là
  // ~14 lần quét LIKE xếp hàng trước mọi truy vấn khác (đo Phase 10).
  //
  // MỘT chuỗi cam kết cho CẢ BA đường ra — bảng, số đếm, và bản xuất. Bản vá đầu của
  // Phase 10 chỉ đổi đường bảng, để số đếm và export đọc `filter` tức thời: trong 250 ms
  // đó nhãn "n / N dòng khớp bộ lọc" trình bày số của bộ lọc CŨ như thể là của bộ lọc
  // vừa gõ, và một cú bấm Xuất trong cửa sổ ấy ghi ra một tập khác với bảng đang nhìn.
  // Đó là lỗi trình bày dữ liệu, không phải lỗi hoạt hình.
  const [committedFilter, setCommittedFilter] = useState("");
  const [visibleCols, setVisibleCols] = useState<string[]>([]);
  const [allCols, setAllCols] = useState<string[]>([]);
  const [data, setData] = useState<TablePage | null>(null);
  // Bộ lọc mà `data` MÔ TẢ. Đây là mảnh còn thiếu để câu hỏi "số trên màn hình có trả lời
  // được chuỗi đang gõ không" trả lời được CHÍNH XÁC: `loading` thì cũng bật khi đổi
  // trang hay đổi cột sắp xếp, mà hai thao tác ấy không làm `total` sai đi tí nào.
  const [dataFilter, setDataFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [showColPicker, setShowColPicker] = useState(false);

  const provCode = manifest.province?.province_code;

  useEffect(() => {
    const id = setTimeout(() => setCommittedFilter(filter), 250);
    return () => clearTimeout(id);
  }, [filter]);

  useEffect(() => {
    let dead = false;
    void getTableSchema(selectedTable, provCode).then(
      (cols) => {
        if (dead) return;
        setAllCols(cols);
        setVisibleCols(cols);
        setSort(null);
        setPage(0);
      },
      (e: unknown) => !dead && setErr(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      dead = true;
    };
  }, [selectedTable, provCode]);

  useEffect(() => {
    if (allCols.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);

    fetchTablePage({
      tableId: selectedTable,
      sort,
      desc,
      offset: page * pageSize,
      limit: pageSize,
      filter: committedFilter,
      visibleColumns: visibleCols,
      provinceCode: provCode,
    })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setDataFilter(committedFilter);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Một truy vấn bị thay thế KHÔNG phải lỗi — nó là kết quả đúng của việc bấm sắp xếp
        // hai lần liên tiếp. Hiện nó ra như "Lỗi truy vấn" là dạy người dùng bỏ qua lỗi thật.
        if (isSuperseded(e)) return;
        setErr(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTable, sort, desc, page, pageSize, committedFilter, visibleCols, provCode, allCols.length]);

  const total = data?.total ?? 0;
  const totalUnfiltered = data?.totalUnfiltered ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  // Số đếm và bản xuất mô tả `committedFilter` — KHÔNG phải ô gõ.
  const isFiltered = committedFilter.trim().length > 0;
  // "Số trên màn hình KHÔNG trả lời được thứ đang gõ" — một phép so, hai cửa sổ:
  // trong 250 ms debounce (`filter !== dataFilter` vì chưa cam kết), và trong lúc truy vấn
  // của chuỗi đã cam kết chưa về (`dataFilter` vẫn là chuỗi cũ). Đổi trang / đổi cột sắp
  // xếp KHÔNG rơi vào đây: `dataFilter` không đổi, nên `total` vẫn đúng và vẫn được in.
  const filterPending = data === null || dataFilter !== filter;

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setExporting(format);
      setExportNote(null);
      setErr(null);
      try {
        const r = await exportDataset({
          tableId: selectedTable,
          format,
          manifest,
          filter: committedFilter,
          sortCol: sort,
          sortDesc: desc,
          visibleColumns: visibleCols,
          allColumns: allCols,
          analysisFilter: null,
        });
        setExportNote(
          `Đã lưu ${r.files === 2 ? "2 file" : "1 file"}: ${r.filename}${r.files === 2 ? " + file xuất xứ .meta.json" : ""} — ${vn(r.rows)} dòng.`,
        );
      } catch (e) {
        // KHÔNG dùng `alert()`: một hộp thoại modal chặn mọi sự kiện của trang, và khi phép
        // xuất hỏng thì cả tab đứng im. Lỗi ở lại trong khối, cạnh cái nút đã gây ra nó.
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setExporting(null);
      }
    },
    [selectedTable, manifest, committedFilter, sort, desc, visibleCols, allCols],
  );

  if (!gate.render) return <AbsentBlock title={B10} gate={gate} />;

  return (
    <Block
      title={B10}
      subtitle="Bảng phẳng trên sáu tập dữ liệu gốc đã ship. Sắp xếp và lọc chạy trong SQL — không phải vì tốc độ mà vì NULL: DuckDB đặt ô trống ở một đầu xác định, còn Array.sort thì không. Mỗi bản xuất chở theo xuất xứ của nó."
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
        <div className="flex flex-wrap gap-1.5">
          {DATA_TABLES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTable(t.id)}
              title={t.desc}
              className={`cursor-pointer rounded px-3 py-1.5 text-note font-medium transition-colors ${
                selectedTable === t.id
                  ? "bg-cold-2 font-semibold text-basemap"
                  : "border border-hairline bg-basemap text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {/* §4.4 — nhãn nút nói CẢ HAI con số khi đang lọc, không phải một tử số trần. */}
            <span className="mr-1 text-note font-medium text-ink-muted">
              {filterPending
                ? data === null
                  ? "Đang tải bảng…"
                  : "Đang tính lại theo bộ lọc…"
                : isFiltered
                  ? `Xuất ${vn(total)} / ${vn(totalUnfiltered)} dòng đang lọc:`
                  : `Xuất toàn bộ ${vn(totalUnfiltered)} dòng:`}
            </span>
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt}
                onClick={() => void handleExport(fmt)}
                disabled={Boolean(exporting) || filterPending}
                title={
                  filterPending
                    ? "Bộ lọc vừa đổi — chờ bảng tính xong rồi mới xuất được, để bản xuất và bảng nói cùng một tập dòng."
                    : `${fmt.toUpperCase()} — lưu ${fileCountFor(fmt)} file${fileCountFor(fmt) === 2 ? " (dữ liệu + xuất xứ)" : " (xuất xứ nhúng bên trong)"}`
                }
                className="flex cursor-pointer items-center gap-1 rounded border border-hairline bg-basemap px-2.5 py-1 font-mono text-note text-ink hover:border-cold-2 disabled:opacity-50"
              >
                <Download className="h-3 w-3" />
                {exporting === fmt ? "…" : fmt.toUpperCase()}
                {fileCountFor(fmt) === 2 && <span className="text-[9px] opacity-60">×2</span>}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-ink-muted">
            Nút có <span className="font-mono">×2</span> lưu thêm một file{" "}
            <span className="font-mono">.meta.json</span> — định dạng đó không có chỗ nhúng xuất
            xứ, và một bản xuất không có xuất xứ thì không phải hiện vật kiểm toán.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-note">
        <div className="flex items-center gap-3">
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            placeholder={`Lọc theo ${tableMeta(selectedTable).searchColumns.join(" / ")}…`}
            className="w-72 rounded border border-hairline bg-basemap px-2.5 py-1 text-ink placeholder:text-ink-muted/60 focus:border-cold-2"
          />
          <button
            onClick={() => setShowColPicker(!showColPicker)}
            className="cursor-pointer rounded border border-hairline bg-basemap px-2 py-1 text-ink-2 hover:text-ink"
          >
            Ẩn/hiện cột ({vn(visibleCols.length)}/{vn(allCols.length)})
          </button>
          <span className="tabular-nums text-ink" aria-live="polite">
            {filterPending ? (
              // KHÔNG in số cũ trong lúc chờ: một con số đứng cạnh ô vừa gõ là một lời
              // khẳng định về chuỗi trong ô đó.
              <span className="text-ink-muted">{data === null ? "đang tải…" : "đang lọc…"}</span>
            ) : isFiltered ? (
              <>
                {vn(total)} / {vn(totalUnfiltered)} dòng khớp bộ lọc
              </>
            ) : (
              <>{vn(totalUnfiltered)} dòng</>
            )}
          </span>
          {data?.keyset && (
            <span
              className="rounded border border-hairline bg-basemap px-1.5 py-0.5 font-mono text-[10px] text-ink-muted"
              title="Bảng vượt 10.000 dòng nên phân trang bằng keyset thay vì OFFSET — DuckDB phải quét để thoả một OFFSET lớn."
            >
              keyset
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-ink-muted">
            <span>Dòng/trang:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded border border-hairline bg-basemap px-1.5 py-0.5 text-ink outline-none"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>

          <div className="flex items-center gap-1">
            <span className="mr-1 tabular-nums text-ink-muted">
              Trang {vn(page + 1)}/{vn(lastPage + 1)}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="cursor-pointer rounded border border-hairline bg-basemap p-1 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage}
              className="cursor-pointer rounded border border-hairline bg-basemap p-1 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showColPicker && (
        <div className="mb-3 rounded border border-hairline bg-basemap p-3 text-note">
          <div className="mb-2 flex items-center justify-between border-b border-hairline pb-2">
            <span className="font-semibold text-ink">
              Chọn cột hiển thị — bản xuất khớp đúng lựa chọn này
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setVisibleCols(allCols)}
                className="cursor-pointer text-cold-2 hover:underline"
              >
                Chọn tất cả
              </button>
              <button
                onClick={() => setVisibleCols(allCols.slice(0, 5))}
                className="cursor-pointer text-ink-muted hover:underline"
              >
                Chỉ 5 cột đầu
              </button>
            </div>
          </div>
          <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
            {allCols.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={visibleCols.includes(c)}
                  onChange={(e) =>
                    setVisibleCols(
                      e.target.checked
                        ? allCols.filter((x) => visibleCols.includes(x) || x === c)
                        : visibleCols.filter((col) => col !== c),
                    )
                  }
                  className="accent-cold-2"
                />
                <span className="font-mono text-[11px] text-ink-2">{c}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {exportNote && (
        <div className="mb-2 rounded border border-hairline bg-basemap p-2 text-note text-ink-2">
          {exportNote}
        </div>
      )}
      {err && (
        <div className="mb-2 rounded border border-warn/50 bg-warn/10 p-2 text-note text-warn">
          {err}
        </div>
      )}
      {loading && <div className="py-2 text-note text-ink-muted">Đang tải dữ liệu…</div>}

      {data && (
        <div className="max-h-[560px] overflow-auto rounded border border-hairline bg-basemap">
          <table className="w-full text-note">
            <thead className="sticky top-0 z-10 border-b border-hairline bg-panel">
              <tr className="text-left text-ink">
                {data.columns.map((c) => (
                  <th
                    key={c}
                    aria-sort={sort === c ? (desc ? "descending" : "ascending") : undefined}
                    className="whitespace-nowrap border-r border-hairline p-0 font-mono font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (sort === c) setDesc(!desc);
                        else {
                          setSort(c);
                          setDesc(false);
                        }
                        setPage(0);
                      }}
                      className="flex w-full cursor-pointer select-none items-center justify-between gap-1 px-2.5 py-1.5 text-left font-mono font-semibold hover:bg-basemap"
                      title={`Sắp xếp theo ${c} — ô trống luôn ở CUỐI theo cả hai chiều`}
                    >
                      <span>{c}</span>
                      {sort === c && <span>{desc ? "▼" : "▲"}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {data.rows.map((row, i) => (
                <tr key={i} className="hover:bg-panel/40">
                  {data.columns.map((c) => (
                    <Cell key={c} table={selectedTable as TableId} column={c} row={row} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}

/**
 * Một ô của bảng phẳng.
 *
 * Ô trống LUÔN in ra bằng CHỮ, và bây giờ chữ ấy nêu TÊN TRẠNG THÁI (§6.2). Một ô để trắng
 * đọc thành "0" hoặc thành "lỗi render", và cả hai đều sai.
 *
 * `row` mang cả cột bạn đồng hành mà `datamode.ts` nạp thêm, nên trạng thái đọc được kể cả
 * khi người dùng đã ẩn cột giải thích. Nếu vì lý do nào đó vẫn thiếu, hàm phân giải nói
 * "chưa phân giải được" thay vì đoán — §1.1 Rule 0.
 */
function Cell({
  table,
  column,
  row,
}: {
  table: TableId;
  column: string;
  row: Record<string, unknown>;
}) {
  const v = row[column];
  if (v === null || v === undefined) {
    const n = resolveRowNullState(table, column, row);
    return (
      <td
        title={n.explain}
        className={`whitespace-nowrap border-r border-hairline px-2.5 py-1 text-[11px] italic ${
          n.residual ? "font-semibold text-warn" : "text-ink-muted"
        }`}
      >
        <span className="inline-flex items-center gap-1">
          <StateSwatch state={n.state} />
          {n.label}
        </span>
      </td>
    );
  }

  const validity = checkRowValidity(table, column, row);
  return (
    <td
      title={validity.explain}
      className={`whitespace-nowrap border-r border-hairline px-2.5 py-1 tabular-nums ${
        validity.isInvalid ? "bg-warn/10 font-semibold text-warn" : "text-ink"
      }`}
    >
      <div className="flex items-center gap-1">
        {/* INVALID không phải một vân — nó là một giá trị CÓ MẶT, nên nó nhận một CHẤM trên
            chính giá trị đó (§6.4). `ZERO_NO_WEIGHT` mang nhãn mà không phải INVALID: chấm
            rỗng, vì không ai bảo con số đó SAI. */}
        {validity.isLabelled && (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              validity.isInvalid ? "bg-warn" : "border border-ink-muted"
            }`}
          />
        )}
        <span>{formatValue(cellOf(v))}</span>
      </div>
    </td>
  );
}

function cellOf(v: unknown): number | boolean | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return String(v);
}
