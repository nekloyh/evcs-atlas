/**
 * VÙNG TẢI — gộp `Σocc / Σn_ports` theo ô H3 đa mức phân giải.
 *
 * `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §10.3, §11, §18.1.
 *
 * ── Vì sao vùng chứ không phải chấm ở overview ────────────────────────────────────────
 *
 * Đo được, không phải cảm nhận: ở z8 Hà Nội **98,45%** trạm có ít nhất một chấm khác chồng
 * lên (phép chiếu Web Mercator, đúng bán kính `stationFieldRadius` hiện hành), z10 còn
 * 72,68%. Một tấm bản đồ mà gần như mọi mark đều bị mark khác che thì thứ mắt đọc được là
 * **mật độ trạm**, không phải tỉ lệ cổng bận — và hai thứ đó không cùng dấu.
 *
 * Gộp theo H3 không làm dữ liệu "đúng hơn". Nó làm **đơn vị đọc** rõ ra: một cell là một
 * vùng thống kê có tử số, mẫu số và số trạm in được ra tooltip, thay vì một đám chấm mà
 * chấm trên cùng thắng vì nó tình cờ nằm cuối draw order.
 *
 * ── Ba luật của file này ──────────────────────────────────────────────────────────────
 *
 *   1. **Ratio-of-sums, không bao giờ average-of-rates.** Hai phép này lệch nhau tới
 *      4,18 điểm % ở Hà Nội, 4,45 ở Lâm Đồng, và **đổi cả dấu** ở Điện Biên (−0,73 trung
 *      bình nhưng +13,74 ở giờ tệ nhất). Không có fallback. `Σocc` và `Σn_ports` được giữ
 *      RIÊNG cho tới lúc chia, và phép chia chỉ viết một lần ở `utilizationOf`.
 *   2. **Membership dựng MỘT LẦN, thống kê precompute MỘT LẦN.** Scrub 4 giờ/giây chỉ
 *      được phép là một phép tra mảng theo `t`. Không `groupBy` trong accessor, không
 *      truy vấn, không dựng lại khi `t` đổi (spec §18.1).
 *   3. **Trạm không định vị được KHÔNG bị gán bừa vào cell nào.** Nó đi vào
 *      `unlocated` và được công bố; cộng nó vào một cell gần đó là bịa một vị trí.
 */

import { cellToParent, latLngToCell } from "h3-js";

import { HOURS_IN_WEEK } from "../state/types";
import type { StationOccupancy } from "../data/occupancy";
import { eligibleStationHour, occGroupTotals, utilizationOf, type OccProfiles } from "./occ";

/** Ba mức phân giải của chế độ Vùng tải. r8 là mức của lưới phân tích; r7/r6 là cha của nó. */
export const UTIL_RESOLUTIONS = [6, 7, 8] as const;
export type UtilResolution = (typeof UTIL_RESOLUTIONS)[number];

/**
 * Ranh giới LOD — **hằng của representation, không phải của tỉnh**.
 *
 * Số cell đo trên hai gói rất khác nhau: Hà Nội 88 / 266 / 449 ở r6/r7/r8, Lâm Đồng
 * 116 / 173 / 214. Chốt ranh giới theo phân phối từng tỉnh sẽ khiến cùng một mức phóng
 * cho hai đơn vị đọc khác nhau ở hai gói, tức người xem học một quy tắc rồi nó sai ở tỉnh
 * thứ hai. Ranh giới ở đây là quy ước của cách vẽ, và nó giống nhau ở mọi gói.
 *
 * `>= UTIL_STATION_MIN_ZOOM` là DRILL-DOWN: vùng nhường chỗ cho chấm trạm và Inspector.
 */
export const UTIL_LOD_R7_MIN_ZOOM = 9.5;
export const UTIL_LOD_R8_MIN_ZOOM = 11.5;
export const UTIL_STATION_MIN_ZOOM = 13;

/**
 * Mức phân giải cho một mức phóng, hoặc `null` khi đã tới ngưỡng chấm trạm.
 *
 * `null` là một câu trả lời, không phải một lỗi: nó nói "ở đây đơn vị đọc là TRẠM".
 */
export function utilResolutionForZoom(zoom: number): UtilResolution | null {
  if (!Number.isFinite(zoom)) return 6;
  if (zoom >= UTIL_STATION_MIN_ZOOM) return null;
  if (zoom >= UTIL_LOD_R8_MIN_ZOOM) return 8;
  if (zoom >= UTIL_LOD_R7_MIN_ZOOM) return 7;
  return 6;
}

