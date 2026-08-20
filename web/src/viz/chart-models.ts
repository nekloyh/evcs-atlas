/**
 * Phase 4 — Pure Chart Model Builders (PHASE4_VISUALIZATION.md §1, §4.3).
 *
 * Immutable, memoizable render models for the five primary lens charts.
 * Pure logic without DOM, store imports, or side-effects.
 */

import type { AnalysisFilter, PowerTierId } from "../state/filter";
import { POWER_TIER_LABELS, POWER_TIER_ORDER, isKnownPopulation, powerTierOf } from "../state/filter";
import type { GridCell, StationPoint } from "../data/queries";
import { BEYOND_2KM_M } from "../domain-thresholds";
import type { StationOccupancy } from "../data/occupancy";
import type { AccessCurve } from "./access";
import type { OccProfiles } from "./occ";
import { OBSERVED_H_MIN } from "./occ";
import { HOURS_IN_WEEK, dowOf, hourOf } from "../state/types";

// ── 1. Demand: Population Histogram ─────────────────────────────────────────

export interface PopulationBin {
  index: number;
  /** Actual population lower bound (inclusive) */
  x1: number;
  /** Actual population upper bound (exclusive, except last bin which is inclusive) */
  x2: number;
  /** Log-transformed coordinates for plotting [0..1] */
  plotX1: number;
  plotX2: number;
  isZeroSlot: boolean;
  nCells: number;
  cellShare: number;
  populationSum: number;
  isInFilter: boolean;
}

export interface DemandHistogramModel {
  bins: PopulationBin[];
  zeroBin: PopulationBin;
  positiveBins: PopulationBin[];
  nTotalCells: number;
  totalCells: number;
  nMissingCells: number;
  maxBinCount: number;
  minPositivePop: number;
  maxPop: number;
  medianPop: number | null;
  activeFilter: AnalysisFilter | null;
}

const N_POSITIVE_BINS = 23;
/** Một khe `=0` + 23 cột dương. Đây là hằng BỐ CỤC của §1.2, không phải một break dữ liệu. */
const N_POPULATION_SLOTS = N_POSITIVE_BINS + 1;

// ── 1a. Miền hiển thị dân số — MỘT chỗ khai, ba chỗ đọc (CR 4.2 §B, F5) ─────
//
// Trước CR 4.2 phép đặt chỗ này có HAI bản: `buildDemandPopulationHistogram` dựng
// `plotX1/plotX2` từ `log1p` trên `[minPositive, max]`, còn `PopulationHistogram` chép lại
// nguyên phép ấy cho vạch thập phân. Bản thứ BA — scatter bằng chứng — bị từ chối: một
// công thức đặt chỗ có ba bản là ba cơ hội để cột histogram và chấm scatter nói về hai
// khoảng khác nhau mà không lỗi nào phát ra.
//
// Trích nguyên văn từ bản dựng cột, nên phép tách này KHÔNG đổi hành vi; cổng canh là bộ
// test histogram sẵn có (`chart-models.test.ts`, `phase41-chart-encoding.test.ts`).

export interface PopulationDisplayDomain {
  /** Giá trị DƯƠNG nhỏ nhất trong tập — mốc trái của dải log. `0` khi tập không có số dương. */
  minPositivePop: number;
  maxPop: number;
  /** Tập có ít nhất một ô dân số dương không. Sai ⇒ chỉ còn khe `=0`, chiếm trọn bề ngang. */
  hasPositive: boolean;
}

/**
 * Miền hiển thị suy từ MỌI ô có dân số đọc được — không phải từ tập con đang vẽ.
 *
 * Vị từ là `isKnownPopulation` của `state/filter.ts` (§5.2 giao phép thử cho module ấy),
 * nên bẫy `pop = -1` chỉ có một định nghĩa trong cả app.
 */
export function populationDisplayDomain(
  cells: readonly { pop: number | null | undefined }[],
): PopulationDisplayDomain {
  let minPositive = Infinity;
  let maxPop = 0;
  for (const c of cells) {
    if (!isKnownPopulation(c.pop)) continue;
    if (c.pop > 0) {
      if (c.pop < minPositive) minPositive = c.pop;
      if (c.pop > maxPop) maxPop = c.pop;
    }
  }
  const hasPositive = Number.isFinite(minPositive);
  if (!hasPositive) minPositive = 0;
  if (maxPop < minPositive) maxPop = minPositive;
  return { minPositivePop: minPositive, maxPop, hasPositive };
}

/**
 * Một giá trị dân số → vị trí trên bề ngang khung vẽ, trong `[0, 1]`.
 *
 * `v === 0` rơi vào khe phân loại `[0, 1/24]` và trả về TÂM khe — `0` là một giá trị thật
 * (§1.2), không phải giá trị thiếu, nên nó có chỗ đứng riêng chứ không bị gộp vào dải dương.
 * `v > 0` đặt chỗ bằng `log1p` chuẩn hoá trên `[minPositive, maxPop]`, lấp phần `[1/24, 1]`.
 *
 * Phép `log1p` chỉ ĐẶT CHỖ. Nó không đổi đơn vị và không bao giờ được in ra màn hình.
 */
export function populationPlotFrac(v: number, domain: PopulationDisplayDomain): number {
  if (!domain.hasPositive) return 0.5;
  if (v <= 0) return 0.5 / N_POPULATION_SLOTS;
  const minLog = Math.log1p(domain.minPositivePop);
  const maxLog = Math.log1p(domain.maxPop);
  if (!(maxLog > minLog)) return 1 / N_POPULATION_SLOTS;
  const z = Math.max(0, Math.min(1, (Math.log1p(v) - minLog) / (maxLog - minLog)));
  return (1 + N_POSITIVE_BINS * z) / N_POPULATION_SLOTS;
}

