/**
 * Câu bắt buộc của chú giải lens Sử dụng — `UX_UTILIZATION_VISUALIZATION_SPEC` §12.3.
 *
 * ── Vì sao một khối RIÊNG, không nhét vào `Legend` ────────────────────────────────────
 *
 * `Legend` trả lời một câu: *"bậc màu này là khoảng giá trị nào"*. Nó có ba nhánh render
 * (dải bậc, dải gradient, biến thể nổi) và cả ba nói về THANG. Bốn câu dưới đây nói về
 * **phép đo**: tử số là gì, mẫu số là gì, giờ nào đang xem, coverage bao nhiêu, và màu đậm
 * KHÔNG có nghĩa gì. Nhét chúng vào cả ba nhánh là chép một hợp đồng ngữ nghĩa ra ba chỗ.
 *
 * ── Vì sao coverage phải đổi theo giờ ────────────────────────────────────────────────
 *
 * Mẫu số của utilization đổi theo giờ — đó là hệ quả trung thực của luật "trạm chưa đủ
 * quan sát không được gộp với `occ = 0`". Ở Hà Nội số cổng đóng góp chạy 6.342–7.775 qua
 * 168 giờ (81,5%–99,9% cổng đã lắp). In một badge phủ cả tuần rồi để người đọc suy ra mọi
 * giờ đều có 7.775 cổng là nói một điều dữ liệu không nói (spec §4.6).
 *
 * Hai con số, không một: coverage theo TRẠM và theo CỔNG trả lời hai câu khác nhau, và ở
 * Hà Nội chúng lệch thật (trung vị 96,48% vs 99,74%) vì trạm khuyết quan sát nghiêng về
 * phía trạm nhỏ.
 */

import { useMemo } from "react";

import { occProvinceCoverageAt, type OccProfiles } from "../viz/occ";
import { useStore } from "../state/store";
import { UTILIZATION_TICKS } from "../viz/palette";
import { UTIL_LOW_COVERAGE } from "../viz/util-regions";
import { hourBucketLabel, occTimezoneDisclosure, type OccTimezoneState } from "../viz/occ-time";
import { DOW_FULL, dowOf, hourOf } from "../state/types";

const int = (v: number) => Math.round(v).toLocaleString("vi-VN");
const pct1 = (v: number) => `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

export function UtilizationLegendNote({
  profiles,
  timezone,
}: {
  /** `null` khi hồ sơ chưa nạp xong — hai dòng phụ thuộc giờ im lặng thay vì in số 0. */
  profiles: OccProfiles | null;
  timezone: OccTimezoneState;
}) {
  /**
   * `t` được đăng ký ở ĐÂY, không ở `AtlasReadColumn` và không ở `App`.
   *
   * Khối này là LÁ, nên một tick scrubber chỉ vẽ lại bốn dòng chữ. Kéo `t` lên cột đọc sẽ
   * render lại cả cột 4 lần mỗi giây khi playback chạy, và kéo lên `App` sẽ render lại cả
   * cây — đúng hai chế độ hỏng mà cổng hiệu năng Phase 10 tồn tại để chặn.
   */
  const t = useStore((s) => s.t);
  const coverage = useMemo(
    () => (profiles ? occProvinceCoverageAt(profiles, t) : null),
    [profiles, t],
  );
  const disclosure = occTimezoneDisclosure(timezone);
  return (
    <div className="space-y-1 border-t border-hairline px-3 py-2 text-note leading-snug text-ink-2">
      <p>
        <span className="font-semibold text-ink">Tỉ lệ cổng bận</span> ={" "}
        <span className="tabular-nums">Σ cổng bận trung bình ÷ Σ cổng lắp đặt</span> tại các trạm
        đủ quan sát.
      </p>
      {/* Câu này KHÔNG tuỳ chọn (§4, §22.10). Một thang đậm dần tự nó gợi ra "quá tải", và
          bộ dữ liệu — không hàng đợi, không thời gian chờ, không SLA, không ngưỡng năng lực
          theo vùng/giờ — không nói được điều đó. Ngưỡng sàng lọc 40% trả lời một câu khác
          và không có vị trí nào trên thang này. */}
      <p>
        Màu đậm = <span className="font-semibold">tỉ lệ cao hơn</span>, không phải “quá tải”.
        Thang tuyệt đối 0–100% ({UTILIZATION_TICKS.map((v) => Math.round(v * 100)).join(" · ")}%),
        không đổi theo giờ, theo tỉnh hay theo mức phóng.
      </p>
      <p className="tabular-nums">
        Giờ đang xem: {DOW_FULL[dowOf(t)]} · {hourBucketLabel(hourOf(t), timezone)}
        {disclosure ? ` · ${disclosure.toLowerCase()}` : ""}
      </p>
      {coverage && (
        <p className="tabular-nums">
          Coverage toàn tỉnh ở giờ này: {int(coverage.observedPorts)}/{int(coverage.installedPorts)}{" "}
          cổng ({coverage.installedPorts > 0 ? pct1(coverage.observedPorts / coverage.installedPorts) : "—"})
          {" · "}
          {int(coverage.contributingStations)}/{int(coverage.allStations)} trạm (
          {coverage.allStations > 0 ? pct1(coverage.contributingStations / coverage.allStations) : "—"})
        </p>
      )}
      <p className="text-ink-muted">
        Nét đứt: coverage cổng dưới {Math.round(UTIL_LOW_COVERAGE * 100)}% · vân xám: không có giá trị ở ô giờ
        này (khác 0).
      </p>
    </div>
  );
}
