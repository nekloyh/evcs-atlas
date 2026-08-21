# Phase 7 — Story Mode Specification

Status: **PHASE 7 SPEC READY**

Scope: a **scene graph** — an ordered set of declarative scene configurations that drive the
*same* store, the *same* lens registry, the *same* chart models and the *same* queries as Map
Workspace, in order to make an argument about the data. It adds **no new metric**, **no new
SQL that the workspace cannot also call**, and **no number that is not resolved at runtime
from a shipped column, a shipped `manifest.json` key, or a declared assumption printed on
screen**.

Framing rule that governs every sentence of this document and every pixel of the feature:

> **A scene is a claim plus its evidence, or it does not ship.** Every number on screen is
> resolved at render time through a source-of-truth builder that Map Workspace already uses.
> A claim whose number cannot be produced that way is either **REMOVED** or marked **NEEDS
> DATA VALIDATION** and withheld from the UI until the data exists. No number survives in a
> scene because it exists in the Blueprint, in `DESIGN.md`, in a code comment, or in a QA
> JSON file.

This specification extends the Phase 2 lens registry, the Phase 3 `EntitySelection` contract,
the Phase 4 `AnalysisFilter` / `VisualContract` / primary-chart registry, the Phase 5 preset
`ThresholdSpec` mechanism, and (optionally, §2.8) the Phase 6 simulation. It supersedes
`web/DESIGN.md` §14b's four-scene list and `web/src/story/scenes.ts` as they stand today.

---

## 0. Verification and audit

### 0.1 The dataset that was measured

Every number in this document was measured against the package the app actually opens:

| fact | value |
|---|---|
| package | `web/public/data/` — **byte-identical** to `web/public/data/p/01/` (md5 of `grid_h3_r8.parquet`, `stations.parquet`, `roads.parquet`, `commune.geojson`, `routes_showcase.geojson`, `manifest.json` all match) |
| `manifest.exported_utc` | `2026-08-19T10:16:16+00:00` |
| grid | 4 400 cells, H3 r8 |
| communes | 126 features |
| stations | 939 rows (710 `IN` + 229 `BUFFER`) |
| roads | 115 931 ways |
| occupancy | 703 station rows · 116 785 profile rows · snapshot `evcs_vn_2026-07-29-full`, window `2026-06-29T05:50Z → 2026-07-29T06:00Z` |
| vintages | VNSDI `16/6/2025` · OSM PBF `28/07/2026` · stations `29/07/2026` |

Method: every claim below was recomputed in pandas/numpy **replicating the app's own model
functions byte-for-byte in semantics** — `story/lorenz.ts:lorenz()`, `viz/equity.ts:supplyEquity()`,
`viz/access.ts:accessCurve()`, `viz/chart-models.ts:buildAccessPopulationCurve()`,
`buildUtilizationWeekHeatmap()` (including the `observed_h ≥ OBSERVED_H_MIN` floor and the
in-scope filter), `buildOpportunityCommuneRank()` (including the Q-P4-4 SQL), `state/filter.ts:powerTierOf()`,
and `story/bridges.ts:pathLengthM()` (same `M_PER_DEG_LON = 103 940`). Where the pipeline
publishes the same statistic (`store/qa/01/n07_distance.json`, `data/qa/critique/a14.json`),
the two were cross-checked; disagreements are reported as findings, not averaged.

Numbers marked **(01)** are Hà Nội values and are **not national constants**.

### 0.2 Verdict scale

| verdict | meaning | may appear on screen |
|---|---|---|
| **MEASURED** | reads a shipped column or a `manifest.json` key through a source-of-truth builder | yes, resolved at runtime |
| **DERIVED** | a declared formula over shipped columns, computed by a shared builder | yes, with the formula stated |
| **DECLARED ASSUMPTION** | a threshold or cut chosen by us, not read from data | yes, **named as an assumption** with its value printed |
| **HEURISTIC** | model output with a published error band (Phase 6) | yes, with the band |
| **EDITORIAL** | prose, no number (e.g. bridge names) | yes, explicitly flagged as not-from-data |
| **NEEDS DATA VALIDATION** | true-or-false is not decidable from the shipped package | **no** — withheld until the data ships |
| **REMOVED** | measured and refuted, or not computable as stated | **no** |

### 0.3 Claim-by-claim audit

Legend: **✓** carried into a Phase 7 scene · **✗** removed · **⚠** withheld pending data.

#### A — Demand concentration (Blueprint scene A `von-cuc`)

| # | claim as proposed | measurement | verdict |
|---|---|---|---|
| A1 | "x% of the area holds half of Hà Nội" | `lorenz(area_km2 × area_frac, population)` → **8,41 %** | ✓ MEASURED |
| A2 | "the densest 10 % of area holds y%" | **53,77 %** | ✓ MEASURED |
| A3 | Gini of people over land | **0,6815** (n = 4 400 cells, none dropped: no cell has area 0) | ✓ MEASURED |
| A4 | "the rest — more than nine tenths of the city — holds the other half" | 100 − 8,41 = **91,59 %** | ✓ MEASURED |
| A5 | area denominator honesty: `area_km2 × area_frac` = 3 363,86 km² vs 3 359,77 km² published (126 communes) | **+0,12 %**; raw `area_km2` would give 3 556,4 km² = **+5,9 %** | ✓ MEASURED (existing comment still true) |
| A6 | **"demand clumps around a FEW centres, not at random"** | connected components (H3 `gridDisk k=1`) of cells above a density quantile: **p90 → 92 components** (18 with ≥ 3 cells), **p95 → 31** (5), **p97,5 → 9** (2), **p99 → 1**. The largest component always dominates: 285/440, 165/220, 99/110, 44/44 cells | **✗ REMOVED** — at every threshold that isolates a "centre" there is exactly **one** dominant core. "A few centres" is not what the data shows |
| A7 | replacement claim (new, born from A6) | the component count is **a property of the cut, not of the city**: 92 at p90 → 1 at p99, over the same field | ✓ DERIVED (see §1.3 new shared builder) |
| A8 | spatial structure of demand vs supply | Moran's I: `population` **0,809**, `n_poi_1km` 0,891, `dist_station_network_m` 0,690, **`n_ports` 0,196**, `detour_ratio` 0,097 (queen adjacency, 25 548 edges) | ✓ DERIVED — confirms the `0,19` quoted in `DESIGN.md` §15b |
| A9 | population provenance | `pop_source`: 4 210 `WORLDPOP2025_ANCHORED_VNSDI` · 135 `ZERO_NO_WEIGHT` · 55 `…OFFICIAL_IMPLAUSIBLE`; 135 cells have population 0 | ✓ MEASURED (belongs in the closing scene) |

#### B — Supply does not follow demand (Blueprint scene B `cung-lech`)

