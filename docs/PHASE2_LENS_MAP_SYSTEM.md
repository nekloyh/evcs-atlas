# Phase 2 — Five Lens Map System

Status: **PHASE 2 SPEC READY**  
Scope: map workspace, lens/field registry, layer composition, legends, inspection, and
dataset-query lifecycle.

## 1. Product decision

The user-facing map has exactly five lenses:

`Demand` · `Supply` · `Access` · `Utilization` · `Opportunity`

`Policy` is not a lens. Its screening outputs are rule evidence under Opportunity.
`Context` is not a lens. POI, land-cover, administrative boundaries, and station status
remain contextual evidence/overlays and never acquire a competing analytical ramp.

The selected `fieldId` remains the only analytical state. The active lens is always derived
with `lensOfField(fieldId)`; do not introduce `activeLens` state or another hash key.

## 2. Verification against the published data

Verification used the 34 published province artifacts in `web/public/data/p/*`, exported
2026-08-11, plus the schema/rule definitions in `docs/COT.md`, `src/evcs/core`, and
`src/vn`. National grid counts below contain 425,778 in-boundary H3 r8 cells. In-scope
station counts exclude buffer duplicates; road/profile row counts describe the published
province files and must not be summed as unique national entities without applying scope.

| Contract checked | Actual published data | Phase 2 consequence |
|---|---:|---|
| Demand `population` | 425,778 values; **0 null**; 111,096 exact zeros (26.1%); 0–73,861 persons/cell | Zero must get a real zero class. The existing 5% zero-share trigger fires, but it is a presentation rule, not a demand threshold. |
| Supply `stations.n_ports` | 6,380 in-scope stations; **217 null** (3.4%); known values 1–256; no known zero | Missing ports use an open/unknown point. Do not coalesce to zero or scale point radius by ports. |
| Access `roads.dist_station_m` | 1,897,699 rows; **16,545 null** (0.87%); known values 0.45–129,540 m | Null road segments require neutral ink; they must not enter the nearest-distance class. |
| Access `dist_station_network_m` evidence | 425,778 cells; **94,530 null/unreachable** (22.2%); known values 18–148,544 m | Nationwide Access cannot inherit Hanoi's near-complete coverage assumption. Null is a first-class legend category. |
| Utilization `station:occ` inputs | 1,013,450 stored station-hour rows; 941,252 pass `observed_h >= 1` and known positive `n_ports`; derived ratios are 0–1 | Compute `occ / n_ports` through `stationOccAt()` only. Keep one weekly scale; zero is observed idle, not missing. |
| Utilization layer usability | Four provinces are flagged `KHONG_DO_DUOC_SU_DUNG`: 04, 11, 12, 14 | Keep the province available but disable Utilization with the manifest/QA reason. A nearly empty ramp must not look like low use. |
| Utilization `util_cell` evidence | 4,840 of 425,778 cells non-null (1.14%); 58 exact zeros | It is an inspect-only station-cell aggregate, not a whole-grid utilization surface. |
| Opportunity `screen_margin_m` | 425,778 values; **0 null** in the current export; 31,610 below 0, 394,168 above 0, none exactly 0 | Preserve the contract for future nulls. Use a diverging scale pinned at 0; quantiles are computed separately on each side. |
| Opportunity `pop_beyond_2km` | 94,530 null/unreachable; 72,109 known zero; 259,139 positive | Null, known-within-2-km zero, and positive underserved population are three different states. |

These figures verify the current export; they are not constants for UI copy. Runtime counts
and percentages continue to come from the loaded manifest/scale.

## 3. Implementation-ready Lens Matrix

