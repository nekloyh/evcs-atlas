# Phase 4.1 — CR: Chart alignment with the Phase 2.1 encoding contract

Status: **PHASE 4.1 SPEC READY**
Type: narrow follow-on to the approved Phase 2.1 encoding CR. Scope is exactly: keep the
five Phase 4 primary charts consistent with the new encoding contract (perceptual palette,
gradient scale option, continuous elevation).

Out of scope, untouched by every item below: FILTER CONTRACT, EVENT MODEL (chart→map,
map→chart), lens↔chart ownership, chart business questions, cross-filtering, adding or
removing charts. No item below adds a query, an event type, a hash key, or a filter shape.

All findings verified on the working tree (2026-08-20) and, where a number was needed, on
the package the app opens (`web/public/data/p/01/`, exported 2026-08-11).

## A. THRESHOLD PROVENANCE

Taxonomy of this CR: **DATA-DRIVEN** (computed from the loaded dataset), **DOMAIN
THRESHOLD** (real-world meaning; preserved even though the map went continuous-capable),
**PRESENTATION THRESHOLD** (copied from the map encoding; the only class this CR may
change).

### Demand → Population Histogram (`ui/PopulationHistogram.tsx`)

| Edge / break | Provenance | Note |
|---|---|---|
| `=0` slot | DATA-DRIVEN | Exact-zero mass is a schema fact (111,096 zeros corpus-wide); zero is a true measurement (§1.2). Parallel to the map's zero-class rule but derived from the data, **not copied** from the map scale. |
| 23 positive bin edges | DATA-DRIVEN | Equal-width in `log1p` over `[min_positive, max]` of the loaded dataset (`chart-models.ts:50,114`). The count 23 is a chart-local layout constant (296 px review, §1.2), not a map break. |
| Median hairline | DATA-DRIVEN | Non-null raw values. |

No map-copied threshold exists in this chart. **Correction to the 2.1 text this CR makes:**
CR §3 says "PrimaryLensChart histograms keep the map's binned breaks in both modes" — the
letter of that sentence never matched Phase 4 §1.2: the primary histogram uses chart-local
`log1p` display bins, not the map's breaks. The intent (histograms never gradient) stands;
the sentence is rewritten to say so.

### Supply → Power Tier Breakdown (`ui/PowerTierBreakdown.tsx`)

| Edge / break | Provenance | Note |
|---|---|---|
| 22 / 60 / 120 / 180 kW cuts | **DOMAIN THRESHOLD** | Charger power classes aligned to observed nameplate modes (11/20/30/60/120/180/250 kW). Phase 4 §1.3 calls them "presentation thresholds" in the sense of *not adequacy standards*; under this CR's taxonomy they are DOMAIN and are preserved verbatim. They were never copied from any map scale (the Supply map paints `station:ports`, a different variable). |
| `unknown` category | null-state contract | Missing nameplate, not a threshold. |
| Bar domain `[0, max tier count]` | DATA-DRIVEN | Shared by every row (§1.3). |

### Access → Access Curve (`ui/AccessCurve.tsx`)

| Edge / break | Provenance | Note |
|---|---|---|
| 2 km hairline + callout | **DOMAIN THRESHOLD** | `BEYOND_2KM_M` registered constant (`domain-thresholds.ts`). |
| X cap = max(2 km, measured-population-weighted P99) | DATA-DRIVEN | Chart-local statistic (`chart-models.ts:409–428`), deliberately **not** the map's cell-count p99 clip — different weighting, different question; the trim is disclosed on-chart. |
| Y `[0, 100%]` | physical bounds | — |

No color breaks at all; nothing map-copied.

### Utilization → Heatmap 7×24 (`ui/Heatmap168.tsx`)

