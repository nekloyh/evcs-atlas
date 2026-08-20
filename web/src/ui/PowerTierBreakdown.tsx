/**
 * Phase 4 — Supply: Power Tier Breakdown (PHASE4_VISUALIZATION.md §1.3).
 *
 * Chart ID: supply-power-tier-breakdown
 * 6 ordered tiers based on strongest installed port (power_kw_max_port) over IN stations.
 * Emits categorical `in` SUBSET filter on Station `power-tier`.
 */

import { useState } from "react";
import type { AnalysisFilter, PowerTierId } from "../state/filter";
import { POWER_TIER_ORDER } from "../state/filter";
import { DEFAULT_DATASET_ID } from "../state/selection";
import { HATCH_HEX, mutedCss, seriesColorForTheme } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import type { PowerTierRow, SupplyPowerTierModel } from "../viz/chart-models";
import { Readout } from "./Readout";

const MUTED_CSS = mutedCss();
/** Vân của cấp CHƯA RÕ — cùng mực vân null của bản đồ, không phải một mực đen gõ tay. */
const UNKNOWN_HATCH = `repeating-linear-gradient(135deg, transparent 0 3px, ${HATCH_HEX} 3px 4px)`;

export function PowerTierBreakdown({
  model,
  theme,
  onFilterIntent,
}: {
  model: SupplyPowerTierModel;
  /** Mực chuỗi = anchor `series` của theme lens đang mở (CR 4.1 §C2). */
  theme: AnalysisTheme;
  onFilterIntent?: (filter: AnalysisFilter | null) => void;
}) {
  const SERIES = seriesColorForTheme(theme);
  const [hoverRow, setHoverRow] = useState<PowerTierRow | null>(null);

  const handleToggleTier = (tierId: PowerTierId) => {
    if (!onFilterIntent) return;

    const currentSelected = model.activeFilter && model.activeFilter.entity === "station" && model.activeFilter.op === "in"
      ? new Set(model.activeFilter.values)
      : new Set<PowerTierId>(); // If no filter was active, clicking one tier isolates that tier

    const nextSelected = new Set(currentSelected);
    if (nextSelected.has(tierId)) {
      nextSelected.delete(tierId);
    } else {
      nextSelected.add(tierId);
    }

    const ordered = POWER_TIER_ORDER.filter((t) => nextSelected.has(t));
    if (ordered.length === 0 || ordered.length === POWER_TIER_ORDER.length) {
      onFilterIntent(null);
    } else {
      onFilterIntent({
        version: 1,
        mode: "subset",
        datasetId: DEFAULT_DATASET_ID,
        entity: "station",
        field: "power-tier",
        op: "in",
        values: ordered,
        missing: "explicit-category",
        source: "supply-power-tier-breakdown",
      });
    }
  };

  const isFilterActive = model.activeFilter !== null && model.activeFilter.entity === "station";

  return (
    <div className="min-w-0 select-none space-y-1.5">
      <div className="flex items-center justify-between pb-0.5 text-note text-ink-muted">
        <span>Cấp công suất cổng lớn nhất</span>
        <span>Số trạm công cộng ({model.totalInStations.toLocaleString("vi-VN")})</span>
      </div>

      <div className="space-y-1" role="group" aria-label="Bộ lọc phân cấp công suất trạm sạc">
        {model.tiers.map((tier) => {
          const barFrac = model.maxTierCount > 0 ? tier.nStations / model.maxTierCount : 0;
          const isSelected = isFilterActive ? model.selectedTierIds.has(tier.tierId) : true;
          const isUnknown = tier.tierId === "unknown";
          const barColor = isUnknown ? MUTED_CSS : isSelected ? SERIES : MUTED_CSS;

          return (
            <button
              key={tier.tierId}
              type="button"
              onClick={() => handleToggleTier(tier.tierId)}
              onPointerEnter={() => setHoverRow(tier)}
              onPointerLeave={() => setHoverRow(null)}
              onFocus={() => setHoverRow(tier)}
              onBlur={() => setHoverRow(null)}
              aria-pressed={isFilterActive && model.selectedTierIds.has(tier.tierId)}
              // Nhãn nói ra đúng thứ màu thanh nói. Nếu không, khi CHƯA lọc thì sáu nút
              // đều đọc là "không được nhấn" trong khi cả sáu thanh đều đang tô đậm —
              // người đọc bằng màn hình đọc và người nhìn nhận hai câu khác nhau.
              aria-label={`${tier.label}: ${tier.nStations.toLocaleString("vi-VN")} trạm${
                isFilterActive
                  ? model.selectedTierIds.has(tier.tierId)
                    ? " — đang trong tập lọc"
                    : " — ngoài tập lọc"
                  : " — chưa lọc, mọi cấp đang hiển thị"
              }`}
              className={`w-full group relative flex cursor-pointer items-center justify-between rounded-xs border px-1.5 py-1 text-left transition-colors ${
                isFilterActive && model.selectedTierIds.has(tier.tierId)
                  ? "border-ink bg-basemap/80 text-ink shadow-xs"
                  : isFilterActive
                  ? "border-hairline bg-transparent text-ink-muted opacity-60 hover:opacity-100"
                  : "border-hairline bg-transparent text-ink-2 hover:bg-basemap/40"
              }`}
            >
              {/* Background Bar */}
              <div
                className="absolute inset-y-0 left-0 rounded-xs transition-all pointer-events-none opacity-20"
                style={{
                  width: `${(barFrac * 100).toFixed(1)}%`,
                  backgroundColor: barColor,
                  backgroundImage: isUnknown ? UNKNOWN_HATCH : undefined,
                }}
              />

              <div className="relative min-w-0 flex-1 pr-2">
                <span className="block truncate font-mono text-note font-semibold text-ink">
                  {tier.label}
                </span>
                <span className="block truncate text-[10px] text-ink-muted">
                  {tier.desc}
                </span>
              </div>

              <div className="relative shrink-0 text-right">
                <span className="font-mono text-note font-bold tabular-nums text-ink">
                  {tier.nStations.toLocaleString("vi-VN")}
                </span>
                <span className="ml-1 text-[10px] text-ink-muted">
                  ({(tier.stationShare * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%)
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <Readout hint="bấm vào cấp công suất để lọc trạm · bấm lại để huỷ">
        {hoverRow && (
          <>
            <span className="tabular-nums font-semibold text-ink">
              {hoverRow.label} ({hoverRow.kwRange})
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink">
              {hoverRow.nStations.toLocaleString("vi-VN")} trạm
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {hoverRow.portsSum.toLocaleString("vi-VN")} cổng
              {hoverRow.portsMissingCount > 0
                ? ` · ${hoverRow.portsMissingCount.toLocaleString("vi-VN")} trạm khuyết số cổng`
                : ""}
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {Math.round(hoverRow.powerSiteKwSum).toLocaleString("vi-VN")} kW tổng vị trí
              {hoverRow.powerSiteMissingCount > 0
                ? ` · ${hoverRow.powerSiteMissingCount.toLocaleString("vi-VN")} trạm khuyết công suất vị trí`
                : ""}
            </span>
          </>
        )}
      </Readout>
    </div>
  );
}
