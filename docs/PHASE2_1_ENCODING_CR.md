# Phase 2.1 — CR: Lens Registry Encoding Contract (3D color · gradient scale · continuous elevation)

Status: **PHASE 2.1 CR SPEC READY**
Type: change request against the Phase 2 Lens Registry encoding contract. Not a redesign.
Scope is exactly three items: (1) 3D extruded color legibility, (2) legend perceptual
uniformity + optional continuous gradient scale, (3) elevation losing within-tier magnitude.
Everything not listed under IMPACT MAP is out of scope and must not drift in.

## 0. CR claims verified against the code and the published data

Before specifying anything, each CR claim was checked. Two are confirmed with different
root causes per map; one is only half true, and the half that is false is worse.

| CR claim | Verdict | Evidence |
|---|---|---|
| 3D color is semi-transparent and over-dark | **CONFIRMED, province map.** | `map/MapView.tsx` extrudes `H3HexagonLayer` with fill alpha **217** and **no `LightingEffect` at all** — deck.gl's default lighting shades the faces, uncalibrated, inside an `interleaved: true` overlay that shares the basemap depth buffer. The national map is the counter-example: alpha 225 + a measured lighting rig (`NationalMap.tsx`: top-face shift median 16 vs inter-class distance 44). |
| Elevation is derived from binned tiers | **TRUE at national, FALSE at province — and the province rule is worse.** | `national/elevation.ts`: `elevation = MAX_ELEV_M × (k+1)/n` — 7 steps, within-tier magnitude lost by design (documented as dual-encoding). `map/MapView.tsx:1008`: `min(2500, √v·35 + 20)` — continuous but **field-blind**: measured on the Hanoi grid, 8.4 % of `population` cells and 11.5 % of `pop_density` cells silently plateau at 2,500 m, while `util_cell`'s tallest possible block is **37 m** (invisible). Color and height read **two different domains** for the same cell. |
| Legend is binned/threshold only | CONFIRMED. | `ui/Legend.tsx` renders swatch rows from `Scale.breaks` only; no gradient path exists. |

## 1. LENS SCALE MATRIX (data-backed)

Measured on the published exports: Hanoi root set (`web/public/data/`, 4,400 r8 cells;
939 stations; 115,931 road segments; 168h profile joined to `n_ports` per
`stationOccAt()`), the 34-province store (`p/*`, 425,778 r8 cells — per-province sweep,
min→max across provinces), and the national r6 grid (9,813 cells). Figures verify this
export; runtime numbers keep coming from the loaded scale/manifest (§7c).

| Lens | Field driving the ramp (default first) | Null share | Zero share | Skew | max/p99 | Gradient verdict | Transform | Clip |
|---|---|---|---|---|---|---|---|---|
| **Demand** | `cell:population` | 0 % everywhere (34/34) | Hanoi 3.1 %; province median **21 %**, worst 55.4 % (p 44) | 5.2 (HN) → 19.7; r6 national 20.6 | 1.9 (HN) → 16.3 (r6, p 20) | **Toggle** — heavy right tail but zeros are true values and the field is never null; a light zero-anchored gradient tells the truth | `sqrt` (log is out: true zeros) | `[0, p99]` |
| **Supply** | `station:ports` (point); extrudable cells: `cell:n_ports`, `cell:power_kw_site` | stations 2.8 % (26/939), 3.4 % national | cells **90.0–99.8 % zero** across 34 provinces | 18.2 (HN) → 115.7 | 11.7 (HN) → ∞ (provinces where p99 = 0) | **Fixed binned.** A continuous ramp would spend the whole range on an indistinguishable near-zero mass while the top 1 % of cells holds 43–58 % of the total. The existing zero-class + quantile bins are the only honest structure. | — (elevation channel: `sqrt`) | — (elevation: `[0, p99]`) |
| **Access** | `road:dist_station_m` (line); extrudable cell: `cell:dist_station_network_m` | roads 0.2 % (HN); cells 0.1 % (HN) → **66.6 %** (p 56) — a hatch problem, not a scale problem | 0 % everywhere | 1.4–2.4 — the tamest family | ≤ 2.4 in all 34 provinces | **Toggle** — best gradient candidate in the atlas: no zero inflation, bounded tail | `sqrt` (median sits at ~0.51 of the ramp instead of 0.26 under linear) | `[min, p99]` |
| **Utilization** | `station:occ` = `occ/n_ports` (point, [0, 1]) | hollow-dot 28.5 % of the 939×168 lattice (3 known causes, unchanged) | 15.5 % exact 0 — observed idle, a true value | 0.90 | 1.12 (p99 = 0.894, max = 1.0) | **Toggle** — physically bounded ratio, near-symmetric; the textbook gradient case | `linear` | none (physical bounds 0–1) |
| **Opportunity** | `cell:screen_margin_m` (diverging at 0) | 0 % in current export (contract for future nulls stays) | 0 % | 0.72 (HN); positive arm up to 14.1 in sparse provinces | 1.6 (HN) → 8.2 | **Toggle, as a two-arm diverging gradient with a hard pivot** — both sides present in all 34 provinces (neg share 1.6 %–59.5 %); the pivot must stay a discontinuity, never interpolated through | `linear` per arm | neg arm: none (rule-bounded at −2,000); pos arm: `[0, p99⁺]` |

