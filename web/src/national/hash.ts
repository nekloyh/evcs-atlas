/**
 * Hash của màn hình CẢ NƯỚC — thuần, test được, tách khỏi component.
 *
 * ── Vì sao KHÔNG dùng lại `state/hash.ts` ─────────────────────────────────────────────
 *
 * `state/hash.ts` là 264 dòng cho 9 khoá, và phần lớn độ dài ấy là những thứ màn hình này
 * không có: khung nhìn có pitch/bearing, ô đang chọn, cảnh + nhịp, brush ba ô, scrubber.
 * Ép một surface 2 khoá vào bộ máy 9 khoá là thêm mã chứ không bớt.
 *
 * Cái ĐÁNG dùng chung thì đã dùng chung, và đó là chỗ bản cũ hỏng: nó gõ `"tinh"` và
 * `"vn"` bằng chuỗi cứng thay vì nhập hằng từ `province.ts`. Hai chuỗi trần cho một hợp
 * đồng giữa hai màn hình là đủ để chúng trôi khỏi nhau.
 *
 * Ba thứ khác mà bản cũ (17 dòng trong `NationalApp.tsx`) thiếu, và đều sửa ở đây:
 *   · id trường lạ rơi về mặc định — trước đây có kiểm, nhưng id LỚP lạ thì không
 *   · `serialize` không được xoá khoá của người khác khỏi hash
 *   · không có test nào
 */

import { NATIONAL, PROVINCE_KEY } from "../data/province";

/** Chế độ xem — cùng từ vựng với bậc tỉnh (`state/types.ts`), cùng khoá hash `m`. */
export type NationalMode = "2d" | "3d";

export interface NationalHash {
  field: string;
  layers: Set<string>;
  mode: NationalMode;
}

/**
 * Đọc trạng thái từ một chuỗi hash.
 *
 * `knownFields` / `knownLayers` truyền vào thay vì import: giữ module này thuần và độc lập
 * với danh mục trường, nên test chạy được với một danh mục giả.
 */
export function parseNationalHash(
  hash: string,
  defaultField: string,
  knownFields: ReadonlySet<string>,
  knownLayers?: ReadonlySet<string>,
): NationalHash {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const f = p.get("f");
  const raw = (p.get("l") ?? "").split(",").filter(Boolean);
  return {
    field: f && knownFields.has(f) ? f : defaultField,
    // Id lớp lạ bị BỎ, không giữ lại: một lớp không tồn tại trong hash sẽ hiện như một nút
    // bật mà không có gì bật lên — tệ hơn là không có nút.
    layers: new Set(knownLayers ? raw.filter((x) => knownLayers.has(x)) : raw),
    // `m=4d`, `m=`, `m=3D` ⇒ 2D. Cùng luật §9 với mọi khoá khác: một ký tự gõ sai rơi về
    // mặc định, không thành màn hình lỗi. Chỉ đúng chuỗi `3d` mới bật.
    mode: p.get("m") === "3d" ? "3d" : "2d",
  };
}

/**
 * Ghi trạng thái vào hash, GIỮ NGUYÊN các khoá khác.
 *
 * Nhận `prev` thay vì đọc `window` để hàm thuần. `tinh=vn` luôn được đặt lại: nếu không,
 * thao tác đầu tiên sẽ xoá nó khỏi URL và tải lại trang là rơi về bộ Hà Nội.
 */
export function serializeNationalHash(prev: string, s: NationalHash): string {
  const p = new URLSearchParams(prev.replace(/^#/, ""));
  // Các khoá chỉ có nghĩa trong workspace tỉnh không được đi theo link toàn quốc. Vẫn giữ
  // khoá lạ của caller (`giu=nguyen` trong test), nhưng loại state đã có owner rõ ràng để
  // URL không mang hai workspace chồng lên nhau.
  for (const key of ["s", "d", "v", "p", "c", "t", "b"]) p.delete(key);
  p.set(PROVINCE_KEY, NATIONAL);
  p.set("f", s.field);
  if (s.layers.size) p.set("l", [...s.layers].sort().join(","));
  else p.delete("l");
  // 2D là mặc định ⇒ KHÔNG ghi `m=2d`. Một khoá nói lại điều mặc định đã nói chỉ làm link
  // dài ra và làm người đọc tưởng nó mang thông tin; cùng luật với `l` rỗng ngay trên.
  if (s.mode === "3d") p.set("m", "3d");
  else p.delete("m");
  return `#${p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")}`;
}
