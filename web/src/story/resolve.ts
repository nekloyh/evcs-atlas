/**
 * Từ GÓI DỮ LIỆU tới CON SỐ — PHASE7_STORY_MODE.md §1.4, §1.5, §1.8.
 *
 * Đây là cửa DUY NHẤT mà một số đi qua trước khi thành chữ trên màn hình. Nó tồn tại riêng
 * (không nằm trong renderer) vì hai lý do đo được:
 *
 *  1. **Nó test được bằng `node --test`.** Không React, không DuckDB, không `window`. Một
 *     câu nói sai vì khe số phân giải sai là loại lỗi mà ảnh chụp không bắt được.
 *  2. **Nó là chỗ luật R5 sống.** Khe không phân giải được ⇒ `null` ⇒ **câu biến mất**.
 *     Không `?? 0`, không dấu "—" đứng chỗ một luận điểm. Nếu luật này nằm rải trong JSX
 *     thì mỗi chỗ sẽ tự chọn một cách "xử lý thiếu số", và một trong số đó sẽ là số 0.
 */

import { gridDisk } from "h3-js";

import type { Manifest } from "../data/manifest";
import type {
  CommuneCollection,
  DetourStats,
  GridCell,
  RoadSeg,
  ShowcaseRoute,
  StationPoint,
} from "../data/queries";
import type { StationOccupancy } from "../data/occupancy";
import type { OpportunityCommuneRow } from "../viz/chart-models";
import {
  buildAccessPopulationCurve,
  buildOpportunityCommuneRank,
  buildSpatialStructureModel,
  buildSupplyPowerTierBreakdown,
  buildUtilizationWeekModel,
  type SpatialStructureModel,
} from "../viz/chart-models";
import { areaShareForPop, lorenz, popShareForArea, type DemandCell, type Lorenz } from "../viz/lorenz";
import { supplyEquity } from "../viz/equity";
import { OBSERVED_H_MIN } from "../viz/occ";
import { HOURS_IN_WEEK } from "../state/types";
import { majorBridges } from "./bridges";
import {
  BEYOND_2KM_M,
  DENSITY_QUANTILES,
  DETOUR_THRESHOLD,
  EUCLID_COVERAGE_RADIUS_M,
  MAJOR_BRIDGE_MIN_M,
  SCENE_CONTEXT_ZOOM_OUT,
} from "../domain-thresholds";
import type { AssumptionId, MetricRef, SharedModelId, SubjectSpec } from "./spec";

// ── Gói dữ liệu ─────────────────────────────────────────────────────────────

/**
 * Mọi thứ câu chuyện đọc. Từng mảnh có thể `null` = **chưa về**, và "chưa về" khác "bằng 0".
 *
 * Không mảnh nào do `story/` đi lấy: chúng tới từ những loader mà workspace đã dùng
 * (§4.1). Cảnh là NGƯỜI GỌI ĐẦU TIÊN của vài builder, không phải chủ của builder nào.
 */
export interface StoryPackage {
  manifest: Manifest | null;
  /** một lần quét lưới nuôi cả Lorenz, cấu trúc không gian và Lorenz cung */
  demand: readonly DemandCell[] | null;
  communes: CommuneCollection | null;
  stations: readonly StationPoint[] | null;
  roads: readonly RoadSeg[] | null;
  routes: readonly ShowcaseRoute[] | null;
  detour: DetourStats | null;
  /** snapshot trường đang tô — chỉ dùng cho HÌNH đường cong tiếp cận, không cho con số */
  cells: readonly GridCell[] | null;
  opportunity: readonly OpportunityCommuneRow[] | null;
  occupancy: StationOccupancy | null;
}

export const EMPTY_PACKAGE: StoryPackage = {
  manifest: null,
  demand: null,
  communes: null,
  stations: null,
  roads: null,
  routes: null,
  detour: null,
  cells: null,
  opportunity: null,
  occupancy: null,
};

// ── Giả định khai báo ───────────────────────────────────────────────────────

export interface Assumption {
  id: AssumptionId;
  value: number | readonly number[];
  /** cách in ra; luôn kèm chữ *giả định* ở renderer (§4.3 luật R4) */
  fmt: "meters" | "km" | "multiple" | "count" | "quantiles" | "zoom";
  /** đơn vị đi kèm — một con số trần không nói nó đếm cái gì */
  unit?: string;
  what: string;
}

