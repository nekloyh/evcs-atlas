import { formatNumber } from "./format";
import type { SpatialStructureModel } from "../viz/chart-models";

/**
 * Số vùng dày RỜI NHAU theo từng lát cắt — hình của `buildSpatialStructureModel`.
 *
 * Là bậc thang chứ không phải đường: bốn lát cắt là bốn **lựa chọn rời rạc**, không phải
 * bốn điểm lấy mẫu của một hàm liên tục. Nối chúng bằng một đường là mời người đọc nội suy
 * "ở phân vị 93 thì có bao nhiêu vùng", mà con số ấy chưa ai tính.
 *
 * Thanh nền là số ô còn lại sau lát cắt; thanh đậm là phần thuộc **vùng lớn nhất**. Đó mới
 * là luận điểm: ở mọi lát cắt vẫn chỉ có một lõi, phần còn lại là đốm.
 */
export function StructureSweep({ model }: { model: SpatialStructureModel }) {
  const maxCells = Math.max(...model.steps.map((s) => s.nCells), 1);
  return (
    <div className="border-b border-hairline px-4 py-3">
      <table className="w-full text-body tabular-nums">
        <thead>
          <tr className="text-note tracking-[0.08em] text-ink-muted">
            <th className="pb-1 text-left font-normal">lát cắt</th>
            <th className="pb-1 text-right font-normal">ngưỡng</th>
            <th className="pb-1 text-right font-normal">ô</th>
            <th className="pb-1 text-right font-normal">vùng</th>
          </tr>
        </thead>
        <tbody>
          {model.steps.map((s) => {
            const w = (s.nCells / maxCells) * 100;
            const core = s.nCells > 0 ? (s.largestComponentCells / s.nCells) * w : 0;
            return (
              <tr key={s.q} className="border-t border-hairline/60">
                <td className="py-1 text-ink-2">
                  p{formatNumber(s.q * 100)}
                </td>
                <td className="py-1 text-right text-ink-2">{formatNumber(s.threshold)}</td>
                <td className="py-1 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="relative inline-block h-1.5 w-16 bg-hairline align-middle">
                      <span
                        className="absolute left-0 top-0 h-full bg-c2"
                        style={{ width: `${w}%` }}
                      />
                      <span
                        className="absolute left-0 top-0 h-full bg-c5"
                        style={{ width: `${core}%` }}
                      />
                    </span>
                    <span>{formatNumber(s.nCells)}</span>
                  </div>
                </td>
                <td className="py-1 text-right font-semibold">{formatNumber(s.nComponents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pt-2 text-note leading-snug text-ink-muted">
        Thanh nhạt là số ô còn lại sau lát cắt; phần đậm là số ô thuộc <strong>vùng lớn
        nhất</strong>. Cột cuối là số vùng rời nhau — nó là thứ đổi theo lát cắt.
      </p>
    </div>
  );
}
