# Phase 9 — National Overview: Data, Normalization, Drill-down & Memory Contracts

Status: **PHASE 9 SPEC READY**
Type: pre-frontend data-architecture spec. Every claim below was verified on the working
tree (2026-08-20) against the shipped packages: `web/public/data/vn/` (r6 9,813 cells ·
r7 62,219 · 6,380 stations · `provinces.json` 34 rows) and the 34 province packages
`web/public/data/p/*/` (425,778 r8 rows, 417,185 distinct cells). Where a number appears,
it was measured on those files, not quoted from an earlier document.

Scope: NATIONAL DATA CONTRACT, NORMALIZATION CONTRACT, DRILLDOWN CONTRACT, MEMORY/LOADING
PLAN, ACCEPTANCE TESTS. Out of scope: any change to the Phase 2.1/4.1 encoding contracts
themselves, the per-province lens system, charts, story, simulation.

---

## 0. INHERITANCE PRE-FLIGHT (CR 2.1 "Phase 9 must inherit" + CR 4.1 amendments)

The five inherited items of `PHASE2_1_ENCODING_CR.md` §6, checked against the national
code that already exists (`web/src/national/`):

| # | Inherited item | Status in national code today |
|---|---|---|
| 1 | `scaleContract` is the only home of scale type/transform/clip — declare, never infer | **Already holds.** `national/fields.ts` declares `scaleContract` on every field (two shared constants: `SQRT_COUNT_SCALE`, `LINEAR_RATIO_SCALE`), each `"fixed-binned"` with a reason string, typed by the same `ScaleContract` union from `viz/palette.ts:31`. |
| 2 | The LUT is the only interpolation path; no local hex blending | **Holds vacuously and must keep holding**: every national field is `fixed-binned`, so no gradient renders; `NationalMap` paints via `colorFor(value, scale)` — the single entry point. No component in `national/` touches theme hexes. |
| 3 | One shared lighting rig + top-face fidelity gate | **Already holds** — the rig was calibrated *on* this screen (median top-face L1 shift 16 < 44/2); `NationalMap` keeps `EXTRUSION_MATERIAL` + the shared lights. Phase 9 adds no extruded layer, so no new gate run is triggered. |
| 4 | One domain, two channels | **Already holds**: `getElevation` reads `elevationFor(value, scale, maxElevFor(res))` — the same `Scale` object the fill reads, with `updateTriggers: [field.id, scale, mode, res]`. |
| 5 | Clipping disclosed where the scale is displayed | Inherited via the legend machinery + `elevationDisclosure()`. Phase 9's new surfaces (ranking list, KPI readouts) print raw values, not scale positions — nothing new to disclose there; the choropleth legend keeps the existing rules. |

**Palette inheritance.** The province choropleth interpolates nothing (fixed-binned) and
takes its swatches from the approved ramp through `buildScale`/`colorFor` — byte-identical
`THEME_PALETTES` anchors. No second palette family exists or may be introduced; any future
gradient at national level re-enters through CR 2.1 §3 (OKLCH LUT, 2.0:1 light-end gate)
with zero new rules.

### 0a. Determination 1 — does the province choropleth reuse the per-Lens scale machinery?

**Yes — the machinery; no — the Lens registry.** Measured facts that decide it:

- `NationalApp.tsx:216-230` already builds the province scale with the *same*
  `buildScale`/`computeClassing` the province screen uses, under the field's declared
  `scaleContract`. Reusing the machinery costs nothing and keeps acceptance test 2.1-7
  ("no second domain reachable") true nationally.
- The **catalog stays separate** (`national/fields.ts`, not `fields.ts`). This is a
  standing, justified decision (file header): the same name `population` measures a
  different quantity per reading unit (r8 cell 0.74 km² vs r6 cell ~36–40 km² vs province),
  and merging catalogs invites a field of one unit onto the map of another. Phase 9
  **keeps** this second catalog and declares it as inherited item N1 (below), not a
  violation of item 1 — item 1 governs *where scale contracts live* (in the registry that
  owns the field), not *how many registries exist*.