/**
 * Năm hằng số chính sách cộng hai ngưỡng quan sát — §4.3.
 *
 * Đây là chỗ **duy nhất** trong `story/` mà một số được phép tới màn hình, và cái giá của
 * ngoại lệ ấy là: mỗi cái phải nói ra rằng nó là một lựa chọn, không phải một số đo.
 */
export const ASSUMPTIONS: Record<AssumptionId, Assumption> = {
  "beyond-2km": {
    id: "beyond-2km",
    value: BEYOND_2KM_M,
    fmt: "meters",
    what: "bán kính phục vụ — do ta quy định, không phải thứ dữ liệu tìm ra",
  },
  "detour-threshold": {
    id: "detour-threshold",
    value: DETOUR_THRESHOLD,
    fmt: "multiple",
    what: "từ đâu thì gọi là “đường thật dài hơn hẳn đường chim bay”",
  },
  "major-bridge-min": {
    id: "major-bridge-min",
    value: MAJOR_BRIDGE_MIN_M,
    fmt: "meters",
    what: "cầu dài bao nhiêu thì kẻ đậm — dữ liệu KHÔNG có cờ “bắc qua sông nào”",
  },
  "euclid-coverage-radius": {
    id: "euclid-coverage-radius",
    value: EUCLID_COVERAGE_RADIUS_M,
    fmt: "meters",
    what: "bán kính dùng để so hai thước đo với nhau",
  },
  "scene-context-zoom-out": {
    id: "scene-context-zoom-out",
    value: SCENE_CONTEXT_ZOOM_OUT,
    fmt: "zoom",
    what: "lùi mấy bậc so với phép khớp khung của điều hướng, để thấy vùng quanh đối tượng",
  },
  "density-quantiles": {
    id: "density-quantiles",
    value: DENSITY_QUANTILES,
    fmt: "quantiles",
    what: "các lát cắt mật độ — chính việc đổi lát cắt là luận điểm",
  },
  "observed-h-min": {
    id: "observed-h-min",
    value: OBSERVED_H_MIN,
    fmt: "count",
    unit: "giờ quan sát",
    what: "dưới ngần này giờ quan sát thì ô giờ là “chưa quan sát”, không phải “vắng khách”",
  },
};

// ── Mô hình dùng chung ──────────────────────────────────────────────────────

/**
 * Hai chỗ ĐỌC NGƯỢC đường Lorenz — "bao nhiêu diện tích chứa một nửa dân" và "một phần
 * mười diện tích dày nhất chứa bao nhiêu dân".
 *
 * Đặt tên thay vì gõ `0.5` / `0.1` tại chỗ, vì cả hai đều đi ra màn hình trong câu chữ
 * ("một nửa", "10% diện tích") và một câu chữ rời khỏi con số sinh ra nó là đúng cái lỗi
 * pha này đang gỡ.
 */
const POP_READ_SHARE = 0.5;
const AREA_READ_SHARE = 0.1;

/** Bao nhiêu xã đứng đầu được cộng lại thành một câu — cũng là một lựa chọn, cũng là khe. */
const TOP_N = 10;

type Bag = Record<string, unknown>;

/** Đọc `a.b.0.c` trên một object. Trả `null` ở bất kỳ mắt xích nào vắng — không ném. */
export function selectPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined) return null;
    if (Array.isArray(cur)) {
      const i = Number(key);
      if (!Number.isInteger(i)) return null;
      cur = cur[i];
    } else if (typeof cur === "object") {
      cur = (cur as Bag)[key];
    } else {
      return null;
    }
  }
  return cur ?? null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[h - 1]! + s[h]!) / 2;
}

/** Số thuộc tính của một feature xã; `null` khi vắng hoặc không phải số. */
function cnum(f: { properties: Record<string, unknown> }, key: string): number | null {
  return num(f.properties[key]);
}

export interface CommuneFacts {
  code: string;
  name: string;
  population: number | null;
  ports: number | null;
  perPop: number | null;
  /** bội số trung vị; `null` khi tử số bằng 0 — một tỉ số bằng 0 không phải "kém hơn ít" */
  vsMedian: number | null;
  populationBeyond2km: number | null;
  shareBeyond2km: number | null;
}