Non-default fields inherit the lens verdict only if they match its shape; each field
declares its own contract (see §2). Categorical (`screen_decision`,
`evidence_grade_distance`) and bool fields never gradient. `pop_beyond_2km`
(44.5 % zeros, skew 13.3) is **fixed binned** despite living in a toggle lens.

Rejected alternatives, with the measurement that killed them:

- **Log transform for demand/supply** — true zeros in every province (3–55 % of cells);
  log1p was rejected too because its readable region depends on the unit scale, which
  varies 10³ between `population` and `built_frac`.
- **Quantile-continuous gradient** (equalized histogram) — it makes the same color mean a
  different value in every province and breaks the §3b doctrine that the legend prints
  real thresholds. Quantiles remain what the *binned* mode is for.
- **Gradient for supply cells** — with p99 = 0 in several provinces the domain collapses;
  there is nothing to interpolate.

## 2. SCALE TYPE CONTRACT (A)

**Declaration, not inference.** `VisualContract` (in `fields.ts`) gains one member, declared
per field like `unit`/`polarity`/`diverge` — the compiler enumerates missing fields, per the
established registry doctrine:

```
scaleContract: {
  color: "fixed-binned" | "toggle";        // may this field render a gradient at all
  transform: "linear" | "sqrt";            // shared by gradient color AND elevation
  clip: { lo: "min" | 0; hi: "p99" | "none" };  // shared domain for both channels
}
```

- `transform`+`clip` are **one domain for two channels** (color-when-gradient, elevation
  always). The current province defect is precisely two domains for one cell.
- Percentiles are computed on the loaded dataset's non-null values at scale-build time
  (same place `computeClassing` runs), never hard-coded.
- Diverging fields apply `clip` per arm; the pivot `at` is never clipped away.

**Toggle semantics.**

- Scale type is **user-selectable only on fields declared `"toggle"`**; default is binned
  for every field (the Phase 2/4 QA'd behavior is the default state, so this CR cannot
  regress a passed QA by default).
- On `"fixed-binned"` fields the control is **disabled with a reason** (§3a: a control that
  cannot apply is dimmed, not silently ignored), reason text from the registry.
- **State: URL hash.** DESIGN §9 — the hash is a serialization of state, and anything that
  changes what the map asserts must be shareable/reproducible (QA screenshots, story
  links). New key `sc`: absent = binned, `sc=g` = gradient. Unknown values fall back to
  binned (§15a pattern). Not runtime-only, not localStorage: a saved link must reproduce
  the exact picture.

## 3. COLOR CONTRACT (B)

**Single source.** `THEME_PALETTES` (7 anchors per theme) + `diverge` arms +
`DIVERGE_NEUTRAL_HEX` remain the only color truth. The gradient is **not a new palette**:
it is an interpolation through the same 7 anchors.

- **Interpolation space: OKLCH** (hue along the shorter arc; gamut-clip by reducing chroma
  at constant L). sRGB interpolation is rejected — it desaturates midpoints and destroys
  the perceptual-uniformity requirement this CR exists for.
- Built once per theme as a **256-entry LUT at module scope** (like `LIGHTING`), never per
  frame. `colorFor()` stays the single value→color entry point and branches on the scale
  mode internally. `colorFor(null)` returns `null` in both modes — no gradient color for
  null, ever.
