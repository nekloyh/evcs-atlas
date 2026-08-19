import { formatNumber } from "./format";
import type { ShowcaseRoute } from "../data/queries";

/**
 * Ba cặp tuyến minh hoạ: đường đi CÓ THẬT cạnh đoạn thẳng chim bay của cùng một ô.
 *
 * Mỗi dòng in **cả hai tên trạm**, và đó không phải trang trí: ở cả ba cặp, trạm gần nhất
 * theo mạng đường và trạm gần nhất theo đường chim bay là **hai trạm khác nhau**. Đó là
 * bằng chứng trực tiếp cho cách đọc `detour_ratio` ở tầng trường — nếu chỉ in một hệ số,
 * người đọc vẫn có thể tưởng hai cột đo cùng một đích và chỉ khác đường đi.
 *
 * Không có thẻ nào bấm được ở đây: cảnh sở hữu khung nhìn của nó (§14a luật L1), và một nút
 * bay tới trong lúc cảnh đang nói "hãy nhìn cả hành lang" là hai lệnh tranh nhau một camera.
 */
export function RoutePairs({ routes }: { routes: readonly ShowcaseRoute[] }) {
  const byCell = new Map<string, { network?: ShowcaseRoute; euclid?: ShowcaseRoute }>();
  for (const r of routes) {
    const slot = byCell.get(r.h3) ?? {};
    slot[r.kind] = r;
    byCell.set(r.h3, slot);
  }
  const pairs = [...byCell.entries()].filter(([, p]) => p.network);
  if (pairs.length === 0) return null;

  return (
    <>
      <h3 className="border-y border-hairline bg-basemap px-4 py-1 text-body tracking-[0.1em] text-ink-2">
        BA CẶP TUYẾN — ĐƯỜNG THẬT ↔ CHIM BAY
      </h3>
      {pairs.map(([h3, p]) => {
        const n = p.network!;
        return (
          <div key={h3} className="border-b border-hairline px-4 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-title font-semibold">{n.communeName}</span>
              <span className="ml-auto text-heading font-semibold tabular-nums">
                {formatNumber(n.detour)}×
              </span>
            </div>
            <div className="pt-0.5 text-body tabular-nums text-ink-2">
              đường thật {formatNumber(n.networkM)} m ↔ chim bay {formatNumber(n.euclidM)} m
            </div>
            {/* Hai TÊN TRẠM. Chúng khác nhau ở cả ba cặp — xem docstring. */}
            {(n.stationName ?? p.euclid?.stationName) && (
              <div className="pt-1 text-note leading-snug text-ink-muted">
                {n.stationName && (
                  <div>
                    gần nhất theo <strong>đường</strong>: {n.stationName}
                  </div>
                )}
                {p.euclid?.stationName && (
                  <div>
                    gần nhất theo <strong>chim bay</strong>: {p.euclid.stationName}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <p className="px-4 py-2.5 text-title leading-relaxed text-ink-2">
        Nét lạnh <strong>đậm</strong> là đường đi có thật mà Dijkstra trả về; nét lạnh{" "}
        <strong>nhạt</strong> là đoạn thẳng chim bay của cùng ô đó. Ở cả ba cặp, hai thước đo
        chỉ về <strong>hai trạm khác nhau</strong> — nên hệ số đi vòng không chỉ nói “đường
        dài hơn”, nó nói “đích cũng khác”.
      </p>
    </>
  );
}
