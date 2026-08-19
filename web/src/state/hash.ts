/**
 * URL hash = **serialization của state**, không phải router — DESIGN.md §9.
 *
 * Khoá đang dùng: `f` trường · `m` chế độ · `v` khung nhìn · `l` overlay · `c` ô đang chọn ·
 * `s` cảnh CÂU CHUYỆN · `d` chế độ DỮ LIỆU (M4.2) · `p` mặt tô có vẽ không (M3.5+) ·
 * `t` vị trí scrubber · `b` brush của dock (hai khoá cuối thành khoá THẬT ở M4 — cú pháp
 * `b` ở §9b).
 *
 * `s` và `d` là hai chế độ loại trừ nhau: chiều RA không bao giờ ghi cả hai, chiều VÀO đọc
 * `s` trước. Trạng thái vẫn luôn ở đúng một chế độ — xem `HashState.dataMode`.
 *
 * **Trong chế độ DỮ LIỆU thì `f`/`v`/`l`/`t`/`b` VẪN ghi**, khác hẳn chế độ CÂU CHUYỆN. Lý
 * do: một cảnh **sở hữu** trường và khung nhìn của nó (§9a), còn trang dữ liệu chỉ **đỗ**
 * bản đồ lại — bấm về BẢN ĐỒ phải trả người xem về đúng chỗ họ rời đi, đúng luật bàn giao
 * L2 của §14a.
 *
 * **`t`/`b` trước M4 chỉ là khoá GIỮ NGUYÊN**: chép nguyên văn ra, không đọc, không kiểm.
 * Đủ để link do M4 sinh ra không bị bản M3 xén mất, nhưng nó không phải một khoá — chuỗi
 * rác trong `b` cũng sống sót y như một brush thật. Giờ chúng đi qua đúng bộ kiểm
 * từng-khoá mà `p` đã dùng ở M3.5, nên `KEPT_FOR_LATER` không còn ai.
 *
 * Hai quy tắc quan trọng nhất:
 *   1. Hash hỏng thì bỏ qua **từng khoá một**, không reset cả app.
 *   2. Hash là serialization **hai chiều** — `hashchange` nạp ngược vào store (M2). Một
 *      serialization chỉ đọc được một lần lúc boot là tham số khởi động, không phải
 *      serialization.
 */

import { FIELD_BY_ID, FIRST_FIELD } from "../fields";
import { parseSelection } from "../data/h3";
import { parseEntitySelection, serializeEntitySelection } from "./selection";
import { overlayUnavailable } from "../data/overlays";
import { NATIONAL, PROVINCE_KEY } from "../data/province";
import { parseScene } from "../story/scenes";
import { parseFilter, serializeFilter } from "./filter";
import {
  HOURS_IN_WEEK,
  MODES,
  OVERLAY_IDS,
  type HashState,
  type Mode,
  type OverlayId,
} from "./types";

