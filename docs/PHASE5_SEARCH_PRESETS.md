# Phase 5 — Search and Quick Preset Specification

Status: **PHASE 5 SPEC READY**

Scope: the map-surface search field (query normalization, result types, ranking, result cap,
keyboard model, empty states, camera behaviour) and Quick Presets expressed as reusable,
dataset-resolved filter definitions. It adds no new analytical metric, no recommendation, no
score, and no adequacy adjective.

This specification extends the Phase 2 lens registry, the Phase 3 `EntitySelection`
contract, and the Phase 4 `AnalysisFilter` contract. Where it contradicts current code, the
contradiction is stated with its measurement in §0.

---

## 0. Verification and high-risk findings

### 0.1 The dataset that was measured

Every number in this document was measured against the package the app actually opens.
`web/src/data/province.ts` pins `DEFAULT_PROVINCE_BUNDLE = "01"` and `parseDataset()`
returns `{province: null, national: false, proxy: false}` unconditionally, so the loaded
package is **`web/public/data/p/01/`**, `manifest.exported_utc = 2026-08-11T19:09:19+00:00`.
The root-level copies (`web/public/data/*.parquet`, `*.geojson`, `manifest.json`) are
byte-identical (md5 verified for `stations`, `grid_h3_r8`, `commune`, `poi`, `manifest`).

### 0.2 What is actually searchable

| Entity | Rows | Load timing | Text usable as a query target | Verdict |
|---|---:|---|---|---|
| Commune | 126 | boot, eager | `commune_name` (126/126, all distinct, all distinct after normalization), `commune_code` (5 digits), `commune_kind`, `province_name` | **searchable** |
| Station | 939 (710 `IN`, 229 `BUFFER`) | boot, eager | `name` 939/939 (934 distinct), `address` 939/939 (896 distinct), `station_id` 939 unique, `station_code` 939 unique, `commune_name` 710/939 | **searchable** |
| H3 Cell | 4 400 | with the active Cell field snapshot | `h3_r8`, 15 lowercase hex, every value prefixed `884` | **searchable, conditionally** (§0.3-D) |
| POI | 5 896 | lazy, 3.00 MB | `name` on 4 391 (74.5%); 3 857 distinct normalized names | **deferred** (§1.3.2) |
| Road | 115 931 | lazy, 2.84 MB | shipped columns are `osm_id`, `road_class`, `coords`, `dist_station_m`, `bridge` — **no name column** | **not searchable** |
| Province | 34 | national surface only | not present in the `p/01` package | **out of scope** |

`commune_name` is null on stations exactly when `scope = 'BUFFER'` (229 of 229, measured);
it is therefore a *conditional* secondary field, not a missing one.

### 0.3 Defects in the shipped search that Phase 5 resolves

**A — Commune subtitle and one match branch read a field that does not exist.**
`web/src/ui/search.ts:92-101` reads `p["district_name"] ?? p["ten_huyen"]` and
`p["commune_name"] ?? p["ten_xa"]`. The 21 properties present in `commune.geojson` are
`anchor_ratio, area_km2, area_km2_geom, commune_code, commune_kind, commune_name,
dist_station_m_pop_weighted, n_ports, n_stations, pop_density_ppkm2, pop_source, population,
population_wp, ports_per_10k_pop, power_kw_site, province_code, province_name, published,
quality_flag, util_mean_port_weighted, valid_from`. `district_name`, `ten_huyen` and `ten_xa`
are absent. Consequence: the district match branch is dead, and every commune subtitle
degrades to `Mã xã: <code>`. `web/test/search.test.ts:54` asserts the district branch against
a fixture that invents `district_name`, so the test passes while the feature cannot work.

**B — Stations are searchable only by an identifier no human types.**
`search.ts:123-126` matches `normalizeSearchText(s.id)` only, where `id` is `station_id`
(`vn-c-ac000091`). `fetchStations()` (`queries.ts:772-774`) does not even select `name`,
`address` or `operator`, so the fields that carry every human-recognisable string are not in
memory. Measured reach of the missing fields: `vinhomes` matches 112 names / 86 addresses,
`vincom` 17 / 14, `times city` 12 / 10, `long bien` 14 / 18.

**C — No ranking exists; the caps truncate by file order.**
Each block breaks out of its loop at `count >= 5` (communes, stations) or `>= 3` (cells).
The five communes returned are the first five in GeoJSON feature order, not the five best
matches. Every commune name begins with its administrative classifier, measured: 75 `Xã …`,
51 `Phường …`, and `commune_kind` agrees with the leading token on 126/126 rows. So a raw
prefix strategy returns 0 results for `ba dinh` and 51 results for `phuong` — the exact
inversion of intent.

**D — H3 Cell search availability depends on the active field, silently.**
`App.tsx:176-177` passes `cells = meta.readAs === "cell" ? activeCellSnapshot?.rows ?? [] :
cellSnapshot?.rows ?? []`. A session that never loads a Cell field has `cells = []`, and the
search reports "not found" for a valid H3 code. On `p/01` this is not reachable in practice
(`FIRST_FIELD = "population"`, a Cell field) but it is reachable on any package lacking
`population`, where `App` falls back to `DEFAULT_FIELD = commune:ports_per_10k_pop`.

**E — The H3 gate is too loose to be useful, and its cap is arbitrary.**
`search.ts:141` gates on `q.startsWith("8")`. Measured prefix discrimination over the 4 400
codes:

| prefix length | distinct groups | largest group |
|---:|---:|---:|
| 3–4 | 1 | 4 400 |
| 6 | 3 | 1 978 |
| 7 | 11 | 924 |
| 8 | 80 | 98 |
| 9 | 688 | 7 |
| 10 | 4 400 | 1 |

Below 9 characters, "the top 3" is an arbitrary slice of up to 924 indistinguishable cells.

**F — `flyTo` forces `pitch: 0, bearing: 0`.**
`SearchBar.tsx:83-91` writes `pitch: 0`. `setMode("3d")` sets `pitch: 50` but does not read it
back, so choosing a search result in 3D leaves `mode === "3d"` with a flat camera and the
extrusion layers still mounted. Outside a scene the camera **jumps** (`MapView.tsx:369`,
`m.jumpTo(to)`), so the transition is instantaneous by design, not by omission.