| Lens | Primary field | Unit | Null semantics | Map encoding | Scale type | Thresholds and provenance | Legend | Overlays | Inspectable entities |
|---|---|---|---|---|---|---|---|---|---|
| Demand | `population` | persons per H3 r8 cell (~0.74 km²) | Current export has no null. Zero means measured/allocated zero population. | H3 fill with one sequential Demand ramp. Demand representations are view modes, not lenses; any secondary supply mark in a hybrid view is a declared overlay, not another analytical ramp. | Equal-cell quantile classes for H3, with a separate zero class when the presentation rule fires. The optional continuous surface uses its separately declared equal-population contour classing. | Quantile breaks and `ZERO_SHARE_THRESHOLD = 0.05` are **presentation** thresholds. No demand adequacy threshold exists. | “Population”; persons/cell; true break values; explicit `{0}` class; open-ended last class; no null swatch while `nNull = 0`. | Stations, communes, `beyond2km`, POI/context, boundary. Overlays retain cold/ink semantics. | Primary: H3 cell, commune. Contextual selection retained for station, road, and POI. Evidence: population, density, apartments. |
| Supply | `station:ports`; secondary H3 `n_ports` / `n_stations` | installed public charging ports (or stations for that selected field) | Station `n_ports = null` means the source did not report installed ports. H3 aggregate zero means no known in-cell supply. Neither state may be substituted for the other. | Fixed-radius station points colored by installed ports. Aggregate H3/commune fields use one sequential Supply ramp. Point size is not a value channel. | Data-derived quantile classes over known values; per loaded dataset and selected geometry. | Quantile breaks are **presentation** thresholds. There is no verified “adequate supply” cutoff. `OPERATIONAL` is categorical status, not a numeric threshold. | “Installed ports”; ports/station; true breaks; open point = unknown ports; neutral wording (“more/less”), never “adequate”. | Station status, communes, `beyond2km`, POI/context, boundary. Suppress the ordinary station overlay while stations are the analytical geometry. | Primary: station, H3 cell, commune. Road/POI remain inspectable as contextual selections. |
| Access | `road:dist_station_m`; secondary H3 `dist_station_network_m` | metres along the public-drivable road network | Road null means the segment is outside the reachable public-drivable network. H3 null means no valid route from the cell access point to a station. It is neither 0 nor “very far”. `detour_ratio` also distinguishes not-applicable below 200 m from unreachable. | Road line ramp for the primary field; H3 sequential high-adversity ramp for cell distance; neutral ink/hatch for null. Fixed line width by zoom only. | Data-derived quantile classes over known distance values. | `2 km` is a **domain/planning** service threshold used by `beyond2km` and the access curve; it was not inferred from the distribution. Showing its marker is presentation, but the underlying cutoff remains domain. `200 m` for detour applicability is a **data** threshold grounded in ratio instability. Quantile breaks and zoom/LOD breaks are **presentation**. Never introduce minute thresholds: no validated travel-time field is published. | “Distance to nearest station · by road”; metres/km; dark = farther; explicit unreachable category. Show the 2 km marker only where the overlay/comparison uses it. | `beyond2km`, stations, communes, boundary; story-only bridges/routes. | Primary: road segment, H3 cell, commune. Station is access evidence; selected POI remains contextual. |
| Utilization | `station:occ` at selected week-hour; H3 `util_cell` is inspect-only | occupied ports divided by installed ports; display as percent | Missing 168h profile, `observed_h < 1`, or missing/non-positive installed-port denominator means unknown/open point. A computed 0 is observed idle. `util_cell` is null where no measured station contributes. | Fixed-radius station points colored by utilization. Scrubbing changes accessors only; empty points remain visible and clickable. | One quantile scale computed once from every valid value across all 168 hours for the loaded dataset, reused at every hour. | `observed_h >= 1 h` is a **data** measurement-quality threshold: the pilot variance crossover is ~0.588 h, rounded to the first full observed hour. It is data-driven but only pilot-calibrated; retain the caveat until national revalidation. `40%` is not a Utilization class break—it is a **domain** screening exception used only by Opportunity evidence. Quantile breaks are **presentation**. | “Port utilization”; percent; fixed-week scale; open point = unknown at this hour; state the 1 h gate and denominator. Dark means busier, not automatically “bad”. | Station status, communes, boundary. No overlay may recolor analytical station points. | Primary: station. H3/commune provide aggregate evidence. Cell, road, and POI selections remain contextual and are not cleared. |
| Opportunity | `screen_margin_m`; secondary `pop_beyond_2km`; `demand_supply_gap` remains non-map | metres from the base screening cutoff; persons beyond 2 km by network | Margin null means the base rule could not run; current export happens to have none. It is a **base-rule margin**, not the final decision because the DC/high-load exception is separate. `pop_beyond_2km` null means network distance unknown; zero means known within 2 km. | Margin uses the sole diverging ramp, pinned at 0: below = “chưa đủ xa”, above = “đủ xa”. Underserved population uses a sequential high-need ramp. Never blend the two into an unnamed score. | Three data-derived quantile classes on each side of the fixed 0 boundary. `pop_beyond_2km` uses zero-aware sequential quantiles. | `500 m` (Phường/Đặc khu), `2,000 m` (Xã), the 500 m exception floor, `40%` high-load exception, the derived `0 m` margin boundary, and the `2 km` underserved cutoff are **domain** thresholds. None was inferred from current map distributions. Quantile breaks are **presentation**. `demand_supply_gap` coefficients are an unvalidated proposed model, not thresholds; keep `map: false` pending versioning, outcome validation, and sensitivity tests. | Margin legend: diverging, zero hairline, both end labels, and “base rule” wording. Never label margin sign as final `TỪ CHỐI/ĐỀ XUẤT`. Population-gap legend: “known population beyond 2 km”, not “opportunity score”. | Stations, `beyond2km`, station status, communes, POI/context, boundary; screening-rule details. | Primary: H3 cell, commune. Station/road expose rule inputs. POI remains contextual; all valid selections persist. |

