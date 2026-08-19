import type { ReactNode } from "react";

import { formatNumber, pctOne } from "../ui/format";
import { AccessCurve } from "../ui/AccessCurve";
import { Heatmap168 } from "../ui/Heatmap168";
import { OpportunityCommuneRankBars } from "../ui/OpportunityCommuneRankBars";
import { PowerTierBreakdown } from "../ui/PowerTierBreakdown";
import { RoutePairs } from "../ui/RoutePairs";
import { StructureSweep } from "../ui/StructureSweep";
import { SupplyLorenz } from "../ui/SupplyLorenz";
import { LorenzChart } from "./LorenzChart";
import { Figure, Para, Pending, SoWhat, Stat } from "./parts";
import { ASSUMPTIONS, resolveMetric, type ResolveContext } from "./resolve";
import type {
  BeatSpec,
  BlockSpec,
  ClaimTemplate,
  FormatId,
  MetricRef,
  SharedFigureId,
  SubjectRow,
} from "./spec";

/**
 * TRÌNH DỰNG CHUNG của mọi cảnh — PHASE7_STORY_MODE.md §1.1.
 *
 * Trước pha này mỗi cảnh có một thân `.tsx` riêng tự đi lấy dữ liệu, và hệ quả đo được là:
 * một câu ("dân số sáu chữ số") sống sót cạnh chính con số bác nó (65.023), vì hai thứ ở
 * hai chỗ khác nhau trong cùng một file và không có gì buộc chúng khớp.
 *
 * Ở đây mọi câu đi qua đúng một hàm — `renderClaim` — và hàm đó có một luật duy nhất: **khe
 * không phân giải được thì câu biến mất**. Không `?? 0`, không "—", không câu chữ trần
 * đứng lại một mình sau khi số của nó rơi mất.
 */

// ── Định dạng: mọi số đi qua `ui/format.ts`, cảnh không tự định dạng ────────

function formatSlot(v: number, fmt: FormatId): string {
  switch (fmt) {
    case "count":
      return formatNumber(Math.round(v));
    case "number":
      return formatNumber(v);
    case "percent":
    case "percent1":
      return pctOne(v);
    case "multiple":
      return `${formatNumber(v)}×`;
    case "meters":
      return `${formatNumber(Math.round(v))} m`;
    case "km":
      return `${formatNumber(v / 1000)} km`;
    case "quantile":
      return formatNumber(v * 100);
  }
}

function assumptionText(id: keyof typeof ASSUMPTIONS): string {
  const a = ASSUMPTIONS[id];
  if (Array.isArray(a.value)) {
    return a.value.map((q) => `p${formatNumber((q as number) * 100)}`).join(" · ");
  }
  const v = a.value as number;
  switch (a.fmt) {
    case "meters":
      return `${formatNumber(v)} m`;
    case "km":
      return `${formatNumber(v / 1000)} km`;
    case "multiple":
      return `${formatNumber(v)}×`;
    case "zoom":
      return `${formatNumber(v)} bậc phóng`;
    default:
      return a.unit ? `${formatNumber(v)} ${a.unit}` : formatNumber(v);
  }
}

// ── Câu ─────────────────────────────────────────────────────────────────────

/**
 * Một `ClaimTemplate` thành React, hoặc `null`.
 *
 * `null` nghĩa là **câu này không được render**. Đó là luật R5 ở dạng thi hành được: chỗ
 * gọi không có cách nào "xử lý mềm" một khe thiếu, vì nó không nhận được nửa câu.
 */
export function renderClaim(tpl: ClaimTemplate, ctx: ResolveContext, key: string): ReactNode | null {
  const out: ReactNode[] = [];
  let i = 0;
  for (const part of tpl.parts) {
    const idx = i++;
    if (typeof part === "string") {
      out.push(part);
      continue;
    }
    if ("em" in part) {
      out.push(<strong key={`${key}-${idx}`}>{part.em}</strong>);
      continue;
    }
    const v = resolveMetric(part.slot, ctx);
    const required = tpl.required === undefined || tpl.required.includes(idx);
    if (v === null) {
      if (required) return null;
      continue;
    }
    out.push(
      <span key={`${key}-${idx}`} className="tabular-nums">
        {formatSlot(v, part.fmt)}
        {part.unit ? ` ${part.unit}` : ""}
      </span>,
    );
  }
  return <>{out}</>;
}

