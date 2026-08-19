import { constantShort, type FieldMeta } from "../fields";
import type { CellValue } from "../viz/palette";

/**
 * Số cho panel Ô. Khác `formatBreak` (nhãn legend, ưu tiên ngắn): ở đây ưu tiên ĐỌC ĐÚNG,
 * nên giữ nhiều chữ số có nghĩa hơn và không rút gọn thành "ng"/"tr".
 */
export function formatNumber(v: number | null | undefined): string {
  // Thiếu phải NHÌN THẤY được, không được thành sự cố — cùng luật với ràng buộc 1 của
  // giao diện, chỉ khác là áp cho tầng hiển thị số.
  //
  // Đây từng là một crash thật: `manifest.roads` của store toàn quốc có 4 khoá, còn
  // `story/bodies.tsx` đọc `bridge_ways_shipped` và `ways_unreachable_null_dist` — hai khoá
  // chỉ bộ Hà Nội có. `undefined.toLocaleString()` ném TypeError và cảnh C trắng màn hình
  // ở `#tinh=01`, nơi `story_enabled` đang BẬT.
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (Number.isInteger(v) && a < 1e9) return v.toLocaleString("vi-VN");
  if (a >= 100) return v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  if (a >= 1) return v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const digits = Math.min(8, Math.max(2, 2 - Math.floor(Math.log10(a))));
  return v.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

/**
 * Giá trị một ô thành chữ. `null` KHÔNG BAO GIỜ thành `0` hay `—` trần: nó thành một câu
 * nói rõ đây là "không biết" hay "biết là không" — ràng buộc 1 ở tầng chữ.
 *
 * `undefined` là chuyện KHÁC HẲN `null`, và đây là chỗ phân biệt chúng:
 *   · `null`      = hàng có cột đó, cột đó không có giá trị ⇒ "không đo được" là câu ĐÚNG.
 *   · `undefined` = hàng KHÔNG CÓ cột đó ⇒ ta đang hỏi sai bảng. Giá trị có thể biết rõ ở
 *     nơi khác, nên trả "không đo được" ở đây là **nói dối** — đúng lỗi F1 đã bắt được.
 *
 * Nên `undefined` trả về một dấu hiệu ồn ào chứ không phải một câu nghe hợp lý. Cùng khuôn
 * với màu magenta của lớp hex trong `MapView`: nếu tới được đây thì là bug, và bug phải
 * nhìn thấy được. Đường đúng là ĐỪNG dựng dòng đó — xem `visibleRows` trong `CellPanel`.
 */
export function formatValue(v: CellValue, f?: FieldMeta): string {
  if (v === undefined) return "⟨không có cột này ở đây⟩";
  if (v === null) return f?.nullLabel ?? "không đo được";
  if (typeof v === "boolean") return v ? "có" : "không";
  if (typeof v === "number") return formatNumber(v);
  return constantShort(v);
}

/**
 * Phần trăm với **một** chữ số thập phân, ở mọi độ lớn.
 *
 * Khác `pct()` của `manifest.ts`, thứ bỏ phần lẻ trong khoảng giữa: ở chế độ CÂU CHUYỆN
 * phần lẻ là thông tin trên toàn dải, vì các con số ở đó được **so với nhau** trong cùng
 * một câu (28,9% và 71,0% phải cộng lại thành 100 trước mắt người đọc; "29%" và "71%" thì
 * không nói được rằng phần còn lại đã được kể ở đâu).
 */
export function pctOne(share: number): string {
  return share.toLocaleString("vi-VN", { style: "percent", maximumFractionDigits: 1 });
}
