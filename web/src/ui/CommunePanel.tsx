import { FIELDS, FIELD_BY_ID, fieldsOfUnit } from "../fields";
import type { CommuneFeature } from "../data/queries";
import { formatValue } from "./format";

/**
 * Panel XÃ — DESIGN.md §13d-B và M2.1-A.
 *
 * §13d-B đòi đơn vị xã phải "**gọi được tên** và **chỉ tay vào được**". Trước M2.1 không
 * vế nào đúng: lớp xã `pickable: false`, nhãn OSM đã tắt hết (§2a), không tooltip, ô tìm
 * kiếm chỉ lọc tên TRƯỜNG. Mentor nhìn màn hình đầu thấy **126 mảng vô danh**.
 *
 * Cùng khuôn `CellPanel` một cách có chủ ý — tiêu đề → giá trị đang xem → danh sách trường
 * → khối NGUỒN — vì hai panel trả lời cùng một câu hỏi ở hai đơn vị đọc. Khác khuôn thì
 * người dùng phải học hai lần.
 *
 * Panel này **chỉ liệt kê trường của XÃ**, đúng đối xứng với `panelRows` của panel Ô: hỏi
 * đúng bảng, hoặc đừng dựng dòng đó.
 */
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
  // Chỉ nhận trường của XÃ làm "giá trị đang xem" — đối xứng với chốt chặn ở `CellPanel`.
  // Tên cột trùng nhau giữa hai đơn vị (`population`) nên `readAs` phải được kiểm trước.
  const selected = FIELD_BY_ID.get(field);
  const current = selected?.readAs === "commune" ? selected : undefined;
  const props = feature?.properties;

  return (
    <div className="text-[12px]">
      <div className="flex items-center gap-2 border-b border-hairline px-2 py-1.5">
        <button onClick={onBack} className="cursor-pointer text-[11px] text-ink-2 hover:text-ink">
          ‹ quay lại
        </button>
        <span className="ml-auto font-mono text-[10px] text-ink-muted">xã {code}</span>
      </div>

      {!feature && (
        <p className="p-3 text-[11px] leading-snug text-ink-2">
          Không có xã nào mang mã <span className="font-mono">{code}</span>. Mã đúng hình
          dạng nhưng không thuộc Hà Nội. Chỉ panel này rỗng — trường, khung nhìn và các khoá
          còn lại của hash giữ nguyên.
        </p>
      )}

      {props && (
        <>
          <div className="border-b border-hairline px-2 py-2">
            {/* Đây là câu trả lời cho "gọi được tên": TÊN XÃ, to, đầu panel. */}
            <div className="text-[14px] font-semibold leading-tight">
              {String(props["commune_name"] ?? "—")}
            </div>
            <div className="pt-0.5 text-[11px] text-ink-muted">
              {formatValue(props["area_km2"] ?? null)} km² ·{" "}
              {formatValue(props["population"] ?? null)} người
            </div>
            {current && (
              <div className="pt-2">
                <div className="text-[11px] text-ink-2">{current.label}</div>
                <div className="text-[20px] leading-tight">
                  {formatValue(props[current.column] ?? null, current)}
                  {current.unit && props[current.column] != null && (
                    <span className="pl-1 text-[11px] text-ink-muted">{current.unit}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <section>
            <h3 className="border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
              TRƯỜNG CỦA XÃ
              <span className="pl-2 tracking-normal text-ink-muted">{fieldsOfUnit("commune").length}</span>
            </h3>
            {fieldsOfUnit("commune").map((f) => {
              // `column in props` chứ không `props[column] != null`: cột có mặt mà mang
              // `null` phải HIỆN ("không đo được" đúng nghĩa); cột không có mặt thì BIẾN
              // MẤT. Cùng luật với `panelRows` của panel Ô.
              if (!(f.column in props)) return null;
              const v = props[f.column] ?? null;
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
                  <span className={v === null ? "text-ink-muted italic" : "tabular-nums text-ink-2"}>
                    {formatValue(v, f)}
                  </span>
                </button>
              );
            })}
          </section>

          <section>
            <h3 className="border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
              ĐỊNH DANH
              <span className="pl-2 tracking-normal text-ink-muted">không bản đồ hoá</span>
            </h3>
            {(["commune_code", "commune_name", "province_name", "valid_from", "pop_source"] as const).map((c) =>
              c in props ? (
                <div
                  key={c}
                  className="flex items-baseline gap-2 border-b border-hairline px-2 py-1 text-[11px]"
                >
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{c}</span>
                  <span className="text-ink-2">{formatValue(props[c] ?? null)}</span>
                </div>
              ) : null,
            )}
          </section>

          {/* Cầu nối sang đơn vị kia: mentor đang xem một xã thường muốn soi tiếp bên trong
              nó. Không có nút này thì phải tự đoán ra rằng có công tắc ở tab TRƯỜNG. */}
          <p className="p-3 text-[11px] leading-snug text-ink-muted">
            Muốn xem bên trong xã này ở độ phân giải ô, đổi đơn vị đọc sang{" "}
            <button
              onClick={() => setField(fieldsOfUnit("cell")[0]!.id)}
              className="cursor-pointer underline decoration-dotted hover:text-ink"
            >
              Ô H3
            </button>{" "}
            rồi phóng tới z{11} — {FIELDS.filter((f) => f.readAs === "cell").length} trường ở
            đó nói về ô ~0,74 km², không về toàn xã.
          </p>
        </>
      )}
    </div>
  );
}
