/**
 * Phase 4 — Analytical Filter Contract (PHASE4_VISUALIZATION.md §2).
 *
 * One analytical filter, SUBSET-only semantics, dataset-scoped identity.
 */

import type { DatasetId } from "./selection";
import { DEFAULT_DATASET_ID } from "./selection";

export type PowerTierId =
  | "le-22"
  | "23-60"
  | "61-120"
  | "121-180"
  | "gt-180"
  | "unknown";

export const POWER_TIER_ORDER: readonly PowerTierId[] = [
  "le-22",
  "23-60",
  "61-120",
  "121-180",
  "gt-180",
  "unknown",
] as const;

export const POWER_TIER_LABELS: Record<PowerTierId, { label: string; kwRange: string; desc: string }> = {
  "le-22": { label: "≤ 22 kW", kwRange: "≤ 22 kW", desc: "Công suất cổng danh định trong khoảng ≤ 22 kW" },
  "23-60": { label: "23–60 kW", kwRange: "> 22–60 kW", desc: "Công suất cổng danh định trong khoảng > 22–60 kW" },
  "61-120": { label: "61–120 kW", kwRange: "> 60–120 kW", desc: "Công suất cổng danh định trong khoảng > 60–120 kW" },
  "121-180": { label: "121–180 kW", kwRange: "> 120–180 kW", desc: "Công suất cổng danh định trong khoảng > 120–180 kW" },
  "gt-180": { label: "> 180 kW", kwRange: "> 180 kW", desc: "Công suất cổng danh định trên 180 kW" },
  "unknown": { label: "Chưa rõ", kwRange: "Chưa rõ", desc: "Nguồn dữ liệu không công bố công suất cổng lớn nhất" },
};

/**
 * Phân loại trạm theo công suất cổng lớn nhất (power_kw_max_port).
 * Áp dụng một lần duy nhất tại tầng nạp dữ liệu.
 */
export function powerTierOf(maxPortKw: number | null | undefined): PowerTierId {
  if (maxPortKw === null || maxPortKw === undefined || !Number.isFinite(maxPortKw) || maxPortKw < 0) {
    return "unknown";
  }
  if (maxPortKw <= 22) return "le-22";
  if (maxPortKw <= 60) return "23-60";
  if (maxPortKw <= 120) return "61-120";
  if (maxPortKw <= 180) return "121-180";
  return "gt-180";
}

export type AnalysisFilter = Readonly<
  | {
      version: 1;
      mode: "subset";
      datasetId: DatasetId;
      entity: "h3-cell";
      field: "population";
      op: "between";
      lo: number;
      hi: number;
      missing: "exclude";
      source: "demand-population-histogram";
    }
  | {
      version: 1;
      mode: "subset";
      datasetId: DatasetId;
      entity: "station";
      field: "power-tier";
      op: "in";
      values: readonly PowerTierId[];
      missing: "explicit-category";
      source: "supply-power-tier-breakdown";
    }
>;

export interface FilterState {
  active: AnalysisFilter | null;
  /** Increments only when the canonical semantic filter changes. */
  revision: number;
  /**
   * Vì sao filter vừa bị xoá — chỉ để THÔNG BÁO, không phải state phân tích.
   *
   * `null` khi filter đang bật hoặc chưa từng bị xoá. Một lần xoá do đổi Lens/trường phải
   * nói được lý do (§2.3): người dùng vừa thấy tập ô trên bản đồ đổi mà không bấm gì vào
   * bộ lọc, và một thay đổi không giải thích được thì đọc thành dữ liệu bị thiếu (§2.1).
   */
  clearedReason: FilterClearReason | null;
}

/** Lý do một filter bị xoá — dùng cho vùng thông báo, không vào hash. */
export type FilterClearReason =
  | "user"
  | "lens-incompatible"
  | "field-incompatible"
  | "dataset-changed";

export const FILTER_CLEAR_MESSAGES: Record<FilterClearReason, string> = {
  user: "Đã bỏ bộ lọc.",
  "lens-incompatible": "Đã bỏ bộ lọc: Lens mới đọc trên đối tượng khác.",
  "field-incompatible": "Đã bỏ bộ lọc: trường mới đọc trên đối tượng khác.",
  "dataset-changed": "Đã bỏ bộ lọc: bộ dữ liệu đã đổi.",
};