export interface StoryModels {
  "lorenz-area-pop": Bag | null;
  "spatial-structure": SpatialStructureModel | null;
  "supply-equity": Bag | null;
  "commune-supply": Bag | null;
  detour: Bag | null;
  roads: Bag | null;
  "access-curve": Bag | null;
  "opportunity-rank": Bag | null;
  "utilization-week": Bag | null;
  "power-tier": Bag | null;
  "poi-coverage": Bag | null;
  "province-range": Bag | null;
}

/**
 * Dựng mọi mô hình dùng chung từ gói — một lần cho cả câu chuyện.
 *
 * Mô hình nào thiếu đầu vào thì là `null`, và `null` lan lên thành "câu biến mất". Đó là
 * đường lan đúng: một cảnh nói về mạng đường trong lúc mạng đường chưa nạp xong không được
 * in một con số nào cả, kể cả 0.
 */
export function buildStoryModels(pkg: StoryPackage): StoryModels {
  const m = pkg.manifest;

  // ── Cầu: Lorenz diện tích–dân, và cấu trúc không gian trên CÙNG một lần quét ──
  let lorenzModel: Bag | null = null;
  let structure: SpatialStructureModel | null = null;
  let supply: Bag | null = null;
  if (pkg.demand && pkg.demand.length > 0) {
    const l: Lorenz = lorenz(pkg.demand as DemandCell[]);
    lorenzModel = {
      curve: l,
      gini: l.gini,
      nCells: l.nCells,
      areaForHalfPop: areaShareForPop(l, POP_READ_SHARE),
      popShareForTenthArea: popShareForArea(l, AREA_READ_SHARE),
      // Điểm đọc ngược đường cong là một LỰA CHỌN, nên nó cũng là một khe: câu chữ "x%
      // diện tích dày dân nhất" phải đổi theo nếu ta đổi chỗ đọc.
      areaReadShare: AREA_READ_SHARE,
      popReadShare: POP_READ_SHARE,
      restOfArea:
        areaShareForPop(l, POP_READ_SHARE) === null
          ? null
          : 1 - (areaShareForPop(l, POP_READ_SHARE) as number),
    };

    structure = buildSpatialStructureModel(
      pkg.demand.map((c) => ({ h3: c.h3, value: c.density, pop: c.pop })),
      "pop_density_ppkm2",
      DENSITY_QUANTILES,
      (h) => gridDisk(h, 1),
    );

    const eq = supplyEquity(pkg.demand.map((c) => ({ pop: c.pop, ports: c.ports })));
    // "Bao nhiêu ô chứa một nửa số cổng" — đọc ngược đường cong cung, không đếm lại tay.
    let cellsForHalfPorts: number | null = null;
    let cum = 0;
    const sortedByPorts = [...pkg.demand]
      .filter((c) => c.pop > 0 && Number.isFinite(c.ports))
      .sort((a, b) => b.ports - a.ports);
    const portsWithPop = sortedByPorts.reduce((s, c) => s + c.ports, 0);
    for (let i = 0; i < sortedByPorts.length; i++) {
      cum += sortedByPorts[i]!.ports;
      if (portsWithPop > 0 && cum >= portsWithPop / 2) {
        cellsForHalfPorts = i + 1;
        break;
      }
    }
    const nZeroPortCells = pkg.demand.filter((c) => c.ports === 0).length;
    supply = {
      equity: eq,
      curve: eq.l,
      gini: eq.l.gini,
      portsAll: eq.portsAll,
      portsNoPop: eq.portsNoPop,
      portShareForTenthPop: popShareForArea(eq.l, AREA_READ_SHARE),
      popReadShare: AREA_READ_SHARE,
      cellsForHalfPorts,
      nCells: pkg.demand.length,
      shareCellsZeroPorts: pkg.demand.length > 0 ? nZeroPortCells / pkg.demand.length : null,
    };
  }

  // ── Cung ở tầng XÃ — đơn vị đọc phải nói ra (luật R6) ────────────────────────
  let communeSupply: Bag | null = null;
  if (pkg.communes && pkg.communes.features.length > 0) {
    const fs = pkg.communes.features;
    const ratios = fs
      .map((f) => cnum(f, "ports_per_10k_pop"))
      .filter((v): v is number => v !== null);
    const zero = fs.filter((f) => cnum(f, "n_ports") === 0);
    const popAll = fs.reduce((s, f) => s + (cnum(f, "population") ?? 0), 0);
    const popZero = zero.reduce((s, f) => s + (cnum(f, "population") ?? 0), 0);
    const portsSorted = fs
      .map((f) => cnum(f, "n_ports") ?? 0)
      .sort((a, b) => b - a);
    const portsAll = portsSorted.reduce((s, v) => s + v, 0);
    const top10 = portsSorted.slice(0, TOP_N).reduce((s, v) => s + v, 0);
    communeSupply = {
      n: fs.length,
      median: median(ratios),
      nZeroPorts: zero.length,
      popZeroPorts: popZero,
      shareZeroPorts: popAll > 0 ? popZero / popAll : null,
      top10PortShare: portsAll > 0 ? top10 / portsAll : null,
      topN: TOP_N,
    };
  }

  // ── Đường vòng ──────────────────────────────────────────────────────────────
  let detour: Bag | null = null;
  if (pkg.detour) {
    const d = pkg.detour;
    const falsePositive = d.euclidCovered - d.networkCovered;
    detour = {
      ...d,
      falsePositive,
      falsePositiveShare: d.euclidCovered > 0 ? falsePositive / d.euclidCovered : null,
      radiusKm: EUCLID_COVERAGE_RADIUS_M / 1000,
    };
  }

  // ── Mạng đường: số cầu lớn đo LÚC CHẠY trên chính mảng sẽ được vẽ ───────────
  //
  // KHÔNG đọc `manifest.roads.bridge_ways_shipped` cho con số này: khoá ấy đếm TRƯỚC bộ
  // lọc class/access của export, nên nó nói về một tập khác hẳn tập đang vẽ.
  let roads: Bag | null = null;
  if (pkg.roads && pkg.roads.length > 0) {
    roads = {
      waysDrawn: pkg.roads.length,
      bridgeWays: pkg.roads.filter((r) => r.bridge).length,
      majorBridges: majorBridges(pkg.roads as RoadSeg[]).length,
      unreachable: pkg.roads.filter((r) => r.dist === null).length,
      nRoutePairs: pkg.routes ? pkg.routes.filter((r) => r.kind === "network").length : null,
    };
  }

  // ── Tiếp cận: TỔNG đọc từ Q-P4-4, không từ snapshot trường đang tô ──────────
  //
  // Q-P4-4 gộp theo XÃ nhưng cộng trên chính các ô, nên tổng của nó độc lập với trường nào
  // đang được vẽ. Dùng snapshot trường sẽ làm ba con số của cảnh 4 đổi theo nhịp đang xem.
  let access: Bag | null = null;
  if (pkg.opportunity && pkg.opportunity.length > 0) {
    const rows = pkg.opportunity;
    const within = rows.reduce((s, r) => s + (r.population_within_2km ?? 0), 0);
    const beyond = rows.reduce((s, r) => s + (r.population_beyond_2km ?? 0), 0);
    const unknown = rows.reduce((s, r) => s + (r.population_distance_unknown ?? 0), 0);
    const unknownCells = rows.reduce((s, r) => s + (r.n_distance_unknown ?? 0), 0);
    const total = within + beyond + unknown;
    access = {
      within,
      beyond,
      unknown,
      unknownCells,
      total,
      shareWithin: total > 0 ? within / total : null,
      shareBeyond: total > 0 ? beyond / total : null,
      curve: pkg.cells ? buildAccessPopulationCurve(pkg.cells as GridCell[]) : null,
    };
  }

  // ── Cơ hội: xếp hạng xã ────────────────────────────────────────────────────
  let opportunity: Bag | null = null;
  if (pkg.opportunity && pkg.opportunity.length > 0) {
    const model = buildOpportunityCommuneRank(pkg.opportunity);
    const beyondAll = pkg.opportunity.reduce((s, r) => s + (r.population_beyond_2km ?? 0), 0);
    const sorted = [...pkg.opportunity].sort(
      (a, b) => (b.population_beyond_2km ?? 0) - (a.population_beyond_2km ?? 0),
    );
    const top10 = sorted.slice(0, TOP_N).reduce((s, r) => s + (r.population_beyond_2km ?? 0), 0);
    const shares = pkg.opportunity
      .map((r) => {
        const t = r.population_total;
        return t !== null && t > 0 ? (r.population_beyond_2km ?? 0) / t : null;
      })
      .filter((v): v is number => v !== null);
    const worst = shares.length > 0 ? Math.max(...shares) : null;
    opportunity = {
      model,
      topShareOfGap:
        beyondAll > 0 && sorted[0] ? (sorted[0].population_beyond_2km ?? 0) / beyondAll : null,
      top10ShareOfGap: beyondAll > 0 ? top10 / beyondAll : null,
      topN: TOP_N,
      nMajorityBeyond: shares.filter((s) => s > 0.5).length,
      nAtHundredPercent: shares.filter((s) => s >= 1).length,
      worstShare: worst,
      nCommunes: pkg.opportunity.length,
    };
  }

  // ── Nhịp tuần ──────────────────────────────────────────────────────────────
  let util: Bag | null = null;
  if (pkg.occupancy) {
    const heat = buildUtilizationWeekModel(pkg.occupancy);
    const rated = heat.cells.filter((c) => c.utilization !== null);
    if (rated.length > 0) {
      let peak = rated[0]!;
      let trough = rated[0]!;
      for (const c of rated) {
        if (c.utilization! > peak.utilization!) peak = c;
        if (c.utilization! < trough.utilization!) trough = c;
      }
      const nInScope = pkg.occupancy.stations.filter((s) => s.inScope).length;
      // Số trạm CÓ hồ sơ: đếm trạm trong phạm vi có ít nhất một giờ quan sát được. Đây là
      // định nghĩa THỨ NHẤT của chữ "đo được"; `manifest.quality.share_stations_measured`
      // là định nghĩa THỨ HAI (`occ_status = OK`). Cảnh in cả hai — luật R3 cấm một cảnh
      // dùng một chữ theo hai nghĩa, nên nghĩa nào cũng phải có tên riêng cạnh nó.
      let withProfile = 0;
      const p = pkg.occupancy.profiles;
      for (let s = 0; s < p.n; s++) {
        if (!(p.inScope ? p.inScope[s] : true)) continue;
        for (let t = 0; t < HOURS_IN_WEEK; t++) {
          const obs = p.observed[s * HOURS_IN_WEEK + t];
          if (obs !== undefined && Number.isFinite(obs) && obs >= OBSERVED_H_MIN) {
            withProfile++;
            break;
          }
        }
      }
      util = {
        model: heat,
        peak: peak.utilization,
        trough: trough.utilization,
        peakT: peak.t,
        troughT: trough.t,
        ratio: trough.utilization! > 0 ? peak.utilization! / trough.utilization! : null,
        weekMean: rated.reduce((s, c) => s + c.utilization!, 0) / rated.length,
        nRatedHours: rated.length,
        nBelowFloor: countBelowFloor(pkg.occupancy),
        nStationsWithProfile: withProfile,
        shareStationsWithProfile: nInScope > 0 ? withProfile / nInScope : null,
        installedPorts: heat.allInstalledPorts,
        nInScope,
      };
    }
  }

  // ── Bậc công suất ──────────────────────────────────────────────────────────
  let power: Bag | null = null;
  if (pkg.stations && pkg.stations.length > 0) {
    const model = buildSupplyPowerTierBreakdown(pkg.stations as StationPoint[]);
    const inScope = pkg.stations.filter((s) => s.inScope);
    const low = model.tiers.filter((t) => t.tierId === "le-22");
    const portsAll = model.tiers.reduce((s, t) => s + t.portsSum, 0);
    const kwAll = model.tiers.reduce((s, t) => s + t.powerSiteKwSum, 0);
    // Một nhà vận hành: bắt buộc phải nói, nên nó là một KHE chứ không phải một câu chữ.
    const byOperator = new Map<string, number>();
    for (const s of inScope) {
      const op = (s.operator ?? "").trim();
      if (op.length === 0) continue;
      byOperator.set(op, (byOperator.get(op) ?? 0) + 1);
    }
    const topOperator = [...byOperator.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    power = {
      model,
      nInScope: inScope.length,
      nBuffer: pkg.stations.length - inScope.length,
      nAll: pkg.stations.length,
      lowTierStations: low.reduce((s, t) => s + t.nStations, 0),
      lowTierShare:
        inScope.length > 0 ? low.reduce((s, t) => s + t.nStations, 0) / inScope.length : null,
      lowTierPorts: low.reduce((s, t) => s + t.portsSum, 0),
      lowTierPortShare:
        portsAll > 0 ? low.reduce((s, t) => s + t.portsSum, 0) / portsAll : null,
      lowTierKw: low.reduce((s, t) => s + t.powerSiteKwSum, 0),
      lowTierKwShare: kwAll > 0 ? low.reduce((s, t) => s + t.powerSiteKwSum, 0) / kwAll : null,
      nOperators: byOperator.size,
      topOperatorName: topOperator ? topOperator[0] : null,
      topOperatorStations: topOperator ? topOperator[1] : null,
      topOperatorShare:
        topOperator && inScope.length > 0 ? topOperator[1] / inScope.length : null,
    };
  }

  // ── Phủ POI — số của manifest, không tính lại ────────────────────────────────
  const poiCov = m?.source_metrics?.poi_empty_1km ?? null;
  const poi: Bag | null = poiCov
    ? { shareCells: poiCov.share_cells, sharePop: poiCov.share_pop, nCellsZero: poiCov.n_cells_zero }
    : null;

  return {
    "lorenz-area-pop": lorenzModel,
    "spatial-structure": structure,
    "supply-equity": supply,
    "commune-supply": communeSupply,
    detour,
    roads,
    "access-curve": access,
    "opportunity-rank": opportunity,
    "utilization-week": util,
    "power-tier": power,
    "poi-coverage": poi,
    // Dải giữa 34 tỉnh cần `provinces.parquet`, thứ KHÔNG có trong một gói tỉnh. Câu ấy
    // được GIỮ LẠI (R5) thay vì đoán — xem `SceneRequirement` của cảnh 6.
    "province-range": null,
  };
}

/** Đếm ô giờ dưới sàn quan sát — con số phải nói ra, vì chúng KHÔNG được vẽ thành 0. */
function countBelowFloor(occ: StationOccupancy): number {
  const p = occ.profiles;
  let n = 0;
  for (let s = 0; s < p.n; s++) {
    const inScope = p.inScope ? p.inScope[s] : true;
    if (!inScope) continue;
    const ports = p.nPorts[s];
    if (ports === undefined || !Number.isFinite(ports) || ports <= 0) continue;
    for (let t = 0; t < HOURS_IN_WEEK; t++) {
      const obs = p.observed[s * HOURS_IN_WEEK + t];
      if (obs !== undefined && Number.isFinite(obs) && obs < OBSERVED_H_MIN) n++;
    }
  }
  return n;
}

// ── Đối tượng ───────────────────────────────────────────────────────────────

export interface ResolvedSubject {
  kind: "province" | "commune" | "commune-set";
  code: string | null;
  name: string | null;
  bbox: [number, number, number, number] | null;
  center: [number, number] | null;
  facts: CommuneFacts | null;
}

function bboxOfGeometry(geom: unknown): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [x, y] = node as [number, number];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
      return;
    }
    for (const child of node) walk(child);
  };
  walk((geom as { coordinates?: unknown })?.coordinates);
  return Number.isFinite(w) && Number.isFinite(s) ? [w, s, e, n] : null;
}

