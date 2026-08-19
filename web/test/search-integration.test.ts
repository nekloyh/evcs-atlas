/**
 * Phase 5 §7.4 · §7.5 · §7.6-36/37 · §7.7 — tầng STORE và tầng trạng thái của popup.
 *
 * Các test này gọi thẳng `useStore.getState()`. Bản trước của tệp này viết lại logic ngay
 * trong thân test (mô hình `handleEscape` riêng, vòng lặp bọc chỉ số riêng) rồi kiểm mô hình
 * đó — nên nó xanh trong khi mô hình LỆCH với handler đã ship. Ở đây mọi khẳng định chạy qua
 * mã sản phẩm thật.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { useStore } from "../src/state/store";
import { parseEntitySelection } from "../src/state/selection";
import {
  CELL_MIN_ZOOM,
  COMMUNE_ZOOM_MAX,
  COMMUNE_ZOOM_MIN,
  STATION_MIN_ZOOM,
  zoomForFeatureBounds,
} from "../src/state/view-config";
import { PRESETS, presetStatsFrom, resolvePreset } from "../src/state/presets";
import { buildSearchIndex, rankSearchResults } from "../src/ui/search";
import { filterEquals, powerTierOf } from "../src/state/filter";
import type { CommuneCollection } from "../src/data/queries";
import type { Manifest } from "../src/data/manifest";

const root = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const read = (rel: string) => readFileSync(root(rel), "utf8");

const COMMUNES = JSON.parse(read("public/data/p/01/commune.geojson")) as CommuneCollection;
const MANIFEST = JSON.parse(read("public/data/p/01/manifest.json")) as Manifest;
const POP = JSON.parse(read("test/fixtures/p01-population.json")) as { values: number[] };
const STA = JSON.parse(read("test/fixtures/p01-stations.json")) as {
  rows: { scope: string; powerKwMaxPort: number | null }[];
};

const STATS = presetStatsFrom({
  cells: POP.values.map((pop, i) => ({ h3: String(i), pop })),
  stations: STA.rows.map((r) => ({
    inScope: r.scope === "IN",
    powerKwMaxPort: r.powerKwMaxPort,
    powerTier: powerTierOf(r.powerKwMaxPort),
  })),
  manifest: MANIFEST,
});

const INDEX = buildSearchIndex({ communes: COMMUNES, stations: [], cells: [] });
const communeResult = (query: string) => {
  const r = rankSearchResults(query, INDEX).results[0];
  if (!r) throw new Error(`không có kết quả cho "${query}"`);
  return r;
};

const BASE_VIEW = { lng: 105.84, lat: 21, zoom: 9.3, pitch: 0, bearing: 0 };

function reset(over: Partial<ReturnType<typeof useStore.getState>> = {}) {
  useStore.setState({
    view: { ...BASE_VIEW },
    selection: null,
    contextSelection: null,
    ...over,
  });
}

// ── §7.5 Điều hướng ─────────────────────────────────────────────────────────

test("§7.5-25 `searchNavigate` GIỮ NGUYÊN `pitch` và `bearing`", () => {
  reset({ mode: "3d", view: { ...BASE_VIEW, pitch: 50, bearing: 24 } });
  useStore.getState().searchNavigate(communeResult("ba dinh"));
  const v = useStore.getState().view;
  assert.equal(v.pitch, 50, "pitch bị ép về 0 — camera phẳng trong khi mode vẫn là 3d");
  assert.equal(v.bearing, 24);
  assert.equal(useStore.getState().mode, "3d");
});

test("§7.5-26 mức phóng của xã suy từ hộp bao, kẹp trong [10, 15]", () => {
  const hoanKiem = communeResult("hoan kiem");
  const daPhuc = communeResult("da phuc");
  assert.equal(hoanKiem.title, "Phường Hoàn Kiếm");
  assert.equal(daPhuc.title, "Xã Đa Phúc");

  const zk = zoomForFeatureBounds(hoanKiem.bbox!);
  const zd = zoomForFeatureBounds(daPhuc.bbox!);
  assert.notEqual(zk, zd, "hai xã lệch nhau 8,1 lần bề ngang mà vẫn ra cùng một mức phóng");
  assert.ok(zk > zd, "xã nhỏ hơn phải phóng gần hơn");
  for (const z of [zk, zd]) {
    assert.ok(z >= COMMUNE_ZOOM_MIN && z <= COMMUNE_ZOOM_MAX, `${z} ngoài khoảng kẹp`);
  }

  reset();
  useStore.getState().searchNavigate(hoanKiem);
  assert.equal(useStore.getState().view.zoom, zk);
  // Tâm là tâm HỘP BAO, không phải trọng tâm đa giác: với một xã nhiều mảnh, trọng tâm có
  // thể rơi ra ngoài chính xã đó.
  assert.equal(useStore.getState().view.lng, hoanKiem.center[0]);
  assert.equal(useStore.getState().view.lat, hoanKiem.center[1]);
});

test("§7.5-27 đi tới Trạm hoặc Ô KHÔNG BAO GIỜ lùi mức phóng ra xa", () => {
  const station = { id: "station:vn-c-ac000091", kind: "station" as const, center: [105.8, 21] as const, bbox: null };
  const cell = { id: "884143625dfffff", kind: "cell" as const, center: [105.8, 21] as const, bbox: null };

  reset({ view: { ...BASE_VIEW, zoom: 16.4 } });
  useStore.getState().searchNavigate(station);
  assert.equal(useStore.getState().view.zoom, 16.4, "đã lùi khỏi mức phóng người dùng tự chọn");

  reset({ view: { ...BASE_VIEW, zoom: 16.4 } });
  useStore.getState().searchNavigate(cell);
  assert.equal(useStore.getState().view.zoom, 16.4);

  reset({ view: { ...BASE_VIEW, zoom: 9.3 } });
  useStore.getState().searchNavigate(station);
  assert.equal(useStore.getState().view.zoom, STATION_MIN_ZOOM);

  reset({ view: { ...BASE_VIEW, zoom: 9.3 } });
  useStore.getState().searchNavigate(cell);
  assert.equal(useStore.getState().view.zoom, CELL_MIN_ZOOM);
});

test("§7.5-28 `field`, `filter`, `layers`, `t`, `mode` KHÔNG đổi khi điều hướng", () => {
  const demand = PRESETS.find((p) => p.id === "demand-top-decile")!;
  const resolved = resolvePreset(demand, STATS)!;
  reset();
  useStore.getState().applyPreset(demand, resolved);
  useStore.setState({ t: 75, layers: new Set(["stations", "beyond2km"]) });

  const before = useStore.getState();
  const snapshot = {
    field: before.field,
    filter: before.filter,
    layers: before.layers,
    t: before.t,
    mode: before.mode,
  };

  useStore.getState().searchNavigate(communeResult("hoan kiem"));

  const after = useStore.getState();
  assert.equal(after.field, snapshot.field);
  assert.equal(after.filter, snapshot.filter, "filter phải là CÙNG MỘT reference");
  assert.equal(after.layers, snapshot.layers);
  assert.equal(after.t, snapshot.t);
  assert.equal(after.mode, snapshot.mode);
});

test("§7.5-29 chọn một đối tượng ngoài tập lọc GIỮ NGUYÊN filter", () => {
  const zero = PRESETS.find((p) => p.id === "demand-zero-population")!;
  const resolved = resolvePreset(zero, STATS)!;
  reset();
  useStore.getState().applyPreset(zero, resolved);
  const filterBefore = useStore.getState().filter;

  // Xã này chắc chắn không nằm trong tập `population = 0` của Ô — và filter vẫn phải sống.
  useStore.getState().searchNavigate(communeResult("hoan kiem"));
  assert.equal(useStore.getState().filter, filterBefore);
  assert.ok(useStore.getState().filter.active, "filter bị xoá vì một thao tác điều hướng");
  // Câu "Ngoài tập lọc hiện tại" là việc của Inspector (Phase 3), tìm kiếm không thêm luật thứ hai.
  assert.match(read("src/components/atlas/EvidenceCard.tsx"), /Ngoài tập lọc hiện tại/);
});

test("§1.8 selection đặt đúng, `contextSelection` bị dọn", () => {
  reset({ contextSelection: "road:123" });
  const r = communeResult("ba dinh");
  useStore.getState().searchNavigate(r);
  assert.deepEqual(useStore.getState().selection, parseEntitySelection(r.id));
  assert.equal(useStore.getState().contextSelection, null);
});

// ── §7.6-36 · §7.6-37 Áp preset ─────────────────────────────────────────────

test("§7.6-36 `applyPreset` là MỘT lần đặt: áp preset Cầu từ lens Cung vẫn giữ filter", () => {
  const demand = PRESETS.find((p) => p.id === "demand-top-decile")!;
  const resolved = resolvePreset(demand, STATS)!;

  // Bắt đầu ở lens CUNG, trên trường của trạm — tức trạng thái mà `setFilter` rồi `setField`
  // sẽ tự xoá đúng cái filter vừa nhận.
  reset();
  useStore.getState().setField("station:ports");
  assert.equal(useStore.getState().field, "station:ports");

  useStore.getState().applyPreset(demand, resolved);
  assert.equal(useStore.getState().field, demand.field);
  assert.ok(filterEquals(useStore.getState().filter.active, resolved), "filter bị xoá ngay khi đặt");
  assert.equal(useStore.getState().filter.clearedReason, null);

  // MỘT lần đặt, đo được: đếm số lần store phát tín hiệu trong một lượt áp.
  //
  // Đây là dạng KIỂM ĐƯỢC của "trạng thái trung gian là không biểu diễn nổi". Hai lời gọi
  // `setField` + `setFilter` cho ra một frame mà filter đã đổi còn trường thì chưa — tức
  // một frame áp vị từ của Ô lên một trường đọc trên Trạm. Một `set()` thì frame ấy không
  // tồn tại để mà sai.
  //
  // Ghi chú cho người đọc spec: §2.6 nói trình tự `setFilter` rồi `setField` sẽ khiến
  // `setField` XOÁ đúng filter vừa nhận. Đo lại trên mã thật thì KHÔNG: `isFilterCompatible`
  // xét filter với trường MỚI, mà trường mới của preset luôn tương thích với filter của
  // chính nó (§7.6-30). Nên lý do giữ tính nguyên tử là frame trung gian ở trên, không phải
  // một lần xoá. Đây là chỗ spec nói quá, và ghi lại còn hơn để nó nằm im.
  reset();
  useStore.getState().setField("station:ports");
  let emissions = 0;
  const unsub = useStore.subscribe(() => { emissions += 1; });
  useStore.getState().applyPreset(demand, resolved);
  unsub();
  assert.equal(emissions, 1, "áp preset phát nhiều hơn một lần đặt");
});

test("§7.6-36b `applyPreset` KHÔNG đụng camera, selection, overlay hay `t`", () => {
  const supply = PRESETS.find((p) => p.id === "supply-ge-61kw")!;
  const resolved = resolvePreset(supply, STATS)!;
  reset({ view: { lng: 105.9, lat: 21.1, zoom: 14.2, pitch: 50, bearing: 30 } });
  useStore.setState({ t: 42, layers: new Set(["stations"]) });
  useStore.getState().searchNavigate(communeResult("ba dinh"));

  const before = useStore.getState();
  const snapshot = { view: before.view, selection: before.selection, layers: before.layers, t: before.t, mode: before.mode };

  useStore.getState().applyPreset(supply, resolved);

  const after = useStore.getState();
  assert.equal(after.view, snapshot.view, "preset dịch camera");
  assert.equal(after.selection, snapshot.selection, "preset đổi đối tượng đang chọn");
  assert.equal(after.layers, snapshot.layers);
  assert.equal(after.t, snapshot.t);
  assert.equal(after.mode, snapshot.mode);
});

test("§7.6-37 `applyPreset` luỹ đẳng — áp lại KHÔNG tăng `filter.revision`", () => {
  const supply = PRESETS.find((p) => p.id === "supply-le-22kw")!;
  const resolved = resolvePreset(supply, STATS)!;
  reset();
  useStore.getState().applyPreset(supply, resolved);
  const first = useStore.getState().filter;

  useStore.getState().applyPreset(supply, resolved);
  const second = useStore.getState().filter;
  assert.equal(second, first, "FilterState phải là CÙNG MỘT reference");
  assert.equal(second.revision, first.revision);

  // Một filter khác thì revision PHẢI tiến — nếu không, phép kiểm trên là vô nghĩa.
  const other = PRESETS.find((p) => p.id === "supply-power-unknown")!;
  useStore.getState().applyPreset(other, resolvePreset(other, STATS)!);
  assert.equal(useStore.getState().filter.revision, first.revision + 1);
});

test("§2.6 bấm lại preset đang bật = `clearFilter`, và GIỮ NGUYÊN trường", () => {
  const demand = PRESETS.find((p) => p.id === "demand-top-decile")!;
  reset();
  useStore.getState().setField("station:ports");
  useStore.getState().applyPreset(demand, resolvePreset(demand, STATS)!);
  useStore.getState().clearFilter("user");
  assert.equal(useStore.getState().filter.active, null);
  assert.equal(useStore.getState().field, demand.field, "xoá filter đã kéo trường về — bản đồ sẽ dịch");
});

// ── §7.7 Kế hoạch truy vấn ──────────────────────────────────────────────────

test("§7.7-43 tìm kiếm không phát câu lệnh DuckDB nào", () => {
  for (const f of ["src/ui/search.ts", "src/ui/SearchBar.tsx", "src/ui/QuickPresets.tsx", "src/state/presets.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /data\/duckdb|from "\.\.\/data\/queries"(?!;?\s*$)/m, `${f} chạm tầng dữ liệu`);
    assert.doesNotMatch(src, /\bfetchStations\b|\bfetchField\b|\bfetchCommunes\b|read_parquet/, `${f} tự nạp dữ liệu`);
    assert.doesNotMatch(src, /\bSELECT\b/, `${f} chứa SQL`);
  }
});

test("§7.7-45 `buildSearchIndex` chạy nhiều nhất MỘT lần cho mỗi corpus", () => {
  // Cổng G3 ở tầng mã: index memo hoá trên identity của ba mảng corpus, không trên truy vấn.
  const src = read("src/ui/SearchBar.tsx");
  // Index nằm trong một closure `??=` được memo hoá trên ĐÚNG ba mảng corpus. Không truy vấn
  // nào trong deps ⇒ gõ phím không dựng lại; `??=` ⇒ mỗi corpus dựng đúng một lần.
  const call = src.indexOf("const indexOf = useMemo(");
  assert.ok(call > 0, "index không còn dựng trong một useMemo");
  const memo = src.slice(call, src.indexOf("const normalized"));
  assert.match(memo, /built \?\?= buildSearchIndex\(\{ communes, stations, cells \}\)/);
  const deps = memo.slice(memo.lastIndexOf("["), memo.lastIndexOf("]") + 1);
  assert.equal(deps, "[communes, stations, cells]", `deps của index là ${deps} — có truy vấn lọt vào`);
  // Và truy vấn ngắn KHÔNG chạm tới index — boot không trả phí dựng index.
  assert.match(src, /< MIN_QUERY_LENGTH\s*\?\s*EMPTY_SEARCH_OUTCOME/);
  assert.equal((src.match(/buildSearchIndex/g) ?? []).length, 2, "chỉ một chỗ dựng index");
});

test("§4 preset KHÔNG phát truy vấn: `PresetStats` chỉ đọc dữ liệu đã cư trú", () => {
  const src = read("src/state/presets.ts");
  assert.doesNotMatch(src, /await|Promise|fetch\(/, "presets.ts có mặt bất đồng bộ");
  // Và nó nhận dữ liệu qua tham số, không tự đi lấy.
  assert.match(src, /export function presetStatsFrom\(input: \{/);
});

// ── §7.4 Trạng thái popup, ở mức kiểm được ngoài trình duyệt ────────────────

test("§7.4-18/19/20 bốn trạng thái của popup có mặt trong `SearchBar.tsx`", () => {
  const src = read("src/ui/SearchBar.tsx");
  assert.match(src, /type PopupState = "hidden" \| "hint" \| "loading" \| "empty" \| "results"/);
  assert.match(src, /Gõ thêm một ký tự/, "thiếu trạng thái Gợi ý");
  assert.match(src, /Đang nạp dữ liệu/, "thiếu trạng thái Đang nạp");
  assert.match(src, /Chưa nạp lớp Ô H3/, "thiếu lời khai lớp Ô vắng mặt");
  assert.match(src, /Không tìm thấy xã, phường hay trạm sạc nào/, "thiếu trạng thái Rỗng");
  assert.match(src, /Còn \$\{outcome\.truncated/, "thiếu dòng khai phần bị cắt");
  // Trạng thái Đang nạp phải đứng TRƯỚC trạng thái Rỗng, nếu không lúc boot vẫn báo
  // "không tìm thấy" cho một corpus chưa đọc tới.
  assert.ok(src.indexOf('"loading"\n') < src.indexOf('"empty"\n') || src.includes('? "loading"'));
});

test("§7.4-21 `activeIndex` được KẸP chứ không đặt lại về 0", () => {
  const src = read("src/ui/SearchBar.tsx");
  assert.match(src, /setActiveIndex\(\(prev\) =>[\s\S]{0,120}Math\.min\(prev, results\.length - 1\)/);
});

test("§7.4-22 `Esc` hai bước; §7.4-23 `scrollIntoView`; §1.7 `Tab` không bẫy tiêu điểm", () => {
  const src = read("src/ui/SearchBar.tsx");
  assert.match(src, /scrollIntoView\(\{ block: "nearest" \}\)/, "thiếu cuộn tuỳ chọn đang chọn");
  assert.match(src, /if \(e\.key === "Tab"\)[\s\S]{0,200}setIsOpen\(false\);[\s\S]{0,40}return;/);
  // `Esc` khi còn chữ: xoá chữ và GIỮ tiêu điểm. Khi rỗng: đóng và nhả tiêu điểm.
  assert.match(src, /if \(query\) \{[\s\S]{0,400}inputRef\.current\?\.focus\(\);[\s\S]{0,80}\} else \{[\s\S]{0,120}inputRef\.current\?\.blur\(\);/);
  // `Home` / `End` / `PageDown` / `PageUp` đều có mặt.
  for (const key of ["Home", "End", "PageDown", "PageUp"]) {
    assert.ok(src.includes(`e.key === "${key}"`), `thiếu phím ${key}`);
  }
});

test("§7.4-24 vùng live đọc TRẠNG THÁI chứ không chỉ đọc số đếm", () => {
  const src = read("src/ui/SearchBar.tsx");
  const live = src.slice(src.indexOf("const liveMessage"), src.indexOf("const activeOptionId"));
  for (const phrase of ["Đang nạp", "Chưa nạp lớp Ô H3", "Không tìm thấy", "kết quả", "Gõ thêm"]) {
    assert.ok(live.includes(phrase), `vùng live không nói được "${phrase}"`);
  }
});

test("§1.7 `⌘K` chạy cả khi tiêu điểm đang ở trong một ô nhập", () => {
  const src = read("src/ui/SearchBar.tsx");
  const handler = src.slice(src.indexOf("const onKeyDown"), src.indexOf("window.addEventListener"));
  // Nhánh ⌘K phải đứng TRƯỚC phép loại trừ ô nhập, nếu không nó chết trong chính ô tìm kiếm.
  assert.ok(
    handler.indexOf("metaKey || e.ctrlKey") < handler.indexOf('target.tagName === "INPUT"'),
    "⌘K nằm sau phép loại trừ INPUT nên không bao giờ chạy trong ô nhập",
  );
});
