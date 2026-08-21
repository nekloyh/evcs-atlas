# Phase 6 — Local Station Simulation Specification

Status: **PHASE 6 SPEC READY**

Scope: a single hypothetical station placed by the user on the map of the loaded province
package, and the **heuristic, geometry-only** Before/After picture of the nearest-station
distance field in a bounded neighborhood around it, plus the L6 screening rule replayed at
that point. It adds **no routing, no demand model, no forecast, no score**, and it never
writes anything back into the measured atlas.

Framing rule that governs every sentence of this document and every pixel of the feature:

> **This is a HEURISTIC simulation.** Its output is an *estimate of a distance field under
> one added point source*, derived from published measurements. It is never presented as
> network routing, and never as a prediction of future demand, utilization, congestion, or
> revenue. Where the data cannot support a number, the number does not appear.

This specification extends the Phase 2 lens registry, the Phase 3 `EntitySelection`
contract, Phase 4 `AnalysisFilter`/`VisualContract`, and Phase 5 search navigation. It
deliberately does **not** extend `EntitySelection`: a candidate is user-created transient
state, not a row of any named Dataset (CONTEXT.md "Dataset — một bảng có TÊN").

---

## 0. Verification and audit

### 0.1 The dataset that was measured

Every number below was measured against the package the app actually opens:
`web/public/data/p/01/` (Hà Nội), `manifest.exported_utc = 2026-08-11T19:09:19+00:00`,
station snapshot `evcs_vn_2026-07-29-full`, 4 400 cells, 939 station rows. Numbers marked
**(01)** are province-01 values and are **not national constants** — per-province values
come from the calibration file defined in §2.3, following the project law that no
province-derived number may be hard-coded (HAN_CHE.md, DECISIONS.md §6).

### 0.2 Audit of the spatial primitives

| Primitive | Measured fact | Consequence for Phase 6 |
|---|---|---|
| **H3 resolution** | Grid is r8, ~0,74 km²/cell, key `h3_r8`; r6 exists only in the national screen and carries no computed layer (CONTEXT.md). | Simulation runs on r8 only. It is **disabled** in national (`vn/`) and proxy modes: r6 aggregates have no distance columns and must not be extrapolated. |
| **Neighbor / ring distance** | Centroid spacing of adjacent r8 cells, measured over 1 153 pairs **(01)**: p10/p50/p90 = **952/973/977 m**. (The 735 m figure in A13/QA is the median *value jump* of the distance field between neighbors, not centroid spacing — do not confuse them.) | Ring k ≈ 0,97·k km. A 5 km disk is fully contained in `gridDisk(candidateCell, 6)` and holds at most ~107 cells (78,5 km² / 0,737 km²). |
| **Euclidean method** | Pipeline `dist_station_euclid_m` = per-province equirectangular projection + KDTree (`n07_distance.py:120`, `m_per_deg_lon` 103 926,8 **(01)**). Web recomputation with haversine against the published column over 600 sampled cells: rel. diff p50 **0,25 %**, p99 0,56 %, max **24,8 m**. | Web uses haversine (R = 6 371 008,8 m). Tolerance vs pipeline declared: ≤ 30 m / ≤ 0,6 %. **Published columns stay authoritative**; client geometry is used *only* for candidate-relative pairs, which have no published column. |
| **`detour_ratio` derivation** | `= dist_station_network_m / dist_station_euclid_m` (`n07_distance.py:125`) — numerator and denominator may reference **different stations** (nearest-by-network vs nearest-by-euclid). It is a *field-level error factor*, not a per-pair detour. Direction: toward station. `null` when euclid < 200 m (`DETOUR_MIN_EUCLID_M`) — below that the ratio is noise, not "no detour". **(01)**: median 1,474 · p90 2,289 · p95 2,79 · p99 4,43 · max 36,1 · 90 nulls. | Using it to scale a candidate pair asks exactly the field-level question, so it is the right calibration object — but it must be selected per distance band and per neighborhood (§0.3), never as one constant, and never below 200 m. |
| **Existing network distance** | `dist_station_network_m` = Σ directed OSM edges + centroid→road offset (`road_access_offset_m`) + station snap offset. Multi-source Dijkstra, one-ways respected, **meters only** (no minutes — deliberate, DECISIONS §6). Source set: `op_status ∈ {OPERATIONAL, MAINTENANCE}` ∧ `access ≠ RESTRICTED`, scopes IN **and** BUFFER — **886 of 939** station rows **(01)**. Graph clipped at boundary + 5 km. Asymmetry: median 0 m, 182 cells **(01)** differ > 500 m by direction. | The simulation's "Before" is this exact column, so its station set filter must be byte-identical to the pipeline filter, or Before diverges from the published field. Direction-blindness of the heuristic is a declared, bounded error source. |
| **Population aggregation** | Per-cell `population` (WorldPop 2025 anchored to VNSDI communes) + `population_wp` (raw). **(01)** `pop_source`: 4 210 anchored · 135 `ZERO_NO_WEIGHT` · 55 `WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE`. National `danso` total is ~12 % high and unevenly so (HAN_CHE.md). | Aggregates use `population` only, never mixed with `population_wp`; the panel's method popover states the anchoring caveat. Sums are **package-scope**: the affected zone is clipped at the package edge (§5 F7). |
| **Existing station proximity** | Web `stations.parquet` **(01)**: 939 rows; eligible under the pipeline filter: 886 (831 OPERATIONAL + 70 MAINTENANCE − 15 RESTRICTED). 704/710 in-boundary stations are one operator (VinFast). | All candidate-relative distances use the eligible set S (§1.2). The single-operator fact bars any "network utilization" reading (§0.4). |
| **Candidate eligibility** | L6 rule (`core/screening.py`): thresholds are **policy**, client-fixed — PHUONG 500 m, XA 2 000 m, DAC_KHU 500 m, absolute floor 500 m, high-load `util ≥ 0,40`; distance basis is **euclid** (client decision, DECISIONS §16). "Nearest is high-load" means: the nearest eligible station is *measured* (`util_reportable ∧ grade = 'GOOD' ∧ util` non-null) **and** `util ≥ 0,40` — unknown is never high (`n08_screening.py:105-110`). §16 caveats apply: the rule rejects 41,4–73,5 % of *operating* stations, there is no under-construction station list, and no real application set exists. | The web replays `decide()` exactly, labeled as **RULE OUTPUT** ("đầu ra của một RULE, không phải số đo"), with margin. `screen_decision = null` ⇒ "not computable", never TỪ CHỐI. |