## 4. Threshold provenance contract

Every registry threshold has exactly one `kind`:

- `data`: derived from observed data, measurement uncertainty, or an applicability limit.
- `domain`: chosen by a planning/business rule. It may be authoritative without being
  empirically calibrated.
- `presentation`: affects legibility/classing/LOD only and must never be described as a
  planning conclusion.

The same number can participate in two acts without acquiring two kinds. For example,
2 km remains a domain cutoff; drawing a 2 km marker is a presentation choice. Store the
threshold once and let the legend decide whether to show it.

Required threshold inventory:

| Threshold | Kind | Applies to | Source / confidence |
|---|---|---|---|
| Dynamic quantile breaks | `presentation` | all numeric ramps | recomputed from the loaded field; never persisted as domain truth |
| 5% zero-share trigger | `presentation` | zero-aware numeric classing | `viz/palette.ts`; separates a common real zero from positive values |
| Zoom/LOD breaks | `presentation` | geometry legibility | render-plan/design tokens; never shown as a data threshold |
| `observed_h >= 1 h` | `data` | `station:occ` availability | pilot variance crossover 0.588 h; national revalidation still required |
| detour denominator distance `>= 200 m` | `data` | `detour_ratio` applicability | `core.roadgraph.DETOUR_MIN_EUCLID_M`; below it access-offset noise dominates |
| 2 km network service cutoff | `domain` | `beyond2km`, `pop_beyond_2km`, access curve | existing planning/data contract; not distribution-derived |
| 500 m / 2,000 m base screening cutoffs | `domain` | `screen_margin_m`, `screen_decision` | customer rule in `core.screening`; Đặc khu=500 m is explicitly an inference |
| 500 m exception floor / 40% high-load cutoff | `domain` | `screen_decision` only | customer screening rule; 40% must not leak into the Utilization ramp |
| 0 m margin boundary | `domain` | `screen_margin_m` | derived exactly from distance minus the applicable base cutoff |

## 5. One Lens Registry

Replace the independently maintained `LENS_IDS`, `LENSES`, `*_FIELDS` arrays, theme
conditionals, and per-component semantic guesses with one typed registry. `FIELDS`,
`FIELD_BY_ID`, lens selectors, defaults, search groups, legends, and evidence lists are
derived views of this object; none is hand-maintained separately.

