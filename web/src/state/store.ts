import { create } from "zustand";

import { FIRST_FIELD, defaultFieldOfLens, type LensId } from "../fields";
import { INITIAL_VIEW } from "./view-config";
import { SCENES, beatOf, parseScene, sceneState, type SceneId } from "../story/scenes";
import {
  NO_BRUSH,
  clampToWindow,
  nextT,
  reconcileBrush,
  type BrushState,
} from "./brush";
import { readHash, resolveHashField, type HashApplyContext } from "./hash";
import { type EntitySelection, parseEntitySelection, serializeEntitySelection } from "./selection";
import type { AppNavMode, BasemapStyle, DemandRepresentation, HashState, Mode, OverlayId, View } from "./types";
import { defaultRepresentationFor, representationFits } from "./types";

export type { AppNavMode, BasemapStyle, Mode, OverlayId, ReadingUnit, View } from "./types";
export type { EntitySelection, DatasetId, StationId, H3R8, CommuneCode } from "./selection";

export interface AppState {
  field: string;
  /** P1 Demand prototype; session-only until its representations pass review (§15c). */
  demandRepresentation: DemandRepresentation;
  mode: Mode;
  view: View;
  /** overlay đang bật — §4d. Khoá KHÁC với `field`: overlay không bao giờ là trường. */
  layers: Set<OverlayId>;
  /**
   * Mặt tô của `field` có đang VẼ hay không — thêm sau M3.5. `field` vẫn là MỘT chuỗi
   * (ràng buộc 2 nguyên vẹn); cờ này chỉ ẩn phần TÔ, để lại nền + overlay. Luôn `true`
   * trong chế độ CÂU CHUYỆN (L3 — một cảnh luôn tô đúng một trường của nó).
   */
  paintOn: boolean;
  /** Đối tượng đang chọn theo Phase 3 (§3). null = không chọn gì. */
  selection: EntitySelection | null;
  /** Road/POI context only; never duplicates a Phase 3 EntitySelection. */
  contextSelection: string | null;
  /**
   * Cảnh CÂU CHUYỆN đang mở, hoặc `null` = chế độ BẢN ĐỒ — §9a, §14a.
   *
   * Nằm trong CHÍNH store này chứ không trong một store riêng (luật L1): hai store thì có
   * hai `field`, mà ràng buộc 2 đếm trên toàn app chứ không đếm trên từng chế độ.
   */
  scene: SceneId | null;
  /**
   * Chế độ DỮ LIỆU (§3f) đang mở hay không — M4.2, khoá `d`.
   *
   * Nằm cùng store với `scene` vì cùng một lý do L1 đã đưa `scene` vào đây: ba chế độ dùng
   * chung một `field`, và ràng buộc 2 đếm trên **toàn app** chứ không đếm trên từng chế độ.
   * Bất biến "đúng một chế độ" do `enterScene`/`setDataMode` giữ — chúng loại trừ nhau ở
   * ngay chỗ đặt, nên không có state nào mang cả hai.
   */
  dataMode: boolean;
  /**
   * Chế độ TOÀN QUỐC (34 tỉnh thành) đang mở hay không.
   */
  nationalMode: boolean;
  /**
   * Nhịp đang xem trong cảnh — M3.1. `null` = nhịp đầu.
   *
   * KHÔNG vào hash, và đó là một quyết định chứ không phải một thiếu sót: một nhịp là một
   * BƯỚC BÊN TRONG một cảnh, cùng hạng với việc cảnh B đang bay tới xã nào. Link tới một
   * cảnh mở ra cảnh đó **từ đầu** — đúng như tên gọi của nó. Muốn gửi link tới nhịp kết
   * thì thứ đáng gửi là chính trường của nhịp đó ở chế độ BẢN ĐỒ, và L2 đã cho làm điều ấy.
   */
  beat: string | null;