// ── Hình dùng chung ─────────────────────────────────────────────────────────

/**
 * Một khe hình → chính component mà workspace dùng, nhận chính model object ấy.
 *
 * Không component nào ở đây do `story/` sở hữu; cảnh mượn, không rẽ nhánh. Model chưa dựng
 * được thì khe **trống**, không phải một khung rỗng có trục — một biểu đồ rỗng đọc thành
 * "đo rồi, không có gì", mà sự thật là "chưa đo".
 */
function FigureSlot({ id, ctx }: { id: SharedFigureId; ctx: ResolveContext }) {
  const models = ctx.models;
  switch (id) {
    case "lorenz-area-pop": {
      const l = models["lorenz-area-pop"]?.["curve"];
      return l ? <LorenzChart data={l as never} /> : null;
    }
    case "structure-sweep": {
      const m = models["spatial-structure"];
      return m && m.steps.length > 0 ? <StructureSweep model={m} /> : null;
    }
    case "supply-lorenz": {
      const eq = models["supply-equity"]?.["equity"];
      return eq ? <SupplyLorenz data={eq as never} /> : null;
    }
    case "route-pairs": {
      const routes = ctx.pkg.routes;
      return routes && routes.length > 0 ? <RoutePairs routes={routes} /> : null;
    }
    case "access-curve": {
      const curve = models["access-curve"]?.["curve"];
      return curve ? <AccessCurve model={curve as never} /> : null;
    }
    case "opportunity-rank": {
      const m = models["opportunity-rank"]?.["model"];
      return m ? <OpportunityCommuneRankBars model={m as never} /> : null;
    }
    case "utilization-week": {
      const m = models["utilization-week"];
      if (!m) return null;
      const heat = m["model"] as { cells: never[] } | undefined;
      const t = m["peakT"];
      return heat && heat.cells.length > 0 ? (
        <Heatmap168 cells={heat.cells} scale={null} t={typeof t === "number" ? t : 0} />
      ) : null;
    }
    case "power-tier": {
      const m = models["power-tier"]?.["model"];
      return m ? <PowerTierBreakdown model={m as never} /> : null;
    }
  }
}

// ── Thẻ đối tượng ───────────────────────────────────────────────────────────

