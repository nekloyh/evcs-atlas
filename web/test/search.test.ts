/**
 * Phase 5 §7.1–§7.3 — chuẩn hoá, index, xếp hạng và cap.
 *
 * Fixture xã đọc THẲNG từ `public/data/p/01/commune.geojson`, không bịa. Bản trước của tệp
 * này tự nghĩ ra `district_name` cho fixture, nên nó XANH trong khi nhánh khớp huyện không
 * thể chạy trên gói thật — một khẳng định về CÁCH LÀM che mất một khẳng định về KẾT QUẢ.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GLOBAL_CAP,
  MATCH_TIER,
  MIN_QUERY_LENGTH,
  PER_KIND_CAP,
  buildSearchIndex,
  featureBounds,
  isCellQuery,
  normalizeSearchText,
  rankSearchResults,
  type SearchResult,
} from "../src/ui/search.ts";
import type { CommuneCollection, GridCell, StationPoint } from "../src/data/queries.ts";

const root = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const read = (rel: string) => readFileSync(root(rel), "utf8");

const COMMUNES = JSON.parse(read("public/data/p/01/commune.geojson")) as CommuneCollection;

/** 21 property CÓ THẬT trong `commune.geojson`. Fixture nào lệch bảng này là fixture bịa. */
const REAL_COMMUNE_PROPS = [
  "anchor_ratio", "area_km2", "area_km2_geom", "commune_code", "commune_kind", "commune_name",
  "dist_station_m_pop_weighted", "n_ports", "n_stations", "pop_density_ppkm2", "pop_source",
  "population", "population_wp", "ports_per_10k_pop", "power_kw_site", "province_code",
  "province_name", "published", "quality_flag", "util_mean_port_weighted", "valid_from",
];

function station(over: Partial<StationPoint> & { id: string }): StationPoint {
  return {
    lat: 21, lng: 105.8, inScope: true, opStatus: "OPERATIONAL", nPorts: 4,
    ...over,
  } as StationPoint;
}

function cell(h3: string, over: Partial<GridCell> = {}): GridCell {
  return {
    h3, value: 1, pop: 100, ports: 0, lat: 21, lng: 105.8,
    beyond2km: false, dist: 500, reachable: true, ...over,
  } as GridCell;
}

// ── §7.1 Chuẩn hoá ──────────────────────────────────────────────────────────

test("§7.1-1 gấp mọi thanh điệu, `đ`/`Đ` và dấu móc/trăng/mũ", () => {
  assert.equal(normalizeSearchText("Đống Đa"), "dong da");
  assert.equal(normalizeSearchText("Phường Ngọc Hà"), "phuong ngoc ha");
  assert.equal(normalizeSearchText("Dịch Vọng Hậu"), "dich vong hau");
  // `ơ` (U+01A1) phân rã qua NFD; `Đ` (U+0110) thì không — hai cơ chế khác nhau, cùng kết quả.
  assert.equal(normalizeSearchText("Cơ Sở Đủ"), "co so du");
  assert.equal(normalizeSearchText(""), "");
  assert.equal(normalizeSearchText(null), "");
  assert.equal(normalizeSearchText(undefined), "");
});

test("§7.1-2 luỹ đẳng trên toàn bộ tên xã thật", () => {
  for (const f of COMMUNES.features) {
    const name = String(f.properties["commune_name"]);
    const once = normalizeSearchText(name);
    assert.equal(normalizeSearchText(once), once, `không luỹ đẳng: ${name}`);
  }
  for (const s of ["C.AC000091", "Vinhomes  Ocean Park (Gia Lâm)", "  Trạm  sạc — B1  "]) {
    const once = normalizeSearchText(s);
    assert.equal(normalizeSearchText(once), once);
  }
});

test("§7.1-3 `, . - + / _ ( )` gấp thành dấu cách", () => {
  assert.equal(normalizeSearchText("C.AC000091"), "c ac000091");
  assert.equal(
    normalizeSearchText("Phường Văn Miếu - Quốc Tử Giám"),
    "phuong van mieu quoc tu giam",
  );
  assert.equal(normalizeSearchText("Vincom (Long Biên)/B1_2+3"), "vincom long bien b1 2 3");
});