- **No gradient toggle at province level.** `n = 34` is below any honest continuous-ramp
  domain: `p99` of 34 values interpolates between the top two values, and quantile bins on
  34 values are the only structure whose legend prints defensible thresholds. All province
  fields therefore stay `"fixed-binned"` with reason strings — which is exactly what
  `national/fields.ts` already declares. The `sc` hash key remains province-workspace-only
  and is already stripped by `serializeNationalHash` (`national/hash.ts:68`).

### 0b. Determination 2 — national domain over provinces, not cells

The province-choropleth domain is computed over **exactly the 34 province values** of the
selected column (nulls excluded), at scale-build time, in the browser — never over r6/r8
cells, and never hard-coded. This is `NationalApp.tsx`'s "decision 2" made contractual:

- Same transform machinery, but the clip's anti-outlier role weakens at n = 34: `p99` on
  34 points ≈ the 2nd-largest value. That is still the *right* behavior — the one national
  outlier is real (HCMC: 10,064 ports vs median ~1,100) and the binned mode's quantile
  classes absorb it — but the elevation channel is where a p99 clip on 34 values would
  matter, and **province polygons do not extrude** (`can3D("province") === false`,
  enforced at first render). So the sqrt/p99 contract is carried by declaration for
  consistency, exercised only by the binned classer. If a later CR extrudes provinces, the
  clip semantics at n = 34 must be re-justified then — declared debt, not silent.
- The r6/r7 cell fields keep their existing per-grid domains (decision 2 of the screen:
  classed on the loaded grid, re-classed per LOD tier — an r7 cell measures a different
  quantity than an r6 cell).
- **Cross-screen non-comparability is disclosed, not hidden**: the same orange means "high
  among 34 provinces" here and "high among 4,400 Hanoi cells" there. The legend printing
  real thresholds (§3b doctrine) is the disclosure mechanism; no new UI is invented.

### 0c. Determination 3 — NOT COMPARABLE is a new, province-level state

Cell-level machinery has four empty states (`null-states.ts`: MISSING / NOT_APPLICABLE /
NOT_MEASURED / FILTERED) and they are *row* states. Phase 9 needs a *dataset-level*
verdict: "this province's number exists but must not be ranked against the others." That
state **exists in the data today** — it is not hypothetical:

- Utilization: 4 provinces sit below the pipeline's 50%-measured gate
  (`manifest.unusable_layers`: 04 = 10.0%, 11 = 0.0%, 12 = 16.7%, 14 = 4.7% of stations
  measured); province 11's `util_median` is literally `null` in `provinces.json`.
- The gate is already machine-readable (`unusable_layers[].layer == "occupancy"`,
  `quality_flags` containing `KHONG_DO_DUOC_SU_DUNG`) — Phase 9 consumes it, it does not
  invent a parallel flag.

Contract (new item N2): a province × field pair is **NOT COMPARABLE** when the field's
declared comparability rule (§1.3) fires. Rendering: the polygon takes a **solid neutral
fill distinct from the null hatch** (hatch = MISSING stays reserved for "value absent"),
plus exclusion from the legend's class counts and from ranking. Three-way distinctness
gate: NOT-COMPARABLE fill vs (a) the state-angled hatch and (b) the lightest rendered bin
each ≥ the §4b ΔE floor (6–8), light + dark themes. This is deliberately *stronger* than
cell-level null handling because a mis-read here mis-ranks an entire province, not one
cell — the pre-flight's requirement, met by giving the state its own channel (solid vs
hatch texture) rather than a lighter shade of either neighbor.

### 0d. New contract items (declared, not silently redefined)

| Id | New item | Justification |
|---|---|---|
| N1 | Second field catalog `national/fields.ts` with two reading units (`province`, `cell`) | Different reading units are different quantities; merging catalogs is the documented cross-unit hazard. Contracts (scale/clip/reason) still live per-field in that catalog — item 1's letter holds. |
| N2 | NOT COMPARABLE province state (solid neutral, excluded from ranking + class counts) | §0c. No inherited state has dataset-level semantics. |
| N3 | Province domain = the 34 in-view values; p99-at-n=34 caveat recorded; provinces never extrude | §0b. |
| N4 | Normalized-KPI registry: every ratio field declares numerator, denominator, source column, null rule, polarity (§2) | The audit found two coexisting zero-denominator conventions in the pipeline (§2.0) — the registry is what prevents a third. |
| N5 | `urban_km2` derived denominator with the `area_eff` formula (§2.2) | New quantity; the naive formula double-counts 8,593 border cells and overstates by 0.5–5.8% per province. |

