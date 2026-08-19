/**
 * Phase 5 §2 — Quick Preset contract.
 *
 * Một Quick Preset là **dữ liệu khai báo** đặt tên cho MỘT câu hỏi và giải ra MỘT
 * `AnalysisFilter`. Nó không phải một handler click, không phải một chuỗi lời gọi store, và
 * không phải — theo chữ của `docs/visual-research.md` — "một khối cấu hình đa dụng không
 * kiểu".
 *
 * Ba tính chất suy ra từ đó, và mỗi cái đều kiểm được:
 *
 * 1. **Tuần tự hoá được.** Tác dụng của một preset được mô tả TRỌN VẸN bởi `AnalysisFilter`
 *    mà nó giải ra, nên nó đi qua khoá hash `b` sẵn có — không khoá mới, không parser mới.
 * 2. **Đảo được.** Xoá filter là hoàn tác preset, không để lại cặn.
 * 3. **Tự nó trơ.** Khai báo một preset không đổi gì cả cho tới khi `applyPreset` chạy, và
 *    ngoài `applyPreset` không có chỗ nào đọc một preset.
 *
 * Module này THUẦN: không React, không DuckDB, không đụng store. `PresetStats` suy ra từ dữ
 * liệu ĐÃ nằm sẵn trong bộ nhớ (snapshot `population` của Ô và snapshot Trạm lúc boot) và
 * **không phát truy vấn nào của riêng nó** (§4).
 */

import { FIELD_BY_ID, type LensId } from "../fields";
import type { Manifest } from "../data/manifest";
import {
  POWER_TIER_ORDER,
  canonicalFilter,
  filterEquals,
  isFilterCompatible,
  isKnownPopulation,
  powerTierOf,
  type AnalysisFilter,
  type FilterableCell,
  type FilterableStation,
  type PowerTierId,
} from "./filter";
import { DEFAULT_DATASET_ID, type DatasetId } from "./selection";

// ── Hợp đồng kiểu — §2.2 ────────────────────────────────────────────────────

export type PresetId =
  | "demand-top-decile"
  | "demand-zero-population"
  | "supply-ge-61kw"
  | "supply-le-22kw"
  | "supply-power-unknown";

/** Một biên được KHAI BÁO chứ không viết thành literal, để giải lại theo từng gói. */
export type ThresholdSpec =
  | { readonly kind: "literal"; readonly value: number }
  /** Phân vị, tính trên các giá trị PHÂN TÍCH ĐƯỢC (§2.3). */
  | { readonly kind: "quantile"; readonly q: number }
  | { readonly kind: "extreme"; readonly at: "min" | "max" };

export type PresetFilterSpec =
  | {
      readonly entity: "h3-cell";
      readonly field: "population";
      readonly op: "between";
      readonly lo: ThresholdSpec;
      readonly hi: ThresholdSpec;
    }
  | {
      readonly entity: "station";
      readonly field: "power-tier";
      readonly op: "in";
      readonly values: readonly PowerTierId[];
    };

export interface QuickPreset {
  readonly id: PresetId;
  /** Chỉ ngôn ngữ KHOẢNG và SỐ ĐO — không tính từ đánh giá (Phase 4 §1.3). */
  readonly label: string;
  /** Một dòng gọi tên câu hỏi; làm accessible description của nút. */
  readonly question: string;
  readonly lens: LensId;
  /** Field id có định danh registry; phải thoả `isFilterCompatible()` với `lens`. */
  readonly field: string;
  readonly filter: PresetFilterSpec;
  /**
   * Cột phải CÓ trong gói đang mở, nếu không preset bị ẩn.
   *
   * Có tiền tố `grid:` / `station:` vì manifest phát hai danh sách khác nhau
   * (`available_columns` cho lưới, `available_station_columns` cho trạm) và hai bảng đó có
   * những tên trùng nhau. Một `requires: ["name"]` không định danh sẽ hỏi sai bảng mà không
   * ai biết.
   */
  readonly requires: readonly string[];
}

// ── Thống kê một phiên — §2.3 ───────────────────────────────────────────────

export interface PresetStats {
  /** Dân số PHÂN TÍCH ĐƯỢC, đã sắp tăng dần. Rỗng khi chưa nạp snapshot Ô. */
  readonly populations: readonly number[];
  /** Số trạm theo bậc, CHỈ đếm trạm `IN` (Phase 4 §1.3). */
  readonly tierCounts: Readonly<Record<PowerTierId, number>>;
  /** Cột có mặt trong gói, đã định danh bảng. */
  readonly columns: ReadonlySet<string>;
}

export const EMPTY_PRESET_STATS: PresetStats = {
  populations: [],
  tierCounts: Object.fromEntries(POWER_TIER_ORDER.map((t) => [t, 0])) as Record<PowerTierId, number>,
  columns: new Set<string>(),
};