/**
 * Nghịch đảo của `populationPlotFrac` — dùng cho dòng ĐỌC SỐ, nơi con trỏ cho một vị trí
 * và câu trả lời phải là một số DÂN SỐ THẬT.
 *
 * Trả `0` cho mọi vị trí nằm trong khe `=0`: ở đó câu đúng là "đúng 0 người", không phải
 * một giá trị nội suy.
 */
export function populationAtFrac(frac: number, domain: PopulationDisplayDomain): number {
  const f = Math.max(0, Math.min(1, frac));
  if (!domain.hasPositive) return 0;
  // Biên `1/24` thuộc về dải DƯƠNG, không thuộc khe `=0`: `minPositivePop` đặt đúng ở đó, nên
  // một biên đóng phía khe sẽ làm phép nghịch đảo của giá trị dương nhỏ nhất trả về 0.
  if (f < 1 / N_POPULATION_SLOTS) return 0;
  const minLog = Math.log1p(domain.minPositivePop);
  const maxLog = Math.log1p(domain.maxPop);
  if (!(maxLog > minLog)) return domain.minPositivePop;
  const z = (f * N_POPULATION_SLOTS - 1) / N_POSITIVE_BINS;
  return Math.expm1(minLog + z * (maxLog - minLog));
}

/** Expected O(N) in-place selection; avoids sorting the full field snapshot for one median. */
function nthValue(values: number[], k: number): number {
  let left = 0;
  let right = values.length - 1;
  while (left < right) {
    const pivot = values[(left + right) >> 1]!;
    let i = left;
    let j = right;
    while (i <= j) {
      while (values[i]! < pivot) i++;
      while (values[j]! > pivot) j--;
      if (i <= j) {
        const tmp = values[i]!;
        values[i] = values[j]!;
        values[j] = tmp;
        i++;
        j--;
      }
    }
    if (k <= j) right = j;
    else if (k >= i) left = i;
    else break;
  }
  return values[k]!;
}

export function buildDemandPopulationHistogram(
  cells: readonly GridCell[],
  filter: AnalysisFilter | null = null,
): DemandHistogramModel {
  let nMissing = 0;
  const rawPops: number[] = [];

  for (const c of cells) {
    // The chart contract is population, independent of whichever map field is active.
    // `value` is the active map measure and may be access, ports, etc.
    if (!isKnownPopulation(c.pop)) {
      nMissing++;
      continue;
    }
    rawPops.push(c.pop);
  }

  // Miền hiển thị đến từ helper dùng chung với scatter bằng chứng (CR 4.2 §B), không dựng
  // lại tại chỗ: hai bản của cùng một miền là hai biểu đồ nói về hai khoảng khác nhau.
  const { minPositivePop: minPositive, maxPop, hasPositive } = populationDisplayDomain(cells);

  // Calculate median
  let median: number | null = null;
  if (rawPops.length > 0) {
    const work = [...rawPops];
    const m = work.length >> 1;
    median = work.length % 2 ? nthValue(work, m) : (nthValue(work, m - 1) + nthValue(work, m)) / 2;
  }

  const minLog = Math.log1p(minPositive);
  const maxLog = Math.log1p(maxPop);
  const logStep = maxLog > minLog ? (maxLog - minLog) / N_POSITIVE_BINS : 1;

  // Filter bounds
  const filterLo = filter && filter.entity === "h3-cell" && filter.op === "between" ? filter.lo : null;
  const filterHi = filter && filter.entity === "h3-cell" && filter.op === "between" ? filter.hi : null;
  const checkFilter = (x1: number, x2: number) => {
    if (filterLo === null || filterHi === null) return true;
    // A bin is selected only when the full bin belongs to the SUBSET. Intersection made
    // neighbouring bins look selected even though their rows were not in the map subset.
    const epsilon = 1e-4;
    return x1 >= filterLo - epsilon && x2 <= filterHi + epsilon;
  };

  // Zero slot (slot index 0)
  const zeroBin: PopulationBin = {
    index: 0,
    x1: 0,
    x2: 0,
    plotX1: 0,
    plotX2: hasPositive ? 1 / (N_POSITIVE_BINS + 1) : 1,
    isZeroSlot: true,
    nCells: 0,
    cellShare: 0,
    populationSum: 0,
    isInFilter: checkFilter(0, 0),
  };

  // Positive bins (indices 1..23)
  const positiveBins: PopulationBin[] = hasPositive ? Array.from({ length: N_POSITIVE_BINS }, (_, i) => {
    const z1 = minLog + i * logStep;
    const z2 = i === N_POSITIVE_BINS - 1 ? maxLog : minLog + (i + 1) * logStep;
    const x1 = Math.expm1(z1);
    const x2 = i === N_POSITIVE_BINS - 1 ? maxPop : Math.expm1(z2);
    const plotX1 = (i + 1) / (N_POSITIVE_BINS + 1);
    const plotX2 = (i + 2) / (N_POSITIVE_BINS + 1);
    return {
      index: i + 1,
      x1,
      x2,
      plotX1,
      plotX2,
      isZeroSlot: false,
      nCells: 0,
      cellShare: 0,
      populationSum: 0,
      isInFilter: checkFilter(x1, x2),
    };
  }) : [];

  // Bin assignment
  for (const v of rawPops) {
    if (v === 0) {
      zeroBin.nCells++;
    } else {
      const z = Math.log1p(v);
      const idx = Math.min(
        N_POSITIVE_BINS - 1,
        Math.max(0, Math.floor((z - minLog) / (logStep || 1))),
      );
      const bin = positiveBins[idx]!;
      bin.nCells++;
      bin.populationSum += v;
    }
  }

  const allBins = [zeroBin, ...positiveBins];
  const totalCount = rawPops.length;
  let maxCount = 0;
  for (const b of allBins) {
    b.cellShare = totalCount > 0 ? b.nCells / totalCount : 0;
    if (b.nCells > maxCount) maxCount = b.nCells;
  }

  return {
    bins: allBins,
    zeroBin,
    positiveBins,
    nTotalCells: totalCount,
    totalCells: totalCount + nMissing,
    nMissingCells: nMissing,
    maxBinCount: maxCount,
    minPositivePop: minPositive,
    maxPop,
    medianPop: median,
    activeFilter: filter,
  };
}