---

## 1. NATIONAL DATA CONTRACT

### 1.1 Keys, vintage, datasets

- **One vintage everywhere**: VNSDI 34 provinces / 3,321 communes, effective 16/6/2025
  (`manifest.vintage`, identical strings in all 34 province manifests + the national one).
  Keys: `province_code` (2 chars) / `commune_code` (5 chars); names are never keys.
- **Datasets in play**: (a) `vn/provinces.json` — 34 attribute rows, the province
  choropleth + ranking source; (b) `vn/grid_h3_r6|r7.parquet` — national cell fields;
  (c) `provinces.geojson` — geometry, shared with the dataset picker; (d) `p/<code>/…` —
  the 34 full packages, drill-down targets only, **never read by the national screen**.
- **Uniform column coverage measured**: all 34 package manifests report
  `missing_layers.columns = []` and the identical 61-column grid schema; the four
  degenerate-column patterns are true regional zeros (`snow_frac`, `mangrove_frac`…),
  not schema gaps. Cross-province *schema* compatibility is a fact, not an assumption.

### 1.2 Availability & comparability matrix (measured on all 34)

| Metric family | Source columns | Availability | Methodology comparability verdict |
|---|---|---|---|
| Population | `provinces.json` `population_*` (VNSDI published); `population_grid` (dasymetric WorldPop-2025-weighted, VNSDI-anchored); grid `population` | 34/34, no nulls | **Comparable as "published population"** — single source, single vintage. **Not comparable as "residents"** without disclosure: the VNSDI anchor ratio (`vnsdi_anchor_ratio` = danso/WorldPop) spans **0.952 (Hà Nội) → 1.607 (An Giang)**, i.e. the published denominator overstates the independent surface by up to 61%, unevenly. Every population-normalized KPI inherits this bias and must say so (§2 disclosure line). National total 113,732,608 vs ~101 M real. |
| Stations | `n_stations` (scope=IN), `n_stations_buffer` separate | 34/34 | **Comparable.** Same crawl, same 1-gun-AC exclusion re-applied per province (`private_ac_share_*` + `n_private_ac_dropped` published per row), buffer copies excluded; Σ = 6,380 exactly. Smallest province: 24 stations (p12, flagged `QUA_IT_TRAM`). |
| Ports | `n_ports` (IN stations) | 34/34 | **Comparable with disclosure**: `n_ports` is null on 0–16% of IN stations per province (worst p24: 38/238); sums skip nulls ⇒ per-province **lower bound with uneven bias** — same disclosure chip as power. Port counts partially imputed under one national rule (`n_guns_imputed`, `port_config_source` shipped per station). |
| Power | `power_kw_site` (IN) | 34/34 | **Comparable with disclosure**: nameplate null share per province **0% → 15.97%** (p24; p96 = 13.2%; 5 provinces exactly 0%). Sum skips nulls ⇒ lower bound, bias varies by province. Rule: any province with null share > 10% carries a per-row disclosure in ranking/tooltip (measured: exactly 2 provinces today — 24, 96). |
| Urban area | grid `built_frac` × cell geometry | 34/34 (min 30.1 km², no zeros) | **Comparable** — single national raster, ESA WorldCover 10 m v200 (2021), one burn rule (`n06`). Two declared caveats: raster vintage 2021 vs supply 2026 (uniform staleness); fraction is measured on the **full hexagon** while cells are clipped to provinces — the correct in-province formula is §2.2, and the naive one overstates 0.5–5.8%/province and double-counts the 8,593 duplicated border cells. |
| Road-network distance | grid `dist_station_network_m`, `network_reachable`, `detour_ratio`; `provinces.json` medians | 34/34 | **Comparable method** (one Dijkstra pipeline, 5 km buffer stations included, per-province latitude-true padding), **but the shipped summary statistic is not the ranking statistic**: `dist_station_network_median_m` is a plain cell median — a terrain/network property (counts uninhabited cells, excludes NaN) — not a person property. Reachability spans `share_cells_reachable` 0.334–0.999, `share_pop_unreach` 0.00–10.7%. Verified invariant: `network_reachable ⟺ dist NOT NULL`, **0 mismatches / 425,778 rows**. Rank on population-weighted coverage (§2.3), never on the cell median. |
| Coverage metrics | `share_pop_beyond_2km`, `pop_beyond_2km_network`, `share_cells_de_xuat` | 34/34 | `share_cells_de_xuat` (screening): comparable — one rule set, đặc-khu inference declared. **`share_pop_beyond_2km` has a ledger defect (§1.4-D2): unreachable population (NaN distance) is silently counted on the "within 2 km" side.** Understatement equals `share_pop_unreach`: up to **10.66 pp** (p96) and **8.63 pp** (p04). Not comparable as shipped; superseded by the §2.3 definition. |
| Utilization | `util_median`, `share_stations_measured` | 33/34 values; 30/34 usable | **NOT COMPARABLE for provinces 04, 11, 12, 14** — below the 50%-measured gate already declared in `unusable_layers`; p11 is `null` outright. For the other 30, comparable with the measured-share printed beside any ranked use. |