- **Uniformity gate** (this is the "perceptual uniformity" acceptance, binned and gradient
  alike): along each theme's LUT, L must be strictly monotonic, and the ΔE between
  adjacent 1/7-arc samples must stay within ±25 % of the mean step. Anchors that fail get
  re-anchored through the `validate_palette` gate — known debt: `screening`'s lightest
  anchors sit below 2.0:1 on `#f2f3f0` (`#ffe5a1` ≈ 1.1:1). **A theme whose light anchor
  fails the 2.0:1 basemap floor blocks gradient mode for its sequential fields** until
  re-anchored; the `screening` *diverging arms* (L 0.73/0.575/0.42) already pass, so the
  Opportunity default field is not blocked.

**2D vs 3D variant.**

- Same anchors, same LUT. The only difference is **alpha and lighting**.
- 2D: fill alpha stays 217 (province) / 225 (national) — translucency is doing its
  designed job there (basemap context shows through).
- 3D: **fill alpha 255, opaque.** Legibility in 3D comes from opacity + a calibrated
  lighting rig, never from alpha — per the CR's own constraint. Alpha-blended extrusions
  in an interleaved depth buffer are the confirmed root cause of the murk.

**Lighting model (one contract, two render situations).**

Adopt the national map's measured rig as the shared constant for every extruded layer:

- `material: { ambient: 0.7, diffuse: 0.55, shininess: 1, specularColor: [0,0,0] }`
- `AmbientLight` intensity 1.26 + `DirectionalLight` intensity 0.25, steep direction
  `[-0.45, 0.6, -1.15]`.
- **Invariant: `mat.ambient×amb + mat.diffuse×dir ≈ 1.0`** — the top face must render the
  legend swatch, unlit-equal. Lighting is only allowed to darken side faces.
- Shadows only where deck owns the render pass: national (standalone canvas) keeps
  `_shadow: true`, `shadowColor` alpha 0.14. The province map is `interleaved: true`, where
  the shadow pass is unreliable (documented M0 constraint) — province 3D gets the same
  lights **without `_shadow`**; depth is carried by directional side shading.
- **Top-face fidelity gate** (the measurement that already exists nationally becomes the
  contract): per-pixel L1 shift of lit vs unlit top faces — median must stay under half
  the minimum inter-class color distance (national baseline: 16 < 44/2).

**Null / not-applicable / filtered.** Unchanged and explicitly protected:

- Never enter the LUT, never extrude (height 0), never receive lighting-tinted ramp color.
- Material stays the state-angled hatch (§6.4); in 3D the flat+hatched combination makes
  them distinct on two channels at once.
- Distinctness gate: composited hatch vs the lightest *rendered* ramp step ≥ the §4b ΔE
  floor (6–8) — re-measured in gradient mode because the gradient's light end sits lower
  than bin c1.
- Brush-excluded marks keep `#898781` @ 0.25 ink-swap (§4e) in both modes.

**Chart alignment.** Charts keep `series` = anchor c4 of the active theme. The gradient
toggle changes map encoding **and the one chart whose hue carries the same measure**
— amended by CR 4.1 §D, which supersedes the original wording of this paragraph:

- **Histograms stay binned in both modes**, and the letter is corrected: the primary
  histogram never used the map's breaks at all. It positions bars on chart-local `log1p`
  display bins (Phase 4 §1.2) and carries no value-colour channel, so `sc` changes zero
  props. A per-bar gradient would invent a second scale — still forbidden.
- **The 7×24 utilization heatmap FOLLOWS the map mode.** Its class breaks are the atlas's
  only map-copied presentation thresholds, so a binned chart beside a gradient map would
  paint the same value two colours — see CR 4.1 §D for the measurement that decided it.

Any future continuous colorbar in a chart must sample the same LUT — no chart-local
interpolation.

## 4. ELEVATION CONTRACT (C)

**Elevation encodes the same variable as color. Always.** Dual encoding is kept from the
national design; what changes is that height stops quantizing.

```
elevation(v) = 0                                   if v is null/NA/filtered
             = maxElev × max(ε, T(norm(v)))        if v is measured
norm(v)      = (clamp(v, lo, hi) − lo) / (hi − lo)         // sequential
             = |clamp(v, lo, hi) − at| / max(|lo−at|, hi−at) // diverging
```

