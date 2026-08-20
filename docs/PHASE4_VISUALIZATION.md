# Phase 4 — Linked Visualization Specification

Status: **PHASE 4 SPEC READY**

Scope: the five primary lens charts, chart-to-map communication, one analytical filter,
event ownership, DuckDB-WASM/query lifecycle, component boundaries, and acceptance gates.

Approved primary mappings:

| Lens | Primary chart |
|---|---|
| Demand | Population Histogram |
| Supply | Power Tier Breakdown |
| Access | Access Curve |
| Utilization | Heatmap 7×24 |
| Opportunity | Commune Rank Bars |

This specification extends the Phase 2 lens registry and Phase 3 dataset-scoped selection.
It does not add a Candidate, recommendation, approval, or investment score.

## 0. High-risk findings and decisions

### 0.1 Verification against the published data

The review used all 34 province packages under `web/public/data/p/*`, exported
2026-08-11, and the code/data state on 2026-08-18. These numbers verify the current
snapshot; none becomes hard-coded UI copy or a permanent test constant.

| Checked contract | Published data | Phase 4 consequence |
|---|---:|---|
| H3 grid | 425,778 province rows; 3,386–29,763 rows/package | Per-province in-memory chart derivations are bounded. National mode remains a separate surface. H3 identity stays dataset-scoped because boundary H3 IDs can occur in more than one province package. |
| `population` | 0 null; 111,096 exact zeros; median 22.1 and max 73,861 persons/cell | A linear equal-width 32-bin histogram collapses most observations into its first bars. Demand needs an exact-zero bucket and a transformed positive axis. |
| `dist_station_network_m` | 94,530 null/unreachable rows | Access cannot silently drop unknown population and still end at “100% of all population.” |
| Stations | 7,787 rows: 6,380 `IN`, 1,407 `BUFFER` | Supply and Utilization chart aggregates use `IN` only. BUFFER stations remain map context and never enter chart totals. |
| `power_kw_max_port` | 220 null; known values 7–360 kW, concentrated at 11, 20, 30, 60, 120, 180, and 250 | “Power tier” is not currently defined. Phase 4 defines a presentation grouping on strongest-port power, not site total. |
| `power_kw_site` | 220 null; known values 11–5,040 kW | It is a site total and is not interchangeable with `power_kw_max_port`. It may appear only as tooltip context. |
| 168-hour profiles | 1,013,450 rows; 941,252 pass the one-hour gate with a positive denominator | Load once, derive once, and never query on scrub. Four manifest-disabled provinces remain disabled. |
| Opportunity Commune input | 3,321 Communes; 1,334 have some population at unknown network distance; 17 have no measured population | Rank a declared lower bound, “known population beyond 2 km,” and show unknown population beside it. Do not call it total underserved population or an opportunity score. |

The seven limitations in `HAN_CHE.md` remain in force. In particular: Station means public
charging; Access is measured in metres, not minutes; network distance has no Euclidean
fallback; power is charger-side power, not grid connection capacity; and utilization is
not a market-wide measurement.

### 0.2 Current implementation conflicts that Phase 4 resolves

1. `AtlasReadColumn` hard-codes `Dock view="distribution"`, so every lens currently receives
   the generic Histogram rather than the approved lens chart.
2. `BrushState` mixes three meanings: a numeric mark brush, a two-dimensional mark brush,
   and a time window that changes playback rather than the analytical population.
3. Existing prose calls filtered marks “greyed,” while parts of the render path construct
   only kept marks. Phase 4 chooses one meaning and makes both state and rendering obey it.
4. There is no power-tier field or reusable power-tier classifier.
5. Opportunity has no published Commune opportunity field. The current generic RankBars
   cannot implement the approved mapping without a declared grid-to-Commune aggregate.
6. `fetchOccupancy()` indexes every Station row, including BUFFER rows. Published profiles
   currently contain only IN Station codes, so BUFFER rows do not change utilization, but
   they do inflate coverage denominators and dilute aggregate observed-hours calculations.
7. Current chart derivations live in `App`, `Dock`, and individual chart modules. There is
   no immutable, dataset-scoped chart model boundary.

### 0.3 Product decisions

- A filter means **SUBSET**, and only subset. It does not mean highlight, zoom, selection,
  or a time cursor.
- Phase 4 permits one active analytical filter. A new compatible filter replaces the old
  one; an incompatible lens/dataset transition clears it in the controller, never in a
  chart effect.
- Entity selection, time selection, hover, and camera commands are separate event types.
- Primary charts are owned by lenses, not by individual fields. Add `primaryChart` to
  `LensMeta`; do not revive `FieldMeta.charts`.
- Baseline chart geometry stays visible while a filter is active so the user can edit or
  clear the control. The active subset is an overlay/readout. The map receives only the
  analytical subset. This is still subset semantics; the baseline is the filter control's
  reference distribution, not a second analytical population.
- Viewport is never a filter. Pan and zoom issue no chart query and change no chart total.

## 1. VISUALIZATION CONTRACT

### 1.1 Global chart invariants

Every primary chart declares and tests:

1. input dataset and analytical entity;
2. one transformation and one aggregation definition;
3. null and known-zero behavior;
4. units, domain, axes, and tooltip contents;
5. whether it emits a filter, time, or entity-selection intent;
6. map response and selection response;
7. a stable dataset-scoped cache key;
8. an empty, unavailable, loading, and failed state;
9. keyboard behavior equivalent to pointer behavior;
10. no query, store read, or dispatch during render.

Charts use the same semantic palette tokens as their lens map layer. Where hue encodes the
same numeric measure (notably Utilization), the map and chart share one scale and the same
color means the same interval. A single-series bar/line uses one lens series token and
encodes value by position, not hue; Supply tiers must not borrow the Station-port map scale.
Null uses the shared hatch/open-mark token. A chart may use position, outline, or opacity
for its controlled state, but may not introduce a second data hue.