### 1.3 Comparability rules (machine-readable, no hand list)

A province × field pair renders NOT COMPARABLE when — and only when — a rule reading
shipped data fires (the Phase 8 Rule-0 doctrine, lifted to province level):

- `field.kpi.denominator` resolves to null/0 for that province (§2 registry), or
- the field's declared source layer appears in that province's `manifest.unusable_layers`
  (today: occupancy in 04/11/12/14), or
- the field declares a required flag-absence and `quality_flags` contains it (used by:
  utilization → `KHONG_DO_DUOC_SU_DUNG`).

`quality_flags` that do **not** gate (context chips only): `DIA_GIOI_CO_SO_CONG_BO_HONG`
(28/34 provinces — published commune areas broken, e.g. Phú Lợi 17,956 km²; harmless
because **no Phase 9 metric may use `area_km2_published`**, see D4),
`POI_KHONG_DIEN_GIAI_DUOC`, `DAN_KHONG_TOI_DUOC_BANG_DUONG`, `QUA_IT_TRAM`.

### 1.4 Verified defects Phase 9 must fix before frontend work

- **D1 — `provinces.json` merge-suffix leak (breaks the screen today).**
  `n12._provinces_json` merges `admin/provinces.parquet` × `qa/provinces.parquet` with
  pandas defaults; shared columns ship as `population_x/_y`, `n_communes_x/_y`,
  `area_km2_geom_x/_y`, `n_dac_khu_x/_y`, `n_communes_flagged_x/_y`. Three live
  `PROVINCE_FIELDS` (`p:population`, `p:n_communes`, `p:area`) read the unsuffixed names
  → **all-null choropleths** (verified against the shipped JSON). Fix in the exporter:
  resolve duplicates before writing (QA values win where they differ only by rounding;
  assert equality within tolerance), ship exactly one column per name, and add the schema
  test (AT-2). No `_x`/`_y` may appear in a shipped artifact.
