/**
 * Màn hình TOÀN QUỐC — 34 tỉnh, một lần, một màn hình.
 *
 * Vì sao nó tồn tại: store toàn quốc xuất 34 bộ dữ liệu rời, mỗi bộ mở được một mình, và
 * không bộ nào trả lời được câu hỏi đầu tiên mà bất kỳ ai cũng hỏi — "cả nước trông ra
 * sao". Bộ chọn tỉnh cho đi TỚI một tỉnh; nó không cho THẤY 34 tỉnh.
 *
 * ── BA QUYẾT ĐỊNH LÀM NÊN MÀN HÌNH NÀY ────────────────────────────────────────────────
 *
 * 1. **Hai đơn vị đọc, không phải một.** TỈNH (34 đa giác) trả lời "tỉnh nào nhiều/ít";
 *    Ô GỘP r6 (9.813 ô, ~36 km²) trả lời "chỗ nào trong nước có gì". Đó là hai câu hỏi
 *    khác nhau và chúng cần hai hình học khác nhau. Chọn một trường là chọn luôn đơn vị,
 *    nên không có lúc nào hai mặt cùng tô — ràng buộc 2 (§6b) áp y như ở bậc tỉnh.
 *
 * 2. **Bậc màu tính trên chính 34 (hoặc 9.813) giá trị đang xem**, bằng đúng
 *    `computeClassing` mà bậc tỉnh dùng. Hệ quả phải nói ra: **bậc màu của màn hình này
 *    KHÔNG so được với bậc màu của màn hình một tỉnh** — cùng một sắc cam nghĩa là "cao so
 *    với 34 tỉnh" ở đây và "cao so với 4.400 ô của Hà Nội" ở kia. Legend in ngưỡng thật để
 *    chỗ khác biệt đó nhìn thấy được chứ không phải đoán.
 *
 * 3. **Không có lớp TÍNH TOÁN.** Không khoảng cách theo mạng đường, không sàng lọc, không
 *    mức sử dụng — chúng là đại lượng của bậc r8 trong một tỉnh và không gộp lên được.
 *    Màn hình này chỉ chở SỐ ĐO và phép chia của hai số đo, và đó chính là điều kiện để nó
 *    đứng được trong khi lớp tính toán toàn quốc còn đang nợ.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { parseNationalHash, serializeNationalHash, type NationalMode } from "./hash";
import { can3D, elevationButtonNote, elevationDisclosure } from "./elevation";
import { RES_BASE, resolutionForZoom } from "./lod";

import { POI_GROUPS, POI_GROUP_BY_KEY, type PoiShape } from "../data/poi";
import { switchDataset } from "../data/province";
import { DatasetPicker } from "../ui/DatasetPicker";
import { formatFixed } from "../ui/format";
import { zoomForBbox } from "../map/positron";
import { RAMP_HEX, buildScale, formatBreak, rampFor, type Scale } from "../viz/palette";
import {
  loadCells,
  loadNationalManifest,
  loadPoi,
  loadProvinceRows,
  loadProvinceShapes,
  loadStations,
  type GridMeta,
  type NationalCell,
  type NationalManifest,
  type NationalPoi,
  type NationalStation,
  type ProvinceFeature,
  type ProvinceRow,
} from "./data";
import {
  CELL_FIELDS,
  DEFAULT_NATIONAL_FIELD,
  FIELD_BY_ID,
  NATIONAL_FIELDS,
  NORMALIZED_PROVINCE_FIELDS,
  OTHER_PROVINCE_FIELDS,
  formatValue,
  type NationalField,
} from "./fields";
import { NationalMap } from "./NationalMap";
import { comparableValues, provinceMetric, rankProvinces } from "./metrics";
import { MISSING_HATCH_CSS, NOT_COMPARABLE_HEX } from "./visual-states";

const numericValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Mọi cột của lưới r6 mà danh mục trường có nhắc tới — nạp một lần, đổi trường không nạp lại. */
const CELL_COLUMNS = [...new Set(CELL_FIELDS.map((f) => f.column))];

/** Hằng ở module: một `[]` mới mỗi lần render sẽ làm mọi `useMemo` phía dưới tính lại. */
const EMPTY_CELLS: NationalCell[] = [];