function params(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

export interface HashApplyContext {
  /** `true` kể cả khi giá trị `f` sai và bị `parseHash` loại. */
  fieldPresent: boolean;
}

/**
 * Phân biệt `f` bị xoá với `f` có mặt nhưng sai.
 *
 * - thiếu khoá: hash là snapshot đầy đủ, nên về field mặc định;
 * - khoá sai: bỏ riêng khoá đó và giữ field đang xem;
 * - khoá hợp lệ: áp giá trị mới.
 */
export function resolveHashField(
  current: string,
  parsed: string | undefined,
  context: Partial<HashApplyContext> = {},
): string {
  if (parsed && FIELD_BY_ID.has(parsed)) return parsed;
  const fieldPresent = context.fieldPresent ?? parsed !== undefined;
  return fieldPresent ? current : FIRST_FIELD;
}

/**
 * Phân tích một chuỗi hash. Mỗi khoá được kiểm riêng; khoá hỏng bị bỏ, khoá khác vẫn dùng.
 *
 * Hàm thuần trên chuỗi (không đụng `window`) để test được — §12. `readHash()` là lớp mỏng
 * đọc `location.hash` rồi gọi nó.
 */
export function parseHash(hash: string): Partial<HashState> {
  const p = params(hash);
  const out: Partial<HashState> = {};

  // Surface TOÀN QUỐC sở hữu các khoá `f`/`l`/`m` của chính nó. Trả sớm để store tỉnh
  // không diễn giải cùng một chuỗi bằng từ vựng khác. `tinh=vn` đồng thời là mode bền qua
  // refresh; các mode còn lại được loại trừ ở `applyHash`.
  if (p.get(PROVINCE_KEY) === NATIONAL) return { nationalMode: true };

  // Khoá `s` đọc TRƯỚC, vì nó quyết định `f`/`v`/`l` có được đọc hay không (§9a). Slug lạ
  // bị bỏ như mọi khoá hỏng, và bỏ nó chính là về chế độ BẢN ĐỒ — không cần nhánh lỗi riêng.
  const scene = parseScene(p.get("s"));
  if (scene) out.scene = scene;

  // `d` — chế độ DỮ LIỆU (M4.2, §3f). Đọc SAU `s` và chỉ khi không có cảnh: hai chế độ
  // cùng lúc không tồn tại được trong state, nên một hash gõ tay mang cả hai phải cho một
  // kết quả xác định thay vì một trạng thái lai. `s` thắng vì nó là khoá cũ hơn và mang
  // nhiều thông tin hơn (chế độ + cảnh). Chỉ `"1"` là hợp lệ — cùng luật với `p`.
  if (!scene && p.get("d") === "1") out.dataMode = true;

  const m = p.get("m");
  if (m && MODES.includes(m)) out.mode = m as Mode;

  // Khoá `c` mang MỘT đối tượng: ô (`h3_r8`), trạm (`station:<id>`), hoặc xã (`commune:<mã 5 số>`).
  // Chỉ kiểm HÌNH DẠNG; đối tượng không có thật bị bỏ khi truy vấn trả rỗng.
  const c = p.get("c");
  if (c && parseSelection(c)) {
    out.cell = c;
    const entitySel = parseEntitySelection(c);
    if (entitySel) out.selection = entitySel;
  }

  // ── Khoá do CẢNH quyết định khi `s` có mặt (§9a) ──────────────────────────────
  //
  // Đọc chúng ở đây thì một hash như `#s=di-vong&f=population` có hai nguồn sự thật cho
  // cùng một thứ, và không có câu trả lời đúng nào cho việc nên tin bên nào. Bỏ hẳn.
  //
  // `t`/`b` cũng nằm trong nhóm này (§9b): dock và scrubber KHÔNG dựng trong CÂU CHUYỆN
  // (§3d-1), nên đọc chúng là nạp trạng thái cho một bộ điều khiển không tồn tại.
  if (scene) return out;

  const f = p.get("f");
  // Model/inspect-only variables have an id so panels can trace provenance, but are not
  // valid map states. Reject them here instead of briefly accepting a share link and
  // relying on App's later corrective effect.
  const field = f ? FIELD_BY_ID.get(f) : undefined;
  if (field && field.map !== false) out.field = field.id;

  const v = p.get("v");
  if (v) {
    const n = v.split(",").map(Number);
    const [lng, lat, zoom, pitch, bearing] = n;
    if (
      n.length === 5 &&
      n.every(Number.isFinite) &&
      lng! >= -180 && lng! <= 180 &&
      lat! >= -85 && lat! <= 85 &&
      zoom! >= 0 && zoom! <= 24 &&
      pitch! >= 0 && pitch! <= 85
    ) {
      out.view = { lng: lng!, lat: lat!, zoom: zoom!, pitch: pitch!, bearing: bearing! };
    }
  }

  const l = p.get("l");
  if (l !== null) {
    // Bỏ từng ID lạ, giữ các ID hợp lệ còn lại — cùng luật "bỏ từng khoá" nhưng ở một bậc
    // sâu hơn. `l=stations,khongcothat` phải bật `stations`, không phải bỏ cả khoá.
    //
    // Overlay KHÔNG DỰNG ĐƯỢC trên bộ đang mở cũng bị bỏ ở đây, cùng một nhánh với ID lạ.
    // Bỏ được ngay ở đây (thay vì dọn state sau khi manifest về) là nhờ `main.tsx` đặt cờ
    // trước khi `store.ts` đọc hash.
    const ids = l
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is OverlayId => (OVERLAY_IDS as readonly string[]).includes(s))
      .filter((s) => !overlayUnavailable(s));
    out.layers = [...new Set(ids)];
  }

  // `p` — mặt tô có vẽ không (thêm sau M3.5). Chỉ "0"/"1" là hợp lệ; giá trị khác bị bỏ
  // như mọi khoá hỏng, và bỏ nó nghĩa là về mặc định `true` — cùng luật §9.
  const pt = p.get("p");
  if (pt === "0") out.paintOn = false;
  else if (pt === "1") out.paintOn = true;

  // `t` — vị trí scrubber, SỐ NGUYÊN 0–167 (§3e). `t=48.5` và `t=200` đều bị bỏ như mọi
  // khoá hỏng: một ô giờ nửa vời không tồn tại trong dữ liệu, và làm tròn hộ người gửi
  // link là đoán ý họ. Bỏ nó ⇒ về mặc định 0, không kéo theo khoá nào khác.
  const tRaw = p.get("t");
  if (tRaw) {
    // `tRaw` phải truthy, không chỉ `!== null`: `Number("")` là **0**, một số nguyên trong
    // biên — nên `#t=` (khoá rỗng) sẽ lọt qua thành "giờ 0" thay vì bị bỏ như khoá hỏng.
    const t = Number(tRaw);
    if (Number.isInteger(t) && t >= 0 && t < HOURS_IN_WEEK) out.t = t;
  }

  // `b` — đúng một analytical SUBSET filter. `parseFilter` tự normalize histogram dân số
  // legacy; scatter/window legacy bị bỏ vì không cùng nghĩa filter Phase 4.
  const bRaw = p.get("b");
  if (bRaw !== null) {
    const f = parseFilter(bRaw);
    if (f) out.filter = f;
  }

  return out;
}

