/**
 * Phase 3 — H3 Cell Inspector Presenter
 *
 * Implements the 9-section reading order specified in §6 PHASE3_INSPECTOR.md:
 * Summary (Header -> Hero -> Supporting) -> Evidence (Lens breakdown -> Comparison)
 * -> Technical details (<details> allowlist) -> CTA & States.
 */

import * as React from "react";
import type { H3CellViewModel } from "../components/atlas/inspector-types";
import { communeSelection, type EntitySelection } from "../state/selection";
import { FIELD_BY_ID, constantShort, type FieldMeta } from "../fields";
import { formatFixed, formatValue } from "./format";
import { baseUnitPhrase } from "../units";
import { SourceBlock } from "./Source";
import { Copy, Check } from "lucide-react";
import { networkDistanceMissingText, screeningThresholdM } from "./inspector-format";

export interface CellPanelProps {
  model?: H3CellViewModel;
  onSelectEntity?: (selection: EntitySelection | null) => void;
  onFlyTo?: (v: { lng: number; lat: number; zoom: number; pitch: number; bearing: number }) => void;

  // Legacy fallback props
  h3?: string;
  row?: any;
  loading?: boolean;
  error?: string | null;
  field?: string;
  setField?: (id: string) => void;
}

export function CellPanel(props: CellPanelProps) {
  const model = props.model;
  const h3 = model ? model.id : (props.h3 ?? "");
  const status = model ? model.status : props.loading ? "loading" : props.error ? "error" : props.row ? "ready" : "not-found";
  const error = model ? model.error : props.error;
  const row = model ? model.row : props.row;
  const occ = model ? model.occ : null;
  const activeField: FieldMeta | null = model ? model.activeField : props.field ? (FIELD_BY_ID.get(props.field) ?? null) : null;
  const activeLens = model ? model.activeLens : activeField?.lens ?? null;
  const datasetName = model ? model.datasetName : "Hà Nội";
  const onSelectEntity = props.onSelectEntity ?? (() => {});
  const onFlyTo = props.onFlyTo ?? (() => {});

  const [copied, setCopied] = React.useState(false);

  const handleCopyId = () => {
    if (!h3) return;
    void navigator.clipboard.writeText(h3).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── 8. Empty State / Loading / Error ───────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="p-3 text-body text-ink-muted">
        Đang nạp dữ liệu ô H3 <span className="font-mono">{h3}</span>…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="p-3 text-body leading-snug text-ink-2">
        <p className="font-medium text-warn">Lỗi đọc dữ liệu ô H3:</p>
        <p className="mt-1 font-mono text-note text-ink-muted">{error}</p>
      </div>
    );
  }

  if (status === "not-found" || !row) {
    return (
      <div className="p-3 text-body leading-snug text-ink-2">
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <span className="font-mono text-note text-ink-muted">{h3}</span>
        </div>
        <p className="pt-3 text-body text-ink">
          Ô này không thuộc lưới đang mở ({datasetName}).
        </p>
        <p className="pt-1 text-note text-ink-muted">
          Mã H3 r8 hợp lệ nhưng không nằm trong phạm vi không gian của bộ dữ liệu này.
        </p>
      </div>
    );
  }

  const cellState = String(row["cell_state"] ?? "");
  const isBorder = cellState === "BORDER";
  const communeName = str(row["commune_name"]);
  const communeCode = str(row["commune_code"]);
  const areaFrac = num(row["area_frac"]);
  const communeAreaFrac = num(row["commune_area_frac"]);
  const thresholdM = screeningThresholdM(model?.communeKind);
  const thresholdLabel = thresholdM === null
    ? "ngưỡng theo loại xã/phường"
    : `${thresholdM.toLocaleString("vi-VN")} m cho ${model?.communeKind}`;

  // Is active field directly readable on Cell?
  const isDirectCellField = activeField?.readAs === "cell";
  const heroValue = isDirectCellField && activeField ? (row[activeField.column] ?? null) : null;

  // Supporting metrics calculation based on lens
  const supportingFacts = getCellSupportingFacts(activeLens, activeField?.column, row);

  return (
    <div className="text-title">
      {/* ── 1. HEADER ──────────────────────────────────────────────────────── */}
      <header className="border-b border-hairline px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="eyebrow">Ô H3 RESOLUTION 8</div>
            <h2 className="text-heading font-semibold leading-tight text-ink">
              {communeName ?? "Ô không rõ xã/phường"}
            </h2>
          </div>
          <button
            onClick={handleCopyId}
            title="Sao chép mã H3"
            className="flex shrink-0 items-center gap-1 rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-note text-ink-muted hover:border-ink-2 hover:text-ink cursor-pointer"
          >
            <span>{h3}</span>
            {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>

        <div className="pt-1 text-body text-ink-muted">
          {[
            constantShort(cellState) || cellState,
            isBorder && areaFrac !== null ? `phần trong tỉnh ${pct1(areaFrac)}` : null,
            isBorder && communeAreaFrac !== null ? `trong xã ${pct1(communeAreaFrac)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </header>

      {/* ── 2. HERO METRIC ─────────────────────────────────────────────────── */}
      <div className="border-b border-hairline px-3 py-3">
        {isDirectCellField && activeField ? (
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
            <div className="pt-1 text-body text-ink-muted">
              {heroValue === null
                ? "Giá trị không xác định hoặc không áp dụng cho ô này."
                : activeField.desc}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-body text-ink-muted italic">
              Lens hiện tại không có giá trị trực tiếp ở cấp ô H3.
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
              <strong>Dân số:</strong> {formatValue(row["population"] ?? null)} người
              {row["pop_source"] ? ` (nguồn ${str(row["pop_source"])})` : ""}.
            </p>
            <p className="text-ink-muted text-note">
              Mật độ dân cư được tính trên diện tích thực tế của ô trong địa giới tỉnh.
            </p>
          </div>
        )}

        {activeLens === "supply" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Hiện trạng cung:</strong> {formatValue(row["n_stations"] ?? null)} trạm sạc công cộng
              với {formatValue(row["n_ports"] ?? null)} cổng lắp đặt
              ({formatValue(row["power_kw_site"] ?? null)} kW).
            </p>
            <p className="text-ink-muted text-note">
              Số đếm chỉ bao gồm các trạm sạc công cộng, không tính điểm sạc cá nhân 1 cổng AC.
            </p>
          </div>
        )}

        {activeLens === "access" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Khoảng cách tới trạm:</strong>{" "}
              {row["dist_station_network_m"] !== null && row["dist_station_network_m"] !== undefined
                ? `${formatValue(row["dist_station_network_m"])} m`
                : "Không có đường kết nối mạng"}
              {row["network_reachable"] === false ? " (ngoài tầm mạng lưới)" : ""}.
            </p>
            {row["dist_station_euclid_m"] !== null && row["dist_station_euclid_m"] !== undefined && (
              <p className="text-ink-muted text-note">
                Khoảng cách đường chim bay: {formatValue(row["dist_station_euclid_m"])} m (độ lệch đường đi detour: {row["detour_ratio"] ? formatFixed(Number(row["detour_ratio"]), 2) : "—"}).
              </p>
            )}
          </div>
        )}

        {activeLens === "utilization" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Mức sử dụng ô:</strong>{" "}
              {row["util_cell"] !== null && row["util_cell"] !== undefined
                ? `${formatFixed(Number(row["util_cell"]) * 100, 1)}%`
                : "Chưa có trạm đo lường đóng góp"}
              {row["n_stations_measured"] !== null && row["n_stations_measured"] !== undefined
                ? ` (${row["n_stations_measured"]} trạm có đo lường)`
                : ""}.
            </p>
            <p className="text-ink-muted text-note">
              Mức sử dụng ô là trung bình gia quyền theo số cổng của các trạm đóng góp trong ô.
            </p>
          </div>
        )}

        {activeLens === "opportunity" && (
          <div className="space-y-1.5 text-body text-ink">
            <p>
              <strong>Sàng lọc cơ hội:</strong> Biên khoảng cách {formatValue(row["screen_margin_m"] ?? null)} m
              ({thresholdLabel}).
            </p>
            <p className="text-ink-muted text-note">
              Quyết định sàng lọc {str(row["screen_decision"]) ?? "—"} là kết quả áp dụng quy tắc cơ bản và ngoại lệ.
            </p>
          </div>
        )}
      </section>

      {/* ── 5. COMPARISON ──────────────────────────────────────────────────── */}
      {isDirectCellField && activeField?.kind === "numeric" && heroValue !== null && (
        <section className="border-b border-hairline px-3 py-2 bg-basemap/20">
          <div className="text-body font-medium text-ink-2">So sánh với phân phối lưới</div>
          <div className="pt-1 text-body text-ink">
            Giá trị ô: <strong>{formatValue(heroValue as any, activeField)} {baseUnitPhrase(activeField.unit)}</strong> trong bộ dữ liệu đang mở.
          </div>
          {activeField.id === "dist_station_network_m" && (
            <p className="pt-0.5 text-note text-ink-muted">
              Ngưỡng quy tắc phục vụ: 2.000 m (bán kính mục tiêu mạng lưới).
            </p>
          )}
          {activeField.id === "screen_margin_m" && (
            <p className="pt-0.5 text-note text-ink-muted">
              Biên đã trừ {thresholdLabel}; 0 m là ranh giới của quy tắc cơ sở.
            </p>
          )}
        </section>
      )}

      {/* ── 6. TECHNICAL DETAILS (Disclosure) ───────────────────────────────── */}
      <details className="border-b border-hairline group">
        <summary className="cursor-pointer px-3 py-2 text-body font-medium text-ink-2 hover:bg-basemap/50 transition-colors">
          Chi tiết kỹ thuật
        </summary>
        <div className="bg-basemap/10 px-3 pb-3 pt-1 space-y-3">
          {/* Geometry & Membership */}
          <div>
            <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Không gian & Ranh giới</div>
            <div className="divide-y divide-hairline text-body">
              <TechRow k="Mã H3 r8" v={h3} />
              <TechRow k="Tỉnh/Thành phố" v={str(row["province_code"])} />
              <TechRow k="Toạ độ tâm (lat, lng)" v={`${num(row["lat"])?.toFixed(5) ?? "—"}, ${num(row["lng"])?.toFixed(5) ?? "—"}`} />
              <TechRow k="Diện tích ô trong tỉnh" v={row["area_km2"] != null ? `${formatFixed(Number(row["area_km2"]), 4)} km²` : null} />
              <TechRow k="Tỉ lệ diện tích trong tỉnh" v={areaFrac !== null ? pct1(areaFrac) : null} />
              <TechRow k="Trạng thái ô" v={constantShort(cellState) || cellState} />
              <TechRow k="Mã xã/phường" v={communeCode} />
              <TechRow k="Tên xã/phường" v={communeName} />
              <TechRow k="Tỉ lệ diện tích trong xã" v={communeAreaFrac !== null ? pct1(communeAreaFrac) : null} />
            </div>
          </div>

          {/* Diagnostics & Provenance */}
          <div>
            <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Nguồn gốc & Viễn trắc</div>
            <div className="divide-y divide-hairline text-body">
              <TechRow k="Nguồn dân số" v={str(row["pop_source"])} />
              <TechRow k="Kết nối mạng đường" v={row["network_reachable"] === true ? "Có" : row["network_reachable"] === false ? "Không" : null} />
              <TechRow k="Cấp bằng chứng khoảng cách" v={str(row["evidence_grade_distance"])} />
              <TechRow k="Độ lệch neo vào mạng đường" v={num(row["road_access_offset_m"]) !== null ? `${formatValue(row["road_access_offset_m"])} m` : null} />
              {occ && (
                <TechRow
                  k="Trạng thái viễn trắc ô"
                  v={occ.joinable ? `${occ.nStationsWithOcc} trạm có dữ liệu` : "Không hỗ trợ nối trạm"}
                />
              )}
              {model?.occError && <TechRow k="Trạng thái viễn trắc ô" v="Không đọc được dữ liệu phụ" />}
            </div>
          </div>

          <div className="pt-2 text-note text-ink-muted border-t border-hairline">
            Lưới H3 Resolution 8 có diện tích chuẩn ~0,737 km² và cạnh lục giác ~461 m.
          </div>

          {/* Source block */}
          <div className="pt-2 border-t border-hairline">
            <SourceBlock manifest={model?.manifest ?? null} cell={row} occ={occ} />
          </div>
        </div>
      </details>

      {/* ── 7. CTA ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 px-3 py-2.5 bg-basemap/30">
        {communeCode && (
          <button
            onClick={() => {
              const sel = communeSelection(communeCode, model?.datasetId);
              if (sel) onSelectEntity(sel);
            }}
            className="cursor-pointer rounded-xs border border-hairline bg-panel px-2.5 py-1 text-body font-medium text-ink hover:border-ink hover:bg-basemap transition-colors"
          >
            Xem xã/phường
          </button>
        )}
        {num(row["lat"]) !== null && num(row["lng"]) !== null && (
          <button
            onClick={() => {
              onFlyTo({
                lat: num(row["lat"])!,
                lng: num(row["lng"])!,
                zoom: 14,
                pitch: 0,
                bearing: 0,
              });
            }}
            className="cursor-pointer rounded-xs border border-hairline bg-panel px-2.5 py-1 text-body font-medium text-ink hover:border-ink hover:bg-basemap transition-colors"
          >
            Căn giữa ô
          </button>
        )}
      </div>
    </div>
  );
}

function getCellSupportingFacts(lens: string | null, activeColumn: string | undefined, row: Record<string, unknown>) {
  const facts: Array<{ label: string; value: string | null; missingText: string; hint: string }> = [];

  if (lens === "demand") {
    if (activeColumn !== "population") {
      facts.push({
        label: "Dân số",
        value: row["population"] != null ? `${formatValue(row["population"] as any)} ng` : null,
        missingText: "chưa có số liệu",
        hint: "Dân số ước tính trong ô",
      });
    }
    if (activeColumn !== "pop_density_ppkm2") {
      facts.push({
        label: "Mật độ",
        value: row["pop_density_ppkm2"] != null ? `${formatValue(row["pop_density_ppkm2"] as any)} ng/km²` : null,
        missingText: "chưa có số liệu",
        hint: "Mật độ dân số trên diện tích ô",
      });
    }
    if (activeColumn !== "n_apartment") {
      facts.push({
        label: "Chung cư",
        value: row["n_apartment"] != null ? `${row["n_apartment"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Số toà chung cư trong ô",
      });
    }
  } else if (lens === "supply") {
    if (activeColumn !== "n_stations") {
      facts.push({
        label: "Số trạm",
        value: row["n_stations"] != null ? `${row["n_stations"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Số trạm sạc công cộng trong ô",
      });
    }
    if (activeColumn !== "n_ports") {
      facts.push({
        label: "Số cổng",
        value: row["n_ports"] != null ? `${row["n_ports"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng số cổng sạc đã lắp",
      });
    }
    if (activeColumn !== "power_kw_site") {
      facts.push({
        label: "Công suất",
        value: row["power_kw_site"] != null ? `${formatValue(row["power_kw_site"] as any)} kW` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng công suất trạm sạc",
      });
    }
  } else if (lens === "access") {
    if (activeColumn !== "dist_station_network_m") {
      facts.push({
        label: "Khoảng cách",
        value: row["dist_station_network_m"] != null ? `${formatValue(row["dist_station_network_m"] as any)} m` : null,
        missingText: networkDistanceMissingText(row["network_reachable"]),
        hint: "Khoảng cách mạng đường tới trạm gần nhất",
      });
    }
    if (activeColumn !== "population") {
      facts.push({
        label: "Dân số",
        value: row["population"] != null ? `${formatValue(row["population"] as any)} ng` : null,
        missingText: "không tính được",
        hint: "Dân số chịu khoảng cách tiếp cận này",
      });
    }
    if (activeColumn !== "detour_ratio") {
      facts.push({
        label: "Detour ratio",
        value: row["detour_ratio"] != null ? formatFixed(Number(row["detour_ratio"]), 2) : null,
        missingText: "—",
        hint: "Tỉ số cự ly mạng đường / chim bay",
      });
    }
  } else if (lens === "utilization") {
    if (activeColumn !== "util_cell") {
      facts.push({
        label: "Util ô",
        value: row["util_cell"] != null ? `${formatFixed(Number(row["util_cell"]) * 100, 1)}%` : null,
        missingText: "—",
        hint: "Mức sử dụng trung bình các trạm trong ô",
      });
    }
    if (activeColumn !== "n_stations_measured") {
      facts.push({
        label: "Trạm đo lường",
        value: row["n_stations_measured"] != null ? `${row["n_stations_measured"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Số trạm có telemetry đo lường",
      });
    }
    if (activeColumn !== "n_stations") {
      facts.push({
        label: "Tổng trạm",
        value: row["n_stations"] != null ? `${row["n_stations"]}` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng số trạm trong ô",
      });
    }
  } else {
    // Opportunity / default
    if (activeColumn !== "screen_margin_m") {
      facts.push({
        label: "Biên sàng lọc",
        value: row["screen_margin_m"] != null ? `${formatValue(row["screen_margin_m"] as any)} m` : null,
        missingText: "—",
        hint: "Khoảng cách sau khi trừ ngưỡng theo loại xã/phường",
      });
    }
    if (activeColumn !== "pop_beyond_2km") {
      facts.push({
        label: "Dân ngoài 2km",
        value: row["pop_beyond_2km"] != null ? `${formatValue(row["pop_beyond_2km"] as any)} ng` : null,
        missingText: row["network_reachable"] === false ? "không chạy được quy tắc" : "chưa có số liệu",
        hint: "Dân số ở khu vực ngoài bán kính 2 km",
      });
    }
    if (activeColumn !== "population") {
      facts.push({
        label: "Dân số",
        value: row["population"] != null ? `${formatValue(row["population"] as any)} ng` : null,
        missingText: "chưa có số liệu",
        hint: "Tổng dân số ô",
      });
    }
  }

  return facts.slice(0, 3);
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

const pct1 = (v: number) =>
  v.toLocaleString("vi-VN", { style: "percent", maximumFractionDigits: 1 });

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