### 0.3 Review of the proposed equation `d_new = min(d_old, d_euclid × detour_local)`

**Where it is mathematically reasonable.** Adding a point source to a min-distance field
can only lower the field: `d_new(c) = min(d_old(c), d_net(c→P))` is an identity, not a
model. The heuristic content is only the second argument: `d_net(c→P) ≈ e(c)·detour`.
That approximation is sound where (i) both terms estimate the same construct — they do,
because published `detour_ratio` includes the terminal offsets in its numerator — and
(ii) the detour factor is calibrated at the right range and place. The `min` form also
guarantees **After ≤ Before everywhere**, so the simulation can never manufacture a
worsening — a property test in §4.

**Validation method.** Leave-self-out prediction on the published fields **(01)**: for each
of 4 310 reachable cells with a defined ratio, predict its own network distance from its
euclid distance and a detour selected *without using its own ratio*, compare to the
published network distance. `q = predicted / true`:

| detour selection | q p10/p50/p90 | within ±20 % | q < 0,8 (dangerous side) |
|---|---|---|---|
| global median (1,474) | 0,64 / 1,00 / 1,23 | 61,4 % | 21,8 % |
| ring-1 median (k=1) | 0,70 / 1,00 / 1,25 | **65,1 %** | 17,6 % |
| ring-2 median | 0,67 / 1,00 / 1,24 | 63,8 % | 19,4 % |
| ring-3 median | 0,66 / 1,00 / 1,23 | 62,7 % | 20,4 % |
| ring-2 p75 (conservative-only) | 0,79 / 1,15 / 1,50 | 46,1 % | 10,7 % |
| band median only | 0,66 / 1,00 / 1,22 | 62,9 % | 20,8 % |
| **max(band median, ring-1)** | 0,73 / 1,05 / 1,28 | 63,1 % | **14,3 %** |

**Where it fails — measured, not hypothesized:**

1. **The near field, exactly where the claim looks strongest.** Band medians of
   `detour_ratio` by euclid distance **(01)**: 1,716 (200–500 m) · 1,572 (500–1000) ·
   1,470 (1–2 km) · 1,408 (2–3 km) · 1,369 (3–5 km). A single `detour_local` learned from
   ~1,5 km-scale neighbors systematically **underestimates** short pairs. Even after band
   correction, within-±20 % coverage is only **41–50 %** below 1 km. ⇒ Point estimates are
   **banned below 1 km euclid**; the output there is an interval (§1.5).