/**
 * Ô r8 của một trạm — thứ tự ưu tiên của spec §11.2.
 *
 * 1. cột `h3_r8` nếu hợp lệ;
 * 2. tính từ `lat`/`lng` nếu toạ độ hữu hạn;
 * 3. `null` — và `null` là một trạng thái được CÔNG BỐ, không phải một chỗ để đoán.
 *
 * Bước 2 không phải một phép xấp xỉ: đo trên cả 710 trạm IN của gói `p/01`,
 * `latLngToCell(lat, lng, 8)` khớp cột `h3_r8` **710/710**. Nó là bản dựng lại đúng của
 * cùng một hàm, nên một gói cũ thiếu cột vẫn cho đúng cell chứ không cho một cell khác.
 */
const H3_R8_RE = /^[0-9a-f]{15}$/;

export function stationCellR8(station: {
  h3?: string | null;
  lat: number;
  lng: number;
}): string | null {
  const declared = station.h3;
  if (typeof declared === "string" && H3_R8_RE.test(declared)) return declared;
  if (!Number.isFinite(station.lat) || !Number.isFinite(station.lng)) return null;
  try {
    return latLngToCell(station.lat, station.lng, 8);
  } catch {
    return null;
  }
}

/** Một vùng thống kê. KHÔNG phải một địa bàn kinh doanh, không phải một đơn vị hành chính. */
export interface UtilRegionCell {
  h3: string;
  resolution: UtilResolution;
  /** chỉ số trạm trong `OccProfiles` — tập nền bất biến theo `t` */
  members: readonly number[];
  /** `all_installed_ports(g)` — cổng lắp đặt biết được trong vùng */
  installedPorts: number;
  /** `all_stations(g)` — trạm IN trong vùng, kể cả trạm khuyết `n_ports` */
  stations: number;
  /** trạm IN khuyết `n_ports`: có mặt trong vùng nhưng không có mẫu số nào để góp */
  stationsWithoutPorts: number;
  /** tâm để đặt nhãn/định vị camera — trung bình toạ độ thành viên, không phải tâm hình học */
  lat: number;
  lng: number;
}

/** Một mức phân giải, kèm thống kê đủ đã precompute cho cả 168 giờ. */
export interface UtilRegionLevel {
  resolution: UtilResolution;
  cells: readonly UtilRegionCell[];
  byId: ReadonlyMap<string, number>;
  /** `[cell * 168 + t]` — `Σocc` */
  busy: Float64Array;
  /** `[cell * 168 + t]` — `Σn_ports` của CHÍNH các trạm đã góp tử số */
  ports: Float64Array;
  /** `[cell * 168 + t]` — số trạm đóng góp */
  contributors: Int32Array;
  /** `[cell * 168 + t]` — `Σ observed_h × n_ports` trên mọi trạm có mẫu số của vùng */
  observedHourPorts: Float64Array;
}

/** Trạm không gán được vào cell nào — công bố, không gộp. */
export interface UtilUnlocated {
  stations: number;
  installedPorts: number;
}

export interface UtilRegionIndex {
  levels: Readonly<Record<UtilResolution, UtilRegionLevel>>;
  /** tổng của các trạm ĐỊNH VỊ ĐƯỢC — mốc đối chiếu của phép kiểm bảo toàn */
  locatedTotals: { installedPorts: number; stations: number };
  unlocated: UtilUnlocated;
}

/** Số đọc được của MỘT vùng tại MỘT giờ — mọi tử số/mẫu số phải in ra được. */
export interface UtilRegionReadout {
  h3: string;
  resolution: UtilResolution;
  lat: number;
  lng: number;
  /** `Σocc / Σn_ports`; `null` khi không trạm nào đủ quan sát — KHÔNG phải 0 */
  utilization: number | null;
  busyPortsAvg: number;
  observedPorts: number;
  contributingStations: number;
  installedPorts: number;
  stations: number;
  /** `observed_ports / all_installed_ports`; `null` khi vùng không có cổng nào biết được */
  portCoverage: number | null;
  /** `|E(g,t)| / all_stations` */
  stationCoverage: number | null;
  /** giờ quan sát trung bình trên mỗi cổng LẮP ĐẶT của vùng */
  observedHoursPerPort: number;
}