Phase 2.1 scale mode does not change chart business logic. Map gradients and binned maps
both read their anchors/LUT from the Lens Registry palette; single-series charts continue
to read that palette's `series` anchor. Histogram/heatmap bins remain binned in both map
modes. `Legend` alone branches between the QA'd swatch ruler and the transform-aware LUT
gradient; both branches receive the runtime `Scale`, and null/not-applicable/filtered
materials remain outside the numeric bar.

### 1.2 Demand → Population Histogram

Chart ID: `demand-population-histogram`

| Contract item | Decision |
|---|---|
| **INPUT DATA** | In-boundary rows of the loaded `grid_h3_r8.parquet`: `h3_r8`, `population`. The row belongs to the current `datasetId`; do not deduplicate H3 IDs across province packages. |
| **TRANSFORMATION** | Reserve one fixed-width leading bucket for exact zero. For positive values compute `z = log1p(population)` and divide `[log1p(min_positive), log1p(max)]` into 23 equal-width display bins. Store actual population bounds on every bin. The zero bucket plus 23 positive bins give about 12 px/bar at `CHART_W = 296`; do not restore 32 without a rendered-width review. |
| **AGGREGATION** | Per bin: `n_cells`, `cell_share`, and `population_sum`. `population_sum` is tooltip context; bar height is `n_cells`. Compute median from non-null raw values and show it as a reference hairline. |
| **FILTER SEMANTICS** | A completed horizontal brush emits one inclusive `between` SUBSET filter on Cell `population`. Clicking the zero bucket emits `[0, 0]`. Live drag is local visual state; dispatch once on pointer-up/keyboard commit. |
| **NULL HANDLING** | Current schema has no null. Future nulls do not enter a bin and appear in an explicit text count. They are excluded when a range filter is active. Null is never placed in the zero bucket. |
| **UNIT** | X: persons per H3 r8 cell (~0.74 km²). Y: H3 Cell count. Tooltip may also report persons living in the selected cells. |
| **DOMAIN** | X is a composite display domain: one categorical `=0` slot followed by positive `[min_positive, dataset max]` through a `log1p` positional transform; never truncate the maximum. An all-zero dataset renders only the zero slot. Y: `[0, max bin count]`, linear, zero-based. |
| **AXIS** | A separator distinguishes the `=0` slot from the positive transformed axis. Positive tick labels are inverse-transformed real values (`1`, `10`, `100`, `1k`, `10k` as applicable), not logarithms. Axis title: `Dân số trên ô H3 · người`. Y: 2–3 integer ticks, title `số ô`. A brush spanning the zero slot and positive pane serializes as `[0, hi]`. |
| **TOOLTIP** | Actual inclusive/exclusive population bounds, Cell count and share, population sum, and whether the bin is inside the active subset. The last bin is closed at its upper edge; internal bins are `[lo, hi)`. |
| **MAP INTERACTION** | The filter subsets Demand H3 analytical marks. Excluded analytical Cells are not passed to the analytical layer. Context overlays and the selection layer remain. Camera does not move. |
| **SELECTION INTERACTION** | Histogram interaction does not create an entity selection. Existing Cell/Commune/Station selection persists even when it falls outside the subset; Inspector states `Ngoài tập lọc hiện tại`. |

The log transform is presentational. It does not transform values in the filter, tooltip,
URL, Inspector, or map field.

### 1.3 Supply → Power Tier Breakdown

Chart ID: `supply-power-tier-breakdown`

Power tier is based on the strongest installed port, `power_kw_max_port`. It is not based
on `power_kw_site`, `n_ports`, `current_type`, connector registry counts, or grid capacity.

```ts
export type PowerTierId =
  | "le-22"
  | "23-60"
  | "61-120"
  | "121-180"
  | "gt-180"
  | "unknown";

export function powerTierOf(maxPortKw: number | null): PowerTierId {
  if (maxPortKw === null || !Number.isFinite(maxPortKw)) return "unknown";
  if (maxPortKw <= 22) return "le-22";
  if (maxPortKw <= 60) return "23-60";
  if (maxPortKw <= 120) return "61-120";
  if (maxPortKw <= 180) return "121-180";
  return "gt-180";
}
```

| Tier | Interval | IN Stations in `p/01`, verification only |
|---|---:|---:|
| `le-22` | ≤22 kW | 173 |
| `23-60` | >22–60 kW | 261 |
| `61-120` | >60–120 kW | 221 |
| `121-180` | >120–180 kW | 25 |
| `gt-180` | >180 kW | 11 |
| `unknown` | source did not report strongest-port power | 19 |
| **total** | | **710** |

> **Re-scoped 2026-08-19.** This column previously read 1,056 / 2,523 / 1,834 / 575 / 172 /
> 220, total **6,380** — a different corpus from the package the app opens. The loaded
> package (`web/public/data/p/01/`, `exported_utc = 2026-08-11T19:09:19+00:00`) has **710** IN
> Stations and 229 BUFFER. The counts above were re-measured on `stations.parquet` with the
> `powerTierOf` cuts as written in the code block, and they are the numbers Phase 5’s Supply
> presets are verified against (`web/test/presets.test.ts` §7.6-34). A verification table
> naming a corpus that is not shipped verifies nothing.

These breaks are `presentation` thresholds aligned with the observed nameplate modes. They
are not adequacy limits and must not be labeled slow, fast, rapid, or ultra-fast without a
separate approved domain standard.