// ── 2. Supply: Power Tier Breakdown ─────────────────────────────────────────

export interface PowerTierRow {
  tierId: PowerTierId;
  label: string;
  kwRange: string;
  desc: string;
  nStations: number;
  stationShare: number;
  portsSum: number;
  portsMissingCount: number;
  powerSiteKwSum: number;
  powerSiteMissingCount: number;
  isSelected: boolean;
}

export interface SupplyPowerTierModel {
  tiers: PowerTierRow[];
  totalInStations: number;
  maxTierCount: number;
  selectedTierIds: Set<PowerTierId>;
  activeFilter: AnalysisFilter | null;
}

export function buildSupplyPowerTierBreakdown(
  stations: readonly StationPoint[],
  filter: AnalysisFilter | null = null,
): SupplyPowerTierModel {
  // Aggregate ONLY in-scope public stations
  const inStations = stations.filter((s) => s.inScope);
  const activeTiers =
    filter && filter.entity === "station" && filter.op === "in"
      ? new Set(filter.values)
      : new Set<PowerTierId>(POWER_TIER_ORDER);

  const isFilterActive = filter && filter.entity === "station" && filter.op === "in";

  const tierMap = new Map<PowerTierId, PowerTierRow>(
    POWER_TIER_ORDER.map((tierId) => [
      tierId,
      {
        tierId,
        label: POWER_TIER_LABELS[tierId].label,
        kwRange: POWER_TIER_LABELS[tierId].kwRange,
        desc: POWER_TIER_LABELS[tierId].desc,
        nStations: 0,
        stationShare: 0,
        portsSum: 0,
        portsMissingCount: 0,
        powerSiteKwSum: 0,
        powerSiteMissingCount: 0,
        isSelected: isFilterActive ? activeTiers.has(tierId) : false,
      },
    ]),
  );

  for (const s of inStations) {
    const tier = s.powerTier ?? powerTierOf(s.powerKwMaxPort ?? null);
    const row = tierMap.get(tier)!;
    row.nStations++;

    if (s.nPorts !== null && s.nPorts !== undefined && Number.isFinite(s.nPorts)) {
      row.portsSum += s.nPorts;
    } else {
      row.portsMissingCount++;
    }

    if (s.powerKwSite !== null && s.powerKwSite !== undefined && Number.isFinite(s.powerKwSite)) {
      row.powerSiteKwSum += s.powerKwSite;
    } else {
      row.powerSiteMissingCount++;
    }
  }

  const tiers = POWER_TIER_ORDER.map((id) => tierMap.get(id)!);
  const totalIn = inStations.length;
  let maxCount = 0;

  for (const t of tiers) {
    t.stationShare = totalIn > 0 ? t.nStations / totalIn : 0;
    if (t.nStations > maxCount) maxCount = t.nStations;
  }

  return {
    tiers,
    totalInStations: totalIn,
    maxTierCount: maxCount,
    selectedTierIds: activeTiers,
    activeFilter: filter,
  };
}

// ── 3. Access: Access Population Curve ──────────────────────────────────────

export interface AccessCurvePoint {
  distanceM: number;
  cumulativePop: number;
  shareOfAllPop: number;
}

export interface AccessCurveModel {
  points: AccessCurvePoint[];
  /** Full coalesced curve for exact tooltip lookup; `points` may be render-thinned. */
  lookupPoints: AccessCurvePoint[];
  populationTotal: number;
  populationMeasured: number;
  populationUnmeasured: number;
  populationWithin2km: number;
  shareWithin2km: number;
  measuredEndpointShare: number;
  p99DistanceM: number;
  maxDomainDistanceM: number;
  maxDistanceM: number;
}

const MAX_CURVE_RENDER_POINTS = 400;

