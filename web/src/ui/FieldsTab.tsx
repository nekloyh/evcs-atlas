import { useEffect, useRef } from "react";

import {
  FIELDS,
  GROUPS,
  badgesFor,
  fieldsOfUnit,
  type FieldMeta,
  type RuntimeCoverage,
} from "../fields";
import type { Manifest } from "../data/manifest";
import type { ReadingUnit } from "../state/types";
import type { CommuneCollection } from "../data/queries";
import { serializeSelection } from "../data/h3";
import { useStore } from "../state/store";
import { Badge } from "./Badge";

/**
 * Gợi ý dưới mỗi nút — **số đến từ dữ liệu, không gõ tay** (§12, §7c).
 *
 * Chỗ này từng in "4.427 ô" trong khi lưới đã còn 4.400 (27 ô vụn `area_frac < 0,01` bị
 * loại ở `s02_grid`). Một con số sai, đang hiển thị, ngay trên điều khiển đổi nghĩa cả
 * bản đồ. Khối NGUỒN thì đúng vì nó đọc `manifest.n_cells` — đó chính là bằng chứng cho
 * quy tắc: chỗ nào đọc manifest thì tự đúng, chỗ nào gõ tay thì sai âm thầm.
 */
const UNITS: { id: ReadingUnit; label: string }[] = [
  { id: "cell", label: "Ô H3" },
  { id: "commune", label: "XÃ" },
];

function unitHint(u: ReadingUnit, manifest: Manifest | null, communes: CommuneCollection | null): string {
  if (u === "cell") {
    return manifest ? `${manifest.n_cells.toLocaleString("vi-VN")} ô ~0,74 km²` : "ô H3 ~0,74 km²";
  }
  return communes ? `${communes.features.length} xã/phường` : "xã/phường";
}

/**
 * Tab TRƯỜNG — DESIGN.md §3c và §6b.
 *
 * RADIO, không phải checkbox: đúng một trường choropleth mỗi lúc (ràng buộc 2). Ô tìm kiếm
 * lọc trên **tên cột + nhãn + mô tả** (§6), không chỉ tên cột — mentor gõ "chung cư" phải
 * ra `n_apartment`, gõ "tầng" phải ra `apartment_levels_sum`.
 *
 * Công tắc **đơn vị đọc** ở trên cùng là §6b hiện ra thành giao diện. Vì sao nó phải nhìn
 * thấy được chứ không phải một thuộc tính ẩn của từng dòng: cùng một cái tên có hai nghĩa
 * khác nhau ở hai đơn vị — `population` của ô là "người trên 0,74 km²", của xã là "người
 * trên 2–70 km²". Trộn chúng trong một danh sách phẳng là mời người dùng so hai con số
 * không cùng đơn vị.
 */