| Contract item | Decision |
|---|---|
| **INPUT DATA** | Loaded `stations.parquet`: `station_id`, `scope`, `power_kw_max_port`, `power_kw_site`, `n_ports`, `current_type`. Aggregate only `isInScope(scope)`. |
| **TRANSFORMATION** | Apply `powerTierOf()` exactly once in the Station loader/model boundary and attach `powerTier` to the immutable Station row. |
| **AGGREGATION** | Per tier: Station count (bar length), share of all IN Stations, known installed-port sum, and known site-power sum. Do not make ports or site kW the bar length. |
| **FILTER SEMANTICS** | Tier controls toggle a categorical `in` SUBSET filter on Station `power-tier`. Multiple taps build one set. Selecting no tier or every tier canonicalizes to no filter. `unknown` is a selectable explicit value. |
| **NULL HANDLING** | Null/non-finite `power_kw_max_port` becomes the `unknown` category, not 0 kW. Missing `n_ports` or `power_kw_site` does not remove a Station from its known power tier; tooltip subtotals state their missing counts. |
| **UNIT** | Category labels: kW at the strongest installed port per Station. Bar axis: public IN Station count. Tooltip context: installed ports and site kW, clearly labeled as different measures. |
| **DOMAIN** | Ordered tiers low to high, followed by `unknown`. Bar domain `[0, max tier Station count]`, shared by every row. |
| **AXIS** | Horizontal bars. X: integer Station count, zero-based. Y: direct interval labels; no categorical color legend separate from the labels. Unknown uses hatch/neutral ink. |
| **TOOLTIP** | Interval definition, Station count/share, sum of known installed ports, sum of known site power, and missing subtotal counts. No performance/adequacy adjective. |
| **MAP INTERACTION** | The filter subsets the IN analytical Station points in Supply. BUFFER Stations remain only as neutral context if that overlay is enabled. No automatic zoom or fit. |
| **SELECTION INTERACTION** | A tier is not a Station selection. Existing Station selection persists and may be outside the subset. Clicking an individual map Station continues to use `EntitySelection`. |

### 1.4 Access → Access Curve

Chart ID: `access-population-curve`

| Contract item | Decision |
|---|---|
| **INPUT DATA** | Loaded in-boundary H3 Cell inputs: `population`, `dist_station_network_m`. Use network distance only. |
| **TRANSFORMATION** | Keep rows with positive known population. Split them into measured distance and unknown distance. Sort measured rows by distance; coalesce equal distances; compute cumulative population. Thin the rendered polyline to at most 400 points after computing exact totals. |
| **AGGREGATION** | At distance `d`, `share_all(d) = population with known distance <= d / all known population`. Also expose `population_measured`, `population_unmeasured`, and the measured-population weighted P99 distance. Unlike the current curve, the endpoint may be below 100%; that gap is the unknown-distance population. |
| **FILTER SEMANTICS** | Read-only in Phase 4. It emits no filter because its observations are H3 Cells while the approved/default Access map field is Road. Applying one threshold to two different geometries would be an undeclared crosswalk. |
| **NULL HANDLING** | Null network distance contributes to `population_unmeasured` and never enters the curve at 0 or infinity. Null population is separately counted and excluded from both numerator and denominator; current schema has none. Exact zero population adds no curve mass. |
| **UNIT** | X: km along the public-drivable road network. Y: percent of all population in the loaded dataset confirmed within the radius. |
| **DOMAIN** | X: `[0, max(2 km, measured-population weighted P99 distance)]`. The remaining measured tail is stated below the chart with its farthest distance. Y: fixed `[0, 100%]`. |
| **AXIS** | X uses one unit for the entire axis, normally km; never minutes. Y is 0–100%. A 2 km domain-rule hairline and one direct callout are always present when data exists. |
| **TOOLTIP** | Radius, confirmed population and share within it, measured population outside it, and population with unknown distance. The 2 km tooltip labels the cutoff as a rule, not a distribution-derived break. |
| **MAP INTERACTION** | None in Phase 4. Hover remains local to the chart and does not dim, filter, recolor, or zoom the map. The existing `beyond2km` overlay remains an independent explicit control. |
| **SELECTION INTERACTION** | None. The curve neither selects a Cell nor clears the current entity selection. |

The missing cross-geometry interaction is deliberate. A later phase may add it only after
declaring a Road↔Cell mapping and testing that both sides answer the same predicate.

### 1.5 Utilization → Heatmap 7×24

Chart ID: `utilization-week-heatmap`

| Contract item | Decision |
|---|---|
| **INPUT DATA** | IN Stations with `station_code`, installed `n_ports`, and 168-hour rows `dow`, `hour`, `occ`, `observed_h`. BUFFER Stations are excluded from chart aggregation and coverage denominators. |
| **TRANSFORMATION** | For Station `s`, hour `t`, a value exists only when `n_ports > 0`, `observed_h >= 1`, and `occ` is known; value is `occ / n_ports`. Reuse `stationOccAt()`. |
| **AGGREGATION** | Per week-hour, `util = Σocc / Σn_ports` over contributing IN Stations. Also compute contributing Station count, contributing port count, all-IN installed-port count, and port-weighted observed hours. Do not average Station percentages. |
| **FILTER SEMANTICS** | No analytical filter. Clicking a cell emits a `TimeCursorSet` event. Remove the Phase 4 heatmap window brush from `AnalysisFilter`; a playback window is a time-control feature, not a subset of Stations. |
| **NULL HANDLING** | No contributing Station yields null/hatch. A computed 0 is observed idle and uses the lowest data color. A Station with missing/non-positive ports or observation below 1 hour does not contribute and is counted in tooltip coverage. |
| **UNIT** | Percent occupied installed ports, port-weighted, at a week-hour. |
| **DOMAIN** | Value domain `[0, 1]`. The class breaks are computed once from every valid Station-hour in the loaded dataset and shared with the Station map for all 168 hours. Do not rescale per cell, day, or selected time. |
| **AXIS** | X: 0–23 hours with 0/6/12/18 labels. Y: T2–CN. The current hour has a high-contrast outline independent of data hue. |
| **TOOLTIP** | Day/hour, utilization percent or explicit missing reason, contributing Stations/ports, all-IN installed ports, and port-weighted observed hours. |
| **MAP INTERACTION** | `TimeCursorSet(t)` recolors the Utilization Station layer through the shared accessor and fixed scale. It does not subset Stations, move the camera, or query DuckDB. |
| **SELECTION INTERACTION** | Time change preserves Station/Cell/Commune selection. If a Station is selected, its Inspector hero and mini-heatmap current-hour outline update from the same `t`; neither dispatches `t` back. |

