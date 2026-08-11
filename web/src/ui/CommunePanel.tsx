import { FIELD_BY_ID, fieldsOfUnit, type FieldMeta } from "../fields";
import type { CommuneFeature } from "../data/queries";
import type { CellValue } from "../viz/palette";
import { formatValue } from "./format";

/** Evidence inspector for a commune; the full row is intentionally behind disclosure. */
export function CommunePanel({
  code,
  feature,
  field,
  setField,
  onBack,
}: {
  code: string;
  feature: CommuneFeature | null;
  field: string;
  setField: (id: string) => void;
  onBack: () => void;
}) {
  const selected = FIELD_BY_ID.get(field);
  const current = selected?.readAs === "commune" ? selected : undefined;
  const props = feature?.properties;
  return <div className="text-[12px]">
    <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
      <button onClick={onBack} className="cursor-pointer text-[11px] text-ink-2 hover:text-ink">‹ bỏ chọn</button>
      <span className="ml-auto font-mono text-[10px] text-ink-muted">xã {code}</span>
    </div>
    {!feature && <p className="p-3 text-[11px] text-ink-muted">Không có xã/phường này trong dataset đang mở.</p>}
    {props && <>
      <header className="border-b border-hairline px-3 py-3">
        <h2 className="text-[16px] font-semibold leading-tight">{String(props["commune_name"] ?? "—")}</h2>
        <p className="pt-0.5 text-[11px] text-ink-muted">{formatValue(props["area_km2"] as CellValue ?? null)} km² · {formatValue(props["population"] as CellValue ?? null)} người</p>
        {current && <div className="pt-2"><div className="text-[11px] text-ink-2">{current.label}</div><div className="text-[24px] leading-tight">{formatValue(props[current.column] as CellValue ?? null, current)}{current.unit && props[current.column] != null && <span className="pl-1 text-[11px] text-ink-muted">{current.unit}</span>}</div></div>}
      </header>
      <section>
        <h3 className="border-b border-hairline bg-basemap px-3 py-1 text-[11px] tracking-[0.1em] text-ink-2">BẰNG CHỨNG</h3>
        <p className="px-3 pb-1 pt-2 text-[11px] leading-snug text-ink-muted">Tách tử số, mẫu số và quality flag; không dùng tổng thô làm kết luận công bằng.</p>
        {communeEvidence(current?.lens).map((id) => {
          const f = FIELD_BY_ID.get(id);
          return f && f.column in props ? <Fact key={id} field={f} value={props[f.column] as CellValue ?? null} /> : null;
        })}
      </section>
      <section className="border-t border-hairline px-3 py-2">
        <h3 className="text-[11px] tracking-[0.1em] text-ink-2">ĐI TIẾP</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {FIELD_BY_ID.has("commune:ports_per_10k_pop") && <button onClick={() => setField("commune:ports_per_10k_pop")} className="cursor-pointer border border-hairline px-2 py-1 text-[11px] hover:bg-basemap">so sánh cổng/10k dân</button>}
          {FIELD_BY_ID.has("commune:dist_station_m_pop_weighted") && <button onClick={() => setField("commune:dist_station_m_pop_weighted")} className="cursor-pointer border border-hairline px-2 py-1 text-[11px] hover:bg-basemap">xem distance theo dân</button>}
        </div>
      </section>
      <details className="border-t border-hairline">
        <summary className="cursor-pointer px-3 py-2 text-[11px] text-ink-2">Chi tiết dữ liệu xã/phường</summary>
        {fieldsOfUnit("commune").map((f) => f.column in props ? <Fact key={f.id} field={f} value={props[f.column] as CellValue ?? null} /> : null)}
      </details>
    </>}
  </div>;
}

function Fact({ field, value }: { field: FieldMeta; value: CellValue }) {
  return <div className="flex items-baseline gap-3 border-b border-hairline px-3 py-2"><span className="min-w-0 flex-1 text-ink-muted">{field.label}</span><span className={value == null ? "italic text-ink-muted" : "tabular-nums text-ink-2"}>{formatValue(value, field)}</span></div>;
}

function communeEvidence(lens: string | undefined): string[] {
  if (lens === "access") return ["commune:population", "commune:dist_station_m_pop_weighted", "commune:ports_per_10k_pop"];
  if (lens === "supply") return ["commune:n_stations", "commune:n_ports", "commune:ports_per_10k_pop"];
  return ["commune:population", "commune:pop_density_ppkm2", "commune:ports_per_10k_pop"];
}