  /** Vị trí scrubber — khoá `t`, 0–167 (§3e). `t = dow × 24 + hour`, `dow = 0` là Thứ Hai. */
  t: number;
  /**
   * Scrubber có đang chạy không.
   *
   * KHÔNG vào hash, và đó là quyết định: một link là một **ảnh chụp**, còn "đang chạy" là
   * một chuyển động. `#t=46` mở ra đúng giờ 46 và đứng yên — người nhận bấm play nếu muốn.
   * Cùng lập luận đã dùng cho `beat` ở M3.1.
   */
  playing: boolean;
  /** Ba ô brush của dock — khoá `b`, §9b. */
  brush: BrushState;
  /**
   * Cột ĐỌC có đang mở không — CHỈ có nghĩa dưới 1024 px (§3h).
   *
   * Từ 1024 px trở lên cột nằm **trong luồng** và không đóng được: nó là chỗ duy nhất giải
   * mã bản đồ, nên một nút đóng nó là một nút biến bản đồ thành hình trang trí. Dưới ngưỡng
   * đó không đủ bề rộng cho cả hai, nên cột thành sheet phủ và cờ này nói sheet đang mở hay
   * đóng. Mặc định ĐÓNG: mở app ra trên màn hẹp phải thấy bản đồ, không thấy một tấm chắn.
   *
   * Thay cho `workspaceOpen` + `infoPanelOpen` của bố cục cũ. Hai cờ ấy tồn tại vì có hai bề
   * mặt đóng/mở được tranh chỗ nhau; A′ chỉ còn một bề mặt trong luồng, nên chỉ còn một cờ —
   * và mọi luật điều phối giữa chúng biến mất cùng cờ thứ hai, không phải được viết lại.
   */
  readColumnOpen: boolean;
  basemapStyle: BasemapStyle;

  setField: (f: string) => void;
  /** Chuyển sang Lens phân tích mới: đổi trường mặc định và overlay mặc định, giữ nguyên đối tượng đang chọn. */
  switchLens: (lensId: LensId) => void;
  setDemandRepresentation: (representation: DemandRepresentation) => void;
  setView: (v: View) => void;
  /** Đổi 2D ↔ 3D — M3.5 (P5). Kèm nghiêng camera, vì đó là điều người bấm muốn. */
  setMode: (m: Mode) => void;
  setBasemapStyle: (style: BasemapStyle) => void;
  /** Bật/tắt mặt tô — nút thứ ba cạnh Ô H3 | XÃ. Không đụng `field`. */
  setPaintOn: (on: boolean) => void;
  toggleLayer: (id: OverlayId) => void;
  selectEntity: (selection: EntitySelection | null) => void;
  clearSelection: (reason?: string) => void;
  selectCell: (h3: string | null) => void;
  /** Vào một cảnh (hoặc `null` để về BẢN ĐỒ) — cảnh GHI ĐÈ state dùng chung, §14a-L1. */
  enterScene: (id: SceneId | null) => void;
  /**
   * Mở/đóng chế độ DỮ LIỆU — M4.2.
   *
   * Khác `enterScene` ở chỗ quan trọng nhất: nó **không ghi đè gì cả**. Một cảnh sở hữu
   * trường + khung nhìn + tập ô của nó (L3); trang dữ liệu chỉ là một màn hình khác đọc
   * cùng bộ dữ liệu, nên bấm sang rồi bấm về phải trả bản đồ y nguyên. Đúng luật bàn giao
   * L2, chỉ theo chiều ngược lại.
   */
  setDataMode: (on: boolean) => void;
  /** Mở/đóng chế độ TOÀN QUỐC */
  setNationalMode: (on: boolean) => void;
  /** Chuyển đổi giữa 4 primary modes: map, story, data, national */
  setAppNavMode: (navMode: AppNavMode) => void;
  /** Chuyển nhịp trong cảnh đang mở — nhịp đổi `field`, nên nó đổi mặt tô. */
  setBeat: (beatId: string) => void;
  /** Bay camera trong một cảnh mà không rời cảnh — cảnh B gọi tên từng xã. */
  flyTo: (v: View, select?: string | null) => void;
  /** Đặt giờ scrubber. Ngoài cửa sổ brush thì bị kéo vào — §3e. */
  setT: (t: number) => void;
  /** Một bước play. Lặp VÔ HẠN, và lặp trong cửa sổ nếu có (§3e). */
  stepT: () => void;
  setPlaying: (on: boolean) => void;
  /** Đặt/xoá một brush. `undefined` = xoá ô đó. */
  setBrush: (b: BrushState) => void;
  setReadColumnOpen: (on: boolean) => void;
  /** Nạp snapshot hash (`hashchange`); khoá vắng về mặc định, khoá sai bị bỏ riêng. */
  applyHash: (s: Partial<HashState>, context?: Partial<HashApplyContext>) => void;
}

