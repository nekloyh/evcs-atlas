# Phase 8 — Data Health Specification

Status: **PHASE 8 SPEC READY**

Scope: turn the DATA workspace (`web/src/ui/DataMode.tsx`, DESIGN.md §3f) from a five-block
summary into an **auditable account of the shipped package** — what arrived, what did not,
what we removed, and how old it is — plus the two capabilities that make an audit usable by
someone who does not trust us: **export** and a **raw table** over every shipped file, not
just the grid.

Framing rule that governs every sentence of this document and every pixel of the feature:

> **A blank is not a defect until we say which kind of blank it is.** Every absent value in
> the shipped package resolves to exactly one of five declared states, by a rule that reads
> a *shipped column*, not by a human's opinion. A column whose blanks cannot be resolved
> that way ships as `MISSING` **and is listed in §9 as a defect**, never silently averaged
> into a coverage percentage.

This extends the DESIGN.md §7/§7a badge contract (`nullMeans`, `nullSplit`, `coverageNote`,
`sourceBadge`), the Phase 4 manifest-is-the-only-source-of-numbers constraint (§7c,
constraint 4), and the existing DATA-mode blocks. It adds **no new upstream computation**
except the manifest keys named in §3, all of which are counts over data the exporter already
holds in memory.

---

## 0. Verification and audit

### 0.1 The package that was measured

Every number in this document was measured against the files the app actually opens.

