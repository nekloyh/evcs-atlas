/**
 * Hồi quy CÂU CHUYỆN sau CR 2.1 / 4.1 / 4.2 — hai finding của đợt re-QA.
 *
 * **RF-1 — ghim của cảnh không được là một phép GHI.** Cảnh ghim thang bậc vì mọi claim của
 * nó đã thẩm định trên lớp bậc (CR 2.1 §6). Bản trước áp ghim ấy bằng cách ghi vào
 * `store.scaleMode` — cùng ô nhớ đang giữ *sở thích của người xem* — và không có đường lùi:
 * Cầu(gradient) → CÂU CHUYỆN → BẢN ĐỒ trả về thang bậc mà không ai bấm gì. Ở đây ghim là
 * một phép ĐỌC, và test đọc đúng cả hai câu hỏi để chúng không gộp lại lần nữa.
 *
 * **RF-2 — một khe hình có trục mà không có ô là một lời nói dối.** `Heatmap168` thoát sớm
 * khi `scale` vắng, nhưng vẫn render nhãn trục và 168 nút. Cảnh 5 vì thế khẳng định 3,29×
 * bằng một khung trống.
 *
 * RF-2 nay được đóng bằng KIẾN TRÚC chứ không bằng một cổng ở `FigureSlot`
 * (`UX_UTILIZATION_VISUALIZATION_SPEC` §23.4): hình của cảnh 5 là
 * `UtilizationDayProfiles`, thứ mã hoá giá trị bằng VỊ TRÍ. Nó không có thang màu để mà
 * thiếu, nên chế độ hỏng "có trục, không có ô" không còn biểu diễn được. Ba test dưới đây
 * đổi từ *"cảnh phải mượn đúng thang"* sang *"cảnh không được có thang nào để mượn"* — và
 * giữ nguyên luật gốc: điều kiện vẽ là CÓ DỮ LIỆU, không phải có thang.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

Object.defineProperty(globalThis, "window", {
  value: { location: { hash: "" } },
  configurable: true,
});

const { useStore, effectiveScaleModeOf } = await import("../src/state/store.ts");
const { SCENES, sceneState, scenePinDisclosure } = await import("../src/story/scenes.ts");
const { FIELD_BY_ID, scaleControlFor } = await import("../src/fields.ts");
const { gradientAvailability } = await import("../src/viz/palette.ts");
const { themeFor } = await import("../src/viz/theme.ts");
const { clipDisclosure } = await import("../src/viz/scale-readout.ts");

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const SCENE = SCENES[0]!.id;

// ══ RF-1 ═════════════════════════════════════════════════════════════════════

test("RF-1 mọi cảnh vẫn KHAI BÁO ghim bậc, và ghim đọc được mà không cần store", () => {
  for (const s of SCENES) assert.equal(s.scaleMode, "binned", `${s.id} phải ghim bậc`);
  assert.equal(effectiveScaleModeOf({ scene: SCENE, scaleMode: "gradient" }), "binned");
  assert.equal(effectiveScaleModeOf({ scene: SCENE, scaleMode: "binned" }), "binned");
  // Ngoài cảnh, câu trả lời CHÍNH LÀ sở thích — không có tầng dịch nào ở giữa.
  assert.equal(effectiveScaleModeOf({ scene: null, scaleMode: "gradient" }), "gradient");
  assert.equal(effectiveScaleModeOf({ scene: null, scaleMode: "binned" }), "binned");
  // Cảnh lạ rơi về ghim an toàn, không về sở thích.
  assert.equal(
    effectiveScaleModeOf({ scene: "khong-co-that" as never, scaleMode: "gradient" }),
    "binned",
  );
});

test("RF-1 `SceneState` KHÔNG mang `scaleMode` — hình dạng này là thứ bị set() vào store", () => {
  const st = sceneState(SCENE) as unknown as Record<string, unknown>;
  assert.equal("scaleMode" in st, false, "ghim không được đi vào state ghi đè");
  // …nhưng các khoá cảnh THẬT SỰ sở hữu thì vẫn phải còn (luật L1).
  for (const k of ["field", "view", "layers", "select", "t"]) {
    assert.ok(k in st, `SceneState phải còn khoá ${k}`);
  }
});

test("RF-1 vào rồi ra CÂU CHUYỆN trả lại đúng thang người xem đã chọn (nav rail)", () => {
  useStore.setState({ scene: null, dataMode: false, nationalMode: false });
  useStore.getState().setScaleMode("gradient");

  useStore.getState().setAppNavMode("story");
  const inStory = useStore.getState();
  assert.equal(inStory.scene, SCENE);
  assert.equal(inStory.scaleMode, "gradient", "sở thích SỐNG SÓT qua cảnh");
  assert.equal(effectiveScaleModeOf(inStory), "binned", "nhưng cảnh VẼ bậc");

  useStore.getState().setAppNavMode("map");
  const back = useStore.getState();
  assert.equal(back.scene, null);
  assert.equal(back.scaleMode, "gradient");
  assert.equal(effectiveScaleModeOf(back), "gradient", "ra khỏi cảnh là dải liên tục trở lại");
});

test("RF-1 cùng luật ấy qua `enterScene` và qua ba mode còn lại", () => {
  useStore.setState({ scene: null, dataMode: false, nationalMode: false });
  useStore.getState().setScaleMode("gradient");

  useStore.getState().enterScene(SCENE);
  assert.equal(useStore.getState().scaleMode, "gradient");
  useStore.getState().enterScene(null);
  assert.equal(useStore.getState().scaleMode, "gradient");

  for (const nav of ["data", "national", "map"] as const) {
    useStore.getState().setAppNavMode("story");
    useStore.getState().setAppNavMode(nav);
    assert.equal(useStore.getState().scaleMode, "gradient", `qua ${nav} vẫn giữ sở thích`);
  }
});

test("RF-1 hash: cảnh không đụng sở thích; bề mặt BẢN ĐỒ vẫn là nguồn sự thật", () => {
  useStore.setState({ scene: null, dataMode: false, nationalMode: false });
  useStore.getState().setScaleMode("gradient");

  // `#s=…` — `parseHash` không phát khoá, nên `applyHash` không có gì để ghi đè.
  useStore.getState().applyHash({ scene: SCENE });
  assert.equal(useStore.getState().scene, SCENE);
  assert.equal(useStore.getState().scaleMode, "gradient");

  // Một hash BẢN ĐỒ vắng `sc` VẪN đặt lại về bậc: ở đó khoá vắng nghĩa là "về mặc định của
  // khoá đó", cùng luật với `l` và `p`. Đây là chỗ duy nhất được phép hạ sở thích xuống.
  useStore.getState().applyHash({ field: "population" });
  assert.equal(useStore.getState().scaleMode, "binned");
});

test("RF-1 chỗ áp ghim là một phép ĐỌC, không phải một phép ghi", () => {
  const store = src("state/store.ts");
  assert.doesNotMatch(store, /scaleMode:\s*s\.scaleMode,/, "`fromScene` không được ghi ghim");
  assert.doesNotMatch(store, /scaleMode:\s*st\.scaleMode,/, "`applyHash` không được ghi ghim");
  assert.match(store, /export function effectiveScaleModeOf/);
  // App phải đọc chế độ ĐÃ ÁP GHIM, không phải sở thích thô.
  assert.match(src("App.tsx"), /useStore\(effectiveScaleModeOf\)/);
});

// ══ RF-2 ═════════════════════════════════════════════════════════════════════

test("RF-2 cảnh KHÔNG dựng và KHÔNG mượn thang màu nào nữa", () => {
  const app = src("App.tsx");
  assert.match(app, /<StoryColumn pkg=\{storyPkg\} \/>/,
    "cảnh không còn nhận thang: hình của nó không mã hoá giá trị bằng màu");
  const surface = src("story/StorySurface.tsx");
  assert.doesNotMatch(surface, /buildScale|applyScaleMode|scaleContractOf/,
    "story/ không được tự dựng thang");
  assert.doesNotMatch(surface, /occScale/, "và không còn một thang nào chảy qua nó");
});

test("RF-2 điều kiện vẽ của khe hình là CÓ DỮ LIỆU, không phải có thang", () => {
  const surface = src("story/StorySurface.tsx");
  assert.doesNotMatch(surface, /scale=\{null\}/, "không được truyền một thang rỗng");
  assert.match(surface, /model && model\.cells\.length > 0 \?/,
    "không có ô nào ⇒ khe trống hẳn, cùng luật với thiếu model");
});

test("RF-2 chế độ hỏng cũ nay BẤT KHẢ BIỂU DIỄN, không chỉ bị canh", () => {
  const chart = src("ui/UtilizationDayProfiles.tsx");
  // Không nhận thang ⇒ không có nhánh "thang vắng" ⇒ không thể ra một khung có trục mà
  // không có dữ liệu. Nếu ngày nào đó biểu đồ chính lại nhận `Scale`, test này gãy và
  // người sửa đọc được vì sao cổng ở `FigureSlot` từng phải tồn tại.
  assert.doesNotMatch(chart, /scale\s*[?:]\s*Scale/, "biểu đồ chính không được nhận thang màu");
  assert.match(chart, /if \(model\.cells\.length === 0\) return null;/,
    "không có ô nào ⇒ không render gì, kể cả trục");
});

// ══ CG-1(B) ══════════════════════════════════════════════════════════════════

test("CG-1(B) câu khai quy công đúng: cảnh ghim vs registry từ chối", () => {
  const spec = SCENES[0]!;

  // Trường DỰNG ĐƯỢC dải liên tục ⇒ ghim của cảnh là thứ đang chặn, và câu nói ra điều đó.
  const open = scenePinDisclosure(spec, { gradientDisabled: false, reason: null });
  assert.equal(open, "lớp bậc · cảnh ghim cách đọc để khớp số đã thẩm định");

  // Registry từ chối ⇒ câu đọc LÝ DO CỦA REGISTRY, không ghi công cho cảnh. Ghi công sai là
  // để một câu chữ mang hai nghĩa — đúng luật R3 mà cảnh 7 đang gác.
  const shut = scenePinDisclosure(spec, {
    gradientDisabled: true,
    reason: "Cung có quá nhiều giá trị 0.",
  });
  assert.equal(shut, "lớp bậc · Cung có quá nhiều giá trị 0.");
  assert.doesNotMatch(shut, /cảnh ghim/);
});

test("CG-1(B) mọi cảnh dựng được một câu khai, và câu ấy khớp cột đọc", () => {
  for (const spec of SCENES) {
    for (const beat of spec.beats) {
      const meta = FIELD_BY_ID.get(beat.field);
      assert.ok(meta, `${spec.id}/${beat.id}: trường ${beat.field} phải có trong registry`);
      const control = scaleControlFor(meta, gradientAvailability(themeFor(meta, "hex"), Boolean(meta.diverge)));
      const line = scenePinDisclosure(spec, control);
      assert.ok(line.length > 0, `${spec.id}/${beat.id}: phải có câu khai`);
      // Không câu nào được nói "dải liên tục" chừng nào mọi cảnh còn ghim bậc.
      assert.match(line, /^lớp bậc/, `${spec.id}/${beat.id}: ${line}`);
      // Nhánh "cảnh ghim" chỉ được xuất hiện khi registry KHÔNG phải bên từ chối.
      if (control.gradientDisabled) assert.doesNotMatch(line, /cảnh ghim/, `${spec.id}/${beat.id}`);
      else assert.match(line, /cảnh ghim/, `${spec.id}/${beat.id}`);
    }
  }
});

test("CG-1(B) badge cảnh in câu ấy, và dựng nó qua đúng đường của cột đọc", () => {
  const view = src("map/MapView.tsx");
  assert.match(view, /scenePinDisclosure\(sceneDef, scaleControlFor\(field, gradientAvailability\(/,
    "câu khai phải đi qua `scaleControlFor` + cổng bảng màu, không dựng lại luật");
  assert.match(view, /<span className="text-note text-ink-muted">\{scalePin\}<\/span>/);
  // Là câu KHAI, không phải bộ điều khiển: badge không được mọc ra một nút thang.
  assert.doesNotMatch(view, /setScaleMode/);
});

// ══ CG-2(B) ══════════════════════════════════════════════════════════════════

/** Thang số tối thiểu — chỉ `domain` và đơn vị là thứ câu khai đọc tới. */
const numericScale = (over: number, under = 0) => ({
  kind: "numeric" as const,
  mode: "binned" as const,
  breaks: [0, 10, 100],
  max: 200,
  transform: "sqrt" as const,
  diverge: null,
  domain: { lo: 0, hi: 90, median: 40, min: -5, max: 200, nClippedLow: under, nClippedHigh: over },
});