- **`T`, `lo`, `hi` come from the field's `scaleContract` — the same domain the gradient
  color uses.** One domain, two channels; in binned color mode elevation still uses the
  continuous domain (this is CR item 3: color says "tier", height says "how much within
  the tier").
- **Clip = [lo, p99]** is what replaces binning's anti-outlier role. Data: national r6
  `population` max/p99 = **16.3** — one HCMC cell would be 16× taller than the p99 cell
  under an unclipped ramp, which is exactly the "two scales, one legend" failure the
  binned design was protecting against. Clipping keeps 99 % of cells undistorted and the
  plateau is *disclosed* (legend, §5) instead of silent (the current province cap at
  ~5,000 units disclosed nowhere).
- **Floor `ε = 0.02`**: any measured value renders a visible plinth, so "measured zero"
  never reads as "not measured" (the national rule 2, preserved). Null stays exactly 0 +
  hatch. In the current exports the collision is theoretical (extrudable fields with zeros
  have no nulls and vice versa), but the contract keeps the guard.
- **Diverging fields extrude `|v − at|`** with a *single* normalizer across both arms so
  equal meters read as equal height on either side; color carries the side. Legend prints
  "cao = xa mốc". (Rejected: disabling 3D for diverging — it would remove 3D from the
  Opportunity default field; and per-arm normalization — same height would mean different
  meters on each side.)
- **Max elevation.**
  - National r6: `MAX_ELEV_M = 14,000` and the `√7` LOD rule stand — they were calibrated
    by renders and nothing in this CR invalidates that calibration.
  - Province r8: the magic trio (gain 35, +20 m, cap 2,500) is deleted. `maxElev_r8` is
    calibrated by the same normative procedure that produced 14 km: render at the default
    province view, pitch 50°, tallest (= clipped) block ≈ 1–1.5× the on-screen width of an
    r8 cell (~0.92 km ground). **Provisional value 1,800 m**; the number is finalized by
    the render gate, not by this document.
  - `elevationFor(value, scale, max)` keeps its pure signature and its test home
    (`national/elevation.ts` logic generalizes; the province map imports the same function
    instead of owning a private formula).
- **Polarity and diverge still do not enter elevation** — height = magnitude of the named
  quantity (or distance-from-pivot), in every lens. The invariant "cao = giá trị lớn"
  gains one printed exception for diverging fields and no silent ones.

## 5. LEGEND CONTRACT (D)

**Binned legend: unchanged.** Swatch row, counts, open-ended `→ max`, `classingNote`,
null-state chips — all Phase 2/4 QA'd behavior stays byte-identical in binned mode.

**Gradient legend (new branch in `ui/Legend.tsx`).**

- The bar is rendered from **≥ 16 LUT samples** (CSS gradient stops), never from a 2-stop
  CSS blend of the end hexes — the browser would re-introduce sRGB interpolation and undo
  the OKLCH work.
- Ticks at `lo`, median, `hi`, positioned through `T` (non-uniform tick spacing *is* the
  transform disclosure), labeled through the existing `scaleUnit → formatSeries` machinery:
  one unit scale for the whole bar, unit label at the right edge of the tick row — the
  three scale-division laws apply unchanged.
- **Clipping disclosure is mandatory**: the right end label reads `≥ {hi}` (never `max`),
  followed by the overflow line `▲ {n} ô vượt trần · lớn nhất {max}` from scale counts.
  A clipped bar whose end says `max` is lying about the ramp; that rendering is forbidden.
- Transform named in `<details>` ("thang căn bậc hai trên miền cắt p99"), keeping the
  "legend stays terse" rule.
- **Diverging gradient**: two bars butt-joined at a visible pivot notch labeled from
  `ends`; the pivot is a hard discontinuity — the two LUT samples adjacent to the pivot
  must hold the §4f categorical gate (**ΔE ≥ 15**, re-measured under deutan/protan).
- The selected-value marker maps through `T` (transform-aware `markPosition`), so the
  marker sits exactly where the cell's color sits.
- **3D row**: "chiều cao = cùng trường · thang {T} · trần p99" — height remains declared
  as not ruler-measurable, inherited from the national legend rule.

**Accessibility (both modes).**

- Bin swatch inks keep the §4c ≥ 4.5:1 gate. Gradient bars carry no on-swatch text; tick
  labels sit below the bar in `ink-muted` on the panel surface (measured 4.90:1 — passes).
- Non-color readability: numeric ticks + hover/panel readout + counts line mean every
  value is reachable without color discrimination; null/NA/filtered stay hatch-textured
  chips **outside** the bar (never fused into the gradient), keeping the material channel.
- All anchors already pass color-vision gates by construction; the new checks are the two
  gradient-specific ones above (pivot ΔE, light-end 2.0:1 floor).

## 6. IMPACT MAP (E)

**Phase 2 (core of this CR)**
- `fields.ts` — `VisualContract.scaleContract` member + per-field declarations (45 fields;
  the compiler lists the missing ones).
- `viz/palette.ts` — LUT builder, OKLCH interpolation, `NumericScale` gains
  `{mode, domain, transform}`; `colorFor` branches internally.
- `map/MapView.tsx` — 3D path: alpha 217→255 when `is3d`, shared lighting rig (no
  `_shadow`), `elevationForCell` replaced by the shared `elevationFor`; **`getElevation`
  gains `updateTriggers`** (today it has none — currently harmless because height reads
  raw `c.value`; after this CR height depends on scale identity and would silently go
  stale on scale change without it).
- `national/elevation.ts` + `NationalMap.tsx` — `(k+1)/n` → continuous formula; layer
  props otherwise untouched; existing `getElevation` triggers already carry
  `[field.id, scale, mode, res]`.
- `state/hash.ts` + `state/store.ts` — new `sc` key, §15a fallback.

**Phase 3 (inspector)** — light touch: panel rail marker becomes transform-aware
(`markPosition`); numeric readouts unchanged.

**Phase 4 (visualization contract)** — `PHASE4_VISUALIZATION.md` §palette/§legend text
updated; charts intentionally unchanged (see §3 chart alignment); `Legend.tsx` gradient
branch is the one component change.

**Phase 5 (search/presets)** — hash parser accepts `sc`; presets don't set it (they
inherit default binned). Filter `fmt()` interplay: none — filters operate on values, not
on scale mode.