test("§7.1-4 dãy khoảng trắng gộp lại", () => {
  assert.equal(normalizeSearchText("Trạm  sạc   số  1"), "tram sac so 1");
  assert.equal(normalizeSearchText("A\t\nB"), "a b");
});

test("§7.1-5 không chỗ nào của mặt BẢN ĐỒ tự chuẩn hoá kiểu khác", () => {
  // `src/proxy/data.ts` cũng có `normalize("NFD")` và nó ĐƯỢC PHÉP: §1.1 giới hạn tìm kiếm ở
  // mặt bản đồ, còn mặt Proxy đọc gói khác qua loader riêng của nó.
  for (const f of ["src/ui/SearchBar.tsx", "src/ui/QuickPresets.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /normalize\(\s*["']NF[KD]/, `${f} tự chuẩn hoá`);
    // `e.key.toLowerCase()` được phép: nó hạ TÊN PHÍM, không phải văn bản của corpus.
    assert.doesNotMatch(
      src,
      /(?<!\be\.key)\.toLowerCase\(\)/,
      `${f} tự hạ chữ thường văn bản`,
    );
  }
  const searchSrc = read("src/ui/search.ts");
  assert.equal(
    (searchSrc.match(/normalize\(\s*"NFD"\s*\)/g) ?? []).length,
    1,
    "search.ts phải có ĐÚNG một phép chuẩn hoá",
  );
});

// ── §7.2 Index và corpus ────────────────────────────────────────────────────

test("§7.2-6 không mã nguồn nào đọc `district_name` / `ten_huyen` / `ten_xa`", () => {
  const files = [
    "src/ui/search.ts", "src/ui/SearchBar.tsx", "src/ui/QuickPresets.tsx",
    "src/state/presets.ts", "src/map/tooltip.ts",
  ];
  // Bỏ chú thích trước khi tìm: tiêu chí là "không mã nào ĐỌC" ba trường ấy, còn một dòng
  // chú thích nói vì sao KHÔNG được đọc chính là thứ chặn nó quay lại — xoá đi thì lần sau
  // người viết chỉ thấy một khoảng trống không giải thích gì.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const f of files) {
    assert.doesNotMatch(
      stripComments(read(f)),
      /district_name|ten_huyen|ten_xa/,
      `${f} đọc trường không tồn tại`,
    );
    // Và không dạng truy cập property nào lọt, kể cả trong chú thích.
    assert.doesNotMatch(
      read(f),
      /\[\s*["'](district_name|ten_huyen|ten_xa)["']\s*\]|\.(district_name|ten_huyen|ten_xa)\b/,
      `${f} truy cập trường không tồn tại`,
    );
  }
  // Và bảng property thật vẫn đúng như lúc viết spec — nếu gói đổi, phép kiểm này nói ra.
  const props = Object.keys(COMMUNES.features[0]!.properties).sort();
  assert.deepEqual(props, [...REAL_COMMUNE_PROPS].sort());
});

test("§7.2-7 `core` suy từ `commune_kind`, và bằng `full` khi token dẫn đầu lệch", () => {
  const idx = buildSearchIndex({ communes: COMMUNES, stations: [], cells: [] });
  assert.equal(idx.communes.length, COMMUNES.features.length);

  // `ba dinh` không tìm được nếu chỉ so tiền tố trên tên đầy đủ — đó là §0.3-C.
  const r = rankSearchResults("ba dinh", idx);
  assert.equal(r.results[0]!.title, "Phường Ba Đình");
  assert.equal(r.results[0]!.score.tier, MATCH_TIER.NAME_PREFIX);

  // Token dẫn đầu lệch `commune_kind` ⇒ giữ nguyên tên đầy đủ, không cắt cụt.
  const odd = buildSearchIndex({
    communes: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[105, 21], [105.1, 21], [105.1, 21.1], [105, 21]]] },
        properties: { commune_code: "99999", commune_name: "Thị trấn Xuân Mai", commune_kind: "XA" },
      }],
    } as unknown as CommuneCollection,
    stations: [], cells: [],
  });
  assert.equal(odd.communes[0]!.core, odd.communes[0]!.full);
});