/**
 * Ngưỡng CẢNH BÁO coverage cổng — kế thừa sàn data-health, **không phải** giấy chứng nhận.
 *
 * Dưới ngưỡng: vùng vẽ nét đứt. Trên ngưỡng: vùng vẽ nét thường. Không có chỗ nào trong
 * UI được gọi phần trên ngưỡng là "đủ coverage" — chưa có nghiên cứu sai số nào nói 50%,
 * 80% hay 95% là đủ cho một quyết định vùng, nên con số CHÍNH XÁC luôn đứng trong tooltip
 * thay cho một cái nhãn (spec §13, §24-3).
 */
export const UTIL_LOW_COVERAGE = 0.5;

export function isLowPortCoverage(coverage: number | null): boolean {
  return coverage !== null && coverage < UTIL_LOW_COVERAGE;
}

/**
 * Dựng membership + precompute thống kê đủ cho cả ba mức phân giải.
 *
 * Chi phí đo được: gói lớn nhất hiện có là 710 trạm IN → 803 cell trên cả ba mức, tức
 * `803 × 168 × 4 mảng` ≈ 3,2 MB `Float64Array`/`Int32Array`. Đó là cái giá để một tick
 * scrubber chỉ còn là `arr[cell * 168 + t]`.
 */
export function buildUtilRegions(occupancy: StationOccupancy): UtilRegionIndex {
  const p = occupancy.profiles;
  const r8Of: (string | null)[] = new Array(p.n).fill(null);
  let unlocatedStations = 0;
  let unlocatedPorts = 0;

  for (let s = 0; s < p.n; s++) {
    if (!p.inScope[s]) continue;
    const st = occupancy.stations[s];
    if (!st) continue;
    const cell = stationCellR8(st);
    if (cell) {
      r8Of[s] = cell;
      continue;
    }
    unlocatedStations++;
    const ports = p.nPorts[s];
    if (ports !== undefined && Number.isFinite(ports) && ports > 0) unlocatedPorts += ports;
  }

  const located: number[] = [];
  for (let s = 0; s < p.n; s++) if (r8Of[s]) located.push(s);
  const locatedTotals = occGroupTotals(p, located);

  const levels = {} as Record<UtilResolution, UtilRegionLevel>;
  for (const resolution of UTIL_RESOLUTIONS) {
    levels[resolution] = buildLevel(p, occupancy, r8Of, located, resolution);
  }

  return {
    levels,
    locatedTotals: { installedPorts: locatedTotals.installedPorts, stations: locatedTotals.stations },
    unlocated: { stations: unlocatedStations, installedPorts: unlocatedPorts },
  };
}

function buildLevel(
  p: OccProfiles,
  occupancy: StationOccupancy,
  r8Of: readonly (string | null)[],
  located: readonly number[],
  resolution: UtilResolution,
): UtilRegionLevel {
  const groups = new Map<string, number[]>();
  for (const s of located) {
    const r8 = r8Of[s]!;
    // `cellToParent` là phép ánh xạ XÁC ĐỊNH của H3, nên r6/r7 không phải một phép gộp
    // gần đúng: mọi trạm trong một cell r8 luôn nằm trong đúng một cell r7 và một r6, và
    // phép cộng bảo toàn qua từng bậc (kiểm ở `util-regions.test.ts`).
    const id = resolution === 8 ? r8 : cellToParent(r8, resolution);
    const bucket = groups.get(id);
    if (bucket) bucket.push(s);
    else groups.set(id, [s]);
  }

  // Thứ tự cell là thứ tự TỰ VỰNG của mã H3, không phải thứ tự duyệt trạm: hai lần dựng
  // trên cùng dữ liệu phải cho cùng mảng, nếu không thì `data` của deck đổi tham chiếu vô
  // cớ và ảnh chụp hồi quy không so được.
  const ids = [...groups.keys()].sort();
  const cells: UtilRegionCell[] = new Array(ids.length);
  const byId = new Map<string, number>();

  const size = ids.length * HOURS_IN_WEEK;
  const busy = new Float64Array(size);
  const ports = new Float64Array(size);
  const contributors = new Int32Array(size);
  const observedHourPorts = new Float64Array(size);

  for (let c = 0; c < ids.length; c++) {
    const id = ids[c]!;
    const members = groups.get(id)!;
    byId.set(id, c);

    const totals = occGroupTotals(p, members);
    let latSum = 0;
    let lngSum = 0;
    for (const s of members) {
      const st = occupancy.stations[s]!;
      latSum += st.lat;
      lngSum += st.lng;
    }
    cells[c] = {
      h3: id,
      resolution,
      members,
      installedPorts: totals.installedPorts,
      stations: totals.stations,
      stationsWithoutPorts: totals.stationsWithoutPorts,
      lat: latSum / members.length,
      lng: lngSum / members.length,
    };

    const base = c * HOURS_IN_WEEK;
    for (const s of members) {
      const nPorts = p.nPorts[s];
      if (nPorts === undefined || !Number.isFinite(nPorts) || nPorts <= 0) continue;
      const row = s * HOURS_IN_WEEK;
      for (let t = 0; t < HOURS_IN_WEEK; t++) {
        const obs = p.observed[row + t];
        if (obs !== undefined && Number.isFinite(obs)) observedHourPorts[base + t]! += obs * nPorts;
        const e = eligibleStationHour(p, s, t);
        if (!e) continue;
        busy[base + t]! += e.occ;
        ports[base + t]! += e.ports;
        contributors[base + t]! += 1;
      }
    }
  }

  return { resolution, cells, byId, busy, ports, contributors, observedHourPorts };
}

