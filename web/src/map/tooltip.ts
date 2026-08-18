/**
 * Tooltip metric engine for MapView — DESIGN.md §3b, §4d, §8.
 *
 * Single source of truth for micro-tooltips when hovering any entity on the map
 * (H3 cells, charging stations, communes, road segments, POIs).
 *
 * Driven by the active Lens configuration and explicit about null, missing,
 * unreachable, and abnormal operational states.
 */

import type { CommuneCollection, CommuneFeature, GridCell, RoadSeg, StationPoint } from "../data/queries";
import type { PoiFeature } from "../data/poi";
import { POI_GROUPS } from "../data/poi";
import { constantShort, lensOfField, type FieldMeta } from "../fields";
import { DOW_FULL, dowOf, hourOf } from "../state/types";
import { baseUnitPhrase } from "../units";
import { isAbnormal } from "../viz/station-status";
import type { Scale } from "../viz/palette";

export interface TooltipContext {
  object: unknown;
  layerId?: string | null;
  field: FieldMeta;
  t: number;
  scale: Scale | null;
  stations?: StationPoint[];
  communes?: CommuneCollection | null;
}

function fmtNum(v: unknown, maxDigits = 1): string {
  return typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("vi-VN", { maximumFractionDigits: maxDigits })
    : "—";
}

function fmtDist(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "Không xác định";
  if (Math.abs(m) >= 1000) {
    return `${(m / 1000).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`;
  }
  return `${Math.round(m).toLocaleString("vi-VN")} m`;
}