| fact | value |
|---|---|
| package root | `web/public/data/` — **byte-identical** to `web/public/data/p/01/` (md5 verified on all 11 shared files), plus `provinces.geojson` + `provinces.parquet` which exist only at root |
| `manifest.exported_utc` | `2026-08-19T17:26:58+00:00` (**newer** than the `10:16:16` recorded in `PHASE7_STORY_MODE.md` §0.1 — the store was re-exported since; Phase 7's audited numbers were re-checked and still hold) |
| provinces in store | **34 / 34**, every one with the same 10 shipped files (Hà Nội additionally has `routes_showcase.geojson`) |
| grid | 4 400 cells (01) · **425 778 cells** nationally · 61 columns, identical in all 34 |
| stations | 939 rows (710 `IN` + 229 `BUFFER`) · 6 380 nationally |
| roads | 115 931 ways (01) · max 124 636 (79) |
| occupancy | 703 station rows · 116 785 profile rows (01) · max 150 824 profile rows (79) |
| store size | 167.5 MB total · first load **0.32 MB** · per province 2.09–9.17 MB (`store/qa/n11_web_export.json`) |
| vintages | VNSDI `16/6/2025` · OSM PBF `28/07/2026` · stations canonical `29/07/2026` · occupancy snapshot `evcs_vn_2026-07-29-full`, window `2026-06-29T05:50Z → 2026-07-29T06:00Z` — **identical across all 34 provinces** |

Method: `pyarrow` over each shipped file, cross-tabulating every nullable column against
every candidate explanatory column in the same row, and against `manifest.json`. A null
cause is reported below **only where the cross-tab is exact** (100 % agreement, both
directions). Where it is not exact, the residual is named and counted.

### 0.2 State scale

The five states this document defines. **Only three of them are blanks.**

| state | the row's value is | in the coverage denominator | carries ⚠ |
|---|---|---|---|
| **MISSING** | absent, and it should exist — the source did not supply it | **yes** | yes |
| **NOT APPLICABLE** | absent, and the question is undefined for this row | **no — subtracted** | no |
| **NOT MEASURED** | absent, question applies, instrument ran and produced nothing usable | **yes**, but reported apart from MISSING | yes, different wording |
| **FILTERED** | absent **because our own rule removed it** — the value existed | **yes**, with the rule named | no, but never hidden |
| **INVALID** | **present**, and failed a declared validity check | **n/a — it is not a blank** | yes, on the value |

Two consequences that this project has already been bitten by and that §1 makes structural:

* **NOT APPLICABLE must leave the denominator.** `util_cell` reads 9.93 % of Hà Nội cells.
  Against the honest denominator — cells that contain a station — it reads **97.33 %**
  (437 / 449). The exporter already computes both (`coverage.util_cell.
  share_measured_among_cells_with_station`); the taxonomy generalizes that one special case.
* **INVALID is not a null state.** Nothing in the shipped package is a blank because it
  failed validation — the pipeline nulls or drops those upstream. The one true INVALID
  instance ships as a **present value carrying a provenance label** (§0.4). A design that
  looks for invalid data among the blanks will find none and report a clean bill of health.

### 0.3 Complete nullable inventory of the shipped package

Every column in every shipped file that contains at least one blank, with the cross-tab that
resolves it. **Columns not listed here have zero blanks** — that is 57 of the 61 grid
columns, all 9 connector columns, and all 7 profile columns.

#### `grid_h3_r8.parquet` — 4 nullable of 61 (01: 4 400 rows)

| column | blanks (01) | blanks (national) | resolved by | state |
|---|---|---|---|---|
| `dist_station_network_m` | 3 (0.07 %) | 94 530 (22.20 %) | `evidence_grade_distance ∈ {UNREACHABLE_NO_PATH, UNREACHABLE_NO_ROAD_ACCESS}` — **exact, both directions** | **NOT APPLICABLE** |
| `dist_station_asym_m` | 3 | 94 552 | same rows + 22 residual nationally | NOT APPLICABLE (+ residual → §9-1) |
| `detour_ratio` | 90 (2.05 %) | 95 383 (22.40 %) | 87 rows: `dist_station_euclid_m < 200 m` (`DETOUR_MIN_EUCLID_M`, `src/evcs/core/roadgraph.py:51`) — measured max among reachable blanks **199.22 m**, measured min among non-blanks **200.68 m**; 3 rows: unreachable | **FILTERED** (87) + **NOT APPLICABLE** (3) |
| `util_cell` | 3 963 (90.07 %) | 420 938 (98.86 %) | 3 951 rows `n_stations = 0`; 12 rows `n_stations > 0 ∧ n_stations_measured = 0` | **NOT APPLICABLE** (3 951) + **NOT MEASURED** (12) |

The national column is the reason this phase exists. `dist_station_network_m` reads
**33.41 % cell coverage in Khánh Hòa (56)** — 12 565 of 18 981 cells are
`UNREACHABLE_NO_ROAD_ACCESS`. Presented as a coverage bar that is "two thirds of the data
missing". It is not missing; OSM draws no road that reaches those cells, and the
population living in them is **0.87 %** (`quality.share_pop_unreachable`). Cell-share and
pop-share must travel together (already DESIGN.md §7), and the state must travel with both.

#### `stations.parquet` — 9 nullable of 26 (01: 939 rows)

| column | blanks | resolved by | state |
|---|---|---|---|
| `commune_code`, `commune_name`, `commune_kind` | 229 (24.39 %) | `scope = 'BUFFER'` — **exact**: 229/229 BUFFER blank, 0/710 IN blank | **NOT APPLICABLE** |
| `n_ports` | 26 (2.77 %) | `port_config_source = 'UNKNOWN'` — **exact** | **MISSING** |
| `n_guns_imputed` | 913 (97.23 %) | the 26 non-blanks are exactly the `UNKNOWN` rows, all valued `1` | **NOT APPLICABLE** — the column records *that an imputation happened*; a blank means none was needed |
| `current_type`, `power_kw_max_port`, `power_kw_site` | 27 (2.88 %) | the 26 above **+ 1 residual** | **MISSING** (residual → §9-2) |
| `freshness` | 11 (1.17 %) | `has_timeseries = false` — **exact** | **NOT APPLICABLE** |

`n_guns_imputed` is the sharpest case in the package: it is 97.2 % blank and that is the
**good** number. A coverage bar over it reads 2.8 % and means "97.2 % of stations needed no
guessing".

#### `station_occupancy.parquet` — 8 nullable of 25 (01: 703 rows)

| column | blanks | resolved by | state |
|---|---|---|---|
| `util`, `util_p95`, `util_denominator_ports`, `current_type` | 13 (1.85 %) | `util_reportable = false` — **exact**; = `occ_status ∈ {THIEU_COVERAGE (9), THIEU_PEER (4)}` | **NOT MEASURED** |
| `night_share` | 41 (5.83 %) | `ever_active = false` — **exact** | **NOT APPLICABLE** |
| `weekend_ratio` | 42 (5.97 %) | the 41 above **+ 1** `ever_active = true` row | NOT APPLICABLE (41) + residual → §9-3 |
| `util_pctl`, `util_pctl_peer` | 27 (3.84 %) | 13 rows: `util` is blank; 14 rows: `util` present **and** `util_reportable = true`, all `occ_status = THIEU_COVERAGE` | **NOT APPLICABLE** (13) + **FILTERED** (14) |

Do not read `util` blanks as "no demand". **28 stations with `ever_active = false` carry a
non-blank `util`** — a measured zero. The 13 blanks are the opposite case: we could not look.

#### `roads.parquet` — 1 nullable of 5 (01: 115 931 rows)

| `dist_station_m` | 222 (0.19 %) | equals `manifest.roads.ways_unreachable_null_dist` exactly | **NOT APPLICABLE** — the way is not connected to any station in the routable graph |

#### `commune.geojson` — 2 nullable of 21 (01: 126 features)

| column | blanks | meaning | state |
|---|---|---|---|
| `quality_flag` | **124 (98.4 %)** | no flag was raised | **NOT APPLICABLE** — blank is the healthy case; the 2 non-blanks are `DANSO_CONG_BO_QUA_THAP` |
| `util_mean_port_weighted` | 8 (6.3 %) | commune contains no measured station | **NOT APPLICABLE** |

`quality_flag` is the canonical trap this specification exists to prevent: run today's
coverage machinery over the commune table and it renders a 1.6 % bar on a column that is
working perfectly.

#### `poi.geojson` — 2 nullable of 8 (01: 5 896 features)

| `levels` | 4 834 (82.0 %) | OSM carries no `building:levels` | **MISSING** — this is the 3-D extrusion input |
| `name` | 1 505 (25.5 %) | OSM carries no name tag | **MISSING** |

#### `provinces.parquet` — 1 nullable of 28 (34 rows)

| `quality_flags` | 3 | provinces `24`, `42`, `80` raised no flag | **NOT APPLICABLE** |

Also blank in the per-province `quality` block: `n_only_in_secondary` and
`share_only_in_secondary` — the secondary-operator cross-check was never run. **NOT MEASURED**,
and it must be labelled that way rather than rendered as a dash beside measured values.

### 0.4 The blanks that are not blank

Three findings that a null-driven health panel cannot see, and that Phase 8 must therefore
measure separately.

**(a) Present zeros that mean "not measured."** `pop_source = ZERO_NO_WEIGHT` marks cells
whose `population` is exactly `0.0` because no weight surface existed — not because nobody
lives there. 135 cells in Hà Nội (3.07 %); **111 096 cells nationally (26.09 %), in all 34
provinces.** Column coverage for `population` reads 100 % everywhere.

**(b) The one INVALID in the package.** `pop_source =
WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE` — 55 cells in Hà Nội (98 156 people), **8 453
cells nationally (1.99 %)**. The pipeline states in the value's own name that the published
figure failed a plausibility check, and ships the number anyway. Its commune-level twin is
`quality_flag = DANSO_CONG_BO_QUA_THAP` (2 communes in Hà Nội). This is the **only** INVALID
instance in the shipped package, and it is a present value, not a blank.
A fourth vocabulary member, `VNSDI_AREAL_FALLBACK` (8 558 cells), exists nationally but not
in Hà Nội — **the category vocabulary is province-dependent**, so no UI may hard-code it.

**(c) Columns at 100 % coverage that carry no information.** Constant-valued columns in the
grid, measured across all 34 provinces:

| column | constant in |
|---|---|
| `snow_frac`, `moss_frac` | **34 / 34** (always `0.0`) |
| `n_parking_street` | 22 / 34 |
| `mangrove_frac` | 16 / 34 |
| `apartment_levels_sum` | 13 / 34 |
| `n_dept_store` | 7 / 34 · `n_apartment` 5 · `n_mall` 4 · `road_len_motorway_m` 4 · `wetland_frac` 4 · `shrub_frac` 3 |

`snow_frac` is a fully-covered, fully-useless column in every province in the country. A
health panel that only counts blanks gives it a green bar.

### 0.5 Summary of the audit

* 61 grid columns, **57 at 100 % coverage in every province**; the 4 that are not are all
  explained exactly by a shipped companion column.
* Across the whole package, **27 columns** contain at least one blank. Every one of them
  resolves through a shipped column, except three residuals (§9-1/2/3) totalling **24 rows**:
  22 grid cells nationally, 1 station, 1 occupancy row.
* **14 of those 27 columns are NOT APPLICABLE-dominant.** Under today's rule
  (`share < 1 ⇒ ⚠`, suppressed only by a hand-written `nullMeans`), most of them would earn
  a warning they do not deserve.
* The two real data-quality stories in this package — implausible published population, and
  landcover columns that are constant zero — are **invisible to any null-based metric**.

---

## 1. The five states — normative contract

### 1.1 Decision procedure

For a blank at (`table`, `column`, `row`), resolve in this order and stop at the first hit:

1. Does a **shipped column in the same row** state that the question does not apply
   (`scope = BUFFER`, `n_stations = 0`, `ever_active = false`, `has_timeseries = false`,
   `network_reachable = false`)? → **NOT APPLICABLE**.
2. Did **one of our own rules** remove a value that the source supplied
   (`euclid < DETOUR_MIN_EUCLID_M`, peer-ranking exclusion)? → **FILTERED**, and the rule's
   name and threshold are published with the count.
3. Did the instrument run and fail (`util_reportable = false`, `n_stations_measured = 0`
   where `n_stations > 0`)? → **NOT MEASURED**.
4. Otherwise → **MISSING**.

**INVALID** is never reached by this procedure. It is declared per column as a predicate over
**present** values (§1.3).

Rule 0, binding: *a state may only be assigned by a rule that reads shipped data.* A blank
whose state is asserted by a hand-written string in TypeScript is **MISSING with a defect
filed**, not NOT APPLICABLE. This is what makes the panel auditable and what stops the
taxonomy from becoming a way to explain away every gap.

### 1.2 The `NullContract`

Today `FieldMeta` carries `nullMeans?: string` (a field-level opt-out of ⚠) and
`nullSplit?: { by: "network_reachable"; … }` (a two-way split hard-wired to one column). Both
are correct in spirit and too narrow: `util_cell` needs a three-way split (no station /
station-but-unmeasured / measured), `detour_ratio`'s split is a **threshold on a numeric
column**, not a bool, and `util_pctl` splits on two different upstream conditions.

Replace both with one declaration, in `web/src/data/null-states.ts`:

```ts
export type NullState = "MISSING" | "NOT_APPLICABLE" | "NOT_MEASURED" | "FILTERED";

export interface NullRule {
  state: NullState;
  /** Human sentence. No percentages — §7c. */
  label: string;
  /** Why the question does not apply / what removed the value. */
  explain: string;
  /**
   * SQL predicate over the SAME ROW, evaluated by DuckDB at export time and at runtime.
   * MUST reference only columns of this table. Checked against the shipped schema at
   * build time by `test/null-states.test.ts`.
   */
  when: string;
  /** Named threshold, when `when` embeds one. Printed beside the count. */
  rule?: { name: string; value: number | string; source: string };
}

export interface NullContract {
  table: TableId;
  column: string;
  /** Ordered; first match wins. The LAST entry must be an unconditional fallback. */
  rules: readonly NullRule[];
}
```

`nullSplit` becomes the two-rule case of this, and its 45°/90° hatch rule (DESIGN.md §7a)
generalizes to one angle per state (§6.4). `nullMeans` is **deleted**: a field that today
sets it is a field whose blanks are NOT APPLICABLE, and it must now say so with a `when`.

### 1.3 The `ValidityContract`

INVALID is separate because it is not a blank:

```ts
export interface ValidityContract {
  table: TableId;
  /** The column whose VALUES are suspect. */
  column: string;
  /** SQL predicate over the same row that marks a present value as invalid. */
  invalidWhen: string;
  label: string;
  explain: string;
  /** What we do with it: the package SHIPS these values. */
  disposition: "shipped-with-label";
}
```

The one instance to declare in Phase 8:

```ts
{ table: "grid", column: "population",
  invalidWhen: "pop_source = 'WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE'",
  label: "dân số công bố không hợp lý",
  explain: "Con số công bố cho xã này không khớp bề mặt trọng số; pipeline giữ nó và gắn nhãn.",
  disposition: "shipped-with-label" }
```

A second, `commune.quality_flag = 'DANSO_CONG_BO_QUA_THAP'`, is the same fact at commune
resolution and is declared on the commune table.

### 1.4 The state that is not in the taxonomy — `SUPPRESSED_ZERO`

`pop_source = ZERO_NO_WEIGHT` (§0.4a) is a **present value that encodes a blank**. It is not
INVALID (nobody claims it is wrong) and it is not a blank (the column is 100 % covered).
Phase 8 does **not** add a sixth state; it declares this as a `ValidityContract` with
`disposition: "shipped-with-label"` and a distinct label, and the §2.3 metric reports it in
its own row: *"111 096 cells (26.09 %) carry population 0 because no weight surface existed —
this is not a measurement of zero people."* Nationally this is a larger fact than every blank
in the package combined, and it must not be filed under a taxonomy of blanks where nobody
will look for it.

---

## 2. The metrics

Nine metric groups. For each: the **definition**, its **denominator** (the part that gets
lied about), where it comes from **today**, and what Phase 8 **adds**. Every number is
resolved at render time from `manifest.json` or from a runtime query — never typed into TS
(constraint 4, DESIGN.md §7c).

### 2.1 Record counts

**Definition.** Rows shipped per table, per province, with the boundary that produced them.

**Denominator trap — measured.** `totals.private_ac_dropped.share_stations = 0.7184` is
computed as `1811 / (1811 + 710)`, i.e. against the **in-scope** station count, while the
KPI row beside it prints `totals.all.n_stations = 939`. Against 939 the same drop reads
0.6585. Two denominators, one screen, no label. Likewise
`totals.connectors.n_guns = 8 823` against `totals.all.n_ports = 9 878` — a 1 055 gun gap,
and 28 of 939 stations have no connector row at all.

**Today.** `manifest.files[*].rows` (per file), `totals.{all,in_scope,buffer}`, `n_cells`.

**Phase 8 adds.** Every count on screen renders through one component that requires a
`denominator` prop and a `scope` label (`IN` · `BUFFER` · `IN+BUFFER` · `pre-filter`). A
count without a stated denominator fails `test/data-health.test.ts`.

### 2.2 Coverage

**Definition.** For each (table, column): `n_present`, and the share of **rows** and of
**population** that carry a value — with the NOT APPLICABLE rows removed from the
denominator and reported separately.

**Today.** `manifest.coverage` for the 61 grid columns only, as
`{n_present, cell_share, pop_share}`, plus two hand-added keys on `util_cell`.

**Phase 8 adds.** Three denominators per column, always shown together:

| denominator | question |
|---|---|
| `n_rows` | how much of the table |
| `n_applicable` = `n_rows − n_not_applicable` | how much of the part where the question means something |
| `pop_share` | how many people are behind the rows that carry a value |

Khánh Hòa's `dist_station_network_m` under the three: **33.41 % of cells · 100 % of
applicable cells · 99.13 % of population.** One column, three true numbers, and only the
first one is alarming.

Extend to **all six shipped tables**, not just the grid.

### 2.3 Missing values, 2.4 intentional nulls

These are one measurement with five buckets, not two metrics. Per (table, column), the
manifest emits counts for each state (§3.1). The UI never prints "nulls: N"; it prints the
breakdown, and a column whose blanks are 100 % NOT APPLICABLE renders with **no warning
colour at all**.

**Ordering rule.** Sort the column list by `n_missing + n_not_measured` descending — the two
states that mean *we do not know*. Sorting by raw null count puts `n_guns_imputed` (97.2 %
blank, perfectly healthy) at the top of a list titled "problems".

### 2.5 Telemetry coverage

**Definition.** Two different things that today share one word:

* **station telemetry** — `share_stations_measured` = stations with
  `util_reportable ∧ grade = 'GOOD' ∧ util IS NOT NULL`, over **in-scope** stations
  (`src/vn/n10_quality.py:302`). Hà Nội **95.21 %** (676/710).
* **cell telemetry** — `util_cell` present, over cells **containing a station**.
  Hà Nội **97.33 %** (437/449).

**Measured spread, all 34:** min **0.0 %** (Điện Biên, 39 stations) → max **96.9 %**
(Đồng Nai, 318 stations); 4 provinces below the 50 % threshold
(`MIN_OCC_MEASURED_SHARE`), 10 provinces at or above 90 %.

**Today.** `quality.share_stations_measured`, `totals.occ_status_ok`,
`coverage.util_cell.share_measured_among_cells_with_station`, and `unusable_layers` — which
already gates the occupancy layer with a reason string in exactly the 4 provinces below
threshold.

**Phase 8 adds.** Both numbers on screen with their denominators named, the threshold
printed as a **declared assumption** with its constant name, and the `unusable_layers` reason
promoted from a footnote to the block header when it fires. Also emit
`occ_status` value counts (`OK` / `THIEU_COVERAGE` / `THIEU_PEER`) so "not measured" is
broken down by *why*.

### 2.6 Source version

**Definition.** For each upstream: name, version/vintage, effective date, and **what we
rejected**.

**Today — already complete and already shipped, and this is the strongest block in the
package.** `manifest.vintage` carries `name`, `source`, `valid_from`, `published`, `levels`,
`n_provinces`, `n_communes`, the key definitions, **and a `rejected` map naming two
candidate sources with the measured reason each was refused** (an OSM-derived boundary set
with 3 930 units against the official 3 321 — a 609-unit discrepancy — and the pre-merger
63-province structure). `manifest.snapshots` carries the four dated inputs. All 34 provinces
carry identical values.

**Phase 8 adds.** Render `vintage.rejected` — it is currently in the file and on no screen.
The reasons we *did not* use a source are the most defensible thing in the dataset.

### 2.7 Data freshness

**Definition — and the correction this audit forces.** There are two freshness clocks and
they are not comparable:

* **Package-level, absolute.** `snapshots.{osm_pbf, stations_canonical, vnsdi_valid_from}`,
  `occupancy_window` (a 30-day window), `exported_utc`. All dated, all identical across the
  34 provinces.
* **Row-level, relative.** `stations.freshness` — a float in `[0, 1]`, "smaller is newer"
  (`docs/COT.md:139`). Hà Nội: median 0.07, p90 0.09, max 0.97, 928 of 939 rows present.
  **It has no unit, no epoch, and no definition anywhere in this repository** — grep finds it
  only as a column name in `src/evcs/core/supply.py` and `src/evcs/schema/supply.py`.
  `StationPanel.tsx:397` prints it to three decimals labelled "Độ tươi dữ liệu (0–1, nhỏ là
  mới)", which is the column's docstring, not an interpretation.