export function buildAccessPopulationCurve(
  input: readonly GridCell[] | AccessCurve | null | undefined,
): AccessCurveModel {
  if (!input) {
    return {
      points: [{ distanceM: 0, cumulativePop: 0, shareOfAllPop: 0 }],
      lookupPoints: [{ distanceM: 0, cumulativePop: 0, shareOfAllPop: 0 }],
      populationTotal: 0,
      populationMeasured: 0,
      populationUnmeasured: 0,
      populationWithin2km: 0,
      shareWithin2km: 0,
      measuredEndpointShare: 0,
      p99DistanceM: BEYOND_2KM_M,
      maxDomainDistanceM: BEYOND_2KM_M,
      maxDistanceM: 0,
    };
  }

  let popTotal = 0;
  let popMeasured = 0;
  let popUnmeasured = 0;
  let popWithin2km = 0;
  const measuredPairs: { d: number; pop: number }[] = [];

  if (Array.isArray(input)) {
    for (const c of input) {
      const pop = c.pop ?? 0;
      if (pop <= 0) continue;

      if (c.dist !== null && c.dist !== undefined && Number.isFinite(c.dist)) {
        popMeasured += pop;
        if (c.dist <= BEYOND_2KM_M) popWithin2km += pop;
        measuredPairs.push({ d: c.dist, pop });
      } else {
        popUnmeasured += pop;
      }
    }
    popTotal = popMeasured + popUnmeasured;
  } else if ("curve" in input) {
    popMeasured = input.popMeasured;
    popUnmeasured = input.popUnmeasured;
    popTotal = popMeasured + popUnmeasured;
    const curve = input.curve;
    let prevCumPop = 0;
    for (const pt of curve) {
      const cumPop = pt.share * popMeasured;
      if (pt.d <= BEYOND_2KM_M) popWithin2km = cumPop;
      const delta = cumPop - prevCumPop;
      if (delta > 0) {
        measuredPairs.push({ d: pt.d, pop: delta });
      }
      prevCumPop = cumPop;
    }
  }

  if (popTotal === 0 || measuredPairs.length === 0) {
    return {
      points: [{ distanceM: 0, cumulativePop: 0, shareOfAllPop: 0 }],
      lookupPoints: [{ distanceM: 0, cumulativePop: 0, shareOfAllPop: 0 }],
      populationTotal: popTotal,
      populationMeasured: 0,
      populationUnmeasured: popTotal,
      populationWithin2km: 0,
      shareWithin2km: 0,
      measuredEndpointShare: 0,
      p99DistanceM: BEYOND_2KM_M,
      maxDomainDistanceM: BEYOND_2KM_M,
      maxDistanceM: 0,
    };
  }

  // Sort ascending by distance
  measuredPairs.sort((a, b) => a.d - b.d);

  // Coalesce equal distances
  const coalesced: { d: number; pop: number }[] = [];
  for (const pair of measuredPairs) {
    const last = coalesced[coalesced.length - 1];
    if (last && last.d === pair.d) {
      last.pop += pair.pop;
    } else {
      coalesced.push({ d: pair.d, pop: pair.pop });
    }
  }

  // Compute cumulative population and P99 distance
  let cumPop = 0;
  let p99Dist = BEYOND_2KM_M;
  let p99Found = false;
  const fullPoints: AccessCurvePoint[] = [{ distanceM: 0, cumulativePop: 0, shareOfAllPop: 0 }];

  for (const pair of coalesced) {
    cumPop += pair.pop;
    const share = cumPop / popTotal;
    fullPoints.push({
      distanceM: pair.d,
      cumulativePop: cumPop,
      shareOfAllPop: share,
    });
    if (!p99Found && cumPop >= 0.99 * popMeasured) {
      p99Dist = pair.d;
      p99Found = true;
    }
  }

  const maxDist = coalesced[coalesced.length - 1]?.d ?? 0;
  const maxDomainDist = Math.max(BEYOND_2KM_M, p99Dist);

  // Thin rendered points to MAX_CURVE_RENDER_POINTS
  let renderedPoints = fullPoints;
  if (fullPoints.length > MAX_CURVE_RENDER_POINTS) {
    const step = (fullPoints.length - 1) / (MAX_CURVE_RENDER_POINTS - 1);
    renderedPoints = [fullPoints[0]!];
    for (let i = 1; i < MAX_CURVE_RENDER_POINTS - 1; i++) {
      renderedPoints.push(fullPoints[Math.round(i * step)]!);
    }
    renderedPoints.push(fullPoints[fullPoints.length - 1]!);
  }

  return {
    points: renderedPoints,
    lookupPoints: fullPoints,
    populationTotal: popTotal,
    populationMeasured: popMeasured,
    populationUnmeasured: popUnmeasured,
    populationWithin2km: popWithin2km,
    shareWithin2km: popTotal > 0 ? popWithin2km / popTotal : 0,
    measuredEndpointShare: popTotal > 0 ? popMeasured / popTotal : 0,
    p99DistanceM: p99Dist,
    maxDomainDistanceM: maxDomainDist,
    maxDistanceM: maxDist,
  };
}

// ── 4. Utilization: Week Heatmap 7x24 ───────────────────────────────────────

export interface UtilizationHourCell {
  t: number;
  dow: number;
  hour: number;
  value: number | null;
  utilization: number | null;
  contributingStations: number;
  contributingPorts: number;
  allInPorts: number;
  portWeightedObsHours: number;
}

export interface UtilizationHeatmapModel {
  cells: UtilizationHourCell[];
  allInInstalledPorts: number;
  disabledReason?: string;
}

/**
 * 168 ô của tuần. KHÔNG nhận `t`: giờ đang xem là trạng thái ĐIỀU KHIỂN của người trình
 * bày, không phải dữ liệu của mô hình (§1.5). Trộn nó vào đây từng khiến `cells[0]` mang
 * cờ "giờ hiện tại" vĩnh viễn vì controller luôn dựng model với `t = 0`, và bất kỳ ai đọc
 * trường ấy về sau đều nhận một câu trả lời sai.
 */
export function buildUtilizationWeekHeatmap(
  occupancy: StationOccupancy | OccProfiles | null | undefined,
  disabledReason?: string,
): UtilizationHeatmapModel {
  if (!occupancy || disabledReason) {
    return {
      cells: [],
      allInInstalledPorts: 0,
      disabledReason: disabledReason ?? "Dữ liệu vận hành chưa khả dụng",
    };
  }

  const isOccProfiles = "occ" in occupancy && "nPorts" in occupancy;
  const profiles: OccProfiles = isOccProfiles ? occupancy : occupancy.profiles;
  const stations = !isOccProfiles && "stations" in occupancy ? occupancy.stations : null;

  const inIndices: number[] = [];
  let allInPortsSum = 0;
  const n = profiles.n;

  for (let s = 0; s < n; s++) {
    const isIn = stations ? stations[s]?.inScope : profiles.inScope ? profiles.inScope[s] : true;
    if (isIn) {
      inIndices.push(s);
      const p = profiles.nPorts[s];
      if (p !== undefined && Number.isFinite(p) && p > 0) {
        allInPortsSum += p;
      }
    }
  }

  const cells: UtilizationHourCell[] = new Array(HOURS_IN_WEEK);

  for (let t = 0; t < HOURS_IN_WEEK; t++) {
    let occSum = 0;
    let portSum = 0;
    let obsWeightedSum = 0;
    let contributingCount = 0;

    for (const s of inIndices) {
      const ports = profiles.nPorts[s];
      if (ports === undefined || !Number.isFinite(ports) || ports <= 0) continue;

      const idx = s * HOURS_IN_WEEK + t;
      const obs = profiles.observed[idx];
      if (obs === undefined || !Number.isFinite(obs)) continue;
      obsWeightedSum += obs * ports;

      if (obs < OBSERVED_H_MIN) continue;
      const occ = profiles.occ[idx];
      if (occ === undefined || !Number.isFinite(occ)) continue;

      occSum += occ;
      portSum += ports;
      contributingCount++;
    }

    const rate = portSum > 0 ? occSum / portSum : null;
    cells[t] = {
      t,
      dow: dowOf(t),
      hour: hourOf(t),
      value: rate,
      utilization: rate,
      contributingStations: contributingCount,
      contributingPorts: portSum,
      allInPorts: allInPortsSum,
      portWeightedObsHours: allInPortsSum > 0 ? obsWeightedSum / allInPortsSum : 0,
    };
  }

  return {
    cells,
    allInInstalledPorts: allInPortsSum,
    disabledReason: undefined,
  };
}

