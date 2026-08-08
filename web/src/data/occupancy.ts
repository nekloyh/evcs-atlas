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
import { STATIONS } from "./queries";
import { isInScope } from "./scope";

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
  cache ??= (async () => {
    await Promise.all([registerParquet(STATIONS), registerParquet(PROFILE_168H)]);

    // Thứ tự trạm do truy vấn này quyết định, và nó phải ỔN ĐỊNH: chỉ số `s` là khoá liên
    // kết giữa `stations[]` và hai mảng phẳng. `ORDER BY station_code` để hai lần chạy cho
    // cùng một thứ tự, kể cả khi DuckDB đổi kế hoạch truy vấn.
    const st = await query(
      `SELECT station_code, station_id, lat, lng, scope, n_ports, op_status
       FROM read_parquet('${STATIONS}')
       WHERE lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY station_code`,
    );
    const n = st.numRows;
    const codes = st.getChild("station_code")!;
    const sids = st.getChild("station_id")!;
    const lats = st.getChild("lat")!;
    const lngs = st.getChild("lng")!;
    const scopes = st.getChild("scope")!;
    const ports = st.getChild("n_ports")!;
    const ops = st.getChild("op_status")!;

    const stations: StationRow[] = new Array(n);
    const nPorts = new Float32Array(n);
    const index = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const code = String(codes.get(i));
      stations[i] = {
        code,
        id: String(sids.get(i)),
        lat: Number(lats.get(i)),
        lng: Number(lngs.get(i)),
        inScope: isInScope(String(scopes.get(i))),
        opStatus: String(ops.get(i) ?? "UNKNOWN"),
      };
      index.set(code, i);
      const p = ports.get(i);
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

    return { stations, profiles: { occ, observed, nPorts, n } };
  })();
  return cache;
}
