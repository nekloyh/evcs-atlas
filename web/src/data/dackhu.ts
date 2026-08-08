/**
 * Nhãn ĐẶC KHU trên bản đồ — 13 đơn vị hành chính ngoài khơi, trong đó có **Hoàng Sa** và
 * **Trường Sa**.
 *
 * ── Vì sao cần ────────────────────────────────────────────────────────────────────────
 *
 * Hình học của chúng ĐÃ có trong `commune.geojson` và đã được vẽ đúng: Đặc khu Hoàng Sa là
 * 39 mảnh trong ranh giới Thành phố Đà Nẵng, Đặc khu Trường Sa nằm trong Tỉnh Khánh Hòa.
 * Nhưng ở mức phóng vừa khít một tỉnh, mỗi đảo chỉ chiếm **1–3 pixel** trên nền biển xám,
 * và không có nhãn nào. Người xem mở Đà Nẵng lên thì thấy một dải đất liền có màu và một
 * vùng biển trống — hai quần đảo có mặt trong dữ liệu nhưng **không có mặt trong cái nhìn
 * thấy**. Với một bản đồ Việt Nam, đó không phải một khiếm khuyết thẩm mỹ.
 *
 * Nhãn là kênh đúng cho việc này chứ không phải màu hay cỡ mark: thứ đang thiếu là **tên**
 * — "chỗ này là Hoàng Sa, và nó thuộc Đà Nẵng" — chứ không phải một giá trị. Phóng to lên
 * thì hình học đã tự nói phần còn lại.
 *
 * ── Vì sao theo `commune_kind`, không theo tên ────────────────────────────────────────
 *
 * Luật là "đơn vị hành chính hải đảo thì được gọi tên", đọc từ `commune_kind = DAC_KHU` do
 * VNSDI phát — **không** phải một danh sách tên gõ trong TS. Danh sách gõ tay sẽ lệch khỏi
 * niên bản địa giới ngay lần sáp nhập sau, và nó biến một sự thật của dữ liệu thành một ý
 * kiến của mã. Bộ Hà Nội không có `commune_kind` ⇒ hàm này trả rỗng và không có gì đổi.
 *
 * ── Neo nhãn ở TÂM BBOX của cả cụm ────────────────────────────────────────────────────
 *
 * Không phải trọng tâm mảnh lớn nhất: Hoàng Sa là 39 mảnh rải trên ~200 km, và đặt tên lên
 * đảo lớn nhất là gọi tên MỘT đảo chứ không phải cả quần đảo. Tâm bbox rơi vào giữa cụm —
 * đúng quy ước đặt nhãn quần đảo, và nó không khẳng định gì về một hòn đảo cụ thể nào.
 */

import type { CommuneCollection, CommuneGeometry } from "./queries";

export const DAC_KHU = "DAC_KHU";

export interface DacKhuLabel {
  name: string;
  /** [lng, lat] — tâm bbox của toàn cụm. */
  at: [number, number];
  /** số mảnh rời của cụm; dùng cho `title`/kiểm tra, không vẽ. */
  parts: number;
}

function bboxOf(g: CommuneGeometry): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const rings = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of rings) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x! < w) w = x!;
        if (x! > e) e = x!;
        if (y! < s) s = y!;
        if (y! > n) n = y!;
      }
    }
  }
  return [w, s, e, n];
}

function partsOf(g: CommuneGeometry): number {
  return g.type === "Polygon" ? 1 : g.coordinates.length;
}

/** Nhãn của mọi đặc khu trong bộ đang mở, theo thứ tự xuất hiện. Rỗng nếu bộ không có. */
export function dacKhuLabels(fc: CommuneCollection): DacKhuLabel[] {
  const out: DacKhuLabel[] = [];
  for (const f of fc.features) {
    if (f.properties["commune_kind"] !== DAC_KHU) continue;
    const name = f.properties["commune_name"];
    if (typeof name !== "string") continue;
    const [w, s, e, n] = bboxOf(f.geometry);
    if (!Number.isFinite(w)) continue;
    out.push({ name, at: [(w + e) / 2, (s + n) / 2], parts: partsOf(f.geometry) });
  }
  return out;
}