**Phase 8 adds.** Package-level dates rendered as dates, with age computed against
`exported_utc` **not against the viewer's clock** (a package opened in 2027 must not claim to
be fresh, and must not claim the viewer's timezone is data). Row-level `freshness` is shown
as a **distribution, not a number**, under an explicit "unit undefined" label, and is filed
as upstream ask §10-1. It may not be thresholded, coloured by a "stale" ramp, or aggregated
into a health score until §10-1 is answered.

### 2.8 Geographic coverage

**Definition.** Which territory the package can answer questions about, at which resolution,
and where it degrades.

**Measured.** 34/34 provinces, 3 321 communes, 425 778 cells at H3 r8, one vintage
(`16/6/2025`), identical 61-column schema, `missing_layers.columns` **empty in all 34**.
National grid ships at r6/r7 (`web/public/data/vn/`) with 9 813 r6 cells.

Degradation is **not** uniform and is fully measurable today:

| signal | source | spread |
|---|---|---|
| flags per province | `quality.quality_flags` | 3 provinces clean (24, 42, 80); 4 provinces carry 4 flags |
| layer gating | `unusable_layers` | 4 provinces (04, 11, 12, 14), occupancy only |
| unreachable cells | `categories.evidence_grade_distance` | 0.07 % (01) → 66.6 % (56) |
| POI interpretability | `quality.share_communes_zero_poi` | 3.6 % (79) → 76.6 % (96) |
| population anchoring | `quality.vnsdi_anchor_ratio` | 0.9519 (01) → 1.6072 (91) |