export function FieldsTab({
  field,
  setField,
  search,
  setSearch,
  manifest,
  runtime,
  communes,
}: {
  field: string;
  setField: (id: string) => void;
  search: string;
  setSearch: (s: string) => void;
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  communes: CommuneCollection | null;
}) {
  // Đơn vị đang xem đến TỪ trường đang chọn, không phải một state riêng. Hai nguồn sự thật
  // cho cùng một thứ thì sớm muộn cũng lệch nhau — và ở đây "trường đang chọn" là cái duy
  // nhất được serialize ra hash, nên nó phải là cái quyết định.
  const unit: ReadingUnit = FIELDS.find((f) => f.id === field)?.readAs ?? "cell";
  const pool = fieldsOfUnit(unit);
  const paintOn = useStore((s) => s.paintOn);
  const setPaintOn = useStore((s) => s.setPaintOn);

  const q = search.trim().toLowerCase();
  const hits = q
    ? pool.filter((f) => `${f.column} ${f.label} ${f.desc}`.toLowerCase().includes(q))
    : pool;

  // Tìm theo TÊN XÃ — §13d-B "gọi được tên". Ô tìm kiếm cũ chỉ lọc tên TRƯỜNG, nên gõ
  // "Ba Đình" ra rỗng và không có đường nào khác để tìm một xã cụ thể trên bản đồ.
  // Chỉ chạy ở đơn vị XÃ: ở đơn vị Ô, "xã" không phải thứ chọn được.
  const communeHits =
    q && unit === "commune" && communes
      ? communes.features
          .filter((f) => String(f.properties["commune_name"] ?? "").toLowerCase().includes(q))
          .slice(0, 8)
      : [];

  return (
    <div className="text-[12px]">
      {/* STICKY — F7. Công tắc này đổi NGHĨA của cả bản đồ; để nó cuộn khỏi màn hình
          khi danh sách trường dài là giấu mất điều khiển quan trọng nhất của tab.

          Nút thứ ba TẮT ở cuối — thêm sau M3.5, cho mentor xem overlay POI/trạm trên nền
          sạch không bị mặt tô che gestalt (§4d-4: overlay bao giờ cũng phải nhường mặt tô,
          nhưng mặt tô CŨNG có thể nhường overlay khi người xem chủ động chọn vậy). Nó KHÔNG
          đổi `field` — trường đang xem vẫn nguyên, chỉ phần TÔ của nó tắt (§6b, §11 M3.5). */}
      <div className="sticky top-0 z-10 flex border-b border-hairline bg-panel">
        {UNITS.map((u) => {
          const on = u.id === unit && paintOn;
          return (
            <button
              key={u.id}
              // Đổi đơn vị = chọn trường ĐẦU TIÊN của đơn vị đó, VÀ bật lại mặt tô nếu
              // đang tắt — bấm "Ô H3"/"XÃ" là một lựa chọn muốn NHÌN THẤY nó tô.
              onClick={() => {
                setField(fieldsOfUnit(u.id)[0]!.id);
                setPaintOn(true);
              }}
              className={`flex-1 cursor-pointer border-r border-hairline px-2 py-1.5 text-left ${
                on ? "bg-basemap" : "hover:bg-basemap/50"
              }`}
            >
              <span className={`block text-[11px] tracking-[0.1em] ${on ? "font-semibold text-ink" : "text-ink-2"}`}>
                {u.label}
              </span>
              <span className="block text-[10px] text-ink-muted">{unitHint(u.id, manifest, communes)}</span>
            </button>
          );
        })}
        <button
          onClick={() => setPaintOn(false)}
          title="Tắt mặt tô — chỉ còn nền và overlay (POI, trạm, ranh giới)"
          className={`flex-1 cursor-pointer px-2 py-1.5 text-left ${
            !paintOn ? "bg-basemap" : "hover:bg-basemap/50"
          }`}
        >
          <span className={`block text-[11px] tracking-[0.1em] ${!paintOn ? "font-semibold text-ink" : "text-ink-2"}`}>
            TẮT
          </span>
          <span className="block text-[10px] text-ink-muted">chỉ nền + overlay</span>
        </button>
      </div>

      <div className="border-b border-hairline p-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="tìm trong tên · nhãn · mô tả"
          className="w-full border border-hairline bg-white px-2 py-1 text-[12px] outline-none placeholder:text-ink-muted focus:border-ink-muted"
        />
        {q && (
          <div className="pt-1 text-[11px] text-ink-muted">
            {hits.length}/{pool.length} trường
            {communeHits.length > 0 && ` · ${communeHits.length} xã`}
          </div>
        )}
      </div>

      {communeHits.length > 0 && (
        <section>
          <h3 className="flex items-baseline gap-2 border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
            XÃ/PHƯỜNG
            <span className="tracking-normal text-ink-muted">bấm để mở panel</span>
            <span className="ml-auto tabular-nums text-ink-muted">{communeHits.length}</span>
          </h3>
          {communeHits.map((f) => (
            <button
              key={String(f.properties["commune_code"])}
              onClick={() =>
                useStore
                  .getState()
                  .selectCell(
                    serializeSelection({
                      kind: "commune",
                      code: String(f.properties["commune_code"]),
                    }),
                  )
              }
              className="flex w-full cursor-pointer items-baseline gap-2 border-b border-hairline px-2 py-1.5 text-left hover:bg-basemap"
            >
              <span className="min-w-0 flex-1 truncate">{String(f.properties["commune_name"])}</span>
              <span className="font-mono text-[10px] text-ink-muted">
                {String(f.properties["commune_code"])}
              </span>
            </button>
          ))}
        </section>
      )}

      {GROUPS.map((g) => {
        const rows = hits.filter((f) => f.group === g.id);
        if (rows.length === 0) return null;
        return (
          <section key={g.id}>
            <h3 className="flex items-baseline gap-2 border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
              {g.label}
              <span className="tracking-normal text-ink-muted">{g.hint}</span>
              <span className="ml-auto tabular-nums text-ink-muted">{rows.length}</span>
            </h3>
            {rows.map((f) => (
              <FieldRow
                key={f.id}
                f={f}
                selected={f.id === field}
                onSelect={() => setField(f.id)}
                manifest={manifest}
                runtime={runtime}
              />
            ))}
          </section>
        );
      })}

      {hits.length === 0 && communeHits.length === 0 && (
        <p className="p-3 text-[12px] text-ink-muted">
          Không trường nào của đơn vị {unit === "commune" ? "XÃ" : "Ô H3"} khớp “{search}”.
          {unit === "cell"
            ? " 8 cột định danh/xuất xứ (h3_r8, lat, lng, cell_state, commune_*, pop_source) cố tình không có ở đây — chúng chỉ xuất hiện trong panel Ô."
            : " Bảng xã chỉ có 8 trường bản đồ hoá được; thử đơn vị Ô H3."}
        </p>
      )}
    </div>
  );
}

