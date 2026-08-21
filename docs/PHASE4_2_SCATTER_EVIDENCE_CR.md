# Phase 4.2 — CR: Demand × Access Scatter activated as Opportunity evidence

Status: **SCATTER EVIDENCE SPEC READY**
Type: narrow follow-on to Phase 4 / CR 4.1. Scope is exactly one line of Phase 4 §1.7:
activate the deferred `Demand × Access Scatter` as **read-only Opportunity evidence**, not a
sixth primary chart.

Out of scope, untouched by every item below: FILTER CONTRACT (no brush, no second filter
shape, the one-filter rule stands), EVENT MODEL (this chart emits nothing — no filter, no
time, no entity intent), the five approved primary chart mappings, any recommendation /
score / ranking language, and any new DuckDB query. No item below adds a query, an event
type, a hash key, or a filter shape.

All numbers below were measured on the working tree (2026-08-20) and on the shipped
packages: `web/public/data/p/01/` (the package the app opens, exported 2026-08-11),
`p/68` (29,763 cells — the largest), and the 34-package corpus where stated.

---

## 0. Findings that shape this contract

**F1 — "emits nothing" is already enforced by state, not only by policy.** An analysis
filter cannot exist while an Opportunity field is active. `isFilterCompatible`
(`state/filter.ts:210`) admits an `h3-cell` filter only under lens `demand` and a `station`
filter only under lens `supply`; all three doors apply it — boot (`store.ts:261`),
`hashchange` (`store.ts:548`), `switchLens`/`setField` (`store.ts:339`). So the evidence
chart has **no filter state to read, none to render, and none to emit**. The §1.7 concern
("its old two-axis brush would reintroduce a second filter shape") is answered structurally,
not by promise.

**F2 — "keep code" ≠ "mount code".** `ui/Scatter.tsx` today imports `ScatterBrush`,
`SCATTER_X`, `SCATTER_Y` from `state/brush.ts` and `useDragRect`/`toPx` from
`ui/brush-overlay.tsx`. Mounting it as-is would revive the legacy brush module in the live
bundle, which Phase 4 §5.5 step 5 explicitly retired. `state/brush.ts` is currently reachable
only from `ui/Scatter.tsx` and `ui/Histogram.tsx`, both unmounted. Activation therefore
**rewrites the component read-only** (§D/§E) rather than wiring the existing props.

**F3 — the 2 km precedent is itself broken.** `ui/AccessCurve.tsx:20` declares
`export const CALLOUT_M = 2_000` and uses it for the hairline, the callout and the X floor —
while CR 4.1 §A records that row as "`BEYOND_2KM_M` registered constant
(`domain-thresholds.ts`)". That is a live contradiction between an approved provenance table
and the code. **Out of scope to fix here**; recorded as an observation so the new chart does
not inherit the drift. The scatter imports `BEYOND_2KM_M` and a grep test pins it (AT-13).