export const INITIAL_FILTER_STATE: FilterState = {
  active: null,
  revision: 0,
  clearedReason: null,
};

/**
 * Kiểm tra hai filter có tương đương ngữ nghĩa hay không.
 */
export function filterEquals(a: AnalysisFilter | null, b: AnalysisFilter | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.version !== b.version || a.mode !== b.mode || a.datasetId !== b.datasetId || a.entity !== b.entity || a.field !== b.field || a.op !== b.op || a.source !== b.source) {
    return false;
  }
  if (a.op === "between" && b.op === "between") {
    return a.lo === b.lo && a.hi === b.hi;
  }
  if (a.op === "in" && b.op === "in") {
    if (a.values.length !== b.values.length) return false;
    return a.values.every((v, i) => v === b.values[i]);
  }
  return false;
}

/**
 * Chuẩn hoá filter trước khi ghi vào state/hash.
 * - Sắp xếp lo <= hi cho khoảng số.
 * - Loại trùng lặp và sắp xếp theo thứ tự khai báo cho danh mục tier.
 * - Tập tier rỗng hoặc đủ 6 tier trở thành null (không lọc).
 * - Dataset không khớp trở thành null.
 */
export function canonicalFilter(
  candidate: AnalysisFilter | null,
  expectedDatasetId: DatasetId = DEFAULT_DATASET_ID,
): AnalysisFilter | null {
  if (!candidate) return null;
  if (candidate.datasetId !== expectedDatasetId) return null;

  if (candidate.entity === "h3-cell" && candidate.field === "population" && candidate.op === "between") {
    if (!Number.isFinite(candidate.lo) || !Number.isFinite(candidate.hi)) return null;
    const lo = Math.min(candidate.lo, candidate.hi);
    const hi = Math.max(candidate.lo, candidate.hi);
    return {
      version: 1,
      mode: "subset",
      datasetId: candidate.datasetId,
      entity: "h3-cell",
      field: "population",
      op: "between",
      lo,
      hi,
      missing: "exclude",
      source: "demand-population-histogram",
    };
  }

  if (candidate.entity === "station" && candidate.field === "power-tier" && candidate.op === "in") {
    const rawSet = new Set(candidate.values);
    const ordered = POWER_TIER_ORDER.filter((t) => rawSet.has(t));
    if (ordered.length === 0 || ordered.length === POWER_TIER_ORDER.length) {
      return null;
    }
    return {
      version: 1,
      mode: "subset",
      datasetId: candidate.datasetId,
      entity: "station",
      field: "power-tier",
      op: "in",
      values: ordered,
      missing: "explicit-category",
      source: "supply-power-tier-breakdown",
    };
  }

  return null;
}

/**
 * Cập nhật FilterState có bảo toàn reference và revision nếu filter không đổi.
 */
export function applyFilterIntent(
  current: FilterState,
  candidate: AnalysisFilter | null,
  datasetId: DatasetId = DEFAULT_DATASET_ID,
  reason: FilterClearReason = "user",
): FilterState {
  const canonical = canonicalFilter(candidate, datasetId);
  if (filterEquals(current.active, canonical)) {
    return current;
  }
  return {
    active: canonical,
    revision: current.revision + 1,
    // Lý do chỉ có nghĩa cho một lần XOÁ. Đặt filter mới thì thông báo cũ phải tắt, nếu
    // không vùng live sẽ đọc ra một câu nói về hành động trước đó.
    clearedReason: canonical ? null : reason,
  };
}

/**
 * Kiểm tra filter có tương thích với lens/field đang chọn hay không.
 * Demand range chỉ áp dụng cho Demand Cell; Supply tier chỉ áp dụng cho Supply Station.
 */
export function isFilterCompatible(
  filter: AnalysisFilter | null,
  activeLensId: string | null | undefined,
  fieldReadAs?: string,
): boolean {
  if (!filter) return true;
  if (filter.entity === "h3-cell") {
    return activeLensId === "demand" && fieldReadAs === "cell";
  }
  if (filter.entity === "station") {
    return activeLensId === "supply" && fieldReadAs === "station";
  }
  return false;
}

