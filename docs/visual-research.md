# Spatial visualization research — decision matrix

Status: **research artifact, not a design decision yet**. This file records what the
published data can support, what each visual encoding would claim, and the smallest
prototype needed to validate it. It does not create a siting recommendation or add a
field to the dataset.

Correctness is the floor, not the design target. The product outcome is an exploratory
spatial environment: the map changes its context, hierarchy, interaction and temporal
behavior with the analytical question, rather than merely recoloring a selected metric.

## Visual experience goals

The new system must make the following experience observable in prototypes:

- **Spatial depth:** context, analytical surface, infrastructure, relationships and
  interaction are visibly distinct layers, with a deliberate hierarchy.
- **Multiple perspectives:** a metric can have overview, analysis, inspection and,
  where justified, focused 3D representations.
- **Question-shaped scenes:** changing theme changes composition, emphasis, palette,
  camera and interaction; it is not equivalent to switching an overlay checkbox.
- **Progressive exploration:** overview can lead through hover, selection and focus to
  an explanation without making the initial view noisy.
- **Purposeful motion:** transitions retain spatial context; temporal motion reveals a
  source with time and never replaces a comparable static view.
- **Visual distinction without semantic invention:** atmosphere may make a scene feel
  richer, but does not make a stronger data claim than its encoding supports.

## Guardrails

- An encoding must preserve the meaning and null semantics of its source field. In
  particular, `util_cell = null` is not zero, `screen_decision` is an output of a
  rule, and POI coverage is not a measure of demand.
- A three-dimensional height is the metric being encoded (or a declared monotonic
  transform of it), never an unrelated convenient field.
- A density surface has a physical aggregation contract: input measure, spatial unit,
  cell size or bandwidth, aggregation, and legend thresholds. Do not use a
  screen-pixel heatmap for a quantitative claim.
- A bivariate display is reserved for one explicit two-variable question. Its legend
  exposes both variables and it always has a univariate fallback.
- Animation changes only a source that has time. It must support pause, direct time
  selection, and comparison presets; it is not a decorative default.

## Two independent visual contracts

### Analytical encoding

This contract says what data claim a layer makes: source field or measure, aggregation,
geometry, color/size/elevation mapping, null handling, temporal binding and quantitative
legend. It is the contract protected by the guardrails above.

### Presentation treatment

This contract says how that valid layer participates in a scene: opacity, blending,
contrast, layer order, label suppression, hover/selection state, focus treatment,
camera pitch and transition. These treatments must not alter the interpretation of the
analytical encoding. They are how a correct map becomes an expressive spatial product.

## Data and context audit

| Resource | Available now | Suitable role | Limit that changes the visual claim |
|---|---|---|---|
| H3 r8 grid | Population, supply, road length by class, landcover fractions, network distance, screening and aggregated utilization | Stable cell surface, metric extrusion, threshold and diverging surfaces | H3 is an analytical aggregation; it does not describe parcel-level land use. |
| Stations and 168-hour profiles | Point location, ports/power and time-indexed utilization | Station inspection, point intensity, temporal point state | Telemetry coverage varies; missing is not low utilization. |
| Roads | Simplified road geometry plus road class and distance-to-station field | Accessibility context, network barrier and selected-route explanation | It is a visualization geometry, not the routing graph; no travel-time claim is valid. |
| POI visual | Four grouped point/polygon layers | Destination context and visual anchors | OSM coverage is biased; not an exclusion constraint or a demand proxy by itself. |
| Landcover fractions | Built, water, tree, crop and other fractions per H3 | Analytical contextual surface / mask explanation | No landuse polygons in the shipped project data. |
| Positron vector style | `park`, `water`, `landuse`, `landcover`, `building`, `transportation`, `boundary` source-layers | Semantic basemap emphasis, with zoom-aware styling | Availability and detail are properties of the remote style/tile source; inspect at target zoom before making a product promise. Residential is present; commercial, industrial, parking and transit hubs are not established by this audit. |

The style audit was performed on 2026-08-10 against the configured Positron URL. It
confirms the vector source and the source-layers above, including buildings at zoom 12+,
rail at zoom 13+, and transit rail at zoom 16+. The app already removes the style's
symbol layers; semantic context must therefore be intentional, not inherited labels.

## Visual decision matrix

| Analysis question | Data / confidence | Primary representation | Context composition | Interaction and legend contract | Do not use |
|---|---|---|---|---|---|
| Where is population concentrated? | `population`, strong but source-qualified | Stable density surface at overview; H3 at inspection zoom; metric extrusion only in a focused 3D view | Residential/built context, buildings at high zoom, stations | Surface states its aggregation size and units; Hex tooltip reports exact cell value | A generic heatmap whose color changes with zoom |
| Where is public charging supply concentrated? | Station ports / site power, strong asset data | Scaled station points for inspection; weighted density surface for overview | Major roads, parking/retail POI when available | Toggle between station count, ports and site power; each has a separate unit and scale | One station icon per capacity value without a legend |
| Where may service be weak? | Network distance + population; valid only as its named measures | Diverging / threshold surface: population beyond network-distance threshold; station points | Roads, water, bridges, selected Dijkstra route | State the threshold and network-distance unit; preserve unreachable cells as unknown | Euclidean distance or travel-time as a coverage substitute |
| Why is accessibility poor? | `detour_ratio`, network distance, road geometry; moderate explanatory confidence | Diverging detour surface plus selected path/bridge marks | Water, road hierarchy, bridge/route scene | Select a cell to reveal route and components; comparison toggle with network distance | Arcs or particles that imply observed vehicle movement |
| When and where is charging busy? | 168-hour station telemetry; coverage-qualified | Station-color/size state at a selected hour; optional fixed-unit density surface | Existing stations; subdued urban context | Play/pause, hour scrubber, weekday/weekend and peak presets; show coverage state in legend | Filling empty cells with zero or interpolating unobserved stations |
| What does urban context explain? | POI and landcover; low-to-moderate, source-biased | Categorical context overlays; no single "urban attractiveness" score | Buildings, water, residential/built surface, POI shapes | Per-layer provenance and coverage warning; opacity controls | Treating POI absence as absence of demand |
| What does screening say? | Rule output + `screen_margin_m`; policy-dependent | Categorical decision map plus diverging signed-margin map | Relevant boundary and stations | Decision and margin are alternate representations, not simultaneous encoded values | Calling it candidate quality or probability |
| Where should analysts investigate first? | Composite derived measures; exploratory only | Linked small multiples or a carefully labelled bivariate comparison | Supply, demand and access contexts selected by the question | Matrix legend, univariate fallback, provenance for each input | A single opaque opportunity score or a siting recommendation |