function FieldRow({
  f,
  selected,
  onSelect,
  manifest,
  runtime,
}: {
  f: FieldMeta;
  selected: boolean;
  onSelect: () => void;
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
}) {
  const badges = manifest ? badgesFor(f, manifest, runtime) : [];
  const caveat = manifest ? f.caveat?.(manifest) : null;
  const ref = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // Link mentor gửi có `f=util_cell` phải mở ra thấy ngay trường đó cùng badge của nó.
  // Chờ `manifest` mới cuộn: badge làm các hàng cao thêm, cuộn trước đó thì trượt mất
  // đúng bằng chiều cao badge. Chỉ cuộn MỘT lần — bấm chọn về sau mà giật danh sách
  // dưới tay người dùng là khó chịu.
  useEffect(() => {
    if (selected && manifest && !scrolled.current) {
      scrolled.current = true;
      ref.current?.scrollIntoView({ block: "center" });
    }
  }, [selected, manifest]);

  return (
    <div
      ref={ref}
      className={selected ? "border-b border-hairline bg-basemap" : "border-b border-hairline"}
    >
      <label className="flex cursor-pointer items-start gap-2 px-2 py-1.5">
        <input
          type="radio"
          name="choropleth-field"
          checked={selected}
          onChange={onSelect}
          className="mt-0.5 accent-c5"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={selected ? "font-semibold" : ""}>{f.label}</span>
            {badges.map((b) => (
              <Badge key={b.kind + b.text} badge={b} />
            ))}
          </span>
          {/* Tên CỘT thật, không phải id có tiền tố: `commune:population` là định danh của
              app, còn thứ truy được về dữ liệu là `population` trong commune.parquet. */}
          <span className="block text-[10px] text-ink-muted">{f.column}</span>
        </span>
      </label>

      {selected && (
        <div className="space-y-1.5 px-2 pb-2 pl-7 text-[11px] leading-snug text-ink-2">
          <p>{f.desc}</p>
          {badges.map((b) => (
            <p key={b.kind} className="text-ink-muted">
              <span className="text-warn">⚠</span> {b.explain}
            </p>
          ))}
          {caveat && (
            <p className="text-ink-muted">
              <span className="text-warn">⚠</span> {caveat}
            </p>
          )}
          {f.nullMeans && <p className="text-ink-muted">{f.nullMeans}</p>}
          {f.expr && (
            <p className="text-ink-muted">
              Trường phái sinh — không phải một cột. Tính ra từ dữ liệu ngay lúc đọc; công
              thức nằm trong <code>fields.ts</code> ngay cạnh câu mô tả này.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