| # | claim as proposed | measurement | verdict |
|---|---|---|---|
| B1 | Ba Đình (`00004`): "a central ward, **a six-digit population**, and not one public port" | population **65 023** (commune layer) — **five digits**; ports **0** (both reading units); 4 grid cells; median network distance **2 416 m** | **✗ REMOVED (the wording)** — the port fact holds, "six-digit" is false |
| B2 | replacement subject, resolved not hard-coded | most populous commune with `n_ports = 0` = **Phường Bạch Mai `00292`, 129 571 people** (six digits ✓), 0 ports, median distance 1 563 m | ✓ MEASURED |
| B3 | Tây Mỗ (`00634`): "a less-populated ward carrying the city's largest port count" | 46 894 people (< Ba Đình's 65 023 ✓), **1 082 ports = rank 1 of 126** ✓, 230,73 ports/10k | ✓ MEASURED |
| B4 | "the two are **an order of magnitude** apart" / SoWhat: "**two orders of magnitude**" | Ba Đình = **0** ports/10k. A ratio to 0 has no order of magnitude. Against the median (4,6934) Tây Mỗ is **49,16×** ≈ 1,7 orders | **✗ REMOVED** — replaced by "49× the median, versus zero, which is not a smaller number but no number at all" |
| B5 | communes with no public port | **8 of 126**, holding **557 253 people = 6,31 %** of the city | ✓ MEASURED |
| B6 | supply concentration | Gini(ports over people) = **0,9325** vs Gini(people over land) 0,6815; the densest 10 % of population holds **89,65 %** of ports; **32 of 4 400 cells hold half of all installed ports**; 90,05 % of cells have zero ports; ports in zero-population cells = **0** | ✓ DERIVED (`supplyEquity()`, already shared with the workspace) |
| B7 | commune-level concentration | top-10 communes hold **50,55 %** of ports (matches `a14.json` "sau" 0,505) | ✓ MEASURED |
| B8 | "the dots are 939 public stations" | 939 = 710 `IN` **+ 229 `BUFFER`**. In-boundary count is **710** | ⚠ **must be re-worded**: state both, or the sentence assigns 229 out-of-province stations to Hà Nội |
| B9 | *(new finding, blocks any mixed-unit sentence)* | commune-layer and grid-aggregated values disagree: population median \|rel\| **3,35 %**, but **31 of 126 communes exceed 10 %** and 7 exceed 25 % (Ba Đình 65 023 vs 92 648 = **+42 %**; Đống Đa +64 %; Láng −54 %). `n_ports` totals agree (7 785) but **69 of 126 communes** disagree per-commune (Ngọc Hà 6 vs 104) | ✓ MEASURED — see §1.4 rule R6 |

#### C — The metric must follow the road network (Blueprint scene C `di-vong`)

| # | claim as proposed | measurement | verdict |
|---|---|---|---|
| C1 | median detour ratio | **1,4742** (QA: 1,474) | ✓ MEASURED |
| C2 | "**672 cells** have a real path more than 2× the straight line" | **696 cells**, holding **1 315 068 people** (14,89 % of the city). QA `cells_where_euclid_understates_gt_2x` = 696 | ✓ MEASURED **at 696** — the literal `672` in `DESIGN.md` §14b and in `scenes.ts`/`store.ts` comments is **stale and must be deleted** |
| C3 | straight-line coverage is optimistic at 3 km | euclid 3 864 cells vs network 2 878 → **986 false positives = 25,52 %** (QA identical; HAN_CHE 25,5 %) | ✓ MEASURED |
| C4 | "the error only ever points one way" | min ratio **1,009**; cells with `network < euclid`: **0**; QA check `network_ge_euclid` = PASS | ✓ MEASURED |
| C5 | two kinds of null in one field | 90 nulls = **87** with euclid < 200 m (not applicable) + **3** unreachable (`network_reachable = false`, `evidence_grade_distance` `UNREACHABLE_NO_PATH` 2 / `NO_ROAD_ACCESS` 1) | ✓ MEASURED (`nullSplit` already implements this) |
| C6 | "**4 154** bridge segments in the data", "median 16 m, p90 90 m, p99 1 146 m, max 4 475 m", "> 1 km keeps **48**" (`bridges.ts`) | shipped `roads.parquet`: **3 027** rows with `bridge = true`; lengths median **16,5 m**, p90 **102,2 m**, p99 **1 372,4 m**, max **4 474,5 m**; `> 1 000 m` keeps **45** | **✗ REMOVED** (all four literals stale) — the runtime count already recomputes; the doc comment must be rewritten |
| C7 | manifest `bridge_ways_shipped = 3 319` printed next to `ways_shipped = 115 931` | the parquet contains **3 027**. `n11_web_export._roads_parquet` computes the bridge count as `df[df.in_province].bridge.sum()` — **before** the class/access filters that produce `ship` | **✗ DEFECT** (§9 D1): the two stats in one panel use different denominators; overstates by 292 (9,6 %) |
| C8 | "the longest bridge segment is in the west and does not cross the Red River" | longest = 4 474,5 m at `[105,495 · 21,179]` — west, TRUNK class ✓ | ✓ MEASURED |
| C9 | red-river bridge names (Thăng Long · Nhật Tân · Long Biên · Chương Dương · Vĩnh Tuy · Thanh Trì) | the OSM extract carries no `name` column | ✓ **EDITORIAL** — keep as prose in the panel, never as a map label (unchanged rule) |
| C10 | the three showcase route pairs | 3 pairs ship; detour **6,97 / 3,86 / 2,22**; in all three the network-nearest and the euclid-nearest station are **different stations** (`station_name` differs per feature) — direct evidence for the field-level reading of `detour_ratio` | ✓ MEASURED — surface the two station names, which the panel does not do today |
| C11 | code comments "160 823 segments", "396/160 823 unreachable" (`queries.ts`) | **115 931** shipped, **222** null `dist_station_m` (manifest agrees) | **✗ REMOVED** (stale comments) |

#### D — Who is beyond the service radius (new scene, Opportunity lens)

| # | claim | measurement | verdict |
|---|---|---|---|
| D1 | share of people within 2 km by network | **71,04 %** (6 273 828 people) | ✓ MEASURED (`buildAccessPopulationCurve`, `BEYOND_2KM_M`) |
| D2 | people beyond 2 km | **2 547 727 = 28,85 %** (manifest `share_pop_beyond_2km` 0,2885) | ✓ MEASURED |
| D3 | people whose cell has no measured distance | **9 571** in 3 cells — never folded into "within" or "beyond" | ✓ MEASURED |
| D4 | "no single commune dominates the gap" | top commune (Hồng Hà) = 74 425 = **2,92 %** of the 2,55 M; top 10 = **22,3 %** | ✓ DERIVED (Q-P4-4 + `buildOpportunityCommuneRank`) |
| D5 | breadth of the gap | **35 of 126** communes have > 50 % of their people beyond 2 km; worst is Xã Minh Châu at **98,2 %**; **0** communes at 100 % | ✓ DERIVED |
| D6 | screening outcome | `screen_decision`: TỪ CHỐI 2 260 · ĐỀ XUẤT 1 782 · ĐỀ XUẤT NẾU CÓ DC 358; `screen_margin_m` median −261,7 m | ✓ MEASURED — **RULE OUTPUT**, must never be described as a measurement |
| D7 | 2 km itself | policy radius, `BEYOND_2KM_M` | ✓ **DECLARED ASSUMPTION** — printed as such |

#### E — Weekly rhythm (new scene, Utilization lens)

| # | claim | measurement | verdict |
|---|---|---|---|
| E1 | busiest vs quietest hour of the week | on `buildUtilizationWeekHeatmap` semantics (in-scope stations, `n_ports > 0`, `observed_h ≥ 1`, Σocc/Σports): max **0,3618** at t = 167, min **0,1101** at t = 51 → **3,29×** | ✓ DERIVED |
| E2 | **the clock label of those hours** ("23:00", "03:00") | `dow`/`hour` are documented in `docs/COT.md` only as "thứ 0–6" / "giờ 0–23". **No timezone is declared anywhere** in the repo, and the source is upstream (`aGiang-evcs`). Under a local reading the curve is plausible (trough 03 h, peak 23 h); under UTC it would be trough 10:00 and peak 06:00 local | **⚠ NEEDS DATA VALIDATION** — the *shape* claim ships, the *clock* claim does not, until `occupancy_hour_tz` is published (§10 U1). This also puts an existing caveat on Scrubber / Heatmap168 / HourProfile |
| E3 | median station utilization | **0,2263** over all 703 rows; **0,2318** over `grade = GOOD` — the manifest's `util_median` is the latter | ✓ MEASURED — the scene must say which |
| E4 | "utilization is measured on 95,2 % of stations" | 703 of 710 in-boundary stations carry telemetry = **99,0 %**; manifest `share_stations_measured` 0,9521 = **occ_status OK 676 / 710**. Two different definitions of "measured" | ✓ MEASURED — print the definition, not just the ratio |
| E5 | cell-level utilization coverage | `util_cell` present on **437 cells = 9,93 %** of cells / **27,93 %** of people, but **97,33 %** of the 449 cells that have a station | ✓ MEASURED |
| E6 | one operator | **704 of 710** in-boundary stations are VinFast = **99,15 %**; 4 distinct operators in scope | ✓ MEASURED — mandatory caveat on every utilization sentence |
| E7 | observation floor | **2 046** hour-cells of in-scope stations fall below `observed_h < 1 h` and are drawn as "not observed", never as 0 | ✓ MEASURED |

#### F — The exclusion rule (new scene, method)

| # | claim | measurement | verdict |
|---|---|---|---|
| F1 | the single largest number in the dataset is a decision | `manifest.totals.private_ac_dropped`: **1 811 stations dropped** = **71,84 %** of raw rows, carrying **18,87 %** of guns and **7,01 %** of power **(01)** | ✓ MEASURED (manifest) |
| F2 | it is not a national constant | across provinces `private_ac_share_stations` spans **0,486 → 0,787**, `private_ac_share_power` **0,043 → 0,159** (`provinces.parquet`, 34 rows) | ✓ MEASURED |
| F3 | what remains at the bottom of the power ladder | in-scope stations ≤ 22 kW: **173 of 710 = 24,4 %**, holding 979 ports (12,6 %) and 12 518 kW (5,4 %) | ✓ DERIVED (`buildSupplyPowerTierBreakdown`) |
| F4 | **the counterfactual** — "the rule moved the median network distance from 1 257 m to 2 306 m and pushed 969 213 people past 2 km" | present only in `data/qa/critique/a14.json`, which is **not shipped to the web**. The same file's `median_m_sau` (2 306,4) already disagrees with today's grid (**2 322,1**) because the package was re-exported since | **⚠ NEEDS DATA VALIDATION** — withheld until the pipeline publishes it into `manifest` (§10 U2). This disagreement is itself the argument for the rule |

#### G — What we cannot say (closing scene)

| # | claim | measurement | verdict |
|---|---|---|---|
| G1 | demand is inferred, not observed | E5 above: telemetry exists on 9,93 % of cells / 27,93 % of people | ✓ MEASURED |
| G2 | POI is a coverage layer, not a demand layer | **73,34 %** of cells have zero POI within 1 km and they hold **35,63 %** of the population; class bias `poi_bias_phuong_vs_xa` = **41,37** | ✓ MEASURED (HAN_CHE §7 agrees: 73,3 % / 35,6 %) |
| G3 | no electricity-grid layer, no `buildable` column | absent by decision (HAN_CHE §4, §5) | ✓ MEASURED (absence of columns is checkable) |
| G4 | everything is a snapshot | `manifest.snapshots` — stations 29/07/2026, OSM 28/07/2026, VNSDI 16/6/2025 | ✓ MEASURED |
| G5 | per-capita numbers inherit an inflated denominator | national `danso` total 113 625 653 vs ~101 M actual, uneven by province (HAN_CHE) — this reaches `ports_per_10k_pop` at province level and `population` at commune level via anchoring | ✓ MEASURED — required caveat wherever a per-capita ratio appears |
| G6 | the closing sentence: "clumped demand ⇒ mixture model; **soft, overlapping clusters ⇒ Gaussian rather than hard clusters**; network distance ⇒ no Euclid" | clause 1 ✓ (A1–A3); clause 3 ✓ (C1–C4); **clause 2 as written is unsupported** — nothing in the shipped package measures cluster overlap or boundary softness, and A6 refutes the "several clusters" reading it depends on. There is also an unstated tension: a Gaussian mixture in projected coordinates *is* a Euclidean-metric model, which clause 3 argues against | **✗ REMOVED as written**, replaced by the A7 formulation: *the cluster count is a property of the threshold, so a method that must be told how many hard clusters exist is being asked a question this data does not answer* |

#### H — Not used (measured, kept out of the story)

| # | claim | measurement | why not used |
|---|---|---|---|
| H1 | Hà Nội in national context: rank **2 of 34** in ports/10k (8,91 vs Thái Nguyên 10,96); holds **13,91 %** of national ports with 7,69 % of published population | ✓ MEASURED | the denominator is the inflated `danso` (G5) and the story is province-scoped; belongs to the National surface, not to a scene |
| H2 | "detour ratio > 2 in 672 cells" | see C2 | stale literal, deleted everywhere |

### 0.4 Summary

* claims carried into a scene: **43** (A 8 · B 6 · C 8 · D 7 · E 6 · F 3 · G 5)
* claims **REMOVED**: **6** (A6, B1-wording, B4, C6, C11, G6-clause-2) plus the stale literal C2/H2
* claims **NEEDS DATA VALIDATION**: **3** (E2 clock labels, F4 counterfactual, B8 re-wording is mandatory before ship)
* defects found in shipped code/data: **6** (§9)

---

## 1. Architecture — a scene is configuration, not code

### 1.1 What changes from today

`web/src/story/` today holds four hard-coded scenes, two hard-coded commune codes, one
story-local query (`fetchDetourStats`), one story-local metric module (`lorenz.ts`, which the
workspace already reaches into from `viz/equity.ts`), and four React bodies that each fetch
their own data. Phase 7 keeps the parts that were right — every number already resolves at
runtime, `sceneState()` already writes into the shared store, `nullSplit` already refuses to
merge two kinds of null — and replaces the parts that do not scale:

| today | Phase 7 |
|---|---|
| scene = a `Scene` object **plus** a bespoke `.tsx` body that fetches | scene = **one declarative `SceneSpec`**; one generic renderer walks it |
| commune codes `"00004"` / `"00634"` written into the source | **`SubjectSpec` resolvers** evaluated against the loaded package |
| camera literals `{lng, lat, zoom}` per scene | **`CameraSpec`** — `fit-province` \| `fit-subject` \| `fit-marks` \| explicit, resolved through the Phase 5 fit helpers (§1.6) |
| `fetchDetourStats` lives in the story's half of `queries.ts` | every metric is a **`MetricRef`** into a shared builder (§1.4); the story owns none |
| prose with numbers interpolated inline in JSX | **claim templates** with named numeric slots; a slot that fails to resolve withholds its sentence (§1.5) |
| `story_enabled = (province_code == "01")` | **capability gating** — each scene declares `requires`; the province equality test survives only for scenes carrying province-specific prose (§1.8) |
| beat is not serializable | beat joins the hash (§1.7) |

### 1.2 Type contract

```ts
// web/src/story/spec.ts — pure data, no React, no DuckDB, no window.
export interface SceneSpec {
  id: SceneId;
  kicker: string;                    // "LUẬN ĐIỂM A" — ties the scene to its thesis
  title: string;
  claim: ClaimTemplate;              // ONE sentence, §1.5
  lens: LensId;                      // the scene borrows the workspace lens, it does not invent one
  beats: readonly BeatSpec[];        // ≥ 1; the first is the entry frame
  camera: CameraSpec;
  layers: readonly OverlayId[];
  subject: SubjectSpec | null;       // what the scene is ABOUT; null = the whole province
  chart: SceneChartBinding;          // §3
  annotations: readonly AnnotationSpec[];
  narrative: readonly ClaimTemplate[];
  requires: SceneRequirement;        // §1.8
  basemapLayer?: "river";
}

export interface BeatSpec {
  id: string;
  label: string;                     // the button that switches to this beat
  field: string;                     // exactly ONE painted field per beat (Phase 2 constraint 2)
  filter?: BeatFilterSpec;           // narrows the drawn set; threshold resolved, never literal
  marks: readonly SceneMark[];       // "bridges" | "routes" — beat-scoped, never a LAYER tab entry
  t?: TimeSpec;                      // scene-owned scrubber position (§2.6); absent = leave t alone
  camera?: CameraSpec;               // beat may re-frame; absent = inherit the scene camera
}

/** A threshold is declared, then resolved against the package — Phase 5 §2.3 mechanism, reused verbatim. */
export type ThresholdSpec =
  | { kind: "literal"; value: number }        // only for policy constants (BEYOND_2KM_M)
  | { kind: "quantile"; q: number }           // resolved on analysable values of the field
  | { kind: "extreme"; at: "min" | "max" };

export interface BeatFilterSpec {
  entity: "h3-cell";
  field: string;
  op: "gt" | "ge" | "between";
  lo?: ThresholdSpec; hi?: ThresholdSpec; value?: ThresholdSpec;
  /** printed next to the count of surviving cells — Phase 4 §13b-2 constraint 2 */
  label: (resolved: number) => string;
}

/** WHAT the scene points at, resolved from data — never a hard-coded code. */
export type SubjectSpec =
  | { kind: "province" }
  | { kind: "commune-extreme"; measure: string; at: "max" | "min"; where?: CommunePredicate }
  | { kind: "cell-extreme";    measure: string; at: "max" | "min"; where?: CellPredicate }
  | { kind: "commune-set";     rank: string; take: number }
  | { kind: "explicit";        selection: string };  // requires a written justification comment

export type CameraSpec =
  | { kind: "fit-province" }                                   // manifest.province.bbox
  | { kind: "fit-subject"; zoomOut?: number }                  // §1.6, default SCENE_CONTEXT_ZOOM_OUT
  | { kind: "fit-marks"; mark: SceneMark }                     // e.g. the drawn major bridges
  | { kind: "explicit"; view: View; why: string };
```

`SceneId` stays a closed union so `parseScene()` keeps rejecting unknown slugs the same way it
does today (`DESIGN.md` §9 rule 1: drop one key, never reset the app).

### 1.3 The single new shared metric

Phase 7 introduces **exactly one** new metric, and it is added to the **workspace's** shared
layer, not to the story:

```ts
// web/src/viz/chart-models.ts
export interface SpatialStructureModel {
  field: string;
  moranI: number | null;                     // queen adjacency on H3 gridDisk(k=1)
  steps: readonly {
    q: number;                               // 0.90 | 0.95 | 0.975 | 0.99
    threshold: number;                       // the real value of the cut, printed
    nCells: number;
    nComponents: number;                     // connected components at that cut
    nComponentsGe3: number;
    largestComponentCells: number;
    largestComponentPop: number;
  }[];
}
export function buildSpatialStructureModel(
  cells: readonly GridCell[], field: string, quantiles: readonly number[],
): SpatialStructureModel;
```

Why it belongs in the shared layer and not in `story/`: it answers a Demand-lens question
("how many separate high-density areas are there, and does that number survive changing the
cut?"), it consumes the `GridCell[]` snapshot the workspace already holds, and the story is
merely its first caller. Putting it in `story/` would be exactly the "separate hard-coded
metric logic" this phase forbids. It is pure (no DOM, no DuckDB) so it runs under `node --test`.

Measured output for `population`/`pop_density_ppkm2` on package (01) is in §0.3 A6–A8.

### 1.4 Metric binding — where every number comes from

```ts
export type MetricRef =
  | { src: "manifest";     path: string }                       // e.g. "totals.private_ac_dropped.share_stations"
  | { src: "chart-model";  model: PrimaryChartId | SharedModelId; select: string }
  | { src: "query";        query: SharedQueryId; select: string }
  | { src: "assumption";   id: string };                        // printed as an assumption
```

Rules, each testable:

* **R1 — no story SQL.** A scene may only reference `SharedQueryId`s that exist in
  `data/queries.ts` and are reachable from Map Workspace. If a claim needs a query nobody else
  has, the query is added to the shared layer **with a workspace caller**, or the claim is
  withheld. `fetchDetourStats` qualifies (it is the Access lens' straight-line-error statistic)
  and moves out of the "story" comment block into the Access section, keeping its name.
* **R2 — no story metric functions.** `story/lorenz.ts` **moves to `viz/lorenz.ts`**: the
  workspace's `viz/equity.ts` already imports it, so today's location has the dependency arrow
  pointing backwards. Imports and its existing tests move with it; no behaviour changes.
* **R3 — one definition per sentence.** Where a statistic has more than one defensible
  definition (E3 median utilization, E4 "measured", B9 reading unit), the scene names the
  definition in the sentence. Two scenes may not use two definitions of the same word.
* **R4 — assumptions are visible.** `DECLARED ASSUMPTION` values (2 000 m, detour > 2,
  bridge > 1 000 m, density quantiles) render with their number **and** the word "giả định"
  in the annotation, never silently inside a computed-looking figure.
* **R5 — resolution failure withholds, never defaults.** A `MetricRef` that resolves to
  `null`/`undefined` removes its sentence (§1.5). No `?? 0`, no "—" standing where a claim was.
* **R6 — one reading unit per scene.** A scene declares `readAs` implicitly through its beat
  field; any number from a different unit must be labelled with that unit in the same
  sentence. B9 makes this non-negotiable: Ba Đình is 65 023 people in the commune layer and
  92 648 in the grid layer, and both are correct in their unit.

### 1.5 Claim templates

```ts
export interface ClaimTemplate {
  /** Parts are literal strings and metric slots; a slot that fails to resolve drops the WHOLE part. */
  parts: readonly (string | { slot: MetricRef; fmt: FormatId; unit?: UnitId })[];
  /** If any REQUIRED slot is unresolved, the sentence is not rendered at all. */
  required?: readonly number[];
}
```

The formatter is `ui/format.ts` + `units.ts` (Phase 4 unit tokens) — the story does not format
numbers its own way. A slot never renders a bare ratio where the workspace would render a
percentage, and vice versa.

### 1.6 Camera resolution

Camera fitting is **not** re-derived here. Phase 5 §1.8 already shipped
`zoomForFeatureBounds(bbox)` (chrome-aware, padding 1,15, clamped to [10, 15]) and
`zoomForBbox(bbox)` for the province; Phase 7 calls them.

```ts
export const SCENE_CONTEXT_ZOOM_OUT = 1.5;   // DECLARED ASSUMPTION, printed in the scene spec
// fit-subject  → zoomForFeatureBounds(subjectBbox) − SCENE_CONTEXT_ZOOM_OUT
// fit-marks    → zoomForFeatureBounds(markBbox)            (marks already carry their own margin)
// fit-province → zoomForBbox(manifest.province.bbox)       = the app's INITIAL_VIEW
```

Why the offset exists and why it is an assumption rather than a measurement: navigation
(Phase 5) wants the subject to **fill** the viewport — it is answering "show me this". A scene
wants the subject to be **legible inside its surroundings** — it is answering "look how this
one differs from what is around it". 1,5 zoom levels takes a 2,45 km ward from ~87 % of the
map width to ~31 %, and it reproduces the framing the shipped scenes chose by hand
(Ba Đình: 14,5 − 1,5 = **13,0** vs the hard-coded 13; Tây Mỗ: 14,3 − 1,5 = **12,8** vs 12,5).

Resolved values for every Phase 7 subject on package (01), window 1440 × 900:

| subject | centre | `zoomForFeatureBounds` | scene zoom |
|---|---|---:|---:|
| province (fit) | `105,6545 · 20,9735` | — | **9,3** |
| Phường Bạch Mai `00292` | `105,8518 · 21,0021` | 14,9 | **13,4** |
| Phường Ba Đình `00004` | `105,8386 · 21,0398` | 14,5 | **13,0** |
| Phường Tây Mỗ `00634` | `105,7464 · 21,0002` | 14,3 | **12,8** |
| Xã Ứng Hòa `10402` | `105,8482 · 20,6924` | 12,3 | **10,8** |
| Xã Minh Châu `09661` | `105,4545 · 21,2111` | 12,9 | **11,4** |
| Phường Hồng Hà `00097` | `105,8472 · 21,0481` | 12,4 | **10,9** |
| major-bridge marks (42 of 45 segments) | `105,8436 · 21,0328` | 11,8 | **11,8** |

Camera writes go through the existing `flyTo(view, select)` action (Phase 5 §1.8: one
transition for camera **and** selection, never two calls).

### 1.7 Serialization

| key | today | Phase 7 |
|---|---|---|
| `s` | scene slug | unchanged |
| beat | **not serializable** — a link into scene C always lands on beat 1 | `s=<scene>.<beat>`; unknown beat suffix falls back to beat 1, the same way an unknown slug falls back to map mode |
| `f`, `v`, `l`, `t`, `b` | not written in story mode (the scene owns them) | unchanged, and `t` is now genuinely scene-owned (§2.6) rather than merely suppressed |
| `c` | written (the viewer's selection inside a scene) | unchanged |

`serializeHash` must keep emitting exactly one of `s` / `d`; the beat suffix does not change
that invariant.

### 1.8 Gating and portability

`story_enabled = (code == "01")` in `n11_web_export.py` is a **province equality test standing
in for a capability test**. All 34 province packages ship `population`, `dist_station_network_m`,
`detour_ratio` and `roads.dist_station_m`; only `routes_showcase.geojson` is Hà Nội-only. So
today's gate withholds five portable scenes because one scene's ornament is missing.

```ts
export interface SceneRequirement {
  gridColumns?: readonly string[];
  communeColumns?: readonly string[];
  roadColumns?: readonly string[];
  files?: readonly string[];
  manifestKeys?: readonly string[];
  /** true only for scenes whose PROSE names a place (Sông Hồng, its bridges). */
  editorialProvince?: string;
}
```

* A scene renders iff every requirement resolves against the open package.
* A scene that fails its requirement is **absent**, not greyed: the story is a sequence, and a
  disabled step in a sequence is a dead end.
* `manifest.story_enabled` becomes `n_renderable_scenes > 0`, computed by the exporter from
  the same declarations — not a province code.
* The Hà Nội-only content is exactly: scene `di-vong` beat 1's route pairs and bridge prose
  (`editorialProvince: "01"`). Everything else in §2 is portable, and the audit numbers in
  §0.3 are the province-01 instantiation of portable derivations.

### 1.9 What Story Mode still must not do

Unchanged from `DESIGN.md` §14: one store (not a story copy); the scene column **replaces** the
workspace column; floating inspector and compare dock stay hidden; a scene owns field, view,
overlays and selection, so nothing else may write them while a scene is open. New: a scene may
own `t` (§2.6) but may not own `b` — a story that filters the workspace's brush would hand the
viewer a filtered map on exit without having said so.

---

## 2. The scenes

Seven scenes ship; an eighth is specified and gated (§2.8). Order is the argument's order:
**what the demand looks like → where the supply is → how we are allowed to measure distance →
who is left out → when the network is busy → what we chose to exclude → what we still cannot
say.** Every RESULT below is the value measured on package (01) at
`exported_utc = 2026-08-19T10:16:16+00:00`; **none of these values is written into the code** —
they are the expected output of the declared derivation and belong in the golden test (§8).

### 2.1 Scene 1 — `von-cuc` · "Cầu không trải đều"

**CLAIM**
Hà Nội's people are concentrated, not spread: **8,4 % of the city's land holds half of its
population**. And the number of separate "dense areas" is **a property of the cut you choose,
not of the city** — 92 of them at the 90th density percentile (18 of which are larger than two
cells), exactly **one** at the 99th.

**QUERY / DERIVATION**
`fetchAreaPop()` → `lorenz(area_km2 × area_frac, population)` → `areaShareForPop(0,5)`,
`popShareForArea(0,10)`, `gini`. Structure beats: `buildSpatialStructureModel(cells,
"pop_density_ppkm2", [0,90 · 0,95 · 0,975 · 0,99])` (§1.3) — connected components over H3
`gridDisk(k = 1)` adjacency, plus Moran's I on the same graph. Beat filters resolve their cut
through `ThresholdSpec { kind: "quantile" }`, never a literal.

**RESULT**
`areaShareForPop(0,5)` = **0,0841** · `popShareForArea(0,10)` = **0,5377** · Gini = **0,6815** ·
n = **4 400** cells (none dropped) · area denominator 3 363,86 km² = published + 0,12 %.
Components: **92** (p90, cut 5 501 người/km², 440 cells; 18 components ≥ 3 cells) → **31**
(p95, 9 349, 220; 5 ≥ 3 cells) → **9** (p97,5, 16 030, 110; 2) → **1** (p99, 29 748, 44).
Largest component holds 285/440 · 165/220 · 99/110 · 44/44 cells — i.e. one core plus specks
at every cut, which is why the annotation prints both the count and the largest share.
Moran's I: population **0,809**, `n_ports` **0,196**.

**CONFIDENCE**
MEASURED (Lorenz, components, Moran). The inference "therefore a soft/mixture assignment
rather than a fixed cluster count" is an **ARGUMENT** stated as such in the narrative, not as
a measurement.

**GEOGRAPHIC SUBJECT**
`{ kind: "province" }` — the whole package. No named place; naming one here would suggest the
concentration is about a district rather than about the distribution.

**CAMERA TARGET**
`fit-province` → `105,6545 · 20,9735`, zoom **9,3**, pitch 0, bearing 0 (identical to the app's
boot view, so entering the story from the map does not move the ground).

**MAP LAYERS**
Beat 1 `mat-do`: paint `population` as the demand **surface** (isopleth; below `HEX_MIN_ZOOM`
the render plan already selects `surface`). Beat 2 `nguong-p90` and beat 3 `nguong-p99`: paint
`pop_density_ppkm2` as hex, **filtered** to the cut — filtered cells draw at any zoom (Phase 4
§13b-2), unfiltered cells draw **nothing**, not a grey hatch ("known and excluded" ≠ "unknown").
Overlays: none. Basemap: positron.

**ANNOTATION**
Beat 1: one figure — `8,4 %` / "diện tích" — plus the Lorenz callout at 50 %. Beat 2–3: the
**real value of the cut** (`5 501` / `29 748` người/km²), the surviving cell count, the
component count, and the word *giả định* on the quantile choice (R4). No annotation names a
place.

**CHART**
Primary: `demand-population-histogram` (lens `demand`, Phase 4 registry — unchanged, and it
keeps its brush→`AnalysisFilter` behaviour disabled inside a scene). Scene figure: the Lorenz
curve (`viz/lorenz.ts` after the R2 move, rendered by the existing `LorenzChart`). Beat 2–3
figure: the component-count-vs-cut step chart from `SpatialStructureModel`.

**NARRATIVE**
"If the people of Hà Nội were spread evenly, the right tool would be a grid, and every
clustering method would be surplus. They are not spread evenly: 8,4 % of the land holds half
of them. But notice what happens when we ask *how many* dense areas there are — 92 at one cut,
one at another, over the same field. The count is not in the city; it is in the threshold. So
a method that has to be told the number of clusters in advance is being asked a question this
data cannot answer, and a method that assigns membership **softly** is not a stylistic
preference — it is the honest response to a field with no natural break."

---

### 2.2 Scene 2 — `cung-lech` · "Cung không đi theo cầu"

**CLAIM**
Supply is far more concentrated than demand, and it is concentrated **somewhere else**:
Gini of ports over people = **0,93** against 0,68 for people over land; **32 of 4 400 cells
hold half of every installed public port**; **8 of 126 communes have no public port at all**
and **557 253 people** live in them.

**QUERY / DERIVATION**
`fetchCommunes()` (commune layer) + the `GridCell[]` snapshot. `supplyEquity(cells)` →
`lorenz(population, n_ports)` (already shared with the workspace). Subjects resolved, not
typed: `{ kind: "commune-extreme", measure: "population", at: "max", where: n_ports = 0 }` and
`{ kind: "commune-extreme", measure: "n_ports", at: "max" }`. Median of
`commune:ports_per_10k_pop` over the 126 features.

**RESULT**
Gini(ports over people) = **0,9325** · densest 10 % of population holds **89,65 %** of ports ·
**32** cells hold 50 % of ports · 90,05 % of cells hold none · ports in zero-population cells =
**0**. Subject A resolves to **Phường Bạch Mai `00292`** — 129 571 people, **0** ports, median
network distance 1 563 m. Subject B resolves to **Phường Tây Mỗ `00634`** — 46 894 people,
**1 082** ports (rank 1 of 126), **230,73** ports/10k = **49,2×** the median **4,69**. Communes
with zero ports: **8**, holding **557 253** people (**6,31 %**). Top-10 communes hold **50,55 %**
of all ports.

**CONFIDENCE**
MEASURED / DERIVED. Explicitly **not** claimed: "an order of magnitude apart" — subject A's
ratio is 0, and a ratio to zero has no order (audit B4).

**GEOGRAPHIC SUBJECT**
Two resolved communes (above), each with its own card; the map paints all 126.

**CAMERA TARGET**
Scene: `fit-province` (9,3). Card A → `105,8518 · 21,0021` zoom **13,4**. Card B →
`105,7464 · 21,0002` zoom **12,8**. Both via `flyTo(view, "commune:<code>")` — one transition
carrying camera and selection.

**MAP LAYERS**
Paint `commune:ports_per_10k_pop` (commune polygons — reading unit `commune`, sequential ramp:
pale = few, dark = many). Overlay `stations`, drawn with the in-scope / buffer distinction the
symbol grammar already carries. Beat 2 `duong-cong` keeps the same paint and puts the supply
Lorenz in the figure slot.

**ANNOTATION**
Per card: population · ports · ports per 10k · multiple-of-median. The zero card renders
"**0 cổng**" and the sentence "không phải ít hơn — là không có", and it **must not** print a
multiple-of-median (R5: an unresolvable slot drops its sentence). One line states the reading
unit: *số của XÃ (lớp xã), không phải tổng theo ô* (R6, audit B9).

**CHART**
Scene figure: supply Lorenz (`SupplyLorenz`, the workspace's own §3d-3 component). Primary
chart of the lens (`supply-power-tier-breakdown`) is **not** shown here: it answers a different
question (what kind of power), and Scene 6 uses it where it is the argument.

**NARRATIVE**
"If supply already followed demand there would be nothing to solve. Two wards, same city, same
administrative rank. Bạch Mai has 129 571 people and no public charging port. Tây Mỗ has fewer
people — 46 894 — and the largest number of ports in the city: 1 082, which is 49× the median
per capita. Read the ratio carefully: with a small denominator it explodes, which is exactly
why the population column sits beside it and why these two are **named** instead of merely
shaded. The distribution behind the two names: half of every installed port stands in 32 of
4 400 cells."

---

### 2.3 Scene 3 — `di-vong` · "Thước đo phải theo mạng đường"

**CLAIM**
Straight-line distance is not a cheaper version of road distance — it is **wrong in one
direction only**. At a 3 km radius, straight lines report **986 cells as covered that the road
network says are not** (25,5 % of everything they call covered), and **696 cells** have a real
path more than twice their straight line.

**QUERY / DERIVATION**
`fetchRoads()` (segment-level `dist_station_m`), `fetchShowcaseRoutes()` (3 pairs),
`fetchDetourStats(threshold = 2, radiusM = 3 000)` — one scan, five statistics, relocated to
the shared Access section of `queries.ts` (R1). Major bridges: `majorBridges(roads,
MAJOR_BRIDGE_MIN_M)` over `pathLengthM` — a **declared** 1 000 m cut, not a "crosses the Red
River" flag, which the data does not carry.

**RESULT**
Detour median **1,4742**; cells > 2 = **696** holding **1 315 068** people; at 3 km euclid
**3 864** vs network **2 878** → **986** false positives = **25,52 %**; min ratio **1,009** and
**zero** cells where the network path is shorter than the straight line; nulls **90** = 87
(euclid < 200 m, not applicable) + 3 (unreachable). Roads: **115 931** drawn, **222** with no
distance label (drawn grey, not zero), **3 027** flagged `bridge`, **45** longer than 1 km, of
which **42** sit in the central Red-River window; bridge length median **16,5 m**, p99
**1 372 m**, max **4 474,5 m** (the longest is in the west and crosses no river). Route pairs:
detour **6,97** (Xã Sóc Sơn) · **3,86** (Xã Vân Đình) · **2,22** (Phường Phú Lương) — and in all
three the nearest-by-network and nearest-by-euclid stations are **different stations**.

**CONFIDENCE**
MEASURED, except: 1 000 m bridge cut = **DECLARED ASSUMPTION**; the six bridge names =
**EDITORIAL** (the OSM extract has no `name` column, so they live in the panel as prose and
never as a map label).

**GEOGRAPHIC SUBJECT**
Beat 1: the Red-River crossing corridor, resolved as the bbox of the drawn major-bridge marks
(not a typed coordinate). Beat 2: the 696-cell set — a set, not a place.

**CAMERA TARGET**
Beat 1 `mang-duong`: `fit-marks` → `105,8436 · 21,0328`, zoom **11,8**. Beat 2 `hau-qua`:
`fit-province` → 9,3 (the consequence is city-wide; framing it on the river would imply the
detour problem is only the river's).

**MAP LAYERS**
Beat 1: paint `road:dist_station_m` (reading unit `road` — the segments carry the label, and
this is the only place the Dijkstra result is visible as a **flow**); marks `bridges` (the 45
long segments, stroked heavy) and `routes` (3 network paths + their 3 straight-line partners);
basemap layer `river` attached for the scene's lifetime and detached on exit. Beat 2: paint
`detour_ratio`, filtered `> 2`; `nullSplit` stays on so the 87 "not applicable" cells never
share a symbol with the 3 unreachable ones.

**ANNOTATION**
Beat 1: segments drawn · long-bridge count (**runtime**, from the same array the map draws —
never `manifest.roads.bridge_ways_shipped`, which counts a different set, defect D1) ·
unreachable segments · the three route pairs with **both station names** and the detour
multiple. Beat 2: figure "**696 ô**" + "**1 315 068 người**"; euclid-covered vs
network-confirmed at 3 km with the difference and its share; the sentence that the error is
one-sided; and "giả định: hệ số > 2" on the cut.

**CHART**
Primary: `access-population-curve` (lens `access`), with the 2 km policy hairline. The
straight-line-vs-network comparison stays a stat block, not a second chart: two cumulative
curves on one frame invite reading their gap as a distance, which it is not.

**NARRATIVE**
"Why not just run k-means on straight-line distance? Because in this city the straight line is
not noisy — it is **biased**, and it is biased with a geometric cause. Watch the colour flow
down the streets, then stop dead at the Red River: the east bank is not far from the centre as
the crow flies, but by road it must reach one of a handful of long crossings. The measured
consequence: 696 cells where the real path is more than twice the straight line, and at a 3 km
radius, a quarter of everything the straight line calls 'covered' is not covered at all. The
error never points the other way — the real path is never shorter (minimum observed ratio
1,009). An algorithm that minimises straight-line distance is optimising a quantity that is
systematically optimistic about exactly the places that are worst served."

---

### 2.4 Scene 4 — `ngoai-2km` · "Hai triệu rưỡi người ngoài bán kính"

**CLAIM**
**2 547 727 people — 28,9 % of the city — live more than 2 km by road from the nearest public
station.** The gap is not one neighbourhood's problem: the worst commune accounts for **2,9 %**
of it, and the top ten together for **22,3 %**.

**QUERY / DERIVATION**
`buildAccessPopulationCurve(cells)` (Phase 4 §4.2 model; `BEYOND_2KM_M` from
`domain-thresholds.ts`, one constant for SQL and TS alike) and Q-P4-4
`fetchOpportunityCommunes()` → `buildOpportunityCommuneRank()`. Population conservation
(`within + beyond + unknown = total`) is already asserted at the query boundary and must stay
asserted. Cross-check against `manifest.quality.pop_beyond_2km_network` (**2 547 726**) and
`share_pop_beyond_2km` (**0,2885**) — the 1-person gap is float summation order, not a
disagreement.

**RESULT**
within 2 km **6 273 828** = **71,04 %** · beyond **2 547 727** = **28,85 %** · distance
unknown **9 571** people in **3** cells (never folded into either side) · median network
distance **2 322 m**, p90 **4 833 m**. Commune rank: **Phường Hồng Hà** 74 425 (2,92 % of the
total) · Ba Đình 68 395 · Xã Ô Diên 59 590 · Xã Ứng Hòa 56 463 · Xã Phượng Dực 54 713; top-10 =
**22,3 %**. **35 of 126** communes have more than half their people beyond 2 km; the extreme is
**Xã Minh Châu at 98,2 %**; **no** commune is at 100 %. Screening (rule output, not a measure):
TỪ CHỐI 2 260 · ĐỀ XUẤT 1 782 · ĐỀ XUẤT NẾU CÓ DC 358.

**CONFIDENCE**
MEASURED / DERIVED; **2 km is a DECLARED ASSUMPTION** (registered policy radius) and is
labelled as one; `screen_decision` is labelled **RULE OUTPUT** wherever it appears.

**GEOGRAPHIC SUBJECT**
`{ kind: "commune-set", rank: "population_beyond_2km", take: 10 }`, with one resolved
illustration under the declared rule *highest absolute count among communes whose own share
also exceeds 50 %* — so the card cannot be a small-denominator artefact. It currently resolves
to **Phường Hồng Hà `00097`**: 74 425 people beyond 2 km, **57,6 %** of its own population.
(Shares of the other four in the top five, for the bars: Ba Đình 73,8 % · Ô Diên 61,0 % ·
Ứng Hòa 89,5 % · Phượng Dực 93,8 %.)

**CAMERA TARGET**
Scene: `fit-province` (9,3). Illustration card → `105,8472 · 21,0481`, zoom **10,9**.

**MAP LAYERS**
Paint `dist_station_network_m` (cell). Overlays `beyond2km` + `stations`. The three
distance-unknown cells keep the "unknown" hatch — they are 9 571 people, and drawing them as
"far" would be as wrong as drawing them as "near".

**ANNOTATION**
Figure "**2 547 727 người**" with "28,9 % thành phố"; the 2 km hairline labelled *giả định:
bán kính phục vụ 2 km*; a line for the 9 571 unmeasured people; and, on the rank bars, the tie
count and the fact that a rank is a rank **within measured population** (a commune with zero
measured population has no rank, and 0 is not the bottom). One line declares the reading unit
(R6): these commune totals are **grid cells aggregated to their commune**, not the commune
layer's published population — the two differ by more than 10 % in 31 of 126 communes, and
Ba Đình appears here as 92 648 people where Scene 2 prints 65 023.

**CHART**
Primary: `access-population-curve` for the curve; `opportunity-commune-rank` for the bars
(lens `opportunity`, `emitsEntity: true` — clicking a bar selects that commune, which is the
one interaction a scene may keep because it opens evidence rather than changing the claim).

**NARRATIVE**
"Two and a half million people — near enough three in ten — start more than 2 km of real
driving from the nearest public port. The 2 km is ours: a declared service radius, not
something the data discovered. What the data does say is that this gap has no single owner.
The worst commune holds under 3 % of it; the ten worst hold barely a fifth. Thirty-five
communes have more than half their residents outside the radius. This is a distribution
problem, which is why the tool for it is a map and not a shortlist."

---

### 2.5 Scene 5 — `nhip-tuan` · "Nhịp của một tuần"

**CLAIM**
The busiest hour of the week runs **3,3× the quietest** (36,2 % of installed ports busy against
11,0 %), measured on **690 in-boundary stations** that carry a usable profile — and **every
sentence in this scene describes one operator's network**: 704 of 710 in-boundary stations
belong to a single company.

**QUERY / DERIVATION**
`buildUtilizationWeekHeatmap(occupancy)` exactly as the workspace builds it: in-scope stations
only, `n_ports > 0`, hour-cells below `OBSERVED_H_MIN = 1 h` excluded (not zeroed),
rate = Σ`occ` / Σ`n_ports` (ASSET denominator, never `util_denominator_ports`). Median station
utilization from `station_occupancy.parquet` with the grade filter **named in the sentence**.

**RESULT**
max **0,3618** at `t = 167`, min **0,1101** at `t = 51` → ratio **3,29** · week mean 0,2373 ·
median station utilization **0,2318** (`grade = GOOD`; 0,2263 over all 703 rows) · profiles:
703 of 710 stations carry telemetry (**99,0 %**) but `manifest.share_stations_measured` =
**0,9521** = `occ_status = OK` 676/710 — two different definitions, both printed · **2 046**
hour-cells below the observation floor · `util_cell` exists on **437** cells = 9,93 % of cells
/ 27,93 % of people, but **97,3 %** of the 449 cells that contain a station · **704/710 =
99,15 %** one operator · **150** stations at `util ≥ 0,40` with `grade = GOOD`.

**CONFIDENCE**
DERIVED for the ratio and the medians. **NEEDS DATA VALIDATION for the clock labels**: no
timezone is declared for `dow`/`hour` anywhere in the repo (audit E2). Until
`manifest.snapshots.occupancy_hour_tz` ships (§10 U1), the scene states the **shape** — "the
busiest hour of the week is 3,3× the quietest, and the weekly minimum sits in the small hours"
— and the heatmap axis renders hour **indices** with an explicit note, rather than asserting
"23:00". The heatmap itself is unchanged; only the claim text is constrained.

**GEOGRAPHIC SUBJECT**
`{ kind: "province" }`. This is a temporal claim; pinning it to a place would imply a spatial
pattern the data does not support here (Moran's I of `util_cell` = 0,116).

**CAMERA TARGET**
`fit-province` → 9,3. No fly-to: the argument is on the time axis, and moving the camera
during a time argument invites reading a spatial cause into it.

**MAP LAYERS**
Paint `station:occ` (station reading unit) so the map animates with the scene-owned `t`.
Overlays `stations` + `station_status`. Beat declares `t` = the model's argmax cell
(**scene-owned time**, §1.9): the map shows the peak frame while the heatmap shows the whole
week. The scrubber stays hidden — the scene, not the viewer, owns time here.

**ANNOTATION**
Peak and trough values with their ratio; the observation floor (*ô giờ dưới 1 giờ quan sát =
chưa quan sát, không phải vắng khách*); the two "measured" definitions side by side; and the
single-operator sentence, which is **required** — a `SceneRequirement` on
`manifest.quality.share_stations_measured` plus an operator-concentration slot, so the caveat
cannot be dropped by editing prose.

**CHART**
Primary: `utilization-week-heatmap` (lens `utilization`, `emitsTime: true` — inside a scene it
displays the scene's `t` and does not accept clicks that would move it).

**NARRATIVE**
"Charging is not a flat load. Across the week, the busiest hour runs 3,3 times the quietest —
36 % of installed ports busy against 11 %. That is the shape a placement model has to serve:
capacity sized to the quiet hours is a queue at the peak, and sized to the peak it is idle
metal most of the week. Two warnings sit on top of this. The first is that 'measured' means
two different things here — 99 % of in-boundary stations report *something*, 95 % report enough
to pass the quality gate — and we print both rather than choosing the flattering one. The
second is bigger: 704 of 710 stations belong to one operator, so everything above describes
one company's network, not a market."

---

### 2.6 Scene 6 — `mot-quyet-dinh` · "Con số lớn nhất là một quyết định"

**CLAIM**
The largest single number shaping this dataset is not a measurement — it is a rule we wrote:
**1 811 stations (71,8 % of the raw rows) were removed** because they had exactly one gun and
that gun was AC. They carried **18,9 % of the guns and 7,0 % of the power**. And that share is
**not a national constant**: across 34 provinces it spans **48,6 % → 78,7 %**.

**QUERY / DERIVATION**
`manifest.totals.private_ac_dropped` (`n`, `share_stations`, `share_ports`, `share_power`) and
`manifest.quality.n_private_ac_dropped`, resolved through `MetricRef { src: "manifest" }` — no
recomputation, because the excluded rows are (correctly) not in the shipped package. Range
across provinces from `provinces.parquet` (`private_ac_share_stations`,
`private_ac_share_power`). What remains at the bottom of the ladder:
`buildSupplyPowerTierBreakdown(stations)`.

**RESULT**
dropped **1 811** = **71,84 %** of raw station rows; **18,87 %** of guns; **7,01 %** of power;
survivors 710 in-boundary. Across provinces: stations **0,486 → 0,787**, power
**0,043 → 0,159**. Remaining ≤ 22 kW tier: **173 stations (24,4 %)**, 979 ports (12,6 %),
12 518 kW (5,4 %). Withheld pending §10 U2: the counterfactual median network distance
(1 257 m → 2 306 m) and the 969 213 people it moved past 2 km — these live in
`data/qa/critique/a14.json`, which the web does not ship, and that file's "after" median
(2 306,4 m) already disagrees with today's grid (**2 322,1 m**).

**CONFIDENCE**
MEASURED (manifest) for everything shown; the counterfactual is **NEEDS DATA VALIDATION** and
is absent from the UI until the exporter publishes it. The disagreement between the QA file and
the live grid is itself the reason the rule exists (R5).

**GEOGRAPHIC SUBJECT**
`{ kind: "province" }`. The excluded stations have no marks — they are not in the data, and
drawing an estimate of where they were would manufacture the very thing this scene is about.

**CAMERA TARGET**
`fit-province` → 9,3, unchanged from Scene 5 so the eye stays on the chart. Camera stillness is
the point: this scene's evidence is not on the map.

**MAP LAYERS**
Paint `n_ports` (cell) or keep the previous paint; overlay `stations`. The panel states
plainly that **1 811 dots are not on this map** and why, which is the only honest mark for an
exclusion.

**ANNOTATION**
Three figures (stations / guns / power) with the rule written out — `n_ports == 1 AND
current_type == 'AC'` — plus the province range, so no reader carries 71,8 % to another
province. A line naming the rule's edge: **51 single-gun stations that were not AC were kept**
(`a14`), so the rule cuts on the pair (one gun **and** AC), not on gun count — an exception is
part of a rule, and hiding it makes the rule look broader than it is.

**CHART**
Primary: `supply-power-tier-breakdown` (lens `supply`) — this is the one place where the power
ladder *is* the argument: what survived the rule is still 24,4 % low-power stations that carry
5,4 % of the power.

**NARRATIVE**
"Every number in this atlas rests on one line of code: a station with exactly one gun, and that
gun AC, is a private socket, not public infrastructure — so it is out. That rule removed 1 811
of the 2 521 rows we started with: 71,8 % of the stations, but only 18,9 % of the guns and 7,0 %
of the power, which is the shape you would expect if the removed rows were mostly wall sockets.
We show it because it is the most consequential thing here that a reader cannot see: it is not
in any column, it is not on any map, and it is not the same number in another province — from
48,6 % to 78,7 % across the 34 we ship. If you disagree with the rule, you disagree with every
figure in the preceding scenes, and that is the correct place to disagree."

---

### 2.7 Scene 7 — `chua-biet` · "Ba điều ta không biết"

**CLAIM**
Three limits, each with a number: **demand is inferred, not observed** (real utilization exists
on 9,9 % of cells / 27,9 % of the population); **we do not know where you can connect to the
grid** (no grid layer, no `buildable` column — by decision); **there is no tomorrow in this
data** (three snapshots, no trend, no operator roadmap).

**QUERY / DERIVATION**
`manifest.coverage["util_cell"]` (`cell_share`, `pop_share`,
`share_measured_among_cells_with_station`), the POI coverage derivation over `n_poi_1km`,
absence checks over `manifest.available_columns`, and `manifest.snapshots`. Nothing here is
computed twice: each is a `MetricRef` into the manifest or the grid snapshot.

**RESULT**
`util_cell`: **437** cells = **9,93 %** of cells, **27,93 %** of people, **97,33 %** of the 449
cells that contain a station. POI: **73,34 %** of cells have zero POI within 1 km and they hold
**35,63 %** of the population; class bias `poi_bias_phuong_vs_xa` = **41,37**. Population
provenance: 4 210 anchored · 135 `ZERO_NO_WEIGHT` · 55 `…IMPLAUSIBLE`; the national published
total that anchoring rests on is ~12 % high and unevenly so. Snapshots: stations **29/07/2026**
· OSM **28/07/2026** · VNSDI **16/6/2025**.

**CONFIDENCE**
MEASURED throughout. This scene proves nothing and is not allowed to: it is the scene that
says how far the other six reach.

**GEOGRAPHIC SUBJECT**
`{ kind: "province" }`, returning to the opening frame — the story hands the map back in the
state the viewer will find when they leave (`DESIGN.md` §14a handover rule L2).

**CAMERA TARGET**
`fit-province` → `105,6545 · 20,9735`, zoom **9,3**, pitch 0, bearing 0.

**MAP LAYERS**
Paint `commune:ports_per_10k_pop` — the field the app opens with — and no overlays beyond
`stations`. Exiting the story then costs the viewer no re-orientation.

**ANNOTATION**
Three numbered limits, each carrying its own figure; the POI limit additionally carries the
prohibition it implies (*POI không vào rule loại trừ nào*), because a coverage number without
its consequence reads as a quality complaint rather than a boundary.

**CHART**
No primary chart. A chart here would invite the reader to treat a limit as a finding. The
coverage meters already used by the Data mode (§3f) are reused for the three shares.

**NARRATIVE**
"Three arguments said what this data supports. This one says what it does not. First: we never
observed demand — telemetry exists only where a station already stands, which is 9,9 % of the
grid, and the question is about the other 90 %. So 'demand' above means population and points
of interest: a stand-in, not charging sessions. Second: nothing here knows whether a chosen
point can be connected to the grid. No transformer distance, no available kVA, no `buildable`
column — a point that is perfect on demand may be unbuildable, and this app cannot tell you.
Third: this is a photograph. Stations, roads and telemetry are each a snapshot with a date and
no trend, and no operator's build plan is in here. A commune with zero ports today may already
be in next quarter's plan. Together these three do not make the earlier arguments wrong — they
say what those arguments are enough **for**: choosing the family of model and the distance
metric. Not for saying that a particular point is the point to build."

---

### 2.8 Scene 8 (specified, gated) — `mot-tram` · "Một trạm thay đổi được gì"

Shipped **only** when `sim_calibration.json` is present with `valid: true` **and** the package
is r8 (Phase 6 §0.2 bars the national r6 aggregate and proxy mode).

**CLAIM** — Adding one station cannot make the distance field worse anywhere; what it can do is
bounded, and we can show the bound: on leave-self-out validation over 4 310 cells the estimator
lands within ±20 % **66 %** of the time and is optimistic (dangerously wrong side) **9,7 %** of
the time.
**QUERY / DERIVATION** — Phase 6 engine unchanged: `d_new = min(d_old, e(c) × detour_local)`
with `detour_local` selected per band and neighbourhood from `sim_calibration.json`.
**RESULT** (01) — bands 200–500 m med **1,716** … 3–5 km med **1,369**; near-field n = 87,
net p50 264 m; validation n = 4 310, within ±20 % **0,66**, upper miss **0,097**.
**CONFIDENCE** — **HEURISTIC**, with the band printed beside every number, and the Phase 6
labels intact (estimate of a distance field, never routing, never a demand forecast).
**GEOGRAPHIC SUBJECT** — the candidate the viewer places; the scene pre-places one at the
resolved *highest population × network distance* cell, currently `88415cb5dbfffff` (Phường
Hoàn Kiếm, 46 232 people, 2 422 m, `screen_margin_m` +1 659 m).
**CAMERA TARGET** — `fit-subject` on the candidate's `gridDisk(6)` neighbourhood.
**MAP LAYERS** — Phase 6 before/after distance field within the bounded neighbourhood,
candidate marker, `stations`.
**ANNOTATION** — the L6 rule replay labelled **RULE OUTPUT**, the error band, and the "affected
zone is clipped at the package edge" note.
**CHART** — the Phase 6 panel's own before/after distribution; no new chart.
**NARRATIVE** — the handover: "this is where the atlas stops and the screening engine starts".

---

## 3. Chart bindings

A scene never draws a chart of its own. It binds to one of two things:

```ts
export type SceneChartBinding =
  | { kind: "primary"; id: PrimaryChartId }        // Phase 4 registry, one per lens
  | { kind: "shared";  id: SharedFigureId }        // an existing workspace figure component
  | { kind: "none"; why: string };                 // §2.7 — a chart would misread the content
```

| scene | primary chart (lens) | shared figure | interactions suppressed inside a scene |
|---|---|---|---|
| 1 `von-cuc` | `demand-population-histogram` | Lorenz · structure-sweep steps | brush → `AnalysisFilter` (a scene owns its cell set) |
| 2 `cung-lech` | — | `SupplyLorenz` | — |
| 3 `di-vong` | `access-population-curve` | route-pair list | — |
| 4 `ngoai-2km` | `access-population-curve` + `opportunity-commune-rank` | — | rank click **kept** (selects a commune = opens evidence) |
| 5 `nhip-tuan` | `utilization-week-heatmap` | — | click-to-set-`t` (the scene owns `t`) |
| 6 `mot-quyet-dinh` | `supply-power-tier-breakdown` | — | tier click → filter |
| 7 `chua-biet` | none (`why`: a chart would present a limit as a finding) | coverage meters (§3f) | — |

Rule: a chart shown in a scene must be the **same component instance-shape** the workspace
uses, receiving the same model object. If a scene needs a variant, the variant is added to the
shared component behind a prop and the workspace can reach it too — Phase 4 §5.1's
"one primary chart per lens" is not weakened by the story, and the story does not fork it.

---

## 4. Metric and query contract

### 4.1 Shared queries the scenes use (all pre-existing)

| id | used by | note |
|---|---|---|
| `fetchAreaPop` | S1 | Lorenz input; `area_km2 × area_frac` denominator (audit A5) |
| grid `GridCell[]` snapshot | S1, S2, S4, S6, S7 | already loaded at boot for the workspace |
| `fetchCommunes` | S2, S4 | commune layer; **declare the unit** (R6) |
| `fetchStations` | S2, S5, S6 | `powerTier` classified at the loader boundary |
| `fetchRoads`, `fetchShowcaseRoutes` | S3 | Hà Nội-only for routes (`requires.files`) |
| `fetchDetourStats(2, 3000)` | S3 | **moves** from the story block to the Access block of `queries.ts` (R1) |
| `fetchOpportunityCommunes` (Q-P4-4) | S4 | conservation assertion stays |
| occupancy profiles | S5 | `OccProfiles`, `OBSERVED_H_MIN` |
| `manifest` | S6, S7 | `MetricRef { src: "manifest" }` only |

### 4.2 Module moves (mechanical, no behaviour change)

1. `web/src/story/lorenz.ts` → `web/src/viz/lorenz.ts` (R2). `viz/equity.ts` already imports
   it; `story/LorenzChart.tsx` and `test/story.test.ts` follow the path.
2. `fetchDetourStats` + `DetourStats` move within `queries.ts` out of the "Số đo của các cảnh
   CÂU CHUYỆN" block into the Access section, keeping the name and the SQL byte-identical.
3. `web/src/story/bridges.ts` stays (it is a mark selector, not a metric), with its doc comment
   rewritten to the measured numbers (audit C6).

### 4.3 Forbidden in `web/src/story/`

* any `SELECT`
* any arithmetic on a data column that is not a call into `viz/` or `data/`
* any numeric literal that reaches the screen, except a `ThresholdSpec { kind: "literal" }`
  carrying a registered policy constant (only `BEYOND_2KM_M`, `DETOUR_THRESHOLD`,
  `MAJOR_BRIDGE_MIN_M`, `EUCLID_COVERAGE_RADIUS_M`, `SCENE_CONTEXT_ZOOM_OUT`), each of which
  renders with the word *giả định*

---

## 5. Navigation and state

* Entering a scene applies its `SceneSpec` in **one** `set()` (today's `fromScene` already
  does; beats and scene-owned `t` join it).
* `filterClearedFor(..., "lens-incompatible")` keeps clearing a workspace filter on entry.
* Leaving the story leaves the map in the last scene's state (handover L2, unchanged).
  L2 hands over what a scene OWNS and the viewer can see: `field` · `view` · `layers` · `c`.
  `scaleMode` is NOT part of L2 — it is not a choice the scene made but a VERIFICATION
  constraint (every claim was measured against binned classes), and a constraint is
  APPLIED, never handed over.
* Scroll → scene stays an `IntersectionObserver` with the existing narrow band; beat switching
  stays an explicit button — beats change what the map paints, and a scroll position is too
  cheap a gesture to repaint the argument.
* Deep link `#s=di-vong.hau-qua` opens scene 3 at beat 2, scrolls the column to it, and paints
  the filtered set (§1.7).

---

## 6. Portability

| scene | portable to all 34 packages | blocked by |
|---|---|---|
| 1 `von-cuc` | ✅ | — (`population`, `pop_density_ppkm2` present everywhere) |
| 2 `cung-lech` | ✅ | — (subjects are resolved, not typed) |
| 3 `di-vong` | ⚠ partial | beat 1's route pairs need `routes_showcase.geojson` (01 only) and the bridge prose is `editorialProvince: "01"`. Beat 2 is portable |
| 4 `ngoai-2km` | ✅ | — |
| 5 `nhip-tuan` | ⚠ | the **4** provinces flagged `KHONG_DO_DUOC_SU_DUNG` (Cao Bằng 0,100 · Điện Biên **0,000** · Lai Châu 0,167 · Sơn La 0,047; the national range is 0,0 → 0,969) must not render this scene: a near-empty heatmap reads as "quiet", not as "unmeasured" |
| 6 `mot-quyet-dinh` | ✅ | manifest keys exist in every package; the province range comes from `provinces.parquet` |
| 7 `chua-biet` | ✅ | `pop_share` may be absent in a package without a population layer — the sentence drops (R5), the scene stays |
| 8 `mot-tram` | ⚠ | `sim_calibration.valid` and r8 only |

`n11_web_export.py` computes `story_enabled` from the same requirement declarations instead of
`code == "01"` (§1.8). Expected consequence, stated so it is not a surprise: **story mode
becomes available in every province package**, with 5–7 scenes depending on capabilities,
instead of 4 scenes in one province.

---

## 7. Acceptance criteria

Each is checkable; the numbers are the package-(01) expectations recorded in the golden test.

**Correctness of claims**
1. No numeric literal that reaches the screen exists in `web/src/story/**` (grep gate in test).
2. Every `MetricRef` in every `SceneSpec` resolves against the shipped package, or its sentence
   is provably withheld (unit test drives each scene with a manifest/snapshot missing that key).
3. `von-cuc` reports area-for-half-population **0,0841 ± 0,0002** and Gini **0,6815 ± 0,0005**.
4. `von-cuc` structure beats report component counts **92 / 31 / 9 / 1** at q = 0,90 / 0,95 /
   0,975 / 0,99.
5. `cung-lech` resolves subject A to `00292` and subject B to `00634`, and renders **no**
   multiple-of-median on subject A.
6. `di-vong` reports **696** cells and **986** false-positive cells at 3 km; the literal `672`
   appears nowhere under `web/src/**`, `docs/**` or `web/DESIGN.md` (4 occurrences today:
   `story/scenes.ts:55`, `:184`, `story/bodies.tsx:267`, `state/store.ts:385`).
7. `di-vong` long-bridge count comes from `majorBridges(...)`, **not** from
   `manifest.roads.bridge_ways_shipped`, and equals **45**.
8. `ngoai-2km` reports **2 547 727 ± 1** people beyond 2 km and prints the **9 571** unmeasured
   separately.
9. `nhip-tuan` reports peak/trough ratio **3,29 ± 0,01** and renders **no clock label** while
   `manifest.snapshots.occupancy_hour_tz` is absent.
10. `mot-quyet-dinh` reads all four exclusion figures from `manifest` and renders **no**
    counterfactual while `manifest.counterfactual` is absent.
11. `chua-biet` reports `util_cell` 9,93 % / 27,93 % / 97,33 % and POI 73,34 % / 35,63 %.

**Architecture**
12. `web/src/story/**` contains no `SELECT`, no `duckdb` import, and no metric function.
13. `viz/lorenz.ts` is the only Lorenz implementation; `story/` imports it.
14. Every scene declares `requires`; a scene whose requirement fails is absent from `SCENES`
    at runtime and from the scroll column, and its slug is rejected by `parseScene`.
15. `manifest.story_enabled` is derived from requirement satisfaction, not from `province_code`.
16. Camera values come from `zoomForFeatureBounds` / `zoomForBbox`; no scene contains a zoom
    literal except `SCENE_CONTEXT_ZOOM_OUT`.

**Serialization**
17. `#s=<scene>.<beat>` round-trips; an unknown beat falls back to beat 1; an unknown scene
    falls back to map mode; `f`/`v`/`l`/`t`/`b` are still not written in story mode.
18. Write → read → write converges in one step for every scene and beat.

**Presentation invariants (inherited, re-checked here)**
19. One painted field per beat; the filtered set draws at any zoom; excluded cells draw nothing.
20. `nullSplit` remains active on `detour_ratio` inside scene 3.
21. Every declared assumption renders its value **and** the word *giả định*.
22. Every per-capita figure renders next to its denominator's provenance caveat (G5).

---

## 8. Test plan

New/changed test files, in `web/test/`:

| file | covers |
|---|---|
| `story-spec.test.ts` | criteria 1, 2, 12–16, 19–21: walks every `SceneSpec`, asserts shape, requirement declaration, no literals, camera resolution |
| `story-claims.test.ts` (golden) | criteria 3–11 against `test/fixtures` snapshots captured from package (01); fails loudly when the package changes, which is the point |
| `hash.test.ts` (extend) | criteria 17–18: beat suffix |
| `chart-models.test.ts` (extend) | `buildSpatialStructureModel`: components on a hand-built 7-cell ring; Moran's I on a checkerboard (≈ −1) and on a gradient (> 0) |
| `story.test.ts` (rewrite) | keeps the Lorenz invariants (they move with the module), drops the four-scene assumptions |

Golden fixture rule: the fixture records the **derivation output**, not hand-typed numbers, and
is regenerated by a script that reads the shipped package — so a data change shows up as a
failing test with a diff, never as a stale sentence on screen.

---

## 9. Defects found by this audit (fix inside Phase 7)

| # | where | defect | fix |
|---|---|---|---|
| D1 | `src/vn/n11_web_export.py:191` | `bridge_ways_shipped = df[df.in_province].bridge.sum()` counts **before** the class/access filters → manifest says 3 319, the shipped parquet has **3 027**; the story prints both numbers side by side | `int(ship.bridge.sum())`; re-export; scene 3 keeps reading the runtime count for the drawn set |
| D2 | `story/scenes.ts:55`, `story/scenes.ts:184`, `story/bodies.tsx:267`, `state/store.ts:385` | the literal **672** for `detour_ratio > 2` (actual **696**) | delete the literal; the number is runtime-only |
| D3 | `web/src/story/bridges.ts` doc comment | "4 154 bridge segments", "p90 90 m", "p99 1 146 m", "48 segments > 1 km" (actual **3 027**, **102,2**, **1 372,4**, **45**) | rewrite the comment with the measured table and a date |
| D4 | `web/src/data/queries.ts` (`fetchRoads` doc) | "160 823 segments", "396/160 823 unreachable" (actual **115 931**, **222**) | rewrite |
| D5 | `web/src/data/bootstrap.ts` (`storyDataReady` doc) | says `p/01` lacks `dist_station_m` and the routes file, so story is off at `#tinh=01`; both are present today and all 34 packages carry the road distance column | rewrite the comment; keep the gate (it is now a real capability gate, §1.8) |
| D6 | `web/src/story/bodies.tsx` (scene B) | "dân số sáu chữ số" for a five-digit population; "hai bậc độ lớn" against a zero denominator; "chấm là 939 trạm công cộng" for 710 in-boundary + 229 buffer | audit B1 / B4 / B8 — fixed by §2.2 |

---

## 10. Upstream asks (block two withheld claims)

| # | ask | unblocks |
|---|---|---|
| **U1** | publish the timezone of the occupancy hour axis — `manifest.snapshots.occupancy_hour_tz` (and a line in `docs/COT.md` for `dow`/`hour`) | scene 5's clock labels; also removes a standing, unstated assumption from Scrubber, Heatmap168 and HourProfile |
| **U2** | publish the AC-exclusion counterfactual into the manifest (`counterfactual.ac_filter`: median network distance before/after, population moved past 2 km), computed at export time from the same run that produces the package | scene 6's strongest sentence. Copying `a14.json` into the UI is explicitly rejected: its "after" median already disagrees with the shipped grid by 15,7 m |
| U3 | *(optional)* emit `commune_area_frac`-weighted population per commune, or a documented statement that the grid→commune aggregate is a different quantity from the commune layer | removes the 42 % Ba Đình discrepancy (audit B9) as a class of bug rather than as a per-scene caveat |

---

## 11. Out of scope

* National (r6) story scenes — the aggregate carries no computed layer (CONTEXT.md).
* Any scene that ranks or recommends a site: the screening engine is a rule, and the atlas is
  not a recommender (CONTEXT.md "Engine sàng lọc").
* Autoplay / timed transitions: the viewer owns the pace; only the map state is scripted.
* Exporting a scene as an image or a PDF.
* Any claim about market share, operator strategy, or future build plans (audit E6, G4).