// ── 5. Opportunity: Commune Rank Bars ───────────────────────────────────────

export interface OpportunityCommuneRow {
  commune_code: string;
  commune_name: string;
  n_cells: number;
  n_population_missing: number;
  /** Ô có dân số nhưng KHÔNG có cự ly mạng đường — §4.2. */
  n_distance_unknown: number;
  population_total: number | null;
  population_measured: number;
  population_within_2km: number;
  population_beyond_2km: number;
  population_distance_unknown: number;
}

export interface OpportunityRankItem {
  communeCode: string;
  communeName: string;
  rank: number | null;
  tieCount: number;
  rankValue: number | null;
  populationTotal: number | null;
  populationWithin2km: number;
  populationBeyond2km: number;
  populationDistanceUnknown: number;
  distanceCoveragePct: number;
  isSelected: boolean;
  isPinned: boolean;
}

export interface OpportunityCommuneRankModel {
  topRanks: OpportunityRankItem[];
  pinnedItem: OpportunityRankItem | null;
  maxRankValue: number;
  totalCommunes: number;
  nMissingRank: number;
  selectedCommuneCode: string | null;
}

export function buildOpportunityCommuneRank(
  communes: readonly OpportunityCommuneRow[],
  selectedCommuneCode: string | null = null,
): OpportunityCommuneRankModel {
  let maxVal = 0;
  let missingCount = 0;

  const preparedItems: {
    row: OpportunityCommuneRow;
    rankValue: number | null;
    coveragePct: number;
  }[] = [];

  for (const c of communes) {
    const total = c.population_total;
    const measured = c.population_measured ?? 0;
    const beyond2km = c.population_beyond_2km ?? 0;
    const populationKnown = c.n_population_missing === 0 && total !== null && Number.isFinite(total);
    const coverage = populationKnown && total > 0 ? (measured / total) * 100 : 0;

    let rankVal: number | null = null;
    if (!populationKnown) {
      missingCount++;
    } else if (total === 0) {
      rankVal = 0;
    } else if (measured === 0) {
      rankVal = null;
      missingCount++;
    } else {
      rankVal = beyond2km;
      if (rankVal > maxVal) maxVal = rankVal;
    }

    preparedItems.push({ row: c, rankValue: rankVal, coveragePct: coverage });
  }

  const validItems = preparedItems.filter(
    (item): item is typeof item & { rankValue: number } => item.rankValue !== null,
  );

  // Sort descending by rankValue, tiebreak stably by commune_code
  validItems.sort((a, b) => {
    if (b.rankValue! !== a.rankValue!) return b.rankValue! - a.rankValue!;
    return a.row.commune_code.localeCompare(b.row.commune_code);
  });

  // Assign competition rank (1, 2, 2, 4...). Precompute tie sizes once: the former
  // two-direction scan per row was O(C²) for a large equal-valued group.
  const rankedItems: OpportunityRankItem[] = [];
  let currentRank = 1;
  const tieSizes = new Map<number, number>();
  for (const item of validItems) {
    tieSizes.set(item.rankValue, (tieSizes.get(item.rankValue) ?? 0) + 1);
  }

  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i]!;
    if (i > 0 && item.rankValue === validItems[i - 1]!.rankValue) {
      // Tie: same rank
    } else {
      currentRank = i + 1;
    }

    const isSel = selectedCommuneCode === item.row.commune_code;
    rankedItems.push({
      communeCode: item.row.commune_code,
      communeName: item.row.commune_name,
      rank: currentRank,
      tieCount: tieSizes.get(item.rankValue) ?? 1,
      rankValue: item.rankValue,
      populationTotal: item.row.population_total,
      populationWithin2km: item.row.population_within_2km,
      populationBeyond2km: item.row.population_beyond_2km,
      populationDistanceUnknown: item.row.population_distance_unknown,
      distanceCoveragePct: item.coveragePct,
      isSelected: isSel,
      isPinned: false,
    });
  }

  // Top 10 items
  const topRanks = rankedItems.slice(0, 10);
  let pinnedItem: OpportunityRankItem | null = null;

  if (selectedCommuneCode) {
    const foundInTop = topRanks.some((r) => r.communeCode === selectedCommuneCode);
    if (!foundInTop) {
      const fullFound = rankedItems.find((r) => r.communeCode === selectedCommuneCode);
      if (fullFound) {
        pinnedItem = { ...fullFound, isPinned: true };
      } else {
        const missingFound = preparedItems.find((item) => item.row.commune_code === selectedCommuneCode);
        if (missingFound) {
          pinnedItem = {
            communeCode: missingFound.row.commune_code,
            communeName: missingFound.row.commune_name,
            rank: null,
            tieCount: 0,
            rankValue: null,
            populationTotal: missingFound.row.population_total,
            populationWithin2km: missingFound.row.population_within_2km,
            populationBeyond2km: missingFound.row.population_beyond_2km,
            populationDistanceUnknown: missingFound.row.population_distance_unknown,
            distanceCoveragePct: missingFound.coveragePct,
            isSelected: true,
            isPinned: true,
          };
        }
      }
    }
  }

  return {
    topRanks,
    pinnedItem,
    maxRankValue: maxVal,
    totalCommunes: communes.length,
    nMissingRank: missingCount,
    selectedCommuneCode,
  };
}