**Phase 8 adds.** A 34-row province health table, and the currently-unshipped
`store/qa/exclusions.json` — which already encodes the three thresholds
(`MIN_STATIONS = 30`, `MIN_OCC_MEASURED_SHARE = 0.5`, `POI_ZERO_COMMUNE_MAX = 0.5`), the four
provinces it recommends excluding from analysis, and the separate list of provinces where
POI may not be interpreted. It is a finished artefact sitting outside `web/public/data/`.
**Gate:** the national manifest (`vn/manifest.json`) has **no** `coverage`, `quality` or
`snapshots` block — in `national` nav mode the per-column blocks must be absent with a stated
reason, not rendered empty.

### 2.9 Filtered-out records

**Definition.** Rows the source supplied that **we** removed, with the rule, the count, and
the denominator.

**Measured, and the arithmetic closes exactly:**

| filter | removed | kept | rule |
|---|---|---|---|
| private AC charge points | **1 811 stations** (71.84 % of pre-filter in-scope; 18.87 % of ports, **7.01 % of power**) | 710 in-scope | `is_private_ac(n_guns_installed, current_type_asset)` |
| road ways | **124 284** = 66 202 buffer-copy + 57 819 service + 263 access-blocked | 115 931 | `240 215 − 124 284 = 115 931` ✓ exact |
| peer-ranking exclusion | 14 stations dropped from `util_pctl` | 676 ranked | `occ_status = THIEU_COVERAGE` |
| detour suppression | 87 cells | 4 310 | `euclid < 200 m` |
| POI: demand vs visual | 3 919 demand of 5 896 visual | — | two different POI sets ship |

