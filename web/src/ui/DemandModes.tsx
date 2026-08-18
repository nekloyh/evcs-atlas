import { useStore } from "../state/store";
import { representationsFor, type DemandRepresentation } from "../state/types";

/**
 * Nhãn tiếng Việt, và chúng gọi đúng tên DẠNG HÌNH chứ không gọi tên lớp deck.gl.
 *
 * `DENSITY`/`INTENSITY`/`HYBRID` là tên trong mã nguồn, không phải tên trong đầu người đọc:
 * ai nhìn "DENSITY" cũng không đoán được đó là bản đồ đồng mức, nên hai cách đọc mạnh nhất
 * của trường dân số nằm ngay trước mắt mà vẫn coi như không có.
 *
 * `density` là **đồng mức TÔ DẢI** (isopleth), không phải đường viền trần. `ContourLayer`
 * nhận `threshold` dạng `[min, max]` nên nó tô kín khoảng giữa hai ngưỡng. Cố ý: trên nền
 * sáng của một thành phố dày, đường viền trần chồng lên nhau thành nhiễu và không mang được
 * thang màu — mà thang màu chính là thứ làm cho hình này ĐỌC ĐƯỢC ĐỊNH LƯỢNG, khác hẳn bản
 * đồ nhiệt ngay bên cạnh.
 */
const LABEL: Record<DemandRepresentation, { label: string; title: string }> = {
  hex: { label: "Ô H3", title: "Đọc giá trị của từng ô lưới — chia bậc theo ngưỡng thật" },
  density: {
    label: "ĐỒNG MỨC",
    title: "Đồng mức dân cư tô dải: gộp lên ô 3 km, ngưỡng thật, đọc được định lượng",
  },
  intensity: {
    label: "BẢN ĐỒ NHIỆT",
    title: "Tìm vùng nóng nhanh — màu phụ thuộc zoom, KHÔNG so sánh định lượng được",
  },
  bivariate: { label: "CẦU × CUNG", title: "Dân số và số cổng trong cùng một ma trận 3×3" },
  hybrid: { label: "ĐỒNG MỨC + TRẠM", title: "Đồng mức định lượng, chồng ký hiệu trạm theo số cổng" },
};

/**
 * Bộ chọn P1: representation của CÙNG một câu hỏi, không phải chọn trường thứ hai.
 *
 * Nó **không** đổi điểm nhìn. Trước đây nút `3D` ở đây gọi thẳng `setMode("3d")`, nên một
 * nút nằm trong nhóm "cách đọc" lại lật cả camera — và ở chiều ngược lại, `extrusion` vẫn
 * dựng khối khi người dùng quay về 2D. Nay danh sách này **được lọc theo `mode`** (§15a):
 * muốn xem bản đồ 3D thì đường duy nhất là nút 2D/3D ở nav rail.
 */
export function DemandModes() {
  const representation = useStore((s) => s.demandRepresentation);
  const setRepresentation = useStore((s) => s.setDemandRepresentation);
  const mode = useStore((s) => s.mode);
  const available = representationsFor(mode);

  return (
    /*
     * KHÔNG có vỏ tiết riêng — đợt 17/8/2026, §3h.
     *
     * Trước đây khối này tự mang `border-b` + `pb-3` + một nhãn `CÁCH ĐỌC` viết hoa, vì nó
     * là một tiết lạc giữa danh sách measure. Trong cột đọc nó nằm TRONG tiết CÂU HỎI, nên
     * cả hai thứ ấy thành thừa: một đường phân tiết thứ hai bên trong một tiết, và một tiêu
     * đề cấp hai cho một nhóm nút đã tự gọi tên mình. Chỉ còn dòng nói **quan hệ** giữa các
     * nút — thứ mà nhãn của chúng không nói được: cùng một dữ liệu, khác dạng hình.
     */
    <div>
      <p className="text-note text-ink-muted">
        cùng dân số, khác dạng hình · điểm nhìn {mode === "3d" ? "3D" : "2D"}
      </p>
      {/* Nút LẺ cuối chiếm cả hàng thay vì để lại một ô rỗng cạnh nó — cùng khuôn với bộ
          chuyển câu hỏi cũ. Lưới có viền ngoài, các nút chỉ kẻ vạch giữa: một hàng ô liền
          mạch đọc thành MỘT bộ chọn, còn năm nút có viền riêng đọc thành năm hành động. */}
      <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-xs border border-hairline text-note">
        {available.map((id, i) => {
          const on = representation === id;
          const wide = i === available.length - 1 && available.length % 2 === 1;
          const lastRow = i >= available.length - (available.length % 2 === 1 ? 1 : 2);
          return (
            <button
              key={id}
              title={LABEL[id].title}
              aria-pressed={on}
              onClick={() => setRepresentation(id)}
              /*
               * Trạng thái ĐANG CHỌN nói bằng BA kênh, không phải một: nền `bg-basemap`,
               * chữ đậm + mực đen, và một nét mực 2 px ở cạnh trái ô.
               *
               * Nét thứ ba không thừa. `bg-basemap` (#f2f3f0) trên `bg-panel` (#f9f9f7)
               * chênh nhau đúng 0,05 độ sáng tương đối — nó là một gợi ý, không phải một
               * tín hiệu, và trong một lưới 2 × 3 mắt phải quét cả sáu ô mới thấy ô nào
               * sẫm hơn. Một nét dọc thì bắt được bằng mắt ngoại vi trong một lượt quét.
               * Mực dùng token `--color-select` — cùng mực mà bản đồ dùng cho "đang chọn",
               * và nó vô sắc nên nó không tranh với bất kỳ ramp nào (§4b).
               */
              className={`min-w-0 cursor-pointer truncate px-2 py-1.5 text-left transition-colors ${
                wide ? "col-span-2" : i % 2 === 0 ? "border-r border-hairline" : ""
              } ${lastRow ? "" : "border-b border-hairline"} ${
                on
                  ? "bg-basemap font-semibold text-ink shadow-[inset_2px_0_0_0_var(--color-select)]"
                  : "text-ink-2 hover:bg-basemap/60"
              }`}
            >
              {LABEL[id].label}
            </button>
          );
        })}
      </div>
      {/* Danh sách một nút trông như lỗi, nên nói ra rằng nó KHÔNG phải lỗi. */}
      {available.length < 2 && (
        <p className="mt-2 text-note leading-snug text-ink-muted">
          Điểm nhìn 3D mới có một cách đọc: ô H3 dựng khối theo giá trị. Muốn cách đọc khác
          thì về 2D bằng nút ở thanh trái.
        </p>
      )}
    </div>
  );
}
