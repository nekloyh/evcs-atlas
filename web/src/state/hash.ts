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

import { FIELD_BY_ID } from "../fields";
import { parseSelection } from "../data/h3";
import { overlayUnavailable } from "../data/overlays";
import { parseScene } from "../story/scenes";
import { brushCount, parseBrush, serializeBrush } from "./brush";
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

/**
 * Phân tích một chuỗi hash. Mỗi khoá được kiểm riêng; khoá hỏng bị bỏ, khoá khác vẫn dùng.
 *
 * Hàm thuần trên chuỗi (không đụng `window`) để test được — §12. `readHash()` là lớp mỏng
 * đọc `location.hash` rồi gọi nó.
 */
export function parseHash(hash: string): Partial<HashState> {
  const p = params(hash);
  const out: Partial<HashState> = {};

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

  // Khoá `c` mang MỘT đối tượng: ô (`h3_r8`) hoặc xã (`commune:<mã 5 số>`) — M2.1-A.
  // Chỉ kiểm HÌNH DẠNG; đối tượng không có thật bị bỏ khi truy vấn trả rỗng.
  //
  // Đọc cả trong chế độ CÂU CHUYỆN: `c` là thứ người xem chọn BÊN TRONG một cảnh (cảnh B
  // gọi tên từng xã), không phải thứ cảnh áp đặt — nên nó không tranh chấp với `s` (§9a).
  const c = p.get("c");
  if (c && parseSelection(c)) out.cell = c;

  // ── Khoá do CẢNH quyết định khi `s` có mặt (§9a) ──────────────────────────────
  //
  // Đọc chúng ở đây thì một hash như `#s=di-vong&f=population` có hai nguồn sự thật cho
  // cùng một thứ, và không có câu trả lời đúng nào cho việc nên tin bên nào. Bỏ hẳn.
  //
  // `t`/`b` cũng nằm trong nhóm này (§9b): dock và scrubber KHÔNG dựng trong CÂU CHUYỆN
  // (§3d-1), nên đọc chúng là nạp trạng thái cho một bộ điều khiển không tồn tại.
  if (scene) return out;

  const f = p.get("f");
  if (f && FIELD_BY_ID.has(f)) out.field = f;

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
    // Overlay KHÔNG DỰNG ĐƯỢC trên bộ đang mở cũng bị bỏ ở đây, cùng một nhánh với ID lạ:
    // `#tinh=04&l=substations` sẽ bật một công tắc mà bản đồ không đổi gì, và một công tắc
    // bật mà không có gì xảy ra là §3a — giao diện nói dối. Bỏ được ngay ở đây (thay vì dọn
    // state sau khi manifest về) là nhờ `main.tsx` đặt cờ trước khi `store.ts` đọc hash.
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

  // `b` — brush của dock. Bộ kiểm ở bậc MỆNH ĐỀ nằm trong `parseBrush` (§9b): mệnh đề hỏng
  // bị bỏ riêng nó, các brush còn lại vẫn sống. Ở đây chỉ còn một quyết định: `b` mà không
  // mệnh đề nào sống sót thì coi như khoá vắng mặt — "nói rác" và "không nói gì" cho ra
  // cùng một trạng thái, nên chúng phải cho cùng một kết quả.
  const bRaw = p.get("b");
  if (bRaw !== null) {
    const b = parseBrush(bRaw);
    if (brushCount(b) > 0) out.brush = b;
  }

  return out;
}

/** Đọc hash hiện tại của trang. */
export function readHash(): Partial<HashState> {
  return parseHash(window.location.hash);
}

/** Chuỗi hash của một state, kèm các khoá để dành lấy từ `prev`. Hàm thuần — test được. */
export function serializeHash(s: HashState, prev = ""): string {
  const p = new URLSearchParams();
  // `tinh` được CHÉP LẠI từ hash cũ, và nó là khoá đầu tiên.
  //
  // Nó không nằm trong `HashState` vì nó không phải một phần của trạng thái xem: nó chọn
  // BỘ DỮ LIỆU, và đổi nó là tải lại trang (xem `data/province.ts`). Nhưng nó vẫn phải sống
  // sót mỗi lần ghi hash — nếu không, thao tác đầu tiên của người dùng (kéo bản đồ) sẽ xoá
  // nó khỏi URL và lần tải lại tiếp theo âm thầm về Hà Nội. Đây đúng là trường hợp mà
  // tham số `prev` được giữ lại để chờ.
  const tinh = new URLSearchParams(prev.replace(/^#/, "")).get("tinh");
  if (tinh) p.set("tinh", tinh);
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
    const b = serializeBrush(s.brush);
    if (b) p.set("b", b);
  }
  if (s.cell) p.set("c", s.cell);

  // Không encode `,` và `:` — hash là thứ mentor đọc và gửi cho nhau; `%2C`/`%3A` chỉ
  // làm nó xấu đi và cả hai ký tự đều hợp lệ trong fragment. `:` cần cho `commune:` (§6b)
  // và cho phần của mệnh đề `b`; `,` cho `l` và cho phân cách mệnh đề.
  //
  // `.` và `-` KHÔNG cần bỏ encode — chúng nằm trong tập ký tự an toàn của
  // `URLSearchParams`, nên `..` của khoảng và số âm của biên (§9b) đi ra nguyên vẹn.
  return p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
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
  apply: (s: Partial<HashState>) => void,
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
    apply(parseHash(window.location.hash));
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