export function selectionWireOf(
  state: Pick<AppState, "selection" | "contextSelection">,
): string | null {
  return state.selection ? serializeEntitySelection(state.selection) : state.contextSelection;
}

function contextSelectionOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^road:\d+$/.test(raw) || /^poi:[nwr]\d+$/.test(raw) ? raw : null;
}

/** State của một cảnh, đổ vào hình dạng của store. */
function fromScene(id: SceneId) {
  const s = sceneState(id);
  const selectSel = parseEntitySelection(s.select);
  return {
    scene: id,
    // Vào cảnh là vào từ NHỊP ĐẦU, kể cả khi tới bằng link giữa chừng.
    beat: null,
    field: s.field,
    view: s.view,
    layers: new Set(s.layers),
    selection: selectSel,
    contextSelection: selectSel ? null : contextSelectionOf(s.select),
    // Nút "TẮT mặt tô" thuộc rail BẢN ĐỒ; một cảnh luôn tô đúng một trường (L3) nên nó
    // ép `paintOn` về true kể cả khi người xem vừa tắt trước lúc bấm vào cảnh.
    paintOn: true,
    // Dock và scrubber không dựng trong CÂU CHUYỆN (§3d-1), nên brush đang bật phải TẮT
    // khi vào cảnh: để nó sống sót thì một cảnh sẽ hiện ra với một nửa số ô xám nhạt và
    // không có gì trên màn hình giải thích được vì sao. Play cũng dừng — một cảnh không có
    // scrubber thì không có gì đang chạy.
    brush: NO_BRUSH,
    playing: false,
  };
}

const boot = readHash();

const DEFAULT_VIEW: View = {
  lng: INITIAL_VIEW.center[0],
  lat: INITIAL_VIEW.center[1],
  zoom: INITIAL_VIEW.zoom,
  pitch: INITIAL_VIEW.pitch,
  bearing: INITIAL_VIEW.bearing,
};

const bootScene = parseScene(boot.scene);

// Trường của phiên: hash thắng, không có hash thì `FIRST_FIELD` (§3h). KHÔNG phải
// `DEFAULT_FIELD` — xem hai đoạn khai báo trong `fields.ts`: một cái là màn hình đầu tiên,
// cái kia là lưới an toàn khi trường không dựng được, và trộn chúng làm một đã từng cho ra
// một cột đọc thiếu tiết CÁCH ĐỌC mà không có đường nào tới được nó.
const bootField = boot.field ?? FIRST_FIELD;

// Brush của lúc boot, đã áp bất biến "histogram luôn nói về trường đang tô" (§9b).
const bootBrush = reconcileBrush(boot.brush ?? NO_BRUSH, bootField);
const bootSelection = boot.selection ?? parseEntitySelection(boot.cell);
const bootContextSelection = bootSelection ? null : contextSelectionOf(boot.cell);