```ts
export type LensId =
  | "demand"
  | "supply"
  | "access"
  | "utilization"
  | "opportunity";

export type ThresholdKind = "data" | "domain" | "presentation";
export type EntityKind = "cell" | "commune" | "station" | "road" | "poi";

export interface ThresholdSpec {
  id: string;
  kind: ThresholdKind;
  value?: number;
  unit?: "m" | "h" | "ratio";
  source: string;
  legend: "always" | "when-relevant" | "never";
  label: string;
}

export interface RegistryFieldSpec extends FieldMeta {
  lensId: LensId | null; // null = context/evidence, never a sixth lens
  role: "primary" | "secondary" | "evidence";
  encoding: {
    geometry: "h3" | "commune" | "road" | "station";
    mark: "fill" | "line" | "point";
    layerFamily: string;
  };
  scaleContract: {
    type: "quantile" | "zero-quantile" | "diverging-quantile" | "categorical";
    polarity: "neutral" | "high-adverse" | "high-need";
    palette: "demand" | "supply" | "access" | "utilization" | "opportunity";
  };
  thresholdIds: readonly string[];
  legendContract: {
    title: string;
    nullLabel?: string;
    zeroLabel?: string;
    endLabels?: readonly [string, string];
  };
  inspect: {
    primary: readonly EntityKind[];
    contextual: readonly EntityKind[];
  };
  dataDependencies: readonly string[];
}

export interface LensSpec {
  id: LensId;
  label: string;
  defaultField: string;
  fieldIds: readonly string[];
  evidenceFieldIds: readonly string[];
  overlayIds: readonly OverlayId[];
}

export interface LensRegistry {
  lenses: Record<LensId, LensSpec>;
  fields: Record<string, RegistryFieldSpec>;
  thresholds: Record<string, ThresholdSpec>;
}

export const LENS_REGISTRY = {
  lenses: {
    demand: { /* field IDs and matrix contract */ },
    supply: { /* field IDs and matrix contract */ },
    access: { /* field IDs and matrix contract */ },
    utilization: { /* field IDs and matrix contract */ },
    opportunity: { /* field IDs and matrix contract */ },
  },
  fields: { /* every field semantic contract exactly once */ },
  thresholds: { /* every threshold/provenance contract exactly once */ },
} as const satisfies LensRegistry;
```

Registry invariants enforced at module initialization/tests:

1. Exactly five unique lens IDs and one valid, map-enabled default field per lens.
2. Every field definition occurs once. Lens `fieldIds` have unique analytical ownership;
   evidence-only context IDs may be referenced by several `evidenceFieldIds` lists but never
   become a second analytical field.
3. Every numeric map field declares unit, null semantics, encoding, scale, thresholds,
   legend, dependencies, and inspectable entities.
4. Every threshold has one provenance kind and source. A diverging field declares exactly
   one pinned domain boundary.
5. Every layer family and overlay ID is stable and unique.

Membership changes from the current six-lens registry:

- Move `screen_decision` and `screen_margin_m` from Policy to Opportunity.
- Move `pop_beyond_2km` from Access to Opportunity.
- Move `demand_supply_gap` from Demand to Opportunity, retaining `map: false`.
- Place `commune:ports_per_10k_pop` under Supply as equity evidence; do not make Policy a
  back door sixth lens.
- Remove Context from analytical lens membership. POI and land-cover fields remain evidence
  and overlays unless a future approved analytical question gives one a complete contract.

## 6. Palette semantics

- A sequential ramp always maps pale to less and dark to more of the named field. Do not
  reverse numeric meaning between lenses. Directional judgment belongs in legend copy.
- Demand: warm sequential; Supply: teal sequential; Access: blue sequential; Utilization:
  purple sequential; Opportunity: approved screening diverging palette for margin and a
  declared sequential need palette for `pop_beyond_2km`.
- Dark Utilization means busier, not “bad”. Dark Supply means more installed supply, not
  “more opportunity”. Dark Access means farther because the value itself is larger.
- `screen_margin_m` is the only diverging primary contract. Zero is a rule boundary;
  negative and positive sides have explicit labels. `screen_decision` remains categorical.
- Null/unknown always uses the same neutral grey hatch/open mark. Detour “not applicable”
  keeps its distinct hatch. Known zero always uses a data color.
- Selection, boundaries, station status, and contextual overlays use ink/cold overlay
  tokens and never consume a data-ramp color.

## 7. Required MapView and layer changes

### 7.1 Lens transition

Add one action, implemented in terms of field state:

```ts
selectLens(next: LensId) {
  const current = fieldById(get().field);
  if (current?.lensId === next) return;
  setField(defaultFieldOfLens(next).id);
}
```

A lens transition may change only the selected analytical field, its computed scale/legend,
and its analytical layer family. Preserve:

- selected entity, including a contextual entity that has no value for the new field;
- camera/view, 2D/3D mode, time `t`, compatible brush state, paint toggle, and overlays;
- dataset/session and every already loaded dataset dependency.

