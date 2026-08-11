import { useStore } from "../state/store";
import type { BasemapStyle, OverlayId } from "../state/types";
import { pct, type Manifest } from "../data/manifest";
import { overlayUnavailableIn } from "../data/overlays";
import { POI_BLOCK_HEIGHT_M, POI_GROUPS, type PoiShape } from "../data/poi";
import { COLD_HEX, HATCH_HEX } from "../viz/palette";

/**
 * Tab LAYER — DESIGN.md §3c và §4d.
 *
 * **Checkbox**, bật tắt tự do — khác hẳn tab TRƯỜNG vốn là radio. Sự khác nhau đó là chính
 * ràng buộc 2 hiện ra thành giao diện: một trường, nhiều overlay.
 *
 * Mỗi dòng mang một **mẫu hình** chứ không phải một ô màu. Đó là điểm của §4d-1: danh tính
 * overlay đến từ hình học và chất liệu, nên chú giải của nó cũng phải là hình học và chất
 * liệu — một swatch màu phẳng ở đây sẽ nói dối về cách overlay trông trên bản đồ.
 */
interface OverlayMeta {
  id: OverlayId;
  label: string;
  /** hình học — cũng chính là thứ phân biệt overlay này với overlay khác */
  shape: "point" | "line" | "area" | PoiShape | "star" | "dashed-ring";
  desc: string;
  /** câu cần số từ manifest; không có số thì không hiện, không đoán (§12) */
  note?: (m: Manifest) => string | null;
  /**
   * Cảnh báo phải thấy được **TRƯỚC KHI BẤM** — khác `note` ở đúng chỗ đó.
   *
   * `desc`/`note` chỉ mở ra khi overlay đang bật, và với phần lớn overlay thế là đủ: bật
   * lên rồi đọc là kịp. Nhưng một lớp mà bản thân NGUỒN của nó khuyết thì người xem phải
   * biết trước khi tin vào cái mình sắp thấy — cùng luật ràng buộc 4 đã áp cho badge ⚠
   * trong tab TRƯỜNG ("thấy được trước khi bấm"). Con số đọc từ manifest, không hardcode.
   */
  warn?: (m: Manifest) => string | null;
}

/**
 * Tỉ lệ có-polygon của một nhóm POI, đọc từ `manifest.poi` (ràng buộc 4 — P4: người xem
 * phải biết bao nhiêu phần của nhóm là hình thật, bao nhiêu chỉ là vị trí). Không có số
 * thì không hiện, không đoán.
 */
function poiNote(group: string): (m: Manifest) => string | null {
  return (m) => {
    const g = m.poi?.groups[group];
    if (!g) return null;
    return (
      `${g.n.toLocaleString("vi-VN")} POI · ${pct(g.share_polygon)} có hình polygon thật ` +
      `(mark ĐẶC); còn lại OSM chỉ vẽ một điểm — mark RỖNG, không biết cạnh ở đâu, ` +
      `không vẽ vòng tròn thay hình.`
    );
  };
}