2. **Below 200 m the ratio does not exist by dataset design** (noise floor). Empirical
   substitute **(01)**: cells whose euclid < 200 m have true network distance
   p50 **264 m** / p90 **728 m** (n = 87). The near zone emits that measured band, nothing
   else.
3. **Direction and barriers.** Ring detours describe geometry *toward existing stations*;
   a river or one-way system between cell and candidate is invisible. Neighbor
   disagreement of `detour_ratio` vs ring-1 median: rel. diff p50 12 %, p90 **44 %**,
   p99 170 % **(01)**. Mitigation is the per-band **p90 upper bound**: classification uses
   `d̂⁺ = e · max(band p90, ring-1 median)`, whose measured miss rate
   `P(true > d̂⁺)` is **9,7 % overall and 8,5–10,1 % in every band (01)** — uniform by
   construction, so confidence statements survive re-calibration per province.
4. **Beyond 5 km euclid there is no validation support** — 31 cells **(01)**. Hard cap
   (§1.4).
5. **Nulls.** `min(null, x)` must never yield `x` (§1.6). `d_old = null` is "unreachable",
   not "far".
6. **`detour_local` is not a free parameter.** Measured ranking above: locality helps
   (k=1 best, monotonically worse beyond), band correction fixes the near-field bias, a
   p75-style inflation destroys the central estimate (±20 % coverage drops to 46 %).
   Selection is therefore **fixed by this spec**: central `max(band median, ring-1 median)`,
   upper `max(band p90, ring-1 median)`, ring-1 median clamped to ≥ 1,0, all constants read
   from the per-province calibration file — never hard-coded, never user-tunable.

**Scale of honest effect** — 30 synthetic candidates in underserved cells
(`d_old > 3 km`, population > 500) **(01)**: cells improved p10/p50/p90 = **8/22/31**,
median affected population ≈ **16 600**. The feature's honest story is local and modest;
the UI must not inflate it (§3).

### 0.4 Claims the data cannot support — checked and removed

| Claimed output | Verdict | Why the existing data cannot support it |
|---|---|---|
| Station congestion reduction ("giảm tải trạm X") | **NOT SUPPORTED — removed** | `util` is port-hours-busy of existing stations over a 30-day window. There are **no session origins** — nobody knows which cells a station's users come from — no substitution model, no queueing model. Reassigning load to the candidate is pure invention. Additionally 704/710 stations **(01)** are one operator: any "network relief" claim would be a claim about V-GREEN, presented as a claim about the market (HAN_CHE.md §6). |
| Future utilization of the candidate | **NOT SUPPORTED — removed** | No demand model exists and none can be built from this store: POI is coverage-only and explicitly banned as a demand proxy (73,3 % of cells have 0 POI within 1 km yet hold 35,6 % of the population; HAN_CHE.md §7, DECISIONS §17). |
| Future revenue | **NOT SUPPORTED — removed** | The store contains no price, tariff, session, or payment field anywhere. |
| Future EV demand | **NOT SUPPORTED — removed** | EV registration density was deliberately excluded — no official source (DECISIONS §9). |

What remains allowed as **context** (present-tense, descriptive, CALCULATED): the measured
`util`/`util_p95`/`saturation_frac` (+ `grade`, `coverage`, window dates) of existing
stations near the candidate, clearly dated, with no forward-looking sentence attached.

---

## 1. SIMULATION ALGORITHM SPEC (normative)

### 1.1 Input

`Candidate P = {lat, lng}` — one point, placed by map click in placement mode or restored
from the URL hash. Exactly **one** candidate exists at a time; placing another replaces the
first. The candidate has no attributes: the DC question is answered by the rule's own
`DE_XUAT_NEU_CO_DC` class, and simulated port counts/power are refused (§0.4).

Admission checks, in order (first failure rejects placement with its message, §5):

1. P inside the province boundary polygon (`admin_boundary.geojson`). Buffer-only or
   outside-package points are refused — the grid has no cells there.
2. `cellOf(P) = latLngToCell(lat, lng, 8)` exists in `grid_h3_r8`.
3. `evidence_grade_distance(cellOf(P)) ≠ UNREACHABLE_NO_ROAD_ACCESS` — no mapped road
   within 2 km of that cell's centroid; a station that cars cannot reach is refused.