/**
 * Khối `grids` của một bậc, có đường lui cho manifest CŨ (chưa có khối đó).
 *
 * Bản build dựng trước `n12` VERSION 4 không khai `grids`; khi ấy vẫn phải mở được, và bậc
 * duy nhất là r6 ở đúng tên file cũ. Thiếu dữ liệu là "chưa có bậc mịn", không phải lỗi.
 */
function gridOf(m: NationalManifest, res: number): GridMeta {
  return (
    m.grids?.[String(res)] ?? {
      file: `grid_h3_r${res}.parquet`,
      key: `h3_r${res}`,
      n_cells: m.n_cells,
      cell_km2_median: m.cell_km2_median,
      bytes: 0,
    }
  );
}

const shapeOf = (group: string): PoiShape => POI_GROUP_BY_KEY.get(group)?.shape ?? "square";

// ── hash ──────────────────────────────────────────────────────────────────────
//
// Cùng hợp đồng với bậc tỉnh (§9): link là lời hứa. Luật đọc/ghi ở `./hash` — thuần và có
// test; ở đây chỉ nối nó với danh mục trường và danh sách lớp thật.
const KNOWN_FIELDS = new Set<string>(NATIONAL_FIELDS.map((f) => f.id));
const KNOWN_LAYERS = new Set<string>(["stations", "poi"]);

function readHash() {
  return parseNationalHash(
    window.location.hash,
    DEFAULT_NATIONAL_FIELD,
    KNOWN_FIELDS,
    KNOWN_LAYERS,
  );
}

function writeHash(field: string, layers: Set<string>, mode: NationalMode) {
  history.replaceState(
    null,
    "",
    serializeNationalHash(window.location.hash, { field, layers, mode }),
  );
}