/** Đọc hash hiện tại của trang. */
export function readHash(): Partial<HashState> {
  if (typeof window === "undefined") return {};
  return parseHash(window.location.hash);
}

/** Chuỗi hash chuẩn của một state. `_prev` được giữ để tương thích API gọi cũ. */
export function serializeHash(s: HashState, prev = ""): string {
  if (s.nationalMode) {
    // NationalApp sở hữu `f`/`l`/`m`; serializer chung chỉ duy trì route và không được
    // ghi đè lựa chọn bên trong surface đó. Xoá hai mode chung để hash không biểu diễn hai
    // primary surface cùng lúc.
    const national = params(prev);
    national.set(PROVINCE_KEY, NATIONAL);
    for (const key of ["s", "d", "v", "p", "c", "t", "b"]) national.delete(key);
    return national.toString().replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%7E/g, "~");
  }
  const p = new URLSearchParams();
  // Build hiện tại chỉ phát hành dataset Hà Nội (`parseDataset` canonicalize mọi `tinh`
  // về cùng dataset). Không ghi lại một khoá không còn điều khiển state: sync đầu tiên sẽ
  // chuẩn hoá deep-link cũ, trong khi parser vẫn đọc tương thích các khoá còn lại.
  const scene = parseScene(s.scene);
  if (scene) p.set("s", scene);
  // Không bao giờ ghi cả `s` lẫn `d` — xem `HashState.dataMode`. Đây là chỗ bất biến "đúng
  // một chế độ" được thực thi ở chiều RA; `parseHash` giữ nó ở chiều VÀO.
  else if (s.dataMode) p.set("d", "1");
  p.set("m", s.mode);

  // Trong chế độ CÂU CHUYỆN, CẢNH quyết định `f`/`v`/`l` (§9a) — ghi chúng ra là ghi hai
  // nguồn sự thật cho cùng một thứ. Bỏ đi cũng làm link tới một cảnh ngắn và đọc được:
  // `#s=di-vong&m=2d`. Riêng `c` vẫn ghi: nó là lựa chọn của người xem trong cảnh.
  if (!scene) {
    p.set("f", s.field);
    const v = s.view;
    p.set(
      "v",
      [v.lng.toFixed(4), v.lat.toFixed(4), v.zoom.toFixed(2), v.pitch.toFixed(0), v.bearing.toFixed(0)].join(","),
    );
    // Khoá `l` chỉ có mặt khi có overlay bật. Ghi `l=` rỗng thì một hash "không bật gì" và
    // một hash "chưa nói gì về overlay" trông khác nhau mà nghĩa như nhau — thừa.
    //
    // Thứ tự CHUẨN HOÁ theo `OVERLAY_IDS`, không theo thứ tự bấm: nếu không thì tắt rồi bật
    // lại một lớp sẽ ra một chuỗi hash khác cho cùng một trạng thái, và hai link giống hệt
    // nhau về nội dung sẽ trông khác nhau khi mentor so chúng.
    if (s.layers.length > 0) {
      const order = new Set(s.layers);
      p.set("l", OVERLAY_IDS.filter((id) => order.has(id)).join(","));
    }
    // Chỉ ghi khi TẮT — mặc định `true` là ẩn, cùng khuôn với `l` rỗng không ghi.
    if (!s.paintOn) p.set("p", "0");

    // `t` và `b` — cùng nhóm với `f`/`v`/`l`: dock và scrubber không dựng trong CÂU CHUYỆN
    // (§3d-1), nên trong một cảnh chúng không ghi. Ngoài cảnh thì chỉ ghi khi KHÁC mặc
    // định, cùng khuôn "không ghi trạng thái mặc định" của `l` rỗng và `p=1`.
    if (s.t !== 0) p.set("t", String(s.t));
    const fb = serializeFilter(s.filter);
    if (fb) p.set("b", fb);
  }
  const serializedSel = s.selection ? serializeEntitySelection(s.selection) : s.cell;
  if (serializedSel) p.set("c", serializedSel);

  // Không encode `,` và `:` — hash là thứ mentor đọc và gửi cho nhau; `%2C`/`%3A` chỉ
  // làm nó xấu đi và cả hai ký tự đều hợp lệ trong fragment. `:` cần cho `commune:` (§6b)
  // và cho phần của mệnh đề `b`; `,` cho `l` và cho phân cách mệnh đề.
  //
  // `.` và `-` vốn an toàn; `~` là phân cách của filter Phase 4 nên cũng được giữ nguyên
  // để deep link còn đọc được bằng mắt.
  return p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%7E/g, "~");
}

