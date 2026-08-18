# Phase 3 — Inspector Specification

Status: **PHASE 3 SPEC READY**

Scope: the Inspector for `Station`, `H3 Cell`, and `Commune` selections.

Candidate support is an architectural extension point only. Phase 3 must not create,
score, rank, recommend, save, submit, or promote a candidate. Those are Phase 6 business
behaviors.

## 1. Product contract

The Inspector answers one question about one selected entity. It is not a field catalogue,
an editable form, or a recommendation engine.

Every entity follows the same reading order:

`Summary (header → hero metric → supporting metrics)`

`→ Evidence (evidence → comparison)`

`→ Technical details`

`→ CTA and explicit states`

The rendered order is the nine sections specified for each entity below. A conditional
section may be omitted when its contract says it has no valid content; another section may
not move into its place. In particular, technical provenance never appears before evidence.

Global constraints:

- One selected entity at a time. `selection !== null` is the only open state.
- The hero answers the active analytical field only when that field is readable on the
  selected entity. Otherwise it says that the active lens has no direct value for this
  entity; it must not substitute a convenient metric or print zero.
- At most three supporting facts and one comparison appear before disclosure.
- `null`, unavailable field, not applicable, not found, loading, and query failure are
  distinct states. None is converted to zero.
- No `Object.entries(row)`, `SELECT *` output, `panelRows(FIELDS, row)`, or equivalent raw
  row dump may reach the UI. Technical details use the explicit allowlists in this spec.
- Labels, units, null meanings, polarity, and threshold provenance come from field/schema
  metadata. The view must not infer them from an ID prefix or column name.
- A source block belongs to the evidence it qualifies and remains available at the end of
  technical details.

## 2. Actual-field review

The specification was checked against `docs/COT.md`, `web/src/fields.ts`, the query types,
and every published province artifact under `web/public/data/p/*` on 2026-08-18.
All 34 province exports have one common schema variant for each of these sources:

| Entity | Published sources | Fields approved for Inspector use |
|---|---|---|
| Station | `stations.parquet` (26 fields), `station_occupancy.parquet` (25), `connectors.parquet` (9), and the 168-hour profile | Identity/location; `op_status`, `access`, `scope`; installed ports and power; connector mix; 30-day utilization, evidence quality, peer percentile, and the selected week-hour profile value |
| H3 Cell | `grid_h3_r8.parquet` (61 fields) plus registered client-derived fields | Identity/boundary membership; the active cell field; no more than the lens evidence fields; distance reachability and population/source fields needed to explain that evidence |
| Commune | `commune.geojson`/`commune.parquet` (21 fields) | Identity/version; the active commune field; demand, supply, population-weighted access, utilization, and quality/provenance fields |

Consequences of that review:

1. Station asset and live data are separate. `n_ports` and `power_kw_site` describe what is
   installed; utilization uses `util_denominator_ports` and telemetry. Connector
   `count_total` is not a replacement for installed ports.
2. H3 network distance may be null because the cell is unreachable. Euclidean distance is
   a separate placement concept and is never its fallback. No drive-time field exists.
3. Commune `quality_flag`, `pop_source`, `area_km2` versus `area_km2_geom`, and
   `anchor_ratio` are necessary provenance, not extra metrics.
4. The current lens registry refers to `station:power_kw` and `station:op_status` as evidence,
   but `STATION_SPECS` defines only `station:ports` and `station:occ`. The underlying
   `power_kw_site` and `op_status` columns exist. Phase 3 must either add real field metadata
   for those IDs or read them through a typed Station presenter; it must not silently drop
   the facts through `FIELD_BY_ID`.
5. `screen_margin_m` is the base distance-rule margin, not the final screening decision.
   Candidate quality, buildability, grid capacity, and investment recommendation are not
   published fields.

Runtime counts and percentages must come from the loaded dataset. The counts above verify
schema compatibility and are not UI copy.

## 3. One `EntitySelection` contract

Phase 3 replaces stringly typed Inspector routing with one dataset-scoped discriminated
union:

