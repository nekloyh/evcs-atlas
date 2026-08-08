import { FIELDS, GROUPS, FIELD_BY_ID, constantShort } from "../fields";
import type { CellRow } from "../data/queries";
import { panelRows } from "./cell-rows";
import { formatValue } from "./format";

/**
 * Panel Ô — DESIGN.md §3c: **thay nội dung rail tại chỗ**, không phải popup, không phải
 * drawer thứ hai. Nút `‹ quay lại` đưa về tab trước.
 *
 * Đây là chỗ duy nhất 8 cột ĐỊNH DANH & XUẤT XỨ được hiện (§6) — chúng không bản đồ hoá
 * được nhưng lại là thứ cần nhất khi soi một ô cụ thể.
 */
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
  // Chỉ nhận trường của Ô làm "giá trị đang xem". `commune:population` có
  // `column === "population"` — TRÙNG một cột thật của bảng ô — nên nếu không chặn ở đây,
  // panel sẽ hiện dân số của Ô dưới nhãn "Dân số xã". Trùng tên cột giữa hai đơn vị đọc là
  // chuyện bình thường (§6b); chính vì thế chỗ nào đọc `column` cũng phải kiểm `readAs`.
  const selected = FIELD_BY_ID.get(field);
  const current = selected?.readAs === "cell" ? selected : undefined;

  return (
    <div className="text-[12px]">
      <div className="flex items-center gap-2 border-b border-hairline px-2 py-1.5">
        <button
          onClick={onBack}
          className="cursor-pointer text-[11px] text-ink-2 hover:text-ink"
        >
          ‹ quay lại
        </button>
        <span className="ml-auto font-mono text-[10px] text-ink-muted">{h3}</span>
      </div>

      {loading && <p className="p-3 text-ink-muted">đang đọc ô…</p>}

      {/* Truy vấn hỏng thì NÓI ra, không đứng im ở "đang đọc". */}
      {error && (
        <p className="p-3 text-[11px] leading-snug text-ink-2">
          Không đọc được ô: {error}
          <span className="block pt-1 text-ink-muted">
            Thường là chưa chạy <code>make web-data</code>, hoặc `web/public/data/` thiếu
            file. Các phần khác của app không phụ thuộc lần đọc này.
          </span>
        </p>
      )}

      {!loading && !error && !row && (
        <p className="p-3 text-[11px] leading-snug text-ink-2">
          Không có ô nào mang mã <span className="font-mono">{h3}</span> trong lưới. Mã đúng
          hình dạng H3 nhưng không thuộc Hà Nội. Chỉ panel này rỗng — trường, khung nhìn và
          các khoá còn lại của hash giữ nguyên.
        </p>
      )}

      {row && (
        <>
          <div className="border-b border-hairline px-2 py-2">
            <div className="text-[11px] text-ink-muted">
              {constantShort(String(row["cell_state"] ?? ""))}
              {typeof row["commune_name"] === "string" ? ` · ${row["commune_name"]}` : ""}
            </div>
            {current && (
              <div className="pt-1">
                <div className="text-[11px] text-ink-2">{current.label}</div>
                <div className="text-[20px] leading-tight">
                  {formatValue(row[current.column] ?? null, current)}
                  {current.unit && row[current.column] != null && (
                    <span className="pl-1 text-[11px] text-ink-muted">{current.unit}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {GROUPS.map((g) => {
            const rows = panelRows(FIELDS.filter((f) => f.group === g.id), row);
            // Nhóm không còn dòng nào thì KHÔNG dựng tiêu đề. Một tiêu đề trống là lời hứa
            // suông — cùng loại "nói dối bằng giao diện" mà §3a cấm ở nav.
            if (rows.length === 0) return null;
            return (
            <section key={g.id}>
              <h3 className="border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
                {g.label}
              </h3>
              {rows.map(({ field: f, value: v }) => {
                return (
                  <button
                    key={f.id}
                    onClick={() => setField(f.id)}
                    title={`tô bản đồ theo ${f.label}`}
                    className={`flex w-full cursor-pointer items-baseline gap-2 border-b border-hairline px-2 py-1 text-left text-[11px] hover:bg-basemap ${
                      f.id === field ? "bg-basemap font-semibold" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                    {/* null hiện thành chữ, không thành 0 và không thành ô trống —
                        ràng buộc 1 ở tầng chữ. */}
                    <span
                      className={
                        v === null ? "text-ink-muted italic" : "tabular-nums text-ink-2"
                      }
                    >
                      {formatValue(v, f)}
                    </span>
                  </button>
                );
              })}
            </section>
            );
          })}

          <section>
            <h3 className="border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
              ĐỊNH DANH
              <span className="pl-2 tracking-normal text-ink-muted">không bản đồ hoá</span>
            </h3>
            {(["h3_r8", "lat", "lng", "cell_state", "commune_code", "commune_name", "commune_area_frac"] as const).map(
              (c) => (
                <div
                  key={c}
                  className="flex items-baseline gap-2 border-b border-hairline px-2 py-1 text-[11px]"
                >
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{c}</span>
                  <span className="tabular-nums text-ink-2">{formatValue(row[c] ?? null)}</span>
                </div>
              ),
            )}
          </section>
        </>
      )}
    </div>
  );
}
