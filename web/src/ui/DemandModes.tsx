import { useStore } from "../state/store";
import { representationsFor, type DemandRepresentation } from "../state/types";

const LABEL: Record<DemandRepresentation, { label: string; title: string }> = {
  hex: { label: "HEX", title: "Đọc giá trị từng ô H3" },
  density: { label: "DENSITY", title: "Overview định lượng với ô gộp và ngưỡng thật" },
  intensity: { label: "INTENSITY", title: "Tìm hotspot nhanh; không so sánh định lượng" },
  bivariate: { label: "CẦU×CUNG", title: "So sánh dân số và số cổng trong ma trận 3×3" },
  hybrid: { label: "HYBRID", title: "Density định lượng + ký hiệu trạm theo số cổng" },
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
    <section className="border-b border-hairline px-2 py-2">
      <div className="mb-1 flex items-baseline gap-2 text-note tracking-[0.1em] text-ink-2">
        DEMAND · P1
        <span className="tracking-normal text-ink-muted">
          cùng dân số, khác cách đọc · {mode === "3d" ? "3D" : "2D"}
        </span>
      </div>
      <div className="grid grid-cols-2 border border-hairline text-note">
        {available.map((id) => (
          <button
            key={id}
            title={LABEL[id].title}
            onClick={() => setRepresentation(id)}
            className={`cursor-pointer border-b border-r border-hairline px-1.5 py-1 text-left last:border-b-0 ${
              representation === id ? "bg-basemap font-semibold text-ink" : "text-ink-2 hover:bg-basemap/50"
            }`}
          >
            {LABEL[id].label}
          </button>
        ))}
      </div>
      {/* Danh sách một nút trông như lỗi, nên nói ra rằng nó KHÔNG phải lỗi. */}
      {available.length < 2 && (
        <p className="mt-1 text-note leading-snug text-ink-muted">
          Điểm nhìn 3D mới có một cách đọc: hex dựng khối theo giá trị. Muốn cách đọc khác
          thì về 2D.
        </p>
      )}
    </section>
  );
}