For manifest-disabled Utilization datasets, render the disabled reason and no heatmap. A
nearly empty heatmap must not be rendered as evidence of low use.

### 1.6 Opportunity → Commune Rank Bars

Chart ID: `opportunity-commune-rank`

The ranked measure is not `screen_margin_m` and is not `screen_decision`. It is the
published Opportunity evidence `pop_beyond_2km`, aggregated to Commune as a lower bound:

```text
known_beyond_2km = Σ population where dist_station_network_m > 2000
known_within_2km = Σ population where dist_station_network_m <= 2000
unknown_distance = Σ population where dist_station_network_m is null
total_population = known_beyond_2km + known_within_2km + unknown_distance
```

| Contract item | Decision |
|---|---|
| **INPUT DATA** | `grid_h3_r8.parquet`: `commune_code`, `commune_name`, `population`, `dist_station_network_m`, grouped within the loaded dataset. Commune geometry/name resolution remains dataset-scoped. |
| **TRANSFORMATION** | Derive the four additive populations above and distance coverage. `rank_value = 0` for a zero-population Commune; null when population is missing or a positive-population Commune has no measured distance; otherwise `known_beyond_2km`. |
| **AGGREGATION** | Rank descending by `rank_value`. Render the top 10 ranks plus the selected Commune pinned below when it is outside the top 10. Use competition rank for ties; `commune_code` is only a stable render tiebreaker and never changes the displayed rank. |
| **FILTER SEMANTICS** | None. A rank row is an entity navigation control, not a predicate over all Communes. |
| **NULL HANDLING** | Null ranked values are excluded and counted. Partial unknown distance does not make the lower bound null; it must appear beside the bar as unknown population/coverage. Do not silently sum null distance into either side of 2 km. |
| **UNIT** | Bar: known persons beyond 2 km by network in the Commune. Coverage: percent of Commune population with measured distance. |
| **DOMAIN** | Shared linear bar domain `[0, maximum rank_value among all Communes]`, anchored at zero. Never scale each row or the pinned selection independently. |
| **AXIS** | Horizontal bars with direct Commune names and one shared value scale, formatted once as persons or thousands of persons. No low-end table: zero/near-zero is not proof of no opportunity when distance may be unknown. |
| **TOOLTIP** | Commune name/code, displayed rank and tie size, known population beyond 2 km, known population within 2 km, unknown-distance population, total population, and distance coverage. Wording includes `chặn dưới`. |
| **MAP INTERACTION** | Row activation emits dataset-scoped `EntitySelectionSet({kind: "commune"})`. The map draws the normal Commune selection layer. It does not filter analytical H3 marks or change the active field. |
| **SELECTION INTERACTION** | Selection is bidirectional state, not a bidirectional event. Map selection updates the controlled `selectedCommuneId`; the chart highlights/pins it without dispatch. Row activation does not zoom. The Inspector's explicit `Phóng tới xã/phường` CTA remains the camera action. |

### 1.7 Secondary-chart decision

Phase 4 renders exactly one primary chart at a time. Secondary charts do not share the
primary slot and are not loaded eagerly.

| Existing chart/view | Decision | Reason |
|---|---|---|
| `SupplyLorenz` | Keep as collapsed, read-only Supply secondary after primary acceptance | It answers a genuinely different question: concentration of ports relative to population, not charger power composition. |
| Demand × Access `Scatter` | Keep code; defer UI activation | It identifies populous/far Cells, but its old two-axis brush would reintroduce a second filter shape before the one-filter migration is complete. If restored, it belongs to Opportunity evidence and starts read-only. |
| `HourProfile` | Keep as a marginal companion inside Utilization, not a sixth primary chart | Position exposes a daily rhythm that the fixed shared color scale can compress. It reads the same 168-cell model and emits only `TimeCursorSet`. |
| Station `MiniHeatmap` | Keep in Inspector evidence | It answers one selected Station, not the lens-wide population. |
| Generic Histogram for Supply/Access/Utilization/Opportunity | Remove from primary UI | It duplicates or contradicts the approved mapping and often counts the wrong entity for the business question. |
| Generic two-ended `RankBars` | Replace in Opportunity primary | The low end is not useful for a one-sided lower-bound opportunity measure; zero can coexist with unknown distance. |
| Heatmap window brush | Remove from Phase 4 primary | It controls playback time, not an analytical subset, and therefore does not belong to the filter contract. |

## 2. FILTER CONTRACT

### 2.1 One meaning

**Filtering means SUBSET.**

- Included analytical entities participate in the analytical map layer and filtered
  readouts.
- Excluded analytical entities do not participate and are not rendered as grey analytical
  marks.
- Context layers, selection layers, boundaries, and Inspector identity are not filtered.
- Filter never moves the camera.
- Filter never creates or clears an entity selection.
- Filter never changes `t`.
- Hover is transient local UI and is never serialized as a filter.

The UI must show a persistent filter summary with predicate, `kept/eligible/total`, excluded
null count, and a clear action. Without that summary, hidden analytical marks could be
misread as absent data.