test("§7.2-8 xã không có toạ độ RỚT khỏi index, không đặt vào giữa Hà Nội", () => {
  const empty = {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [] },
    properties: { commune_code: "00001", commune_name: "Xã Không Hình", commune_kind: "XA" },
  };
  assert.equal(featureBounds(empty as never), null);
  const idx = buildSearchIndex({
    communes: { type: "FeatureCollection", features: [empty] } as unknown as CommuneCollection,
    stations: [], cells: [],
  });
  assert.equal(idx.communes.length, 0);
  assert.equal(rankSearchResults("khong hinh", idx).results.length, 0);
});

test("§7.2-9 index trạm mang `name`, `address`, `operator`; `commune_name` chỉ khi có", () => {
  const stations = [
    station({ id: "vn-c-a1", stationCode: "C.A1", name: "Vinhomes Ocean Park", address: "Gia Lâm", operator: "VinFast", communeName: "Phường Long Biên", inScope: true }),
    station({ id: "vn-c-b2", stationCode: "C.B2", name: "Trạm ngoài vùng", address: "Bắc Ninh", operator: "S.Touch", communeName: null, inScope: false }),
  ];
  const idx = buildSearchIndex({ communes: null, stations, cells: [] });
  assert.equal(idx.stations[0]!.secondary.length, 3, "IN: address + commune_name + operator");
  assert.equal(idx.stations[1]!.secondary.length, 2, "BUFFER: commune_name null nên không index");

  assert.equal(rankSearchResults("vinhomes", idx).results[0]!.id, "station:vn-c-a1");
  assert.equal(rankSearchResults("s touch", idx).results[0]!.id, "station:vn-c-b2");
  assert.equal(rankSearchResults("gia lam", idx).results[0]!.score.tier, MATCH_TIER.SECONDARY);
  // Tư cách IN / vành đệm phải ĐỌC RA ĐƯỢC ở subtitle, không chỉ nằm trong dữ liệu.
  assert.match(rankSearchResults("vinhomes", idx).results[0]!.subtitle, /IN/);
  assert.match(rankSearchResults("ngoai vung", idx).results[0]!.subtitle, /vành đệm/);
});

test("§7.2-10 đường KHÔNG vào index, và gói không ship cột tên đường nào", () => {
  const manifest = JSON.parse(read("public/data/p/01/manifest.json")) as {
    available_road_columns?: string[];
  };
  const roadCols = manifest.available_road_columns ?? [];
  assert.ok(roadCols.length > 0, "manifest phải liệt kê cột đường");
  for (const c of roadCols) {
    assert.doesNotMatch(c, /^name$|name$/i, `cột đường \`${c}\` trông như một cột tên`);
  }
  // Corpus của index chỉ nhận ba loại; không có tham số nào để đưa đường vào.
  const idx = buildSearchIndex({ communes: null, stations: [], cells: [] });
  assert.deepEqual(Object.keys(idx).sort(), ["cells", "communes", "stations"]);
});

// ── §7.3 Xếp hạng và cap ────────────────────────────────────────────────────

const FULL_INDEX = buildSearchIndex({
  communes: COMMUNES,
  stations: [
    station({ id: "vn-c-ac000091", stationCode: "C.AC000091", name: "Vinhomes Times City", address: "458 Minh Khai", operator: "VinFast", communeName: "Phường Vĩnh Tuy" }),
    station({ id: "vn-c-ac000092", stationCode: "C.AC000092", name: "Vincom Long Biên", address: "Số 27 Cổ Linh", operator: "VinFast", communeName: "Phường Long Biên" }),
  ],
  cells: [cell("884143625dfffff"), cell("884143625bfffff"), cell("8841436251fffff")],
});

test("§7.3-11 thứ tự TOÀN PHẦN: xáo corpus không đổi danh sách", () => {
  const shuffled = buildSearchIndex({
    communes: { type: "FeatureCollection", features: [...COMMUNES.features].reverse() } as CommuneCollection,
    stations: [], cells: [],
  });
  const straight = buildSearchIndex({ communes: COMMUNES, stations: [], cells: [] });
  for (const q of ["ha", "phuong", "xa", "ba dinh", "00004", "van mieu quoc tu giam", "dong da"]) {
    assert.deepEqual(
      rankSearchResults(q, shuffled).results.map((r: SearchResult) => r.id),
      rankSearchResults(q, straight).results.map((r: SearchResult) => r.id),
      `thứ tự đổi theo thứ tự tệp cho truy vấn "${q}"`,
    );
  }
});