**F4 — the largest package is also the worst null case.** `p/68`: 29,763 cells, of which
**8,805 (29.6%) have no `dist_station_network_m`**, and 62,178 people live in them (1.60% of
the package's known population). Corpus-wide (34 packages, 425,778 cells): **94,530 null
distances (22.2%)**, 111,096 zero-population cells — the same 111,096 CR 4.1 §A cites, so
the two measurements agree. Zero null populations and zero negative values anywhere.
A null contract that treats the null rows as a footnote would be wrong at scale.

**F5 — the composite population domain already exists twice.** `chart-models.ts:143–151`
builds bin `plotX1/plotX2` from `log1p` over `[minPositive, max]`; `PopulationHistogram.tsx:142–157`
re-derives the same mapping inline for its decade ticks. A third copy in the scatter is
refused: §B requires one exported pure helper, with the histogram's existing tests as the
no-behaviour-change guard.

---

## A. PLACEMENT

| Item | Decision |
|---|---|
| **Column / section** | The read column's chart section (`ReadColumn` slot `contextualChart`), directly **below** `OpportunityCommuneRankBars`, inside the same `LensChartController` subtree. |
| **Slot kind** | A new **evidence slot** — the first one. `<details>` disclosure, same construction as the existing NGUỒN footer (`AtlasReadColumn.tsx:280`): `summary` = eyebrow `BẰNG CHỨNG` + `Cầu × Tiếp cận theo ô H3` + `▸`/`▾`. |
| **Default** | **Collapsed.** Mirrors the §1.7 `SupplyLorenz` decision ("collapsed, read-only secondary"). |
| **Loading discipline** | Not loaded eagerly (§1.7). The model builder is **not called while collapsed**; it runs once on first expand and is memoized on the `cells` reference thereafter. |
| **Open state ownership** | `useState` inside `LensChartController`. Not in the store, not in the hash, not in a preset, not in a scene. It is therefore not shareable, not restorable, and cannot appear in a story — which is the intended consequence of "emits nothing". |
| **Registry** | `EVIDENCE_CHART_REGISTRY` in `viz/chart-contracts.ts`, **disjoint** from `PRIMARY_CHART_IDS`. ID: `opportunity-demand-access-scatter`. Meta declares `lens: "opportunity"`, `emitsFilter: false`, `emitsTime: false`, `emitsEntity: false`, `collapsedByDefault: true`. |
| **Router** | **Not** routed by `PrimaryLensChart`. Its exhaustive `never` switch stays five-armed; §5.1 invariant 1 ("exactly five lenses and five unique primary chart IDs") is untouched, and invariant 4 gains an analog: *an evidence chart ID cannot be registered as a `PrimaryChartId`.* |

**Why it does not compete with Commune Rank Bars for the primary slot.** Three independent
reasons, in order of strength:

1. **Different reading unit and different claim.** The rank bars answer "which *xã/phường*,
   by name, holds the most known people beyond 2 km" — a named, ordered, entity-navigable
   lower bound. The scatter answers "how is the *cell* population distributed against
   distance" — an unordered, unnamed distribution with no entity in it. A Commune name is
   something you can say in a meeting; an H3 cell id is not (the same argument
   `compareViewsFor` already makes at `fields.ts:1422`).
2. **Different event class.** The primary chart is the lens's only entity-intent emitter
   (`emitsEntity: true`). The scatter emits nothing. Promoting it would leave the Opportunity
   lens with no path from chart to map — a regression in the lens's job.
3. **It cannot carry the selection.** `GridCell` carries no `commune_code`
   (`queries.ts:35–79`), so the scatter cannot even highlight the selected Commune without
   changing the Q-P4-1 projection. That is out of scope by construction, and it is the
   measured reason the chart is evidence rather than a control.

---

## B. AXES CONTRACT

| Axis | Variable | Transform | Provenance (CR 4.1 taxonomy) |
|---|---|---|---|
| **X** | `GridCell.pop` (`population`), persons per H3 r8 cell | Composite display domain, **identical to §1.2**: one categorical `=0` slot occupying `[0, 1/24]` of the plot width, a separator, then `log1p` positioning over `[minPositive, maxPop]` filling `[1/24, 1]` | `=0` slot: **DATA-DRIVEN** (exact-zero mass is a schema fact — 111,096 corpus-wide). `log1p` positioning: **PRESENTATION**, inherited verbatim from the Demand histogram, not invented here and not copied from the map (the Demand map paints `sqrt`, CR 4.1 §B). |
| **Y** | `GridCell.dist` (`dist_station_network_m`), metres by road network | `sqrt` over `[0, max plotted distance]`, **no clip** | `sqrt`: **PRESENTATION**, and it is the transform the field itself registers — `dist_station_network_m` declares `scaleContract: TOGGLE_SQRT_MIN_P99` (`fields.ts:690`). The **absence of the p99 clip** is a declared divergence (below). |

**X domain is computed over every cell with known population, not over the plotted subset.**
Same validity predicate as the histogram — reuse `isKnownPopulation` (`state/filter.ts:251`),
which already encodes the `pop = -1` trap. Consequence, stated on purpose: when the most
populous cell has no distance, the right end of the axis carries no mark. That is correct —
the axis is the dataset's population domain (§1.2 "never truncate the maximum"), and the
counts line (§C) explains the absent marks. The alternative — a domain that moves when
distances go missing — would make the X geometry silently depend on the null pattern.

**One helper, not a third copy** (F5). Extract from the existing histogram builder, pure and
exported from `viz/chart-models.ts`:

```text
populationDisplayDomain(cells) -> { minPositivePop, maxPop, hasPositive }
populationPlotFrac(v, domain)  -> number in [0,1]
    v === 0            -> the zero slot: [0, 1/24]
    v  >  0            -> (1 + 23 * (log1p(v) - log1p(minPositive))
                                  / (log1p(maxPop) - log1p(minPositive))) / 24
```

`buildDemandPopulationHistogram` and `PopulationHistogram`'s `decadeTicks` both call it.
Behaviour-identical by construction (the formula is transcribed from
`chart-models.ts:147–150`); the existing Phase 4 histogram tests are the guard.

**Axis labels — real inverse-transformed values.**

- **X ticks:** decades `1 · 10 · 100 · 1k · 10k` that fall inside `[minPositivePop, maxPop]`,
  positioned with `populationPlotFrac`, printed by the histogram's `formatPop` — moved to
  `ui/format.ts` and imported by both charts (one line out of `PopulationHistogram.tsx:25`).
  Never a `log1p` value. Axis title verbatim from §1.2: `Dân số trên ô H3 · người`.
  A tick whose pixel would collide with the `maxPop` end label is dropped, same rule as
  `PopulationHistogram.tsx:154`.
  **`scaleUnit` is deliberately not used on X**, and the reason is its own documented
  precondition: it picks **one** scale for a whole ramp (`units.ts` header). A five-decade
  axis violates that precondition — `scaleUnit({kind:"person"}, 46232)` returns
  `{divisor: 1000, label: "nghìn người"}`, which prints the decade ticks as
  `0,001 · 0,01 · 0,1 · 1 · 10`. Per-value magnitude suffixes are correct here, and
  `formatPop` is the app's existing proven answer for exactly this axis.
- **Y ticks:** four ticks at even `sqrt` positions, values inverse-transformed to metres,
  then printed through the **existing `scaleUnit` machinery** — the precondition holds here
  (one magnitude band):
  `formatSeries(tickValues, withDigits(scaleUnit(distUnit, yMax), tickValues))`.
  `distUnit` is **object-identical to** `FIELD_BY_ID.get("dist_station_network_m").unit`
  (`{ kind: "m", note: "theo mạng đường" }`), resolved in `LensChartController` and passed
  down — the presenter never types a unit literal. Axis title:
  `unitPhrase(distUnit, scaled)` → `↑ cự ly tới trạm · km, theo mạng đường`.
  On `p/01` (`yMax = 21,161`) this yields `km` with one shared digit count across the series.

**The 2 km rule.** A horizontal hairline at `y = position(BEYOND_2KM_M)`, imported from
`domain-thresholds.ts` — **no `2000` literal may appear in the module** (AT-13). Rendered in
`HAIRLINE_HEX` at `strokeWidth 2` with an `INK_2_HEX` label `2 km · ngưỡng quy định`, drawn
**above** the marks. Same construction as `AccessCurve`'s `ruleX`, and it survives both mark
extremes: measured ΔE (Oklab ×100) hairline vs a single-cell mark **10.72**, vs the densest
mark level **28.31** — both above the §4b floor of 6. The label says *rule*, never *break*
(§1.4's wording rule).

**Two declared divergences, both disclosed on-chart.**

1. **vs the Access Curve** — the curve caps its X at `max(2 km, population-weighted P99)` and
   states the trimmed tail as a number. The scatter does **not** cap, because a cumulative
   curve can summarise a trimmed tail in one sentence while a scatter would have to *delete
   marks*. Measured cost of capping: **6.0% of plotted cells on `p/01` (266), 7.6% on `p/68`
   (1,586), 8.9% on `p/52` (1,625)** — and those are precisely the farthest cells, i.e. the
   ones the Opportunity question is about. Capping also *worsens* the rule's readability: the
   2 km hairline would sit at 8.5% of the plot height on `p/68` and 5.1% on `p/52`, versus
   17.9% / 14.4% under uncapped `sqrt`.
2. **vs the Access map** — `TOGGLE_SQRT_MIN_P99` clips the map at the cell-count p99
   (8,983 m on `p/01`, 38,278 m on `p/68`). The chart shares the transform and not the clip.
   This is the same complementary disclosure CR 4.1 §B already approved for the Demand
   histogram: the map is where the bulk is legible, the chart is where the clipped tail is
   visible.

**Why `log1p` × `sqrt` and not the legacy `sqrt` × `linear`** — measured occupancy of the
248 × 134 px plot box (distinct occupied 1-px positions; higher is better) and worst pixel
stack:

| Package | linear × linear | sqrt × linear (legacy) | log1p × linear | **log1p × sqrt** |
|---|---:|---:|---:|---:|
| `p/01` (4,397 plotted) | 1,087 / 33 | 2,253 / 10 | 2,705 / 9 | **3,154 / 7** |
| `p/68` (20,958 plotted) | 1,070 / 283 | 3,062 / 79 | 6,979 / 79 | **8,405 / 89** |
| `p/52` (18,349 plotted) | 858 / 396 | 2,736 / 98 | 6,620 / 98 | **8,340 / 66** |

`log1p × sqrt` wins on every package, and it is the only pair where the 2 km rule lands in a
readable band (17.9%–30.7% of the plot height, versus 2.1%–3.2% for any linear Y and
66%–76% for `log1p` Y, which would invert the emphasis and squeeze the beyond-2 km region —
the region the chart exists to show — into the top quarter).

---

## C. NULL / ZERO CONTRACT

| Case | Rule |
|---|---|
| **Null distance, known population** | **Excluded and counted.** Never plotted at 0, never at the axis maximum, never at infinity. There is no position on a two-value plane for a missing value — putting it at 0 would assert "this cell is at the station". The cell keeps its hatch on the map, unchanged. |
| **Null population, known distance** | Excluded and counted separately. Zero rows in all 34 shipped packages; the count line still renders when it is non-zero, because a latent case that never prints is a case that was never tested. |
| **Both null** | Counted once, in the null-population bucket (population is the outer predicate, matching the histogram's `isKnownPopulation` gate). |
| **Zero population** | **Plotted, in the `=0` slot**, at its true distance. Zero is a real measurement (§1.2), not a missing value, and a zero-population cell that is far from a station is a real fact about the grid. It is never merged into the positive band and never dropped. Measured: 135 such cells on `p/01`, 2,857 on `p/68`. |
| **Zero distance** | Plotted at `y = 0`. `sqrt(0) = 0` is exact; no special case. No shipped package contains one (global minimum 18.24 m on `p/01`), so the branch is a guard, not a display. |
| **Negative / non-finite** | Excluded and counted as invalid, never plotted. `Math.sqrt(-1) = NaN` would otherwise delete a mark **silently**. Zero occurrences corpus-wide; the guard exists so a future export cannot lose rows without a number appearing on screen. Predicate: `isKnownDistance(d) = typeof d === "number" && Number.isFinite(d) && d >= 0` — deliberately stricter than `buildAccessPopulationCurve`'s `Number.isFinite(c.dist)` (`chart-models.ts:352`), with no behaviour difference on shipped data. |

**Conservation identity — the chart must satisfy it, and a test must assert it:**

```text
Σ marks[i].n + n_zero_population + n_invalid + n_excluded_distance == cells.length
```

**The counts line the chart must print** (below the plot, above the disclosure edge, in
`text-note text-ink-muted`, the same register as `AccessCurve`'s trailing notes):

```text
{plotted} ô đang vẽ · {zeroPop} ô không người (khe =0)
{excluded} ô chưa rõ cự ly mạng đường — nơi {popExcluded} người ({share}% dân đã biết)
sinh sống — không có chỗ trên mặt phẳng hai trục nên KHÔNG được vẽ. Trên bản đồ chúng vẫn
là vân xám.
```

Line 2 renders only when `excluded > 0`. A third line renders only when
`n_null_population > 0` or `n_invalid > 0`. Expected renderings:

| Package | line 1 | line 2 |
|---|---|---|
| `p/01` | `4.397 ô đang vẽ · 135 ô không người` | `3 ô chưa rõ cự ly — nơi 9.571 người (0,11% dân đã biết) sinh sống…` |
| `p/68` | `20.958 ô đang vẽ · 2.857 ô không người` | `8.805 ô chưa rõ cự ly — nơi 62.178 người (1,60% dân đã biết) sinh sống…` |

The excluded population is printed as a **count of people**, not only a count of cells,
because 3 cells sounds like a rounding error and 9,571 people does not.

---

## D. MARK CONTRACT

**Geometry.** `W = CHART_W = 296`, `H = 168`, `M = { left: 40, right: 8, top: 6, bottom: 28 }`
→ plot box **248 × 134**, chosen so the 2 px lattice divides evenly (124 × 67 = 8,308 cells).
`left: 40` (not the histogram's 32) because the Y ticks carry km labels; the two charts are
never co-visible (different lenses), so **the parity requirement is on the data→fraction
mapping, not on pixels** (AT-4).

**Overplot strategy — lattice collapse, not thinning.**

1. Every plottable cell is assigned to one 2 px lattice cell; `n` = cells per lattice cell.
2. `level = min(n, 6)`.
3. Render **one `<path>` per non-empty level** — at most **6 mark nodes total**, whatever the
   dataset size — each path concatenating its 2 × 2 px squares, filled with the series token
   at `overplotAlpha(level)`.

```text
BASE_ALPHA = 0.45
overplotAlpha(n) = 1 - (1 - BASE_ALPHA) ** min(n, 6)
```

**No cell is ever dropped and no cell is ever sampled away.** Random or top-N thinning is
refused for a reason specific to this chart: the populous-and-far corner is the *sparse* part
of the cloud, so any sampling rule preferentially deletes exactly the marks the chart exists
to show. Lattice collapse merges only marks that are already visually coincident.

**Why the alpha formula is exact, and where it stops being exact.** `1 - (1-a)^n` is what
`n` coincident marks at alpha `a` composite to, so a level-`k` square is pixel-identical to
`k` stacked marks. Truncating at 6 costs a measured **ΔE 0.89** against the fully saturated
composite — inside the ΔE ≤ 1.0 tolerance CR 4.1 acceptance test 9 already uses.

**Why `BASE_ALPHA = 0.45` and not the map's 0.25** — the §4d thin-mark ink rule, measured
(Oklab ×100, screening series `#c77a07` on panel `#f9f9f7`):

| alpha | single mark vs panel | single mark vs gridline |
|---|---:|---:|
| 0.25 (`MUTED_ALPHA`) | 9.76 | **3.85** |
| **0.45** | **17.45** | **10.72** |

At the map's alpha a lone cell would be *less distinct from the gridline than the §4b floor
allows* — the exact failure `palette.ts:720` records ("nét mảnh ở alpha 0,5 thì biến mất, đó
là lỗi chứ không phải nhất quán"). 0.45 is the same value the legacy scatter used, now with
a number behind it.

**What the alpha channel can and cannot resolve — declared, not hidden.** Measured ΔE step
per added cell: `1→2: 9.10`, `2→3: 4.67`, `3→4: 2.46`, `4→5: 1.33`, `5→6: 0.73`. Density is
readable from 1 to about 4 cells and **saturates by 6**. That is a property of ink, not a
defect, and it is why the readout carries exact counts (§E). Legibility of the rare mark is
chosen over discrimination inside the dense mass, because the question lives in the sparse
corner.

**Measured node and stack budget** (2 px lattice, occupied cells / max stack):

| `p/01` | `p/68` | `p/52` | `p/66` | `p/40` | hard cap |
|---:|---:|---:|---:|---:|---:|
| 1,773 / 14 | 3,338 / 34 | 3,393 / 25 | 3,577 / 18 | 3,608 / 17 | 8,308 lattice cells → **6 DOM nodes** |

**Colour.** One series, one token: `seriesColorForTheme(theme)` with `theme` arriving as a
prop from `LensChartController` (post-4.1 §C2 rule). In the Opportunity lens that resolves to
the `screening` anchor `#c77a07` — the value the 4.1 lens sweep recorded. **No second data
hue**, no value-colour channel, no colorbar, no legend: alpha encodes count, position encodes
the two variables, and that is all. The module must not import `RAMP_HEX` for a series
constant and must not name a theme in a string literal (AT-12).

**Shape channel.** A 2 px square carries no identity here — there is one series — so this
consumes nothing from the §4d-4 shape channel, which is separately near exhaustion. The
square is chosen because it tiles the lattice exactly, which is what makes the alpha claim
exact; circles at `r = 1.3` overlap their neighbours and would only approximate it.

**Scale-mode toggle (`sc`).** **INDEPENDENT.** The chart has no value-colour channel, so
flipping `sc` changes zero props and zero bytes of its model — the same verdict CR 4.1 §D
gives the Opportunity rank bars, for the same reason. (Moot in this lens anyway: the
`screening` sequential gradient is refused by the measured gate at `palette.ts:616`.)

---

## E. INTERACTION

**Read-only. Zero global state writes. Zero SQL after the snapshot is ready.**

| Channel | Contract |
|---|---|
| **Data source** | The cached **Q-P4-1 field snapshot** — the `cells: GridCell[]` prop already threaded to `LensChartController` (`AtlasReadColumn.tsx:256`), carrying `pop` and `dist` on every field (`queries.ts:172–178`). No second query, no second projection, no `commune_code`. |
| **Hover** | Fixed `Readout` strip only. **No floating tooltip** — §3 bans them unconditionally and the `Readout` docstring records why. Contents, three fields so the `h-4` strip cannot wrap: `{formatPop(x)} người · {dist} km · {n} ô`, where `x`/`dist` are the **inverse-transformed cursor position** and `n` is the stack of the lattice cell under the cursor. When `n = 0`: `… · chưa có ô nào ở đây`. Hint when idle: `rê hoặc dùng phím mũi tên để đọc mốc hai trục`. |
| **Why cursor coordinates, not the nearest point** | Preserved from the legacy module's reasoning and now measured: with up to 89 cells per pixel, "nearest point" returns an arbitrary member of a stack and reads as a claim about a specific cell that it has no right to make. The cursor position is always true, and `n` answers the question a reader actually has about a dark blob. |
| **Keyboard equivalence** | The plot box is a single focus stop (`tabIndex={0}`, `role="img"` is wrong here — use `role="group"` with an `aria-label` carrying the axis titles and the §C counts). `←/→/↑/↓` move the crosshair one lattice step, `Shift` + arrow ten steps, `Home`/`End` jump to the axis ends, `Esc` clears the crosshair. On focus the crosshair starts at the left edge of the positive band **on the 2 km rule**, so the first thing a keyboard reader lands on is the declared domain rule. |
| **Announcement** | The readout text is mirrored into a visually-hidden `aria-live="polite"` node that updates **only on keyboard-driven moves**, never on pointer moves — discrete moves announce cleanly, 60 Hz pointer moves would spam. |
| **Global state** | None. No `onFilterIntent`, `onTimeIntent`, `onEntityIntent` in the props type — the intents are absent from the type, not merely unused, so a future wiring is a compile error. No store import in the module. |
| **Map** | Nothing. Hover does not dim, filter, recolour, or move the map. The `beyond2km` overlay remains an independent explicit control (same sentence as §1.4). |
| **Selection** | Nothing. The chart neither creates nor clears an entity selection; a selected Commune stays selected and the rank bars keep their pin. It cannot highlight that Commune at all — `GridCell` has no `commune_code` (§A note 3). |
| **Cost** | Model: one O(N) pass over ≤ 29,763 rows plus an O(lattice) finalize, run once per snapshot on first expand. Hover/keyboard: O(1) — one lattice index. Collapse/expand with an unchanged `cells` reference rebuilds nothing. |

---

## F. STATES

Four typed states, four distinct strings. None of them is an empty axis frame — Phase 4
§6.1 item 4: a missing dependency must state its reason, because a blank plot reads as
"measured, and there is nothing there".

| State | Condition | Render |
|---|---|---|
| **Loading** | Expanded, `cells.length === 0` (snapshot not resident) | `Đang nạp lưới ô H3…` with `role="status"`. No axes. |
| **Unavailable — dataset without column** | `gridColumnAvailable("dist_station_network_m") === false` | `Gói dữ liệu này không có cột cự ly mạng đường, nên không dựng được bằng chứng cầu × tiếp cận.` The disclosure still renders, **disabled**, with the reason visible — a silently absent block is indistinguishable from a block that was never built. |
| **Empty** | Snapshot resident, column present, **zero** plottable pairs | The §C counts line alone, plus `Không ô nào có đủ cả dân số lẫn cự ly mạng đường.` No axes, no marks. |
| **Failed** | Snapshot rejected upstream | Inherits the existing controller-level failure path; the evidence block does not render its own retry. It owns no request, so it must not own a retry. |

**Why "unavailable" is keyed on the column and not on "zero plottable rows".** When the
column is absent, `fetchField` emits `NULL AS dist` for every row (`queries.ts:177`), so the
chart would otherwise fall into the *empty* branch and print "no cell has both values" —
which asserts a measurement that was never attempted. `không áp dụng` and `không biết` are
different facts and the app already draws that distinction for null cells
(`GridCell.reachable`, `queries.ts` docstring). Measured: all 34 province packages carry the
column, so this branch is unreachable with shipped province data — the national `vn/` store's
grid does not carry it, which is why the guard is written rather than assumed.

---

## CONTRACT TABLE

Chart ID: `opportunity-demand-access-scatter` — **evidence, not primary**

| Contract item | Decision |
|---|---|
| **INPUT DATA** | The cached Q-P4-1 field snapshot for the current `datasetId`: `GridCell.pop` and `GridCell.dist` (`dist_station_network_m`), which every cell-field projection already carries. Network distance only. No new query, no new column, no deduplication across packages. |
| **TRANSFORMATION** | Keep rows where `isKnownPopulation(pop)` **and** `isKnownDistance(dist)`. X: composite display domain of §1.2 via the shared `populationPlotFrac` — `=0` slot on `[0, 1/24]`, `log1p` over `[minPositive, maxPop]` on `[1/24, 1]`; the domain is computed over **all** known-population cells, not the plotted subset. Y: `sqrt` over `[0, max plotted distance]`, never clipped. Assign each kept row to one 2 px lattice cell of the 248 × 134 plot box. |
| **AGGREGATION** | Per lattice cell: `n` = cells landing in it, `level = min(n, 6)`, `alpha = 1 − 0.55^level`. Chart-wide: plotted count, zero-population count, null-distance count and the population living in those cells, null-population count, invalid count, known-population total, `minPositivePop`, `maxPop`, `maxDistanceM`, `maxStack`. Conservation: `Σn + n_zero_pop_excluded_cases + n_invalid + n_excluded_distance = cells.length`. |
| **FILTER SEMANTICS** | **None, and none is representable.** No brush, no click-to-filter, no `AnalysisFilter` import. Structurally reinforced: no filter can be active in this lens at all (F1), so the chart has no controlled subset to render and none to emit. |
| **NULL HANDLING** | Null distance: excluded, counted as cells **and** as the population living in them, never drawn at 0 / max / infinity; still hatched on the map. Null population: excluded and counted separately. Negative or non-finite on either axis: excluded and counted as invalid, never silently `NaN`-ed out of the DOM. Exact zero population: **drawn**, in the `=0` slot, at its true distance. |
| **UNIT** | X: persons per H3 r8 cell (~0.74 km²), printed with per-value magnitude suffixes (`1 · 10 · 100 · 1k · 10k`). Y: metres along the public-drivable road network, printed through `scaleUnit` + `withDigits` + `formatSeries` in one scale for the whole tick series — km on every shipped package. Mark: one lattice cell ≈ up to `n` H3 cells; alpha is a count, not a rate. |
| **DOMAIN** | X: composite — one categorical `=0` slot, then positive `[minPositive, maxPop]` through `log1p`; never truncated; an all-zero dataset renders only the zero slot (§1.2 rule inherited). Y: `[0, max plotted distance]`, zero-anchored, `sqrt`-positioned, **never capped** — the trimmed tail of the Access Curve is the very population this chart exists to show. |
| **AXIS** | A vertical separator divides the `=0` slot from the positive pane, same as §1.2. X title `Dân số trên ô H3 · người`; Y title `↑ cự ly tới trạm · km, theo mạng đường` from the registered `UnitSpec`. All tick labels are inverse-transformed real values; no logarithm and no square root reaches the screen. A **2 km rule hairline** with an `INK_2` label is always present when data exists, importing `BEYOND_2KM_M` — the label says *ngưỡng quy định*, never *break*. |
| **TOOLTIP** | No floating tooltip (§3). The fixed `Readout` strip carries the inverse-transformed cursor coordinates plus the stack count of the lattice cell under the cursor, and states plainly when that cell is empty. It never names an individual H3 cell. |
| **MAP INTERACTION** | None. Hover and keyboard do not dim, filter, recolour, subset, or move the map, and issue no query. The `beyond2km` overlay remains an independent explicit control. |
| **SELECTION INTERACTION** | None. Neither creates nor clears an entity selection; the Commune selection pinned by the primary rank bars is untouched. A selected-Commune highlight is not specifiable under this CR: `GridCell` carries no `commune_code`, and adding it would change the Q-P4-1 projection. |

---

## THRESHOLD PROVENANCE TABLE

| Edge / break / constant | Provenance | Note |
|---|---|---|
| `=0` slot on X (and its `1/24` width) | **DATA-DRIVEN** | Exact-zero mass is a schema fact — 111,096 zero-population cells corpus-wide, independently re-measured here and identical to the count CR 4.1 §A cites. The `1/24` width is the §1.2 layout constant (1 zero slot + 23 positive bins), inherited so a histogram bar and a scatter strip describe the same interval. |
| `log1p` positioning of X over `[minPositive, maxPop]` | **PRESENTATION** | Inherited verbatim from the Demand histogram (`chart-models.ts:147–150`), the chart that owns population positioning in this app. Not copied from any map scale — the Demand map paints `sqrt` (CR 4.1 §B). Chart-local and disclosed; the filter, URL, Inspector and map field are untouched by it (§1.2's closing rule applies unchanged). |
| Decade X ticks `1 · 10 · 100 · 1k · 10k` | **PRESENTATION** | Same derivation as `PopulationHistogram.tsx:142–157`, now from the shared helper. Values are real populations, positioned by the transform; the transform never prints. |
| `sqrt` positioning of Y | **PRESENTATION** | Not invented here: `dist_station_network_m` registers `scaleContract: TOGGLE_SQRT_MIN_P99` (`fields.ts:690`), so the chart shares the transform the field itself declares. Chosen over `linear` and `log1p` by measurement (§B table). |
| Y domain `[0, max plotted distance]`, **no clip** | **DATA-DRIVEN**, with a declared divergence | Diverges from the field's `MIN_P99` map clip and from the Access Curve's weighted-P99 cap. Reason and cost measured: capping would delete 6.0–8.9% of plotted marks — the farthest ones — and push the 2 km rule to 5.1–8.5% of the plot height on the large packages. |
| **2 km rule hairline** | **DOMAIN THRESHOLD** | `BEYOND_2KM_M` from `domain-thresholds.ts`, imported — never retyped. Same registered constant as the `beyond2km` overlay, the `pop_beyond_2km` column, Q-P4-4 and §1.6's rank measure. *Observation (F3): `AccessCurve.tsx:20` still declares a local `CALLOUT_M = 2_000` for the same rule, contradicting CR 4.1 §A. Out of scope here; flagged for a separate one-line ticket.* |
| `BASE_ALPHA = 0.45` | **PRESENTATION** | §4d thin-mark ink rule, now with the measurement: at the map's `MUTED_ALPHA` (0.25) a lone mark measures ΔE 3.85 against a gridline — below the §4b floor of 6. At 0.45 it measures 10.72 against the gridline and 17.45 against the panel. |
| Stack level cap `6` | **PRESENTATION** | Not a data break: beyond 6 the composite is within ΔE 0.89 of full saturation — inside CR 4.1 acceptance test 9's ΔE ≤ 1.0 tolerance. It bounds the DOM to 6 mark nodes at no visible cost. |
| 2 px lattice | **PRESENTATION** | Equal to the mark size, which is what makes the analytic alpha exact. Chosen so the 248 × 134 plot box divides evenly (124 × 67 = 8,308). Measured occupancy 1,773–3,608 across the five largest packages. |
| Series ink | **registry, not a threshold** | `seriesColorForTheme(theme)` with `theme` from `LensChartController` — `#c77a07` (`screening`) in this lens, matching the 4.1 lens sweep. No hard-coded hue, no second data hue, no colour scale. |
| `sc` scale mode | **not applicable** | INDEPENDENT: no value-colour channel exists to follow (CR 4.1 §D, Opportunity row). |

---

## ACCEPTANCE TESTS

Unit (`node --test`, pure modules):

1. **Registry separation** — `EVIDENCE_CHART_IDS ∩ PRIMARY_CHART_IDS = ∅`; `LENSES` still resolves exactly five unique `primaryChart` values; `PrimaryLensChart`'s exhaustive `never` arm is unchanged; the evidence meta declares `emitsFilter/emitsTime/emitsEntity = false`.
2. **Emits nothing, structurally** — the presenter's props type contains no intent callback; grep: `ui/Scatter.tsx` imports nothing from `state/brush`, `state/store`, or `state/analysis-events`, and contains none of `ScatterBrush`, `SCATTER_X`, `SCATTER_Y`, `useDragRect`, `onBrush`.
3. **No filter is reachable in this lens** — for all three doors (`bootFilter`, the `hashchange` reducer, `switchLens`), a valid Demand `between` filter plus an Opportunity field yields `filter.active === null`. Pins F1.
4. **X parity with the histogram** — for every one of the 23 positive bins, `populationPlotFrac(bin.x1, domain) === bin.plotX1` (exact), and `populationPlotFrac(0, domain) ∈ [0, 1/24]`. Run against `buildDemandPopulationHistogram` output on the same fixture.
5. **Extraction is behaviour-neutral** — the existing Phase 4 histogram tests pass unchanged after `buildDemandPopulationHistogram` and `decadeTicks` are rewired to the shared helper.
6. **Domain independent of the null pattern** — nulling `dist` on every row leaves `minPositivePop`, `maxPop` and every mark's X unchanged.
7. **Null distance excluded and counted** — a fixture row with `dist: null` produces no mark, increments `nExcludedDistance`, adds its population to `popExcludedDistance`, and no mark exists at `y = 0` or at `y = max`.
8. **Zero population is drawn** — `{ pop: 0, dist: 1500 }` produces exactly one mark whose column lies inside the zero slot and never in the positive band.
9. **Invalid guard** — `pop: -1`, `dist: -1`, `dist: NaN`, `dist: Infinity` rows are excluded and counted; no mark coordinate is `NaN`.
10. **Conservation** — `Σ marks[i].n + n_excluded_distance + n_null_population + n_invalid === cells.length`, on both a synthetic fixture and a 29,763-row generated input.
11. **Overplot alpha** — `overplotAlpha(n) === 1 − 0.55 ** Math.min(n, 6)`; `overplotAlpha(1) === 0.45`; strictly increasing on 1..6; constant for `n ≥ 6`.
12. **Bounded DOM** — with 200,000 synthetic rows the model yields at most 8,308 lattice cells and the presenter emits at most 6 mark nodes.
13. **Identity token** — add `ui/Scatter.tsx` to the `chartFiles` list of `test/phase41-chart-encoding.test.ts` acceptance 7: no `const SERIES = RAMP_HEX…`, no palette call with a string-literal theme, no hard-coded `theme =` default.
14. **2 km from one constant** — `ui/Scatter.tsx` imports `BEYOND_2KM_M`; grep asserts the module contains no `2000` / `2_000` literal.
15. **Y unit from the registry** — the `UnitSpec` handed to the axis is `===` to `FIELD_BY_ID.get("dist_station_network_m").unit`; with `yMax = 21161` the label is `km` and `formatSeries` returns one shared digit count across the ticks.
16. **X labels are inverse-transformed** — decade ticks render `1 · 10 · 100 · 1k · 10k`, filtered to `[minPositivePop, maxPop]`; no tick text equals a `log1p` value.
17. **Zero SQL** — a query spy records zero statements across: enter Opportunity, expand, 200 pointer moves, 200 arrow keys, collapse, re-expand.
18. **Lazy build** — the builder is not called while collapsed, is called once on first expand, and is not called again on collapse → re-expand with an unchanged `cells` reference.
19. **Read-only under keyboard** — `useStore.getState()` is deep-equal before and after a full arrow/Home/End/Esc sweep.
20. **States are distinct** — column-absent, snapshot-empty, zero-plottable and failed each render a different string, and none renders an axis frame.

Render (CDP, same harness as `docs/qa/phase41/`):

21. **Collapsed by default** — Opportunity opens with the disclosure closed, the rank bars in the primary slot, and zero mark nodes in the DOM.
22. **Lattice fidelity** — on `p/01`, a reference draw of all 4,397 individual marks at α 0.45 versus the 6-level lattice draw: per-pixel ΔE ≤ 1.0 across the plot box (CR 4.1 tc9 tolerance), and the sparse far/populous corner is present in both.
23. **Thin-mark legibility** — an isolated single-cell mark, measured from the rendered PNG, sits ≥ 6 ΔE from the panel and from a gridline (predicted 17.45 / 10.72).
24. **2 km rule survives both extremes** — the rendered hairline measures ≥ 6 ΔE against both a level-1 and a level-6 mark field (predicted 10.72 / 28.31).
25. **Registry ink** — the mark fill in the Opportunity lens measures `#c77a07`, the same value `docs/qa/phase41/lens-ink-sweep.json` recorded.
26. **No layout shift** — expanding does not clip the GIỚI HẠN section, and the `Readout` strip keeps its `h-4` height at every hover position, including the longest readout string (the `children ? children : hint` trap and the two-line-readout trap both re-checked).
27. **Story witness** — the three scenes of the 4.1 witness set re-render pixel-identical; `StorySurface` mounts no scatter.
28. **Recorded, not gated** — archive per package the occupied-lattice count and the max stack (`p/01` 1,773 / 14; `p/68` 3,338 / 34) alongside the renders. These are measurements of the data, not thresholds this CR may invent.

---

## REGRESSION SCOPE

**Expected: a §1.7 row update, and nothing else in the approved contracts.**

- **Phase 4 §1.7** — the `Demand × Access Scatter` row changes from *"Keep code; defer UI activation"* to *"Activated as Opportunity evidence: read-only, collapsed, emits nothing"*, with the F1 note that the brush concern is now answered structurally. The `SupplyLorenz` row is **not** touched — this CR builds the evidence slot but activates exactly one chart in it.
- **Phase 4 §5.1** — one added invariant: an evidence chart ID cannot be registered as a `PrimaryChartId`. The "exactly five" invariant is unchanged and re-asserted by AT-1.
- **Phase 4 §1.2 / CR 4.1 §A (Demand)** — no contract change. One no-behaviour-change extraction (`populationDisplayDomain` / `populationPlotFrac`), guarded by the existing histogram tests (AT-5), plus `formatPop` moving to `ui/format.ts`.
- **Phase 4 §1.6 (Opportunity primary)** — untouched. Same model, same events, same slot; the evidence block renders below it and reads a different snapshot field.
- **Phase 4 §2 FILTER CONTRACT** — untouched, and AT-2/AT-3 make it harder to break than before. `state/brush.ts` is **not** revived: it remains reachable only from the unmounted `ui/Histogram.tsx`, so §5.5 step 5 still holds.
- **Phase 4 §3 EVENT MODEL** — untouched. No new intent, no new reducer action, no new hash key. The disclosure state is component-local by design.
- **Phase 3 (Inspector)** — untouched. No shared component, no shared model, no change to `EvidenceCard`/`EvidenceSection`.
- **Phase 5 (search / presets)** — untouched. No preset can target this chart (no filter, no field, no hash surface); `presetStats` and `SearchBar` read the same `cells` snapshot and are unaffected; zero new SQL.
- **Phase 6 (simulation)** — untouched. The simulation runs its own zone query (`simulation/zone-query.ts:48`) and never mutates `cells`, so no simulated station can move a mark. Smoke only.
- **Phase 7 (story)** — untouched. `StorySurface` mounts `PowerTierBreakdown`, `AccessCurve`, `OpportunityCommuneRankBars`, `Heatmap168` and `SupplyLorenz`; it does not mount the scatter, and no scene gains a claim. AT-27 is the witness.
- **Phase 8 (data health / export)** — untouched: values, not encodings; the raw data table reads the same columns.
- **CR 4.1 §C2 / §D** — extended by one row each: `ui/Scatter.tsx` joins the identity-token grep list, and the §D table gains an `INDEPENDENT` row for the scatter.
- **Carried, not fixed (declared debt):** `AccessCurve.tsx:20`'s local `CALLOUT_M = 2_000` (F3), and `buildAccessPopulationCurve`'s `c.pop ?? 0` (`chart-models.ts:347`) which folds a future null population into zero rather than counting it as §1.4 requires. Both are pre-existing, both are outside this CR's scope, both are recorded here so the next CR does not rediscover them.

---

**SCATTER EVIDENCE SPEC READY**