4. Calibration file present and `valid = true` (§2.3).

### 1.2 Eligible station set S

`op_status ∈ {OPERATIONAL, MAINTENANCE} ∧ access ≠ 'RESTRICTED'`, scopes IN and BUFFER —
**byte-identical to `n07_distance.py:66`**. 886 rows **(01)**. Used for: the rule replay's
nearest-station distance, and the context list. (The Before distance field itself is the
published column and is never recomputed.)

### 1.3 Geometry

`e(c) = haversine(centroid(c), P)` on the grid's published `lat`/`lng`; R = 6 371 008,8 m.

### 1.4 Affected zone Z

`Z = { c ∈ grid : e(c) ≤ R_MAX }`, `R_MAX = 5 000 m` — the validation ceiling (§0.3.4),
not a tunable. Enumeration may prefilter with `gridDisk(cellOf(P), 6)` or a bounding box;
the defining predicate is `e(c) ≤ 5 000`. |Z| ≤ ~107 cells.

### 1.5 Estimator (per cell c ∈ Z, with calibration C from §2.3)

```
L(c)   = median{ detour_ratio(x) : x ∈ gridDisk(c,1) ∪ {c}, finite }   // ≥3 values, else null
L(c)   = max(L(c), 1.0)                                                // network ≥ euclid, measured min 1.009
b      = band of e(c) in C.bands                                       // [200,500) … [5000,∞)

if e(c) < 200:            d̂(c) = C.near.net_p50        d̂⁺(c) = C.near.net_p90
else:                     d̂(c) = e(c) · max(C.bands[b].med, L(c) ?? 0)
                          d̂⁺(c) = e(c) · max(C.bands[b].p90, L(c) ?? 0)

d_after(c) = min(d_old(c), d̂(c))          // d_old = dist_station_network_m
```

Display precision rule: `d̂` may be shown as a point value only when `e(c) ≥ 1 000 m`
(±20 % coverage ≥ 63 % there, §0.3). For `200 ≤ e(c) < 1 000` the display is the interval
`[e(c), d̂⁺(c)]` — the lower bound is exact (network ≥ euclid). For `e(c) < 200` the
display is "≤ {C.near.net_p90}" with the measured-band note. Every displayed estimate
carries the `~` prefix and the ƯỚC LƯỢNG badge (§3).

### 1.6 Null and unreachable behavior (closed table)

| Cell condition | Class | Behavior |
|---|---|---|
| `network_reachable ∧ detour_ratio` finite or ring gives L | normal | classified below |
| `network_reachable ∧` no finite ratio in ring | normal | band-only estimator (L term absent) |
| `d_old = null`, grade `UNREACHABLE_NO_PATH` | **NO_BASELINE** | no estimate, no Δ — the cell's road component reaches no station and the web cannot know whether it reaches P. Excluded from all aggregates; counted and surfaced with its population ("hiện không tới được trạm nào theo mạng đường — không ước lượng được"). **(01)**: 2 cells, 9 534 people. |
| `d_old = null`, grade `UNREACHABLE_NO_ROAD_ACCESS` | **EXCLUDED** | not simulatable; counted. **(01)**: 1 cell, 37 people. |
| `e(c) > 5 000` | **EXCLUDED** | outside validated range, even if the formula would claim improvement. |

`min(null, x)` is a type error in this feature, not a value.

### 1.7 Classification (per cell, using the conservative bound)

```
IMPROVES   ⇔ d̂⁺(c) <  d_old(c)        // measured miss ≈ 10% per band (01)
UNCERTAIN  ⇔ d̂(c)  <  d_old(c) ≤ d̂⁺(c)
UNCHANGED  ⇔ d̂(c)  ≥  d_old(c)
```

### 1.8 Aggregates over Z

- **Before (CALCULATED)** — from the published column only: population-weighted median of
  `d_old`; population by network-distance band (≤1 km, 1–2, 2–5, >5 km); NO_BASELINE /
  EXCLUDED counts with population.
- **After (ESTIMATED)** — same statistics with `d_after` substituted **only in IMPROVES
  cells**; UNCERTAIN cells keep `d_old` in every headline number and are reported on their
  own line ("thêm n ô · p dân có thể cải thiện, trong biên sai số"). This makes the
  headline the *lower* bound of the story, never the upper.
- Population sums use `population`; counts of flagged `pop_source` cells inside Z are
  carried into the method popover.

### 1.9 Rule replay (RULE OUTPUT, not a measurement)