```ts
type DatasetId = string & { readonly __brand: "DatasetId" };
type StationId = string & { readonly __brand: "StationId" };
type H3R8 = string & { readonly __brand: "H3R8" };
type CommuneCode = string & { readonly __brand: "CommuneCode" };

export type EntitySelection = Readonly<
  | { datasetId: DatasetId; kind: "station"; id: StationId }
  | { datasetId: DatasetId; kind: "h3-cell"; id: H3R8 }
  | { datasetId: DatasetId; kind: "commune"; id: CommuneCode }
>;
```

Contract rules:

- `datasetId` identifies the loaded dataset session, not the active lens. This makes
  selection dataset-scoped and prevents a syntactically valid ID from being reused against
  a different province by accident.
- All branches use `id`; consumers discriminate only on `kind`.
- Validate before constructing the branded value: Station `^[a-z0-9-]{1,64}$`, H3 r8
  `^[0-9a-f]{15}$`, Commune `^\d{5}$`.
- The URL may keep the existing wire representation (`station:<id>`, raw H3, and
  `commune:<code>`) while `tinh` resolves `datasetId`. Parsing returns the union or `null`;
  serializing is its exact inverse.
- Store state is `selection: EntitySelection | null`. Do not retain `cell: string | null`
  as a second canonical selection and do not add `inspectorOpen`.
- Road and POI contextual interactions are outside the three-entity Phase 3 acceptance
  gate. They must not be coerced into any branch above.

Candidate preparation is structural, not behavioral: keep the union exhaustive and keep
the presenter registry keyed by `EntitySelection["kind"]`. Phase 6 may add a `candidate`
branch and presenter in one typed change. Phase 3 must not add a dormant candidate object,
candidate CTA, candidate store, candidate route, or feature flag.

## 4. Data and component boundaries

The shell, router, loader, and entity presenter have separate responsibilities:

| Boundary | Owns | Must not own |
|---|---|---|
| `EvidenceCard` | Floating/sheet shell, close affordance, scroll container, focus restoration, keyboard boundary | Entity metrics, thresholds, queries, comparison formulas |
| Inspector loader/controller | Selection validation, cached reads, cancellation, `loading`/`ready`/`not-found`/`failed`, construction of a typed entity view model | Markup and keyboard close handling |
| `EvidenceSection` | Exhaustive dispatch from `selection.kind` to one presenter | Store reads, queries, effects, metric selection, formatting rules, threshold decisions, candidate logic |
| Entity presenter | The nine sections below, using an already resolved view model and declared actions | Global open state, URL parsing, cross-entity dispatch |

The router is intentionally shallow:

```tsx
export function EvidenceSection({ route }: { route: InspectorRoute }) {
  switch (route.selection.kind) {
    case "station":
      return <StationInspector model={route.model} />;
    case "h3-cell":
      return <H3CellInspector model={route.model} />;
    case "commune":
      return <CommuneInspector model={route.model} />;
  }
}
```

`EvidenceSection` must not call `fetchCell`, `fetchStation`, `stationSeries`,
`lensOfField`, `FIELD_BY_ID`, or `useStore`. A router that chooses evidence arrays or
calculates utilization is a business-logic container and fails Phase 3.

## 5. Station

### HEADER

- Primary label: `name`; fallback `Trạm không tên`.
- Secondary identity: `station_id`, always visible and copyable.
- Context line: `operator` · `commune_name`; show `address` on the next line when present.
- Show `op_status` in text. `MAINTENANCE` and `OUT_OF_SERVICE` explain that installed assets
  are not necessarily serving; `UNKNOWN` says the source does not state operating status.
- Show `access` and `scope`. `BUFFER` must say `vành đệm 5 km`; it never counts as in-scope
  supply.

### HERO METRIC

- For `station:occ`, show the utilization at the selected week-hour `t`, computed only by
  the registered profile accessor. Unit: occupied installed ports divided by installed
  ports. A measured zero is `0%`; insufficient observation is missing.
- For `station:ports`, show `n_ports` as installed ports.
- For every other active field, render `Lens hiện tại không có giá trị trực tiếp ở cấp
  trạm` in the hero slot. Do not fall back to 30-day `util` and do not close the Inspector.
