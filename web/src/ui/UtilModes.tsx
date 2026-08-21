/**
 * Đơn vị đọc KHÔNG GIAN của lens Sử dụng — `Vùng tải` | `Trạm`.
 *
 * `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §11.1.
 *
 * ── Nó KHÔNG phải một trường thứ hai ─────────────────────────────────────────────────
 *
 * Hai nút này mã hoá **cùng một đại lượng** (`Σocc / Σn_ports`) trên **cùng một thang
 * tuyệt đối**. Cái đổi là đơn vị mà đại lượng được gộp về: một vùng thống kê, hay một
 * trạm. Ràng buộc 2 ("đúng một trường được tô") không bị chạm tới — `station:occ` vẫn là
 * trường duy nhất đang tô ở cả hai chế độ.
 *
 * ── Vì sao `Vùng tải` là mặc định ────────────────────────────────────────────────────
 *
 * Đo được, không phải cảm nhận: ở z8 Hà Nội **98,45%** trạm có ít nhất một chấm khác chồng
 * lên (Web Mercator, đúng bán kính `stationFieldRadius`), z10 còn 72,68%. Một overview mà
 * gần như mọi mark đều bị che thì thứ mắt đọc được là **mật độ trạm**, không phải tỉ lệ
 * cổng bận — hai thứ không cùng dấu. `Trạm` giữ nguyên lối ép chấm ở mọi mức phóng.
 *
 * ── Vì sao nó ở CỘT ĐỌC, không nổi trên bản đồ ───────────────────────────────────────
 *
 * Wireframe §19.1 của spec vẽ nó ở góc phải bản đồ. Ở đây nó nằm đúng khe mà `DemandModes`
 * đã chiếm — cùng một loại điều khiển ("cùng dữ liệu, khác dạng hình") thì phải ở cùng một
 * chỗ, nếu không người xem phải học hai vị trí cho một khái niệm. Đây là sai khác CÓ CHỦ Ý
 * so với wireframe, và nó theo `DESIGN.md §3` (chrome dán vào cạnh, không nổi trên bản đồ).
 */

import { useStore } from "../state/store";
import { UTIL_REPRESENTATIONS, type UtilRepresentation } from "../state/types";
import { UTIL_LOD_R7_MIN_ZOOM, UTIL_STATION_MIN_ZOOM } from "../viz/util-regions";

const LABEL: Record<UtilRepresentation, { label: string; title: string }> = {
  region: {
    label: "VÙNG TẢI",
    title:
      "Gộp Σ cổng bận ÷ Σ cổng lắp đặt theo ô H3 — mức phân giải tự đổi theo zoom, và tự nhường chỗ cho chấm trạm khi phóng sâu",
  },
  station: {
    label: "TRẠM",
    title: "Ép chấm trạm ở mọi mức phóng — điểm có thể chồng nhau ở mức phóng rộng",
  },
};

export function UtilModes() {
  const representation = useStore((s) => s.utilRepresentation);
  const setRepresentation = useStore((s) => s.setUtilRepresentation);
  const zoom = useStore((s) => s.view.zoom);

  // Ở mức phóng drill-down cả hai nút cho CÙNG một hình. Nói ra, thay vì để người xem bấm
  // qua lại và kết luận rằng nút bị hỏng — cùng luật §3a đã áp cho scrubber ở trường khác.
  const atDrillDown = zoom >= UTIL_STATION_MIN_ZOOM;

  return (
    <div>
      <p className="text-note text-ink-muted">
        cùng tỉ lệ cổng bận, khác đơn vị gộp
      </p>
      <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-xs border border-hairline text-note">
        {UTIL_REPRESENTATIONS.map((id, i) => {
          const on = representation === id;
          return (
            <button
              key={id}
              title={LABEL[id].title}
              aria-pressed={on}
              onClick={() => setRepresentation(id)}
              // Ba kênh cho trạng thái ĐANG CHỌN, cùng hệt `DemandModes`: nền, chữ đậm, và
              // một nét mực 2 px ở cạnh trái. Xem chú thích ở file đó cho phép đo tương phản.
              className={`min-w-0 cursor-pointer truncate px-2 py-1.5 text-left transition-colors ${
                i === 0 ? "border-r border-hairline" : ""
              } ${
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
      <p className="mt-2 text-note leading-snug text-ink-muted">
        {atDrillDown
          ? `Ở mức phóng này (≥ ${UTIL_STATION_MIN_ZOOM}) cả hai chế độ đều vẽ chấm trạm — vùng đã nhường chỗ cho drill-down.`
          : representation === "region"
            ? `Mức phân giải theo zoom: r6 dưới ${UTIL_LOD_R7_MIN_ZOOM} · r7 · r8 · chấm trạm từ ${UTIL_STATION_MIN_ZOOM}. Đổi mức không đổi giá trị, chỉ đổi đơn vị đọc.`
            : "Ở mức phóng rộng, chấm trạm chồng lên nhau — điểm trên cùng che các trạm dưới nó."}
      </p>
    </div>
  );
}