| Edge / break | Provenance | Note |
|---|---|---|
| 7 color class breaks | **PRESENTATION THRESHOLD** | Literally the map's `Scale.breaks` for `station:occ` (quantile classing over all valid station-hours + zero-class rule), consumed via `classOf` (`Heatmap168.tsx:87`). **The only map-copied thresholds among the five charts** — and therefore the only ones this CR changes: they become mode-dependent through the shared `Scale` (§C). |
| Domain `[0, max]`, no clip | DATA-DRIVEN under contract | `TOGGLE_LINEAR_ZERO_NONE` (`fields.ts:1070`): physical ratio bounds. |
| `OBSERVED_H_MIN = 1 h` | **DOMAIN THRESHOLD** | Observation-quality gate (§1.5). Preserved. |
| Current-hour outline | state cue | Not a threshold; independent of data hue by design. |

### Opportunity → Commune Rank Bars (`ui/OpportunityCommuneRankBars.tsx`)

| Edge / break | Provenance | Note |
|---|---|---|
| 2,000 m in the rank measure | **DOMAIN THRESHOLD** | `BEYOND_2KM_M`, single-constant import (§1.6/Q-P4-4). |
| Top-10 cut + pinned row | chart-local layout | Not map-copied. |
| Bar domain `[0, max rank_value]` | DATA-DRIVEN | Zero-anchored, shared across rows (§1.6). |

The map's diverging pivot at 0 and the −2,000 rule bound on `screen_margin_m` are not used
by this chart at all.

## B. COUPLING TO MAP ENCODING

| Chart | Shares a variable with its lens map? | Shares today | Disagreements after 2.1 |
|---|---|---|---|
| Demand histogram | Yes — `population` (lens default field) | Variable only. Domain no (chart `[0..max]`, never truncated §1.2; map clip `[0, p99]`), transform no (`log1p` positioning vs map `sqrt`), palette: identity token only. | None new that misleads: in gradient mode the map legend ends at `≥ p99` while the chart axis reaches `max` — **complementary disclosure** (the chart is where the clipped tail is visible; its bars carry no value-color). Continuous elevation adds no chart channel. Identity-token item §C2 applies. |
| Supply tiers | **No shared variable** — tiers classify `power_kw_max_port`; the map paints `station:ports`/cell supply fields | — | None possible: every Supply-lens field is `SUPPLY_FIXED` (fixed-binned), so the map cannot enter gradient in this lens; the toggle control is disabled with the registry reason. §C2 only. |
| Access curve | Partially — chart reads cell `dist_station_network_m` (+ population); lens default map field is `road:dist_station_m` | Position-only marks; no color scale; no shared encoding. | Two *different* p99 statistics may coexist on screen (chart's weighted-P99 axis cap vs the map's cell-count p99 clip). Both are disclosed in their own frame; unifying them would change the chart's statistical framing = chart business logic, out of scope by design (§1.4 geometry rationale). §C2 only. |
| **Utilization heatmap** | **Yes — full coupling.** Same variable (`station:occ` ratios); §1.5 requires one shared scale with the Station map | Breaks/domain/transform: YES (same `occClassing` lineage; linear; no clip). Palette: **NO — defect**: chart paints the default/exploration ramp (`rampFor` without theme, `Heatmap168.tsx:59`) while the map paints the utilization theme (`MapView.tsx:693` passes `activeTheme`). Mode: **NO** — chart receives the raw binned base scale (`LensChartController.tsx:213` routes `utilizationScale = occClassing`, built without a requested mode, `App.tsx:478–484`), the map receives `applyScaleMode(...)` (`App.tsx:274–279`). | (a) hue family differs **in both modes** — orange chart beside a purple map/legend, violating §1.1 as written; (b) with `sc=g` the map goes LUT-continuous while the chart steps through bins — same value, two colors; (c) both defects repeat in the Phase 3 `MiniHeatmap` (`MiniHeatmap.tsx:50`). |
| Opportunity rank bars | No — chart ranks `pop_beyond_2km` (fixed-binned, not painted by default); the map default is `screen_margin_m` (diverging toggle) | Bar **length** is the only channel. | None: the map may enter two-arm diverging gradient; the chart has no color scale to disagree with. §C2 only. |

## C. CHART ENCODING ALIGNMENT CONTRACT