// ── 5b. Opportunity EVIDENCE: Demand × Access Scatter ───────────────────────
//
// CR 4.2. Đây là biểu đồ BẰNG CHỨNG, không phải biểu đồ chính thứ sáu: nó không phát bộ
// lọc, không phát mốc giờ, không phát lựa chọn, và `PrimaryLensChart` không định tuyến nó.
//
// Ba quyết định của bản dựng model, mỗi cái đều là một quyết định chứ không phải mặc định:
//
//   1. **Miền X đến từ MỌI ô có dân số đọc được**, không phải từ tập ô vẽ được. Hệ quả cố
//      ý: ô đông người nhất mà khuyết cự ly thì mép phải của trục KHÔNG có chấm nào. Đó là
//      đúng — trục là miền dân số của bộ dữ liệu (§1.2 "không bao giờ cắt cụt max"), còn
//      dòng đếm (§C) giải thích chỗ trống. Cách kia — miền trôi theo số ô khuyết — làm hình
//      học trục X phụ thuộc âm thầm vào mẫu khuyết dữ liệu.
//   2. **Y là `sqrt`, KHÔNG kẹp p99.** Trường tự khai `TOGGLE_SQRT_MIN_P99` nên phép biến
//      đổi là của trường; còn phép KẸP thì không theo, vì kẹp sẽ XOÁ 6,0–8,9% số chấm — và
//      đúng những chấm xa nhất, tức tập ô mà lens Cơ hội tồn tại để nói về.
//   3. **Gộp theo LƯỚI 2 px, không rút mẫu.** Góc "đông người mà xa" là phần THƯA của đám
//      mây, nên mọi luật rút mẫu đều xoá ưu tiên đúng những chấm cần giữ. Gộp lưới chỉ
//      nhập những chấm vốn đã trùng nhau trên màn hình.

/** Khung vẽ của scatter, tính bằng px. Lưới bằng đúng cỡ mark ⇒ phép cộng alpha là CHÍNH XÁC. */
export const SCATTER_PLOT_W = 248;
export const SCATTER_PLOT_H = 134;
export const SCATTER_LATTICE_PX = 2;
/** 124 × 67 = 8.308 ô lưới — trần cứng của số ô có mark, bất kể bộ dữ liệu to bao nhiêu. */
export const SCATTER_COLS = SCATTER_PLOT_W / SCATTER_LATTICE_PX;
export const SCATTER_ROWS = SCATTER_PLOT_H / SCATTER_LATTICE_PX;
/**
 * Bậc chồng tối đa. KHÔNG phải một break dữ liệu: quá 6 thì màu tổng hợp chỉ còn cách màu
 * bão hoà ΔE 0,89 — trong dung sai ΔE ≤ 1,0 của tiêu chí 9 CR 4.1 — nên cắt ở 6 chặn DOM
 * xuống 6 node mà mắt không mất gì.
 */
export const SCATTER_MAX_LEVEL = 6;
/**
 * Độ đặc của MỘT ô lẻ. Không phải `MUTED_ALPHA` 0,25 của bản đồ: đo ở đó một chấm lẻ cách
 * đường lưới ΔE 3,85 — DƯỚI sàn 6 của §4b, tức là biến mất. Ở 0,45 nó cách nền 17,45 và
 * cách đường lưới 10,72.
 */
export const SCATTER_BASE_ALPHA = 0.45;

/**
 * Cự ly ĐỌC ĐƯỢC hay không — chặt hơn `Number.isFinite(c.dist)` của `buildAccessPopulationCurve`.
 *
 * Số âm bị loại RIÊNG chứ không lẫn vào null: `Math.sqrt(-1)` là `NaN`, và một `NaN` đi vào
 * thuộc tính `d` của `<path>` sẽ xoá mark **im lặng**. Không gói nào đang có giá trị âm; vị
 * từ này tồn tại để một lần xuất dữ liệu sau không thể làm mất hàng mà không có con số nào
 * hiện lên màn hình.
 */
export function isKnownDistance(d: number | null | undefined): d is number {
  return typeof d === "number" && Number.isFinite(d) && d >= 0;
}

/**
 * Độ đặc của một ô lưới chứa `n` ô H3.
 *
 * `1 − (1−a)^n` đúng bằng thứ mà `n` mark trùng nhau ở alpha `a` tổng hợp thành, nên một ô
 * bậc `k` giống HỆT `k` mark chồng lên nhau ở mức pixel — đó là lý do phép gộp lưới không
 * phải một phép xấp xỉ. Nó thôi chính xác đúng ở chỗ bị cắt: từ bậc 6 trở lên.
 */
export function overplotAlpha(n: number): number {
  if (n <= 0) return 0;
  return 1 - (1 - SCATTER_BASE_ALPHA) ** Math.min(n, SCATTER_MAX_LEVEL);
}

/** Vị trí `sqrt` của một cự ly trên trục Y, trong `[0, 1]` — `0` ở đáy khung. */
export function scatterDistFrac(d: number, maxDistanceM: number): number {
  if (!(maxDistanceM > 0)) return 0;
  return Math.max(0, Math.min(1, Math.sqrt(d) / Math.sqrt(maxDistanceM)));
}

/** Nghịch đảo — dòng ĐỌC SỐ in mét thật, không bao giờ in một căn bậc hai. */
export function scatterDistAtFrac(frac: number, maxDistanceM: number): number {
  const f = Math.max(0, Math.min(1, frac));
  return f * f * maxDistanceM;
}

export interface ScatterMark {
  col: number;
  row: number;
  /** Số ô H3 rơi vào ô lưới này. Alpha mã hoá SỐ ĐẾM, không phải một tỉ lệ. */
  n: number;
}

export interface ScatterLevel {
  level: number;
  alpha: number;
  marks: ScatterMark[];
}

