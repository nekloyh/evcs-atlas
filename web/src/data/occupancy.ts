/**
 * Nạp hồ sơ occupancy 168h — nguồn của trường `station:occ` (§13c-1) và của heatmap dock.
 *
 * Tách khỏi `queries.ts` vì nó là **một khái niệm** (nhịp trạm theo giờ) và nó nạp LƯỜI:
 * 116.785 dòng chỉ cần khi mentor chọn trường nhịp trạm hoặc mở dock — cùng luật với
 * `roads.parquet` và `poi.geojson` (§5a).
 *
 * Nghĩa của dữ liệu (công thức, ngưỡng, phép gộp) sống ở `viz/occ.ts`, không ở đây. File
 * này chỉ biến Arrow thành `Float32Array`.
 */

import { query, registerParquet } from "./duckdb";
import { HOURS_IN_WEEK } from "../state/types";
import type { OccProfiles } from "../viz/occ";
import { dataPath } from "./province";
import { fetchStations } from "./queries";

export const PROFILE_168H = dataPath("station_occupancy_profile_168h.parquet");

/** Một trạm, ở dạng lớp trạm cần để VẼ. Thứ tự trong mảng là chỉ số `s` của `OccProfiles`. */
export interface StationRow {
  code: string;
  /** `station_id` — định danh trong khoá `c` (M4.1), khác `code` (xem `STATION_ID_RE`). */
  id: string;
  lat: number;
  lng: number;
  /** thuộc phạm vi đang xem, hay chỉ ở vành đệm 5 km — xem `isInScope` (`queries.ts`). */
  inScope: boolean;
  /** `op_status` thô — vào kênh NÉT ở §4d-3a, không vào màu. */
  opStatus: string;
}

export interface StationOccupancy {
  stations: StationRow[];
  profiles: OccProfiles;
}

let cache: Promise<StationOccupancy> | null = null;

/**
 * 939 trạm × 168 giờ.
 *
 * `NaN` là giá trị khởi tạo có chủ ý, không phải 0: **1.319 ô giờ không có dòng nào** và
 * **236 trạm không có hồ sơ nào**. Khởi tạo bằng 0 sẽ biến cả hai thành "0 cổng bận, quan
 * sát 0 giờ" — cái thứ hai vô hại (dưới ngưỡng ⇒ không tô), nhưng cái thứ nhất là đúng lời
 * nói dối mà ràng buộc 1 cấm, và nó sẽ lọt qua vì `observed_h = 0` chỉ tình cờ chặn được
 * nó. Dựa vào một sự tình cờ để giữ một ràng buộc là cách ràng buộc đó gãy sau này.
 */
export function fetchOccupancy(): Promise<StationOccupancy> {
  if (cache) return cache;
  cache = (async () => {
    // Reuse the Station core snapshot. This removes the former second full stations scan
    // when Utilization was opened after Supply.
    const [coreStations] = await Promise.all([fetchStations(), registerParquet(PROFILE_168H)]);
    const n = coreStations.length;

    const stations: StationRow[] = new Array(n);
    const nPorts = new Float32Array(n);
    const index = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const source = coreStations[i]!;
      const code = source.stationCode ?? "";
      stations[i] = {
        code,
        id: source.id,
        lat: source.lat,
        lng: source.lng,
        inScope: source.inScope,
        opStatus: source.opStatus,
      };
      if (code) index.set(code, i);
      const p = source.nPorts;
      // KHÔNG `?? 0`: 26 trạm khuyết `n_ports`. Mẫu số bằng 0 sẽ cho `Infinity`, mẫu số
      // "coi như 0 cổng" sẽ cho một trạm không tồn tại. `NaN` = không có mẫu số (§13c-1).
      nPorts[i] = p === null || p === undefined ? NaN : Number(p);
    }

    const size = n * HOURS_IN_WEEK;
    const occ = new Float32Array(size).fill(NaN);
    const observed = new Float32Array(size).fill(NaN);

    const pr = await query(
      `SELECT station_code, dow, hour, occ, observed_h FROM read_parquet('${PROFILE_168H}')`,
    );
    const pc = pr.getChild("station_code")!;
    const pd = pr.getChild("dow")!;
    const ph = pr.getChild("hour")!;
    const po = pr.getChild("occ")!;
    const pb = pr.getChild("observed_h")!;
    for (let r = 0; r < pr.numRows; r++) {
      const s = index.get(String(pc.get(r)));
      if (s === undefined) continue; // trạm có hồ sơ nhưng thiếu toạ độ — không vẽ được
      const t = Number(pd.get(r)) * 24 + Number(ph.get(r));
      if (!(t >= 0 && t < HOURS_IN_WEEK)) continue;
      const i = s * HOURS_IN_WEEK + t;
      const o = po.get(r);
      const b = pb.get(r);
      occ[i] = o === null || o === undefined ? NaN : Number(o);
      observed[i] = b === null || b === undefined ? NaN : Number(b);
    }

    const inScope = stations.map((s) => s.inScope);
    return { stations, profiles: { occ, observed, nPorts, inScope, n } };
  })().catch((error) => {
    cache = null;
    throw error;
  });
  return cache;
}