```
d_rule = min over S of haversine(P, station)        // euclid — client-fixed basis, §16
kind   = commune_kind of the commune polygon containing P (point-in-polygon over
         commune.geojson; fallback: commune_code of cellOf(P))
near   = argmin station; high = util_reportable(near) ∧ grade(near)='GOOD'
                              ∧ util(near) ≥ 0.40
decision, margin = decide(d_rule, kind, high)       // core/screening.py semantics, exactly
```

Provinces whose utilization layer is off (`share_stations_measured < 0,5`,
`store/qa/exclusions.json`): `high` is forced false and the panel states that the
high-load exception could not be evaluated (§5 F6).

### 1.10 Determinism and isolation

The simulation is a pure function of (package bytes, calibration file, P). Same input ⇒
identical output. Results live only in the simulation panel and the transient map layers:
they are **never** written into `fieldRequests`, never become a `Field` in `fields.ts`,
never enter a lens, a chart, an export, or the hash beyond P itself. The measured atlas
stays uncontaminated.

---

## 2. DATA CONTRACT

### 2.1 Inputs read (all existing)

| Source | Columns | Null meaning honored |
|---|---|---|
| `grid_h3_r8.parquet` | `h3_r8, lat, lng, population, pop_source, dist_station_network_m, dist_station_euclid_m, detour_ratio, road_access_offset_m, network_reachable, evidence_grade_distance, commune_code` | `detour_ratio` null = noise floor, not 1,0; `dist_*` null = unreachable, not far |
| `stations.parquet` | `station_code, lat, lng, op_status, access, scope, n_ports, power_kw_site, current_type, name, operator` | — |
| `station_occupancy.parquet` | `station_code, util, util_p95, saturation_frac, grade, coverage, util_reportable, window_start_utc, window_end_utc` | `util` null = unmeasured, never 0, never high-load |
| `commune.geojson` | `commune_code, commune_kind` + geometry | — |
| `admin_boundary.geojson` | geometry | — |
| `manifest.json` | `exported_utc`, snapshot ids | shown in the disclaimer |

New web dependency: `h3-js@4` (`latLngToCell`, `gridDisk`, `cellToLatLng` only).

### 2.2 Query plan

One DuckDB-WASM query at placement: zone superset by bounding box
(`lat/lng ± 0,05°`), needed columns only, ≤ ~150 rows; exact `e(c)` filter and all
arithmetic in JS. Budget: placement → rendered panel ≤ 300 ms.

### 2.3 Calibration file `sim_calibration.json` (new, produced by the pipeline)

A new province-scope step `n15_sim_calibration` (reads `traveltime_cell` +
`grid_cell`; writes web file + `store/qa/<code>/n15_sim_calibration.json`) so heuristic
constants stay out of the client, versioned and QA-gated like every other number:

```jsonc
{
  "version": 1,
  "province_code": "01",
  "bands": {              // euclid meters → detour stats over reachable, ratio-defined cells
    "200-500":    {"n": 356,  "med": 1.716, "p90": 3.413},
    "500-1000":   {"n": 882,  "med": 1.572, "p90": 2.655},
    "1000-2000":  {"n": 1637, "med": 1.470, "p90": 2.177},
    "2000-3000":  {"n": 900,  "med": 1.408, "p90": 1.967},
    "3000-5000":  {"n": 504,  "med": 1.369, "p90": 1.899},
    "5000-inf":   {"n": 31,   "med": 1.594, "p90": 2.053}
  },
  "near": {"n": 87, "net_p50": 264, "net_p90": 728},   // cells with euclid < 200 m
  "validation": {          // leave-self-out, this province
    "n": 4310, "within_20pct": 0.631, "upper_miss": 0.097
  },
  "valid": true            // gates the feature, see rules below
}
```

Validity rules (computed by the step, asserted by its QA checks): every band `n ≥ 50`
(else merged into its neighbor and recorded); total ratio-defined cells ≥ 300;
`near.n ≥ 30` else `near = null` (near zone then reports "no estimate"); measured
`upper_miss ∈ [0,05 · 0,15]` else `valid = false`. `valid = false` or a missing file
**disables the feature** for that province with the F2 message — never a silent fallback
to Hanoi's constants.

### 2.4 Output object, every field tagged

