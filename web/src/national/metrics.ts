import type { NationalField } from "./fields";
import type { ProvinceRow } from "./data";

export type ProvinceMetricState = "value" | "missing" | "not-comparable";

export interface ProvinceMetric {
  row: ProvinceRow;
  value: number | null;
  state: ProvinceMetricState;
  reason: string | null;
}

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const flagsOf = (row: ProvinceRow): Set<string> =>
  new Set(typeof row.quality_flags === "string" ? row.quality_flags.split("|").filter(Boolean) : []);

/**
 * Đọc KPI đã xuất, đồng thời kiểm lại mẫu số theo registry. Không tính lại urban_km2 ở
 * browser: pipeline là chủ của đại lượng dẫn xuất đó. Mẫu số 0/null luôn là NOT COMPARABLE.
 */
export function provinceMetric(row: ProvinceRow, field: NationalField): ProvinceMetric {
  const kpi = field.kpi;
  if (kpi) {
    const denominator = finite(row[kpi.denominator.column]);
    if (denominator === null || denominator === 0) {
      return {
        row,
        value: null,
        state: "not-comparable",
        reason: `Không có mẫu số ${kpi.denominator.column} hợp lệ`,
      };
    }
  }

  const rule = field.comparability;
  const flags = flagsOf(row);
  if (rule?.requiredValueColumn && finite(row[rule.requiredValueColumn]) === null) {
    return {
      row,
      value: null,
      state: "not-comparable",
      reason: `Không có ${rule.requiredValueColumn} để áp cùng phương pháp`,
    };
  }
  const unusable = Array.isArray(row.unusable_layers)
    ? row.unusable_layers.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "layer" in item &&
          (item as { layer?: unknown }).layer === rule?.sourceLayer,
      )
    : false;
  if (unusable || (rule?.requiredFlagAbsence && flags.has(rule.requiredFlagAbsence))) {
    return {
      row,
      value: finite(row[field.column]),
      state: "not-comparable",
      reason: unusable
        ? `Lớp ${rule?.sourceLayer} không dùng được`
        : `Cờ ${rule?.requiredFlagAbsence}`,
    };
  }

  const value = finite(row[field.column]);
  return value === null
    ? { row, value: null, state: "missing", reason: "Thiếu giá trị đã xuất" }
    : { row, value, state: "value", reason: null };
}

export interface RankedProvince extends ProvinceMetric {
  rank: number | null;
}

/** Standard competition ranking (1, 2, 2, 4); NOT COMPARABLE và missing đứng ngoài. */
export function rankProvinces(
  rows: Iterable<ProvinceRow>,
  field: NationalField,
): RankedProvince[] {
  const direction = field.polarity === "high-bad" ? 1 : -1;
  const metrics = [...rows].map((row) => provinceMetric(row, field));
  const comparable = metrics
    .filter((m): m is ProvinceMetric & { value: number } => m.state === "value" && m.value !== null)
    .sort(
      (a, b) =>
        direction * (a.value - b.value) ||
        a.row.province_name.localeCompare(b.row.province_name, "vi"),
    );
  let previous: number | null = null;
  let rank = 0;
  const ranked = new Map<string, number>();
  comparable.forEach((metric, index) => {
    if (previous === null || metric.value !== previous) rank = index + 1;
    previous = metric.value;
    ranked.set(metric.row.province_code, rank);
  });
  return metrics
    .map((metric) => ({ ...metric, rank: ranked.get(metric.row.province_code) ?? null }))
    .sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.row.province_name.localeCompare(b.row.province_name, "vi");
    });
}

export function comparableValues(
  rows: Iterable<ProvinceRow>,
  field: NationalField,
): Array<number | null> {
  return [...rows].map((row) => {
    const metric = provinceMetric(row, field);
    return metric.state === "value" ? metric.value : null;
  });
}
