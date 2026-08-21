/**
 * Phase 6 — Zone Superset Query (zone-query.ts)
 *
 * MỘT truy vấn DuckDB-WASM tại thời điểm đặt trạm (§2.2): siêu tập vùng theo bounding box,
 * chỉ những cột §2.1 cần, ≤ ~150 dòng; lọc e(c) chính xác và mọi phép tính nằm ở JS.
 * Cộng một truy vấn nhỏ (cache theo phiên) cho tóm tắt occupancy 30 ngày — bảng
 * `station_occupancy.parquet`, KHÔNG phải hồ sơ 168h của `data/occupancy.ts`.
 */

import { query, registerParquet } from "../data/duckdb";
import { GRID } from "../data/queries";
import { dataPath } from "../data/province";
import type { GridCellSimInput, OccupancySimInput } from "./engine";

/**
 * ±0,06° chứ không phải ±0,05°: vùng Z chỉ cần 5 km (±0,05° đủ), nhưng láng giềng ring-1
 * của ô nằm ở mép vùng vươn tới ~5,98 km — thiếu chúng thì L(c) của ô mép rơi về band-only
 * một cách không cần thiết. 0,06° ≥ 6,1 km tại mọi vĩ độ của Việt Nam.
 */
const BBOX_DEG = 0.06;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStr(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** Cột thời gian có thể tới dạng chuỗi, `Date`, hoặc epoch-ms tuỳ schema Arrow. */
function toIsoStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" || typeof v === "bigint") {
    return new Date(Number(v)).toISOString();
  }
  return String(v);
}

export async function fetchZoneCells(candidate: {
  lat: number;
  lng: number;
}): Promise<GridCellSimInput[]> {
  await registerParquet(GRID);
  const t = await query(
    // `commune_name` đi CÙNG truy vấn này, không thêm một lượt đọc nào (UX §16.1): tên xã
    // là thứ panel gọi vị trí bằng, và nó đã nằm sẵn trên mỗi hàng lưới (`docs/COT.md` #9).
    `SELECT h3_r8, lat, lng, population, pop_source, dist_station_network_m,
            detour_ratio, evidence_grade_distance, commune_code, commune_name
     FROM read_parquet('${GRID}')
     WHERE lat BETWEEN ${candidate.lat - BBOX_DEG} AND ${candidate.lat + BBOX_DEG}
       AND lng BETWEEN ${candidate.lng - BBOX_DEG} AND ${candidate.lng + BBOX_DEG}`,
  );

  const h3 = t.getChild("h3_r8")!;
  const lat = t.getChild("lat")!;
  const lng = t.getChild("lng")!;
  const pop = t.getChild("population")!;
  const popSrc = t.getChild("pop_source")!;
  const dNet = t.getChild("dist_station_network_m")!;
  const detour = t.getChild("detour_ratio")!;
  const grade = t.getChild("evidence_grade_distance")!;
  const commune = t.getChild("commune_code")!;
  const communeName = t.getChild("commune_name")!;

  const rows: GridCellSimInput[] = new Array(t.numRows);
  for (let r = 0; r < t.numRows; r++) {
    rows[r] = {
      h3_r8: String(h3.get(r)),
      lat: Number(lat.get(r)),
      lng: Number(lng.get(r)),
      population: toNum(pop.get(r)),
      pop_source: toStr(popSrc.get(r)),
      dist_station_network_m: toNum(dNet.get(r)),
      detour_ratio: toNum(detour.get(r)),
      evidence_grade_distance: toStr(grade.get(r)),
      commune_code: toStr(commune.get(r)),
      // `toStr` giữ null NGUYÊN VẸN — không `?? "Ô H3"`, không chuỗi rỗng thành tên. Thiếu
      // tên là một sự thật của hàng đó, và §7.5 xử lý nó bằng cách bỏ hàng ra khỏi danh
      // sách địa danh chứ không bịa một nhãn.
      commune_name: toStr(communeName.get(r)),
    };
  }
  return rows;
}

let occCache: Promise<Map<string, OccupancySimInput>> | null = null;

/** util 30 ngày theo `station_code` — nguồn của ngoại lệ cao tải (§1.9) và danh sách ngữ cảnh. */
export function fetchOccupancySummary(): Promise<Map<string, OccupancySimInput>> {
  if (occCache) return occCache;
  const path = dataPath("station_occupancy.parquet");
  occCache = (async () => {
    await registerParquet(path);
    const t = await query(
      `SELECT station_code, util, grade, util_reportable, window_start_utc, window_end_utc
       FROM read_parquet('${path}')`,
    );
    const code = t.getChild("station_code")!;
    const util = t.getChild("util")!;
    const grade = t.getChild("grade")!;
    const rep = t.getChild("util_reportable")!;
    const w0 = t.getChild("window_start_utc")!;
    const w1 = t.getChild("window_end_utc")!;

    const out = new Map<string, OccupancySimInput>();
    for (let r = 0; r < t.numRows; r++) {
      const c = code.get(r);
      if (c === null || c === undefined) continue;
      const repRaw = rep.get(r);
      out.set(String(c), {
        util: toNum(util.get(r)),
        grade: toStr(grade.get(r)),
        util_reportable:
          repRaw === null || repRaw === undefined ? null : Boolean(repRaw),
        window_start_utc: toIsoStr(w0.get(r)),
        window_end_utc: toIsoStr(w1.get(r)),
      });
    }
    return out;
  })().catch((error) => {
    occCache = null;
    throw error;
  });
  return occCache;
}