```ts
type SimTag = "CALCULATED" | "ESTIMATED" | "RULE";

interface SimulationResult {
  candidate: {lat: number; lng: number; cell: H3R8};              // CALCULATED
  screening: {decision: "DE_XUAT"|"DE_XUAT_NEU_CO_DC"|"TU_CHOI"|null;
              marginM: number|null; basis: "euclid"; kind: CommuneKind;
              highLoadEvaluable: boolean};                        // RULE
  before: {popWeightedMedianM: number;
           popByBand: Record<"le1km"|"b1_2km"|"b2_5km"|"gt5km", number>;
           noBaseline: {cells: number; population: number};
           excluded:   {cells: number; population: number}};      // CALCULATED
  after:  {popWeightedMedianM: number;
           popByBand: Record<..., number>;
           improved:  {cells: number; population: number};
           uncertain: {cells: number; population: number}};       // ESTIMATED
  cells: Array<{h3: H3R8; e: number; dOld: number|null;
                dHat: number|null; dHatUpper: number|null;
                display: "point"|"interval"|"near-band"|"none";
                cls: "IMPROVES"|"UNCERTAIN"|"UNCHANGED"|"NO_BASELINE"|"EXCLUDED"}>; // ESTIMATED
  context: {stationsWithin5km: Array<{code: string; euclidM: number; nPorts: number;
            powerKw: number; util: number|null; grade: string|null;
            window: [string,string]|null}>};                      // CALCULATED (descriptive)
  meta: {calibrationVersion: number; manifestExported: string; rMaxM: 5000};
}
```

**Output division (binding):**

- **CALCULATED** — candidate geometry; every Before statistic; euclid distances to
  existing stations; the context list including measured `util` with its window; zone
  membership; NO_BASELINE/EXCLUDED counts. (The screening block is deterministic too, but
  is tagged **RULE** and must carry the project's fixed qualifier: rule output, not a
  measurement.)
- **ESTIMATED** — `d̂`, `d̂⁺`, `d_after`, every After statistic, the IMPROVES/UNCERTAIN
  classification, any Δ. Any aggregate containing one estimated term is ESTIMATED as a
  whole.
- **NOT SUPPORTED (absent by contract)** — congestion/load relief of existing stations;
  candidate utilization; revenue; EV demand; any "coverage %" derived from euclid radii
  (HAN_CHE.md §3); any drive-time in minutes (DECISIONS §6); simulated ports/power;
  multi-candidate portfolios. These fields do not exist in `SimulationResult`, so the UI
  cannot render them.

---

## 3. UI OUTPUT CONTRACT

### 3.1 Placement in the shell

- Entry: a "TRẠM GIẢ ĐỊNH" toggle (NavRail, next to the layer tab). Active ⇒ next map
  click places P. Esc or the toggle clears. Hash: `sim=<lat>,<lng>` (5 decimals),
  round-tripped in `hash.ts`; invalid values are dropped silently (F9).
- Panel: rendered inside `EvidenceCard`'s scroll container as a **sibling of
  `EvidenceSection`** (EvidenceCard.tsx:197). An active candidate takes the card;
  selecting any entity clears the candidate (single-attention rule). No change to
  `EntitySelection`, `InspectorRoute`, or `EvidenceSection`'s exhaustive switch.
- Map: transient layers appended at the end of `buildLayers` (MapView.tsx:523), threaded
  through `BuildInput` — candidate marker, dashed 5 km zone circle, and cell outlines for
  IMPROVES (solid) / UNCERTAIN (dashed) using the `SELECT_PASSES` casing idiom. **No paint
  change, no new `OverlayId`, no hue**: the hue channel is full and the active lens keeps
  its surface. Numbers live in the panel, not on the map.

### 3.2 Panel structure (top to bottom)

1. Disclaimer banner (§3.4) — always visible, not dismissible.
2. Screening verdict chip + margin, with the fixed RULE qualifier line.
3. Before/After block — the §1.8 aggregates, two columns, every After number prefixed `~`
   and badged ƯỚC LƯỢNG; UNCERTAIN line separate; NO_BASELINE line separate.
4. Affected-cells mini-list (worst 5 by Before distance): `d_old → d_after` per §1.5
   display rule.
5. Context: nearest existing stations with measured occupancy (dated), no derivation.
6. Method popover trigger ("Cách tính & giới hạn").

### 3.3 Language rules (binding)

Banned words anywhere in the feature: *dự báo, doanh thu, nhu cầu (tương lai), giảm tải,
sẽ phục vụ, tối ưu, khuyến nghị vị trí, coverage %*. Every estimated number: `~` prefix +
ƯỚC LƯỢNG badge. Present tense for measurements, conditional for estimates. The feature's
name in all UI copy is **"Mô phỏng trạm giả định"** — never "đề xuất", never "quy hoạch".