export interface DemandAccessScatterModel {
  domain: PopulationDisplayDomain;
  /** Tối đa 6 phần tử ⇒ tối đa 6 node mark trong DOM, bất kể bộ dữ liệu to bao nhiêu. */
  levels: ScatterLevel[];
  /** Tra số chồng của ô lưới dưới con trỏ — khoá là `row * SCATTER_COLS + col`. */
  stacks: ReadonlyMap<number, number>;
  /** Số ô H3 ĐANG VẼ (gồm cả ô 0 người). */
  nPlotted: number;
  /** Ô đúng 0 người, VẼ ở khe `=0` tại cự ly thật của nó — 0 là một số đo, không phải thiếu. */
  nZeroPopulationPlotted: number;
  /** Ô biết dân số nhưng khuyết cự ly: LOẠI và ĐẾM. Không đặt ở 0, không đặt ở max. */
  nExcludedDistance: number;
  popExcludedDistance: number;
  /** Ô khuyết dân số (`null`/`undefined`) — dân số là vị từ NGOÀI, nên "khuyết cả hai" đếm ở đây. */
  nNullPopulation: number;
  /** Giá trị có mặt nhưng hỏng: âm, `NaN`, `Infinity`. Không bao giờ thành một mark biến mất. */
  nInvalid: number;
  /** Mẫu số của câu "…% dân đã biết". */
  populationKnownTotal: number;
  maxDistanceM: number;
  maxStack: number;
  /** Bất biến bảo toàn: `Σ n + nExcludedDistance + nNullPopulation + nInvalid === totalCells`. */
  totalCells: number;
  nOccupiedLattice: number;
}

const clampIndex = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);

export function buildDemandAccessScatter(
  cells: readonly GridCell[],
): DemandAccessScatterModel {
  const domain = populationDisplayDomain(cells);

  let nZeroPopulationPlotted = 0;
  let nExcludedDistance = 0;
  let popExcludedDistance = 0;
  let nNullPopulation = 0;
  let nInvalid = 0;
  let populationKnownTotal = 0;
  let maxDistanceM = 0;

  const keptFracX: number[] = [];
  const keptDist: number[] = [];

  for (const c of cells) {
    const pop = c.pop;
    // Thứ tự có chủ ý: "giá trị HỎNG" tách khỏi "giá trị VẮNG" trước khi hỏi tới cự ly.
    // `pop = -1` là dữ liệu hỏng, không phải một ô chưa đo — gộp hai thứ vào một con số là
    // xoá mất sự khác nhau mà §C bắt phải in ra.
    if (typeof pop === "number" && !isKnownPopulation(pop)) {
      nInvalid++;
      continue;
    }
    if (!isKnownPopulation(pop)) {
      nNullPopulation++;
      continue;
    }
    populationKnownTotal += pop;

    const d = c.dist;
    if (d === null || d === undefined) {
      nExcludedDistance++;
      popExcludedDistance += pop;
      continue;
    }
    if (!isKnownDistance(d)) {
      nInvalid++;
      continue;
    }

    keptFracX.push(populationPlotFrac(pop, domain));
    keptDist.push(d);
    if (pop === 0) nZeroPopulationPlotted++;
    if (d > maxDistanceM) maxDistanceM = d;
  }

  // Trục Y chỉ chốt được sau khi biết cự ly lớn nhất VẼ ĐƯỢC, nên phép gán ô lưới là một
  // lượt thứ hai. Vẫn O(N); miền X thì không phụ thuộc lượt này (điểm 1 của docstring).
  const stacks = new Map<number, number>();
  let maxStack = 0;
  for (let i = 0; i < keptFracX.length; i++) {
    const col = clampIndex(Math.floor(keptFracX[i]! * SCATTER_COLS), SCATTER_COLS - 1);
    const fy = scatterDistFrac(keptDist[i]!, maxDistanceM);
    const row = clampIndex(Math.floor((1 - fy) * SCATTER_ROWS), SCATTER_ROWS - 1);
    const key = row * SCATTER_COLS + col;
    const n = (stacks.get(key) ?? 0) + 1;
    stacks.set(key, n);
    if (n > maxStack) maxStack = n;
  }

  const byLevel = new Map<number, ScatterMark[]>();
  for (const [key, n] of stacks) {
    const level = Math.min(n, SCATTER_MAX_LEVEL);
    const bucket = byLevel.get(level);
    const mark: ScatterMark = { col: key % SCATTER_COLS, row: Math.floor(key / SCATTER_COLS), n };
    if (bucket) bucket.push(mark);
    else byLevel.set(level, [mark]);
  }
  const levels: ScatterLevel[] = [];
  for (let level = 1; level <= SCATTER_MAX_LEVEL; level++) {
    const marks = byLevel.get(level);
    if (marks) levels.push({ level, alpha: overplotAlpha(level), marks });
  }

  return {
    domain,
    levels,
    stacks,
    nPlotted: keptFracX.length,
    nZeroPopulationPlotted,
    nExcludedDistance,
    popExcludedDistance,
    nNullPopulation,
    nInvalid,
    populationKnownTotal,
    maxDistanceM,
    maxStack,
    totalCells: cells.length,
    nOccupiedLattice: stacks.size,
  };
}

/** Số ô H3 chồng nhau tại một ô lưới. `0` = chưa có ô nào ở đây, và dòng đọc phải NÓI ra. */
export function scatterStackAt(model: DemandAccessScatterModel, col: number, row: number): number {
  return model.stacks.get(row * SCATTER_COLS + col) ?? 0;
}

/**
 * Nhớ kết quả theo THAM CHIẾU đầu vào.
 *
 * Vì sao không phải `useMemo`: khối bằng chứng đóng/mở được, và `useMemo` có `open` trong
 * danh sách phụ thuộc sẽ dựng lại model mỗi lần mở. §A đòi ngược lại — dựng MỘT lần ở lần
 * mở đầu tiên, rồi đóng/mở với cùng một snapshot `cells` thì không dựng lại gì.
 */
export function memoizeByReference<I, O>(build: (input: I) => O): (input: I) => O {
  let lastInput: I | undefined;
  let lastOutput: O | undefined;
  let hasValue = false;
  return (input: I): O => {
    if (!hasValue || lastInput !== input) {
      lastInput = input;
      lastOutput = build(input);
      hasValue = true;
    }
    return lastOutput as O;
  };
}

