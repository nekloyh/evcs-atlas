/**
 * Tooltip của bản đồ TOÀN QUỐC — hàm THUẦN, tách khỏi `NationalMap.tsx` để test bằng
 * `node --test` được (file .tsx không đi qua loader test, và chính vì không test được mà
 * hai lỗi sống sót tới Final QA: trường tỉ lệ in "0,27 diện tích" thay vì "27%", và chuỗi
 * "H3 r6" ghi cứng trong lúc LOD đang vẽ r7).
 */

import { formatValue, type NationalField } from "./fields";
import { provinceMetric } from "./metrics";
import type {
  NationalCell,
  NationalPoi,
  NationalStation,
  ProvinceFeature,
  ProvinceRow,
} from "./data";

function fmt(v: unknown): string {
  return typeof v === "number" ? v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : "—";
}

export function tooltip(
  object: unknown,
  layerId: string | undefined,
  field: NationalField,
  rows: Record<string, ProvinceRow>,
  /** bậc H3 ĐANG VẼ — LOD đổi r6↔r7 theo zoom, nên chuỗi không được ghi cứng "r6" */
  shownRes: number,
): { text: string } | null {
  if (!object) return null;
  if (layerId === "vn-stations") {
    const s = object as NationalStation;
    return {
      text: [
        s.name ?? s.station_code,
        `${s.n_ports ?? "—"} cổng · ${fmt(s.power_kw_site)} kW`,
        `${s.current_type ?? "—"} · ${s.op_status ?? "—"}`,
        rows[s.province_code]?.province_name ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  if (layerId === "vn-poi") {
    const p = object as NationalPoi;
    return {
      text: [p.name ?? "(không tên)", p.tag ?? "", rows[p.province_code]?.province_name ?? ""]
        .filter(Boolean)
        .join("\n"),
    };
  }
  if (layerId === "vn-cells") {
    const c = object as NationalCell;
    const prov = rows[c.province_code]?.province_name ?? c.province_code;
    // `formatValue` biết trường tỉ lệ: 0,27 phải in "27%", không phải "0,27 diện tích".
    const v = c[field.column];
    return {
      text:
        `${field.label}: ${formatValue(field, typeof v === "number" ? v : null)} ${field.unit_label}` +
        `\nô gộp H3 r${shownRes} · ${prov}`,
    };
  }
  const f = object as ProvinceFeature;
  const row = rows[f.properties.province_code];
  const head = row?.province_name ?? f.properties.province_code;
  if (field.unit !== "province") return { text: `${head}\nbấm để mở bộ dữ liệu của tỉnh` };
  if (!row) return { text: `${head}\nThiếu dòng dữ liệu tỉnh` };
  const metric = provinceMetric(row, field);
  if (metric.state === "not-comparable") {
    return { text: `${head}\nKHÔNG SO SÁNH ĐƯỢC · ${metric.reason ?? "không đủ dữ liệu"}\nbấm để mở bộ dữ liệu của tỉnh` };
  }
  if (metric.state === "missing") {
    return { text: `${head}\n${field.label}: không đo được\nbấm để mở bộ dữ liệu của tỉnh` };
  }
  return {
    text: `${head}\n${field.label}: ${formatValue(field, metric.value)} ${field.unit_label}\n${
      row?.in_store ? "bấm để mở bộ dữ liệu của tỉnh" : "chưa dựng trong store"
    }`,
  };
}