const OVERLAYS: OverlayMeta[] = [
  {
    id: "stations",
    label: "Trạm sạc",
    shape: "point",
    desc: "Chấm ĐẶC là trạm thuộc phạm vi đang xem. Chấm RỖNG là trạm trong vành đệm 5 km — có mặt để tính phủ đúng ở biên, nhưng không thuộc phạm vi đó và không vào bất kỳ con số nào của nó.",
    // Đọc `totals.private_ac_dropped` (tên TRUNG TÍNH, cả hai bộ đều phát) chứ không đọc
    // `source_metrics.private_ac_dropped` (tên mang chữ "hanoi", chỉ bộ Hà Nội có). Một
    // khái niệm, một hình dạng — nếu không thì mỗi bộ dữ liệu là một từ vựng.
    note: (m) => {
      const d = m.totals?.private_ac_dropped;
      if (!d) return null;
      return (
        `Chỉ trạm CÔNG CỘNG. ${d.n.toLocaleString("vi-VN")} điểm sạc cá nhân ` +
        `(1 súng AC, lắp tại nhà) đã bị loại khỏi bộ dữ liệu — ${pct(d.share_stations)} ` +
        `số trạm, nhưng chỉ ${pct(d.share_power)} công suất.`
      );
    },
  },
  // M4.1, §4d-3a. Nó ĐI KÈM chấm trạm chứ không đứng một mình — `desc` phải nói ra điều
  // đó, vì bật một lớp mà bản đồ không đổi gì là đúng loại nói dối §3a cấm ở nav.
  {
    id: "station_status",
    label: "Trạm không vận hành",
    shape: "dashed-ring",
    desc: "Vòng NÉT ĐỨT quanh trạm có op_status là MAINTENANCE hoặc OUT_OF_SERVICE. Một kiểu nét, một nghĩa — “không vận hành bình thường”; bảo trì hay ngừng hẳn thì bấm vào chấm, panel TRẠM nói cụ thể. Lớp này bám vào chấm trạm: nó chỉ hiện khi trên bản đồ ĐANG có chấm trạm (bật lớp Trạm sạc, hoặc chọn trường nhịp trạm).",
    note: (m) => {
      const o = m.totals?.op_status;
      if (!o) return null;
      const abn = (o["MAINTENANCE"] ?? 0) + (o["OUT_OF_SERVICE"] ?? 0);
      const total = Object.values(o).reduce((s, v) => s + v, 0);
      return (
        `${abn.toLocaleString("vi-VN")}/${total.toLocaleString("vi-VN")} trạm — ` +
        `${(o["MAINTENANCE"] ?? 0).toLocaleString("vi-VN")} bảo trì · ` +
        `${(o["OUT_OF_SERVICE"] ?? 0).toLocaleString("vi-VN")} ngừng hẳn. ` +
        `${(o["UNKNOWN"] ?? 0).toLocaleString("vi-VN")} trạm nguồn KHÔNG nói trạng thái: chúng ` +
        `không có vòng, vì vẽ nét đứt cho “không biết” là biến nó thành “biết là hỏng”.`
      );
    },
  },
  {
    id: "communes",
    label: "Ranh giới xã",
    shape: "line",
    desc: "Ranh giới xã/phường theo VNSDI. Chỉ là đường viền — muốn TÔ theo số liệu xã thì đổi đơn vị đọc sang XÃ ở tab TRƯỜNG.",
  },
  {
    id: "beyond2km",
    label: "Ngoài 2 km đường",
    shape: "area",
    desc: "Ô mà trạm gần nhất ở xa hơn 2 km TÍNH THEO ĐƯỜNG ĐI. Ô KHÔNG TỚI ĐƯỢC bằng đường bộ không nằm trong đây — không biết xa bao nhiêu thì không được vẽ thành “hơn 2 km”.",
  },
  // 4 nhóm POI — M3.5, §4d-4: danh tính từ HÌNH DẠNG (tròn đã là trạm), một màu lạnh
  // cho cả bốn. desc lấy từ registry để tag ghi ở đúng một chỗ.
  ...POI_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    shape: g.shape,
    desc: `${g.desc} Ở chế độ 3D, POI có polygon thành khối cao ${POI_BLOCK_HEIGHT_M} m — hằng số khai báo để khối nổi lên, KHÔNG phải chiều cao thật.`,
    note: poiNote(g.group),
  })),
  // M5 — lớp overlay cuối của lộ trình. Một chấm SAO nói đúng một điều và không nói gì
  // thêm: không màu theo công suất, không bán kính phục vụ, không cấp điện áp (§12).
  {
    id: "substations",
    label: "Trạm biến áp OSM",
    shape: "star",
    desc: "Mỗi ngôi sao là một đối tượng power=substation trong OSM. Nó nói ĐÚNG MỘT điều: ở đây có một trạm biến áp. Bản đồ này KHÔNG có công suất lưới (kVA), KHÔNG có bán kính phục vụ và KHÔNG có khoảng cách tới trạm biến áp — khả năng đấu nối lưới nằm ngoài phạm vi bài toán, nên các con số đó không tồn tại trong bộ dữ liệu.",
    note: (m) => {
      const s = m.source_metrics?.osm_substations;
      if (!s) return null;
      return (
        `${s.n_mapped_as_area.toLocaleString("vi-VN")}/${s.n.toLocaleString("vi-VN")} cái được ` +
        `OSM vẽ bằng ĐA GIÁC; ta ship TÂM của chúng vì đây là lớp điểm. ` +
        `${s.n_named.toLocaleString("vi-VN")} cái có tên trong OSM.`
      );
    },
    warn: (m) => {
      const s = m.source_metrics?.osm_substations;
      if (!s) return null;
      return (
        `${s.n.toLocaleString("vi-VN")} trạm biến áp là CHẶN DƯỚI, không phải số đo. ` +
        `OSM phủ hạ tầng điện rất thưa, nên chỗ KHÔNG có sao không có nghĩa là không có ` +
        `trạm biến áp — chỉ có nghĩa là OSM chưa vẽ. Đừng đọc lớp này như một bản đồ lưới điện.`
      );
    },
  },
];