export default function NationalApp() {
  const initial = readHash();
  const [fieldId, setFieldId] = useState(initial.field);
  const [layers, setLayers] = useState<Set<string>>(initial.layers);
  // Quyết định 7: link mang `m=3d` NHƯNG trường trong link là trường TỈNH ⇒ về 2d. Quyết
  // định 1 thắng, và nó phải thắng NGAY Ở LẦN VẼ ĐẦU — nếu không, trang mở ra ở một trạng
  // thái mà nút 3D đang mờ còn bản đồ thì đang nghiêng, tức giao diện tự mâu thuẫn.
  const [mode, setMode] = useState<NationalMode>(
    initial.mode === "3d" && can3D(FIELD_BY_ID.get(initial.field)?.unit ?? "cell") ? "3d" : "2d",
  );
  const [manifest, setManifest] = useState<NationalManifest | null>(null);
  const [provinces, setProvinces] = useState<ProvinceFeature[]>([]);
  const [rows, setRows] = useState<Record<string, ProvinceRow>>({});
  // Ô theo BẬC, không phải một mảng: đổi bậc rồi đổi lại không được tải lại 2,14 MB, và
  // quan trọng hơn — giữ cả hai cho phép so hai bậc mà không có một nhịp màn hình trống.
  const [cellsBy, setCellsBy] = useState<Record<number, NationalCell[]>>({});
  const [res, setRes] = useState<number>(RES_BASE);
  const [loadingRes, setLoadingRes] = useState<number | null>(null);
  const [stations, setStations] = useState<NationalStation[] | null>(null);
  const [poi, setPoi] = useState<NationalPoi[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // useCallback (Phase 10): handler inline là một identity mới mỗi render, mà nó nằm trong
  // deps của effect dựng layer bên NationalMap — mỗi lần hover đổi tỉnh là cả stack layer
  // (lưới r6/r7, 6.380 trạm, POI) bị dựng lại chỉ vì một hàm không đổi gì.
  const pickProvince = useCallback((code: string) => switchDataset(code), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState({ lng: 108.2, lat: 15.5, zoom: 5 });
  const [error, setError] = useState<string | null>(null);

  const field = FIELD_BY_ID.get(fieldId) ?? FIELD_BY_ID.get(DEFAULT_NATIONAL_FIELD)!;
  // Chọn một trường TỈNH khi đang ở 3D thì bản đồ tự về phẳng, và **state cũng về `2d`** —
  // không chỉ lớp vẽ. Giữ `mode === "3d"` ngầm trong khi nút đang mờ là để hash ghi một
  // trạng thái không dựng lại được: mở lại link ấy sẽ ra 2D, tức link nói dối (§9).
  const can3d = can3D(field.unit);
  useEffect(() => {
    if (!can3d) setMode("2d");
  }, [can3d]);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => writeHash(fieldId, layers, mode), [fieldId, layers, mode]);

  useEffect(() => {
    void loadNationalManifest().then((m) => {
      setManifest(m);
      // `view_bbox` chứ không `bbox`: mép đông của lãnh thổ là Đặc khu Trường Sa (117,8°E),
      // fit theo nó thì hai phần ba màn hình đầu tiên là Biển Đông. Đảo vẫn được vẽ.
      const [w, s, e, n] = m.view_bbox;
      setView({ lng: (w + e) / 2, lat: (s + n) / 2, zoom: zoomForBbox(m.view_bbox) });
    }, fail);
    void loadProvinceShapes().then(setProvinces, fail);
    void loadProvinceRows().then(setRows, fail);
    // Bậc thô nạp ngay (nó nằm trong 0,52 MB tải lần đầu); bậc mịn đợi người ta phóng vào.
    void loadNationalManifest()
      .then((m) => loadCells(CELL_COLUMNS, gridOf(m, RES_BASE)))
      .then((c) => setCellsBy((p) => ({ ...p, [RES_BASE]: c })), fail);
  }, []);

  // Trạm và POI nạp LƯỜI — cùng luật §5a với màn hình tỉnh: một lớp không ai bật thì không
  // đáng một request. Ở đây là 0,27 MB + 0,78 MB trên nền tải lần đầu 0,52 MB.
  const wantStations = layers.has("stations");
  useEffect(() => {
    if (!wantStations || stations) return;
    void loadStations().then(setStations, fail);
  }, [wantStations, stations]);

  const poiGroupsOn = useMemo(
    () => new Set(POI_GROUPS.filter((g) => layers.has(g.id)).map((g) => g.group)),
    [layers],
  );
  useEffect(() => {
    if (poiGroupsOn.size === 0 || poi) return;
    void loadPoi(shapeOf).then(setPoi, fail);
  }, [poiGroupsOn, poi]);

  // ── LOD: bậc lưới theo mức phóng ────────────────────────────────────────────
  //
  // Bậc là hàm của zoom + bậc đang dùng (có TRỄ — xem `lod.ts`), và nó KHÔNG vào hash: nó
  // suy được từ khung nhìn, nên ghi nó ra là dựng một trạng thái thứ hai cho cùng một sự
  // thật, rồi hai cái lệch nhau khi người ta sửa tay URL.
  const available = useMemo(
    () => new Set(Object.keys(manifest?.grids ?? {}).map(Number)),
    [manifest],
  );
  useEffect(() => {
    setRes((cur) => resolutionForZoom(view.zoom, cur, available));
  }, [view.zoom, available]);

  const cells = cellsBy[res] ?? cellsBy[RES_BASE] ?? EMPTY_CELLS;
  // Bậc ĐANG VẼ, không phải bậc đang muốn: trong lúc r7 còn đang tải thì bản đồ vẫn là r6,
  // và chú giải phải nói về cái đang thấy. In "5,8 km²/ô" trên một thảm ô 40,1 km² là dạng
  // nói dối tệ nhất ở đây — nó đổi ĐƠN VỊ ĐỌC của mọi con số trên màn hình.
  const shownRes = cellsBy[res] ? res : RES_BASE;
  const grid = manifest ? gridOf(manifest, shownRes) : null;
  useEffect(() => {
    if (!manifest || cellsBy[res] || loadingRes === res) return;
    const grid = manifest.grids?.[String(res)];
    if (!grid) return;
    setLoadingRes(res);
    void loadCells(CELL_COLUMNS, grid)
      .then((c) => setCellsBy((p) => ({ ...p, [res]: c })), fail)
      .finally(() => setLoadingRes(null));
  }, [manifest, res, cellsBy, loadingRes]);

  // Bậc màu tính trên chính tập đang xem — xem quyết định 2 ở docstring.
  const scale: Scale | null = useMemo(() => {
    if (field.unit === "province") {
      if (!provinces.length || !Object.keys(rows).length) return null;
      return buildScale(
        "numeric",
        comparableValues(Object.values(rows), field),
        null,
        undefined,
        { contract: field.scaleContract },
      );
    }
    if (!cells.length) return null;
    return buildScale("numeric", cells.map((c) => numericValue(c[field.column])), null, undefined, {
      contract: field.scaleContract,
    });
  }, [field, provinces, rows, cells]);

  const ranking = useMemo(() => rankProvinces(Object.values(rows), field), [rows, field]);
  const provinceStates = useMemo(
    () => Object.fromEntries(Object.values(rows).map((row) => [row.province_code, provinceMetric(row, field).state])),
    [rows, field],
  );
  const comparableCount = field.unit === "province" ? ranking.filter((item) => item.rank !== null).length : 0;
  const notComparableCount = field.unit === "province" ? ranking.filter((item) => item.state === "not-comparable").length : 0;
  const missingCount = field.unit === "province" ? provinces.filter(
    (feature) => provinceStates[feature.properties.province_code] === "missing" || !rows[feature.properties.province_code],
  ).length : 0;

  const toggle = (id: string) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const activeCode = selected ?? hovered;
  const activeRow = activeCode ? rows[activeCode] : null;
  const activeMetric = activeRow ? provinceMetric(activeRow, field) : null;

  return (
    <div className="flex h-full flex-col bg-panel text-ink">
      <nav className="flex h-11 shrink-0 items-center gap-6 border-b border-hairline px-4 text-heading">
        <span className="font-semibold tracking-[0.14em]">EVCS TOÀN QUỐC</span>
        <span className="text-body text-ink-muted">
          {manifest && grid
            ? `${manifest.n_provinces} tỉnh · ${grid.n_cells.toLocaleString("vi-VN")} ô gộp r${shownRes}`
            : "đang nạp…"}
          {loadingRes !== null && (
            <span className="ml-2 text-ink-muted">· đang nạp lưới mịn r{loadingRes}…</span>
          )}
        </span>
        {/* Cùng một bộ chọn với hai màn hình kia. Bản cũ ở đây là một `<select>` riêng
            nhãn "MỞ MỘT TỈNH", và nó thiếu đúng hai đường: về Hà Nội và sang POI. */}
        <div className="ml-auto">
          <DatasetPicker readProxyCount={false} />
        </div>
        <div className="flex items-center gap-2 tracking-[0.1em]">
          <ViewButton label="2D" on={mode === "2d"} ready go={() => setMode("2d")} />
          <span className="text-ink-muted/50">|</span>
          <ViewButton
            label="3D"
            on={mode === "3d"}
            ready={can3d}
            // Câu này là NỘI DUNG, không phải trang trí: một nút mờ không tự nói vì sao nó
            // mờ thì đọc thành "hỏng". Xem quyết định 1 ở `elevation.ts`.
            note={
              can3d
                ? elevationButtonNote(field.scaleContract)
                : "34 khối tỉnh là biểu đồ cột méo theo phối cảnh, không phải bản đồ — chọn một trường của Ô GỘP để bật 3D"
            }
            go={() => setMode("3d")}
          />
        </div>
      </nav>

      <Legend field={field} scale={scale} grid={grid} mode={can3d ? mode : "2d"} notComparableCount={notComparableCount} missingCount={missingCount} />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <NationalMap
            view={view}
            onView={setView}
            field={field}
            scale={scale}
            cells={cells}
            provinces={provinces}
            rows={rows}
            stations={stations}
            poi={poi}
            showStations={wantStations}
            showPoi={poiGroupsOn}
            mode={can3d ? mode : "2d"}
            res={shownRes}
            hovered={hovered}
            selected={selected}
            provinceStates={provinceStates}
            onHoverProvince={setHovered}
            onPickProvince={pickProvince}
          />
          {error && (
            <div className="absolute inset-x-0 top-0 border-b border-hairline bg-panel px-4 py-2 text-heading">
              Không nạp được dữ liệu: {error}
            </div>
          )}
          {/* Bảng đọc của tỉnh đang rê chuột. Đặt TRÊN bản đồ chứ không trong rail: nó đổi
              theo con trỏ, và mắt không rời khỏi chỗ đang chỉ để đọc một ô ở mép màn hình. */}
          {activeRow && activeMetric && (
            <div className="absolute bottom-3 left-3 max-w-sm border border-hairline bg-panel/95 px-3 py-2 text-body">
              <div className="text-title font-semibold">{activeRow.province_name}</div>
              <div className="mt-1 tabular-nums">
                {activeMetric.state === "value"
                  ? `${field.label}: ${formatValue(field, activeMetric.value)} ${field.unit_label}`
                  : activeMetric.state === "not-comparable"
                    ? `KHÔNG SO SÁNH ĐƯỢC · ${activeMetric.reason}`
                    : `${field.label}: không đo được`}
              </div>
              {selected && activeRow.in_store && (
                <button className="mt-2 border border-hairline px-2 py-1 font-semibold hover:bg-basemap" onClick={() => switchDataset(selected)}>
                  Mở bản đồ tỉnh →
                </button>
              )}
            </div>
          )}
        </main>

        <aside className="w-72 shrink-0 overflow-y-auto border-l border-hairline text-body">
          <Group title="CHỈ SỐ ĐÃ CHUẨN HOÁ">
            {NORMALIZED_PROVINCE_FIELDS.map((f) => (
              <FieldRow key={f.id} f={f} on={f.id === fieldId} pick={setFieldId} />
            ))}
            {field.kpi?.disclosure && <p className="px-3 py-2 leading-relaxed text-ink-muted">{field.kpi.disclosure}</p>}
          </Group>
          <Group title="CHỈ SỐ TỈNH · ĐO / MÔ TẢ">
            {OTHER_PROVINCE_FIELDS.map((f) => (
              <FieldRow key={f.id} f={f} on={f.id === fieldId} pick={setFieldId} />
            ))}
          </Group>
          {field.unit === "province" && (
            <Group title="XẾP HẠNG TỈNH">
              <p className="px-3 pb-2 text-ink-muted">
                hạng trên {comparableCount} tỉnh so sánh được · {notComparableCount} tỉnh không so được{missingCount ? ` · ${missingCount} thiếu dữ liệu` : ""}
              </p>
              <ol aria-label={`Xếp hạng ${field.label}`}>
                {ranking.map((item) => (
                  <li key={item.row.province_code}>
                    <button
                      className={`grid w-full grid-cols-[2rem_1fr_auto] gap-2 px-3 py-1 text-left hover:bg-basemap ${selected === item.row.province_code ? "bg-basemap font-semibold" : ""}`}
                      onClick={() => setSelected(item.row.province_code)}
                      onMouseEnter={() => setHovered(item.row.province_code)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <span className="tabular-nums text-ink-muted">{item.rank ?? "—"}</span>
                      <span className="truncate" title={item.row.province_name}>{item.row.province_name}</span>
                      <span className="tabular-nums">
                        {item.state === "value" ? formatValue(field, item.value) : item.state === "not-comparable" ? "không so được" : "thiếu"}
                        {field.id === "p:power_per_urban_km2" && typeof item.row.share_power_missing === "number" && item.row.share_power_missing > 0.1 ? " · chặn dưới" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </Group>
          )}
          <Group
            title={`Ô GỘP H3 r${shownRes} · ~${(grid?.cell_km2_median ?? 36).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km²/ô`}
          >
            {CELL_FIELDS.map((f) => (
              <FieldRow key={f.id} f={f} on={f.id === fieldId} pick={setFieldId} />
            ))}
          </Group>
          <Group title="LỚP CHỒNG">
            <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-basemap">
              <input type="checkbox" checked={wantStations} onChange={() => toggle("stations")} />
              <span>
                Trạm sạc
                <span className="block text-ink-muted">
                  {manifest ? `${manifest.n_stations.toLocaleString("vi-VN")} trạm` : "…"} · đã loại điểm sạc AC một súng
                </span>
              </span>
            </label>
            {POI_GROUPS.map((g) => (
              <label
                key={g.id}
                className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-basemap"
              >
                <input type="checkbox" checked={layers.has(g.id)} onChange={() => toggle(g.id)} />
                <span>
                  {g.label}
                  <span className="block text-ink-muted">
                    {manifest?.poi_groups[g.group]
                      ? `${manifest.poi_groups[g.group]!.n.toLocaleString("vi-VN")} điểm · ${manifest.poi_groups[g.group]!.n_polygon.toLocaleString("vi-VN")} có đa giác`
                      : g.desc}
                  </span>
                </span>
              </label>
            ))}
          </Group>
          <Group title="NGUỒN">
            <div className="space-y-1 px-3 py-2 text-ink-muted">
              <div>VNSDI 16/6/2025 · 34 tỉnh · 3.321 xã/phường</div>
              <div>OSM 28/07/2026 · WorldPop 2025 · WorldCover 2021</div>
              <div>Trạm sạc: bản chụp 29/07/2026, chỉ dùng cục bộ</div>
              {manifest && (
                <div className="border-t border-hairline pt-1">
                  tải lần đầu {formatFixed(manifest.bytes_first_load / 1e6, 2)} MB · trạm và POI nạp lười
                </div>
              )}
            </div>
          </Group>
          {/* POI: câu cảnh báo bắt buộc, không phải một chú thích tuỳ chọn. Nó ở đây vì đây
              là chỗ người dùng bật lớp POI lên. */}
          <Group title="ĐỌC POI THẾ NÀO">
            <div className="px-3 py-2 leading-relaxed text-ink-muted">
              Phủ OSM lệch rất mạnh giữa các tỉnh. Chọn trường{" "}
              <b className="text-ink-2">Xã KHÔNG có POI nào</b> để xem tỉnh nào không đủ dữ liệu —
              ở những tỉnh đó, một ô ít POI nghĩa là <b className="text-ink-2">chưa ai vẽ</b>, không
              nghĩa là chỗ đó vắng. POI không được dùng làm cơ cấu, cũng không được dùng để loại
              một vị trí.
            </div>
          </Group>
        </aside>
      </div>
    </div>
  );
}

/**
 * Nút 2D|3D — cùng từ vựng thị giác với `NavButton` của bậc tỉnh, và cố ý CHÉP chứ không
 * import: `NavButton` sống trong `App.tsx`, và import nó là kéo cả app bậc tỉnh (store,
 * fields, story) vào bundle của màn hình toàn quốc để lấy 12 dòng JSX.
 *
 * `ready === false` ⇒ mờ và KHÔNG bấm được. Không phải chỉ mờ: một nút trông mờ mà vẫn ăn
 * cú bấm là dạng nói dối tệ hơn cả không có nút (§3a).
 */
function ViewButton({
  label,
  on,
  ready,
  note,
  go,
}: {
  label: string;
  on: boolean;
  ready: boolean;
  note?: string;
  go: () => void;
}) {
  return (
    <button
      aria-disabled={!ready}
      aria-current={on || undefined}
      title={note}
      onClick={ready ? go : undefined}
      className={`${ready ? "cursor-pointer" : "cursor-default"} ${
        ready ? (on ? "text-ink" : "text-ink-2 hover:text-ink") : "text-ink-muted/50"
      }`}
    >
      {label}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hairline">
      <h2 className="px-3 py-1.5 text-note uppercase tracking-[0.12em] text-ink-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FieldRow({
  f,
  on,
  pick,
}: {
  f: NationalField;
  on: boolean;
  pick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => pick(f.id)}
      title={f.desc}
      aria-current={on || undefined}
      className={`block w-full cursor-pointer px-3 py-1 text-left hover:bg-basemap ${
        on ? "bg-basemap font-semibold text-ink" : "text-ink-2"
      }`}
    >
      {f.label}
    </button>
  );
}

function Legend({
  field,
  scale,
  grid,
  mode,
  notComparableCount,
  missingCount,
}: {
  field: NationalField;
  scale: Scale | null;
  /** bậc lưới ĐANG VẼ — đơn vị đọc của mọi con số ở dải này đến từ đây, không từ TS */
  grid: GridMeta | null;
  mode: NationalMode;
  notComparableCount: number;
  missingCount: number;
}) {
  const { colors, inks } = scale ? rampFor(scale, field.polarity) : { colors: [], inks: [] };
  // Nhãn là CẬN DƯỚI của từng bậc, in nguyên văn — cùng hàm và cùng luật với `labelsFor`
  // của bậc tỉnh. Bản đầu thêm "<" vào nhãn đầu và nó SAI: bậc đầu bắt đầu ở giá trị nhỏ
  // nhất thật, nên "< 0" nói rằng có ô âm.
  const labels = scale && scale.kind === "numeric" ? scale.breaks.map((b) => fmtBreak(field, b)) : [];
  const noun = field.unit === "province" ? "tỉnh" : "ô gộp";

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-hairline text-body">
      <div className="flex">
        {labels.map((label, i) => (
          <div
            key={label + i}
            className="flex min-w-20 items-center justify-center px-2 tabular-nums"
            style={{ background: rgbCss(colors[i] ?? [0, 0, 0]), color: inks[i] }}
          >
            {label}
          </div>
        ))}
        {!labels.length && (
          <div className="flex items-center px-3 text-ink-muted">
            đang nạp{" "}
            <span className="ml-1 inline-flex">
              {RAMP_HEX.slice(0, 5).map((h) => (
                <span key={h} className="h-3 w-3" style={{ background: h }} />
              ))}
            </span>
          </div>
        )}
        {scale && field.unit === "cell" && scale.nNull > 0 && (
          <div className="flex items-center gap-2 border-l border-hairline px-2 text-ink-2">
            <span
              className="h-4 w-4"
              style={{
                backgroundImage: MISSING_HATCH_CSS,
              }}
            />
            không đo được ({scale.nNull.toLocaleString("vi-VN")} {noun})
          </div>
        )}
        {notComparableCount > 0 && (
          <div className="flex items-center gap-2 border-l border-hairline px-2 text-ink-2">
            <span className="h-4 w-4" style={{ background: NOT_COMPARABLE_HEX }} />
            không so sánh được ({notComparableCount} tỉnh)
          </div>
        )}
        {missingCount > 0 && (
          <div className="flex items-center gap-2 border-l border-hairline px-2 text-ink-2">
            <span className="h-4 w-4" style={{ backgroundImage: MISSING_HATCH_CSS }} />
            thiếu dữ liệu ({missingCount} tỉnh)
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3 px-3 text-ink-2">
        <span>
          {field.label} · {field.unit_label}
        </span>
        <span className="text-ink-muted">
          đọc theo{" "}
          {field.unit === "province"
            ? "TỈNH"
            : `Ô GỘP ~${(grid?.cell_km2_median ?? 36).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km²`}
        </span>
        {/* Bậc màu là phân vị TRÊN CHÍNH tập này. Nói ra, vì cùng sắc cam ở màn hình một
            tỉnh mang một nghĩa khác — xem quyết định 2 ở docstring. */}
        <span className="border border-hairline px-1 text-note text-ink-muted">
          bậc theo phân vị của {field.unit === "province" ? "34 tỉnh" : `${grid ? Math.round(grid.n_cells / 1000) : "?"} nghìn ô r${grid?.key.slice(-1) ?? "6"}`} — không so được với bậc của một tỉnh, cũng không so được giữa hai bậc lưới
        </span>
        {/* Chỉ hiện Ở 3D, và đó là điều đúng: ở 2D không có kênh chiều cao nào để mà mô tả,
            một câu mô tả kênh không tồn tại là nhiễu. Câu này đến từ `elevationDisclosure`
            — nó đọc đúng {transform, clip} mà `elevationFor` đang chạy và số ô vượt trần đo
            trên chính thang đang vẽ (QA 2.1-002: màu vẫn theo BẬC, chiều cao thì LIÊN TỤC,
            và legend phải nói câu của kênh chiều cao chứ không mượn câu của kênh màu). */}
        {mode === "3d" && scale && scale.kind === "numeric" && (
          <span className="border border-hairline px-1 text-note text-ink-muted">
            {elevationDisclosure(field.scaleContract, scale.domain)}
          </span>
        )}
      </div>
    </div>
  );
}

// Cùng một hàm với `Legend.tsx` của bậc tỉnh, và cùng lý do nó là hàm cục bộ ở đó: ba
// dòng, không có quyết định nào trong đó, và một export chung sẽ buộc `palette.ts` phải
// biết về CSS.
function rgbCss(c: [number, number, number] | undefined): string {
  return c ? `rgb(${c[0]},${c[1]},${c[2]})` : "transparent";
}

function fmtBreak(f: NationalField, b: number): string {
  return f.percent ? `${formatFixed(b * 100, b < 0.01 ? 1 : 0)}%` : formatBreak(b);
}