- The hero is one value, one label, and one unit sentence. It is not a badge row.

### SUPPORTING METRICS

- Supply hero: up to three of `power_kw_site`, `power_kw_max_port`, and 30-day `util`, in
  that order when present.
- Utilization hero: `util` (30-day), `util_p95`, and `saturation_frac`. `duty_cycle` moves
  into evidence so four similar percentages do not compete.
- A lens without a direct Station hero may show installed `n_ports`, `power_kw_site`, and
  30-day `util` as explicitly labeled context, never as an answer to that lens.
- Numeric tiles use aligned numerals. Missing tiles use a short textual reason, not `— = 0`.

### EVIDENCE

- Show the 7×24 mini-heatmap when the profile is loaded. It uses the same all-week scale and
  missing-value token as the station map layer. Selecting a heatmap cell changes only `t`.
- Translate `shape_class`, `peak_hour`, `peak_dow`, and `night_share` into one evidence
  sentence. These labels describe a measured pattern; they are not a station rating.
- Show measurement quality together: `grade`, `coverage`, `obs_days`, and
  `util_reportable`. This is one evidence block, not four headline KPIs.
- Show connector composition grouped by `connector_standard` with `count_total`. Label it
  LIVE/registry connector evidence and keep it distinct from asset `n_ports`.

### COMPARISON

- When `util_pctl` exists, compare only within the named `util_pctl_peer`
  (`province_code|current_type`) and print that peer definition beside the percentile.
- Do not compare AC and DC stations in one percentile and do not infer adequacy from a high
  or low percentile.
- For installed ports or power there is no approved peer benchmark in the published
  contract. Omit comparison rather than inventing a fleet average or target.

### TECHNICAL DETAILS

- Closed by default under `Chi tiết kỹ thuật`.
- Asset allowlist: `station_id`, `station_code`, coordinates, `station_type`,
  `vehicle_class`, `current_type`, `n_ports`, `n_guns_imputed`, `power_kw_max_port`,
  `power_kw_site`, `port_config_source`, `verified_official`, `freshness`,
  `has_timeseries`, `commune_code`, `h3_r8`, `scope`.
- Occupancy allowlist: `util_denominator_ports`, `weekend_ratio`, `ever_active`,
  `occ_status`, `window_start_utc`, `window_end_utc`, and snapshot/provenance when available.
- Group fields as Identity, Installed asset, Telemetry, and Provenance. Never iterate the
  joined row. End with sources and snapshot dates.

### CTA

- Maximum two actions: `Xem ô H3 chứa trạm` when `h3_r8` resolves in the same dataset, and
  `Xem xã/phường` when `commune_code` resolves.
- A CTA changes selection through `selectEntity`; it does not mutate the analytical field
  unless its label explicitly says so.
- No `Đề xuất vị trí`, `Tạo candidate`, save, approve, or submit action in Phase 3.

### EMPTY STATE

- Applies when a valid-shaped Station selection resolves to no row in the selected dataset.
- Keep the header shell and show the requested `station_id`, dataset name, and
  `Không tìm thấy trạm trong bộ dữ liệu đang mở`.
- Offer only Close. Do not search another province automatically and do not retain stale
  details from the previous station.

### MISSING DATA STATE

- Entity exists but a field is absent/null: keep identity and every independent fact.
- Missing `n_ports`: say the source did not report installed ports; utilization requiring
  that denominator is unavailable.
- No occupancy row/profile: say the station has no telemetry profile in this snapshot, not
  that it was idle. Keep asset evidence visible.
- Current hour below the observation gate: show an open/missing mark for that hour while
  retaining the 30-day evidence if available.
- Missing connector rows do not imply zero connectors. State that connector registry detail
  is unavailable and keep `n_ports` separate.

## 6. H3 Cell

### HEADER

- Primary label: `Ô H3` plus the full `h3_r8`; the ID is copyable.
- Context line: `commune_name` and `cell_state` translated to inside/border language.
- If `BORDER`, show `area_frac` and `commune_area_frac` as boundary context, not as quality
  scores.