/** Đường bao SVG của 4 hình POI trong hộp 10×10, tâm (5,5) — khớp §4d-4. */
const POI_SHAPE_PATH: Record<PoiShape, string> = {
  square: "M1.5 1.5 H8.5 V8.5 H1.5 Z",
  diamond: "M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z",
  triangle: "M5 1 L9.3 8.6 L0.7 8.6 Z",
  cross: "M3.4 1 H6.6 V3.4 H9 V6.6 H6.6 V9 H3.4 V6.6 H1 V3.4 H3.4 Z",
};

/** Sao 5 cánh — mark trạm biến áp (§4d-4). Cùng hình học với `viz/substation-icon.ts`. */
const STAR_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 4.4 : 4.4 * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(5 + r * Math.cos(a)).toFixed(2)} ${(5 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
})();

/** Chú giải = đúng cái mark trên bản đồ, không phải một ô màu đại diện cho nó. */
function ShapeSwatch({ shape }: { shape: OverlayMeta["shape"] }) {
  if (shape === "dashed-ring") {
    // Chú giải vẽ ĐÚNG cái trên bản đồ: một chấm bên trong, một vòng đứt bên ngoài. Vẽ mỗi
    // vòng đứt sẽ giấu mất điều quan trọng nhất — lớp này là chú thích trên một chấm.
    return (
      <span className="flex w-7 shrink-0 items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="2.6" fill={COLD_HEX[2]} />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="#0b0b0b"
            strokeWidth="1.4"
            strokeDasharray="3 3"
          />
        </svg>
      </span>
    );
  }
  if (shape === "star") {
    // MỘT biến thể, không có cặp đặc/rỗng — lớp này không mang tư cách thứ hai nào.
    return (
      <span className="flex w-7 shrink-0 items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 10 10">
          <path d={STAR_PATH} fill={COLD_HEX[2]} />
        </svg>
      </span>
    );
  }
  if (shape in POI_SHAPE_PATH) {
    const d = POI_SHAPE_PATH[shape as PoiShape];
    // Cặp đặc + rỗng — đúng hai biến thể trên bản đồ (đặc = có polygon, rỗng = chỉ điểm).
    return (
      <span className="flex w-7 shrink-0 items-center justify-center gap-1">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d={d} fill={COLD_HEX[1]} />
        </svg>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d={d} fill="none" stroke={COLD_HEX[1]} strokeWidth="1.4" />
        </svg>
      </span>
    );
  }
  if (shape === "point") {
    return (
      <span className="flex w-7 shrink-0 items-center justify-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: COLD_HEX[2], boxShadow: "0 0 0 1.5px #f2f3f0" }}
        />
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ border: `1.5px solid ${COLD_HEX[1]}` }}
        />
      </span>
    );
  }
  if (shape === "line") {
    return (
      <span className="flex w-7 shrink-0 items-center">
        <span className="h-px w-full" style={{ background: COLD_HEX[1] }} />
      </span>
    );
  }
  // Vùng = VÂN 135°, nghiêng ngược vân null 45° — §4d-1.
  return (
    <span
      className="h-4 w-7 shrink-0 border border-hairline"
      style={{
        backgroundImage: `repeating-linear-gradient(-45deg, ${COLD_HEX[2]} 0 1px, transparent 1px 6px)`,
      }}
    />
  );
}

const BASEMAP_OPTIONS: { id: BasemapStyle; label: string; desc: string; preview: string }[] = [
  {
    id: "voyager",
    label: "CARTO Voyager ⭐",
    desc: "Bản đồ CARTO Voyager với hồ nước xanh ngọc, công viên xanh lá dịu, công trình màu cát & đường vàng (giống ảnh mẫu).",
    preview: "bg-[#f4ecd8] border-[#eab308]",
  },
  {
    id: "positron",
    label: "CARTO Positron",
    desc: "Bản đồ xám nhạt sáng tối giản, tập trung tối đa vào phân tích choropleth.",
    preview: "bg-[#f2f3f0] border-[#94a3b8]",
  },
  {
    id: "dark",
    label: "CARTO Dark",
    desc: "Bản đồ tối hiện đại (Dark Mode), tương phản cao với dải màu telemetry.",
    preview: "bg-[#090d12] border-[#475569]",
  },
];