Selection is dataset-scoped, not lens-scoped. Clear it only when the dataset changes and the
entity does not exist there, or when an explicit user action clears it. If a selected road or
POI requires lazy data, retain the selection while that data loads.

### 7.2 Pure layer composition

Split `buildLayers()` conceptually into ordered families and flatten once:

```ts
const stack = [
  ...buildAnalyticalFamily(registryField, loadedData, visualState),
  ...buildContextLayers(contextState),
  ...buildOverlayLayers(activeOverlayIds, loadedData),
  ...buildSelectionLayers(selection, loadedData),
];
assertUniqueLayerIds(stack);
return stack;
```

Rules:

1. One analytical **family** per selected field. Value/null/not-applicable sublayers count as
   one family. A Demand representation is one declared family; a hybrid's capacity marks
   must be a named overlay with its own legend or the hybrid must be disabled.
2. Stable namespaced IDs: `analysis:<field>:value`, `analysis:<field>:null`,
   `overlay:<id>`, `selection:<entity>:<pass>`. Never derive IDs from render count.
3. Suppress a geometry's context overlay while that geometry is analytical; e.g. do not
   draw `overlay:stations` under `analysis:station:occ`.
4. `overlay:beyond2km` is constructed at most once even when both Access and Opportunity
   reference it.
5. Layer builders are pure. They receive arrays/scales and never load, register, or query
   data.

### 7.3 Dataset/query lifecycle

The current `registerParquet()` already deduplicates registration, but `fetchField()` can
still query again when revisiting a field. Add a dataset-session cache:

```ts
type CacheKey = `${datasetId}:${fieldId}`;
const fieldRequests = new Map<CacheKey, Promise<FieldSnapshot>>();
```

- First use of an unloaded field/dependency may issue one loader-owned DuckDB query.
- Re-render, lens reselect, lens revisit, selection, pan/zoom, overlay toggles, and scrubber
  frames must reuse the cached promise/snapshot and issue zero new queries.
- Roads, POI, communes, boundary, stations, and occupancy remain lazy where appropriate,
  but load at most once per dataset session.
- Load the occupancy profile once; compute the all-week scale once; changing `t` calls only
  `stationOccAt()`/layer accessors.
- Dataset change owns cache invalidation. Lens change must never call dataset reset, reload
  the page, or clear unrelated caches.
- Failed requests are removed from the promise cache so an explicit retry can run; successful
  snapshots remain immutable.

### 7.4 Legend and inspector

- Legend input is exactly `{ fieldSpec, computedScale, runtimeCoverage }`. It does not infer
  semantics from field names, group order, or palette index.
- Render actual break values, units, null/zero meanings, open-ended maximum, and relevant
  threshold provenance. Domain markers say “rule”; presentation breaks say “display class”.
- Inspector keeps the selected entity open across lenses. If the new field has no value on
  that entity, show contextual evidence and “this lens has no direct value for this entity”;
  do not close the inspector or print zero.

## 8. Required tests

1. Registry: exactly the five canonical IDs; valid defaults; unique field membership; all
   required metadata complete.
2. Threshold provenance: every threshold is exactly `data`, `domain`, or `presentation`;
   `40%` appears only in Opportunity screening evidence; 0 is pinned for margin.
3. Data contracts: population zero vs null, missing station ports, unreachable Access,
   utilization unknown vs observed zero, and opportunity margin vs final decision.
4. Transition: changing lenses preserves selection, dataset, view, time, compatible brushes,
   and overlay set. Contextual station/road/POI selections remain open.
5. Layer stack: one analytical family, stable IDs, no duplicate IDs, station overlay
   suppression, one `beyond2km` overlay.
6. Query lifecycle: first uncached dependency may query once; re-render/revisit does not;
   scrubbing 168 hours does not change query count; dataset change invalidates the right
   cache only.
7. Palette/legend: pale-to-less/dark-to-more, fixed null token, known zero distinct from
   null, Opportunity zero hairline, no policy wording on presentation breaks.

## 9. Acceptance gate

Phase 2 is ready to implement when the registry answers all nine requested questions for
every map-enabled field, and tests prove that a lens transition changes only the field,
scale/legend, and analytical layer family. It must not reset a valid selected entity, reload
the dataset, duplicate a layer, or issue a DuckDB query from render/scrub/revisit paths.
