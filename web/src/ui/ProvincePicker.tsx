import { useEffect, useState } from "react";

import {
  NATIONAL,
  PROVINCE,
  loadProvinceIndex,
  switchProvince,
  type ProvinceIndexEntry,
} from "../data/province";

/**
 * Chọn tỉnh — **một `<select>`, không phải một bản đồ chọn tỉnh**.
 *
 * Đây là chỗ chiều TỈNH xuất hiện trên màn hình, và nó cố ý xuất hiện bằng CHỮ. Ba kênh
 * thị giác đã hết hoặc đã hẹn (hue đầy từ M3.5, hình dạng gần cạn ở M5, nét đứt hẹn cho
 * trạng thái trạm, vân hẹn cho overlay vùng), nhưng lý do thật không phải là hết kênh:
 * **vị trí đã mã hoá tỉnh một cách hoàn hảo** — 34 tỉnh rời nhau theo định nghĩa. Thêm một
 * kênh nữa cho tỉnh là mã hoá trùng, tốn một kênh khan hiếm để nói lại điều bản đồ đã nói.
 *
 * Xem `docs/adr/0004-chieu-tinh-khong-ma-hoa-bang-kenh-thi-giac.md`.
 *
 * Tỉnh chưa có trong store hiện MỜ và không chọn được — cùng luật §3a với nav "chưa dựng":
 * nhìn bấm được mà bấm không ra gì là nói dối bằng giao diện.
 */
export function ProvincePicker() {
  const [list, setList] = useState<ProvinceIndexEntry[] | null>(null);

  useEffect(() => {
    void loadProvinceIndex().then((idx) =>
      setList(
        idx
          ? idx.features
              .map((f) => f.properties)
              .sort((a, b) => a.province_name.localeCompare(b.province_name, "vi"))
          : null,
      ),
    );
  }, []);

  // Không có `provinces.geojson` ⇒ bản build chỉ có bộ Hà Nội. Không hiện gì cả: một ô chọn
  // rỗng là một lời hứa hụt.
  if (!list) return null;

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
      <span className="uppercase tracking-wide text-ink-muted">TỈNH</span>
      <select
        value={PROVINCE ?? ""}
        onChange={(e) => switchProvince(e.target.value || null)}
        className="bg-transparent text-ink outline-none"
        title="Đổi tỉnh sẽ TẢI LẠI trang — bậc màu, cột có mặt và file đã đăng ký với DuckDB đều theo tỉnh"
      >
        {/* Đứng ĐẦU danh sách, trên cả Hà Nội: đây là màn hình trả lời câu hỏi đầu tiên
            ("cả nước ra sao"), và một mục nằm dưới 34 dòng tỉnh thì không ai thấy. */}
        <option value={NATIONAL}>◍ Toàn quốc — 34 tỉnh một màn hình</option>
        <option value="">Hà Nội — bộ đầy đủ</option>
        {list.map((p) => (
          <option key={p.province_code} value={p.province_code} disabled={!p.in_store}>
            {p.province_name}
            {p.in_store ? ` — ${p.n_stations ?? 0} trạm` : " — chưa dựng"}
          </option>
        ))}
      </select>
    </label>
  );
}
