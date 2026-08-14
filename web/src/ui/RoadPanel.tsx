import type { RoadSeg } from "../data/queries";
import { formatValue } from "./format";

export function RoadPanel({ id, road, loading, onBack, onOpenAccess }: { id: string; road: RoadSeg | null; loading: boolean; onBack: () => void; onOpenAccess: () => void }) {
  return <div className="text-title">
    <div className="flex items-center gap-2 border-b border-hairline px-2 py-1.5">
      <button onClick={onBack} className="cursor-pointer text-body text-ink-2 hover:text-ink">‹ quay lại</button>
      <span className="ml-auto font-mono text-note text-ink-muted">OSM way {id}</span>
    </div>
    {loading ? <p className="p-3 text-body text-ink-muted">đang nạp mạng đường…</p> : !road ? <p className="p-3 text-body text-ink-muted">Đoạn đường không thuộc tập road public-driveable đã trích.</p> : <>
      <div className="border-b border-hairline px-2 py-2"><div className="text-heading font-semibold">Đoạn đường {road.roadClass}</div><p className="pt-1 text-body text-ink-muted">OSM way đã đơn giản hoá để hiển thị; không phải graph edge hay route.</p></div>
      <div className="border-b border-hairline px-2 py-2"><span className="text-ink-muted">Khoảng cách theo mạng tới trạm gần nhất</span><div className="pt-1 text-heading font-semibold">{road.dist === null ? "không đo được" : `${formatValue(Math.round(road.dist))} m`}</div></div>
      <p className="p-2 text-body text-ink-muted">Null nghĩa là đoạn này không có nhãn khoảng cách trong mạng xe công cộng đi được; không có nghĩa là gần trạm.</p>
      <button onClick={onOpenAccess} className="m-2 cursor-pointer border border-hairline px-2 py-1 text-body text-ink-2 hover:bg-basemap">xem trên mạng đường</button>
    </>}
  </div>;
}
