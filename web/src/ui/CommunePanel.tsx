/**
 * Phase 3 — Commune Inspector Presenter
 *
 * Implements the 9-section reading order specified in §7 PHASE3_INSPECTOR.md:
 * Summary (Header -> Hero -> Supporting) -> Evidence (Provenance, In-boundary -> Comparison Rank)
 * -> Technical details (<details> allowlist) -> CTA & States.
 */

import * as React from "react";
import type { CommuneViewModel } from "../components/atlas/inspector-types";
import type { EntitySelection } from "../state/selection";
import { FIELD_BY_ID, type FieldMeta } from "../fields";
import { formatFixed, formatValue } from "./format";
import { baseUnitPhrase } from "../units";
import { SourceBlock } from "./Source";
import { Copy, Check } from "lucide-react";
import { geometryCenter } from "./inspector-format";

export interface CommunePanelProps {
  model?: CommuneViewModel;
  onSelectEntity?: (selection: EntitySelection | null) => void;
  onFlyTo?: (v: { lng: number; lat: number; zoom: number; pitch: number; bearing: number }) => void;

  // Legacy fallback props
  code?: string;
  feature?: any;
  field?: string;
  setField?: (id: string) => void;
}

export function CommunePanel(props: CommunePanelProps) {
  const model = props.model;
  const code = model ? model.code : (props.code ?? "");
  const status = model ? model.status : props.feature ? "ready" : "not-found";
  const feature = model ? model.feature : props.feature;
  const allCommunes = model ? model.allCommunes : [];
  const activeField: FieldMeta | null = model ? model.activeField : props.field ? (FIELD_BY_ID.get(props.field) ?? null) : null;
  const activeLens = model ? model.activeLens : activeField?.lens ?? null;
  const datasetName = model ? model.datasetName : "Hà Nội";
  const onFlyTo = props.onFlyTo ?? (() => {});

  const [copied, setCopied] = React.useState(false);

  const handleCopyId = () => {
    if (!code) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── 8. Empty State / Loading / Error ───────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="p-3 text-body text-ink-muted">
        Đang nạp dữ liệu xã/phường mã <span className="font-mono">{code}</span>…
      </div>
    );
  }

  if (status === "not-found" || !feature) {
    return (
      <div className="p-3 text-body leading-snug text-ink-2">
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <span className="font-mono text-note text-ink-muted">Mã xã: {code}</span>
        </div>
        <p className="pt-3 text-body text-ink">
          Không tìm thấy xã/phường trong bộ dữ liệu đang mở ({datasetName}).
        </p>
        <p className="pt-1 text-note text-ink-muted">
          Mã 5 chữ số đúng quy chuẩn nhưng không có trong danh mục hành chính của bộ này.
        </p>
      </div>
    );
  }

  const p = feature.properties ?? {};
  const communeName = str(p["commune_name"]) ?? "Xã/Phường không tên";
  const communeKind = str(p["commune_kind"]) ?? "Xã/Phường";
  const provinceName = str(p["province_name"]) ?? datasetName;
  const validFrom = str(p["valid_from"]);
  const qualityFlag = str(p["quality_flag"]);
  const viewCenter = geometryCenter(feature.geometry);

  // Active field values
  const isDirectCommuneField = activeField?.readAs === "commune";
  const heroValue = isDirectCommuneField && activeField ? (p[activeField.column] ?? null) : null;
  const isPortsPer10k = activeField?.id === "commune:ports_per_10k_pop";

  // Supporting metrics calculation based on active lens
  const supportingFacts = getCommuneSupportingFacts(activeLens, activeField?.column, p);

  // Comparison rank among communes
  const rankResult = computeCommuneRank(activeField, heroValue, allCommunes);

  return (
    <div className="text-title">
      {/* ── 1. HEADER ──────────────────────────────────────────────────────── */}
      <header className="border-b border-hairline px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="eyebrow">{communeKind.toUpperCase()}</div>
            <h2 className="text-heading font-semibold leading-tight text-ink">
              {communeName}
            </h2>
          </div>
          <button
            onClick={handleCopyId}
            title="Sao chép mã xã/phường"
            className="flex shrink-0 items-center gap-1 rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-note text-ink-muted hover:border-ink-2 hover:text-ink cursor-pointer"
          >
            <span>{code}</span>
            {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>

        <div className="pt-1 text-body text-ink-muted">
          {[
            provinceName,
            validFrom ? `Hiệu lực VNSDI: ${validFrom}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>

        {qualityFlag && (
          <div className="mt-2 rounded-xs border border-amber-500/20 bg-amber-500/10 p-2 text-body leading-snug text-ink">
            <span className="text-amber-500 font-bold">⚠ Ghi chú chất lượng: </span>
            {qualityFlag}
          </div>
        )}
      </header>

      {/* ── 2. HERO METRIC ─────────────────────────────────────────────────── */}
      <div className="border-b border-hairline px-3 py-3">
        {isDirectCommuneField && activeField ? (
          <div>
            <div className="text-body font-medium text-ink-2">{activeField.label}</div>
            <div className="text-readout font-semibold leading-none pt-1">
              {heroValue === null ? (
                <span className="text-heading italic text-ink-muted">không có số liệu</span>
              ) : (
                <>
                  {formatValue(heroValue as any, activeField)}
                  <span className="pl-1.5 text-body font-normal text-ink-muted">
                    {baseUnitPhrase(activeField.unit)}
                  </span>
                </>
              )}
            </div>

            {isPortsPer10k && (
              <div className="mt-1.5 flex items-center gap-2 text-note text-ink-2 bg-basemap/30 px-2 py-1 rounded-xs">
                <span>Tử số: <strong>{formatValue(p["n_ports"] ?? null)} cổng</strong></span>
                <span>÷</span>
                <span>Mẫu số: <strong>{formatValue(p["population"] ?? null)} người</strong></span>
              </div>
            )}

            <div className="pt-1 text-body text-ink-muted">
              {heroValue === null
                ? "Giá trị không xác định hoặc thiếu dữ liệu cho xã/phường này."
                : activeField.desc}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-body text-ink-muted italic">
              Lens hiện tại không có giá trị trực tiếp ở cấp xã/phường.
            </div>
            <div className="pt-1 text-note text-ink-muted">
              Trường phân tích đang chọn ({activeField?.label ?? "khác"}) áp dụng ở cấp độ đối tượng khác.
            </div>
          </div>
        )}
      </div>

      {/* ── 3. SUPPORTING METRICS ──────────────────────────────────────────── */}
      {supportingFacts.length > 0 && (
        <div className={`grid grid-cols-${supportingFacts.length} border-b border-hairline`}>
          {supportingFacts.map((fact) => (
            <Tile
              key={fact.label}
              label={fact.label}
              value={fact.value}
              missingText={fact.missingText}
              hint={fact.hint}
            />
          ))}
        </div>
      )}

      {/* ── 4. EVIDENCE ────────────────────────────────────────────────────── */}
      <section className="border-b border-hairline px-3 py-2.5">
        <h3 className="text-body font-semibold tracking-[0.05em] text-ink-2 mb-2">
          BẰNG CHỨNG
        </h3>

        {activeLens === "demand" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Dân số VNSDI:</strong> {formatValue(p["population"] ?? null)} người
              {p["pop_source"] ? ` (nguồn ${str(p["pop_source"])})` : ""}.
            </p>
            {p["population_wp"] !== null && p["population_wp"] !== undefined && (
              <p className="text-ink-muted text-note">
                Dân số WorldPop ước tính: {formatValue(p["population_wp"])} người (tỉ lệ đối chiếu anchor: {p["anchor_ratio"] ? formatFixed(Number(p["anchor_ratio"]), 2) : "—"}).
              </p>
            )}
          </div>
        )}

        {activeLens === "supply" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Hạ tầng trong ranh giới:</strong> {formatValue(p["n_stations"] ?? null)} trạm sạc công cộng
              với {formatValue(p["n_ports"] ?? null)} cổng lắp đặt
              ({formatValue(p["power_kw_site"] ?? null)} kW).
            </p>
            <p className="text-ink-muted text-note">
              Tổng số trạm và cổng chỉ tính các trạm công cộng nằm hoàn toàn trong địa giới hành chính xã/phường.
            </p>
          </div>
        )}

        {activeLens === "access" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Khoảng cách gia quyền theo dân:</strong>{" "}
              {p["dist_station_m_pop_weighted"] !== null && p["dist_station_m_pop_weighted"] !== undefined
                ? `${formatValue(p["dist_station_m_pop_weighted"])} m`
                : "Không có tuyến đường mạng hợp lệ"}.
            </p>
            <p className="text-ink-muted text-note">
              Khoảng cách mạng đường thực tế từ các khu dân cư tới trạm sạc gần nhất, tính trọng số theo mật độ người dân.
            </p>
          </div>
        )}

        {activeLens === "utilization" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Mức sử dụng gia quyền số cổng:</strong>{" "}
              {p["util_mean_port_weighted"] !== null && p["util_mean_port_weighted"] !== undefined
                ? `${formatFixed(Number(p["util_mean_port_weighted"]) * 100, 1)}%`
                : "Không có trạm đo lường nào trong xã"}.
            </p>
            <p className="text-ink-muted text-note">
              Trung bình mức sử dụng 30 ngày của các trạm trong xã, có tính trọng số theo quy mô số cổng sạc.
            </p>
          </div>
        )}

        {activeLens === "opportunity" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Cung trên dân cư:</strong> {formatValue(p["ports_per_10k_pop"] ?? null)} cổng/10.000 dân.
            </p>
            <p className="text-ink-muted text-note">
              Cấp xã/phường không có quy tắc biên sàng lọc trực tiếp; dữ liệu đóng vai trò bối cảnh phân bổ.
            </p>
          </div>
        )}
      </section>

      {/* ── 5. COMPARISON ──────────────────────────────────────────────────── */}
      {rankResult && (
        <section className="border-b border-hairline px-3 py-2 bg-basemap/20">
          <div className="text-body font-medium text-ink-2">Vị trí so sánh trong toàn tỉnh</div>
          <div className="pt-1 text-body text-ink">
            Xếp hạng <strong>#{rankResult.rank}</strong> trên {rankResult.totalWithVal} xã/phường có dữ liệu
            {rankResult.tieCount > 1 ? ` (đồng hạng với ${rankResult.tieCount - 1} xã khác)` : ""}
            {rankResult.missingCount > 0 ? ` · ${rankResult.missingCount} xã thiếu số liệu` : ""}.
          </div>
          <p className="pt-0.5 text-note text-ink-muted">
            {rankResult.polarityText}
          </p>
        </section>
      )}

      {/* ── 6. TECHNICAL DETAILS (Disclosure) ───────────────────────────────── */}
      <details className="border-b border-hairline group">
        <summary className="cursor-pointer px-3 py-2 text-body font-medium text-ink-2 hover:bg-basemap/50 transition-colors">
          Chi tiết kỹ thuật
        </summary>
        <div className="bg-basemap/10 px-3 pb-3 pt-1 space-y-3">
          {/* Identity & Version */}
          <div>
            <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Hành chính & Phiên bản</div>
            <div className="divide-y divide-hairline text-body">
              <TechRow k="Mã xã/phường (VNSDI)" v={code} />
              <TechRow k="Loại đơn vị" v={communeKind} />
              <TechRow k="Tên tỉnh/thành" v={provinceName} />
              <TechRow k="Mã tỉnh/thành" v={str(p["province_code"])} />
              <TechRow k="Hiệu lực ranh giới" v={validFrom} />
              <TechRow k="Ngày xuất bản" v={str(p["published"])} />
            </div>
          </div>

          {/* Boundary & Area */}
          <div>
            <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Ranh giới & Diện tích</div>
            <div className="divide-y divide-hairline text-body">
              <TechRow k="Diện tích công bố (area_km2)" v={p["area_km2"] != null ? `${formatValue(p["area_km2"])} km²` : null} />
              <TechRow k="Diện tích hình học (area_km2_geom)" v={p["area_km2_geom"] != null ? `${formatValue(p["area_km2_geom"])} km²` : null} />
              <TechRow k="Cờ chất lượng (quality_flag)" v={qualityFlag ?? "Không có lỗi phát hiện"} />
            </div>
          </div>

          {/* Population Provenance */}
          <div>
            <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Nguồn gốc dân số</div>
            <div className="divide-y divide-hairline text-body">
              <TechRow k="Dân số chính thức (VNSDI)" v={p["population"]?.toString()} />
              <TechRow k="Dân số WorldPop ước tính" v={p["population_wp"]?.toString()} />
              <TechRow k="Tỉ lệ đối chiếu (anchor_ratio)" v={p["anchor_ratio"] != null ? formatFixed(Number(p["anchor_ratio"]), 3) : null} />
              <TechRow k="Nguồn dân số" v={str(p["pop_source"])} />
            </div>
          </div>

          {/* Source block */}
          <div className="pt-2 border-t border-hairline">
            <SourceBlock manifest={model?.manifest ?? null} />
          </div>
        </div>
      </details>

      {/* ── 7. CTA ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 px-3 py-2.5 bg-basemap/30">
        {viewCenter && <button
          onClick={() => {
            onFlyTo({
              lng: viewCenter[0],
              lat: viewCenter[1],
              zoom: 13,
              pitch: 0,
              bearing: 0,
            });
          }}
          className="cursor-pointer rounded-xs border border-hairline bg-panel px-2.5 py-1 text-body font-medium text-ink hover:border-ink hover:bg-basemap transition-colors"
        >
          Phóng tới xã/phường
        </button>}
      </div>
    </div>
  );
}

function getCommuneSupportingFacts(lens: string | null, activeColumn: string | undefined, p: Record<string, unknown>) {
  const facts: Array<{ label: string; value: string | null; missingText: string; hint: string }> = [];

  if (lens === "demand") {
    if (activeColumn !== "population") {
      facts.push({
        label: "Dân số",
        value: p["population"] != null ? `${formatValue(p["population"] as any)} ng` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng dân số xã/phường",
      });
    }
    if (activeColumn !== "pop_density_ppkm2") {
      facts.push({
        label: "Mật độ",
        value: p["pop_density_ppkm2"] != null ? `${formatValue(p["pop_density_ppkm2"] as any)} ng/km²` : null,
        missingText: "chưa có số liệu",
        hint: "Mật độ dân số trên diện tích xã",
      });
    }
    if (activeColumn !== "area_km2") {
      facts.push({
        label: "Diện tích",
        value: p["area_km2"] != null ? `${formatValue(p["area_km2"] as any)} km²` : null,
        missingText: "—",
        hint: "Diện tích địa giới xã/phường",
      });
    }
  } else if (lens === "supply") {
    if (activeColumn !== "n_stations") {
      facts.push({
        label: "Số trạm",
        value: p["n_stations"] != null ? `${p["n_stations"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Số trạm sạc công cộng trong xã",
      });
    }
    if (activeColumn !== "n_ports") {
      facts.push({
        label: "Số cổng",
        value: p["n_ports"] != null ? `${p["n_ports"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng số cổng sạc đã lắp",
      });
    }
    if (activeColumn !== "ports_per_10k_pop") {
      facts.push({
        label: "Cổng/10k dân",
        value: p["ports_per_10k_pop"] != null ? `${formatValue(p["ports_per_10k_pop"] as any)}` : null,
        missingText: "—",
        hint: "Số cổng sạc trên 10.000 dân",
      });
    }
  } else if (lens === "access") {
    if (activeColumn !== "dist_station_m_pop_weighted") {
      facts.push({
        label: "Cự ly theo dân",
        value: p["dist_station_m_pop_weighted"] != null ? `${formatValue(p["dist_station_m_pop_weighted"] as any)} m` : null,
        missingText: "—",
        hint: "Khoảng cách tới trạm gia quyền theo dân số",
      });
    }
    if (activeColumn !== "population") {
      facts.push({
        label: "Dân số",
        value: p["population"] != null ? `${formatValue(p["population"] as any)} ng` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng dân số xã",
      });
    }
    if (activeColumn !== "ports_per_10k_pop") {
      facts.push({
        label: "Cổng/10k dân",
        value: p["ports_per_10k_pop"] != null ? `${formatValue(p["ports_per_10k_pop"] as any)}` : null,
        missingText: "—",
        hint: "Tỉ lệ cổng trên 10.000 dân",
      });
    }
  } else if (lens === "utilization") {
    if (activeColumn !== "util_mean_port_weighted") {
      facts.push({
        label: "Util xã",
        value: p["util_mean_port_weighted"] != null ? `${formatFixed(Number(p["util_mean_port_weighted"]) * 100, 1)}%` : null,
        missingText: "—",
        hint: "Mức sử dụng trung bình các trạm trong xã",
      });
    }
    if (activeColumn !== "n_stations") {
      facts.push({
        label: "Số trạm",
        value: p["n_stations"] != null ? `${p["n_stations"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Số trạm trong xã",
      });
    }
    if (activeColumn !== "n_ports") {
      facts.push({
        label: "Số cổng",
        value: p["n_ports"] != null ? `${p["n_ports"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Số cổng trong xã",
      });
    }
  } else {
    // Opportunity / default context
    if (activeColumn !== "ports_per_10k_pop") {
      facts.push({
        label: "Cổng/10k dân",
        value: p["ports_per_10k_pop"] != null ? `${formatValue(p["ports_per_10k_pop"] as any)}` : null,
        missingText: "—",
        hint: "Mức độ đáp ứng cung/cầu hiện tại",
      });
    }
    if (activeColumn !== "n_ports") {
      facts.push({
        label: "Số cổng",
        value: p["n_ports"] != null ? `${p["n_ports"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng số cổng sạc hiện có",
      });
    }
    if (activeColumn !== "population") {
      facts.push({
        label: "Dân số",
        value: p["population"] != null ? `${formatValue(p["population"] as any)} ng` : null,
        missingText: "chưa có số liệu",
        hint: "Dân số toàn xã",
      });
    }
  }

  return facts.slice(0, 3);
}

function computeCommuneRank(activeField: FieldMeta | null, val: unknown, allCommunes: any[]) {
  if (!activeField || activeField.readAs !== "commune" || typeof val !== "number" || Number.isNaN(val) || allCommunes.length === 0) {
    return null;
  }

  const col = activeField.column;
  const validValues: number[] = [];
  let missingCount = 0;

  for (const c of allCommunes) {
    const v = c.properties?.[col];
    if (typeof v === "number" && !Number.isNaN(v)) {
      validValues.push(v);
    } else {
      missingCount++;
    }
  }

  if (validValues.length === 0) return null;

  // Polarity: if high-bad, lower is better; if high-good (default), higher is better
  const isHighBad = activeField.polarity === "high-bad";
  validValues.sort((a, b) => (isHighBad ? a - b : b - a));

  let rank = 1;
  let tieCount = 0;
  for (const v of validValues) {
    if (isHighBad ? v < val : v > val) {
      rank++;
    } else if (v === val) {
      tieCount++;
    }
  }

  const polarityText = isHighBad
    ? "Thứ hạng theo thứ tự giá trị thấp hơn."
    : "Thứ hạng theo thứ tự giá trị cao hơn.";

  return {
    rank,
    totalWithVal: validValues.length,
    missingCount,
    tieCount,
    polarityText,
  };
}

function Tile({
  label,
  value,
  missingText,
  hint,
}: {
  label: string;
  value: string | null;
  missingText: string;
  hint: string;
}) {
  return (
    <div className="border-r border-hairline px-2 py-2 last:border-r-0" title={hint}>
      <div className="text-heading tabular-nums leading-tight font-semibold text-ink">
        {value === null ? <span className="text-note italic text-ink-muted">{missingText}</span> : value}
      </div>
      <div className="pt-0.5 text-note leading-tight text-ink-muted">{label}</div>
    </div>
  );
}

function TechRow({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 text-body">
      <span className="truncate text-ink-muted">{k}</span>
      <span className="font-mono text-ink-2 tabular-nums">{v ?? "—"}</span>
    </div>
  );
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
