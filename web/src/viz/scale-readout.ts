/**
 * Cách một THANG tự đọc mình ra chữ — đơn vị của dải, và câu khai cắt trần.
 *
 * Tồn tại vì CR 2.1 §Phase 9 mục 5, sau bản sửa của re-QA Phase 7:
 *
 * > *Clipping is disclosed wherever the clipped field is PAINTED, whether or not that
 * > surface builds a legend.*
 *
 * Điều kiện ấy đổi từ "thang được hiển thị" sang "trường bị TÔ", nên câu khai không còn là
 * tài sản của `Legend` nữa: badge cảnh cũng phải in nó, mà cảnh thì không dựng legend nào.
 * Hai bản chép tay của cùng một câu sẽ lệch nhau ở lần đổi công thức đầu tiên — đúng lỗi mà
 * QA 2.1-002 đã bắt một lần, khi legend còn tuyên bố "N bậc" trong lúc cao độ đã liên tục.
 */

import type { FieldMeta } from "../fields";
import { formatIn, scaleUnit, withDigits, type ScaledUnit } from "../units";
import type { NumericScale, Scale } from "./palette";

/**
 * Thang đơn vị của ramp đang hiện — chọn MỘT lần theo giá trị lớn nhất của thang.
 *
 * Gọi `scaleUnit` riêng cho từng ngưỡng sẽ cho ra một dải hai đơn vị (`0 · 320 · 850 ·
 * 1,4 km`), tức là bắt mắt quy đổi ngay giữa hai swatch cạnh nhau. Ngưỡng cuối là một
 * khoảng MỞ nên độ lớn thật nằm ở `max`, không ở `breaks` cuối — dùng `breaks` cuối sẽ
 * chọn thang mét cho một dải chạy tới 12 km.
 */
export function scaleOf(field: FieldMeta, s: Scale | null): ScaledUnit {
  if (!s || s.kind !== "numeric") return scaleUnit(field.unit, 0);
  // `max` quyết định ĐƠN VỊ (một dải chạy tới 21 km thì phải là km), nhưng KHÔNG được
  // quyết định số chữ số: nó là giá trị của một bậc MỞ, thường vượt xa mọi ngưỡng —
  // `dist_station_network_m` có ngưỡng cao nhất 4,3 km còn `max` là 21,2. Cho nó vào phép
  // chọn chữ số thì cả dải bị kéo về số nguyên, rồi từng ngưỡng phải nâng lẻ tẻ để khỏi
  // trùng nhau: `0 · 1 · 1,6 · 2,04 · 2,6 · 3,3 · 4`. Chọn theo NGƯỠNG cho `0 · 1 · 1,6 ·
  // 2 · 2,6 · 3,3 · 4,3`, và `max` vẫn in được trong cùng thang ấy.
  const magnitude = s.max ?? s.breaks[s.breaks.length - 1] ?? 0;
  return withDigits(scaleUnit(field.unit, magnitude), s.breaks);
}

export interface ClipDisclosure {
  /** giá trị bị kẹp ở TRẦN; `null` = không có cái nào, và khi đó **không in dòng nào** */
  over: string | null;
  /** giá trị bị kẹp ở SÀN */
  under: string | null;
}

/**
 * Câu khai cắt trần/cắt sàn của một thang màu.
 *
 * `null` khi không có gì bị kẹp: một dòng "0 ô vượt trần" là tiếng ồn, và tệ hơn, nó dạy
 * người đọc lướt qua đúng dòng mà lần sau sẽ mang một con số thật.
 *
 * `noun` là THAM SỐ, không suy ra từ `field`, vì hai bề mặt đang cố ý gọi khác nhau:
 *
 *  · **badge cảnh** truyền `unitNoun(field.readAs)` — cảnh 2 và 7 tô trường của XÃ, cảnh 3
 *    tô trường của ĐOẠN đường, và một câu đếm xã mà gọi chúng là ô thì sai.
 *  · **legend** truyền `"ô"`, GIỮ NGUYÊN chữ đã QA. Đấy là một quyết định, không phải một
 *    chỗ bỏ sót: xem chú thích tại chính call site ấy trong `ui/Legend.tsx`.
 *
 * Tham số hoá là cách để cả hai cùng đọc MỘT công thức (số, thứ tự, dấu, đơn vị của giá
 * trị) trong khi chỉ khác đúng một danh từ — thay vì hai bản chép rồi lệch dần.
 */
export function clipDisclosure(field: FieldMeta, scale: NumericScale, noun: string): ClipDisclosure {
  const unit = scaleOf(field, scale);
  const n = (v: number) => v.toLocaleString("vi-VN");
  return {
    over:
      scale.domain.nClippedHigh > 0
        ? `▲ ${n(scale.domain.nClippedHigh)} ${noun} vượt trần · lớn nhất ${formatIn(scale.domain.max, unit)}`
        : null,
    under:
      scale.domain.nClippedLow > 0
        ? `▼ ${n(scale.domain.nClippedLow)} ${noun} dưới sàn · nhỏ nhất ${formatIn(scale.domain.min, unit)}`
        : null,
  };
}
