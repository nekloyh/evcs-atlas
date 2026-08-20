/**
 * Phase 4 — Opportunity: Commune Rank Bars (PHASE4_VISUALIZATION.md §1.6).
 *
 * Chart ID: opportunity-commune-rank
 * Top 10 Communes ranked by known population beyond 2 km (lower bound).
 * Pinned selected Commune row when outside top 10.
 * Emits EntitySelectionSet({ kind: "commune" }) on row click.
 */

import { useState } from "react";
import type { CommuneCode, EntitySelection } from "../state/selection";
import { DEFAULT_DATASET_ID } from "../state/selection";
import { getThemePalette, seriesColorForTheme } from "../viz/palette";
import type { AnalysisTheme } from "../viz/theme";
import type { OpportunityCommuneRankModel, OpportunityRankItem } from "../viz/chart-models";
import { Readout } from "./Readout";

export function OpportunityCommuneRankBars({
  model,
  theme,
  onEntityIntent,
}: {
  model: OpportunityCommuneRankModel;
  /** Mực chuỗi = anchor `series` của theme lens đang mở (CR 4.1 §C2). */
  theme: AnalysisTheme;
  onEntityIntent?: (selection: EntitySelection) => void;
}) {
  const SERIES = seriesColorForTheme(theme);
  const SELECTED_COLOR = getThemePalette(theme).hex[6];
  const [hoverItem, setHoverItem] = useState<OpportunityRankItem | null>(null);

  const handleSelectCommune = (item: OpportunityRankItem) => {
    if (!onEntityIntent) return;
    onEntityIntent({
      datasetId: DEFAULT_DATASET_ID,
      kind: "commune",
      id: item.communeCode as CommuneCode,
    });
  };

  const renderRow = (item: OpportunityRankItem) => {
    const val = item.rankValue ?? 0;
    const barFrac = model.maxRankValue > 0 ? val / model.maxRankValue : 0;
    const isSelected = item.isSelected;
    const barColor = isSelected ? SELECTED_COLOR : SERIES;

    return (
      <button
        key={item.communeCode}
        type="button"
        onClick={() => handleSelectCommune(item)}
        onPointerEnter={() => setHoverItem(item)}
        onPointerLeave={() => setHoverItem(null)}
        onFocus={() => setHoverItem(item)}
        onBlur={() => setHoverItem(null)}
        className={`w-full group relative flex cursor-pointer items-center justify-between rounded-xs border px-1.5 py-1 text-left transition-colors ${
          isSelected
            ? "border-ink bg-basemap/80 text-ink shadow-xs"
            : "border-hairline bg-transparent text-ink-2 hover:bg-basemap/40"
        } ${item.isPinned ? "border-dashed" : ""}`}
      >
        {/* Background Bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-xs transition-all pointer-events-none opacity-20"
          style={{
            width: `${(barFrac * 100).toFixed(1)}%`,
            backgroundColor: barColor,
          }}
        />

        <div className="relative min-w-0 flex-1 pr-2 flex items-baseline gap-1.5">
          <span className="font-mono text-note font-bold text-ink-muted w-4 shrink-0">
            {item.rank ?? "—"}
          </span>
          <span className="truncate font-semibold text-note text-ink">
            {item.communeName}
          </span>
          <span className="shrink-0 text-[10px] font-mono text-ink-muted">
            {item.communeCode}
          </span>
          {item.isPinned && (
            <span className="ml-1 shrink-0 rounded-xs bg-basemap px-1 font-mono text-[9px] text-ink-muted border border-hairline">
              đang chọn
            </span>
          )}
        </div>

        <div className="relative shrink-0 text-right">
          <div>
            <span className="font-mono text-note font-bold tabular-nums text-ink">
              {item.rankValue === null ? "—" : val.toLocaleString("vi-VN")}
            </span>
            <span className="ml-1 text-[10px] text-ink-muted">dân &gt; 2km</span>
          </div>
          {/* Phủ cự ly và dân CHƯA RÕ đứng NGAY CẠNH thanh, không chỉ trong tooltip: một
              thanh thấp vì đã phủ kín khác hẳn một thanh thấp vì 40% dân chưa đo được cự
              ly, và người quét mắt qua bảng phải phân biệt được hai thứ đó (§1.6). */}
          <div className="font-mono text-[9px] tabular-nums text-ink-muted">
            phủ {item.distanceCoveragePct.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%
            {item.populationDistanceUnknown > 0 && (
              <span> · chưa rõ {item.populationDistanceUnknown.toLocaleString("vi-VN")}</span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="min-w-0 select-none space-y-1.5">
      <div className="flex items-center justify-between pb-0.5 text-note text-ink-muted">
        <span>Xã/phường (chặn dưới dân ngoài 2 km)</span>
        <span>Người ({model.totalCommunes} xã)</span>
      </div>

      <div className="space-y-1" role="group" aria-label="Bảng xếp hạng xã theo dân số ngoài 2 km">
        {model.topRanks.map((item) => renderRow(item))}

        {model.pinnedItem && (
          <div className="pt-1">
            <div className="pb-1 text-center font-mono text-[10px] text-ink-muted">
              ··· xã đang chọn ngoài top 10 ···
            </div>
            {renderRow(model.pinnedItem)}
          </div>
        )}
      </div>

      {model.nMissingRank > 0 && (
        <p className="text-note leading-snug text-ink-muted">
          {model.nMissingRank.toLocaleString("vi-VN")} xã không xếp hạng được: dân số khuyết
          hoặc chưa xã nào trong đó đo được cự ly mạng đường. Chúng KHÔNG phải xã không có
          khoảng trống — chúng là xã chưa đo.
        </p>
      )}

      <Readout hint="bấm vào xã để chọn trên bản đồ và mở chi tiết">
        {hoverItem && (
          <>
            <span className="font-semibold text-ink">
              {hoverItem.rank === null ? "Chưa xếp hạng" : `#${hoverItem.rank}`} {hoverItem.communeName}
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink">
              {hoverItem.rankValue !== null
                ? `${hoverItem.rankValue.toLocaleString("vi-VN")} dân ngoài 2 km (chặn dưới)`
                : "chưa xác định cự ly"}
            </span>
            {hoverItem.populationDistanceUnknown > 0 && (
              <>
                <span className="text-ink-muted">·</span>
                <span className="tabular-nums text-ink-2">
                  {hoverItem.populationDistanceUnknown.toLocaleString("vi-VN")} dân chưa rõ cự ly
                </span>
              </>
            )}
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              phủ cự ly {hoverItem.distanceCoveragePct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              {hoverItem.populationWithin2km.toLocaleString("vi-VN")} dân trong 2 km
            </span>
            <span className="text-ink-muted">·</span>
            <span className="tabular-nums text-ink-2">
              tổng {hoverItem.populationTotal === null ? "khuyết" : hoverItem.populationTotal.toLocaleString("vi-VN")} dân
            </span>
            {hoverItem.tieCount > 1 && (
              <>
                <span className="text-ink-muted">·</span>
                <span className="tabular-nums text-ink-2">đồng hạng {hoverItem.tieCount} xã</span>
              </>
            )}
          </>
        )}
      </Readout>
    </div>
  );
}
