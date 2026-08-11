import * as React from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { unitSentence, type FieldMeta, type RuntimeCoverage } from "../../fields";
import type { Manifest } from "../../data/manifest";
import { useStore } from "../../state/store";
import type { Scale } from "../../viz/palette";
import { Legend } from "../../ui/Legend";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { AtlasSurface, AtlasSurfaceHeader } from "./AtlasSurface";

export interface FloatingLegendProps {
  field: FieldMeta;
  scale: Scale | null;
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  surfaceBreaks: number[];
}

export function FloatingLegend({
  field,
  scale,
  manifest,
  runtime,
  surfaceBreaks,
}: FloatingLegendProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const paintOn = useStore((s) => s.paintOn);
  const setPaintOn = useStore((s) => s.setPaintOn);

  return (
    <TooltipProvider>
      <AtlasSurface
        className="fixed top-3 left-18 z-20 w-[min(28rem,calc(100vw-5rem))] text-xs transition-all duration-200"
        aria-label="Chú giải bản đồ"
      >
        <AtlasSurfaceHeader className="justify-between gap-2 select-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-ink truncate text-[12px]">
              {field.label}
            </span>
            <span className="border border-hairline bg-panel px-1 font-mono text-[10px] text-ink-2">
              {field.readAs === "commune" ? "XÃ" : field.readAs === "station" ? "TRẠM" : field.readAs === "road" ? "ĐƯỜNG" : "H3"}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setPaintOn(!paintOn)}
                    aria-label={paintOn ? "Tắt lớp phủ tô màu" : "Bật lớp phủ tô màu"}
                  />
                }
              >
                {paintOn ? (
                  <Eye className="h-3.5 w-3.5 text-ink" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-ink-muted" />
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {paintOn ? "Tắt tô màu bản đồ" : "Bật lại tô màu"}
              </TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Mở rộng chú giải" : "Thu gọn chú giải"}
            >
              {collapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </AtlasSurfaceHeader>

        {/* Collapsed view summary */}
        {collapsed ? (
          <div className="px-3 py-2 text-[11px] text-ink-2 select-none">
            {unitSentence(field)}
          </div>
        ) : (
          <div className="p-3">
            <Legend
              field={field}
              scale={scale}
              manifest={manifest}
              runtime={runtime}
              surfaceBreaks={surfaceBreaks}
              variant="floating"
            />
          </div>
        )}
      </AtlasSurface>
    </TooltipProvider>
  );
}