export function LayersTab({ manifest }: { manifest: Manifest | null }) {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const setBasemapStyle = useStore((s) => s.setBasemapStyle);

  return (
    <div className="text-[12px]">
      <div className="border-b border-hairline p-2 bg-basemap/50">
        <div className="mb-1.5 font-semibold text-ink-1 uppercase tracking-wider text-[10px]">
          Bản đồ nền (Basemap Style)
        </div>
        <div className="grid grid-cols-3 gap-1">
          {BASEMAP_OPTIONS.map((b) => {
            const active = basemapStyle === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setBasemapStyle(b.id)}
                title={b.desc}
                className={`flex flex-col items-center justify-center p-1.5 rounded border text-center transition-all cursor-pointer ${
                  active
                    ? "border-cold bg-basemap font-semibold text-cold shadow-sm"
                    : "border-hairline hover:bg-basemap text-ink-2"
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-full border mb-1 ${b.preview}`} />
                <span className="text-[10px] leading-tight">{b.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {OVERLAYS.map((o) => {
        const on = layers.has(o.id);
        const note = manifest ? o.note?.(manifest) : null;
        const warn = manifest ? o.warn?.(manifest) : null;
        // Lớp không dựng được trên bộ đang mở — §3a. Hàng vẫn HIỆN (cùng lựa chọn với
        // `unavailableFields()` ở tab TRƯỜNG: vắng phải nhìn thấy được), nhưng công tắc
        // khoá và lý do nằm ngay dưới nhãn. Ẩn hàng đi thì tỉnh và Hà Nội trông như hai
        // app khác nhau, và không ai biết bộ gốc có lớp mà bộ này thiếu.
        const missing = manifest ? overlayUnavailableIn(o.id, manifest) : null;
        return (
          <div key={o.id} className={`border-b border-hairline ${on ? "bg-basemap" : ""}`}>
            <label
              className={`flex items-center gap-2 px-2 py-1.5 ${
                missing ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={on && !missing}
                disabled={Boolean(missing)}
                onChange={() => toggle(o.id)}
                className="accent-cold-2"
              />
              <ShapeSwatch shape={o.shape} />
              <span className={on && !missing ? "font-semibold" : ""}>{o.label}</span>
            </label>
            {missing && (
              <p className="mx-2 mb-2 ml-7 text-[11px] leading-snug text-ink-muted">
                Không có trong bộ dữ liệu đang mở — {missing}
              </p>
            )}
            {/* NGOÀI khối `on &&` một cách có chủ ý: cảnh báo về nguồn phải đọc được
                TRƯỚC khi bấm (ràng buộc 4), không phải như một lời thú nhận sau đó.
                Luôn kèm icon + chữ, không bao giờ chỉ màu — §4e. */}
            {warn && (
              <p className="mx-2 mb-2 ml-7 flex gap-1.5 border border-warn/60 px-1.5 py-1 text-[11px] leading-snug text-ink-2">
                <span aria-hidden className="shrink-0 text-warn">
                  ⚠
                </span>
                <span>{warn}</span>
              </p>
            )}
            {on && !missing && (
              <div className="space-y-1.5 px-2 pb-2 pl-7 text-[11px] leading-snug text-ink-2">
                <p>{o.desc}</p>
                {note && <p className="text-ink-muted">{note}</p>}
              </div>
            )}
          </div>
        );
      })}

      <p className="p-3 text-[11px] leading-snug text-ink-muted">
        Bật bao nhiêu cái cùng lúc cũng được — không cái nào là choropleth thứ hai. Chúng
        phân biệt nhau bằng <strong>hình học</strong> (điểm · đường · vùng) và{" "}
        <strong>chất liệu</strong> (đặc · nét · vân), không bằng màu; cả ba dùng chung một họ
        màu lạnh. Overlay dạng vùng là <em>vân 135°</em>, nghiêng ngược vân{" "}
        <span
          className="inline-block h-3 w-4 translate-y-0.5 border border-hairline"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${HATCH_HEX} 0 1px, transparent 1px 6px)`,
          }}
        />{" "}
        của ô không đo được, nên chỗ chồng nhau đọc ra được là hai thứ.
      </p>
    </div>
  );
}