/**
 * Nối state ↔ hash theo cả hai chiều. Trả về hàm huỷ đăng ký.
 *
 * Chiều RA: ghi có debounce 250ms (§9), bằng `replaceState` — hash là ảnh chụp state, nên
 * nút Back không nên phải đi qua từng lần pan.
 *
 * Chiều VÀO: nghe `hashchange`. Bẫy phải tránh là **vòng lặp ghi ↔ đọc** — ta ghi hash,
 * trình duyệt bắn `hashchange`, ta nạp ngược vào store, store lại ghi hash. Chặn bằng cách
 * nhớ đúng chuỗi vừa ghi (`lastWritten`) và bỏ qua sự kiện khớp với nó. Không dùng cờ
 * boolean + `setTimeout`: cờ đó phụ thuộc thứ tự sự kiện, còn so chuỗi thì không.
 */
export function syncHash(
  subscribe: (fn: () => void) => () => void,
  getState: () => HashState,
  apply: (s: Partial<HashState>, context: HashApplyContext) => void,
): () => void {
  let timer: number | undefined;
  let lastWritten = "";

  const flush = () => {
    const next = `#${serializeHash(getState(), window.location.hash)}`;
    if (next !== window.location.hash) {
      lastWritten = next;
      window.history.replaceState(null, "", next);
    }
  };

  const onHashChange = () => {
    if (window.location.hash === lastWritten) return;
    lastWritten = window.location.hash;
    const raw = window.location.hash;
    apply(parseHash(raw), { fieldPresent: params(raw).has("f") });
  };

  const unsub = subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 250);
  });
  window.addEventListener("hashchange", onHashChange);
  flush();

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("hashchange", onHashChange);
    unsub();
  };
}
