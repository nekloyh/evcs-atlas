import { useStore } from "../state/store";
import type { DemandRepresentation } from "../state/types";

const MODES: { id: DemandRepresentation; label: string; title: string }[] = [
  { id: "hex", label: "HEX", title: "Đọc giá trị từng ô H3" },
  { id: "density", label: "DENSITY", title: "Overview định lượng với ô gộp và ngưỡng thật" },
  { id: "extrusion", label: "3D", title: "Độ cao mã hoá dân số trong focused 3D" },
  { id: "intensity", label: "INTENSITY", title: "Tìm hotspot nhanh; không so sánh định lượng" },
  { id: "bivariate", label: "CẦU×CUNG", title: "So sánh dân số và số cổng trong ma trận 3×3" },
  { id: "hybrid", label: "HYBRID", title: "Density định lượng + ký hiệu trạm theo số cổng" },
];

/** Bộ chọn P1: representation của CÙNG một câu hỏi, không phải chọn trường thứ hai. */
export function DemandModes() {
  const representation = useStore((s) => s.demandRepresentation);
  const setRepresentation = useStore((s) => s.setDemandRepresentation);
  const setMode = useStore((s) => s.setMode);

  return (
    <section className="border-b border-hairline px-2 py-2">
      <div className="mb-1 flex items-baseline gap-2 text-[10px] tracking-[0.1em] text-ink-2">
        DEMAND · P1
        <span className="tracking-normal text-ink-muted">cùng dân số, khác cách đọc</span>
      </div>
      <div className="grid grid-cols-2 border border-hairline text-[10px]">
        {MODES.map((m) => (
          <button
            key={m.id}
            title={m.title}
            onClick={() => {
              setRepresentation(m.id);
              if (m.id === "extrusion") setMode("3d");
            }}
            className={`cursor-pointer border-b border-r border-hairline px-1.5 py-1 text-left last:border-b-0 ${
              representation === m.id ? "bg-basemap font-semibold text-ink" : "text-ink-2 hover:bg-basemap/50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </section>
  );
}