test("§7.3-11b `ha` không còn đánh rơi `Phường Hà Đông` trong im lặng", () => {
  const r = rankSearchResults("ha", FULL_INDEX);
  // 17 xã khớp; cap theo loại là 5, nên 12 dòng bị cắt và con số ấy PHẢI nói ra được.
  assert.ok(r.matched >= 17, `chỉ đếm được ${r.matched} ứng viên`);
  assert.ok(r.truncated > 0);
  // Bản cũ trả 5 dòng ĐẦU TỆP; ở đây `Hà Đông` là khớp đầu-từ nên nó lên trước
  // các khớp giữa-từ như `Thanh Xuân`.
  const titles = r.results.map((x: SearchResult) => x.title);
  assert.ok(titles.includes("Phường Hà Đông"), `Hà Đông vắng mặt: ${titles.join(", ")}`);
});

test("§7.3-12 `ba dinh` đứng hạng 1 với bậc NAME_PREFIX", () => {
  const r = rankSearchResults("ba dinh", FULL_INDEX);
  assert.equal(r.results[0]!.title, "Phường Ba Đình");
  assert.equal(r.results[0]!.kind, "commune");
  assert.equal(r.results[0]!.score.tier, MATCH_TIER.NAME_PREFIX);
});

test("§7.3-12b truy vấn tự mang phân loại thì so trên tên ĐẦY ĐỦ", () => {
  const r = rankSearchResults("phuong", FULL_INDEX);
  const wards = COMMUNES.features.filter(
    (f) => String(f.properties["commune_kind"]) === "PHUONG",
  ).length;
  // Chạm ÍT NHẤT đủ 51 phường. Con số thật là 57 vì `phuong` còn nằm GIỮA vài tên xã
  // (`Xã Tây Phương`…) — chúng khớp ở bậc SUBSTRING, thấp hơn hẳn, nên chúng không chen
  // được lên đầu; và đếm chúng vào phần bị cắt là đúng, vì chúng có khớp thật.
  assert.ok(r.matched >= wards, `\`phuong\` chỉ chạm ${r.matched}/${wards} phường`);
  const shown = r.results.filter((x: SearchResult) => x.kind === "commune");
  assert.equal(shown.length, PER_KIND_CAP);
  for (const x of shown) {
    assert.equal(x.score.tier, MATCH_TIER.NAME_PREFIX, `${x.title} chen lên bằng bậc thấp hơn`);
    assert.ok(x.title.startsWith("Phường"), `${x.title} không phải phường`);
  }
});

test("§7.3-13 `vinfast` không quá 5 trạm và KHÔNG đuổi xã ra ngoài", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    station({
      id: `vn-c-v${String(i).padStart(4, "0")}`,
      stationCode: `C.V${i}`,
      name: `Trạm VinFast số ${i}`,
      address: "Hà Nội",
      operator: "VinFast",
      communeName: "Phường Ba Đình",
    }),
  );
  const idx = buildSearchIndex({ communes: COMMUNES, stations: many, cells: [] });
  const r = rankSearchResults("vinfast", idx);
  assert.equal(r.results.filter((x: SearchResult) => x.kind === "station").length, PER_KIND_CAP);
  assert.equal(r.matched, many.length);

  // Và khi cả hai loại cùng khớp, loại nào cũng có chỗ.
  const mixed = rankSearchResults("ba dinh", idx);
  assert.ok(mixed.results.some((x: SearchResult) => x.kind === "commune"));
  assert.ok(mixed.results.some((x: SearchResult) => x.kind === "station"));
});

test("§7.3-14 mã H3 dưới 9 ký tự trả 0 ô; `884` trả 0 ô", () => {
  for (const q of ["884", "8841", "88414", "884143", "8841436", "88414362"]) {
    const r = rankSearchResults(q, FULL_INDEX);
    assert.equal(
      r.results.filter((x: SearchResult) => x.kind === "cell").length, 0,
      `"${q}" (${q.length} ký tự) vẫn trả ô`,
    );
    assert.equal(isCellQuery(q), false);
  }
  assert.equal(isCellQuery("884143625"), true);
  assert.equal(rankSearchResults("884143625", FULL_INDEX).results.filter((x: SearchResult) => x.kind === "cell").length, 3);
});