**G — A single zoom cannot serve communes.**
Measured commune bounding-box maximum span: min 1.93 km (Phường Hoàn Kiếm), P25 4.53 km,
median 7.96 km, P75 10.38 km, max 15.54 km (Xã Đa Phúc) — an **8.1× range**. At the hard-coded
`zoom: 12.5` the scale is 25.23 m/px at latitude 21°, so the same control renders those two
communes at 77 px and 616 px of horizontal extent.

**H — The empty state cannot distinguish "no match" from "not loaded yet".**
`SearchBar.tsx:180-183` renders `Không tìm thấy…` whenever `results.length === 0`, including
while `communes === null` and `stations === []` during boot.

**I — Phase 4's filter serializer silently narrowed range bounds. FIXED 2026-08-19.**
`state/filter.ts` wrote bounds through `Number(v.toFixed(4))`. Measured on the 4 400
`population` values: 4 265 need more than four decimals; **2 140 (48.6%) were lowered** by
that rounding and **2 125 (48.3%) raised**. Because `filterKeepsCell` is inclusive on both
ends and brush bounds are actual cell values (Phase 4 §1.2), a `[0, v]` brush lost its
boundary cell for **2 140 of 4 400** values and a `[v, max]` brush for **2 125 of 4 400** —
never gaining one, so the error ran in a single direction: the subset silently shrank. Sender
saw 441 cells, recipient saw 440, no error anywhere.

`fmt()` now emits the shortest decimal that reads back as the identical double, so
`parse(serialize(b)) === b`. Re-measured through the shipped `serializeFilter`/`parseFilter`
and the full `serializeHash`/`parseHash` path over all 4 400 values: **0 subsets shrink,
0 grow, 0 clauses fail to parse**. The §9a `hashchange` convergence property that motivated
the rounding is strengthened — lossless writing converges on the first pass, not the second.
Regression tests: `P4-SER` (4 tests) in `web/test/filter.test.ts`. Cost: mean 7.98 → 16.88
characters per bound.

Directional rounding (`lo` down, `hi` up at 4 dp) also measured 0 lost on this package and
kept the shorter URL, but was rejected: its guarantee holds only while no two cells sit within
1e-4 of a bound — a property of today's data, not of the function — and it needs a correction
branch for the case where `v * 1e4` is itself inexact, a branch this dataset never exercises.

**J — `PHASE4_VISUALIZATION.md` §1.3's verification table does not describe this package.**
It lists IN Station tier counts 1 056 / 2 523 / 1 834 / 575 / 172 / 220, total 6 380. The
loaded package has 710 IN Stations. Measured tier counts are in §2.4. The Phase 4 table
should be re-scoped to the corpus it was taken from; Phase 5 presets use the measured
numbers, not the published ones.

### 0.4 Product decisions

1. **Search is a navigator, not a filter.** Choosing a result moves the camera and sets the
   `EntitySelection`. It never changes `field`, `lens`, `layers`, `t`, or `filter`. When the
   chosen entity falls outside the active subset, the Inspector already says
   `Ngoài tập lọc hiện tại` (`EvidenceCard.tsx:172`); reuse that, do not clear the filter.
2. **A Quick Preset is a filter definition, not a button handler.** It is declared data,
   resolved against the loaded package, and applied through one store transition.
3. **Presets carry no adequacy language.** Phase 4 §1.3 forbids `slow/fast/rapid/ultra-fast`
   for power tiers without an approved domain standard; that prohibition extends to preset
   labels, which name intervals and measurements only.
4. **A preset whose predicate the Phase 4 filter union cannot express is not shipped as a
   UI-only effect.** It is listed as blocked with the exact contract delta (§2.5).
5. **No latency claim is made anywhere until §6 has run** and its numbers are attached to a
   named artifact, browser and machine.

---

## 1. SEARCH CONTRACT

### 1.1 Ownership

| Concern | Owner |
|---|---|
| Normalization, index construction, ranking, capping | `web/src/ui/search.ts` — pure, no React, no DuckDB, testable under `node --test` |
| Input, popup, keyboard, ARIA, empty-state copy | `web/src/ui/SearchBar.tsx` |
| Camera + selection transition | `useStore.searchNavigate()` (new, §1.8) |
| Corpus supply | `App.tsx` → `AtlasReadColumn` → `SearchBar`, unchanged plumbing |

Search runs on the **map surface only**. Story, Data, National and Proxy surfaces read
different packages through their own loaders and are out of scope.

### 1.2 Query normalization

`normalizeSearchText` is the single normalization function. Both the query and every indexed
string pass through it; no call site may normalize differently.

| Step | Rule | Why, measured |
|---|---|---|
| 1 | `toLowerCase()` | — |
| 2 | `normalize("NFD")` then drop `\p{Mn}` | Folds every Vietnamese tone and the horn/breve/circumflex marks. `ơ` (U+01A1) decomposes to `o` + U+031B (category `Mn`), so no separate rule is needed. |
| 3 | `đ → d` | `Đ` (U+0110) has a stroke, not a combining mark; NFD does not decompose it. Step 1 has already produced `đ`, so the current `.replace(/Đ/g, "d")` is dead code and is removed. |
| 4 | Fold `,` `.` `-` `+` `/` `_` `(` `)` to a single space | 456 of 939 station names contain one of these; 933 of 939 `station_code` values contain `.` (`C.AC000091`); one commune name does (`Phường Văn Miếu - Quốc Tử Giám`). Without this, `c ac000091` and `van mieu quoc tu giam` both fail. |
| 5 | Collapse runs of whitespace to one space | 30 station names and 17 addresses contain a double space. |
| 6 | `trim()` | — |

The function is idempotent: `normalize(normalize(x)) === normalize(x)`. This is asserted, not
assumed, because ranking compares a normalized query against a pre-normalized index.

**Commune core name.** Every commune name begins with its classifier and `commune_kind`
confirms it on 126/126 rows. The index stores three strings per commune:

- `full` — normalized `commune_name` (`phuong ba dinh`);
- `core` — `full` with the leading classifier removed **only when it equals the classifier
  implied by `commune_kind`** (`PHUONG → "phuong "`, `XA → "xa "`), giving `ba dinh`;