// ── Predicate — MỘT định nghĩa cho cả bản đồ, biểu đồ, readout và Inspector ──
//
// Bốn nơi từng tự viết lại phép thử này và chúng đã lệch nhau: bản đồ nhận mọi số hữu hạn
// trong khi model histogram loại số âm, nên một ô `pop = -1` vừa được vẽ vừa bị đếm là
// khuyết. Hợp đồng §5.2 giao phép thử cho `state/filter.ts`, và đây là nó.
//
// Kiểu vào để ở dạng CẤU TRÚC TỐI THIỂU chứ không import `GridCell`/`StationPoint`:
// `data/queries.ts` đã import ngược lại module này (`powerTierOf`), và một vòng import
// giữa tầng state và tầng dữ liệu là thứ không nên tạo ra chỉ để mượn một cái tên kiểu.

export interface FilterableCell {
  pop: number | null | undefined;
}

export interface FilterableStation {
  inScope: boolean;
  powerTier?: PowerTierId;
  powerKwMaxPort?: number | null;
}

/**
 * Dân số ĐỌC ĐƯỢC hay không.
 *
 * Số âm bị loại cùng `NaN`/`null`: dân số âm không phải một giá trị nhỏ, nó là dữ liệu
 * hỏng. `missing: "exclude"` của §1.2 áp cho cả ba.
 */
export function isKnownPopulation(pop: number | null | undefined): pop is number {
  return typeof pop === "number" && Number.isFinite(pop) && pop >= 0;
}

/** Ô có thuộc SUBSET đang bật không. Không có filter ⇒ mọi ô đều thuộc. */
export function filterKeepsCell(
  filter: AnalysisFilter | null,
  cell: FilterableCell,
): boolean {
  if (!filter || filter.entity !== "h3-cell") return true;
  if (!isKnownPopulation(cell.pop)) return false;
  return cell.pop >= filter.lo && cell.pop <= filter.hi;
}

/**
 * Trạm có thuộc SUBSET đang bật không — CHỈ xét bậc công suất.
 *
 * Luật "chỉ đếm trạm IN" (§1.3) KHÔNG nằm ở đây: nó đúng kể cả khi không có filter nào,
 * nên nó là một tính chất của tập phân tích chứ không phải của bộ lọc. Trộn hai thứ lại
 * sẽ khiến `filterKeepsStation(null, bufferStation)` trả `false` và đọc thành "bộ lọc đang
 * loại trạm này".
 */
export function filterKeepsStation(
  filter: AnalysisFilter | null,
  station: FilterableStation,
): boolean {
  if (!filter || filter.entity !== "station") return true;
  const tier = station.powerTier ?? powerTierOf(station.powerKwMaxPort ?? null);
  return filter.values.includes(tier);
}

/** Câu mô tả predicate đang bật — dùng chung cho FilterSummary và vùng thông báo. */
export function describeFilter(filter: AnalysisFilter): string {
  if (filter.entity === "h3-cell") {
    const lo = filter.lo.toLocaleString("vi-VN");
    const hi = filter.hi.toLocaleString("vi-VN");
    return filter.lo === filter.hi
      ? `Ô H3 có dân số = ${lo} người`
      : `Ô H3 có dân số ${lo}–${hi} người`;
  }
  return `Trạm thuộc bậc ${filter.values.map((v) => POWER_TIER_LABELS[v].label).join(", ")}`;
}

// ── Serialization & Parsing — §2.3 ──────────────────────────────────────────

const RANGE_SEP = "..";
const TIER_SEP = ".";

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "";
  return String(Number(v.toFixed(4)));
}

/**
 * Ghi khoá `b` theo định dạng phiên bản Phase 4:
 * `b=f1~h3-cell~population~between~<lo>..<hi>`
 * `b=f1~station~power-tier~in~<tier>[.<tier>...]`
 */