The private-AC line is the single most consequential number in the package: it removes
**71.8 % of stations** but only **7.0 % of power**, and every per-station statistic in the
app is computed after it. It is already in `totals.private_ac_dropped`; DESIGN.md §3f-4
already requires saying what was removed.

**Phase 8 adds.** All five filters in one block with their arithmetic shown as
`before − removed = after`, each with its own denominator label (fixing the 0.7184-vs-939
mismatch in §2.1), and each linked to the source constant.

---

## 3. Manifest contract — the keys Phase 8 adds

All additive; every existing key keeps its shape. Emitted by `src/vn/n11_web_export.py`.
Constraint: **no new upstream computation** — every count below is a `GROUP BY` over a frame
the exporter already holds.

### 3.1 `null_states` — per table, per column

```json
"null_states": {
  "grid": {
    "util_cell": {
      "n_rows": 4400,
      "n_present": 437,
      "states": {
        "NOT_APPLICABLE": { "n": 3951, "rule": "n_stations = 0" },
        "NOT_MEASURED":   { "n": 12,   "rule": "n_stations > 0 AND n_stations_measured = 0" }
      },
      "n_applicable": 449,
      "share_of_applicable": 0.973274,
      "pop_share": 0.279293
    }
  }
}
```

Emission rule: a column appears **only if it has at least one blank**. A column whose blanks
are not fully partitioned by its rules emits a `MISSING` bucket with the residual count —
this is how §9-1/2/3 stay visible instead of being rounded away.

### 3.2 `invalid_values`

```json
"invalid_values": {
  "grid.population": { "n": 55, "share_rows": 0.0125, "share_pop": 0.011115,
                       "rule": "pop_source = 'WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE'",
                       "disposition": "shipped-with-label" },
  "grid.population@zero_no_weight": { "n": 135, "share_rows": 0.030682,
                       "rule": "pop_source = 'ZERO_NO_WEIGHT'",
                       "disposition": "shipped-with-label" },
  "commune.population": { "n": 2, "rule": "quality_flag = 'DANSO_CONG_BO_QUA_THAP'",
                       "disposition": "shipped-with-label" }
}
```

### 3.3 `degenerate_columns`

```json
"degenerate_columns": { "snow_frac": 0.0, "mangrove_frac": 0.0, "moss_frac": 0.0 }
```

Columns with exactly one distinct non-null value, and that value. One `nunique()` per column
on a frame already in memory.

### 3.4 `filters`

The five §2.9 filters as `{ name, rule_const, source_file, before, removed, after, denominator }`.
Four of the five numbers already exist in `totals` and `roads`; this block gives them a
shared shape and an explicit denominator field.

### 3.5 `exclusions`

`store/qa/exclusions.json` copied into each province manifest, filtered to that province:
thresholds, `excluded` (with reasons), `poi_not_interpretable`. Already computed; currently
not shipped.

### 3.6 `freshness`

```json
"freshness": {
  "exported_utc": "2026-08-19T17:26:58+00:00",
  "inputs": { "osm_pbf": "2026-07-28", "stations_canonical": "2026-07-29",
              "vnsdi_valid_from": "2025-06-16",
              "occupancy_window": ["2026-06-29T05:50:00+00:00", "2026-07-29T06:00:00+00:00"] },
  "row_level": { "column": "stations.freshness", "unit": null,
                 "note": "0–1, nhỏ là mới; định nghĩa chưa có ở thượng nguồn",
                 "p50": 0.07, "p90": 0.09, "max": 0.97, "n_present": 928, "n_rows": 939 }
}
```

`snapshots` keeps its current shape and its current date strings; `freshness.inputs`
re-publishes them as **ISO dates** so the UI does not parse `28/07/2026` in the browser.
`unit: null` is not a placeholder — it is the honest answer until §10-1 lands.

### 3.7 Dead keys to remove

`Coverage.nonzero_cells` and `Coverage.share_of_cells_with_apartments` are declared in
`web/src/data/manifest.ts:26-28` and emitted by **zero** of the 35 manifests. Delete the
type fields (§9-4).