/**
 * Dựng `PresetStats` từ dữ liệu đã cư trú. KHÔNG phát truy vấn.
 *
 * `populations` lọc bằng ĐÚNG `isKnownPopulation` — vị từ mà chính bộ lọc dùng (§2.3). Nhờ
 * thế biên giải ra và vị từ áp lên khớp nhau THEO CẤU TẠO, chứ không khớp nhờ trùng hợp.
 * Trên gói `p/01` hai tập này trùng nhau (0 null, 0 âm), nhưng chúng sẽ không trùng ở một
 * gói mà `population` khuyết một phần — và đó chính là lúc sai lệch sẽ im lặng.
 */
export function presetStatsFrom(input: {
  cells?: readonly FilterableCell[] | null;
  stations?: readonly (FilterableStation & { scope?: string })[] | null;
  manifest?: Manifest | null;
}): PresetStats {
  const populations: number[] = [];
  for (const c of input.cells ?? []) {
    if (isKnownPopulation(c.pop)) populations.push(c.pop);
  }
  populations.sort((a, b) => a - b);

  const tierCounts = Object.fromEntries(POWER_TIER_ORDER.map((t) => [t, 0])) as Record<
    PowerTierId,
    number
  >;
  for (const s of input.stations ?? []) {
    if (!s.inScope) continue;
    tierCounts[s.powerTier ?? powerTierOf(s.powerKwMaxPort ?? null)] += 1;
  }

  const columns = new Set<string>();
  for (const col of input.manifest?.available_columns ?? []) columns.add(`grid:${col}`);
  for (const col of input.manifest?.available_station_columns ?? []) columns.add(`station:${col}`);

  return { populations, tierCounts, columns };
}

/**
 * Phân vị nội suy TUYẾN TÍNH giữa hai thống kê thứ tự.
 *
 * Nói rõ cách nội suy là một yêu cầu của §2.3: con số phải dựng lại được từ parquet bằng một
 * dòng pandas hoặc DuckDB. Đây đúng là định nghĩa của `quantile_cont` và của
 * `numpy.quantile(..., method="linear")`.
 */
