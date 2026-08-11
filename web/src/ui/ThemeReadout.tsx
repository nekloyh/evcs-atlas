import type { FieldMeta } from "../fields";
import { useStore } from "../state/store";
import { themeFor, type AnalysisTheme } from "../viz/theme";
import { seriesColorForTheme } from "../viz/palette";

const COPY: Record<AnalysisTheme, string> = {
  demand: "built/residential nổi hơn · trạm là mốc cung",
  supply: "hạ tầng là chủ thể · đường hỗ trợ đọc vị trí",
  utilization: "telemetry và thời gian là chủ thể · nền lùi xuống",
  accessibility: "sông/rào cản nổi hơn · đường và tuyến giải thích",
  "urban-context": "landcover/POI là context · không suy ra demand",
  screening: "rule và ngưỡng là chủ thể · không phải score",
  exploration: "scene trung tính · một metric đang được tô",
};

export function ThemeReadout({ field }: { field: FieldMeta }) {
  const demand = useStore((s) => s.demandRepresentation);
  const theme = themeFor(field, demand);
  const themeColor = seriesColorForTheme(theme);
  return (
    <div className="flex items-center border-b border-hairline bg-basemap px-2 py-1 text-[10px] text-ink-2">
      <span
        className="mr-1.5 inline-block h-2 w-2 rounded-full shadow-sm"
        style={{ backgroundColor: themeColor }}
      />
      <span className="font-semibold tracking-[0.1em]">{theme.toUpperCase()}</span>
      <span className="pl-2 text-ink-muted">{COPY[theme]}</span>
    </div>
  );
}