function SubjectCard({
  which,
  why,
  rows,
  ctx,
}: {
  which: number;
  why: ClaimTemplate;
  rows: readonly SubjectRow[];
  ctx: ResolveContext;
}) {
  const subject = ctx.subjects[which];
  // Đối tượng chưa phân giải ⇒ KHÔNG có thẻ. Một thẻ "—" ở đây là một khẳng định rằng có
  // một nơi như thế và ta chỉ chưa biết số của nó; sự thật là ta chưa biết có nơi nào.
  if (!subject?.facts) return null;
  const whyNode = renderClaim(why, ctx, `why-${which}`);
  const cells: ReactNode[] = [];
  rows.forEach((r, i) => {
    const v = resolveMetric({ src: "subject", which, select: r.select } as MetricRef, ctx);
    // Khe không phân giải ⇒ dòng BIẾN MẤT. Thẻ "không có cổng nào" vì thế không in bội số
    // trung vị: một tỉ số với tử số bằng 0 không so được với một tỉ số.
    if (v === null) return;
    cells.push(
      <span key={i}>
        <span className="text-display font-semibold">{formatSlot(v, r.fmt)}</span>
        <span className="pl-1 text-note text-ink-muted">{r.unit}</span>
      </span>,
    );
  });

  return (
    <div className="border-b border-hairline px-4 py-3">
      <div className="text-heading font-semibold">{subject.name}</div>
      {whyNode && <div className="pt-1 text-body leading-snug text-ink-2">{whyNode}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 tabular-nums">{cells}</div>
    </div>
  );
}

// ── Khối ────────────────────────────────────────────────────────────────────

function Block({ block, ctx, k }: { block: BlockSpec; ctx: ResolveContext; k: string }) {
  switch (block.kind) {
    case "figure": {
      const v = resolveMetric(block.value, ctx);
      if (v === null) return null;
      const caption = renderClaim(block.caption, ctx, `${k}-cap`);
      if (caption === null) return null;
      return <Figure value={formatSlot(v, block.fmt)} unit={block.unit} caption={caption} />;
    }
    case "stat": {
      const v = resolveMetric(block.value, ctx);
      if (v === null) return null;
      const label = renderClaim(block.label, ctx, `${k}-lab`);
      if (label === null) return null;
      return (
        <Stat
          label={label}
          value={`${formatSlot(v, block.fmt)}${block.unit ? ` ${block.unit}` : ""}`}
        />
      );
    }
    case "rule-output": {
      const v = resolveMetric(block.value, ctx);
      if (v === null) return null;
      const label = renderClaim(block.label, ctx, `${k}-lab`);
      if (label === null) return null;
      return (
        <Stat
          label={
            <>
              {label}{" "}
              <span className="text-note tracking-[0.08em] text-ink-muted">ĐẦU RA CỦA LUẬT</span>
            </>
          }
          value={`${formatSlot(v, block.fmt)}${block.unit ? ` ${block.unit}` : ""}`}
        />
      );
    }
    case "para": {
      const text = renderClaim(block.text, ctx, `${k}-p`);
      return text === null ? null : <Para>{text}</Para>;
    }
    case "so-what": {
      const text = renderClaim(block.text, ctx, `${k}-sw`);
      return text === null ? null : <SoWhat>{text}</SoWhat>;
    }
    case "assumption": {
      const note = renderClaim(block.note, ctx, `${k}-a`);
      return (
        <div className="border-b border-hairline bg-basemap/40 px-4 py-2.5">
          <div className="flex items-baseline gap-2 text-body">
            {/* Chữ *giả định* đứng cạnh GIÁ TRỊ, không đứng trong một chú thích cuối cột:
                luật R4 nói giá trị và tư cách của nó phải đọc được cùng một lúc. */}
            <span className="text-note font-semibold tracking-[0.1em] text-ink-muted">
              GIẢ ĐỊNH
            </span>
            <span className="tabular-nums font-semibold text-ink">
              {assumptionText(block.id)}
            </span>
            <span className="min-w-0 flex-1 text-ink-2">{ASSUMPTIONS[block.id].what}</span>
          </div>
          {note && <div className="pt-1.5 text-body leading-snug text-ink-2">{note}</div>}
        </div>
      );
    }
    case "subject-card":
      return (
        <SubjectCard which={block.which} why={block.why} rows={block.rows} ctx={ctx} />
      );
    case "figure-slot":
      return <FigureSlot id={block.id} ctx={ctx} />;
    case "heading":
      return (
        <h3 className="border-y border-hairline bg-basemap px-4 py-1 text-body tracking-[0.1em] text-ink-2">
          {block.text}
        </h3>
      );
  }
}

// ── Thân một nhịp ───────────────────────────────────────────────────────────

export function BeatBody({
  beat,
  ctx,
  loading,
}: {
  beat: BeatSpec;
  ctx: ResolveContext | null;
  loading: string | null;
}) {
  // Chưa có bối cảnh = chưa có gói. Không khối nào render, và dòng "đang đo" là toàn bộ
  // sự thật mà màn hình được phép nói lúc đó.
  if (!ctx) return loading ? <Pending label={loading} /> : null;
  return (
    <>
      {/* Chờ ≠ trống, và ≠ 0. Trong lúc một mô hình chưa dựng xong thì các khối của nó
          VẮNG MẶT (luật R5), nên nếu không có dòng này người xem sẽ đọc một cảnh nửa vời
          thành một cảnh đầy đủ. Dòng này biến mất ngay khi dữ liệu của nhịp về đủ. */}
      {loading && <Pending label={loading} />}
      {beat.blocks.map((b, i) => (
        <Block key={`${beat.id}-${i}`} block={b} ctx={ctx} k={`${beat.id}-${i}`} />
      ))}
    </>
  );
}
