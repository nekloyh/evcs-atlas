/**
 * Lớp trạm biến áp OSM — M5. Phần THUẦN (kiểu + hằng số mark); phần nạp ở `queries.ts`,
 * phần vẽ icon ở `viz/substation-icon.ts`. Cùng cách chia đã dùng cho POI.
 *
 * **Lớp này chỉ nói ĐÚNG MỘT điều: "ở đây có một trạm biến áp trong OSM".** Không có
 * thuộc tính nào khác được mã hoá — không màu theo công suất, không bán kính theo cấp
 * điện áp, không vòng bán kính phục vụ. DESIGN §12 gọi đích danh kVA lưới điện, và
 * DECISIONS §8 (sửa đổi) đã đưa khả năng đấu nối lưới ra ngoài phạm vi bài toán. Lớp
 * điểm này KHÔNG hồi sinh `dist_substation_m`: nó khẳng định đúng những điểm nó vẽ, còn
 * cái nó không vẽ được thì cảnh báo n nhỏ trong tab LAYER nói ra.
 */

export interface SubstationProps {
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  name: string | null;
}

export interface SubstationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SubstationProps;
}

export interface SubstationCollection {
  type: "FeatureCollection";
  features: SubstationFeature[];
}

/**
 * Bán kính chấm — HẰNG SỐ, chỉ co theo mức phóng (§4d-1, M2.1-F6).
 *
 * Cỡ nhỉnh hơn chấm trạm sạc (2 → 4,5 px) vì thứ phải đọc được ở đây là **hình dạng**
 * chứ không chỉ vị trí — cùng lý do icon POI cần 5 → 11 px. Nhưng nhỏ hơn POI: chỉ có
 * MỘT nhóm trạm biến áp, nên hình dạng chỉ phải tách khỏi 5 hình khác, không phải tách
 * 4 nhóm khỏi nhau.
 */
export function substationIconSize(zoom: number): number {
  if (zoom <= 10) return 6;
  if (zoom >= 13) return 12;
  return 6 + ((zoom - 10) / 3) * 6;
}
