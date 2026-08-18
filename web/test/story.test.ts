/**
 * Test cho chế độ CÂU CHUYỆN — DESIGN.md §14 và §9a.
 *
 * Hai thứ ở đây là **quy tắc**, không phải phân bố, nên §12 nói chúng phải assert được chứ
 * không chụp ảnh được:
 *
 *   · **Phép tính Lorenz.** Một ảnh chụp chứng minh đường cong của Hà Nội hôm nay trông thế
 *     nào. Nó không chứng minh được rằng phép tính đúng — mà phép tính này sai được theo ba
 *     cách im lặng: sắp xếp nhầm khoá, cộng dồn trước khi chuẩn hoá, và tra ngược nhầm đầu.
 *     Cả ba đều cho ra một đường cong *trông vẫn hợp lý*.
 *   · **"Cảnh nào chốt state gì".** Một cảnh quên đặt `field` sẽ thừa hưởng trường của cảnh
 *     trước và vẫn trông bình thường — cho tới khi ai đó mở thẳng cảnh đó bằng link.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { areaShareForPop, lorenz, popShareForArea, thin } from "../src/story/lorenz.ts";
import { SCENES, SCENE_BY_ID, SCENE_IDS, beatOf, parseScene, sceneState } from "../src/story/scenes.ts";
import { FIELD_BY_ID } from "../src/fields.ts";
import { OVERLAY_IDS } from "../src/state/types.ts";
import { parseSelection } from "../src/data/h3.ts";
import { parseHash, serializeHash } from "../src/state/hash.ts";
import { MAJOR_BRIDGE_MIN_M, majorBridges, pathLengthM } from "../src/story/bridges.ts";
import { renderPlan } from "../src/viz/render-plan.ts";
import type { HashState } from "../src/state/types.ts";

// ══ Đường Lorenz — phép tính, §13d-A ══════════════════════════════════════════

test("phân bố ĐỀU cho đúng đường chéo và Gini 0", () => {
  const even = Array.from({ length: 100 }, () => ({ area: 1, pop: 10 }));
  const l = lorenz(even);
  assert.ok(Math.abs(l.gini) < 1e-12, `gini = ${l.gini}`);
  for (const pt of l.curve) assert.ok(Math.abs(pt.a - pt.p) < 1e-12, `lệch khỏi đường chéo tại ${pt.a}`);
  // "x% diện tích chứa x% dân" — chính là điều luận điểm A phủ định.
  assert.ok(Math.abs(areaShareForPop(l, 0.5)! - 0.5) < 1e-9);
});

test("dồn hết vào một ô cho Gini tiến tới 1", () => {
  const cells = [{ area: 1, pop: 1000 }, ...Array.from({ length: 999 }, () => ({ area: 1, pop: 0 }))];
  const l = lorenz(cells);
  assert.ok(l.gini > 0.99, `gini = ${l.gini}`);
  // 0,1% diện tích đã chứa 100% dân.
  assert.ok(Math.abs(areaShareForPop(l, 1)! - 0.001) < 1e-9);
});

test("sắp xếp theo MẬT ĐỘ, không theo dân số — ô to nhiều dân không được đứng trước ô nhỏ dày dân", () => {
  // Ô A: 10 đơn vị diện tích, 100 người ⇒ mật độ 10. Ô B: 1 diện tích, 50 người ⇒ mật độ 50.
  // Sắp theo DÂN SỐ thì A đứng trước và "diện tích nhỏ nhất chứa 50% dân" ra 10/11 = 91%.
  // Sắp theo MẬT ĐỘ thì B đứng trước, và câu trả lời đúng là 1/11 = 9,1%.
  const l = lorenz([
    { area: 10, pop: 100 },
    { area: 1, pop: 50 },
  ]);
  const a = areaShareForPop(l, 50 / 150)!;
  assert.ok(Math.abs(a - 1 / 11) < 1e-9, `ra ${a}, nghĩa là đã sắp nhầm khoá`);
});

test("tra ngược trả về điểm ĐẦU TIÊN đạt ngưỡng, không phải điểm cuối còn dưới ngưỡng", () => {
  // Lấy nhầm đầu là báo một tỉ lệ diện tích NHỎ HƠN sự thật — tức phóng đại chính luận điểm
  // đang muốn chứng minh. Đó là loại sai số tệ nhất ở đây, nên nó có test riêng.
  const l = lorenz([
    { area: 1, pop: 60 },
    { area: 1, pop: 40 },
  ]);
  // Sau ô đầu: 50% diện tích, 60% dân. Ngưỡng 50% dân đạt được ngay tại đó.
  assert.equal(areaShareForPop(l, 0.5), 0.5);
  // Ngưỡng 60% cũng đạt tại đúng điểm đó (>=, không phải >).
  assert.equal(areaShareForPop(l, 0.6), 0.5);
  // Ngưỡng 61% phải nhảy sang điểm sau.
  assert.equal(areaShareForPop(l, 0.61), 1);
});

test("đường cong bắt đầu ở (0,0), kết thúc ở (1,1), và đơn điệu không giảm", () => {
  const l = lorenz(
    Array.from({ length: 200 }, (_, i) => ({ area: 1 + (i % 3), pop: (i * 37) % 91 })),
  );
  assert.deepEqual(l.curve[0], { a: 0, p: 0 });
  const last = l.curve[l.curve.length - 1]!;
  assert.ok(Math.abs(last.a - 1) < 1e-12 && Math.abs(last.p - 1) < 1e-12);
  for (let i = 1; i < l.curve.length; i++) {
    assert.ok(l.curve[i]!.a >= l.curve[i - 1]!.a, "trục diện tích giảm");
    assert.ok(l.curve[i]!.p >= l.curve[i - 1]!.p, "trục dân giảm");
  }
  // Lorenz theo mật độ GIẢM dần luôn nằm TRÊN đường chéo — nếu dưới thì đã sắp ngược.
  for (const pt of l.curve) assert.ok(pt.p >= pt.a - 1e-12, `điểm dưới đường chéo tại a=${pt.a}`);
});

test("ô diện tích 0 bị bỏ — nếu không, đường cong có đoạn thẳng đứng do phép tính sinh ra", () => {
  const withZeros = lorenz([
    { area: 0, pop: 500 },
    { area: 1, pop: 10 },
    { area: 1, pop: 10 },
  ]);
  assert.equal(withZeros.nCells, 2);
  // Không có hai điểm liên tiếp nào cùng hoành độ.
  for (let i = 1; i < withZeros.curve.length; i++) {
    assert.notEqual(withZeros.curve[i]!.a, withZeros.curve[i - 1]!.a);
  }
});

test("dữ liệu rỗng hoặc không có ai thì trả về đường cong suy biến, không ném lỗi", () => {
  for (const input of [[], [{ area: 1, pop: 0 }], [{ area: 0, pop: 0 }]]) {
    const l = lorenz(input);
    assert.equal(l.nCells, 0);
    assert.equal(areaShareForPop(l, 0.5), null);
    assert.equal(popShareForArea(l, 0.5), null);
  }
});

test("thin() giữ hai đầu và không đổi hình dạng", () => {
  const l = lorenz(Array.from({ length: 4400 }, (_, i) => ({ area: 1, pop: i })));
  const t = thin(l.curve, 400);
  assert.ok(t.length <= 400);
  assert.deepEqual(t[0], l.curve[0]);
  assert.deepEqual(t[t.length - 1], l.curve[l.curve.length - 1]);
  for (let i = 1; i < t.length; i++) assert.ok(t[i]!.a >= t[i - 1]!.a);
});

// ══ "Cảnh nào chốt state gì" — §14a luật L1/L3 ════════════════════════════════

test("mỗi cảnh chốt ĐẦY ĐỦ state, không cảnh nào thừa hưởng của cảnh trước", () => {
  // Khoá tuỳ chọn ở đây nghĩa là "thừa hưởng", tức thứ mentor thấy phụ thuộc việc họ tới
  // từ đâu — mà một link tới giữa câu chuyện thì không tới từ đâu cả.
  for (const id of SCENE_IDS) {
    const s = sceneState(id);
    assert.equal(typeof s.field, "string", `${id}: thiếu field`);
    assert.ok(Number.isFinite(s.view.zoom) && Number.isFinite(s.view.lng), `${id}: khung nhìn hỏng`);
    assert.ok(Array.isArray(s.layers), `${id}: thiếu layers`);
    // `select` phải có mặt tường minh — `undefined` là "giữ nguyên", và ta không cho phép.
    assert.ok(s.select === null || typeof s.select === "string", `${id}: select không tường minh`);
  }
});

test("ràng buộc 2: mỗi cảnh chốt ĐÚNG MỘT trường, và trường đó có thật", () => {
  for (const id of SCENE_IDS) {
    const { field } = sceneState(id);
    // Một CHUỖI, không phải mảng — không có đường nào để một cảnh đặt hai trường.
    assert.equal(typeof field, "string", `${id}`);
    assert.ok(FIELD_BY_ID.has(field), `${id}: trường "${field}" không có trong fields.ts`);
  }
});

test("overlay và đối tượng chọn sẵn của cảnh đều hợp lệ", () => {
  for (const id of SCENE_IDS) {
    const s = sceneState(id);
    for (const l of s.layers) {
      assert.ok((OVERLAY_IDS as readonly string[]).includes(l), `${id}: overlay lạ "${l}"`);
    }
    if (s.select !== null) {
      assert.ok(parseSelection(s.select), `${id}: khoá c sai hình dạng "${s.select}"`);
    }
  }
});

test("sceneState trả về BẢN SAO — một lần set bất cẩn không được sửa vào định nghĩa cảnh", () => {
  const a = sceneState("cung-lech");
  a.layers.push("beyond2km");
  a.view.zoom = 99;
  const b = sceneState("cung-lech");
  assert.deepEqual(b.layers, ["stations"]);
  assert.notEqual(b.view.zoom, 99);
});

test("chỉ nhịp kết của cảnh C có bộ lọc, và bộ lọc đó nói đúng điều nó lọc", () => {
  for (const s of SCENES) {
    for (const b of s.beats) {
      const expectFilter = s.id === "di-vong" && b.id === "hau-qua";
      if (!expectFilter) {
        assert.equal(b.filter, undefined, `${s.id}/${b.id} không được có bộ lọc`);
        continue;
      }
      assert.ok(b.filter, "nhịp kết của cảnh C phải có bộ lọc");
      // §13b-2 ràng buộc 2: bộ lọc phải mang câu chữ, để nhịp in ra được nó lọc cái gì.
      assert.ok(b.filter!.label.length > 0);
      assert.equal(b.filter!.keep(3), true);
      assert.equal(b.filter!.keep(2), false, "ngưỡng là > 2, không phải >= 2");
      // Ô không có giá trị KHÔNG thuộc tập lọc: "không biết" không được đếm thành "thoả".
      assert.equal(b.filter!.keep(null), false);
      assert.equal(b.filter!.keep(undefined), false);
      assert.equal(b.filter!.keep("2.5"), false, "chuỗi không được lọt qua");
    }
  }
});

// ══ Nhịp — M3.1 ══════════════════════════════════════════════════════════════

test("mọi cảnh có ít nhất một nhịp, id nhịp duy nhất trong cảnh, trường nhịp có thật", () => {
  for (const s of SCENES) {
    assert.ok(s.beats.length >= 1, `${s.id}: không có nhịp nào`);
    assert.equal(new Set(s.beats.map((b) => b.id)).size, s.beats.length, `${s.id}: id nhịp trùng`);
    for (const b of s.beats) {
      assert.ok(FIELD_BY_ID.has(b.field), `${s.id}/${b.id}: trường "${b.field}" không có thật`);
      assert.ok(b.label.length > 0, `${s.id}/${b.id}: thiếu nhãn nút`);
      assert.ok(Array.isArray(b.marks), `${s.id}/${b.id}: thiếu marks`);
    }
  }
});

test("cảnh C có ĐÚNG hai nhịp, và mark chủ lực là mạng đường chứ không phải hex", () => {
  const c = SCENE_BY_ID.get("di-vong")!;
  assert.deepEqual(c.beats.map((b) => b.id), ["mang-duong", "hau-qua"]);
  // Quyết định 2026-08-07 (§11): road là mark CHỦ LỰC, hex-lọc là CON SỐ. Đảo thứ tự hai
  // nhịp này là đảo ngược chính quyết định đó, nên nó phải gãy ở đây.
  assert.equal(c.beats[0]!.field, "road:dist_station_m");
  assert.equal(c.beats[1]!.field, "detour_ratio");
  assert.deepEqual(c.beats[0]!.marks, ["bridges", "routes"]);
});

test("beatOf: id lạ hoặc vắng thì rơi về nhịp ĐẦU, không ném lỗi", () => {
  assert.equal(beatOf("di-vong", "hau-qua").id, "hau-qua");
  for (const bad of [null, undefined, "", "khong-co-that"]) {
    assert.equal(beatOf("di-vong", bad).id, "mang-duong", String(bad));
  }
});

test("sceneState lấy trường của nhịp ĐẦU — vào cảnh là vào từ đầu cảnh", () => {
  assert.equal(sceneState("di-vong").field, "road:dist_station_m");
});

test("mark chỉ xuất hiện ở nhịp có trường ĐƯỜNG — nếu không, App không nạp roads.parquet", () => {
  // App nạp mạng đường theo điều kiện `readAs === "road"`. Một nhịp đòi mark `bridges`
  // hay `routes` mà trường của nó không phải trường đường sẽ vẽ vào một mảng rỗng — im
  // lặng, và trông y hệt "không có cầu nào".
  for (const s of SCENES) {
    for (const b of s.beats) {
      if (b.marks.length === 0) continue;
      assert.equal(
        FIELD_BY_ID.get(b.field)!.readAs,
        "road",
        `${s.id}/${b.id}: có mark nhưng trường không phải đơn vị đường`,
      );
    }
  }
});

test("chỉ cảnh C gắn lớp riêng lên basemap — §2a cấm sửa nền vì một cảnh", () => {
  for (const s of SCENES) {
    assert.equal(s.basemapLayer, s.id === "di-vong" ? "river" : undefined, s.id);
  }
});

test("mỗi cảnh có đúng MỘT câu luận điểm và một tiêu đề", () => {
  for (const s of SCENES) {
    assert.ok(s.title.length > 0 && s.kicker.length > 0, s.id);
    assert.ok(s.claim.length > 0, `${s.id}: thiếu câu §3a`);
  }
});

test("id cảnh là duy nhất và khớp danh sách slug của hash", () => {
  assert.deepEqual(SCENES.map((s) => s.id), [...SCENE_IDS]);
  assert.equal(new Set(SCENE_IDS).size, SCENE_IDS.length);
});

// ══ Cầu lớn — ngưỡng chiều dài, M3.1 ═════════════════════════════════════════

test("pathLengthM cộng đúng từng chặng, không phải khoảng cách hai đầu", () => {
  // Một chữ L: 1 độ kinh rồi 1 độ vĩ. Cộng chặng ra tổng hai cạnh; đo hai đầu ra cạnh huyền.
  const L = pathLengthM([105, 21, 106, 21, 106, 22]);
  assert.ok(Math.abs(L - (103_940 + 110_574)) < 1, `ra ${L}`);
  assert.equal(pathLengthM([105, 21]), 0, "một điểm thì dài 0");
  assert.equal(pathLengthM([]), 0);
});

test("majorBridges chỉ giữ đoạn CÓ CỜ CẦU và dài hơn ngưỡng", () => {
  const short = { path: [105, 21, 105.001, 21], bridge: true }; // ~104 m
  const long = { path: [105, 21, 105.02, 21], bridge: true }; // ~2.079 m
  const longRoad = { path: [105, 21, 105.02, 21], bridge: false };
  const got = majorBridges([short, long, longRoad]);
  assert.deepEqual(got, [long]);
  // Cống 16 m — trung vị thật của dữ liệu — không bao giờ lọt qua.
  assert.equal(majorBridges([{ path: [105, 21, 105.00015, 21], bridge: true }]).length, 0);
});

test("ngưỡng cầu lớn là một GIẢ ĐỊNH KHAI BÁO, đổi được và kết quả đi theo", () => {
  const seg = { path: [105, 21, 105.005, 21], bridge: true }; // ~520 m
  assert.equal(majorBridges([seg]).length, 0, `ngưỡng mặc định ${MAJOR_BRIDGE_MIN_M} m`);
  assert.equal(majorBridges([seg], 300).length, 1);
});

// ══ Hex ĐÃ LỌC không chịu ngưỡng zoom — §13b-2 ═══════════════════════════════

test("tập ô đã lọc vẽ được ở MỌI zoom, kể cả dưới HEX_MIN_ZOOM", () => {
  for (const zoom of [0, 5, 9.3, 10.99, 11, 14]) {
    assert.equal(renderPlan({ unit: "cell", zoom, hasSurface: false, filtered: true }).paint, "hex");
    // Cờ lọc thắng cả mặt liên tục: cảnh đã nói rõ nó muốn thấy TẬP NÀO, không phải mặt độ.
    assert.equal(renderPlan({ unit: "cell", zoom, hasSurface: true, filtered: true }).paint, "hex");
  }
});

test("cờ lọc KHÔNG lấn được đơn vị đọc — trường của xã vẫn tô đa giác xã", () => {
  // Bộ lọc thu hẹp tập ô; nó không đổi hình học nào đang mang trường (§13b-2).
  for (const zoom of [9.3, 14]) {
    assert.equal(renderPlan({ unit: "commune", zoom, hasSurface: false, filtered: true }).paint, "commune");
  }
});

test("không lọc thì ngưỡng zoom cũ còn nguyên — §13b-2 không được thành cửa sau cho thảm hex", () => {
  // Kiểm TRONG CẢNH, vì từ M5.1 ngưỡng zoom chỉ còn hiệu lực ở đó (xem `render-plan.ts`):
  // trên BẢN ĐỒ mọi trường của ô đều vẽ hex. Cái test này canh vẫn là điều nó luôn canh —
  // `filtered` không được là cửa sau — chỉ khác chỗ ngưỡng còn sống.
  assert.equal(renderPlan({ unit: "cell", zoom: 9.3, hasSurface: false, inStory: true }).paint, "none");
  assert.equal(
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: false, filtered: false, inStory: true }).paint,
    "none",
  );
  assert.equal(
    renderPlan({ unit: "cell", zoom: 9.3, hasSurface: true, inStory: true }).paint,
    "surface",
  );
});

// ══ Khoá `s` — §9a ═══════════════════════════════════════════════════════════

const VIEW = { lng: 105.84, lat: 21, zoom: 9.3, pitch: 0, bearing: 0 };
const MAP_STATE: HashState = {
  nationalMode: false,
  field: "population",
  mode: "2d",
  view: VIEW,
  layers: ["stations"],
  cell: null,
  scene: null,
  paintOn: true,
  dataMode: false,
  t: 0,
  brush: {},
};

test("`s` có mặt và hợp lệ ⇒ chế độ CÂU CHUYỆN; vắng hoặc hỏng ⇒ BẢN ĐỒ", () => {
  assert.equal(parseHash("#s=di-vong").scene, "di-vong");
  assert.equal(parseHash("#f=population").scene, undefined);
  // Slug lạ bị bỏ như mọi khoá hỏng — và bỏ nó CHÍNH LÀ về BẢN ĐỒ, không cần nhánh lỗi riêng.
  assert.equal(parseHash("#s=khong-co-that").scene, undefined);
  assert.equal(parseHash("#s=").scene, undefined);
  assert.equal(parseHash("#s=A").scene, undefined, "chữ cái không phải slug");
});

test("parseScene chỉ nhận đúng bốn slug", () => {
  for (const id of SCENE_IDS) assert.equal(parseScene(id), id);
  for (const bad of ["", "a", "von cuc", "VON-CUC", null, undefined]) {
    assert.equal(parseScene(bad), null, String(bad));
  }
});

test("khi có `s`, ba khoá do cảnh quyết định KHÔNG được đọc — hash không có hai nguồn sự thật", () => {
  const h = parseHash("#s=di-vong&f=population&v=1,2,3,0,0&l=stations,communes&c=88415cb637fffff&m=2d");
  assert.equal(h.scene, "di-vong");
  assert.equal(h.field, undefined, "`f` phải bị bỏ khi có `s`");
  assert.equal(h.view, undefined, "`v` phải bị bỏ khi có `s`");
  assert.equal(h.layers, undefined, "`l` phải bị bỏ khi có `s`");
  // `c` VẪN đọc: nó là lựa chọn của người xem BÊN TRONG cảnh, không phải thứ cảnh áp đặt.
  assert.equal(h.cell, "88415cb637fffff");
  assert.equal(h.mode, "2d");
});

test("khi có `s`, ba khoá đó cũng KHÔNG được ghi — link tới cảnh ngắn và đọc được", () => {
  const s = serializeHash({ ...MAP_STATE, scene: "di-vong" });
  assert.match(s, /s=di-vong/);
  assert.doesNotMatch(s, /(^|&)f=/);
  assert.doesNotMatch(s, /(^|&)v=/);
  assert.doesNotMatch(s, /(^|&)l=/);
  assert.match(s, /m=2d/);
});

test("`c` vẫn được ghi trong chế độ CÂU CHUYỆN — cảnh B gọi tên từng xã", () => {
  const s = serializeHash({ ...MAP_STATE, scene: "cung-lech", cell: "commune:00004" });
  assert.match(s, /c=commune:00004/);
});

test("scene hỏng trong state không được ghi ra hash", () => {
  const s = serializeHash({ ...MAP_STATE, scene: "khong-co-that" });
  assert.doesNotMatch(s, /(^|&)s=/);
  // Và vì không còn ở chế độ cảnh nữa, ba khoá kia phải quay lại.
  assert.match(s, /f=population/);
  assert.match(s, /v=/);
});

test("vòng ghi ↔ đọc hội tụ ở cả hai chế độ", () => {
  for (const state of [MAP_STATE, { ...MAP_STATE, scene: "chua-biet", cell: "commune:00634" }]) {
    const round = parseHash(`#${serializeHash(state as HashState)}`);
    assert.equal(round.scene ?? null, state.scene);
    assert.equal(round.cell ?? null, state.cell);
  }
});

test("khoá `t`/`b` KHÔNG đọc và KHÔNG ghi trong CÂU CHUYỆN — M4 (§9b)", () => {
  // Test cũ khẳng định hai khoá này được **chép nguyên văn** trong cảnh, kể cả nội dung
  // rác. Tiền đề của nó là "M4 chưa dựng nên bản hiện tại không có ý kiến gì về chúng".
  // M4 dựng dock và scrubber, và §3d-1 chốt: chúng KHÔNG dựng trong chế độ CÂU CHUYỆN —
  // một cảnh chốt trường + khung nhìn + tập ô của nó (L3), nên một bộ lọc bấm được bên
  // cạnh là nguồn sự thật thứ hai. Ghi trạng thái của một bộ điều khiển không tồn tại là
  // đúng lỗi mà §9a đã cấm với `f`/`v`/`l`, nên `t`/`b` đi theo cùng luật.
  const s = serializeHash(
    { ...MAP_STATE, scene: "von-cuc", t: 48, brush: { hist: { field: "population", range: { lo: 1, hi: 2 } } } },
    "#t=48&b=h:population:1..2",
  );
  assert.doesNotMatch(s, /[?&]t=/);
  assert.doesNotMatch(s, /[?&]b=/);
  // Link tới một cảnh vẫn ngắn và đọc được — đó là cả điểm của §9a.
  assert.equal(s, "s=von-cuc&m=2d");
});