- `code` — `commune_code`.

Deriving `core` from `commune_kind` rather than by string-stripping means a future commune
genuinely named `Xã Xã Tắc` is not mutilated. If the leading token disagrees with
`commune_kind`, `core === full` and a console warning names the row.

Matching uses `core` when the query does not itself start with a classifier token, and `full`
when it does. Measured effect on `p/01`: `ba dinh` goes from 0 prefix matches to 1;
`phuong` still reaches all 51 wards.

### 1.3 Result types

#### 1.3.1 Shipped types

```ts
export type SearchResultKind = "commune" | "station" | "cell";

export interface SearchResult {
  /** Globally unique; identical to the hash `c` wire form. Also the React key. */
  readonly id: string;                 // "commune:00004" | "station:vn-c-ac000091" | "<h3_r8>"
  readonly kind: SearchResultKind;
  readonly title: string;              // raw, accented, never the normalized form
  readonly subtitle: string;
  readonly center: readonly [number, number];   // [lng, lat]
  /** Set only for Commune; Station and Cell derive zoom at navigation time (§1.8). */
  readonly bbox: readonly [number, number, number, number] | null;
  readonly score: MatchScore;          // §1.4, retained for tests and the benchmark
}
```

| Kind | Primary match fields | Secondary match fields | Title | Subtitle |
|---|---|---|---|---|
| `commune` | `core`, `full`, `commune_code` (exact or prefix) | — | `commune_name` | `commune_kind` label · `Mã <commune_code>` · population if `population` is non-null |
| `station` | `name`, `station_code`, `station_id` | `address`, `commune_name` (null on all 229 BUFFER rows), `operator` | `name` | `address`, truncated; then `IN`/`vành đệm 5 km` tag; then `<n_ports> cổng` when `n_ports` is non-null |
| `cell` | `h3_r8`, exact 15 chars or prefix ≥ 9 (§0.3-E) | — | `Ô H3 <h3_r8>` | `<population> người` when known · `<dist_station_network_m>` when known |

Station titles are not unique: 6 normalized names repeat (`cua hang xang dau quang minh`,
`vincom plaza long bien, ham b1`, …). The subtitle must therefore carry `address`, which is
present on 939/939 rows and distinct on 896.

`operator` is a secondary field but a weak one: 933 of 939 rows are `VinFast`. It is indexed
so that `s.touch` (2 rows) and `trạm sạc tiền mặt` (2 rows) are reachable, and it is scored at
the `SECONDARY` tier so `vinfast` cannot flood the list.

#### 1.3.2 POI — deferred, with its gate

POI is present (5 896 features) and would be a legitimate fourth type, but three measured
facts block it in Phase 5:

1. `poi.geojson` is 3.00 MB and lazy by design (`queries.ts:610-612`); making it searchable
   either forces the download on every session or makes result availability depend on
   whether an overlay happens to be on — a worse failure than absence.
2. 1 505 of 5 896 features (25.5%) have no `name`, and the named remainder collapses to 3 857
   distinct normalized names, with `ct2` ×19, `ct1` ×18, `a1` ×13. A result list of nineteen
   rows titled `CT2` is not navigation.
3. `EntitySelection` (`state/selection.ts:27-31`) has no POI branch. A POI result would write
   `contextSelection` instead, so it would behave differently from every other result.

POI enters search when all three are answered: a `poi` branch exists in `EntitySelection`, the
index is built from a small name-only sidecar rather than the geometry file, and the subtitle
disambiguates duplicates (group + commune). Until then the type is not offered and nothing in
the UI implies it exists.

### 1.4 Ranking

Ranking is a total order. Two results never depend on array order, and the same corpus with
the same query always produces the same list.

```ts
export interface MatchScore {
  readonly tier: MatchTier;   // higher wins
  readonly offset: number;    // index of the match in the matched string
  readonly length: number;    // length of the matched string
}
```

| Tier | Value | Definition |
|---|---:|---|
| `EXACT_ID` | 100 | Normalized query equals `commune_code`, `station_id`, normalized `station_code`, or a full 15-char `h3_r8` |
| `PREFIX_ID` | 80 | An identifier starts with the query, and the query passes that identifier's minimum length: 2 for `commune_code`, 3 for `station_id`/`station_code`, **9 for `h3_r8`** (§0.3-E) |
| `NAME_PREFIX` | 60 | The primary name (`core` for communes, `name` for stations) starts with the query |
| `WORD_START` | 40 | The query matches at a word boundary inside the primary name |
| `SUBSTRING` | 20 | The query occurs anywhere in the primary name |
| `SECONDARY` | 10 | The query matches only a secondary field (`address`, station `commune_name`, `operator`) |

A candidate keeps its **highest** tier only; it never appears twice.

Tie-breaks, applied in order until one discriminates:

1. `tier` descending;
2. `offset` ascending — an earlier match is a better match;
3. `length` ascending — `Xã Đa Phúc` outranks `Xã Đa Phúc Thượng` for `da phuc`;
4. normalized title ascending, compared with `<` on the ASCII-folded string (locale-free, so
   the order does not change with the runtime's ICU data);
5. `id` ascending — globally unique by construction, so the order is total.

Result **kind** is deliberately not a tie-break. A commune does not outrank a station because
it is a commune; it outranks it because it matched better. Kind is conveyed by the row icon.

**Minimum query length is 2.** A one-character query reaches `WORD_START` on hundreds of rows
and every cap over it is arbitrary. Below 2 characters the popup shows the hint state (§1.6).

### 1.5 Maximum result count

| Limit | Value | Basis |
|---|---:|---|
| Per kind | 5 | Keeps one kind from evicting the others when it dominates (`vinhomes` matches 112 station names) |
| Global | **10** | Applied **after** ranking and after the per-kind cap, never during the scan |
| Visible without scrolling | ~5 | Measured: `text-title` 12 px × 1.4 + `text-note` 10 px × 1.4 + `py-2` (8 + 8 px) + 1 px divider ≈ 47.8 px per row; the popup is `max-h-64` = 256 px → 5.35 rows |

Because 10 > 5.35, keyboard navigation **must** call `scrollIntoView({block: "nearest"})` on
the active option. Without it, `ArrowDown` moves an invisible cursor — the current component
has no such call.

When ranking discards matches, the popup states it: `Còn N kết quả khác — gõ thêm để thu hẹp.`
Silent truncation is indistinguishable from complete coverage, which is the failure Phase 4
§4.4's "no silent caps" rule exists to prevent.

### 1.6 States

The popup has five states. `results.length === 0` is not one condition but three.

| State | Condition | Copy |
|---|---|---|
| Hidden | Field not focused, or focused with an empty query | — |
| Hint | `0 < normalized query length < 2` | `Gõ thêm một ký tự…` |
| Loading | Query ≥ 2 **and** (`communes === null` or `stations.length === 0`) | `Đang nạp dữ liệu…` |
| Empty | Query ≥ 2, corpus ready, 0 results | `Không tìm thấy xã, phường hay trạm sạc nào cho "<query>".` |
| Results | ≥ 1 result | list |

Two disclosures attach to the Empty and Results states rather than being separate states:

- **Cell corpus absent.** When the query matches `^[0-9a-f]{9,15}$` and `cells.length === 0`
  (§0.3-D): `Chưa nạp lớp Ô H3 — chọn một trường của Ô để tìm theo mã H3.` This states the
  cause instead of reporting a false negative.
- **Truncation.** The `Còn N kết quả khác` line from §1.5.

The `aria-live="polite"` region announces the state, not just the count: loading, empty,
`N kết quả`, and the truncation remainder when present.

### 1.7 Keyboard interaction

| Key | Context | Behaviour |
|---|---|---|
| `/` | Document, not in an input/textarea/contenteditable, no modifier | Focus the field, open the popup, `preventDefault` |
| `⌘K` / `Ctrl+K` | Document, anywhere including inputs | Focus and select existing text |
| `↓` / `↑` | Popup open | Move the active option, wrapping; then `scrollIntoView({block:"nearest"})` |
| `Home` / `End` | Popup open | First / last option |
| `PageDown` / `PageUp` | Popup open | ±5 options, clamped, not wrapping |
| `Enter` | Popup open with an active option | Navigate (§1.8), close, clear the query |
| `Enter` | Popup open with no results | No-op; do not close |
| `Esc` | Field focused, query non-empty | Clear the query, keep focus, keep the popup open in the Hint state |
| `Esc` | Field focused, query empty | Close the popup and blur |
| `Tab` | Popup open | Close the popup, then default focus movement — never trap focus |

Two corrections to the current implementation:

- `Esc` currently closes and blurs in one step at every query length, so clearing a typo
  costs a re-focus. The two-step behaviour above matches the WAI-ARIA combobox pattern.
- `activeIndex` must be **clamped** to `results.length - 1` whenever the result list changes,
  not reset to `0`. The corpus arrives asynchronously; today an `activeIndex` left past the
  new end makes `Enter` a silent no-op.

`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, and
`role="option"` + `aria-selected` are already correct in `SearchBar.tsx` and are preserved.
Pointer hover sets the active option (already implemented) and must not scroll the list.

### 1.8 FlyTo behaviour

One store action owns the transition, because camera and selection must change in the same
commit or the Inspector renders against the previous entity for a frame:

```ts
searchNavigate: (result: SearchResult) => void;
```

| Rule | Decision | Basis |
|---|---|---|
| Movement | `jumpTo`, i.e. set `view` and let `MapView` jump | `MapView.tsx:368-369` flies only inside a Story scene; outside one a camera change is a command executed immediately. Search is a command. |
| `pitch`, `bearing` | **Carried over from the current `view` unchanged** | Fixes §0.3-F. Forcing `pitch: 0` leaves `mode === "3d"` with a flat camera and the extrusion layers mounted. |
| Commune zoom | Derived from the feature bounding box: the zoom whose viewport fits `max(span_x, span_y) × 1.15`, clamped to `[10, 15]` | Fixes §0.3-G: spans range 1.93–15.54 km, 8.1× |
| Commune centre | Bounding-box centre | Cheap and adequate for a bbox-derived zoom. The polygon centroid is **not** used: for a multi-part commune it may sit outside the commune, which is worse than a slightly off-centre fit. |
| Station zoom | `max(currentZoom, 14.5)` | A point has no extent; never zoom *out* from a closer view the user chose |
| Cell zoom | `max(currentZoom, 13.5)` | H3 r8 ≈ 0.74 km²; same no-zoom-out rule |
| Selection | `selection = parseEntitySelection(result.id)`; `contextSelection = null` | All three shipped kinds are valid `EntitySelection` wire forms |
| Filter | **Untouched.** If the entity is outside the subset, the Inspector shows `Ngoài tập lọc hiện tại` | Phase 4 §1.2 already defines this; search must not add a second rule |
| Field, lens, overlays, `t`, `mode` | Untouched | Search navigates; it does not reconfigure the analysis |
| Hash | `c` and `v` change; every other key is untouched | Existing `syncHash` debounce applies |

After navigation the query is cleared and the popup closes, so the hash reflects a place, not
a search session. The query string never enters the URL: it is an input, not analytical state.

---

## 2. QUICK PRESET CONTRACT

### 2.1 What a preset is

A Quick Preset is **declared data** that names one question and resolves to one
`AnalysisFilter`. It is not a click handler, not a sequence of store calls, and not, in the
words of `docs/visual-research.md`, "an untyped, all-purpose configuration blob".

Three properties follow, and each is testable:

1. **Serializable.** A preset's effect is fully described by the `AnalysisFilter` it resolves
   to, so it round-trips through the existing hash key `b` with no new key and no new parser.
2. **Reversible.** Clearing the filter undoes the preset completely; there is no residue.
3. **Inert on its own.** Declaring a preset changes nothing until `applyPreset` runs, and
   nothing outside `applyPreset` reads a preset.

### 2.2 Typed contract

```ts
export type PresetId =
  | "demand-top-decile"
  | "demand-zero-population"
  | "supply-ge-61kw"
  | "supply-le-22kw"
  | "supply-power-unknown";

/** A bound is declared, not written as a literal, so it can be resolved per package. */
export type ThresholdSpec =
  | { kind: "literal"; value: number }
  | { kind: "quantile"; q: number }          // over analysable values only (§2.3)
  | { kind: "extreme"; at: "min" | "max" };

export type PresetFilterSpec =
  | { entity: "h3-cell"; field: "population"; op: "between"; lo: ThresholdSpec; hi: ThresholdSpec }
  | { entity: "station"; field: "power-tier"; op: "in"; values: readonly PowerTierId[] };

export interface QuickPreset {
  readonly id: PresetId;
  /** Interval and measurement language only — no adequacy adjective (Phase 4 §1.3). */
  readonly label: string;
  /** One line naming the question, shown as the control's accessible description. */
  readonly question: string;
  readonly lens: LensId;
  /** Registry-qualified field id; must satisfy isFilterCompatible() with `lens`. */
  readonly field: string;
  readonly filter: PresetFilterSpec;
  /** Columns that must exist in the loaded package, else the preset is hidden. */
  readonly requires: readonly string[];
}
```

`PresetFilterSpec` is deliberately a **subset** of the Phase 4 `AnalysisFilter` union shape,
not a parallel language. A preset cannot express a predicate the filter cannot express, so
"the preset does something the filter chip cannot describe" is unrepresentable.

### 2.3 Threshold resolution

```ts
export function resolvePreset(
  preset: QuickPreset,
  stats: PresetStats,
  datasetId: DatasetId,
): AnalysisFilter | null;
```

`PresetStats` is derived once per dataset session from data already resident — the
`population` Cell snapshot and the boot Station snapshot — and holds sorted non-null
`population` values plus the per-tier Station counts. It issues **no query of its own**.

Resolution rules:

- `quantile` is computed over **analysable values only**: `isKnownPopulation(pop)` is true, so
  `null`, `NaN` and negatives are excluded. This is the same predicate the filter itself uses
  (`state/filter.ts:251-253`), so the resolved bound and the applied predicate agree by
  construction. On `p/01` the two populations coincide — 0 nulls, 0 negatives — but they will
  not on a package where `population` is partly missing.
- Interpolation is **linear between order statistics**, stated so the number is reproducible
  from the parquet with one line of pandas or DuckDB.
- `extreme.max` resolves to the maximum analysable value.
- The result passes through `canonicalFilter()` before it reaches the store, so a preset
  cannot construct a filter that the hash parser would reject.
- `resolvePreset` returns `null` when any `requires` column is absent from the manifest, and a
  preset resolving to `null` is **hidden**, not shown disabled. A control that is present but
  inert claims the analysis exists.

### 2.4 Verified preset catalogue

Every threshold below was measured against `p/01` on the columns named. No literal in this
table is hand-written into a component.

**Source columns.**

- `population` — `grid_h3_r8.parquet`, `double`, **4 400/4 400 non-null**, min `0`, max
  `46232.44099893726`, 135 exact zeros, no negatives, total `8 831 126`.
- `power_kw_max_port` — `stations.parquet`, `double`, **912/939 non-null** (27 null →
  `unknown`). Exactly 11 distinct nameplate values: `7.4` (1), `11` (56), `20` (145),
  `22` (19), `30` (161), `60` (186), `80` (7), `120` (281), `150` (10), `180` (29), `250` (17).
  Each closed tier edge — 22, 60, 120, 180 — is an observed nameplate, so the Phase 4 cuts sit
  on modes rather than between them.
- `scope` — `IN` 710 / `BUFFER` 229. Supply presets aggregate `isInScope(scope)` only, per
  Phase 4 §1.3.

**Catalogue.**

| id | Lens · field | Resolved predicate | Bound on `p/01` | Matches |
|---|---|---|---|---|
| `demand-top-decile` | Demand · `population` | `h3-cell population between [q0.90, max]` | `[4450.0907, 46232.441]` | **440 of 4 400 cells (10.00%)**, holding **4 846 303 of 8 831 126 persons (54.88%)** |
| `demand-zero-population` | Demand · `population` | `between [0, 0]` | `[0, 0]` | **135 cells (3.07%)**, 0 persons |
| `supply-ge-61kw` | Supply · `station:ports` | `power-tier in {61-120, 121-180, gt-180}` | — | **257 of 710 IN Stations (36.20%)** |
| `supply-le-22kw` | Supply · `station:ports` | `power-tier in {le-22}` | — | **173 of 710 (24.37%)** |
| `supply-power-unknown` | Supply · `station:ports` | `power-tier in {unknown}` | — | **19 of 710 (2.68%)** |

Measured tier distribution over the 710 IN Stations, which is what these presets partition:

| tier | IN Stations | share | all 939 |
|---|---:|---:|---:|
| `le-22` | 173 | 24.37% | 221 |
| `23-60` | 261 | 36.76% | 347 |
| `61-120` | 221 | 31.13% | 288 |
| `121-180` | 25 | 3.52% | 39 |
| `gt-180` | 11 | 1.55% | 17 |
| `unknown` | 19 | 2.68% | 27 |
| total | 710 | 100% | 939 |

**Label rules.** `supply-ge-61kw` is labelled `Cổng mạnh nhất ≥ 61 kW`, never "fast" or
"rapid". `demand-top-decile` is labelled `10% ô đông dân nhất` with the resolved bound printed
beside it, because a decile whose value is hidden is a number the reader cannot check.
`supply-power-unknown` is labelled `Chưa rõ công suất cổng` — it is a data-provenance preset
and must read as one.

**Required repairs before these ship.**

- **R1 — `canonicalFilter` rejects a full-set tier selection.** `state/filter.ts:165-166`
  maps a set of all six tiers to `null`. None of the three tier presets selects all six, so
  none is affected, but the rule is why a "select every tier" preset can never exist.
- **R2 — Preset application must be atomic.** See §2.6.
- **R3 — Bound serializer (§0.3-I). DONE 2026-08-19, ahead of the rest of Phase 5.**
  `fmt()` is lossless, so a filter `[v, v]` still matches its own cell for every `population`
  value. The blocker on `demand-top-decile` is cleared; the `P4-SER` tests guard it.

### 2.5 Presets the Phase 4 filter union cannot express

These are real questions with verified data. None is shipped in Phase 5, and none may be
implemented as map-only dimming: they change which rows are in the analysis, so they belong to
the filter contract or nowhere.

| Candidate | Required union member | Verified data on `p/01` |
|---|---|---|
| Cells beyond the 2 km road-network rule | `{entity:"h3-cell"; field:"dist-station-network"; op:"between"}` | 2 560 of 4 400 cells (58.18%) exceed `BEYOND_2KM_M`; 1 837 within; **3 null** (`network_reachable = false` on exactly those 3); max 21 161.0 m. Population beyond: 2 547 727 (28.85%). |
| Stations not currently serving | `{entity:"station"; field:"op-status"; op:"in"}` | IN Stations: `OPERATIONAL` 618, `MAINTENANCE` 57, `OUT_OF_SERVICE` 30, `UNKNOWN` 5 |
| Cells with no installed port | `{entity:"h3-cell"; field:"n-ports"; op:"between"}` | 3 962 of 4 400 cells have `n_ports = 0`; 449 cells have `n_stations > 0` |

Each addition costs one union member, one `canonicalFilter` branch, one `serializeFilter`
branch, one `parseFilter` branch, one `filterKeeps*` branch and one `isFilterCompatible`
mapping. The distance preset additionally needs a `missing` policy: `dist_station_network_m`
is null on 3 cells and, unlike `population`, "unknown distance" is a category Phase 4 §1.4
already treats as reportable rather than excludable.

### 2.6 Application semantics

A preset carries a `lens`, a `field` **and** a `filter`. Applying it with the existing API is
order-dependent and lossy in one direction:

- `setField(f)` then `setFilter(x)` — works;
- `setFilter(x)` then `setField(f)` — `setField` runs `isFilterCompatible` and clears the
  filter it was just given, emitting the `field-incompatible` notice (`store.ts:265-280`).

Encoding that ordering in a component is exactly the hard-coded UI side effect this phase
forbids. Phase 5 adds one action that performs a single `set()`:

```ts
applyPreset: (preset: QuickPreset) => void;
```

Within that one commit it writes `field`, `filter` (already canonicalized), and
`demandRepresentation` — the third because `setField` resets it and a preset must not leave a
representation belonging to the previous field. It does not touch `layers`, `selection`,
`contextSelection`, `t`, `mode` or `view`: a preset changes what is being analysed, not where
the camera is or what is selected.

`applyPreset` is idempotent. Re-applying the active preset is a no-op, because
`applyFilterIntent` returns the identical `FilterState` reference when `filterEquals` holds,
so `revision` does not advance and no memo keyed on it recomputes.

**Active state.** A preset control renders as pressed when
`filterEquals(state.filter.active, resolvePreset(preset, stats, datasetId))` **and**
`state.field === preset.field`. It is derived, never stored: a stored "active preset" would be
a second source of truth that drifts the moment the user brushes the histogram to a range that
happens to equal the preset's.

**Deactivation.** Pressing the active preset calls `clearFilter("user")`, which restores the
full subset but leaves the field where it is. Reverting the field too would move the map for a
filter action, which §0.4-1 forbids.

### 2.7 URL

No new hash key. A preset resolves to an `AnalysisFilter`, which the existing `b` key already
serializes, and to a `field`, which `f` already carries. A link that came from a preset and a
link that came from an equivalent brush are byte-identical, and that is correct: the subset is
the state, the route to it is not.

---

## 3. EVENT MODEL

| Intent | Source | Effect | Must not touch |
|---|---|---|---|
| `SearchQueryChanged` | input | local component state only | store |
| `SearchResultActivated` | Enter / click | `searchNavigate` → `view`, `selection` | `field`, `filter`, `layers`, `t`, `mode` |
| `PresetApplied` | preset control | `applyPreset` → `field`, `filter`, `demandRepresentation` | `view`, `selection`, `layers`, `t` |
| `PresetCleared` | active preset control, or the existing filter chip | `clearFilter("user")` | `field`, `view`, `selection` |

The two intents are disjoint by construction: search writes camera and selection and never the
filter; a preset writes the filter and never the camera. Neither can trigger the other, so the
Phase 4 §2.4 feedback-loop rule holds without a new guard.

The query string is not store state, is not in the hash, and does not survive navigation.

---

## 4. QUERY PLAN

Search and presets add **no new SQL**. The named reads they consume all exist:

| Consumer | Read | Already issued by |
|---|---|---|
| Commune index | `commune.geojson` via `fetch` | `fetchCommunes()` at boot |
| Station index | Q-P4-2 Station core | `fetchStations()` at boot |
| Cell index | Q-P4-1 field snapshot | `fetchField()` for the active Cell field |
| `PresetStats` | the same two snapshots | — |

Two honest exceptions, stated rather than rounded away:

1. **Station index needs three columns that are not currently selected.** `name`, `address`
   and `operator` must be added to the `SELECT` in `fetchStations()` (`queries.ts:772-774`).
   This extends Q-P4-2's projection; it adds **no second scan** and no second query, matching
   the precedent Phase 4 §1.3 set when it added `power_kw_max_port` to the same read. The
   byte cost is measured in §6, not asserted here.
2. **A Demand preset applied from another lens may issue one Q-P4-1.** `fetchField` caches per
   `(GRID, field.id)` for the session (`queries.ts:221-233`), so the first application from a
   session that never loaded `population` issues one field snapshot and every later one issues
   zero. Supply presets issue zero always, because the Station snapshot is loaded at boot.

Index construction is one pass per corpus per dataset session, memoized on the array identity
that `App` already keeps stable. Typing does not rebuild it.

---

## 5. COMPONENT PLAN

| Module | Change |
|---|---|
| `web/src/ui/search.ts` | Replace `filterSearchResults` with `buildSearchIndex(corpus)` + `rankSearchResults(query, index)`. Keep `normalizeSearchText` as the single normalizer, with steps 4–5 of §1.2 added and the dead `Đ` rule removed. Remove `calculateGeometryCenter`'s hard-coded `[105.8, 21.0]` fallback: a feature with no coordinates is dropped from the index, not placed in the middle of Hà Nội. |
| `web/src/ui/SearchBar.tsx` | Five states (§1.6), keyboard table (§1.7), `scrollIntoView` on the active option, `activeIndex` clamped rather than reset. |
| `web/src/ui/QuickPresets.tsx` | New. Renders `PRESETS.filter(p => resolvePreset(p, stats, datasetId) !== null)`; derives pressed state; calls `applyPreset`. Contains no threshold and no store sequencing. |
| `web/src/state/presets.ts` | New. `QuickPreset`, `PresetFilterSpec`, `ThresholdSpec`, the `PRESETS` table, `resolvePreset`, `presetStatsFrom`. Pure; no React, no DuckDB, testable under `node --test`. |
| `web/src/state/store.ts` | Add `searchNavigate` and `applyPreset`. No other action changes. |
| `web/src/state/filter.ts` | `fmt()` gains directional rounding (§2.4-R3). No contract change. |
| `web/src/data/queries.ts` | `fetchStations()` selects `name`, `address`, `operator`; `StationPoint` gains the three optional fields. |
| `web/src/components/atlas/ReadColumnSlots.tsx` | A `presets` slot beside the existing `search` slot. |
| `web/test/search.test.ts` | Rewritten. Fixtures are built from the real property names in `commune.geojson`; the invented `district_name` fixture is deleted. |
| `web/test/presets.test.ts` | New. §7. |

---

## 6. BENCHMARK METHOD

**No latency figure — in the read column, in this document, in a review, or in a commit
message — until this harness has run and its output is attached to a named artifact, browser
build, and machine.** The sections above contain zero timing claims, and that is deliberate.

Search is pure in-memory JavaScript, so `bench.ts`'s DuckDB timing loop does not measure it.
`bench.html` gains a second section that shares the existing `WARMUP = 3` / `RUNS = 15`
constants and `pct()` so the two halves of the report are comparable.

### 6.1 Corpus

The real `p/01` package, loaded through the production loaders — `fetchCommunes()`,
`fetchStations()`, `fetchField(population)` — not synthetic fixtures. Recorded alongside every
timing: 126 communes, 939 stations, 4 400 cells, and the byte sizes of `commune.geojson`,
`stations.parquet` and `grid_h3_r8.parquet` from a `HEAD` request, using the existing
`bytesOf()` helper.

### 6.2 Two measurements, never summed

| Measurement | What runs | Frequency in production |
|---|---|---|
| `INDEX` | `buildSearchIndex(corpus)` | once per dataset session |
| `QUERY` | `rankSearchResults(q, index)` | once per keystroke |

Reporting a single "search time" would hide which of the two a regression landed in.

### 6.3 Query set

Committed in the repo, not typed at run time, so successive runs are comparable. 20 queries,
each chosen to exercise a named path, with its measured `p/01` selectivity:

| Query | Path exercised | Candidates before the cap |
|---|---|---:|
| `ba dinh` | commune `NAME_PREFIX` after classifier stripping | 1 |
| `phuong` | commune classifier query, `full` matching | 51 |
| `xa` | classifier, largest commune bucket | 75 |
| `ha` | commune `WORD_START` vs `SUBSTRING` split | 7 word-start of 17 substring |
| `00004` | commune `EXACT_ID` | 1 |
| `van mieu quoc tu giam` | punctuation folding (§1.2 step 4) | 1 |
| `vinhomes` | station worst case | 112 name + 86 address |
| `vincom` | station mid case | 17 name + 14 address |
| `times city` | multi-word station | 12 name + 10 address |
| `long bien` | station name + address split | 14 + 18 |
| `c ac000091` | `station_code` after `.` folding | 1 |
| `vn-c-ac000091` | `station_id` `EXACT_ID` | 1 |
| `s.touch` | rare `operator`, `SECONDARY` tier | 2 |
| `vinfast` | dominant `operator`, must not flood | 933 |
| `884143625dfffff` | cell `EXACT_ID` | 1 |
| `884143625` | cell 9-char prefix, the minimum accepted | 7 |
| `884` | below the cell minimum, must return no cells | 0 |
| `đống đa` | full diacritics + `đ`, must equal the `dong da` result | 1 (`Phường Đống Đa`) |
| `q` | below the 2-char minimum, Hint state | 0 |
| `zzzzz` | Empty state | 0 |

### 6.4 Protocol

For each query: 3 warm-up calls discarded, then 15 timed with `performance.now()`. Report p50
and p95 per query, and the maximum p95 across the set. Run `INDEX` the same way, from a cold
index each iteration. Emit the rows to `window.BENCH_SEARCH` exactly as `bench.ts` emits
`window.BENCH`, and print corpus counts and artifact bytes on the same line, so a slow p95 is
always read next to the volume that produced it.

### 6.5 Interaction budget, measured in the real app

Timing a pure function does not prove the typing experience. A second pass runs in the app
with `PerformanceObserver({ entryTypes: ["longtask"] })` active, driving each query of §6.3
character by character at 50 ms intervals into the real input.

Recorded: every Long Task (≥ 50 ms) during the run, with its attribution. Search and preset
work must contribute **zero** Long Tasks. Preset application is driven the same way, with each
of the five presets applied from each of the five lenses (25 transitions).

### 6.6 Gates

Structural gates are asserted now, because they are exact:

- **G1** — Typing issues **zero** DuckDB statements. Assert by counting statements in
  `data/duckdb.ts` across a full query-set run.
- **G2** — Applying a Supply preset issues **zero** statements. Applying a Demand preset
  issues **at most one** Q-P4-1, and **zero** on every subsequent application in the session.
- **G3** — `INDEX` runs at most once per dataset session across the whole query set.
- **G4** — Zero Long Tasks attributable to search or preset work (§6.5).
- **G5** — `rankSearchResults` allocates no result array larger than the global cap of 10
  after ranking. Candidate accumulation before ranking is unbounded by design and its size is
  reported, so truncation is visible rather than assumed.

Absolute-millisecond gates are **not** set in this document. §4.4 of Phase 4 established the
reason and it applies unchanged: DuckDB-WASM and browser timings depend on machine, cache and
build, so a threshold invented before a baseline distribution exists is a number that will be
tuned to whatever the first run produced. The first run of §6.4 **is** the baseline; the
threshold is proposed in a follow-up with the run attached.

---

## 7. ACCEPTANCE TESTS

### 7.1 Normalization

1. `normalizeSearchText` folds every Vietnamese tone, `đ`/`Đ`, and the horn/breve/circumflex
   marks; `Đống Đa → dong da`, `Phường Ngọc Hà → phuong ngoc ha`.
2. It is idempotent on all 126 commune names, all 939 station names, all 939 addresses.
3. `,` `.` `-` `+` `/` `_` `(` `)` fold to a space; `C.AC000091 → c ac000091`;
   `Phường Văn Miếu - Quốc Tử Giám → phuong van mieu quoc tu giam`.
4. Whitespace runs collapse; the 30 station names containing a double space match their
   single-space query form.
5. No call site normalizes by any other means — asserted by grep in the test.

### 7.2 Index and corpus

6. Every commune fixture uses only the 21 property names present in `commune.geojson`;
   `district_name`, `ten_huyen` and `ten_xa` appear nowhere in `web/src`.
7. `core` is derived from `commune_kind`, and equals `full` when the leading token disagrees.
8. A commune feature with empty geometry is dropped from the index, not centred on
   `[105.8, 21.0]`.
9. Station index includes `name`, `address`, `operator`; `commune_name` is indexed only on the
   710 rows where it is non-null.
10. Roads are absent from the index, and a test asserts `roads.parquet` ships no name column.

### 7.3 Ranking and cap

11. Ranking is total: shuffling the corpus does not change the result list for any query in
    §6.3.
12. `ba dinh` returns `Phường Ba Đình` at rank 1 with tier `NAME_PREFIX`.
13. `vinfast` does not return more than 5 stations, and does not evict the commune results.
14. An H3 query shorter than 9 characters returns zero cells; `884` returns zero cells.
15. A 15-character `h3_r8` returns exactly that cell, at tier `EXACT_ID`.
16. Global cap is 10, applied after ranking; the truncation line reports the exact remainder.
17. A candidate never appears twice; only its highest tier is kept.

### 7.4 States and keyboard

18. Query length 1 renders Hint, not Empty.
19. `communes === null` with a 2-char query renders Loading, not Empty.
20. A valid 9+ character H3 query with `cells.length === 0` renders the cell-corpus
    disclosure, not a bare "not found".
21. `activeIndex` is clamped, not reset, when the corpus arrives; `Enter` after a corpus
    change activates a real result.
22. `Esc` with a non-empty query clears and keeps focus; `Esc` with an empty query blurs.
23. Every option is reachable by keyboard and `scrollIntoView` is called for options past the
    5th.
24. The live region announces state, not only count.

### 7.5 Navigation

25. `searchNavigate` preserves `pitch` and `bearing`; navigating in `mode === "3d"` leaves
    pitch unchanged.
26. Commune zoom is bbox-derived and clamped to `[10, 15]`; Hoàn Kiếm and Đa Phúc resolve to
    different zooms.
27. Station and Cell navigation never decrease `zoom`.
28. `field`, `filter`, `layers`, `t` and `mode` are identical before and after navigation.
29. Navigating to an entity outside the active subset keeps the filter and shows
    `Ngoài tập lọc hiện tại`.

### 7.6 Presets

30. Every `PRESETS` entry passes `isFilterCompatible(resolved, preset.lens, fieldReadAs)`.
31. `resolvePreset` returns `null` when a `requires` column is absent, and such a preset is
    hidden rather than disabled.
32. `demand-top-decile` resolves on `p/01` to `[4450.0907, 46232.441]` and selects exactly
    440 of 4 400 cells.
33. `demand-zero-population` selects exactly 135 cells.
34. `supply-ge-61kw` selects exactly 257 of 710 IN Stations; `supply-le-22kw` 173;
    `supply-power-unknown` 19.
35. Every quantile is computed over `isKnownPopulation` values only, and a fixture with nulls
    and negatives proves the exclusion.
36. `applyPreset` is one `set()`: writing `field` and `filter` in either order externally is
    unrepresentable, and applying a Demand preset from the Supply lens keeps the filter.
37. `applyPreset` is idempotent — re-applying does not advance `filter.revision`.
38. Pressed state is derived from `filterEquals` + `field`, and a hand-brushed range equal to
    a preset's bound renders that preset as pressed.
39. A preset round-trips through the hash: apply → `serializeFilter` → `parseFilter` →
    `filterEquals` holds.
40. **For every one of the 4 400 `population` values `v`, the filter `[v, v]` still matches
    its own cell after `serializeFilter` → `parseFilter`.** Landed as `P4-SER` in
    `web/test/filter.test.ts` (§2.4-R3, done).
41. No preset label contains `nhanh`, `chậm`, `siêu nhanh`, `fast`, `rapid`, `slow` or
    `ultra`, asserted by regex over `PRESETS`.
42. No numeric threshold literal appears in `QuickPresets.tsx`, asserted by regex.

### 7.7 Query plan

43. A full query-set run issues zero DuckDB statements (G1).
44. Supply preset application issues zero statements; the first Demand preset application
    issues at most one Q-P4-1 and later ones zero (G2).
45. `buildSearchIndex` runs at most once per dataset session (G3).

---

## 8. Acceptance gate

Phase 5 is accepted only when:

- search matches only fields verified present in the loaded package, and no code path reads
  `district_name`, `ten_huyen` or `ten_xa`;
- ranking is a total order and the result cap is applied after ranking, with the remainder
  disclosed;
- the popup distinguishes Hint, Loading, Empty and Results, and discloses an absent Cell
  corpus rather than reporting a false negative;
- navigation preserves `pitch`, `bearing`, `field`, `filter`, `layers`, `t` and `mode`;
- every preset is a declared `QuickPreset` resolved by `resolvePreset`, applied by one
  `applyPreset` commit, with no threshold literal and no store sequencing in any component;
- every shipped preset's threshold traces to a named column with its measured non-null count,
  and test 40 passes — meaning the bound serializer no longer narrows an inclusive range;
- presets requiring a filter-union extension are documented as blocked and are absent from the
  UI, not present as dimming; and
- the §6 harness has run, its output is attached to a named artifact/browser/machine, and the
  structural gates G1–G5 pass. Until then no latency figure is stated anywhere.

**PHASE 5 SPEC READY**