**Phase 6 (simulation)** — one rule inherited: **the scale domain freezes for the life of
a simulation session** (computed on baseline data). A hypothetical station changes
`dist_station_*`; re-deriving p99 per edit would recolor/re-height the whole map under the
user's cursor and turn the comparison into two different scales.

**Phase 7 (story)** — scenes pin `sc` (binned) in their scene spec; every verified claim
was measured against binned classes, so a gradient story frame would be an unverified
statement. A future scene may opt into gradient only by declaring it and re-verifying its
claims.
The pin applies on READ (`effectiveScaleModeOf`): no path may write `store.scaleMode` on
behalf of a scene. That store key holds the viewer's own preference, and a pin that
reaches it survives the story and silently rewrites a choice nobody revoked.

**Phase 8 (health/export)** — no change: null-state counts, exports, and raw table read
values, not encodings.

**Phase 9 must inherit** (the contract, not the code):
1. `scaleContract` in the registry is the *only* place scale type/transform/clip live —
   new layer kinds declare, never infer.
2. The LUT is the only interpolation path; no component blends theme hexes locally.
3. The lighting rig is one shared constant; any new extruded layer uses it and passes the
   top-face fidelity gate.
4. One domain, two channels: any channel added later (e.g. animation intensity) that
   encodes the painted field reads the same `{transform, clip}` domain.
5. Clipping is disclosed wherever the clipped field is PAINTED, whether or not that
   surface builds a legend. The paint is what asserts something about the data; a legend
   is only one way of declaring it. Conditioning the disclosure on "the scale is
   displayed" left story scenes exempt by wording — `StoryColumn` replaces the read
   column, so no legend exists there while scene 1 still paints `pop_density_ppkm2` with
   44 cells over the p99 ceiling and says nothing.

**Phase 10 baseline (deck.gl recompute cost)**
- `getFillColor` triggers gain scale-mode identity → same recompute *frequency* as today
  (scale changes on field/dataset/toggle, not per frame). LUT lookup is O(1) vs the ≤ 7-step
  bin walk — flat.
- New `getElevation` trigger on the province layer: one attribute regeneration per
  scale/toggle change over ≤ 4,400 cells (r8) / 9,813 (r6) / r7 LOD — bounded,
  single-digit ms, no per-frame cost. The gradient toggle costs exactly one fill + one
  elevation recompute per grid layer.