### 3.4 Disclaimer copy (exact strings)

Banner (VI, primary):

> **MÔ PHỎNG HÌNH HỌC — không phải định tuyến.** Khoảng cách "sau" là ước lượng từ đường
> chim bay nhân hệ số đi vòng đo tại chỗ, trong bán kính 5 km. Không dự báo nhu cầu, mức
> sử dụng hay doanh thu.

Method popover (VI, primary):

> Cách tính: với mỗi ô trong bán kính 5 km, khoảng cách tới trạm giả định được ước lượng
> bằng đường chim bay × hệ số đi vòng (chọn theo dải khoảng cách và láng giềng của ô, hiệu
> chuẩn riêng cho tỉnh này). Kiểm chứng trên {validation.n} ô của tỉnh:
> {within_20pct·100} % nằm trong ±20 %; cận trên giữ mức vượt ≈ {upper_miss·100} %. Dưới
> 1 km sai số lớn hơn nên chỉ hiển thị khoảng, không hiển thị một con số. Ô hiện không
> tới được theo mạng đường thì không ước lượng được và được đếm riêng.
>
> Dữ liệu trạm chốt ngày {manifest.exported_utc}; mạng trạm đổi thì kết quả đổi. Mức sử
> dụng đo trong cửa sổ 30 ngày, gần như toàn bộ thuộc một nhà vận hành. Bộ dữ liệu
> **không chứa cơ sở** để ước lượng: giảm tải trạm hiện có · mức sử dụng tương lai ·
> doanh thu · nhu cầu xe điện tương lai — bảng này cố ý không hiển thị chúng. Kết quả
> SÀNG LỌC là đầu ra của một quy tắc chính sách, không phải một số đo.

(EN reference, for this spec only: "GEOMETRIC SIMULATION — not routing. 'After' distances
are estimates from straight-line distance × locally measured detour factors within 5 km.
This does not forecast demand, utilization, or revenue." The popover translates
accordingly.)

---

## 4. TEST CASES

Fixture calibration `CAL`: bands med/p90 = [200,500): 1,7/3,4 · [500,1000): 1,6/2,7 ·
[1000,2000): 1,5/2,2 · [2000,3000): 1,4/2,0 · [3000,5000): 1,4/1,9 · [5000,∞): 1,6/2,1;
`near = {net_p50: 260, net_p90: 730}`. Synthetic cells are given as
(e, ring detours, d_old).

| # | Input | Expected |
|---|---|---|
| T1 | e=2 000; ring {1,4·1,5·1,6} ⇒ L=1,5; d_old=6 000 | d̂=2 000·max(1,4;1,5)=**3 000**; d̂⁺=2 000·max(2,0;1,5)=**4 000** < 6 000 ⇒ **IMPROVES**, d_after=3 000, display "point" |
| T2 | as T1, d_old=3 500 | 3 000 < 3 500 ≤ 4 000 ⇒ **UNCERTAIN**; headline After keeps 3 500 |
| T3 | as T1, d_old=2 800 | d̂ ≥ d_old ⇒ **UNCHANGED**, d_after=2 800 |
| T4 | e=600; only 2 finite ring ratios ⇒ L=null; d_old=2 000 | band-only: d̂=960, d̂⁺=1 620 < 2 000 ⇒ **IMPROVES**; display "interval" [600, 1 620] |
| T5 | e=150; d_old=5 000 | near band: d̂=260, d̂⁺=730 < 5 000 ⇒ **IMPROVES**; display "near-band" ("≤ 0,73 km") |
| T6 | e=150; d_old=600 | 260 < 600 ≤ 730 ⇒ **UNCERTAIN** |
| T7 | d_old=null, grade UNREACHABLE_NO_PATH | **NO_BASELINE**: d_after=null, absent from aggregates, counted with population |
| T8 | candidate cell grade UNREACHABLE_NO_ROAD_ACCESS | placement **refused** (admission check 3) |
| T9 | e=5 200, formula would give d̂⁺ < d_old | **EXCLUDED** — radius cap wins |
| T10 | ring median 0,7 (corrupt input) | clamp ⇒ L=1,0; assert invariant **d̂ ≥ e** (estimate never below euclid) |
| T11 | property, all synthetic cells | d_after ≤ d_old wherever both defined; After pop-weighted median ≤ Before |
| T12 | screening: PHUONG, d_rule=400 | TU_CHOI, margin −100 |
| T13 | XA, 1 500, nearest measured GOOD util 0,45 | DE_XUAT_NEU_CO_DC |
| T14 | XA, 1 500, nearest util 0,20 / or nearest **unmeasured** util 0,9-lookalike (`util_reportable=false`) | TU_CHOI both — unknown is never high-load |
| T15 | XA, 480, high-load true | TU_CHOI — absolute floor 500 m beats the exception |
| T16 | XA, 2 500 | DE_XUAT, margin +500; assert basis is euclid even though a network value exists |
| T17 | DAC_KHU, 600 | DE_XUAT (PHUONG threshold 500) |
| T18 | calibration: a band with n=40 | merged with neighbor, recorded; total ratio cells 250 < 300 ⇒ `valid=false` ⇒ feature disabled (F2 copy) |
| T19 | haversine: (21,0285; 105,8542) → (21,0285; 105,8642) | 1 039 m ± 1 m |
| T20 | determinism: run twice on identical inputs | deep-equal `SimulationResult` |
| T21 | containment: P at a known cell centroid | `cellOf(P)` = that `h3_r8`; P outside boundary polygon ⇒ placement refused |
| T22 | hash: place P ⇒ hash has `sim=`; reload ⇒ same result; `sim=abc` ⇒ ignored, no candidate |
| T23 | isolation: with candidate active, `fieldRequests` cache keys and all lens/chart inputs are byte-identical to before placement |