/** Số đọc của một cell theo chỉ số nội bộ — dùng trong vòng lặp vẽ. */
export function regionReadoutAt(
  level: UtilRegionLevel,
  cellIndex: number,
  t: number,
): UtilRegionReadout | null {
  const cell = level.cells[cellIndex];
  if (!cell) return null;
  const i = cellIndex * HOURS_IN_WEEK + t;
  const stats = {
    busyPortsAvg: level.busy[i]!,
    observedPorts: level.ports[i]!,
    contributingStations: level.contributors[i]!,
    observedHourPorts: level.observedHourPorts[i]!,
  };
  return {
    h3: cell.h3,
    resolution: cell.resolution,
    lat: cell.lat,
    lng: cell.lng,
    utilization: utilizationOf(stats),
    busyPortsAvg: stats.busyPortsAvg,
    observedPorts: stats.observedPorts,
    contributingStations: stats.contributingStations,
    installedPorts: cell.installedPorts,
    stations: cell.stations,
    portCoverage: cell.installedPorts > 0 ? stats.observedPorts / cell.installedPorts : null,
    stationCoverage: cell.stations > 0 ? stats.contributingStations / cell.stations : null,
    observedHoursPerPort:
      cell.installedPorts > 0 ? stats.observedHourPorts / cell.installedPorts : 0,
  };
}

/** Số đọc của một cell theo MÃ H3 — dùng cho selection và tooltip. */
export function regionReadoutOf(
  index: UtilRegionIndex,
  resolution: UtilResolution,
  h3: string,
  t: number,
): UtilRegionReadout | null {
  const level = index.levels[resolution];
  const c = level.byId.get(h3);
  return c === undefined ? null : regionReadoutAt(level, c, t);
}

/** Cả mức phân giải tại một giờ — đầu vào của lớp vẽ. Mảng mới mỗi `t`, cell thì không. */
export function regionsAt(
  index: UtilRegionIndex,
  resolution: UtilResolution,
  t: number,
): UtilRegionReadout[] {
  const level = index.levels[resolution];
  const out: UtilRegionReadout[] = new Array(level.cells.length);
  for (let c = 0; c < level.cells.length; c++) out[c] = regionReadoutAt(level, c, t)!;
  return out;
}

/** Trạm thành viên của một vùng, tách theo "có góp ở giờ này hay không" — Inspector §14.2. */
export interface UtilRegionMembers {
  contributing: { station: number; occ: number; ports: number; rate: number }[];
  silent: number[];
}

export function regionMembersAt(
  index: UtilRegionIndex,
  resolution: UtilResolution,
  h3: string,
  t: number,
  p: OccProfiles,
): UtilRegionMembers {
  const level = index.levels[resolution];
  const c = level.byId.get(h3);
  const cell = c === undefined ? null : level.cells[c];
  if (!cell) return { contributing: [], silent: [] };
  const contributing: UtilRegionMembers["contributing"] = [];
  const silent: number[] = [];
  for (const s of cell.members) {
    const e = eligibleStationHour(p, s, t);
    if (e) contributing.push({ station: s, occ: e.occ, ports: e.ports, rate: e.rate });
    else silent.push(s);
  }
  // Xếp theo SỐ CỔNG BẬN giảm dần: đó là đại lượng cộng được đã tạo ra tử số của vùng, nên
  // đọc từ trên xuống là đọc đúng thứ tự đóng góp. Xếp theo tỉ lệ sẽ đẩy một trạm 1 cổng
  // bận 100% lên trên một trạm 30 cổng bận 60%, và trạm thứ hai mới là thứ tạo ra con số.
  contributing.sort((a, b) => b.occ - a.occ || b.ports - a.ports);
  return { contributing, silent };
}