### 2.2 Typed contract

```ts
export type AnalysisFilter = Readonly<
  | {
      version: 1;
      mode: "subset";
      datasetId: DatasetId;
      entity: "h3-cell";
      field: "population";
      op: "between";
      lo: number;
      hi: number;
      missing: "exclude";
      source: "demand-population-histogram";
    }
  | {
      version: 1;
      mode: "subset";
      datasetId: DatasetId;
      entity: "station";
      field: "power-tier";
      op: "in";
      values: readonly PowerTierId[];
      missing: "explicit-category";
      source: "supply-power-tier-breakdown";
    }
>;

export interface FilterState {
  active: AnalysisFilter | null;
  /** Increments only when the canonical semantic filter changes. */
  revision: number;
}
```

There is one active filter, not an array of unrelated clauses. Phase 4 does not preserve
the old simultaneous histogram + scatter + time-window AND state.

### 2.3 Canonicalization and compatibility

`canonicalFilter()` runs in the controller/reducer before state is written:

- range bounds must be finite and are reordered so `lo <= hi`;
- tier values are deduplicated and sorted in registry order;
- an empty tier set or the complete six-tier set becomes `null`;
- a filter for another `datasetId` is invalid;
- semantically equal filters return the existing state object and do not increment
  `revision`;
- Demand range is compatible only with the Demand Cell analytical family;
- Supply tier is compatible only with the Supply Station analytical family;
- dataset change always clears the filter;
- incompatible lens/geometry change clears the filter once in the transition reducer and
  reports why in the filter summary/live region;
- entity selection remains untouched by every compatibility decision.

The URL keeps one `b` key and writes exactly one of these versioned canonical forms:

```text
b=f1~h3-cell~population~between~<lo>..<hi>
b=f1~station~power-tier~in~<tier>[.<tier>...]
```

Bounds are finite decimals written **losslessly**: the serializer emits the shortest decimal
string that reads back as the identical double, so `parse(serialize(b)) === b` and the subset
reached through a link is the subset that was brushed.

> **Corrected 2026-08-19.** This paragraph previously required "the existing four-decimal
> formatter", and that requirement was a defect. `Number(v.toFixed(4))` lowered 2 140 and
> raised 2 125 of the 4 400 `population` values in `p/01`; because `filterKeepsCell` is
> inclusive at both ends and brush bounds are actual cell values (§1.2), a `[0, v]` brush lost
> its boundary cell for 2 140 of those values and a `[v, max]` brush for 2 125 — silently, and
> only ever shrinking the subset. Rounding existed to make the `hashchange` write↔read loop
> converge (§9a); lossless writing converges on the first pass instead of the second, so the
> original constraint is strengthened, not traded away. Regression: `P4-SER` in
> `web/test/filter.test.ts`.

Tier IDs
are unique and registry-ordered. `URLSearchParams` owns percent encoding; the filter parser
does not parse raw `&`, `+`, or percent escapes itself. The parser may normalize legacy
`h:population:<lo>..<hi>` to the Demand range. Legacy scatter/window clauses are ignored
individually: scatter is not a Phase 4 primary filter, and a time window cannot be
losslessly represented as an analytical subset. Serialization always writes the new form.

### 2.4 Feedback-loop prevention

The required dataflow is one-way:

```text
user gesture
  → chart intent
  → reducer canonicalizes filter
  → immutable filter state/revision
  → memoized derived subset + chart controlled state
  → MapView/chart render
```

Hard rules:

1. Charts emit only from pointer/keyboard event handlers.
2. No chart has `useEffect(() => onFilter(...))` or an equivalent render-derived dispatch.
3. Derived-data builders are pure and cannot import the store or dispatcher.
4. A semantically identical filter is a reducer no-op.
5. The chart receives `activeFilter` as controlled state and renders it; receiving it never
   emits it.
6. Live drag may rerender the chart locally but does not mutate global state until commit.
7. Filter commit performs no DuckDB query; it subsets the cached immutable entity rows.

## 3. EVENT MODEL

### 3.1 State ownership

```ts
interface AnalysisState {
  datasetId: DatasetId;
  fieldId: string;                 // lens remains derived from field
  filter: FilterState;
  selection: EntitySelection | null;
  timeCursor: number;              // 0..167
  view: View;
}
```

No `chartSelection`, `mapSelection`, `selectedTier`, `selectedCommune`, or second time state
is added. Chart-specific controlled state is derived from these domain states.

### 3.2 Intents and effects

| Intent | Emitted by | State changed | Explicitly unchanged |
|---|---|---|---|
| `FilterReplace(filter)` | Demand histogram, Supply tier controls | `filter.active`, maybe `filter.revision` | selection, time, field, camera, data cache |
| `FilterClear(reason)` | Filter summary/clear control | filter only | all other state |
| `TimeCursorSet(t)` | Utilization heatmap/HourProfile/Scrubber | `timeCursor` | filter, selection, camera, loaded profiles |
| `EntitySelectionSet(selection)` | Opportunity row or map mark | `selection` | filter, time, field, camera |
| `EntitySelectionClear(reason)` | Inspector close/Escape/empty map | selection only | filter and chart state |
| `FieldSet(fieldId)` / `LensSelect(lensId)` | Lens/field controls | field and only incompatible filter | valid selection, time, view, caches |
| `ViewSet(view)` | Map gestures or explicit zoom CTA | camera only | chart totals, filter, selection |
| `DatasetResolved(datasetId)` | dataset controller | dataset session and caches; filter cleared; selection revalidated | no stale old-dataset result may publish |

Hover does not enter `AnalysisState`. Tooltips are local and disposable.

### 3.3 Chart-to-map communication boundary