---

## 4. Export — what a browser can actually produce here

Constraints that decide this, all verified in the tree: no network at run time
(`vite.config.ts` self-hosts the DuckDB bundle deliberately); **no COEP**, therefore no
`SharedArrayBuffer` and no threaded WASM (`vite.config.ts` comment, DESIGN.md §1a — enabling
it kills OpenFreeMap tiles); no new dependency.

### 4.1 Supported

| format | mechanism | verified |
|---|---|---|
| **CSV** | `COPY (…) TO 'out.csv' (FORMAT CSV, HEADER)` into the WASM FS → `db.copyFileToBuffer('out.csv')` → `Blob` → anchor download → `db.dropFile` | `copyFileToBuffer`, `registerEmptyFileBuffer`, `dropFile` all present in the installed typings (`@duckdb/duckdb-wasm/dist/types/src/parallel/async_bindings.d.ts:114,126,64`) |
| **Parquet** | same path, `(FORMAT PARQUET, COMPRESSION ZSTD)` | same API; the Parquet **writer is core DuckDB**, not a loadable extension. Runtime confirmation is acceptance gate **AC-12** — it could not be executed from this environment and is stated as unverified, not assumed |
| **Arrow IPC** (`.arrow`) | `tableToIPC(table, 'file')` on the Arrow table already in hand — no SQL, no WASM FS | `tableToIPC` exported by `apache-arrow@17` (`Arrow.dom.d.ts:2`) |
| **JSON / NDJSON** | JS over the Arrow table | — |
| **GeoJSON** | points from `lat`/`lng` (stations, POI); hex polygons via `h3-js@4.5` `cellToBoundary` (already a dependency); `roads.coords` is already an array of positions → `LineString` | — |

### 4.2 Rejected, with the reason

* **XLSX** — needs a new dependency (SheetJS ≈ 400 KB). Against the no-new-dependency and
  first-load constraints, for a format CSV already serves.
* **Shapefile / GeoPackage / FlatGeobuf** — needs GDAL, or DuckDB's `spatial` extension,
  which is **loadable** and fetches from the extension repository at run time. That breaks
  the offline guarantee the whole data layer is built around.
* **ZIP bundle** (data + provenance in one file) — writable without a dependency using
  STORE-method entries and a hand-rolled CRC32, but that is ~60 lines of binary
  format-writing to save one click. Rejected in favour of §4.4.
* **`showSaveFilePicker`** — not implemented in Firefox. Anchor-download is the single path.

### 4.3 Measured size budget

CSV, worst cases actually measured:

| table | rows | CSV | Parquet |
|---|---|---|---|
| grid, Lâm Đồng (68) — **worst in store** | 29 763 × 61 | **15.06 MB** | 4.26 MB |
| profile 168h, HCMC (79) | 150 824 × 7 | 5.91 MB | 0.42 MB |
| roads, HCMC (79), geometry dropped | 124 636 × 4 | 4.99 MB | 3.17 MB |
| grid, Hà Nội (01) | 4 400 × 61 | 2.73 MB | 0.96 MB |
| stations, HCMC (79) | 1 017 × 26 | 0.30 MB | 0.12 MB |

15 MB through a `Blob` is fine. 15 MB assembled by JS string concatenation is not — hence
the `COPY`-into-WASM-FS path for CSV and Parquet, with **one** `Uint8Array` crossing the
worker boundary. The Arrow-IPC and JSON paths are capped at 50 000 rows and refuse above it
with the row count and a pointer to CSV, rather than freezing the tab.

### 4.4 Provenance is part of the export

Every export carries, without exception:

* **In the filename**: `evcs_{province_code}_{table}_{exported_utc:YYYYMMDD}.{ext}`.
* **In the payload** where the format has a slot: JSON/GeoJSON get a top-level `_meta`
  (province, vintage, snapshots, filters applied, active AnalysisFilter, row count vs
  unfiltered row count); Parquet gets the same as key-value metadata.
* **CSV and Arrow have no slot** → a second automatic download,
  `evcs_{…}_{table}_{date}.meta.json`, identical content. The UI states that two files will
  be saved. An export that silently drops provenance is not an audit artefact.

If the user exported a **filtered** view, `_meta.filter` is mandatory and the UI labels the
button "xuất 1 782 / 4 400 dòng đang lọc" — never a bare "Export".

---

## 5. Raw-table performance strategy

### 5.1 What exists

`fetchGridPage` (`web/src/data/datamode.ts`): 3 queries per page — `LIMIT 0` for the schema,
`count(*)`, then the page — `PAGE_SIZE = 50`, filter and sort in SQL. The reason sort lives
in SQL is **not** speed: DuckDB puts NULLs at a defined end, `Array.sort` always sinks
`undefined`, so a JS sort makes ascending and descending disagree about which rows are "first"
with no way for the reader to tell. That reason survives Phase 8 unchanged and is the
governing constraint.

Only the grid is exposed. Phase 8 opens six tables, including two with >100 000 rows.

### 5.2 Rules

1. **Never `SELECT *`.** Project the visible column window plus the row key. The grid has 61
   columns; a 50-row page today materializes 3 050 Arrow cells to render ~600.
2. **Schema once per (table, province)**, cached — replaces the per-page `LIMIT 0` query.
3. **`count(*)` memoized on (table, filter)**, not on offset. Paging currently re-counts on
   every click; the count cannot change between pages of the same filter. Removes 1 of 3
   queries per paging action.
4. **Geometry columns are denylisted from the flat view.** `roads.coords` is a list column;
   `SELECT *` over 124 636 rows materializes 124 636 coordinate arrays into JS. The table
   shows a `geometry · 24 điểm` cell, and the value is reachable only through export.
5. **Offset pagination up to 10 000 rows; keyset beyond.** Above the threshold, page by
   `WHERE (sort_col, row_key) > (:last_sort, :last_key)` — DuckDB scans to satisfy a large
   `OFFSET`, and the worst shipped table is 150 824 rows.
6. **No row virtualization, no virtualization dependency.** Keep the page at 50 (options
   100/200); a bounded DOM beats a scroll-position simulator at these sizes. Revisit only if
   AC-15 fails.