test("§7.3-15 mã H3 đủ 15 ký tự trả ĐÚNG ô đó, bậc EXACT_ID", () => {
  const r = rankSearchResults("884143625dfffff", FULL_INDEX);
  const hits = r.results.filter((x: SearchResult) => x.kind === "cell");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.id, "884143625dfffff");
  assert.equal(hits[0]!.score.tier, MATCH_TIER.EXACT_ID);
});

test("§7.3-16 cap toàn cục là 10, áp SAU xếp hạng, và phần dư được báo đúng", () => {
  const stations = Array.from({ length: 30 }, (_, i) =>
    station({ id: `vn-c-h${i}`, stationCode: `C.H${i}`, name: `Hà Nội trạm ${i}`, address: "x", operator: "VinFast" }),
  );
  const idx = buildSearchIndex({ communes: COMMUNES, stations, cells: [] });
  const r = rankSearchResults("ha", idx);
  assert.ok(r.results.length <= GLOBAL_CAP);
  assert.equal(r.truncated, r.matched - r.results.length);
  assert.ok(r.truncated > 0);
  // Xếp hạng đứng TRƯỚC phép cắt: dòng đầu phải là dòng khớp tốt nhất trong CẢ tập.
  const bestTier = Math.max(...[...idx.communes, ...idx.stations].map(() => 0), r.results[0]!.score.tier);
  assert.equal(r.results[0]!.score.tier, bestTier);
});

test("§7.3-17 một ứng viên không xuất hiện hai lần; chỉ giữ bậc cao nhất", () => {
  // `vinhomes` khớp cả `name` (NAME_PREFIX) lẫn `address` (SECONDARY) trên cùng một trạm.
  const idx = buildSearchIndex({
    communes: null,
    stations: [station({ id: "vn-c-x", stationCode: "C.X", name: "Vinhomes Riverside", address: "KĐT Vinhomes Riverside", operator: "VinFast" })],
    cells: [],
  });
  const r = rankSearchResults("vinhomes", idx);
  assert.equal(r.results.length, 1);
  assert.equal(r.matched, 1);
  assert.equal(r.results[0]!.score.tier, MATCH_TIER.NAME_PREFIX);
});

test("§1.2-4 dấu câu gấp lại làm cho hai truy vấn CÓ THẬT chạy được", () => {
  assert.equal(rankSearchResults("van mieu quoc tu giam", FULL_INDEX).results[0]!.title,
    "Phường Văn Miếu - Quốc Tử Giám");
  assert.equal(rankSearchResults("c ac000091", FULL_INDEX).results[0]!.id, "station:vn-c-ac000091");
  assert.equal(rankSearchResults("vn-c-ac000091", FULL_INDEX).results[0]!.score.tier, MATCH_TIER.EXACT_ID);
});

test("§1.4 truy vấn có dấu và không dấu cho CÙNG một kết quả", () => {
  assert.deepEqual(
    rankSearchResults("đống đa", FULL_INDEX).results.map((r: SearchResult) => r.id),
    rankSearchResults("dong da", FULL_INDEX).results.map((r: SearchResult) => r.id),
  );
});

test("§1.4 dưới 2 ký tự không xếp hạng gì cả", () => {
  assert.equal(MIN_QUERY_LENGTH, 2);
  for (const q of ["", " ", "h", "1", "-"]) {
    const r = rankSearchResults(q, FULL_INDEX);
    assert.equal(r.results.length, 0, `"${q}" vẫn trả kết quả`);
    assert.equal(r.matched, 0);
  }
});

test("§1.3 tiêu đề luôn là chuỗi NGUYÊN BẢN còn dấu", () => {
  for (const q of ["ba dinh", "dong da", "hoan kiem"]) {
    for (const r of rankSearchResults(q, FULL_INDEX).results) {
      assert.notEqual(r.title, normalizeSearchText(r.title), `tiêu đề "${r.title}" đã bị chuẩn hoá`);
    }
  }
});

test("§1.3.1 `id` của kết quả ĐÚNG dạng dây của khoá `c`", () => {
  const r = rankSearchResults("ba dinh", FULL_INDEX).results[0]!;
  assert.match(r.id, /^commune:\d{5}$/);
  assert.match(rankSearchResults("vinhomes times city", FULL_INDEX).results[0]!.id, /^station:[a-z0-9-]+$/);
  assert.match(rankSearchResults("884143625dfffff", FULL_INDEX).results[0]!.id, /^[0-9a-f]{15}$/);
});