### HERO METRIC

- If the active field has `readAs: "cell"`, show that exact field value, label, unit, and
  declared null meaning. Client-derived fields use the one registered expression used by
  the map.
- If the active field reads Commune, Station, or Road, render `Lens hiện tại không có giá
  trị trực tiếp ở cấp ô H3` in the hero slot and keep contextual cell evidence below.
- Categorical and boolean heroes use declared labels. Numeric zero remains a real value.

### SUPPORTING METRICS

Use at most three actual/registered facts selected by the active lens:

| Lens | Supporting facts |
|---|---|
| Demand | `population`, `pop_density_ppkm2`, `n_apartment` |
| Supply | `n_stations`, `n_ports`, `power_kw_site` |
| Access | `dist_station_network_m`, `population`, `detour_ratio` |
| Utilization | `util_cell`, `n_stations_measured`, `n_stations` |
| Opportunity | `screen_margin_m`, derived `pop_beyond_2km`, `population` |

Do not repeat the hero in a supporting tile; use the next valid fact. `screen_decision` may
be shown as rule evidence but never renamed candidate quality.

### EVIDENCE

- Demand pairs `population` with `pop_source`; density is a ratio over the in-province cell
  area, not a second population count.
- Supply states that counts are public charging assets and already exclude one-port AC
  personal charging points.
- Access pairs network distance with `network_reachable`, `evidence_grade_distance`, and
  `road_access_offset_m` as a compact explanation. Euclidean distance may appear only as a
  separately labeled placement fact.
- Utilization states the numerator population of contributing stations through
  `n_stations_measured`; `util_cell` is port-weighted and inspect-only.
- Opportunity identifies the 2 km network cutoff as a domain rule and the 0 m margin as the
  base screening boundary. It must say that the final `screen_decision` may include a
  separate exception.

### COMPARISON

- Compare the active numeric cell value with the loaded dataset distribution only when the
  field's cached snapshot provides that distribution. Label it `trong bộ dữ liệu đang mở`.
- A registered domain threshold may be shown instead: 2 km for network service or 0 m for
  screening margin. Label it `ngưỡng quy tắc`, not median or recommendation.
- Do not compare a cell count with the containing Commune total; the units and aggregation
  extents differ. Do not invent an adequacy band for population, ports, or power.

### TECHNICAL DETAILS

- Closed by default under `Chi tiết kỹ thuật`.
- Identity/geometry allowlist: `h3_r8`, `province_code`, coordinates, `area_km2`,
  `area_frac`, `cell_state`, `commune_code`, `commune_name`, `commune_area_frac`.
- Provenance/diagnostic allowlist: `pop_source`, `network_reachable`,
  `evidence_grade_distance`, and the active field's declared source/null semantics.
- Add only the active field and the evidence fields already rendered above. The remaining
  columns are not exposed merely because `fetchCell` returned them.
- End with data snapshot, H3 resolution 8, approximate cell area wording, and source block.

### CTA

- Maximum two actions: `Xem xã/phường` when `commune_code` resolves, and `Căn giữa ô` when
  the cell is outside the current viewport.
- Switching to another metric is a field-control action in the reading column, not the
  default Inspector CTA.
- No candidate creation, suitability action, or final screening action.

### EMPTY STATE

- Applies when a valid H3 r8 ID is not a row of the selected dataset.
- Show the requested H3 ID, dataset name, and `Ô này không thuộc lưới đang mở`.
- Offer only Close. Do not fabricate a row from the H3 centroid and do not query adjacent
  provinces implicitly.

### MISSING DATA STATE

- Keep identity and independent evidence when the active field is null or unavailable.
- `dist_station_network_m = null` plus unreachable evidence means no valid route in the
  published graph, not zero or “very far”. Do not substitute `dist_station_euclid_m`.
- `detour_ratio = null` below 200 m is not applicable; unreachable distance is unknown.
  Their labels and hatch states remain different.
- `util_cell = null` means no measured station contributes; `0` means observed zero use.
- `screen_decision = null` means the rule could not run; it is not rejection.
- If the selected field is not published for the dataset, say `Trường này chưa có trong bộ
  dữ liệu đang mở`; do not surface a query error as an empty entity.