export function serializeFilter(filter: AnalysisFilter | null): string {
  if (!filter) return "";
  if (filter.entity === "h3-cell" && filter.op === "between") {
    return `f1~h3-cell~population~between~${fmt(filter.lo)}${RANGE_SEP}${fmt(filter.hi)}`;
  }
  if (filter.entity === "station" && filter.op === "in") {
    return `f1~station~power-tier~in~${filter.values.join(TIER_SEP)}`;
  }
  return "";
}

/**
 * Đọc filter từ khoá `b`, hỗ trợ định dạng mới `f1~...` và tương thích ngược với
 * mệnh đề histogram dân số `h:population:<lo>..<hi>`. Các mệnh đề scatter/window cũ bị
 * bỏ: chúng không phải analytical SUBSET filter của Phase 4.
 */
export function parseFilter(
  raw: string | null | undefined,
  datasetId: DatasetId = DEFAULT_DATASET_ID,
): AnalysisFilter | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Format version 1: f1~entity~field~op~args
  if (trimmed.startsWith("f1~")) {
    const parts = trimmed.split("~");
    if (parts.length < 5) return null;
    const [, entity, field, op, arg] = parts;

    if (entity === "h3-cell" && field === "population" && op === "between" && arg) {
      const rangeIdx = arg.indexOf(RANGE_SEP);
      if (rangeIdx < 0) return null;
      const loStr = arg.slice(0, rangeIdx).trim();
      const hiStr = arg.slice(rangeIdx + RANGE_SEP.length).trim();
      // Biên RỖNG phải bị bỏ, không được coi là 0: `Number("")` là `0` và `Number.isFinite`
      // gật đầu, nên một link bị cắt cụt (`…between~120..`) từng đọc ra khoảng `[0, 120]` —
      // một tập con khác hẳn thứ người gửi chọn, và không có dấu hiệu nào cho thấy đã sai.
      if (!loStr || !hiStr) return null;
      const lo = Number(loStr);
      const hi = Number(hiStr);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      return canonicalFilter({
        version: 1,
        mode: "subset",
        datasetId,
        entity: "h3-cell",
        field: "population",
        op: "between",
        lo,
        hi,
        missing: "exclude",
        source: "demand-population-histogram",
      }, datasetId);
    }

    if (entity === "station" && field === "power-tier" && op === "in" && arg) {
      const tokens = arg.split(TIER_SEP);
      // Một token lạ làm HỎNG CẢ MỆNH ĐỀ, không bị bỏ riêng: bỏ riêng sẽ biến `le-22.bogus`
      // thành bộ lọc `{le-22}` — một tập con khác, im lặng, từ một chuỗi gõ sai. §2.3 cho
      // phép bỏ một mệnh đề hỏng; nó không cho phép đổi mệnh đề đó thành mệnh đề khác.
      if (!tokens.every((t) => (POWER_TIER_ORDER as readonly string[]).includes(t))) return null;
      const rawTiers = tokens as PowerTierId[];
      if (rawTiers.length === 0) return null;
      return canonicalFilter({
        version: 1,
        mode: "subset",
        datasetId,
        entity: "station",
        field: "power-tier",
        op: "in",
        values: rawTiers,
        missing: "explicit-category",
        source: "supply-power-tier-breakdown",
      }, datasetId);
    }
    return null;
  }

  for (const clause of trimmed.split(",")) {
    const prefix = "h:population:";
    const value = clause.trim();
    if (!value.startsWith(prefix)) continue;
    const range = value.slice(prefix.length);
    const rangeIdx = range.indexOf(RANGE_SEP);
    if (rangeIdx < 0) continue;
    const loStr = range.slice(0, rangeIdx).trim();
    const hiStr = range.slice(rangeIdx + RANGE_SEP.length).trim();
    // Cùng bẫy `Number("") === 0` như nhánh `f1~` ở trên.
    if (!loStr || !hiStr) continue;
    const lo = Number(loStr);
    const hi = Number(hiStr);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    return canonicalFilter({
      version: 1,
      mode: "subset",
      datasetId,
      entity: "h3-cell",
      field: "population",
      op: "between",
      lo,
      hi,
      missing: "exclude",
      source: "demand-population-histogram",
    }, datasetId);
  }

  return null;
}