- **D2 — beyond-2km ledger.** `n10` computes `pop_beyond_2km_network` as
  `dist > 2000` on a column where unreachable = NaN ⇒ unreachable population lands on the
  "within" side. Recompute as §2.3 (reachable-only "within"; everything else is "not
  within"). The shipped column is superseded, not reinterpreted.
- **D3 — two zero-denominator conventions.** `n09` communes:
  `population.replace(0, nan)` → KPI null (correct). `n10` provinces:
  `max(int(population), 1)` → a zero-population province would print ports-per-10k =
  10,000 × its raw port count, silently. Latent today (min province population 512,601)
  but the convention is the defect: §2's null rule replaces every `max(x, 1)` denominator
  guard in province KPIs.
- **D4 — published area is poisoned.** `area_km2_published` inflates HCMC to 24,718 km²
  (one commune's typo'd 17,956 km²). Every Phase 9 area denominator reads
  `area_km2_geom` (point-in-polygon-verified geometry). Already true of
  `pop_density_ppkm2`; made contractual for all new fields.

---

## 2. NORMALIZATION CONTRACT

### 2.0 The KPI registry (N4)

Every normalized province field declares, in `national/fields.ts` (compiler-enumerated
like `scaleContract`):

```
kpi: {
  numerator:   { column, aggregation, source }   // e.g. Σ n_ports over IN stations
  denominator: { column, aggregation, source }   // e.g. VNSDI published population
  nullRule: "null-propagates"                     // denominator null|0 ⇒ KPI null ⇒ NOT COMPARABLE
  disclosure?: string                             // the bias sentence printed at point of use
}
```

One law above all: **a ranked KPI uses one denominator source for all 34 provinces** —
never published population for some and grid population for others. And no silent guard:
`max(denominator, 1)` and friends are banned (D3); the only legal degenerate outcome is
`null`, which renders NOT COMPARABLE and drops out of ranking with a printed count.

### 2.1 `ports_per_10k_pop` — exists, keep, tighten

- **Definition**: `1e4 × Σ n_ports(IN stations, after the 1-gun-AC exclusion; nulls skip)
  / population_published(VNSDI)`. Computed in `n10`, shipped in `provinces.json`, already
  a `PROVINCE_FIELDS` entry.
- **Exact denominator**: VNSDI `danso` province sum — the *published* number, chosen over
  `population_grid` because (a) it is the official statistic the reader can check, and
  (b) grid population is itself VNSDI-anchored, so switching buys no independence, only a
  0–1.1% wobble. **Disclosure line** (mandatory wherever ranked): denominator is the
  published count; the independent surface differs by ×0.95–×1.61 by province (§1.2).
- **Numerator caveat inherited from ports** (§1.2): lower bound; null-port stations skip.
- **Zero/null**: population null or 0 ⇒ null (replaces the `max(pop,1)` path, D3).
  Measured floor today: 512,601 — the rule is armor, not a live branch.

### 2.2 `power_kw_per_urban_km2` — new; denominator must be built, not improvised

- **Numerator**: `Σ power_kw_site` over IN stations (nulls skip — lower bound; provinces
  with nameplate-null share > 10% carry the disclosure chip; today exactly 24 and 96).
- **Denominator — `urban_km2`, computed in the pipeline (`n10`), never in the browser**:

  ```
  urban_km2(p) = Σ_cells∈p  built_frac × area_km2 × area_frac
  ```

  `area_frac` is mandatory: `built_frac` is a full-hexagon fraction (n06 rasterizes
  unclipped cell polygons) while border cells are shared — 8,593 of 425,778 rows are the
  same cell in two packages. The `area_eff` precedent is already law in
  `n12._grid_agg` ("chỉ phần trong tỉnh mới là thứ cộng được"). Measured deltas, naive vs
  correct: +0.5% → +5.8% per province (worst p22), +2.6% national; national total
  10,565 km² (correct) vs 10,836 (naive). The within-cell-uniformity assumption this
  formula makes is declared in the field's `desc`.
- **Vintage disclosure**: built surface 2021 (ESA WorldCover v200), supply 2026. Uniform
  across provinces ⇒ comparable; still printed.
- **Zero/null**: `urban_km2` null or 0 ⇒ null KPI. Measured floor 30.08 km² (p04) — no
  live zero, rule declared anyway. Range check: KPI spans ~163 kW/km² (p04) → ~377 (p37,
  p01); a well-behaved right-skewed count-ratio → `SQRT_COUNT_SCALE`.

### 2.3 `population_access_within_3km` — definable, with one threshold objection

- **Definition (per province, computed in `n10` from the r8 grid)**:

  ```
  access_within_T(p) = Σ population[ dist_station_network_m ≤ T ∧ network_reachable ]
                       / Σ population            // both sums over p's cells
  ```

  Unreachable population (NaN distance — verified exactly the `¬network_reachable` set,
  0/425,778 mismatches) stays in the **denominator** and never enters the numerator:
  "cannot reach by road" is the strongest form of "not within T". This is what makes the
  metric honest where the shipped beyond-2km column is not (D2).
- **Exact denominator**: `population_grid` (the dasymetric grid sum), **not** published
  population — the numerator lives on the grid, and mixing masses would make the ratio
  exceed 1 or undercount by the 0–1.1% grid-vs-published gap. This is the one Phase 9 KPI
  where the grid denominator is *forced* by construction; the registry records it.
- **Measured spread at T = 3,000 m**: 0.195 (p12) → 0.912 (p79) — strong discrimination,
  no degenerate province. At T = 2,000 m: 0.148 → 0.818.
- **Threshold objection (must be resolved, not slid past)**: 3 km is not a registered
  domain threshold. The atlas has exactly one access threshold — `BEYOND_2KM_M`
  (`domain-thresholds.ts`), used by the Access curve, the Opportunity rank bars, and the
  screening rules. Options: **(a) recommended** — ship
  `population_access_within_2km` (complement of the *corrected* beyond-2km), inheriting
  the registered constant and every sentence already QA'd about it; **(b)** if 3 km has a
  real business rationale, register `ACCESS_3KM_M` in `domain-thresholds.ts` with its
  provenance line and ship both at province level only. Forbidden: a bare `3000` living
  in one KPI while the rest of the atlas says 2 km — two unexplained access thresholds on
  one screen is the "two scales, one legend" failure in domain-constant form.
- **Zero/null**: `population_grid` 0 or null ⇒ null. If a future province ships without
  the computed distance layer (`missing_layers`), the KPI is null ⇒ NOT COMPARABLE — the
  "chưa tính ≠ bằng không" rule `n10` already applies to its own distance aggregates.

### 2.4 Province ranking semantics

- **Rank is defined only for fields with declared `polarity`.** `high-good` ranks
  descending (rank 1 = best), `high-bad` ascending (rank 1 = least concerning); fields
  without polarity (population, area, n_communes) are *sortable but unranked* — a rank
  badge on a descriptive count would assert an evaluation nobody declared.
- **NOT COMPARABLE provinces are excluded before ranks are assigned** and the exclusion
  is printed where the ranking renders: "hạng trên N tỉnh so sánh được · M tỉnh không so
  được" (e.g. utilization: N = 30, M = 4). A null never holds a rank; ranks run 1…N with
  no gaps.
- **Ties**: standard competition ranking (1224) on the value as shipped (already rounded
  by the exporter) — ties are real ties of the published precision, not float noise.
- **Rank is presentation, not data**: computed in the browser from `provinces.json` +
  the registry; never exported, never hashed. The ranking list and the choropleth read
  the same 34 values by construction (one load, §4).

---

## 3. DRILLDOWN CONTRACT (National → Province)

The mechanism exists and stays: **drill-down = dataset switch = full page reload.**

- **Transition**: click province polygon → `onPickProvince(code)` → `switchDataset(code)`
  (`data/province.ts`): writes `#tinh=<code>` as the *only* hash key, then
  `location.reload()`. The three boot-locked invariants that justify reload-not-state are
  documented at `province.ts` and remain binding: DuckDB file registrations live for the
  worker's lifetime; the manifest caches once; classing percentiles are computed on the
  loaded dataset. ~1 s cost, zero cross-province state leakage.
- **State carried across**: nothing but `tinh`. National keys (`f`, `l`, `m`) die at the
  boundary by design — field ids (`p:*`/`c:*`) don't exist in the province catalog, and a
  carried `f` would either 404 or silently paint a different quantity. The reverse
  direction (province → national via the dataset picker) already strips
  province-workspace keys (`s d v p c t b sc` — `national/hash.ts:68`).
- **Gate**: click drills only when `properties.in_store` (already enforced in both map
  layers). NOT COMPARABLE affects *ranking*, never drill-down — the province package is
  whole; only specific national comparisons aren't.
- **Re-enabling the fork (the actual Phase 9 gate change)**: `data/scope.ts`
  `parseDataset` is currently stubbed to Hanoi-only ("Bản phát hành này cố ý chỉ có Hà
  Nội") — the national screen is unreachable dead code in this release. Phase 9 restores
  the four-way fork (absent → Hanoi bundle, `NN` → province, `vn` → national, `poi` →
  proxy) with the original pure parser + its tests. This is a declared release-scoping
  reversal, not a refactor.
- **Deep links**: `#tinh=vn&f=p:ports_per_10k` must reproduce the exact national frame
  (§9 hash doctrine, already implemented by `parseNationalHash` with unknown-id
  fallbacks). `#tinh=79` opens the province workspace at its defaults.

---

## 4. MEMORY/LOADING PLAN

**Governing rule: one dataset per page lifetime.** The reload boundary *is* the unload
mechanism — nothing else unloads anything, and nothing needs to. Every cache below is
append-only within one page lifetime and dies with it. The hazard named in the Phase 9
brief — province datasets accumulating in memory — is structurally impossible while this
rule holds, because **no code path loads a `p/<code>/` file in national mode** (the
national screen reads only `vn/*` + `provinces.geojson`) and reaching a province is
always a reload. Any future in-page province switching is a new CR against this section,
not a tweak.

Measured budgets (manifest byte counts, this export):

| Load | Files | Bytes |
|---|---|---|
| National first paint | `grid_h3_r6.parquet` + `provinces.json` (+ `provinces.geojson` 292 KB shared with the picker) | **522,287** (`bytes_first_load`) |
| Lazy, on layer/LOD demand | `stations.parquet` 269,437 · `poi.parquet` 777,397 · `grid_h3_r7.parquet` 2,138,189 | ≤ 3.19 MB total |
| Province package (after drill-down reload) | full `p/<code>/` set | 1.31 / 2.85 / 7.04 MB (min/median/max) |

Lifecycle rules, per artifact:

- **Manifests / JSON** (`vn/manifest.json`, `provinces.json`, `provinces.geojson`):
  fetched once per page lifetime into module/React state (`loadProvinceIndex` already
  memoizes its promise). Served static; the browser HTTP cache carries them across
  reloads — no app-level persistence, no invalidation logic to get wrong.
- **DuckDB registrations** (`registerParquet`): name-keyed, race-guarded, append-only.
  National mode registers at most 4 names (`vn/grid_h3_r6`, `vn/grid_h3_r7`,
  `vn/stations`, `vn/poi`); province mode registers only `p/<code>/…` names. The set is
  bounded because the name space per lifetime is bounded — assert it (AT-12).
  Registrations are URL mappings (HTTP-range reads), not buffered files: registering is
  cheap; **materialized JS arrays are the real RAM**, and they are enumerated next.
- **Materialized arrays** (`NationalApp` state): province rows (34) + shapes;
  `cellsBy` holds **at most two entries** (r6 9,813 × 12 cataloged columns; r7 62,219) —
  both retained deliberately so LOD flips never re-fetch 2.14 MB or blank a frame;
  stations (6,380) and POI (25,220) load on first layer toggle and stay. Worst-case
  resident set is a fixed, enumerable list — there is no per-interaction growth. DuckDB
  query latency is a non-issue at this scale (measured p95 35 ms on the *heaviest*
  province query; national tables are smaller and queried once each).
- **KPI/ranking derivations**: pure `useMemo` over the 34 rows — no cache, no store, no
  hash. Recomputing 34 rows is cheaper than any invalidation bug.
- **Prefetch discipline**: none. No speculative loading of province packages on hover —
  a hover is not intent, and 2.85 MB median per speculative fetch is how the "unintended
  accumulation" failure gets rebuilt on the network side. The only prefetch-shaped
  behavior allowed is the browser's own HTTP cache.

---

## 5. ACCEPTANCE TESTS

Unit (`node --test`, pure modules):

1. **Registry completeness** — every `PROVINCE_FIELDS`/`CELL_FIELDS` entry declares
   `scaleContract` (fixed-binned ⇒ reason string); every normalized field declares the
   full `kpi` block; a ranked field without `polarity` is a type error.
2. **Exported schema hygiene (D1)** — `provinces.json`: no key matches `/_[xy]$/`; every
   column named by `PROVINCE_FIELDS` exists in all 34 rows; `population`, `n_communes`,
   `area_km2_geom`, `n_dac_khu` present unsuffixed. (Pipeline-side pytest + a web-side
   guard against the loaded object.)
3. **Null propagation, no silent guards (D3)** — denominator `null`/`0` ⇒ KPI `null`;
   property test over the KPI evaluators shows no reachable `max(den, 1)`-style path
   (fuzz denominators through 0 and assert `null`, never a finite number).
4. **Ranking semantics** — NOT COMPARABLE provinces excluded before rank assignment;
   ranks are 1…N dense over the comparable subset; competition ties; `high-bad` inverts;
   unranked-without-polarity enforced; the "N so sánh được · M không" counts equal the
   rule outcomes (utilization fixture: N = 30, M = {04, 11, 12, 14}).
5. **Comparability rules are data-driven (§1.3)** — feeding the 34 shipped manifests +
   `provinces.json` through the rule set flags exactly the measured pairs (occupancy 4;
   zero besides); no hand-listed province codes anywhere in `web/src`.
6. **`urban_km2` formula (N5)** — golden per-province values recomputed from the store
   with `built_frac × area_km2 × area_frac`; the full-cell variant differs by the archived
   deltas (p22 +5.83%) and any drift fails; national Σ = 10,565.4 ± rounding.
7. **Access-within-T ledger (D2)** — golden: for p96,
   `within(reachable-only)` vs the naive `1 − share_pop_beyond` differ by exactly
   `share_pop_unreach` (0.1066); unreachable population asserted in denominator, out of
   numerator; `reachable ⟺ dist NOT NULL` invariant asserted per province in pipeline QA.
8. **Threshold registration (§2.3)** — the access KPI's T is imported from
   `domain-thresholds.ts` (grep-style test: no bare `3000`/`2000` literal in the KPI
   path); if option (b) was taken, `ACCESS_3KM_M` exists with a provenance string.
9. **Hash round-trips** — `#tinh=vn&f=<each field id>` reproduces field/layers/mode;
   unknown ids fall to defaults; `serializeNationalHash` preserves foreign keys, strips
   the 8 province-workspace keys, always re-asserts `tinh=vn`; `switchDataset` emits a
   hash containing *only* `tinh`.
10. **Dataset fork (§3)** — `parseDataset` restored: absent/`NN`/`vn`/`poi` are mutually
    exclusive; `dataPath` never prefixes `p/vn/` or `p/poi/`.

Render (CDP, same harness as `docs/qa/phase21/`):

11. **NOT COMPARABLE distinctness (N2)** — composite render with a NOT COMPARABLE
    province (utilization field, p11), a hatched-null province, and the lightest valid
    bin: pairwise ΔE ≥ the §4b floor, light + dark, plus a texture check (solid vs hatch)
    so the distinction survives ΔE-blind viewers.
12. **Memory invariant (§4)** — after boot + field cycling + layer toggles + LOD flip in
    national mode: DuckDB registration list ⊆ the 4 `vn/*` names (no `p/` prefix ever);
    network log contains no `p/<code>/` fetch; first-paint bytes ≤ `bytes_first_load` +
    geojson.
13. **Drill-down transition** — click in-store province: page reloads with
    `#tinh=<code>` and no other key; province app boots its own package; back via picker
    restores `#tinh=vn` national defaults; a not-in-store province (fixture) does not
    navigate.
14. **Ranking surface** — for utilization: 4 provinces render outside the ranked list
    with the disclosure count; for power: provinces 24 and 96 carry the >10%-null chip;
    screenshot archived with the witness set.

Pipeline (pytest, golden):

15. **Exporter regression set** — D1 dedup asserted on a rebuilt `provinces.json`;
    corrected within-T columns present with golden values for {01, 04, 79, 96}; every
    `max(pop, 1)` in `n10` province KPIs replaced (grep-gate) and outputs `None` on a
    synthetic zero-population fixture.

---

**PHASE 9 SPEC READY**