- Scrubber path (`station:occ`): unchanged mechanics — per-`t` recolor of ≤ 939 points now
  through the LUT; no elevation (points don't extrude). FPS budget unchanged.
- Province 3D gains a `LightingEffect` **without** shadows → no extra render pass;
  national keeps its existing shadow pass. Phase 10 must record 2D vs 3D FPS as separate
  baseline rows so the lighting change is attributable.

## 7. REGRESSION SCOPE (F)

Re-QA required, in order of exposure:

1. **Phase 2** — full re-QA of the map encoding path (both maps, 2D/3D × binned/gradient ×
   5 lenses; null/NA/filtered renders; diverging pivot).
2. **Phase 4** — legend (both modes), chart↔map alignment statement, visualization
   contract doc.
3. **Phase 7** — story render pass only: all scenes must render pixel-identical in binned
   mode pre/post CR (scenes pin `sc`); claims re-verification is needed *only if* any
   scene text cites a class boundary that moves (none should — binned classing is
   untouched).
4. **Phase 5** — smoke: hash round-trip with `sc`, presets unaffected, search untouched.
5. **Phase 6** — smoke: sim session renders under frozen domain; calibration race
   unaffected.
6. **Phase 3** — spot-check: panel rail marker position on sqrt-transformed fields.

Not in regression scope: Phase 8 (no encoding dependency), pipeline/Python, data exports.

## 8. ACCEPTANCE TESTS

Unit (node --test, pure modules):
1. **Registry completeness** — every `FieldMeta` with `map !== false` declares
   `scaleContract`; every `"fixed-binned"` declaration carries a reason string.
2. **Toggle refusal** — a `"fixed-binned"` field ignores `sc=g` (scale builds binned) and
   the control model reports disabled+reason.
3. **LUT gates** — per theme: L strictly monotonic along the LUT; adjacent-sample ΔE
   within ±25 % of mean; light end ≥ 2.0:1 vs `#f2f3f0` else gradient blocked for that
   theme's sequential fields (screening expected blocked until re-anchored — the test
   encodes the expectation, not a skip).
4. **Null purity** — `colorFor(null|undefined|NaN)` → `null` in both modes; gradient never
   assigns a color outside `[lo,hi]` clamp.
5. **Diverging pivot** — LUT samples adjacent to the pivot ≥ ΔE 15 (normal + deutan +
   protan); pivot value maps exactly to the notch, both arms clip independently, `at`
   survives clipping.
6. **Elevation properties** — null → 0; measured `lo` → `ε·maxElev` > 0; strictly
   monotonic in `v` on `[lo, hi]`; constant `maxElev` for `v ≥ hi`; diverging: equal
   `|v−at|` → equal height on both arms; `elevationFor.length` unchanged (value+scale
   decide order; `max` stays a unit, not an ordering input).
7. **One domain** — property test: for any `v`, the color position and the elevation
   position derive from the same `{transform, clip}` (no second domain reachable).
8. **Hash** — `sc` round-trips; unknown value → binned; absent → binned; presets emit no
   `sc`.

Render (CDP, swiftshader flags per §11; screenshots archived like the M-national set):
9. **Province 3D fidelity** — alpha 255 + lighting: median per-pixel L1 shift of top faces
   vs unlit 2D swatch < half min inter-class distance; side faces darker than top; no
   basemap bleed-through on faces.
10. **Elevation calibration** — default province view, pitch 50°: tallest block within
    1–1.5× on-screen r8 cell width; `maxElev_r8` recorded with the renders (procedure
    normative, provisional 1,800 m).
11. **Plateau disclosure** — a dataset with max/p99 > 2 shows `≥ {hi}` end label + overflow
    count in gradient mode; binned legend unchanged (snapshot equality with pre-CR).
12. **Null distinctness in 3D** — hatched flat cells visibly distinct (ΔE ≥ §4b floor)
    from the lightest rendered gradient step, measured on the composite render.
13. **Stale-height guard** — switch field then toggle `sc` in 3D: heights re-derive
    (catches missing `getElevation` updateTriggers — the whole map, not the legend, is
    the witness, per the M-P1 lesson).
14. **Story invariance** — all Phase 7 scenes render pixel-identical pre/post CR.

Performance (Phase 10 baseline inputs):
15. Gradient toggle ≤ 1 fill + 1 elevation attribute recompute per grid layer (deck.gl
    counter); scrubber FPS at parity with pre-CR measurement.

---

**PHASE 2.1 CR SPEC READY**