## 7. Commune

### HEADER

- Primary label: full `commune_name` including Xã/Phường/Đặc khu.
- Secondary identity: `commune_code` and `province_name`.
- Show `commune_kind` as one of three declared kinds. Never collapse it to urban/rural.
- Show `valid_from` as the boundary edition context; publication date belongs in technical
  details.

### HERO METRIC

- If the active field has `readAs: "commune"`, show that exact field value, label, unit,
  and null meaning.
- If the active field reads H3 Cell, Station, or Road, render `Lens hiện tại không có giá
  trị trực tiếp ở cấp xã/phường` in the hero slot. Do not replace it with population.
- For `ports_per_10k_pop`, identify both `n_ports` and `population` as its numerator and
  denominator near the hero.

### SUPPORTING METRICS

Use at most three fields by lens:

| Lens | Supporting facts |
|---|---|
| Demand | `population`, `pop_density_ppkm2`, `area_km2` |
| Supply | `n_stations`, `n_ports`, `ports_per_10k_pop` |
| Access | `dist_station_m_pop_weighted`, `population`, `ports_per_10k_pop` |
| Utilization | `util_mean_port_weighted`, `n_stations`, `n_ports` |
| Opportunity | `ports_per_10k_pop`, `n_ports`, `population` as context only |

Opportunity has no published Commune screening margin or decision. The context row must not
be presented as a Commune opportunity score.

### EVIDENCE

- Demand shows `pop_source` beside population. If needed for provenance, show
  `population_wp` and `anchor_ratio` together as source disagreement, not two competing
  headline populations.
- Supply states that Station totals use public, in-boundary stations and installed ports.
- Access states that `dist_station_m_pop_weighted` is network distance weighted by people,
  not area and not drive time.
- Utilization states that `util_mean_port_weighted` weights Station utilization by installed
  ports. A Commune without a measured Station remains missing.
- Always surface a non-null `quality_flag` adjacent to the evidence it qualifies.

### COMPARISON

- For a numeric Commune field, the allowed comparison is rank/position among Communes in
  the loaded dataset using the same field and unit.
- State the number of Communes with a value, the number excluded as missing, and the size of
  any tie at the selected value. Do not present an arbitrary order within ties as rank.
- Use field polarity only when declared. Otherwise say higher/lower, never better/worse.
- No comparison is rendered for identity, categorical provenance, or a lens with no direct
  Commune field.

### TECHNICAL DETAILS

- Closed by default under `Chi tiết kỹ thuật`.
- Identity/version allowlist: `commune_code`, `commune_kind`, `province_code`,
  `province_name`, `valid_from`, `published`.
- Boundary/quality allowlist: `area_km2`, `area_km2_geom`, `quality_flag`.
- Population provenance allowlist: `population`, `population_wp`, `anchor_ratio`,
  `pop_source`.
- Add only the active field and already rendered evidence fields from supply/access/
  utilization. Do not iterate all 21 properties.
- End with VNSDI/WorldPop/source snapshot attribution.

### CTA

- Maximum two actions: `Phóng tới xã/phường` and, when the active field supports it,
  `Xem phân bố các xã` in the existing comparison surface.
- CTA must preserve the same Commune selection. Opening comparison is read-only and does
  not cross-filter the map unless an explicit brush contract says so.
- No candidate shortlist, recommend, approve, or application action.

### EMPTY STATE

- Applies when a valid five-digit Commune code is absent from the selected dataset.
- Show the requested code, dataset name, and `Không tìm thấy xã/phường trong bộ dữ liệu
  đang mở`.
- Offer only Close. Never match by `commune_name`, because names are not unique nationally.

### MISSING DATA STATE

- Keep Commune identity, geometry, and independent fields when one metric is missing.
- `ports_per_10k_pop = null` means the population denominator is zero/missing; it is not
  zero ports per 10,000 people.
- `util_mean_port_weighted = null` means no Station in the Commune contributes a reportable
  measurement; it is not idle utilization.
