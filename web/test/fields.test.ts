/**
 * Test cho hai họ trường và badge ⚠ — DESIGN.md §6b, §7, §7c, §13c-1.
 *
 * Vì sao có file này: ảnh chụp cho thấy MỘT badge hiện đúng trên MỘT trường. Nó không
 * chứng minh được rằng badge là một **quy tắc** — rằng nó mọc trên mọi trường phủ kém và
 * KHÔNG mọc trên trường mà null có nghĩa (§7a), rằng nó đọc đúng mẫu số của từng đơn vị,
 * và rằng không con số nào bị gõ tay vào TS (§7c).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { baseUnitPhrase } from "../src/units.ts";

import {
  COMMUNE_PREFIX,
  FIELDS,
  FIELD_BY_ID,
  DEFAULT_FIELD,
  LENSES,
  LENS_DECLARATIONS,
  badgesFor,
  defaultFieldOfLens,
  lensOfField,
  mapFieldsOfLens,
  mapFieldsOfUnit,
  fieldsOfUnit,
  unitNoun,
  type FieldMeta,
  type RuntimeCoverage,
} from "../src/fields.ts";
import type { Manifest } from "../src/data/manifest.ts";

// Manifest tối thiểu — chỉ đủ các khoá mà hàm đang test đọc tới.
const manifest = (over: Partial<Manifest> = {}): Manifest =>
  ({
    exported_utc: "",
    n_cells: 4427,
    files: {},
    coverage: {},
    categories: {},
    source_metrics: {},
    snapshots: {
      occupancy_snapshot_id: "",
      occupancy_window: ["", ""],
      vnsdi_valid_from: "",
      osm_pbf: "",
      stations_canonical: "",
    },
    ...over,
  }) as Manifest;

// ── §6b: hai họ trường, một danh sách ──────────────────────────────────────────

test("mọi id là duy nhất — hash `f` phải trỏ tới đúng một trường", () => {
  assert.equal(new Set(FIELDS.map((f) => f.id)).size, FIELDS.length);
});

test("trường của XÃ mang tiền tố; trường của Ô thì không", () => {
  for (const f of FIELDS) {
    assert.equal(
      f.id.startsWith(COMMUNE_PREFIX),
      f.readAs === "commune",
      `${f.id} sai tiền tố so với đơn vị đọc`,
    );
  }
});

test("`column` là tên dữ liệu THẬT, không mang tiền tố", () => {
  // `commune:population` là định danh của app; thứ truy được về dữ liệu là `population`.
  for (const f of FIELDS) assert.doesNotMatch(f.column, /:/, f.id);
  assert.equal(FIELD_BY_ID.get(`${COMMUNE_PREFIX}population`)!.column, "population");
});

test("cùng tên cột tồn tại được ở HAI đơn vị mà không đụng nhau", () => {
  const cell = FIELD_BY_ID.get("population")!;
  const commune = FIELD_BY_ID.get(`${COMMUNE_PREFIX}population`)!;
  assert.equal(cell.column, commune.column);
  assert.notEqual(cell.id, commune.id);
  // Và hai cái nói hai đại lượng khác nhau — đó là lý do §6b tách chúng bằng công tắc.
  //
  // So trên CÂU đơn vị chứ không so hai object: từ khi `unit` là token, `notEqual` trên hai
  // object literal luôn đúng vì chúng là hai tham chiếu khác nhau — test sẽ xanh kể cả khi
  // hai trường nói y hệt một đại lượng.
  assert.equal(cell.unit!.kind, commune.unit!.kind);
  assert.notEqual(baseUnitPhrase(cell.unit), baseUnitPhrase(commune.unit));
});

test("cả hai đơn vị đều có ít nhất một trường — công tắc không dẫn tới danh sách rỗng", () => {
  assert.ok(fieldsOfUnit("cell").length > 0);
  assert.ok(fieldsOfUnit("commune").length > 0);
});

test("đường và trạm là đơn vị đọc thật trong rail, không chỉ mở được từ story", () => {
  assert.deepEqual(mapFieldsOfUnit("road").map((f) => f.id), ["road:dist_station_m"]);
  assert.deepEqual(mapFieldsOfUnit("station").map((f) => f.id), ["station:ports", "station:occ"]);
});

test("độ dài đường trong H3 là biến mô hình, không phải field bản đồ", () => {
  assert.equal(FIELD_BY_ID.get("road_len_m")!.map, false);
  assert.ok(!mapFieldsOfUnit("cell").some((f) => f.id === "road_len_m"));
});

test("composite chưa có sensitivity contract chỉ để inspect, không thành map mặc định", () => {
  for (const id of ["poi_anchor_index", "demand_supply_gap"]) {
    assert.equal(FIELD_BY_ID.get(id)!.map, false, id);
    assert.ok(!mapFieldsOfUnit("cell").some((f) => f.id === id), id);
  }
});

test("mọi field map-hoá có đúng một lens; lens suy ra từ field, không là state thứ hai", () => {
  for (const f of FIELDS.filter((x) => x.map !== false)) {
    assert.ok(LENSES.some((l) => l.id === f.lens), f.id);
    assert.equal(lensOfField(f.id), f.lens, f.id);
  }
});

test("registry khai lens tường minh và phủ đúng một lần mọi analytical field", () => {
  const ids = Object.values(LENS_DECLARATIONS).flat();
  assert.equal(new Set(ids).size, ids.length, "một field không được trả lời hai câu hỏi");
  assert.deepEqual(
    new Set(ids),
    new Set(FIELDS.filter((f) => f.lens !== null).map((f) => f.readAs === "cell" ? `cell:${f.id}` : f.id)),
  );
});

test("lens Tiếp cận chứa line distance, còn lens Sử dụng chứa point occupancy", () => {
  assert.ok(mapFieldsOfLens("access").some((f) => f.id === "road:dist_station_m"));
  assert.ok(mapFieldsOfLens("utilization").some((f) => f.id === "station:occ"));
  assert.ok(mapFieldsOfLens("supply").some((f) => f.id === "station:ports"));
});

test("mỗi lens có default khai báo, không phụ thuộc thứ tự field", () => {
  assert.equal(defaultFieldOfLens("supply")?.id, "station:ports");
  assert.equal(defaultFieldOfLens("access")?.id, "road:dist_station_m");
  assert.equal(defaultFieldOfLens("opportunity")?.id, "screen_margin_m");
});

test("POI là bối cảnh, không được xếp làm bằng chứng cầu", () => {
  for (const id of ["n_poi_1km", "n_poi_total", "n_mall", "n_market", "n_fuel"]) {
    assert.equal(lensOfField(id), null, id);
    assert.equal(FIELD_BY_ID.get(id)!.map, false, id);
  }
});

test("aggregate sử dụng và raw count xã chỉ để inspect", () => {
  for (const id of [
    "util_cell",
    "n_stations_measured",
    "util_pctl_cell",
    "commune:n_stations",
    "commune:n_ports",
    "commune:power_kw_site",
    "commune:util_mean_port_weighted",
  ]) {
    assert.equal(FIELD_BY_ID.get(id)!.map, false, id);
  }
  assert.deepEqual(mapFieldsOfLens("utilization").map((f) => f.id), ["station:occ"]);
});

test("màn hình đầu tiên là đơn vị XÃ, không phải thảm hex (§13b-1)", () => {
  assert.equal(FIELD_BY_ID.get(DEFAULT_FIELD)!.readAs, "commune");
});

// ── §13c-1: trường phái sinh ───────────────────────────────────────────────────

test("nhóm SO SÁNH có các trường phái sinh so sánh theo §13c", () => {
  const ids = FIELDS.filter((f) => f.group === "sosanh").map((f) => f.id);
  assert.deepEqual(new Set(ids), new Set([
    "detour_ratio",
    "dist_station_asym_m",
    "screen_decision",
    "screen_margin_m",
    "pop_beyond_2km",
    "util_pctl_cell",
    "demand_supply_gap",
    `${COMMUNE_PREFIX}ports_per_10k_pop`,
    "station:occ",
  ]));
});

test("trường phái sinh có `expr`; cột thô thì không", () => {
  assert.ok(FIELD_BY_ID.get("pop_beyond_2km")!.expr, "phái sinh phải có công thức");
  assert.equal(FIELD_BY_ID.get("detour_ratio")!.expr, undefined, "detour_ratio là cột thật");
  assert.equal(FIELD_BY_ID.get(`${COMMUNE_PREFIX}ports_per_10k_pop`)!.expr, undefined, "cột của B11");
});

test("`expr` chỉ dùng bí danh `g` cho bảng ô — khớp với truy vấn trong queries.ts", () => {
  for (const f of FIELDS) {
    if (!f.expr) continue;
    assert.match(f.expr, /\bg\./, `${f.id} không tham chiếu bảng ô`);
  }
});

test("`expr` cần bảng ngoài thì PHẢI khai `deps` — nếu không truy vấn sẽ lỗi lúc chạy", () => {
  for (const f of FIELDS) {
    if (!f.expr) continue;
    for (const m of f.expr.matchAll(/read_parquet\('([^']+)'\)/g)) {
      assert.ok(f.deps?.includes(m[1]!), `${f.id} thiếu dep ${m[1]}`);
    }
  }
});

test("chỉ trường CỘNG ĐƯỢC mới có mặt liên tục (§1b)", () => {
  const surface = FIELDS.filter((f) => f.surface).map((f) => f.id);
  // Cộng `built_frac` hay `detour_ratio` của mấy ô lại là vô nghĩa; cộng dân số thì không.
  assert.deepEqual(surface, ["population"]);
  // Và trường đó phải không có ô null, nếu không mặt sẽ trũng đúng chỗ ta không biết.
  assert.equal(FIELD_BY_ID.get("population")!.readAs, "cell");
});

// ── §7 / §7c: badge là QUY TẮC, và không con số nào gõ tay ─────────────────────

test("badge phủ mọc theo số đo, không theo danh sách gõ tay", () => {
  const m = manifest({ coverage: { util_cell: { n_present: 437, cell_share: 0.0987, pop_share: 0.2793 } } });
  const b = badgesFor(FIELD_BY_ID.get("util_cell")!, m);
  assert.equal(b.length, 1);
  assert.equal(b[0]!.kind, "cell");
  assert.match(b[0]!.text, /ô/);
});

test("phủ 100% ⇒ KHÔNG có badge", () => {
  const m = manifest({ coverage: { population: { n_present: 4427, cell_share: 1, pop_share: 1 } } });
  assert.deepEqual(badgesFor(FIELD_BY_ID.get("population")!, m), []);
});

test("§7a: trường mà null CÓ NGHĨA không mang badge, dù phủ chỉ 33%", () => {
  // Trường TỔNG HỢP, không lấy từ FIELDS: sau khi pipeline bỏ `not_buildable_reason` thì
  // không cột nào còn khai `nullMeans`, nhưng QUY TẮC §7a vẫn sống trong `badgesFor` và
  // vẫn phải đúng. Test quy tắc chứ không test dữ liệu — đúng tinh thần §12: dữ liệu đổi
  // thì test không được im lặng biến mất cùng nó.
  const f: FieldMeta = {
    id: "gia_dinh",
    column: "gia_dinh",
    readAs: "cell",
    lens: null,
    group: "dat",
    label: "Trường giả định",
    desc: "Null ở đây nghĩa là “biết là không”, không phải “không biết”.",
    unit: null,
    kind: "categorical",
    nullMeans: "Ô trống nghĩa là ĐẶT ĐƯỢC.",
  };
  const m = manifest({
    coverage: { gia_dinh: { n_present: 1466, cell_share: 0.3311, pop_share: 0.0331 } },
  });
  assert.deepEqual(badgesFor(f, m), []);
  // Cùng con số đó, bỏ `nullMeans` đi thì badge PHẢI mọc — nếu không thì phép kiểm trên
  // pass vì lý do sai (ví dụ vì tra nhầm khoá coverage).
  assert.equal(badgesFor({ ...f, nullMeans: undefined }, m).length, 1);
});

test("trường của XÃ đếm bằng “xã”, không bằng “ô” — mẫu số 126 chứ không 4.427", () => {
  const rt = new Map<string, RuntimeCoverage>([
    [`${COMMUNE_PREFIX}util_mean_port_weighted`, { n_present: 118, n_total: 126, share: 118 / 126, pop_share: 0.9369 }],
  ]);
  const b = badgesFor(FIELD_BY_ID.get(`${COMMUNE_PREFIX}util_mean_port_weighted`)!, manifest(), rt);
  assert.equal(b.length, 1);
  assert.match(b[0]!.text, /xã/);
  assert.doesNotMatch(b[0]!.text, /ô/);
  assert.match(b[0]!.explain, /118\/126/);
});

test("trường phái sinh lấy phủ từ SỐ ĐO LÚC CHẠY, không từ manifest", () => {
  // Cột `population` có trong manifest với phủ 100%; nếu `pop_beyond_2km` lỡ đọc nhầm
  // sang đó thì badge sẽ biến mất và không ai biết.
  const m = manifest({ coverage: { population: { n_present: 4427, cell_share: 1, pop_share: 1 } } });
  const rt = new Map<string, RuntimeCoverage>([
    ["pop_beyond_2km", { n_present: 4376, n_total: 4427, share: 0.9885, pop_share: 0.9964 }],
  ]);
  const b = badgesFor(FIELD_BY_ID.get("pop_beyond_2km")!, m, rt);
  assert.equal(b.length, 1);
  assert.match(b[0]!.explain, /4\.376\/4\.427/);
});

test("thiếu số đo thì KHÔNG có badge — không đoán (§12)", () => {
  assert.deepEqual(badgesFor(FIELD_BY_ID.get("pop_beyond_2km")!, manifest()), []);
});

test("`coverageNote` dạng hàm chạy được cả khi manifest thiếu khoá nó cần", () => {
  // util_cell muốn `cells_with_station` và `occ_status_ok`; thiếu thì phải nói câu không
  // có số, không được ném lỗi và không được bịa số.
  const m = manifest({ coverage: { util_cell: { n_present: 437, cell_share: 0.0987, pop_share: 0.2793 } } });
  const b = badgesFor(FIELD_BY_ID.get("util_cell")!, m);
  assert.equal(b.length, 1);
  assert.match(b[0]!.explain, /chỉ tồn tại ở ô có trạm công cộng/i);
});

test("`coverageNote` dạng hàm dùng ĐÚNG số của manifest khi có", () => {
  const m = manifest({
    coverage: {
      util_cell: {
        n_present: 437,
        cell_share: 0.0987,
        pop_share: 0.2793,
        cells_with_station: 449,
        share_measured_among_cells_with_station: 0.9733,
      },
    },
    source_metrics: { occ_status_ok: { n_total: 703, n_ok: 676, share: 0.9616 } },
  });
  const explain = badgesFor(FIELD_BY_ID.get("util_cell")!, m)[0]!.explain;
  assert.match(explain, /449/);
  assert.match(explain, /97,3%/);
  assert.match(explain, /96,2%/);
});

test("không SỐ ĐO PHỦ nào bị gõ cứng cạnh badge ⚠ (§7c)", () => {
  // Phạm vi cố ý hẹp: `coverageNote` và `nullMeans` là hai chuỗi đứng NGAY CẠNH badge ⚠,
  // nên một phần trăm nằm đó sẽ đọc như số đo hiện hành — và sẽ âm thầm sai khi dữ liệu
  // đổi. Đúng chuyện đã xảy ra ở M1.2: câu "thưa về DIỆN TÍCH, không thưa về NGƯỜI" của
  // `util_cell` thành sai sau bộ lọc §3a mà không có gì báo. Cách sửa là biến nó thành
  // HÀM của manifest — và hàm thì không lọt qua phép kiểm này.
  //
  // `desc` KHÔNG bị kiểm: ở đó phần trăm là **ngưỡng định nghĩa**, không phải số đo.
  // `buildable` ghi "đã xây dựng ≥ 5% và mặt nước ≤ 50%" — đó là luật của DECISIONS §7,
  // nó không đổi khi dữ liệu đổi, nên nó không thuộc loại nợ mà §7c nhắm tới.
  for (const f of FIELDS) {
    const nearBadge = [
      typeof f.coverageNote === "string" ? f.coverageNote : "",
      f.nullMeans ?? "",
    ].join(" ");
    assert.doesNotMatch(nearBadge, /\d+([.,]\d+)?\s*%/, `${f.id} có phần trăm gõ tay`);
  }
});

// ── Chi tiết nhỏ nhưng dễ sai ──────────────────────────────────────────────────

test("unitNoun khớp với đơn vị đọc", () => {
  assert.equal(unitNoun("cell"), "ô");
  assert.equal(unitNoun("commune"), "xã");
});

test("mọi trường đều có nhãn, mô tả và nhóm hợp lệ", () => {
  const groups = new Set(["cau", "dat", "duong", "cung", "tiepcan", "sosanh"]);
  for (const f of FIELDS) {
    assert.ok(f.label.length > 0, f.id);
    assert.ok(f.desc.length > 0, f.id);
    assert.ok(groups.has(f.group), `${f.id}: nhóm lạ ${f.group}`);
  }
});

// ── §6: mọi cột bản đồ hoá được phải có mặt — không sót cột nào ────────────────

test("nhóm ĐƯỜNG có `road_len_in_province_m`, và KHÔNG còn bản mang tên tỉnh", () => {
  // Trước đây hai trường sống cạnh nhau — `road_len_in_hanoi_m` cho bộ Hà Nội riêng và
  // `road_len_in_province_m` cho store toàn quốc — vì đổi tên cột ở bộ cũ sẽ dựng lại mọi
  // con số đã công bố. Bộ gốc nay nhân bản từ tỉnh 01 nên chỉ còn MỘT tên.
  //
  // Assert cả hai chiều: tên tỉnh-hoá không được quay lại, vì nó là mầm của một fork.
  const f = FIELD_BY_ID.get("road_len_in_province_m");
  assert.ok(f, "cột tồn tại trong lưới thì phải có FieldMeta (§6: chia hết, không sót)");
  assert.equal(f!.group, "duong");
  assert.equal(f!.readAs, "cell");
  assert.equal(FIELD_BY_ID.get("road_len_in_hanoi_m"), undefined);
});

// ── §7a mở rộng: null có HAI nguyên nhân (M3-Q3) ──────────────────────────────

test("chỉ `detour_ratio` khai `nullSplit`, và cột phân loại phải là cột bool có thật", () => {
  const split = FIELDS.filter((f) => f.nullSplit);
  assert.deepEqual(split.map((f) => f.id), ["detour_ratio"]);
  for (const f of split) {
    const by = FIELD_BY_ID.get(f.nullSplit!.by);
    assert.ok(by, `${f.id}: cột phân loại ${f.nullSplit!.by} không tồn tại`);
    assert.equal(by!.kind, "bool", "cột phân loại phải là bool");
  }
});

test("trường có `nullSplit` KHÔNG được đồng thời khai `nullMeans`", () => {
  // Hai cơ chế loại trừ nhau: `nullMeans` tắt ⚠ cho CẢ trường, `nullSplit` chỉ tắt cho một
  // nhóm. Khai cả hai thì nhóm "không biết" mất badge — đúng cái §7a muốn tránh.
  for (const f of FIELDS) {
    assert.ok(!(f.nullSplit && f.nullMeans), `${f.id} khai cả hai`);
  }
});

test("badge trừ nhóm “không áp dụng” khỏi mẫu số, và NÓI RA điều đó", () => {
  const rt = new Map<string, RuntimeCoverage>([
    ["detour_ratio", { n_present: 4264, n_total: 4314, share: 4264 / 4314, pop_share: 0.935, n_not_applicable: 86 }],
  ]);
  const b = badgesFor(FIELD_BY_ID.get("detour_ratio")!, manifest(), rt);
  assert.equal(b.length, 1);
  assert.match(b[0]!.explain, /4\.264\/4\.314/);
  assert.match(b[0]!.explain, /Mẫu số đã trừ 86 ô/);
});

test("không có `n_not_applicable` thì câu đó KHÔNG hiện — không bịa (§12)", () => {
  const rt = new Map<string, RuntimeCoverage>([
    ["detour_ratio", { n_present: 4264, n_total: 4400, share: 0.969, pop_share: 0.935 }],
  ]);
  const b = badgesFor(FIELD_BY_ID.get("detour_ratio")!, manifest(), rt);
  // Nhắm ĐÚNG câu được chèn, không nhắm cụm chữ chung: `coverageNote` của trường này cũng
  // nói về "câu hỏi không áp dụng", nên regex lỏng sẽ pass/fail vì lý do sai.
  assert.doesNotMatch(b[0]!.explain, /Mẫu số đã trừ/);
});

test("`detour_ratio` đọc phủ từ SỐ ĐO LÚC CHẠY, không từ manifest — dù nó là cột thô", () => {
  // manifest chỉ biết tổng null (136), không biết 86 trong đó là "không áp dụng".
  const m = manifest({ coverage: { detour_ratio: { n_present: 4264, cell_share: 0.969, pop_share: 0.935 } } });
  assert.deepEqual(badgesFor(FIELD_BY_ID.get("detour_ratio")!, m), []);
});