test("CG-2(B) không có gì bị kẹp ⇒ KHÔNG câu nào", () => {
  const meta = FIELD_BY_ID.get("pop_density_ppkm2")!;
  const d = clipDisclosure(meta, numericScale(0, 0) as never, "ô");
  assert.equal(d.over, null);
  assert.equal(d.under, null);
});

test("CG-2(B) danh từ là THAM SỐ; phần còn lại của câu không đổi theo nó", () => {
  const meta = FIELD_BY_ID.get("commune:ports_per_10k_pop")!;
  const asCell = clipDisclosure(meta, numericScale(7) as never, "ô");
  const asCommune = clipDisclosure(meta, numericScale(7) as never, "xã");
  assert.match(asCell.over!, /^▲ 7 ô vượt trần · lớn nhất /);
  assert.match(asCommune.over!, /^▲ 7 xã vượt trần · lớn nhất /);
  // Chỉ MỘT từ được phép khác nhau — số, thứ tự, dấu và đơn vị giá trị phải trùng khít.
  assert.equal(asCell.over!.replace(" ô ", " xã "), asCommune.over!);

  const low = clipDisclosure(FIELD_BY_ID.get("pop_density_ppkm2")!, numericScale(0, 3) as never, "ô");
  assert.match(low.under!, /^▼ 3 ô dưới sàn · nhỏ nhất /);
});

