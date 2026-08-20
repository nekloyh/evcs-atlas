import { useEffect, useState } from "react";

import {
  NATIONAL,
  PROXY,
  countProxySets,
  currentDataset,
  loadProvinceIndex,
  switchDataset,
  type ProvinceIndexEntry,
} from "../data/province";

/**
 * Chọn BỘ DỮ LIỆU — **một `<select>` duy nhất, dùng ở cả ba màn hình**.
 *
 * ── Vì sao một, chứ không phải ba ─────────────────────────────────────────────────────
 *
 * Trước đó mỗi màn hình tự dựng một bộ điều khiển: màn hình tỉnh có `ProvincePicker`, màn
 * hình toàn quốc có một `<select>` "MỞ MỘT TỈNH" riêng, màn hình proxy có một link chữ
 * "← về bản đồ chính". Ba chỗ, ba từ vựng, và **không chỗ nào biết đủ bốn bộ**: từ toàn
 * quốc không có đường về Hà Nội, từ đâu cũng không tới được POI trừ khi gõ hash bằng tay.
 *
 * Gốc của việc đó là một cái tên: `switchProvince` nhận cả `vn` lẫn `poi` — hai giá trị
 * không phải tỉnh — nên chỗ nào cần "đi tới một bộ không phải tỉnh" đều thấy nó không
 * thuộc về mình và tự dựng lối riêng. Đổi tên thành `switchDataset` và gom về một component
 * là sửa đúng chỗ đó.
 *
 * ── Nó vừa CHUYỂN vừa CHỈ BÁO ─────────────────────────────────────────────────────────
 *
 * `value` luôn là bộ đang mở (`currentDataset`), nên ô này trả lời luôn câu "tôi đang ở
 * đâu" — thứ mà trước đây phải suy từ tiêu đề. Đó cũng là lý do nó KHÔNG được đọc
 * `PROVINCE ?? ""`: Hà Nội gốc, toàn quốc và proxy đều cho `PROVINCE === null`.
 *
 * ── Hai nhóm, và POI nằm ở nhóm khác ──────────────────────────────────────────────────
 *
 * `<optgroup>` CHẾ ĐỘ tách khỏi TỈNH vì chúng khác hạng: 34 dòng dưới là **34 bộ dữ liệu
 * cùng một khuôn**, ba dòng trên là **ba khuôn khác nhau**. Trộn chúng thành một danh sách
 * phẳng là mời người đọc tưởng POI cũng là một tỉnh — đúng cái nhầm mà cả chế độ proxy
 * được dựng ra để tránh.
 *
 * Tỉnh chưa có trong store hiện MỜ và không chọn được — luật §3a: nhìn bấm được mà bấm
 * không ra gì là nói dối bằng giao diện.
 *
 * POI thì KHÔNG, dù cũng có lúc "chưa có gì": từ khi màn hình đó nạp được file thả tay,
 * "chưa xuất tập nào" không còn là "bấm vào không ra gì" — nó là màn hình chỗ người dùng
 * đưa dữ liệu của chính họ vào. Làm mờ nó là bịt đúng cửa duy nhất mà một bản đã golive
 * có. Con số tập vẫn in ra, vì nó trả lời một câu khác: "trên đĩa đang có sẵn mấy tập".
 *
 * Chiều TỈNH vẫn không được mã hoá bằng kênh thị giác nào: xem
 * `docs/adr/0004-chieu-tinh-khong-ma-hoa-bang-kenh-thi-giac.md`.
 */
export function DatasetPicker({ readProxyCount = true }: { readProxyCount?: boolean }) {
  const [list, setList] = useState<ProvinceIndexEntry[] | null>(null);
  const [nProxy, setNProxy] = useState<number | null>(null);

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
    if (readProxyCount) void countProxySets().then(setNProxy);
  }, [readProxyCount]);

  // `currentDataset` đọc hash MỘT lần lúc render đầu và không cần theo dõi: đổi bộ là tải
  // lại trang (xem `switchDataset`), nên giá trị này là hằng trong cả vòng đời của trang.
  const now = currentDataset(window.location.hash);

  return (
    <label className="flex items-center gap-1.5 text-body text-ink-2">
      <span className="uppercase tracking-wide text-ink-muted">BỘ</span>
      <select
        value={now}
        onChange={(e) => switchDataset(e.target.value || null)}
        className="max-w-[20rem] bg-transparent text-ink outline-none"
        title="Đổi bộ dữ liệu sẽ TẢI LẠI trang — bậc màu, cột có mặt và file đã đăng ký với DuckDB đều khoá theo bộ"
      >
        <optgroup label="CHẾ ĐỘ">
          {/* Đứng ĐẦU: đây là màn hình trả lời câu hỏi đầu tiên ("cả nước ra sao"), và một
              mục nằm dưới 34 dòng tỉnh thì không ai thấy. */}
          <option value={NATIONAL}>◍ Toàn quốc — 34 tỉnh một màn hình</option>
          <option value="">▣ Hà Nội — bộ đầy đủ</option>
          {/* Ký tự dẫn lấy từ khối Geometric Shapes (U+25xx) như hai dòng trên, không lấy
              một ký hiệu toán học lạ: khối này có glyph ở gần như mọi font, còn một ô
              tofu ở đầu dòng thì trông y hệt một lỗi hiển thị. Đã thấy đúng thế với ⧗. */}
          <option value={PROXY}>
            ◇ POI — chế độ thử
            {nProxy === null ? "" : nProxy === 0 ? " (nạp file để xem)" : ` (${nProxy} tập)`}
          </option>
        </optgroup>
        {/* Không có `provinces.geojson` ⇒ bản build chỉ có bộ Hà Nội. Nhóm TỈNH biến mất,
            nhóm CHẾ ĐỘ thì KHÔNG: ba dòng trên không phụ thuộc file đó, và bản build ấy
            vẫn phải đi được sang POI. (Bản `ProvincePicker` cũ `return null` ở đây — đúng
            với một bộ chọn chỉ chọn tỉnh, sai với một bộ chọn bộ dữ liệu.) */}
        {list && (
          <optgroup label="TỈNH">
            {list.map((p) => (
              <option key={p.province_code} value={p.province_code} disabled={!p.in_store}>
                {p.province_name}
                {p.in_store ? ` — ${p.n_stations ?? 0} trạm` : " — chưa dựng"}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