Chart modules do not import `MapView`, `useStore`, DuckDB, `queries.ts`, or layer builders.
They receive models and callbacks:

```ts
interface ChartIntentSink {
  onFilterIntent(intent: AnalysisFilter | null): void;
  onTimeIntent(t: number): void;
  onEntityIntent(selection: EntitySelection): void;
}
```

Each chart receives only the callback it can legitimately use. AccessCurve receives none;
Heatmap receives `onTimeIntent`; Commune Rank receives `onEntityIntent`. The connected
`LensChartController` translates callbacks into reducer intents. `MapView` independently
subscribes to/selects the resulting derived map model.

### 3.4 Async ordering

Every async result is tagged with `{datasetId, requestKey}`. The controller publishes it
only when both still match the active session. Failed Promise-cache entries are removed for
explicit retry; successful snapshots remain immutable until dataset change. Lens, filter,
selection, time, pan, and zoom do not invalidate data requests.

## 4. QUERY PLAN

### 4.1 Dataset-session caches

```ts
interface DatasetChartSession {
  fieldSnapshots: Map<string, Promise<readonly GridCell[]>>;
  stationsCore: Promise<readonly StationChartRow[]>;
  occupancy: Promise<StationOccupancy> | null;
  opportunityCommunes: Promise<readonly OpportunityCommuneRow[]> | null;
  models: Map<PrimaryChartId, unknown>;
}
```

The cache key always begins with `datasetId`. A chart render cannot create this session or
start a request.

### 4.2 Named reads and transformations

#### Q-P4-1 — existing field snapshot, reused by Demand and Access

Use the existing `fetchField(meta)` projection and Promise cache. Population Histogram uses
the `population` field snapshot; Access Curve uses the already-carried `pop` and `dist`.
Neither chart issues a second DuckDB query.

Performance review:

- one Parquet scan already required by the analytical map;
- Parquet column pruning remains effective;
- histogram is two O(N) passes plus 24 bins, no sort;
- access is O(N log N) over positive-population measured rows and is computed once per
  dataset, not once per render;
- current largest province input is 29,763 Cells, suitable for one memoized browser sort;
- filter commit applies O(N) to cached rows and issues zero SQL.

#### Q-P4-2 — Station core, extended once for Supply

Extend the existing `fetchStations()` query rather than adding a Supply query:

```sql
SELECT station_id, station_code, lat, lng, scope, op_status,
       n_ports, current_type, power_kw_max_port, power_kw_site
FROM read_parquet($stations)
WHERE lat IS NOT NULL AND lng IS NOT NULL
ORDER BY station_code
```

`$stations` is a registered, internally chosen dataset path; it is not user input.

Performance review:

- still one Station scan at dataset boot;
- four additional columns add negligible work at the current maximum of 1,017 Station
  rows/package;
- tier classification and six-bin aggregation are O(S) in the immutable loader/model;
- `scope` is preserved so chart aggregation can require IN while map context can retain
  BUFFER;
- no `GROUP BY` query is justified for six output rows when the map already needs each
  Station row.

#### Q-P4-3 — existing occupancy profile, reused by Utilization

Reuse the registry-ordered Q-P4-2 Station snapshot to build the stable Station index; do not
scan `stations.parquet` again inside `fetchOccupancy()`. Keep one raw 168-hour profile
projection and the existing typed arrays. Add an IN mask/index to `OccProfiles`; all
lens-wide coverage and heatmap aggregates iterate only that mask.

Performance review:

- profile is lazy and already required for the Station map, Scrubber, and Inspector;
- reusing Q-P4-2 removes the current second Station query from the Utilization load path;
- a second DuckDB `GROUP BY dow, hour` would duplicate the largest Phase 4 scan and then
  still leave the map without per-Station values;
- current maximum profile is 150,824 rows/package; the flat typed-array representation is
  retained;
- one O(S×168) aggregate produces 168 cells and is cached;
- `TimeCursorSet` calls only accessors; query count stays unchanged for all 168 hours;
- query remains on the existing single-worker queue and is not launched concurrently with
  another DuckDB query through `Promise.all`.

#### Q-P4-4 — Opportunity grid-to-Commune aggregate

This is the only new chart-specific DuckDB transformation:

```sql
SELECT
  commune_code,
  commune_name,
  count(*) AS n_cells,
  count(*) FILTER (WHERE population IS NULL) AS n_population_missing,
  count(*) FILTER (WHERE population IS NOT NULL
                    AND dist_station_network_m IS NULL) AS n_distance_unknown,
  sum(population) AS population_total,
  coalesce(sum(population) FILTER (
    WHERE dist_station_network_m IS NOT NULL
  ), 0) AS population_measured,
  coalesce(sum(population) FILTER (
    WHERE dist_station_network_m <= 2000
  ), 0) AS population_within_2km,
  coalesce(sum(population) FILTER (
    WHERE dist_station_network_m > 2000
  ), 0) AS population_beyond_2km,
  coalesce(sum(population) FILTER (
    WHERE dist_station_network_m IS NULL
  ), 0) AS population_distance_unknown
FROM read_parquet($grid)
WHERE commune_code IS NOT NULL
GROUP BY commune_code, commune_name
```

Performance review:

- one lazy scan only when Opportunity first opens;
- four projected source columns; no geometry, H3 string, latitude, or longitude transfer;
- hash aggregate over at most 29,763 current rows and one province's Communes;
- no join and no window function;
- sorting/ranking occurs on the small returned Commune array in TypeScript;
- query result is cached by dataset, not by selection or field;
- the 2,000 m literal is the existing registered domain threshold and must be imported into
  query construction from one constant, not retyped in SQL and TypeScript;
- all expressions are static. URL/filter strings never enter this query.

Aggregate conservation must hold for non-null population:

```text
population_total
  = population_within_2km
  + population_beyond_2km
  + population_distance_unknown
```

#### Q-P4-5 — no filter queries

Demand and Supply filters operate on immutable loaded Cell/Station arrays. Opportunity row
selection, Utilization time changes, and Access hover do not query. A query spy must observe
zero new SQL statements for every chart interaction after the relevant snapshot is ready.

### 4.3 Render-model derivations

| Model | Complexity | Cache invalidation |
|---|---:|---|
| Population Histogram | O(N + 24), two passes | dataset Population snapshot only |
| Power Tier Breakdown | O(S + 6) | Station core snapshot only |
| Access Curve | O(N log N), render-thinned to ≤400 points | core Cell snapshot only |
| Utilization Heatmap | O(S×168), 168 outputs | occupancy snapshot/IN mask only |
| Opportunity Rank | O(C log C), C = Communes | Q-P4-4 result only |
| Active Cell/Station subset | O(N) or O(S) on committed filter | filter revision + matching entity snapshot |

None depends on camera, hover, Inspector open state, or React render count.

### 4.4 Performance gates

Extend `web/src/bench.ts` with Q-P4-4 and query-count instrumentation. Use the same
single-thread DuckDB-WASM bundle and HTTP range protocol as production.

- Record before/after p50 and p95 for unchanged Q1 field-scan and Q4 profile-scan queries on
  the same artifact/browser run. A regression must be explained with its query/row/byte
  delta; do not invent a percentage tolerance before a baseline distribution exists.
- Q-P4-4 performs exactly one Parquet scan, returns no more rows than the dataset's Commune
  count, and its warm p95 must not exceed the existing Q1 full-field snapshot p95 on the
  same package/run. If it does, inspect the plan before acceptance rather than masking it
  with a larger arbitrary threshold.
- A committed filter and every cached chart-model derivation must produce no browser Long
  Task (≥50 ms) on the largest current province package, excluding deck.gl draw.
- `TimeCursorSet` model work must remain inside one 60 Hz frame after profile load.
- Lens revisit, filter edit, selection, scrub, pan, zoom, and chart hover issue zero queries.

The structural and relative gates are deliberate: absolute HTTP/DuckDB-WASM milliseconds
depend on browser, cache, and test hardware. The benchmark records p50/p95, query count,
rows returned, and artifact sizes so the review remains evidence-based.

## 5. COMPONENT PLAN

### 5.1 Registry

Add one lens-level primary chart declaration:

```ts
export type PrimaryChartId =
  | "demand-population-histogram"
  | "supply-power-tier-breakdown"
  | "access-population-curve"
  | "utilization-week-heatmap"
  | "opportunity-commune-rank";

interface LensMeta {
  // existing members...
  primaryChart: PrimaryChartId;
}
```

Registry invariants:

1. exactly five lenses and five unique primary chart IDs;
2. every chart ID resolves to one presenter/model builder;
3. chart input dependencies are declared once;
4. a primary chart cannot be registered on `FieldMeta`;
5. unavailable dependencies produce a typed unavailable state, not an empty chart.

### 5.2 Modules and ownership

| Module/component | Owns | Must not own |
|---|---|---|
| `state/filter.ts` | `AnalysisFilter`, canonicalization, predicate, hash wire compatibility | React, chart bins, MapView, queries |
| `state/analysis-events.ts` | typed intents and idempotent reducer actions | derived data, markup |
| `viz/chart-contracts.ts` | chart IDs, dependency metadata, power-tier registry | store reads, data loading |
| `viz/chart-models.ts` | pure memoizable model builders and lower-bound semantics | effects, dispatch, MapView |
| `data/chart-session.ts` | dataset-scoped Promise caches and Q-P4-4 | chart markup, filter dispatch |
| `LensChartController` | select active model/state, bind allowed callbacks | chart drawing, map layers, SQL strings |
| `PrimaryLensChart` | exhaustive chart-ID routing only | store, queries, formulas, map calls |
| chart presenters | axes, marks, tooltip, keyboard handlers, emit user intent | store import, query, effects that dispatch |
| root/App selector | build filtered analytical arrays and filter summary | chart drawing |
| `MapView` | render already-derived analytical/context/selection layer inputs | filter canonicalization, chart dispatch, query |

`PrimaryLensChart` follows the same shallow-router rule as Phase 3 `EvidenceSection`.

### 5.3 Presenter changes

- Replace generic primary `Histogram` with `PopulationHistogram`; retain generic bin helpers
  only if they remain pure and tested.
- Add `PowerTierBreakdown` using HTML buttons/bars for truncatable labels, title text, and
  keyboard toggling.
- Update `AccessCurve` to use all-population denominator and make it explicitly read-only.
- Update `Heatmap168` to remove `WindowBrush` props and accept only controlled `t` plus
  `onTimeIntent`.
- Replace generic Opportunity use of `RankBars` with `OpportunityCommuneRankBars`: top-only,
  tie-aware, selected-row pinning, coverage/unknown evidence.
- Keep `HourProfile` immediately below Heatmap as the same model's marginal companion.
- Replace `<Dock ... view="distribution" />` in `AtlasReadColumn` with the exhaustive lens
  chart route and a persistent `FilterSummary`.

### 5.4 Map integration

The root produces four independent layer inputs:

```ts
const layerInput = {
  analytical: deriveAnalyticalSubset(baseAnalytical, filter.active),
  context: contextRows,
  overlays: overlayRows,
  selection,
};
```

Layer builders remain pure. Selection renders above analytical/context layers even when its
entity is outside the filter. The Inspector gets `outsideActiveSubset: boolean` from the
controller; it does not infer that state from whether a mark happens to be visible.

### 5.5 Migration