export const useStore = create<AppState>((set) => ({
  scene: null,
  // `s` thắng `d` ở chiều VÀO (xem `parseHash`), nên `bootScene` đã quyết định xong: khi
  // có cảnh thì `parseHash` không phát `dataMode`, và dòng này không phải kiểm lại.
  dataMode: boot.dataMode ?? false,
  nationalMode: boot.nationalMode ?? false,
  beat: null,
  field: bootField,
  demandRepresentation: "hex",
  mode: boot.mode ?? "2d",
  // Link `#m=3d` không kèm `v` phải mở ra ĐÃ nghiêng — pitch 50 là một nửa nghĩa của
  // "3D" (§2b); mở phẳng rồi bắt người nhận tự nghiêng là link nói dối một nửa.
  view: boot.view ?? (boot.mode === "3d" ? { ...DEFAULT_VIEW, pitch: 50 } : DEFAULT_VIEW),
  layers: new Set(boot.layers ?? []),
  paintOn: boot.paintOn ?? true,
  selection: bootSelection,
  contextSelection: bootContextSelection,

  // Scrubber mở ở giờ 0 (Thứ Hai 0h) khi hash không nói gì. Play KHÔNG tự chạy: một link
  // là ảnh chụp, và một bản đồ tự động thay đổi ngay khi mở là thứ người nhận không yêu cầu.
  // `clampToWindow` phải có ở ĐÂY nữa, không chỉ ở `applyHash` và `setBrush`. Bỏ sót nó ở
  // đường boot là một lỗi thật đã bắt bằng ảnh render: `#b=…w:0..4:7..19` không kèm `t` mở
  // ra ở T2 00:00 — một giờ mà chính cửa sổ đó loại — nên nhãn scrubber ("T2 00:00") tự mâu
  // thuẫn với câu ngay cạnh nó ("lặp trong cửa sổ 7h–19h"). Ba đường vào `t` thì cả ba phải
  // giữ cùng một bất biến: **`t` luôn nằm trong cửa sổ.**
  t: clampToWindow(bootBrush.win, boot.t ?? 0),
  playing: false,
  brush: bootBrush,
  // Chỉ đọc dưới 1024 px, nơi cột là sheet phủ — xem khai báo ở trên.
  readColumnOpen: false,
  basemapStyle: "positron",

  // Hash mang `s` ⇒ cảnh GHI ĐÈ ngay từ lúc boot (L1). Đặt SAU các mặc định, không trộn
  // vào từng dòng: §9a nói khi có `s` thì `f`/`v`/`l` không được đọc, nên `boot` không
  // mang chúng, nên chúng không có gì để tranh chấp — trừ `c`, thứ vẫn đọc được ở cả hai
  // chế độ, nên nó thắng lại lựa chọn mặc định của cảnh ngay dưới đây.
  ...(bootScene ? fromScene(bootScene) : {}),
  ...(bootScene && boot.cell
    ? { selection: bootSelection, contextSelection: bootContextSelection }
    : {}),

  // Ràng buộc 2: `field` là MỘT chuỗi, không phải mảng. Không có API nào thêm trường thứ hai.
  //
  // Brush histogram nói về MỘT trường cụ thể, nên đổi trường thì nó phải rụng — giữ lại sẽ
  // đem khoảng giá trị của trường cũ đi so với trường mới, im lặng và ra kết quả trông hợp
  // lý. Hai brush kia không đụng gì: scatter nói về hai cột cố định, cửa sổ nói về thời
  // gian; cả hai độc lập với trường đang tô.
  setField: (f) =>
    set((s) => ({
      field: f,
      brush: reconcileBrush(s.brush, f),
      // P1 chỉ có nghĩa với `population` của Ô H3. Không để một representation cũ âm
      // thầm đổi cách vẽ một metric khác khi người dùng chọn trường mới.
      demandRepresentation: defaultRepresentationFor(s.mode),
    })),
  switchLens: (lensId) =>
    set((s) => {
      const nextField = defaultFieldOfLens(lensId);
      if (!nextField || nextField.id === s.field) return {};
      const fieldId = nextField.id;
      return {
        field: fieldId,
        // Lens chỉ đổi analytical field. Selection, overlay và dataset session
        // là ngữ cảnh do người dùng sở hữu, không phải default của lens mới.
        brush: reconcileBrush(s.brush, fieldId),
        demandRepresentation: defaultRepresentationFor(s.mode),
      };
    }),
  // Bộ chọn KHÔNG được đổi điểm nhìn — nó chỉ chọn trong nhóm của điểm nhìn đang mở.
  // Một giá trị lạc nhóm bị chốt về mặc định thay vì âm thầm kéo `mode` theo (§15a).
  setDemandRepresentation: (r) =>
    set((s) => ({ demandRepresentation: representationFits(r, s.mode) ? r : defaultRepresentationFor(s.mode) })),
  setView: (v) => set({ view: v }),
  // `mode` quyết định LỚP (fill-extrusion + khối POI); pitch chỉ là camera đi kèm cho
  // tiện — sau đó người dùng nghiêng tự do và pitch ghi vào `v` như mọi khi (§9).
  // Đây là CỬA DUY NHẤT đổi điểm nhìn. Representation không thuộc điểm nhìn mới thì chốt
  // về mặc định của nó — nếu không, `extrusion` sống sót sang 2D và dựng khối trên pitch 0.
  setMode: (m) =>
    set((s) => ({
      mode: m,
      view: { ...s.view, pitch: m === "3d" ? 50 : 0 },
      demandRepresentation: representationFits(s.demandRepresentation, m)
        ? s.demandRepresentation
        : defaultRepresentationFor(m),
    })),
  setBasemapStyle: (basemapStyle) => set({ basemapStyle }),
  setPaintOn: (on) => set({ paintOn: on }),
  toggleLayer: (id) =>
    set((s) => {
      const next = new Set(s.layers);
      // Set mới chứ không mutate: zustand so sánh tham chiếu, sửa tại chỗ thì không render lại.
      next.has(id) ? next.delete(id) : next.add(id);
      return { layers: next };
    }),
  selectEntity: (selection) =>
    set({
      selection,
      contextSelection: null,
    }),
  clearSelection: (_reason) =>
    set({
      selection: null,
      contextSelection: null,
    }),
  selectCell: (h3) => {
    const selection = parseEntitySelection(h3);
    set({
      selection,
      contextSelection: selection ? null : contextSelectionOf(h3),
    });
  },

  // Luật L1 và L2 của §14a, cả hai trong một hàm — vì chúng là hai chiều của cùng một
  // quyết định. Vào cảnh: cảnh ghi đè state dùng chung. Ra khỏi cảnh (`null`): CHỈ bỏ
  // `scene`, không đặt lại gì cả. Cái thứ hai trông như thiếu sót nên nó phải được viết ra
  // — nó là bàn giao: mentor xem xong cảnh C thì đứng nguyên ở 672 ô đó, chỉ khác là rail
  // hiện ra và mọi thứ bấm được.
  // Vào một cảnh thì ĐÓNG trang dữ liệu và trang toàn quốc.
  enterScene: (id) =>
    set(id === null ? { scene: null, beat: null, dataMode: false, nationalMode: false } : { ...fromScene(id), dataMode: false, nationalMode: false }),
  setDataMode: (on) => set(on ? { dataMode: true, scene: null, beat: null, nationalMode: false } : { dataMode: false }),
  setNationalMode: (on) => set(on ? { nationalMode: true, dataMode: false, scene: null, beat: null } : { nationalMode: false }),
  setAppNavMode: (navMode) => {
    if (navMode === "data") {
      set({ dataMode: true, nationalMode: false, scene: null, beat: null });
    } else if (navMode === "story") {
      const first = SCENES[0];
      set(first
        ? { ...fromScene(first.id), dataMode: false, nationalMode: false }
        : { dataMode: false, nationalMode: false, scene: null, beat: null });
    } else if (navMode === "national") {
      set({ nationalMode: true, dataMode: false, scene: null, beat: null });
    } else {
      // "map"
      set({ nationalMode: false, dataMode: false, scene: null, beat: null });
    }
  },

  // Nhịp đổi trường, nên nó đi qua đúng `field` mà mọi thứ khác đọc — không có state song
  // song nào. Ràng buộc 2 nguyên vẹn: vẫn một chuỗi, vẫn một trường.
  setBeat: (beatId) =>
    set((s) => (s.scene ? { beat: beatId, field: beatOf(s.scene, beatId).field } : {})),

  flyTo: (v, select) =>
    set(() => {
      if (select === undefined) return { view: v };
      const selection = parseEntitySelection(select);
      return { view: v, selection, contextSelection: selection ? null : contextSelectionOf(select) };
    }),

  setT: (t) => set((s) => ({ t: clampToWindow(s.brush.win, Math.max(0, Math.min(167, Math.round(t)))) })),
  stepT: () => set((s) => ({ t: nextT(s.brush.win, s.t) })),
  setPlaying: (on) => set({ playing: on }),
  // Đổi cửa sổ thì KÉO `t` vào cửa sổ mới — nếu không, scrubber đứng ở một giờ mà chính
  // brush vừa loại ra, tức bản đồ hiện một giờ mà dock nói là không xem.
  setBrush: (b) => set((s) => ({ brush: b, t: clampToWindow(b.win, s.t) })),
  setReadColumnOpen: (readColumnOpen) => set({ readColumnOpen }),

  applyHash: (h, context) =>
    set((s) => {
      // Khoá hỏng đã bị `parseHash` bỏ; ở đây khoá VẮNG nghĩa là "về mặc định của khoá đó",
      // vì người sửa tay URL xoá `l=` là có ý tắt hết overlay, không phải giữ nguyên.
      // Ngoại lệ `field`: tên trường hỏng thì giữ trường đang xem chứ không nhảy về mặc
      // định — nhảy sẽ vứt mất thứ người dùng đang nhìn vì một ký tự gõ sai.
      const selection = h.selection !== undefined ? h.selection : parseEntitySelection(h.cell);
      const contextSelection = selection ? null : contextSelectionOf(h.cell);

      // `tinh=vn` là primary surface riêng. Không reset state bản đồ đang đỗ phía sau:
      // quay lại BẢN ĐỒ phải trả đúng ngữ cảnh trước đó, giống luật bàn giao của DATA.
      if (h.nationalMode) {
        return {
          nationalMode: true,
          dataMode: false,
          scene: null,
          beat: null,
          playing: false,
        };
      }

      // `s` hợp lệ ⇒ cảnh quyết định `field`/`view`/`layers` (§9a), nên chúng lấy từ cảnh
      // chứ không từ hash — và `parseHash` đã không đọc chúng, nên không có gì để lỡ dùng
      // nhầm. `c` vẫn thắng lựa chọn mặc định của cảnh: nó là lựa chọn của người xem.
      const scene = parseScene(h.scene);
      if (scene) {
        const st = sceneState(scene);
        const sceneSel = selection ?? parseEntitySelection(st.select);
        return {
          scene,
          // `parseHash` đã bỏ `d` khi có cảnh; đặt lại ở đây để một lần `applyHash` cũng
          // đủ đưa app ra khỏi trang dữ liệu, không cần ai gọi thêm hàm thứ hai.
          dataMode: false,
          nationalMode: false,
          beat: null,
          field: st.field,
          mode: h.mode ?? "2d",
          view: st.view,
          layers: new Set(st.layers),
          // `p` không đọc/ghi trong CÂU CHUYỆN, cùng luật đã áp cho `f`/`v`/`l` (§9a, L3).
          paintOn: true,
          // `t`/`b` cùng nhóm đó từ M4 (§9b): dock và scrubber không dựng trong cảnh, nên
          // brush phải tắt và play phải dừng — y như `fromScene`.
          brush: NO_BRUSH,
          playing: false,
          selection: sceneSel,
          contextSelection: sceneSel ? null : (contextSelection ?? contextSelectionOf(st.select)),
        };
      }

      const field = resolveHashField(s.field, h.field, context);
      // Bất biến: brush histogram luôn nói về trường đang tô. Mệnh đề `h` trỏ trường khác
      // bị bỏ RIÊNG nó, cùng luật với mọi khoá hỏng khác (§9b).
      const brush = reconcileBrush(h.brush ?? NO_BRUSH, field);
      return {
        scene: null,
        // Khoá vắng ⇒ về mặc định của khoá đó, cùng luật với `l` và `p`.
        dataMode: h.dataMode ?? false,
        nationalMode: false,
        beat: null,
        field,
        mode: h.mode ?? "2d",
        // Cùng luật với boot: `m=3d` không kèm `v` mở ra đã nghiêng 50 (§2b).
        view: h.view ?? (h.mode === "3d" ? { ...DEFAULT_VIEW, pitch: 50 } : DEFAULT_VIEW),
        layers: new Set(h.layers ?? []),
        paintOn: h.paintOn ?? true,
        // Khoá vắng ⇒ về mặc định của khoá đó, cùng luật với `l`: người sửa tay URL xoá
        // `b=` là có ý bỏ brush, không phải giữ nguyên.
        brush,
        t: clampToWindow(brush.win, h.t ?? 0),
        selection,
        contextSelection,
      };
    }),
}));