test("CG-2(B) legend ghim `\"ô\"` có chủ ý; badge cảnh dùng danh từ thật", () => {
  // Hai bề mặt lệch nhau đúng một từ, và đó là một QUYẾT ĐỊNH — không phải chỗ bỏ sót. Test
  // này là thứ buộc lần sửa sau phải cố ý mới đổi được.
  assert.match(src("ui/Legend.tsx"), /clipDisclosure\(field, scale, "ô"\)/);
  assert.match(src("map/MapView.tsx"), /clipDisclosure\(field, scale, unitNoun\(field\.readAs\)\)/);
});

test("CG-2(B) legend và badge cảnh đọc CÙNG một hàm, không bản chép nào còn lại", () => {
  // Quét MÃ, không quét chú thích — số trong tài liệu là tài liệu (cùng phép bóc mà
  // `story-spec.test.ts` dùng cho luật literal). Không có nó thì một chú thích giải thích
  // vì sao câu ấy tồn tại sẽ bị đọc thành một bản chép của chính nó.
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const legend = strip(src("ui/Legend.tsx"));
  const view = strip(src("map/MapView.tsx"));
  // Không call site nào được dựng lại câu tại chỗ. `Legend` còn một câu cắt trần thứ hai —
  // kênh CAO ĐỘ ("vượt trần cao độ"), khác câu, khác nguồn — nên chỉ cấm bản MÀU.
  assert.doesNotMatch(legend, /vượt trần · lớn nhất/, "legend không được chép lại câu màu");
  assert.doesNotMatch(view, /vượt trần/, "badge không được chép lại câu nào");
  assert.match(legend, /clipDisclosure\(field, scale, /);
  assert.match(view, /clipDisclosure\(field, scale, /);
  // CẢ BA nhánh render của legend phải mount câu khai — gradient, nổi, và rail ngang. Bản
  // trước chỉ nhánh GRADIENT có, nên chế độ BẬC (mặc định của app) im lặng trên một mặt tô
  // bị cắt y hệt: `applyScaleMode` chỉ lật `mode`, `domain` không đổi.
  assert.equal((legend.match(/<ClipLines /g) ?? []).length, 3,
    "gradient · nổi · rail — không nhánh nào được bỏ câu khai");
  // Badge in cả hai đầu, và chỉ in khi có thật.
  assert.match(view, /\{sceneClip\?\.over &&/);
  assert.match(view, /\{sceneClip\?\.under &&/);
});

// ══ QA-6 — bấm sang nhịp áp TRỌN BỘ state của nhịp, bằng đúng deep-link ═══════

test("QA-6 setBeat() cho ra CÙNG state với deep-link `#s=<cảnh>.<nhịp>`", () => {
  // Bản cũ chỉ áp `beat` + `field`: camera/`t` của nhịp trước đứng lại dưới câu chữ của
  // nhịp mới, và cùng một URL cảnh cho hai state khác nhau tuỳ đường vào (bấm hay dán link).
  const scene = SCENES.find((s) => s.beats.length > 1 && s.beats.some((b) => b.camera))!;
  const target = scene.beats.find((b) => b.camera)?.id === scene.beats[0]!.id
    ? scene.beats[1]!.id
    : scene.beats.find((b) => b.camera)!.id;

  // Đường 1 — BẤM: vào cảnh ở nhịp đầu, rồi setBeat sang nhịp đích.
  useStore.setState({ scene: null, dataMode: false, nationalMode: false });
  useStore.getState().applyHash({ scene: scene.id });
  // làm bẩn view/t để chắc chắn setBeat phải tự áp lại chứ không thừa hưởng tình cờ
  useStore.setState({ view: { ...useStore.getState().view, zoom: 3.21 }, t: 77 });
  useStore.getState().setBeat(target);
  const clicked = useStore.getState();

  // Đường 2 — DEEP-LINK: cùng cảnh, cùng nhịp, vào thẳng từ hash.
  useStore.setState({ scene: null, dataMode: false, nationalMode: false });
  useStore.setState({ t: 77 });
  useStore.getState().applyHash({ scene: scene.id, beat: target });
  const linked = useStore.getState();

  assert.equal(clicked.scene, linked.scene);
  assert.equal(clicked.beat, linked.beat);
  assert.equal(clicked.field, linked.field);
  assert.deepEqual(clicked.view, linked.view, "camera của nhịp phải được áp khi BẤM");
  assert.equal(clicked.t, linked.t, "giờ do nhịp sở hữu phải khớp giữa hai đường vào");
  assert.deepEqual(clicked.selection, linked.selection);
  assert.deepEqual([...clicked.layers].sort(), [...linked.layers].sort());
  assert.equal(clicked.paintOn, linked.paintOn);

  // Và state ấy chính là `sceneState` — nguồn duy nhất của "nhịp này chốt gì".
  const st = sceneState(scene.id, target);
  assert.equal(clicked.field, st.field);
  assert.deepEqual(clicked.view, st.view);
});