// ── 6. Demand: Spatial Structure Sweep ──────────────────────────────────────
//
// Phase 7 §1.3 — MỘT số đo mới của cả pha, và nó thuộc lớp DÙNG CHUNG chứ không thuộc
// `story/`. Nó trả lời một câu hỏi của lens CẦU ("có mấy vùng dày tách rời, và con số ấy
// có sống qua việc đổi ngưỡng không?"), nó ăn chính snapshot lưới mà workspace đã giữ, và
// câu chuyện chỉ tình cờ là người gọi đầu tiên. Để nó trong `story/` là dựng đúng cái
// "logic số đo riêng của cảnh" mà pha này cấm.

/** Ô đưa vào phép quét cấu trúc: danh tính + giá trị trường + số người. */
export interface SpatialCell {
  h3: string;
  value: number | null;
  pop: number | null;
}

export interface SpatialStructureStep {
  q: number;
  /** giá trị THẬT của lát cắt — in ra màn hình, không in `q` trần */
  threshold: number;
  nCells: number;
  nComponents: number;
  /** thành phần từ 3 ô trở lên — tách "một vùng" khỏi "một đốm" */
  nComponentsGe3: number;
  largestComponentCells: number;
  largestComponentPop: number;
}

export interface SpatialStructureModel {
  field: string;
  /** Moran's I trên cùng đồ thị kề; `null` khi không đủ ô phân tích được */
  moranI: number | null;
  nAnalysable: number;
  nEdges: number;
  steps: readonly SpatialStructureStep[];
}

/**
 * Phân vị nội suy tuyến tính trên mảng ĐÃ sắp tăng dần — cùng quy ước với `numpy.quantile`.
 *
 * Quy ước phải nói ra: "phân vị 90" có ít nhất năm định nghĩa dùng được, và chúng lệch
 * nhau đúng ở chỗ đắt nhất — ngưỡng của lát cắt, thứ được IN RA cạnh số thành phần. Chọn
 * cùng quy ước với công cụ đã đo bảng đối chứng thì hai bên còn so được với nhau.
 */
function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Cấu trúc không gian của một trường ô: số vùng liên thông ở nhiều lát cắt, kèm Moran's I.
 *
 * Kề = `gridDisk(k = 1)` giao với chính tập ô đang có (kề "queen" của lưới H3). Ô ngoài
 * gói không tạo cạnh: một ô biên có sáu hàng xóm trên giấy nhưng chỉ có bốn trong dữ liệu,
 * và đếm hai cái vắng mặt là khẳng định về chỗ ta không đo.
 *
 * Ô có `value` null bị LOẠI khỏi cả hai phép tính — không quy về 0. Với Moran's I, một
 * `0` giả nằm giữa vùng dày là một lỗ tự chế trong cấu trúc đang đo.
 *
 * Hàm thuần: không DOM, không DuckDB, không `window` — chạy được dưới `node --test`.
 */
export function buildSpatialStructureModel(
  cells: readonly SpatialCell[],
  field: string,
  quantiles: readonly number[],
  neighboursOf: (h3: string) => string[],
): SpatialStructureModel {
  const idx = new Map<string, number>();
  const values: number[] = [];
  const pops: number[] = [];
  for (const c of cells) {
    if (c.value === null || !Number.isFinite(c.value)) continue;
    idx.set(c.h3, values.length);
    values.push(c.value);
    pops.push(c.pop !== null && Number.isFinite(c.pop) ? c.pop : 0);
  }
  const n = values.length;
  if (n === 0) {
    return { field, moranI: null, nAnalysable: 0, nEdges: 0, steps: [] };
  }

  // Cạnh vô hướng, mỗi cặp một lần. `a < b` là bộ lọc trùng, không phải thứ tự có nghĩa.
  const adj: number[][] = Array.from({ length: n }, () => []);
  let nEdges = 0;
  let moranNum = 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  for (const c of cells) {
    const a = idx.get(c.h3);
    if (a === undefined) continue;
    for (const nb of neighboursOf(c.h3)) {
      const b = idx.get(nb);
      if (b === undefined || b <= a) continue;
      adj[a]!.push(b);
      adj[b]!.push(a);
      nEdges++;
      moranNum += 2 * (values[a]! - mean) * (values[b]! - mean);
    }
  }

  let den = 0;
  for (const v of values) den += (v - mean) * (v - mean);
  const W = 2 * nEdges;
  const moranI = W > 0 && den > 0 ? (n / W) * (moranNum / den) : null;

  const sorted = [...values].sort((x, y) => x - y);
  const steps: SpatialStructureStep[] = [];
  for (const q of quantiles) {
    const threshold = quantileSorted(sorted, q);
    const inCut = new Uint8Array(n);
    const members: number[] = [];
    for (let i = 0; i < n; i++) {
      if (values[i]! >= threshold) {
        inCut[i] = 1;
        members.push(i);
      }
    }
    const seen = new Uint8Array(n);
    let nComponents = 0;
    let nComponentsGe3 = 0;
    let largestCells = 0;
    let largestPop = 0;
    for (const start of members) {
      if (seen[start]) continue;
      seen[start] = 1;
      const stack = [start];
      let size = 0;
      let popSum = 0;
      while (stack.length > 0) {
        const u = stack.pop()!;
        size++;
        popSum += pops[u]!;
        for (const v of adj[u]!) {
          if (inCut[v] && !seen[v]) {
            seen[v] = 1;
            stack.push(v);
          }
        }
      }
      nComponents++;
      if (size >= 3) nComponentsGe3++;
      if (size > largestCells) {
        largestCells = size;
        largestPop = popSum;
      }
    }
    steps.push({
      q,
      threshold,
      nCells: members.length,
      nComponents,
      nComponentsGe3,
      largestComponentCells: largestCells,
      largestComponentPop: largestPop,
    });
  }

  return { field, moranI, nAnalysable: n, nEdges, steps };
}