7. **Reuse `registerParquet`'s promise dedup** as-is — it already exists precisely because
   concurrent registrations of the same file could hang the single-threaded worker.
8. **One inflight query per table.** Rapid sort clicks cancel-and-supersede rather than queue;
   `query()` already serializes globally, so an unguarded burst delays the map's queries too.

### 5.3 Budgets (measured on `/bench.html`, which already exists and already times per-province queries)

| action | table | budget (p95) |
|---|---|---|
| first page after registration | grid 29 763 rows (68) | ≤ 400 ms |
| page change | any | ≤ 150 ms |
| sort change | profile 150 824 rows (79) | ≤ 400 ms |
| filter change (incl. re-count) | grid 29 763 rows | ≤ 500 ms |
| export CSV | grid 29 763 × 61 (15.06 MB) | ≤ 3 000 ms to Blob |

Add these to `web/src/bench.ts` as a `TABLE` section beside the existing Q1–Q5/Q-P4-4 rows.
A budget that is not in the bench is not a budget.

---

## 6. The DATA workspace surface

Today: TỔNG CUNG · CHUẨN PHÍCH · HỒ SƠ NGÀY THEO DẠNG NHỊP · PHỦ TỪNG CỘT · BẢNG DỮ LIỆU.
Phase 8 keeps all five and restructures around them.

### 6.1 Block order

1. **NGUỒN & NIÊN BẢN** *(new)* — `vintage`, `snapshots`, `freshness.inputs`, and
   `vintage.rejected` (what we refused and why). Top, because provenance frames everything below.
2. **TỔNG CUNG** *(exists)* — every count gains an explicit denominator label (§2.1).
3. **ĐÃ LOẠI** *(new)* — the five filters, `before − removed = after` (§2.9).
4. **CHUẨN PHÍCH** *(exists)* — plus the 8 823-vs-9 878 gun/port gap stated.
5. **KHOẢNG TRỐNG** *(replaces PHỦ TỪNG CỘT)* — all six tables, five-state breakdown, three
   denominators, sorted by `MISSING + NOT_MEASURED` (§2.2, §2.3).
6. **GIÁ TRỊ ĐÁNG NGỜ** *(new)* — INVALID and `ZERO_NO_WEIGHT` and `degenerate_columns`:
   the three problems that no blank-counter can see (§0.4).
7. **34 TỈNH** *(new)* — province health table + `exclusions` (§2.8). Absent in `national`
   mode with a reason.
8. **HỒ SƠ NGÀY THEO DẠNG NHỊP** *(exists)*.
9. **BẢNG DỮ LIỆU** *(exists, extended)* — table picker over six tables, column picker,
   export (§4).

### 6.2 Visual rules

Inherited from DESIGN.md and non-negotiable: §3f-1 (replaces the map, does not overlay);
§3f-3 (large numbers use proportional figures, they do not form columns); §3f-4 (say what was
removed); §3f-5 (`unusable_layers` shows its reason). §7c: no percentage is typed into TS.

New:

* **A meter is only drawn for a share whose denominator is on screen.** The existing `Meter`
  renders any `share`; a bar with no visible denominator is how 33.41 % becomes a lie.
* **NOT APPLICABLE is never red, never amber, never a partial bar.** It is a neutral rule
  chip stating the rule (`n_stations = 0`), rendered where the bar would be.
* **A blank cell in a table is always printed as a word**, per today's `formatValue` rule —
  now the word names the state, not just "không có".

### 6.3 One health score — no

There will be no composite "data health: 87/100". Every measured fact in §0 shows the
components are not commensurable: a province can be 100 % covered and 0 % informative
(`snow_frac`), or 33 % covered and 99 % of the population intact (Khánh Hòa). A single number
would average those and destroy exactly the distinction this phase is built to preserve.
Flags (`quality_flags`) and gates (`unusable_layers`) already exist, are already
threshold-based, and are already named — they are the health signal.

### 6.4 Hatch angles

DESIGN.md §7a assigns 45° = "don't know", 90° = "doesn't apply". Extend to one angle per
state, and register it in the palette test so the four are distinguishable at 1 px:
`MISSING` 45° · `NOT_APPLICABLE` 90° · `NOT_MEASURED` 135° · `FILTERED` 0°.
INVALID is **not** a hatch — it is a present value and gets a **dot marker on the value**.

---

## 7. Acceptance criteria

**Taxonomy**

* **AC-1** Every one of the 27 nullable columns in §0.3 has a `NullContract` whose rules
  partition its blanks with **zero residual**, except the three declared in §9, which emit an
  explicit `MISSING` residual bucket.
* **AC-2** Every `NullRule.when` references only columns present in that table's shipped
  schema, checked against the real Parquet/GeoJSON schema at test time.
* **AC-3** No `NullState` is assigned anywhere by a hand-written string. `nullMeans` is gone
  from `fields.ts` and from `FieldMeta`.
* **AC-4** `util_cell` renders as **97.33 % of applicable cells**, with 9.93 % also shown and
  labelled with its denominator.
* **AC-5** `stations.n_guns_imputed` (97.2 % blank) renders with **no** warning treatment.
* **AC-6** `commune.quality_flag` (98.4 % blank) renders with **no** warning treatment.

**Metrics**

* **AC-7** Every count on screen has a stated denominator and scope; the private-AC block
  states its denominator is in-scope (2 521), not `totals.all` (939).
* **AC-8** `before − removed = after` closes exactly for all five filters, asserted in test
  against the manifest — roads: `240 215 − 124 284 = 115 931`.
* **AC-9** `ZERO_NO_WEIGHT` (26.09 % of national cells) and
  `WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE` (1.99 %) each appear in the UI. Neither is
  reachable from a null-based metric, so each has its own assertion.
* **AC-10** `snow_frac` and `moss_frac` appear as degenerate in all 34 provinces despite
  100 % coverage.
* **AC-11** `stations.freshness` is shown as a distribution with "unit undefined" and is
  **not** thresholded, ramped or aggregated.

**Export**

