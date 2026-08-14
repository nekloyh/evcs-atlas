import { FIELDS, FIELD_BY_ID, constantShort } from "../fields";
import type { CellRow } from "../data/queries";
import { panelRows } from "./cell-rows";
import { formatValue } from "./format";
import type { CellValue } from "../viz/palette";
import { baseUnitPhrase } from "../units";

/** Evidence for one selected H3 cell; this is not a catalogue of grid columns. */
export function CellPanel({
  h3,
  row,
  loading,
  error,
  field,
  setField,
  onBack,
}: {
  h3: string;
  row: CellRow | null;
  loading: boolean;
  error: string | null;
  field: string;
  setField: (id: string) => void;
  onBack: () => void;
}) {
  const selected = FIELD_BY_ID.get(field);
  const current = selected?.readAs === "cell" ? selected : undefined;

  return (
    <div className="text-title">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <button onClick={onBack} className="cursor-pointer text-body text-ink-2 hover:text-ink">‹ bỏ chọn</button>
        <span className="ml-auto font-mono text-note text-ink-muted">{h3}</span>
      </div>
      {loading && <p className="p-3 text-ink-muted">đang đọc bằng chứng của ô…</p>}
      {error && <p className="p-3 text-body leading-snug text-ink-2">Không đọc được ô: {error}</p>}
      {!loading && !error && !row && <p className="p-3 text-body text-ink-muted">Ô này không có trong lưới đang mở.</p>}
      {row && (
        <>
          <header className="border-b border-hairline px-3 py-3">
            <p className="text-body text-ink-muted">
              {constantShort(String(row["cell_state"] ?? ""))}
              {typeof row["commune_name"] === "string" ? ` · ${row["commune_name"]}` : ""}
            </p>
            {current ? <Answer field={current} value={row[current.column] ?? null} /> : <p className="pt-1 text-ink-muted">Measure hiện tại không đọc trên ô H3.</p>}
          </header>

          <section>
            <h3 className="border-b border-hairline bg-basemap px-3 py-1 text-body tracking-[0.1em] text-ink-2">BẰNG CHỨNG</h3>
            <p className="px-3 pb-1 pt-2 text-body leading-snug text-ink-muted">Ba fact để kiểm tra câu hỏi hiện tại; không phải điểm số tổng hợp.</p>
            {evidenceIds(current?.lens).map((id) => {
              const f = FIELD_BY_ID.get(id);
              return f && f.column in row ? <Fact key={id} field={f} value={row[f.column] ?? null} /> : null;
            })}
          </section>

          <section className="border-t border-hairline">
            <h3 className="bg-basemap px-3 py-1 text-body tracking-[0.1em] text-ink-2">GIỚI HẠN</h3>
            <p className="px-3 py-2 text-body leading-snug text-ink-muted">
              {current?.nullMeans ?? "Đọc cùng khối nguồn ở cuối: giá trị của ô là aggregate theo H3, không phải thuộc tính của một địa điểm cụ thể."}
            </p>
          </section>

          <section className="border-t border-hairline px-3 py-2">
            <h3 className="text-body tracking-[0.1em] text-ink-2">ĐI TIẾP</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {current?.lens !== "access" && FIELD_BY_ID.has("dist_station_network_m") && (
                <button onClick={() => setField("dist_station_network_m")} className="cursor-pointer border border-hairline px-2 py-1 text-body hover:bg-basemap">xem khoảng cách mạng</button>
              )}
              {current?.lens !== "demand" && FIELD_BY_ID.has("population") && (
                <button onClick={() => setField("population")} className="cursor-pointer border border-hairline px-2 py-1 text-body hover:bg-basemap">xem dân số</button>
              )}
            </div>
          </section>

          <details className="border-t border-hairline">
            <summary className="cursor-pointer px-3 py-2 text-body text-ink-2">Chi tiết dữ liệu của ô</summary>
            {panelRows(FIELDS, row).map(({ field: f, value }) => <Fact key={f.id} field={f} value={value} compact />)}
          </details>
        </>
      )}
    </div>
  );
}

function Answer({ field, value }: { field: NonNullable<ReturnType<typeof FIELD_BY_ID.get>>; value: CellValue }) {
  return <div className="pt-2"><div className="text-body text-ink-2">{field.label}</div><div className="text-readout leading-tight">{formatValue(value, field)}{value != null && <span className="pl-1 text-body text-ink-muted">{baseUnitPhrase(field.unit)}</span>}</div></div>;
}

function Fact({ field, value, compact = false }: { field: NonNullable<ReturnType<typeof FIELD_BY_ID.get>>; value: CellValue; compact?: boolean }) {
  return <div className={`flex items-baseline gap-3 border-b border-hairline px-3 ${compact ? "py-1" : "py-2"}`}><span className="min-w-0 flex-1 text-ink-muted">{field.label}</span><span className={value == null ? "italic text-ink-muted" : "tabular-nums text-ink-2"}>{formatValue(value, field)}</span></div>;
}

function evidenceIds(lens: string | undefined): string[] {
  switch (lens) {
    case "supply": return ["n_stations", "n_ports", "power_kw_site"];
    case "access": return ["dist_station_network_m", "population", "detour_ratio"];
    case "context": return ["built_frac", "n_poi_1km", "population"];
    case "policy": return ["population", "dist_station_network_m", "n_ports"];
    default: return ["population", "pop_density_ppkm2", "n_apartment"];
  }
}