Integration check against the real package **(01)**: run the §1 algorithm with the
candidate at an existing station's coordinates and assert ≥ 85 % of IMPROVES-classified
cells satisfy `d̂⁺ ≥ dist_station_network_m` of the corresponding validation cells — a
regression guard for the calibration pipeline, mirroring the measured 9,7 % miss.

---

## 5. FAILURE CONDITIONS (closed list; each has a detection point and a user-visible behavior)

| # | Condition | Behavior |
|---|---|---|
| F1 | Click outside province boundary / outside package grid | Refuse placement: "Ngoài phạm vi gói dữ liệu tỉnh — không có ô lưới để mô phỏng." |
| F2 | `sim_calibration.json` missing or `valid=false` | Feature disabled for the province: "Chưa đủ dữ liệu hiệu chuẩn để mô phỏng ở tỉnh này." Toggle hidden, hash param ignored. |
| F3 | Candidate cell `UNREACHABLE_NO_ROAD_ACCESS` | Refuse placement: "Không có đường trong phạm vi 2 km quanh ô này — trạm không thể tiếp cận bằng ô tô." |
| F4 | NO_BASELINE cells inside Z | Simulate the rest; dedicated line with count + population; those cells get no number, ever. |
| F5 | Ring has < 3 finite `detour_ratio` values | Band-only estimator; no error surfaced (declared in method popover). |
| F6 | Province utilization layer off (exclusions.json) | `high=false` forced; screening chip footnote: "Ngoại lệ cao tải không đánh giá được — lớp mức sử dụng của tỉnh này không đo được." Context list shows stations without util. |
| F7 | P within 5 km of the package edge | Zone truncated at package extent; warning line: "Vùng ảnh hưởng bị cắt ở ranh giới gói dữ liệu — ô phía tỉnh bên không được tính." |
| F8 | Second placement while one is active | Replace, recompute; never two candidates. |
| F9 | Malformed `sim=` hash | Drop the param, boot without a candidate, no error. |
| F10 | DuckDB query failure at placement | Panel error state, candidate cleared, map layers removed; retry allowed. |
| F11 | National (`vn/`) or proxy (`#tinh=poi`) mode | Toggle absent; `sim=` ignored. r6 has no distance columns; extrapolation is forbidden. |
| F12 | Numeric guard: any computed `d̂ < e(c)` | Assertion failure in dev, clamp to `e(c)` in prod, telemetry log — this indicates a calibration file corrupted below 1,0. |

---

## 6. Acceptance gate

Phase 6 is DONE when: T1–T23 pass; the integration check against package 01 passes;
`n15_sim_calibration` runs for all 34 provinces with its QA checks green (or marks
`valid=false`, which the web honors with F2); the four NOT SUPPORTED claims appear nowhere
in code, copy, or `SimulationResult`; the banner and method popover render verbatim; and
T23 (isolation) is verified against the real app, not only in unit tests.