* **AC-12** CSV and Parquet round-trip in a real browser: export the Hà Nội grid, re-read the
  file, assert row count and the null pattern of all four nullable columns survive. **This is
  the gate that confirms the Parquet writer claim in §4.1** — if it fails, Parquet is dropped
  and §4.1 is amended rather than worked around.
* **AC-13** Every export writes provenance: embedded for JSON/GeoJSON/Parquet, sidecar for
  CSV/Arrow. A filtered export states its filter and both row counts.
* **AC-14** Exporting the Lâm Đồng grid (15.06 MB CSV) does not block the main thread beyond
  the §5.3 budget, and DuckDB's virtual FS is empty afterwards (`dropFile` called).

**Performance**

* **AC-15** Every §5.3 budget met on `/bench.html` for the worst-case province named.
* **AC-16** No query in the DATA workspace selects `*`; `roads.coords` never crosses into JS
  in table mode.
* **AC-17** Paging issues **one** query, not three (`getIssuedQueryCount` already exists for
  exactly this kind of assertion).

**Portability**

* **AC-18** Every block renders for all 34 provinces without a province-specific branch, in
  particular for Điện Biên (0 % telemetry, 4 flags, occupancy layer gated) and Khánh Hòa
  (66.2 % of cells unreachable).
* **AC-19** In `national` mode the per-column blocks are **absent with a stated reason**
  (`vn/manifest.json` has no `coverage`/`quality`/`snapshots`), not rendered empty.
* **AC-20** No category vocabulary is hard-coded: `VNSDI_AREAL_FALLBACK` exists nationally
  and not in Hà Nội, and must render without a code change.

---

## 8. Test plan

`web/test/data-health.test.ts` (new), `web/test/null-states.test.ts` (new),
`tests/test_n11_null_states.py` (new), extending `web/test/fixtures/`.

1. **Contract completeness** — for each shipped fixture table, every blank resolves to
   exactly one state; residual > 0 fails unless the column is on the §9 allow-list.
2. **Contract validity** — every `when` parses and references only real columns.
3. **Denominator arithmetic** — `n_rows − n_not_applicable = n_applicable`; all five filter
   equations close; the private-AC share reproduces 0.7184 from 1 811/2 521 and **not** from 939.
4. **The anti-regression cases**, each pinned by name because each is a bug this project has
   already shipped once: `util_cell` 9.93→97.33 · `n_guns_imputed` no-warning ·
   `quality_flag` no-warning · Khánh Hòa three denominators · `snow_frac` degenerate ·
   `ZERO_NO_WEIGHT` visible · `detour_ratio` split 87/3 at the 200 m constant.
5. **Exporter parity** (Python) — `null_states` counts recomputed from the frame equal what
   `n11_web_export.py` wrote, for all 34 provinces.
6. **Export round-trip** (browser, AC-12).
7. **Query shape** — no `SELECT *`; paging issues one query; `coords` absent from table
   projections.
8. **Portability sweep** — render every block against all 34 real manifests (they are in the
   repo; no fixture invention needed) plus `vn/manifest.json`.

---

## 9. Defects found by this audit — fix inside Phase 8

1. **`dist_station_asym_m` has 22 unexplained blanks nationally** beyond the 94 530 explained
   by `evidence_grade_distance` (0 in Hà Nội). Cause is in `n07_distance.py:126`:
   `asym` requires **both** `dist_m` and `from_m` finite, and `from_m` (the reverse direction)
   can be infinite where `dist_m` is not. Emit as `MISSING` residual and file the asymmetry.
2. **`stations.power_kw_site` has one blank more than `n_ports`** (27 vs 26): one station has
   a known port count and unknown power. Identify it, or ship it as `MISSING` residual.
3. **`weekend_ratio` has one blank more than `night_share`** (42 vs 41) on an
   `ever_active = true` station. Same treatment.
4. **`Coverage.nonzero_cells` / `share_of_cells_with_apartments`** are declared in
   `web/src/data/manifest.ts:26-28` and emitted by **none** of the 35 manifests. Dead types
   that make a reader believe a measurement exists. Delete.
5. **`private_ac_dropped.share_stations` sits beside a different denominator** in the same KPI
   block (§2.1). Label both, or emit `n_before` alongside so the ratio is reconstructible.
6. **`vintage.rejected` is shipped and rendered nowhere** — the best-documented decision in
   the package is invisible.
7. **`store/qa/exclusions.json` is computed, thresholded, and not shipped to the web.**
8. **`quality.n_only_in_secondary` / `share_only_in_secondary` are `null` in all 34** — the
   secondary-operator cross-check never ran. Must render as NOT MEASURED, not as a dash
   beside measured values, and `THIEU_NHA_VAN_HANH_KHAC` can therefore never fire
   (`n10_quality.py:348`) — a flag that is structurally unreachable.

---

## 10. Upstream asks (do not block Phase 8; each gates one claim)

1. **Define `stations.freshness`.** Unit, epoch, and computation. Until then §2.7 ships it as
   a unitless distribution and no threshold may be drawn on it. Gates: any "stale station"
   surface.
2. **Run the secondary-operator cross-check** so §9-8 resolves and
   `THIEU_NHA_VAN_HANH_KHAC` becomes reachable.
3. **Publish the connector-vs-port reconciliation**: 8 823 guns vs 9 878 ports, 28 stations
   with no connector row. Until then the CHUẨN PHÍCH block states the gap rather than
   implying the two count the same thing.
4. **Say whether `ZERO_NO_WEIGHT` cells are uninhabited or unmeasured.** 26.09 % of national
   cells hang on this. Until then §1.4's wording is the only defensible one.

---

## 11. Out of scope

* Any composite health score (§6.3).
* Repairing, imputing or backfilling any value. Phase 8 **reports**; the pipeline decides.
* New upstream computation beyond the counts in §3.
* Chart-image export (PNG/SVG) — belongs to the chart layer, not the data workspace.
* Editing, annotating or flagging data from the browser.
* Health metrics for the proxy POI datasets (`web/public/data/proxy/`, 9 layers, 64 MB) —
  they load through a separate door (`proxy_poi.py`) with a separate manifest and deserve
  their own pass.