## Theme composition hypotheses

These are testable scene hypotheses, not merely default layer sets. A theme is allowed to
change presentation treatment as well as the analytical layer composition.

| Theme | Analytical emphasis | Context / atmosphere treatment | Dominant interaction |
|---|---|---|---|
| Demand | Population density or H3 surface; stations as supply reference | Residential/built context stronger; roads quieter; low-level building depth at inspection zoom | Overview → inspect a cell or local cluster |
| Supply | Stations, ports or site power | Road context supports reachability; capacity symbols remain legible over the surface | Change supply measure and select a station |
| Utilization | Time-indexed station utilization; coverage state | Basemap is subdued and telemetry is dominant; temporal fading distinguishes current from non-current marks | Time scrubber, static comparison preset, station profile |
| Accessibility | Network distance / detour and an explanatory path | Water, road hierarchy and bridges gain contrast; buildings recede | Select → focus camera → explain route and compare measures |
| Urban context | Landcover and POI as context, not demand proof | Categorical semantic layers are foregrounded with provenance visible | Layer composition and local inspection |
| Screening | Decision or signed margin | Neutral context, clear threshold and policy provenance | Toggle decision ↔ margin; inspect the applicable rule |
| Exploration | User-selected compatible analytical layers | Calm base style and explicit hierarchy controls | Compose only combinations whose legend and semantics remain valid |

## Prototype queue

### P1 — Demand / charging-desert visual language

Test one question in six coordinated representations, rather than selecting a winner:

1. H3 choropleth for exact cell inspection;
2. fixed-unit analytical density surface for quantitative overview;
3. metric-correct extrusion for a focused 3D reading;
4. exploratory intensity heatmap, explicitly labelled as a hotspot aid rather than an
   exact quantitative comparison;
5. demand × supply bivariate comparison with a matrix legend and univariate fallback;
6. hybrid analytical surface plus station-capacity symbols.

The review criterion is role fit: which representation best supports overview,
exploration, inspection and focused explanation without hiding stations or weakening the
claim. The exploratory heatmap does not replace the fixed-unit surface; the former is a
non-quantitative discovery aid and the latter carries a quantitative contract.

### P2 — Network barrier explainer

Build a spatial explanation sequence, not only an overlay: overview detour hotspots →
hover candidate cell → select and focus camera → reveal route → emphasize water, bridge
and road hierarchy → compare Euclidean with network distance. The question is
explanatory: *what spatial barrier could make this measured detour plausible?* It must
never present paths as observed trips.

### P3 — Utilization time lens

Bind the existing 168-hour scrubber to station marks, but compare four readings before
choosing autoplay: animation, morning/noon/evening/night small multiples,
weekday/weekend comparison, and peak-minus-off-peak difference. Selection of a station or
region reveals its 24-hour profile. Add an aggregated surface only if its cell-size,
weight and coverage semantics can be stated and remain stable across zoom.

## Architecture implication after prototype review

If P1–P3 pass review, introduce the following separation:

```text
Dataset semantics
        ↓
Encoding rules
        ↓
Visual grammar
        ↓
Theme / preset
        ↓
Resolved scene
        ↓
MapView renderer
```

`VisualGrammar` defines the reusable primitives and their valid contracts: surface,
density, point, symbol, extrusion, path, arc, polygon, label, contour, temporal state and
highlight. It also owns scale, opacity, aggregation, size, elevation, filtering, temporal
binding and interaction options. It does not decide that a particular metric should use a
particular primitive.

`Theme` selects a visual atmosphere and compatible analytical priorities. `VisualPreset`
is then a bounded composition for one question, such as **Charging Desert**: demand-density
surface + supply symbols + high-gap outline + subdued built context + selected-cell
inspection.

The resolved scene has:

1. `theme` and analytical question;
2. base/context/analytical/infrastructure/relationship/interaction layer slots;
3. per-layer source, LOD and availability guard;
4. encoding and legend contract;
5. camera, interaction and temporal defaults; and
6. explicit provenance and limitations.

`MapView` becomes a renderer of this resolved composition. It should not decide visual
semantics through an expanding sequence of field-ID conditions, nor should a preset become
an untyped, all-purpose configuration blob.

## External design references

- Deck.gl layer catalogue: https://deck.gl/docs/api-reference/layers
- Deck.gl H3 elevation semantics: https://deck.gl/docs/api-reference/geo-layers/h3-hexagon-layer
- MapLibre layer/source styling: https://maplibre.org/maplibre-style-spec/layers/
- Bivariate uncertainty design framework: https://arxiv.org/abs/2112.06921
- Geo-temporal correlation comparison: https://arxiv.org/abs/1907.06399