### C1. Utilization → Heatmap 7×24 (the only value-color-coupled chart)

- **Palette source:** the Lens Registry, same as the map — `colorFor(value, scale, theme)`
  is the single entry point (CR §3); the chart-local `classOf` + `rampFor`-without-theme
  path is deleted. `theme` reaches the chart from the registry through
  `LensChartController` (derived from the lens's default field via `themeFor`); the chart
  neither imports `themeFor` nor hardcodes a theme. Note: in **binned** mode this is a
  declared pixel change (orange → utilization ramp) — it fixes a standing violation of
  Phase 4 §1.1, it is not a new encoding.
- **Domain and transform:** the chart receives the **same `NumericScale` object** the
  Station layer renders — `applyScaleMode(occClassing, scaleContractOf("station:occ"),
  store.scaleMode, gradientAvailability("utilization", false).allowed)` — object identity,
  not structural equality. `TOGGLE_LINEAR_ZERO_NONE`: linear, clip `{lo: 0, hi: "none"}`.
  With one shared object, a domain/transform/clip divergence is unrepresentable (chart-side
  analog of CR 2.1 acceptance test 7).
- **Clipped values:** `station:occ` declares `hi: "none"` — no clipping exists
  (`nClippedHigh = 0`). Under any future clip the shared object saturates chart cells
  exactly as it saturates map marks; the `≥ {hi}` / overflow disclosure remains the
  Legend's single job — the chart adds no second disclosure of its own.
- **Null / not-applicable / filtered:** null (no contributing station, `< OBSERVED_H_MIN`,
  or no ports) stays the 45° hatch **outside** the ramp — `colorFor(null) → null` in both
  modes. BUFFER stations remain not-applicable: excluded from the model, never painted.
  No analytical filter exists on this chart (unchanged). Distinct-from-valid-low: a
  measured 0 paints the zero class (binned) / `LUT[0]` (gradient) — the map's approved
  semantics for true zeros — never hatch; gate: composited hatch vs the lightest *rendered*
  step ≥ the §4b ΔE floor, re-measured in gradient mode (rides the still-open 2.1 tc12
  measurement debt).
- **Axis label / unit:** transform is linear on a physical `[0,1]` ratio → no relabeling.
  The printed unit line "% cổng IN bị chiếm, trọng số theo cổng" and all aria strings are
  mode-invariant. (The transformed-domain relabeling rule binds only if a future coupled
  chart inherits a `sqrt`/clip domain; the inverse-transformed-tick pattern is already
  proven by the histogram's decade ticks.)
- **Tooltip / readout:** raw percent from the raw value, both modes — already true; pinned
  by test so a LUT position can never surface.

### C2. Identity token — all five charts (+ `HourProfile` companion)

Every chart hardcodes `SERIES = RAMP_HEX[4]` (`#9a380b`, the default ramp) — e.g.
`PopulationHistogram.tsx:18`, `PowerTierBreakdown.tsx:17`, `AccessCurve.tsx:17`,
`OpportunityCommuneRankBars.tsx:17`, `HourProfile.tsx:47` — while two approved texts say
otherwise: CR 2.1 §3 "Charts keep `series` = anchor c4 of the active theme" and Phase 4
§1.1 "Charts use the same semantic palette tokens as their lens map layer … one lens series
token". `ThemeReadout` already paints `seriesColorForTheme(theme)` in the same read column,
so the column currently contradicts itself.

Contract: single-series ink = `seriesColorForTheme(themeFor(lens.defaultField, …))` from
the registry; darker accents (`RAMP_HEX[6]` callout/selected) come from the same active
ramp. Blast radius declared: hue-only change in 4 of 5 lenses (Demand's default
representation resolves to the exploration theme, whose family the current orange already
is), including the story-mounted instances (§F). This changes no geometry, no bin, no
event. Alternative if the owner prefers the lens-neutral ink: amend both contract
sentences instead — the standing contradiction may not survive either way. Recommendation:
follow the approved text (code moves, not the contract).

## D. SCALE TYPE TOGGLE PROPAGATION

The approved toggle exists: hash key `sc` → `store.scaleMode`, realized per field by
`applyScaleMode` under the field's `scaleContract` + the measured `gradientAvailability`
gate.

| Chart | Verdict | Justification |
|---|---|---|
| Demand histogram | **INDEPENDENT** | A histogram's bars *are* bins (CR §3); it has no value-color channel. `sc` changes zero props. |
| Supply tiers | **INDEPENDENT** | No value-color channel, and moot: every Supply-lens field is fixed-binned, so no map gradient exists in this lens to follow. |
| Access curve | **INDEPENDENT** | Position-only marks (line/area/callout); no color scale. |
| **Utilization heatmap** | **FOLLOWS** | Reads `store.scaleMode` realized through `station:occ`'s own contract and the utilization gradient gate — the exact inputs the map path reads (`App.tsx:274–279` pattern applied to `occClassing`). **No new state, no event, no hash key**; in binned mode rendering is identical (modulo the C1 theme fix). Gate refusals degrade to binned automatically (`n = 0` rule of QA 2.1-004 included). |
| HourProfile (companion) | INDEPENDENT | Position encoding; exists precisely to carry the rhythm the shared color scale compresses (§1.7). |

**Why FOLLOWS overturns one clause of CR 2.1 §3** ("Histogram/**heatmap** bins remain
binned in both map modes"): the heatmap's breaks are the atlas's only map-copied
presentation thresholds (§A), and the §1.1 invariant — "the map and chart share one scale
and the same color means the same interval" — generalizes in gradient mode to *the same
color means the same value*; a binned chart beside a gradient map breaks it for the one
lens where hue carries the same measure. Measured on `p/01` (the loaded package): the 168
aggregate cells span 0.110–0.362, i.e. the **11–36 % band of the shared `[0, max]` ramp**,
while binned mode already puts **115/168 cells (68 %) into a single class** (approximate
quantile classing over 112,843 valid station-hours; re-derive with `computeClassing` at
implementation). Gradient therefore adds within-class discrimination and removes fake step
edges; the known compression is a property of the shared-scale decision (§1.5, frozen) and
is already mitigated by design through `HourProfile`. The CR's own escape hatch anticipated
this: "any future continuous colorbar in a chart must sample the same LUT."

The histogram half of the sentence keeps its intent and gets its letter fixed (§A, Demand).

## E. CHARTS REQUIRING NO CHANGE

- **Demand → Population Histogram** — no map-copied thresholds; no value-color channel;
  its `log1p` axis is declared presentational (§1.2) and its ticks already print
  inverse-transformed raw values; tooltip already raw. Only §C2 (one constant) touches it.
- **Supply → Power Tier Breakdown** — domain kW cuts preserved verbatim; no shared
  variable with the map; lens is fixed-binned end-to-end. Only §C2.
- **Access → Access Curve** — read-only, position-only; 2 km domain rule and weighted-P99
  cap stay chart-local and disclosed. Only §C2.
- **Opportunity → Commune Rank Bars** — length-encoded lower bound; `chặn dưới`/coverage
  copy untouched; the map's diverging gradient never reaches this chart. Only §C2.
- **All charts:** continuous elevation (2.1 item 3) has no chart-side channel — nothing
  propagates. No chart gains a colorbar (a colorbar would need the LUT rule of CR §3; none
  is added). Filters, events, queries, models: zero delta.

## F. REGRESSION SCOPE

- **Phase 3 (inspector):** `MiniHeatmap.tsx:50` has the same two defects as the primary
  heatmap (no theme, raw binned scale) and takes the same one-line rule — it renders
  station-hour values that span the full domain, so it FOLLOWS too. Spot-check the
  inspector evidence swatches after the theme fix.
- **Phase 5 (search/presets):** untouched — presets emit no `sc`; filters operate on
  values; the heatmap still emits only `TimeCursorSet`; zero new SQL (all 4.1 items are
  render-only).
- **Phase 7 (story):** `StorySurface.tsx` mounts `PowerTierBreakdown`, `AccessCurve`,
  `OpportunityCommuneRankBars`, and `Heatmap168`. The heatmap story call site passes
  `scale={null}` (line 157) so the C1 value-color change can never render there; the C2
  identity-token change is a declared hue-only delta in story chart panels — scene claims
  cite numbers, never hues, so claims re-verification is not triggered; one witness render
  per affected scene. Scenes keep pinning `sc` = binned (unchanged).
- **Phase 4 documents:** §1.1 alignment paragraph — "heatmap" leaves the remain-binned
  sentence (D); the histogram clause is corrected to "chart-local display bins" (A);
  §1.3 gains one clarifying line that its tier cuts are DOMAIN thresholds under the 2.1
  provenance taxonomy. AC 49 (null/zero/state distinctness) is re-verified in gradient
  mode.
- **Phase 6 (simulation):** no new rule — the frozen-domain contract already governs the
  shared object; the heatmap inherits the freeze by identity. Smoke only.
- **Phase 2.1 render debt:** the C1 hatch-vs-light-end gate extends the still-unmeasured
  tc12; measure both on the same run.
- **Phase 8:** untouched (values, not encodings).

## ACCEPTANCE TESTS

Unit (`node --test`, pure modules):
1. **Single color path** — the heatmap cell fill function equals
   `colorFor(v, scale, "utilization")` for `v ∈ {null, undefined, 0, mid, max}`; hatch iff
   `colorFor` returns `null`; asserted in both modes. Same assertion for `MiniHeatmap`.
2. **Binned parity** — with `mode: "binned"`, per-cell fill equals
   `scaleColors(scale, "utilization")[classOf(v, scale)]`, which is the map/legend station
   color for the same `v` — no second path reachable.
3. **Mode propagation without new state** — heatmap scale =
   `applyScaleMode(occClassing, contract("station:occ"), store.scaleMode, gate)`;
   `sc=g` + blocked gate → binned; unknown/absent `sc` → binned; `n = 0` → binned
   (QA 2.1-004 rule reused). The component API accepts only `Scale` — no mode prop exists.
4. **Shared object identity** — the heatmap and the Station layer receive the *same*
   `NumericScale` reference for `station:occ` (`===`), making domain divergence
   unrepresentable.
5. **Toggle isolation** — flipping `sc` changes zero bytes of the Demand/Supply/Access/
   Opportunity chart models and zero props of their components.
6. **Zero vs null** — value 0 → zero-class color (binned) / `LUT[0]` (gradient); null →
   hatch in both; the two are never equal.
7. **Identity token registry** — for each lens, the chart series equals
   `seriesColorForTheme(themeFor(defaultField, …))`; no `ui/` chart module imports
   `RAMP_HEX` for a series constant (grep-style test).
8. **Raw readout pin** — the heatmap readout/aria render `v × 100 %` from the raw value in
   gradient mode; no LUT position or transformed value can surface.

Render (CDP, same harness as `docs/qa/phase21/`):
9. **Same value, same color** — field `station:occ`, `sc=g`: the legend gradient bar
   sampled at `position(v)` matches the heatmap cell of value `v` within ΔE ≤ 1; binned
   mode: the chart's swatch set ⊆ the legend swatch set.
10. **Hatch distinctness on the panel** — composited heatmap hatch vs the lightest
    rendered gradient cell ≥ the §4b ΔE floor (6–8), light + dark themes (extends open
    2.1 tc12; AC 49 re-run).
11. **Story witness** — scenes mounting the four shared chart components re-rendered:
    heatmap scene pixel-identical (`scale={null}` path); C2 scenes hue-only delta,
    archived with the witness set.
12. **Recorded, not gated** — the gradient heatmap's aggregate band (measured 11–36 % of
    the ramp on `p/01`) is archived as a measurement alongside the renders; it is a
    property of the frozen shared-scale decision (§1.5) mitigated by `HourProfile`, not a
    pass/fail gate this CR may invent.

---

**PHASE 4.1 SPEC READY**