1. Introduce the new filter parser/reducer behind tests.
2. Normalize only compatible legacy population histogram hashes.
3. Wire primary charts read-only to verified models.
4. Enable Demand/Supply filter intents and filtered map arrays.
5. Remove `BrushState.hist`, `scatter`, and `win` from active UI paths after hash migration.
6. Make occupancy coverage/aggregate functions accept the IN mask.
7. Remove the hard-coded distribution Dock route.
8. Keep old secondary components unmounted until their Phase 4 decision above is applied.

No commit or data-export schema migration is required for the primary implementation.

## 6. ACCEPTANCE TESTS

### 6.1 Registry and routing

1. Exactly five canonical lenses resolve to the five approved primary chart IDs.
2. `PrimaryLensChart` is exhaustive; adding a chart ID fails compilation until routed.
3. Changing fields inside a lens does not silently change its primary chart.
4. A missing dependency renders a typed unavailable reason and never an empty “zero” chart.

### 6.2 Data and transformation contracts

5. Population zero enters only the exact-zero bucket; null enters no bin.
6. Population histogram bins cover every non-null row exactly once, including the maximum.
7. Histogram filter bounds are raw population values despite log-positioned bars.
8. Every finite known `power_kw_max_port` maps to exactly one ordered tier; null maps only
   to `unknown`.
9. Power tiers use `power_kw_max_port`; changing only `power_kw_site` cannot change tier.
10. Supply totals include IN and exclude BUFFER. Adding a BUFFER fixture changes no bar.
11. Access curve is monotone; at its farthest measured point it ends at
    `population_measured / population_total`, not forced 100%.
12. Null distance population changes the Access unknown total but no curve point.
13. Utilization uses `Σocc/Σports`, not the average of Station percentages.
14. Utilization known zero differs from null and observation below one hour.
15. BUFFER Station fixtures change neither Heatmap values nor its coverage denominator.
16. Opportunity aggregate satisfies population conservation per Commune.
17. A positive-population Commune with no measured distance has null rank; a partial-unknown
    Commune has a lower-bound value plus a nonzero unknown count.
18. Tied Opportunity Communes display the same competition rank; code ordering is not shown
    as a data rank.

### 6.3 Filter semantics and loop safety

19. `AnalysisFilter` accepts only `mode: "subset"`; highlight/hide/zoom variants are not
    representable.
20. At most one active filter is representable.
21. Applying the same canonical filter twice preserves object identity/revision on the
    second action.
22. Demand/Supply filter commit changes analytical subset and readout only; selection,
    time, field, overlays, and camera are unchanged.
23. Filtered-out analytical marks are absent from the analytical layer; there is no muted
    excluded analytical layer.
24. Context and selection layers remain visible under a filter.
25. A selected entity outside the subset remains selected and the Inspector reports that
    fact.
26. Rendering a chart with an active controlled filter emits zero events.
27. Pointer drag emits zero global events until commit and exactly one `FilterReplace` on
    commit.
28. Incompatible lens/dataset transitions clear once in the controller; no chart effect
    performs the clear.
29. New hash values round-trip canonically; a legacy population histogram clause
    normalizes; malformed/legacy unrelated clauses are dropped independently.

### 6.4 Event separation

30. Heatmap click changes only `timeCursor`; filter revision and selection are unchanged.
31. Opportunity row activation changes only dataset-scoped Commune selection; filter and
    camera are unchanged.
32. Map Commune selection updates chart highlighting/pinning without causing the chart to
    dispatch the same selection.
33. Hovering any chart changes no application state and serializes nothing.
34. Pan/zoom changes no chart model, chart total, filter, or query count.
35. Lens transition preserves valid Phase 3 selection and cached data.

### 6.5 Query lifecycle and performance

36. Demand and Access primary charts add zero queries beyond the cached field snapshot.
37. Supply adds columns to the existing Station read and adds no second Station scan.
38. Utilization reuses the Station core snapshot and loads the profile once; visiting all
    168 hours does not change query count.
39. Opportunity issues Q-P4-4 at most once per dataset session, including lens revisit and
    selection changes.
40. Filter edit, filter clear, chart hover, entity selection, time scrub, pan, and zoom each
    issue zero SQL statements after dependencies resolve.
41. Failed cached requests are retryable; successful requests are immutable and reused.
42. A stale prior-dataset result cannot publish into the active dataset session.
43. Extended `bench.ts` passes the relative p95 and interaction budgets in §4.4.

### 6.6 Visual, tooltip, and accessibility

44. Every chart prints its unit on-axis or in direct labels; tooltips never supply the only
    unit.
45. Power tier tooltip distinguishes strongest-port kW, site kW, and installed ports.
46. Access never displays minutes and never substitutes Euclidean distance.
47. Opportunity copy contains `đã xác nhận`/`chặn dưới` when unknown-distance population
    exists and never says “opportunity score.”
48. Utilization unavailable provinces show the manifest reason instead of a low-use color.
49. Null/hatch, known zero, active time outline, active filter control, and entity selection
    remain visually distinct in light/dark supported themes.
50. Every pointer action has an equivalent focus/keyboard action; tier controls expose
    pressed state, histogram exposes an accessible range control, heatmap cells expose
    day/hour/value, and rank rows are buttons.
51. Charts fit `CHART_W` at 320/340 px read-column widths and the existing mobile Sheet,
    with no clipped tooltip or horizontal overflow.
52. Reduced-motion mode disables nonessential transitions without removing state cues.

### 6.7 Acceptance gate

Phase 4 is accepted only when all five primary charts implement every row of their contract,
the filter is observably subset-only, chart/map/selection/time events remain distinct, and
tests prove that derived rerenders cannot redispatch an unchanged filter. No primary chart
interaction may issue a DuckDB query after its dataset snapshot is ready.

**PHASE 4 SPEC READY**