- `dist_station_m_pop_weighted = null` means no Cell in the Commune has a valid network
  route; it is not zero distance.
- `quality_flag = null` means no published-data defect was detected by current checks;
  non-null flags are shown verbatim with a human-readable explanation.
- A missing active field shows the declared null reason and the count excluded from
  comparison where available.

## 8. Keyboard, focus, close, and persistence

### Esc

- The shell owns Escape; `EvidenceSection` and entity presenters do not install listeners.
- Escape closes the topmost nested popover/menu first. Only an unconsumed Escape clears the
  entity selection.
- One key press produces one `clearSelection("escape")`. The mobile sheet's own dismissal
  must converge on that same action and must not fire a second clear.
- When no selection exists, Inspector Escape handling is not installed.

### Focus

- A user-initiated selection stores the initiating map mark/control as a transient focus
  origin in `EvidenceCard`, not in `EntitySelection` or the URL.
- After a new selection resolves enough to announce identity, reset the Inspector scroll to
  the top and focus its heading (`tabIndex={-1}`). The accessible name is
  `Bằng chứng — <entity type> — <entity label>`.
- Restoring a selection from the initial URL does not steal focus on page load. The region
  remains discoverable by landmarks and its heading is announced when the user enters it.
- Lens/field/time/data updates within the same selection do not move focus. Hero changes use
  a concise polite live announcement; the 168-hour playback does not announce every frame.
- On close, return focus to the originating mark/control if it still exists; otherwise
  focus the map container. Never leave focus in an unmounted card.

### Close

- Desktop close button, unconsumed Escape, mobile sheet dismissal, and a click on empty map
  space all call the same `clearSelection(reason)` action.
- Clicking another entity replaces the selection and keeps the Inspector open.
- Beginning or ending a map drag does not close it. Do not use a document-level
  `pointerdown` outside-click listener.
- Close clears only `selection`. It preserves field/lens, camera, 2D/3D, time, overlays,
  paint state, brushes, comparison state, and loaded caches.

### Selection persistence

- Preserve a valid selection across lens/field changes, map representations, overlay
  toggles, time scrubbing/playback, pan/zoom, comparison open/close, re-render, and cached
  data refresh.
- The URL hash round-trips the selection. A lens change never rewrites or clears `c`.
- While a selected entity's lazy dependency loads, keep its selection and stable shell;
  show loading content in place rather than unmounting the Inspector.
- On dataset change, create/revalidate against the new `datasetId`. Preserve only if the
  same entity resolves there by its canonical key. If it does not, clear after resolution;
  never reuse prior-dataset details.
- A valid-shaped but nonexistent deep link that did not arise from a dataset switch remains
  open in the entity EMPTY STATE so the URL failure is visible and recoverable.
- Moving temporarily to a surface that does not render the Inspector may hide the shell but
  does not mutate selection unless that surface explicitly selects another entity or
  changes dataset.

## 9. Acceptance gate

Phase 3 is ready to implement only when tests prove:

1. `EntitySelection` accepts and round-trips exactly the three Phase 3 entity kinds and
   rejects malformed IDs independently of other hash state.
2. `selection !== null` alone controls Inspector presence; there is no second open flag.
3. Every entity renders the nine contracts above in order: Summary → Evidence → Technical
   details, with CTA and states following their defined positions.
4. Active-field mismatch preserves selection and renders the no-direct-value hero; it never
   prints zero or swaps in another measure.
5. Known zero and every documented missing/null case render differently.
6. Technical details render only their allowlist; a test fails if a newly added raw column
   appears automatically.
7. `EvidenceSection` performs exhaustive routing only and has no store, query, effect,
   field-registry, formatting, calculation, or Candidate dependency.
8. Escape layering, focus entry/restoration, empty-map close, drag persistence, and mobile
   dismissal follow the keyboard contract.
9. Lens changes preserve selection; dataset changes revalidate it; failed lazy loads do not
   erase it.
10. No Phase 3 UI or action creates, scores, ranks, recommends, saves, submits, or approves
    a Candidate.

**PHASE 3 SPEC READY**
