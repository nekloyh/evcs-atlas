import { CONSTANTS } from "../fields";
import { manifestFile, type Manifest } from "../data/manifest";
import type { CellOccStatus, CellRow, StationDetail } from "../data/queries";

const COMMUNE_MANIFEST_FILE = ["commune", "geojson"].join(".");

/**
 * Khối NGUỒN — ràng buộc 5, DESIGN.md §8: xám mờ `#898781`, neo đáy rail, luôn có mặt,
 * không viền, không icon, không màu, 11px. Provenance là thứ phải TRA ĐƯỢC, không phải
 * thứ phải nhìn.
 *
 * Hai biến thể cùng một khối: ở tab TRƯỜNG/LAYER nó nói cả bộ dữ liệu đến từ đâu (§3c);
 * ở tab Ô nó nói riêng ô đang xem (§8).
 */
export function SourceBlock({
  manifest,
  cell = null,
  occ = null,
  station,
  bare = false,
}: {
  manifest: Manifest | null;
  cell?: CellRow | null;
  occ?: CellOccStatus | null;
  /** trạm đang xem — M4.1, §8a-5. Ba biến thể của cùng một khối, không phải ba khối. */
  station?: StationDetail | null;
  /**
   * Bỏ vỏ (đường kẻ trên + nhãn `NGUỒN`), chỉ trả về bảng.
   *
   * Dùng khi khối nằm trong một `<details>` đã mang nhãn ấy ở dòng `summary` — cột đọc §3h
   * làm thế để bốn dòng provenance không ăn 112 px chiều cao thường trực. Đo được: ở
   * 1280 × 800 chính 112 px ấy đẩy tiết ĐI TIẾP ra ngoài vùng cuộn và khối này **sơn đè**
   * lên hai chip của nó — `elementFromPoint` tại tâm chip trả về một `<td>` của bảng dưới
   * đây. Cùng họ bẫy §11-13, chỉ khác là lần này nó sập ở đáy chứ không ở đỉnh.
   */
  bare?: boolean;
}) {
  if (!manifest) return null;
  const s = manifest.snapshots;
  const snap = `OSM ${s.osm_pbf} · trạm ${s.stations_canonical} · telemetry ${windowDays(s.occupancy_window)} ngày`;

  const rows: [string, string][] = station
    ? stationRows(station, s.stations_canonical, snap)
    : cell
    ? [
        ["Dân số", provenance(String(cell["pop_source"] ?? ""), "pop_source", manifest)],
        [
          "Thời gian",
          provenance(
            String(cell["evidence_grade_distance"] ?? ""),
            "evidence_grade_distance",
            manifest,
          ),
        ],
        ["Sử dụng", usageLine(cell, occ)],
        ["Ranh giới", boundaryLine(cell, s.vnsdi_valid_from)],
        ["Ảnh chụp", snap],
      ]
    : [
        [
          "Lưới",
          `${manifest.n_cells.toLocaleString("vi-VN")} ô H3 r8 · ~0,74 km²/ô`,
        ],
        [
          "Ranh giới",
          `VNSDI ${s.vnsdi_valid_from} · ${manifestFile(manifest.files, COMMUNE_MANIFEST_FILE)?.rows ?? "?"} xã/phường`,
        ],
        ["Ảnh chụp", snap],
        ["Xuất", manifest.exported_utc.slice(0, 10)],
      ];

  const table = (
    <table className="w-full">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="align-top">
            <td className="w-[68px] pr-2">{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (bare) {
    return <div className="px-2 pb-2 text-body leading-snug text-ink-muted">{table}</div>;
  }

  return (
    <div className="shrink-0 border-t border-hairline px-2 py-2 text-body leading-snug text-ink-muted">
      <div className="tracking-[0.1em]">NGUỒN</div>
      <div className="mt-1">{table}</div>
    </div>
  );
}

/**
 * Bốn dòng NGUỒN của panel TRẠM — §8a-5.
 *
 * Điểm quan trọng nhất: đây là chỗ hiện con số ở **TẦNG TRẠM**, mà §7b đòi phải nói được
 * bên cạnh con số tầng ô. Panel trạm nói `occ_status` + `coverage` của chính trạm này;
 * rail nói phủ của trường trên lưới. **Không trộn mẫu số** — hai câu hỏi khác nhau về hai
 * quần thể khác nhau, và gộp chúng là cách một con số 96,2% biến thành 9,9%.
 */
function stationRows(
  d: StationDetail,
  stationsSnapshot: string,
  snap: string,
): [string, string][] {
  const o = d.occ;
  const rows: [string, string][] = [];

  if (!o) {
    // 236/939 trạm. "Không có hồ sơ" phải nói ra thành câu, không thành một dòng trống hay
    // một số 0 — ràng buộc 1 ở tầng chữ.
    rows.push(["Sử dụng", "không có hồ sơ 30 ngày — trạm chưa từng báo cáo telemetry"]);
  } else {
    const status = String(o["occ_status"] ?? "");
    const cov = typeof o["coverage"] === "number" ? o["coverage"] : null;
    const days = typeof o["obs_days"] === "number" ? o["obs_days"] : null;
    rows.push([
      "Sử dụng",
      [
        CONSTANTS[status]?.short ?? status,
        cov === null ? null : `phủ ${pctOf(cov)} cửa sổ`,
        days === null ? null : `${days.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ngày quan sát`,
      ]
        .filter(Boolean)
        .join(" · "),
    ]);
    const w0 = String(o["window_start_utc"] ?? "").slice(0, 10);
    const w1 = String(o["window_end_utc"] ?? "").slice(0, 10);
    if (w0 && w1) rows.push(["Cửa sổ", `${w0} → ${w1} (UTC)`]);
  }

  // `port_config_source` là xuất xứ của MẪU SỐ (`n_ports`), tức của chính con số hero.
  // Nó thuộc khối NGUỒN chứ không thuộc khối TÀI SẢN: nó nói dữ liệu tới từ đâu, không
  // nói trạm có gì.
  const src = String(d.station["port_config_source"] ?? "");
  const verified = d.station["verified_official"] === true;
  rows.push([
    "Cấu hình cổng",
    [src || "—", verified ? "đã đối chiếu nguồn chính thức" : "chưa đối chiếu"].join(" · "),
  ]);
  rows.push(["Ảnh chụp", `${snap} · danh mục trạm ${stationsSnapshot}`]);
  return rows;
}

const pctOf = (v: number) =>
  v.toLocaleString("vi-VN", { style: "percent", maximumFractionDigits: 0 });

/**
 * Hằng số xuất xứ → chữ. Ba hằng ở §8 được DỊCH và kèm số ô; các hằng còn lại giữ nguyên
 * — chúng chính là mã xuất xứ, và mentor tra được chúng trong docs/COT.md.
 */
function provenance(value: string, column: string, m: Manifest): string {
  const c = CONSTANTS[value];
  if (!c?.note) return value || "—";
  const n = m.categories[column]?.values[value];
  return c.withCount && n !== undefined ? `${c.note} (${n.toLocaleString("vi-VN")} ô)` : c.note;
}

/** `OK` < `THIEU_PEER` < `THIEU_COVERAGE` — thứ tự xấu dần, chốt ở DESIGN.md §8. */
const OCC_BADNESS: Record<string, number> = { OK: 0, THIEU_PEER: 1, THIEU_COVERAGE: 2 };

/**
 * `occ_status` là trường của TRẠM. Ở đây nó đã được gộp lên ô qua join
 * station_occupancy ← stations theo `h3_r8`.
 *
 * Ô không có trạm đo được thì ghi hẳn ra là không đo được — **không** ghi `0`. Ghi 0 ở
 * đây là đúng cái lỗi mà ràng buộc 1 cấm, chỉ khác là bằng chữ thay vì bằng màu.
 */
function usageLine(cell: CellRow, occ: CellOccStatus | null): string {
  // Hỏi TRƯỚC câu "có bao nhiêu trạm đo được": ở bộ mà bảng trạm không nối lên ô được,
  // mọi ô đều ra 0 và dòng dưới sẽ nói "không có trạm báo cáo đủ chuẩn" cho cả những ô
  // đầy trạm. "Không trả lời được" phải nói khác "biết là không" (§7a).
  if (occ && !occ.joinable) {
    return "không gộp được — bộ dữ liệu này gắn trạm vào XÃ, không vào ô lưới";
  }
  const measured = cell["n_stations_measured"];
  const n = typeof measured === "number" ? measured : 0;
  if (n === 0) return "không đo được — không có trạm báo cáo đủ chuẩn";

  const worst = (occ?.counts ?? [])
    .map((c) => c.status)
    .sort((a, b) => (OCC_BADNESS[b] ?? 9) - (OCC_BADNESS[a] ?? 9))[0];
  const label = worst ? (CONSTANTS[worst]?.short ?? worst) : "—";
  return `${label} · ${n} trạm đo được`;
}

/** Phần trăm diện tích chỉ hiện khi < 0,999 — nhãn xã khi đó là "áp đảo tương đối" (§8). */
function boundaryLine(cell: CellRow, validFrom: string): string {
  const name = cell["commune_name"];
  const frac = cell["commune_area_frac"];
  let out = `VNSDI ${validFrom}`;
  if (typeof name === "string") out += ` · ${name}`;
  if (typeof frac === "number" && frac < 0.999) {
    out += ` (${frac.toLocaleString("vi-VN", { style: "percent", maximumFractionDigits: 0 })} diện tích ô)`;
  }
  return out;
}

function windowDays([start, end]: [string, string]): number {
  const d = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d) : 0;
}