export function quantileOf(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function resolveThreshold(spec: ThresholdSpec, stats: PresetStats): number | null {
  if (spec.kind === "literal") return Number.isFinite(spec.value) ? spec.value : null;
  if (spec.kind === "quantile") return quantileOf(stats.populations, spec.q);
  if (stats.populations.length === 0) return null;
  return spec.at === "min" ? stats.populations[0]! : stats.populations[stats.populations.length - 1]!;
}

// ── Danh mục — §2.4 ─────────────────────────────────────────────────────────

/**
 * Năm preset đã kiểm chứng.
 *
 * KHÔNG literal ngưỡng nào trong bảng này được gõ tay: `demand-top-decile` khai báo *phân vị
 * 0,90*, không phải `4450.0907`. Con số ấy là một tính chất của gói đang mở, và viết nó vào
 * đây sẽ biến nó thành một tính chất của mã nguồn — sai ngay lần đầu ai đó mở gói khác.
 *
 * Nhãn chỉ nói KHOẢNG và SỐ ĐO. Phase 4 §1.3 cấm `chậm/nhanh/siêu nhanh` cho bậc công suất
 * khi chưa có chuẩn ngành được duyệt; lệnh cấm đó nối dài sang nhãn preset.
 */
export const PRESETS: readonly QuickPreset[] = [
  {
    id: "demand-top-decile",
    label: "10% ô đông dân nhất",
    question: "Một phần mười số ô có dân đông nhất nằm ở đâu?",
    lens: "demand",
    field: "population",
    filter: {
      entity: "h3-cell",
      field: "population",
      op: "between",
      lo: { kind: "quantile", q: 0.9 },
      hi: { kind: "extreme", at: "max" },
    },
    requires: ["grid:population"],
  },
  {
    id: "demand-zero-population",
    label: "Ô có dân số bằng 0",
    question: "Những ô nào bề mặt dân số ghi nhận đúng 0 người?",
    lens: "demand",
    field: "population",
    filter: {
      entity: "h3-cell",
      field: "population",
      op: "between",
      lo: { kind: "literal", value: 0 },
      hi: { kind: "literal", value: 0 },
    },
    requires: ["grid:population"],
  },
  {
    id: "supply-ge-61kw",
    label: "Cổng mạnh nhất ≥ 61 kW",
    question: "Trạm nào có cổng nameplate từ 61 kW trở lên?",
    lens: "supply",
    field: "station:ports",
    filter: { entity: "station", field: "power-tier", op: "in", values: ["61-120", "121-180", "gt-180"] },
    requires: ["station:power_kw_max_port", "station:scope"],
  },
  {
    id: "supply-le-22kw",
    label: "Cổng mạnh nhất ≤ 22 kW",
    question: "Trạm nào chỉ có cổng nameplate tối đa 22 kW?",
    lens: "supply",
    field: "station:ports",
    filter: { entity: "station", field: "power-tier", op: "in", values: ["le-22"] },
    requires: ["station:power_kw_max_port", "station:scope"],
  },
  {
    id: "supply-power-unknown",
    label: "Chưa rõ công suất cổng",
    question: "Trạm nào nguồn không ghi công suất cổng mạnh nhất?",
    lens: "supply",
    field: "station:ports",
    filter: { entity: "station", field: "power-tier", op: "in", values: ["unknown"] },
    requires: ["station:power_kw_max_port", "station:scope"],
  },
] as const;

export const PRESET_BY_ID: ReadonlyMap<PresetId, QuickPreset> = new Map(
  PRESETS.map((p) => [p.id, p]),
);

// ── Giải preset — §2.3 ──────────────────────────────────────────────────────

/**
 * Giải một preset thành `AnalysisFilter`, hoặc `null` khi gói không đỡ nổi nó.
 *
 * `null` nghĩa là **ẩn**, không phải "hiện mà bấm không được" (§2.3): một nút có mặt nhưng
 * trơ là một lời khẳng định rằng phép phân tích ấy tồn tại.
 *
 * Kết quả đi qua `canonicalFilter()` trước khi tới store, nên một preset không thể dựng ra
 * một filter mà parser của hash sẽ từ chối.
 */
export function resolvePreset(
  preset: QuickPreset,
  stats: PresetStats,
  datasetId: DatasetId = DEFAULT_DATASET_ID,
): AnalysisFilter | null {
  for (const need of preset.requires) {
    // Manifest chưa nạp ⇒ chưa biết gì ⇒ chưa hiện preset nào. Đoán "chắc là có" ở đây sẽ
    // cho một nút bấm vào là ra tập rỗng.
    if (!stats.columns.has(need)) return null;
  }

  const spec = preset.filter;
  if (spec.entity === "h3-cell") {
    const lo = resolveThreshold(spec.lo, stats);
    const hi = resolveThreshold(spec.hi, stats);
    if (lo === null || hi === null) return null;
    return canonicalFilter(
      {
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
      },
      datasetId,
    );
  }

  return canonicalFilter(
    {
      version: 1,
      mode: "subset",
      datasetId,
      entity: "station",
      field: "power-tier",
      op: "in",
      values: spec.values,
      missing: "explicit-category",
      source: "supply-power-tier-breakdown",
    },
    datasetId,
  );
}

/** Preset nào hiện được với gói đang mở — bảng nguồn của `QuickPresets.tsx`. */
export function availablePresets(
  stats: PresetStats,
  datasetId: DatasetId = DEFAULT_DATASET_ID,
): readonly { preset: QuickPreset; filter: AnalysisFilter }[] {
  const out: { preset: QuickPreset; filter: AnalysisFilter }[] = [];
  for (const preset of PRESETS) {
    const filter = resolvePreset(preset, stats, datasetId);
    if (filter) out.push({ preset, filter });
  }
  return out;
}

/**
 * Preset có đang BẬT không — SUY RA, không lưu (§2.6).
 *
 * Một "preset đang bật" được lưu lại sẽ là nguồn sự thật thứ hai, và nó lệch ngay khoảnh
 * khắc người dùng kéo histogram trúng đúng khoảng của preset. Ở đây điều kiện là: filter
 * đang chạy bằng filter mà preset giải ra, VÀ trường đang mở là trường của preset.
 */
export function isPresetActive(
  preset: QuickPreset,
  resolved: AnalysisFilter | null,
  activeFilter: AnalysisFilter | null,
  activeField: string,
): boolean {
  return activeField === preset.field && filterEquals(activeFilter, resolved);
}

/**
 * Cổng tự kiểm: mọi preset phải khai báo `lens`/`field` mà bộ lọc của nó SỐNG ĐƯỢC.
 *
 * Gọi trong test (§7.6-30). Không gọi lúc chạy — một preset sai là lỗi lập trình, không phải
 * một trạng thái dữ liệu.
 */
export function presetSelfCheck(preset: QuickPreset, resolved: AnalysisFilter | null): boolean {
  return isFilterCompatible(resolved, preset.lens, FIELD_BY_ID.get(preset.field)?.readAs);
}

/**
 * Câu in kèm nhãn của một preset khoảng — §2.4.
 *
 * `demand-top-decile` phải in ra BIÊN đã giải bên cạnh nhãn: "một phân vị mà giá trị của nó
 * bị giấu đi là một con số người đọc không kiểm được". Hàm nằm ở đây chứ không ở component
 * để §7.6-42 đúng theo nghĩa đen — `QuickPresets.tsx` không chứa một literal số nào.
 *
 * Trả `null` cho preset bậc công suất: nhãn của chúng đã nói đủ khoảng rồi, in thêm sẽ là
 * lặp lại chính nó.
 */
export function presetBoundLabel(filter: AnalysisFilter | null): string | null {
  if (!filter || filter.entity !== "h3-cell") return null;
  const fmt = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  return filter.lo === filter.hi
    ? `= ${fmt(filter.lo)} người`
    : `${fmt(filter.lo)}–${fmt(filter.hi)} người`;
}