function fmtPct(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Format the active measure from its registry unit; never infer a unit from the lens. */
function fmtFieldValue(value: unknown, field: FieldMeta): string {
  if (value === null || value === undefined) return "Không có giá trị";
  if (field.kind === "categorical") return constantShort(String(value));
  if (field.kind === "bool") return value === true ? "có" : value === false ? "không" : "Không có giá trị";
  if (typeof value !== "number" || !Number.isFinite(value)) return "Không có giá trị";
  if (field.unit?.kind === "ratio" || field.unit?.kind === "pctl") return fmtPct(value);
  if (field.unit?.kind === "m") return fmtDist(value);
  const phrase = baseUnitPhrase(field.unit);
  return `${fmtNum(value)}${phrase ? ` ${phrase}` : ""}`;
}

function opStatusLabel(status: string | undefined): string {
  if (!status) return "Hoạt động bình thường";
  const s = status.toUpperCase();
  if (s === "MAINTENANCE") return "BẢO TRÌ (Tạm ngưng)";
  if (s === "OUT_OF_SERVICE") return "NGỪNG HOẠT ĐỘNG";
  if (s === "OPERATIONAL") return "Đang vận hành";
  return constantShort(status);
}

/**
 * Returns structured tooltip text for Deck.gl MapboxOverlay.
 */
export function getMapTooltip(ctx: TooltipContext): { text: string } | null {
  const { object, layerId, field, t } = ctx;
  if (!object) return null;

  const lens = field?.lens ?? (field?.id ? lensOfField(field.id) : null);
  const layer = layerId ?? "";

  // ── 1. Charging Stations ───────────────────────────────────────────────────
  if (
    layer.startsWith("station") ||
    layer.startsWith("stations") ||
    layer.startsWith("demand-capacity")
  ) {
    const s = object as (StationPoint & {
      name?: string;
      powerKwSite?: number | null;
      operator?: string | null;
      currentType?: string | null;
      value?: number | null;
    });
    const name = s.name ? `${s.name}` : `Trạm ${s.id}`;
    const ports = s.nPorts !== null && s.nPorts !== undefined ? `${s.nPorts} cổng` : "Chưa rõ số cổng";
    const power = s.powerKwSite ? `${fmtNum(s.powerKwSite, 0)} kW` : "";
    const operator = s.operator ? `Nhà mạng: ${s.operator}` : "";
    const abnormal = isAbnormal(s.opStatus);
    const statusNote = abnormal ? `⚠ ${opStatusLabel(s.opStatus)}` : opStatusLabel(s.opStatus);

    const lines: string[] = [name];

    if (lens === "utilization") {
      const dow = dowOf(t);
      const hour = hourOf(t);
      const occVal = s.value;
      const occText =
        occVal !== null && occVal !== undefined
          ? `Tải đo lúc ${DOW_FULL[dow]} ${hour}h: ${fmtPct(occVal)}`
          : `Tải đo lúc ${DOW_FULL[dow]} ${hour}h: Chưa đủ quan sát`;
      lines.push(occText, `${ports} · ${power || "kW chưa khai"}`.trim(), statusNote);
    } else if (lens === "supply") {
      lines.push(
        `Quy mô: ${ports}${power ? ` · ${power}` : ""}`,
        [operator, s.currentType ? `Loại: ${s.currentType}` : ""].filter(Boolean).join(" · ") || "Trạm sạc công cộng",
        statusNote,
      );
    } else if (lens === "access") {
      lines.push(`${ports}${power ? ` · ${power}` : ""}`, "Điểm đến hạ tầng trạm sạc", statusNote);
    } else {
      // Demand, Opportunity, or contextual evidence
      lines.push(`${ports}${power ? ` · ${power}` : ""}`, operator || "Hạ tầng trạm sạc", statusNote);
    }

    return { text: lines.filter(Boolean).join("\n") };
  }

  // ── 2. H3 Grid Cells ───────────────────────────────────────────────────────
  if (
    layer.startsWith("grid") ||
    layer.startsWith("demand-supply") ||
    layer.startsWith("overlay-beyond")
  ) {
    const c = object as (GridCell & Record<string, unknown>);
    const h3Short = c.h3 ? `Ô H3 ${c.h3.slice(0, 11)}…` : "Ô H3";
    const communeName = typeof c["commune_name"] === "string" ? c["commune_name"] : "";
    const header = [h3Short, communeName].filter(Boolean).join(" · ");
    const lines: string[] = [header];

    if (lens === "demand") {
      const pop = c.pop !== null && c.pop !== undefined ? `${fmtNum(c.pop, 0)} người` : "Không có dân số";
      const density = c["pop_density_ppkm2"] ? `${fmtNum(c["pop_density_ppkm2"] as number, 0)} người/km²` : "";
      const apt = c["n_apartment"] ? `${fmtNum(c["n_apartment"] as number, 0)} chung cư` : "";
      lines.push(`Dân số: ${pop}`, [density, apt].filter(Boolean).join(" · ") || "Nhu cầu sạc tiềm năng");
      if (field.id !== "population" && c.value !== null && c.value !== undefined) {
        lines.push(`${field.label}: ${fmtFieldValue(c.value, field)}`);
      }
    } else if (lens === "access") {
      if (c.reachable === false || c.dist === null || c.dist === undefined) {
        lines.push("⚠ Không thể tiếp cận trạm bằng mạng đường bộ (UNREACHABLE)");
      } else {
        lines.push(`Cự ly mạng đường: ${fmtDist(c.dist)}`);
        const euclid = typeof c["dist_station_euclid_m"] === "number" ? `Chim bay: ${fmtDist(c["dist_station_euclid_m"] as number)}` : "";
        const detour = typeof c["detour_ratio"] === "number" ? `Đi vòng: ${fmtNum(c["detour_ratio"] as number, 2)}×` : "";
        if (euclid || detour) lines.push([euclid, detour].filter(Boolean).join(" · "));
      }
      if (field.id !== "dist_station_network_m" && field.id !== "road:dist_station_m" && c.value !== null && c.value !== undefined) {
        lines.push(`${field.label}: ${fmtFieldValue(c.value, field)}`);
      }
    } else if (lens === "supply") {
      const nStations = typeof c["n_stations"] === "number" ? `${c["n_stations"]} trạm` : "";
      const nPorts = typeof c["n_ports"] === "number" ? `${c["n_ports"]} cổng` : "";
      const power = typeof c["power_kw_site"] === "number" ? `${fmtNum(c["power_kw_site"] as number, 0)} kW` : "";
      lines.push(`${field.label}: ${fmtFieldValue(c.value, field)}`);
      const context = [nStations, field.id === "n_ports" ? "" : nPorts, power].filter(Boolean).join(" · ");
      if (context) lines.push(`Hạ tầng liên quan: ${context}`);
    } else if (lens === "utilization") {
      const util = typeof c["util_cell"] === "number" ? c["util_cell"] as number : (typeof c.value === "number" ? c.value : null);
      if (util !== null && util !== undefined) {
        lines.push(`Tải sử dụng ô: ${fmtPct(util)}`);
      } else {
        lines.push("Ô không có trạm đo telemetry");
      }
    } else if (lens === "opportunity") {
      const decisionValue = field.id === "screen_decision" ? c.value : c["screen_decision"];
      const marginValue = field.id === "screen_margin_m" ? c.value : c["screen_margin_m"];
      const decision = decisionValue ? constantShort(String(decisionValue)) : "";
      const margin = typeof marginValue === "number" ? fmtDist(marginValue) : "";
      if (decision) lines.push(`Quy tắc: ${decision}`);
      if (margin) lines.push(`Biên so với ngưỡng cơ sở: ${margin}`);
      if (!decision && !margin && c.value !== null && c.value !== undefined) {
        lines.push(`${field.label}: ${fmtFieldValue(c.value, field)}`);
      }
    } else {
      // Context or default
      if (c.value !== null && c.value !== undefined) {
        lines.push(`${field.label}: ${fmtFieldValue(c.value, field)}`);
      } else {
        lines.push(`Dân số: ${fmtNum(c.pop, 0)} người`);
      }
    }

    return { text: lines.filter(Boolean).join("\n") };
  }

  // ── 3. Communes / Wards ────────────────────────────────────────────────────
  if (layer.startsWith("commune")) {
    const feat = object as (CommuneFeature & { properties?: Record<string, unknown> });
    const props = feat.properties ?? {};
    const name = String(props["commune_name"] ?? "Xã/phường");
    const district = String(props["district_name"] ?? "");
    const header = district ? `${name} (${district})` : name;
    const lines: string[] = [header];

    if (lens === "opportunity") {
      lines.push("Lens Cơ hội không có giá trị trực tiếp trên đối tượng xã này.");
    } else if (lens === "access") {
      const distWeighted = typeof props["dist_station_m_pop_weighted"] === "number" ? props["dist_station_m_pop_weighted"] : null;
      lines.push(
        `Cự ly theo dân: ${distWeighted !== null ? fmtDist(distWeighted) : "Không xác định"} (bình quân gia quyền)`,
      );
    } else if (lens === "supply") {
      const nStations = props["n_stations"] ?? 0;
      const nPorts = props["n_ports"] ?? 0;
      lines.push(`${field.label}: ${fmtFieldValue(props[field.column], field)}`);
      if (field.column !== "n_stations" && field.column !== "n_ports") {
        lines.push(`Hiện trạng: ${nStations} trạm · ${nPorts} cổng sạc`);
      }
    } else if (lens === "demand") {
      const pop = props["population"] as number | undefined;
      const density = props["pop_density_ppkm2"] as number | undefined;
      lines.push(`Dân số: ${fmtNum(pop, 0)} người · Mật độ: ${fmtNum(density, 0)} người/km²`);
    } else {
      const val = props[field.column];
      lines.push(val !== null && val !== undefined ? `${field.label}: ${fmtFieldValue(val, field)}` : `Dân số: ${fmtNum(props["population"], 0)}`);
    }

    return { text: lines.filter(Boolean).join("\n") };
  }

  // ── 4. Road Segments ───────────────────────────────────────────────────────
  if (layer.startsWith("road") || layer.startsWith("scene-bridges") || layer.startsWith("route")) {
    const r = object as (RoadSeg & { id?: string; dist?: number | null; highway?: string });
    const id = r.id ? `Đoạn đường ${r.id}` : "Đoạn đường";
    const lines: string[] = [id];

    if (r.dist === null || r.dist === undefined) {
      lines.push("⚠ Không có kết nối mạng đường bộ tới trạm sạc gần nhất (UNREACHABLE)");
    } else {
      lines.push(`Khoảng cách tới trạm gần nhất: ${fmtDist(r.dist)}`);
    }
    if (r.highway) {
      lines.push(`Cấp đường OSM: ${r.highway}`);
    }

    return { text: lines.filter(Boolean).join("\n") };
  }

  // ── 5. POIs ────────────────────────────────────────────────────────────────
  if (layer.startsWith("poi")) {
    const p = object as (PoiFeature & { properties?: Record<string, unknown> });
    const props = p.properties ?? {};
    const name = String(props["name"] ?? "Địa điểm");
    const group = String(props["group"] ?? "");
    const area = typeof props["area_m2"] === "number" ? Math.round(props["area_m2"]) : null;

    const lines: string[] = [name];
    if (group) {
      const gMeta = POI_GROUPS.find((g) => g.group === group);
      lines.push(`Nhóm: ${gMeta?.label ?? group}`);
    }
    if (area) lines.push(`Diện tích sàn: ${fmtNum(area, 0)} m²`);

    return { text: lines.filter(Boolean).join("\n") };
  }

  return null;
}