/**
 * Đối tượng của cảnh, PHÂN GIẢI từ gói đang mở — §1.2.
 *
 * Không mã xã nào viết vào mã nguồn. Đây là toàn bộ khác biệt giữa "cảnh nói về Ba Đình"
 * (một câu về một nơi, sai khi ranh giới đổi) và "cảnh nói về xã đông dân nhất không có
 * cổng nào" (một câu về một LUẬT, đúng ở mọi tỉnh và mọi niên bản).
 */
export function resolveSubject(
  spec: SubjectSpec,
  pkg: StoryPackage,
  models: StoryModels,
): ResolvedSubject | null {
  if (spec.kind === "province") {
    const p = pkg.manifest?.province;
    return {
      kind: "province",
      code: p?.province_code ?? null,
      name: p?.province_name ?? null,
      bbox: (p?.bbox as [number, number, number, number] | undefined) ?? null,
      center: (p?.center as [number, number] | undefined) ?? null,
      facts: null,
    };
  }

  const fc = pkg.communes;
  if (!fc || fc.features.length === 0) return null;

  const beyondByCode = new Map<string, { beyond: number; total: number | null }>();
  for (const r of pkg.opportunity ?? []) {
    beyondByCode.set(r.commune_code, {
      beyond: r.population_beyond_2km ?? 0,
      total: r.population_total,
    });
  }
  const communeMedian = num(models["commune-supply"]?.["median"]);

  const factsOf = (f: (typeof fc.features)[number]): CommuneFacts => {
    const code = String(f.properties["commune_code"] ?? "");
    const perPop = cnum(f, "ports_per_10k_pop");
    const b = beyondByCode.get(code);
    return {
      code,
      name: String(f.properties["commune_name"] ?? ""),
      population: cnum(f, "population"),
      ports: cnum(f, "n_ports"),
      perPop,
      // 0 chia trung vị vẫn là 0, và in "0× trung vị" là mời người đọc so một tỉ số với
      // một tỉ số không tồn tại. Không có cổng nào KHÔNG phải "ít hơn" — nó là "không có".
      vsMedian:
        perPop !== null && perPop > 0 && communeMedian !== null && communeMedian > 0
          ? perPop / communeMedian
          : null,
      populationBeyond2km: b ? b.beyond : null,
      shareBeyond2km: b && b.total !== null && b.total > 0 ? b.beyond / b.total : null,
    };
  };

  const keyOf = (f: (typeof fc.features)[number], measure: string): number | null => {
    if (measure === "population_beyond_2km") {
      return beyondByCode.get(String(f.properties["commune_code"] ?? ""))?.beyond ?? null;
    }
    return cnum(f, measure);
  };

  const passes = (f: (typeof fc.features)[number], where: string | undefined): boolean => {
    if (where === undefined || where === "any") return true;
    if (where === "zero-ports") return cnum(f, "n_ports") === 0;
    if (where === "majority-beyond-2km") {
      const b = beyondByCode.get(String(f.properties["commune_code"] ?? ""));
      return b !== undefined && b.total !== null && b.total > 0 && b.beyond / b.total > 0.5;
    }
    return true;
  };

  if (spec.kind === "commune-extreme" || spec.kind === "commune-set") {
    const measure = spec.kind === "commune-extreme" ? spec.measure : spec.rank;
    const where = spec.kind === "commune-extreme" ? spec.where : "majority-beyond-2km";
    const pool = fc.features.filter((f) => passes(f, where) && keyOf(f, measure) !== null);
    if (pool.length === 0) return null;
    const wantMax = spec.kind === "commune-set" || spec.at === "max";
    let best = pool[0]!;
    for (const f of pool) {
      const a = keyOf(f, measure)!;
      const b = keyOf(best, measure)!;
      if (wantMax ? a > b : a < b) best = f;
    }
    const facts = factsOf(best);
    const bbox = bboxOfGeometry(best.geometry);
    return {
      kind: spec.kind === "commune-set" ? "commune-set" : "commune",
      code: facts.code,
      name: facts.name,
      bbox,
      center: bbox ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : null,
      facts,
    };
  }

  const f = fc.features.find((x) => String(x.properties["commune_code"]) === spec.code);
  if (!f) return null;
  const facts = factsOf(f);
  const bbox = bboxOfGeometry(f.geometry);
  return {
    kind: "commune",
    code: facts.code,
    name: facts.name,
    bbox,
    center: bbox ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : null,
    facts,
  };
}

// ── Khe số ──────────────────────────────────────────────────────────────────

export interface ResolveContext {
  pkg: StoryPackage;
  models: StoryModels;
  subjects: readonly (ResolvedSubject | null)[];
}

/**
 * Một `MetricRef` thành một số, hoặc `null`.
 *
 * `null` ở đây là một câu trả lời, không phải một lỗi: nó có nghĩa "gói đang mở không nói
 * được điều này", và cách đúng để nói điều đó ra là **không nói câu ấy**.
 */
export function resolveMetric(ref: MetricRef, ctx: ResolveContext): number | null {
  switch (ref.src) {
    case "manifest":
      return num(selectPath(ctx.pkg.manifest, ref.path));
    case "model": {
      const model = ctx.models[ref.model as SharedModelId];
      return model === null || model === undefined ? null : num(selectPath(model, ref.select));
    }
    case "subject": {
      const s = ctx.subjects[ref.which];
      if (!s) return null;
      return num(selectPath(s.facts ?? s, ref.select));
    }
    case "assumption": {
      const a = ASSUMPTIONS[ref.id];
      return Array.isArray(a.value) ? null : (a.value as number);
    }
  }
}
