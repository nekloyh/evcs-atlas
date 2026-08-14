/**
 * Chế độ DỮ LIỆU — DESIGN.md §3f, thi công M4.2.
 *
 * ── Vì sao chế độ này đáng một mốc riêng ──────────────────────────────────────────────
 *
 * Với một mentor đang đánh giá **phương pháp**, trang "dữ liệu này đáng tin tới đâu"
 * thuyết phục hơn mọi hiệu ứng. Đây là bản table-view song sinh của cả app: mọi giá trị
 * phải đọc được **ngoài tooltip**, và các quyết định lọc/phủ trở thành thứ nhìn thấy được
 * thay vì một câu trong DECISIONS.md.
 *
 * **Không có bản đồ.** Cố ý: mỗi khối ở đây trả lời một câu hỏi mà bản đồ trả lời tệ —
 * "tổng cộng bao nhiêu", "cột nào khuyết", "hàng thứ 2.317 ghi gì".
 *
 * ── Luật chung của cả trang ───────────────────────────────────────────────────────────
 *
 *   1. **Không con số nào gõ tay.** KPI đọc `manifest.totals` (M4.2 phát), bảng phủ đọc
 *      `manifest.coverage`, bảng dữ liệu đọc thẳng parquet. Ràng buộc 4, §7c.
 *   2. **Tổng trên cột có null là CHẶN DƯỚI, và phải nói ra.** 26 trạm khuyết `n_ports`,
 *      27 khuyết `power_kw_site` — KPI in cả hai con số đó ngay dưới tổng.
 *   3. **Vắng thông tin vẽ VÂN, không vẽ một bậc màu.** `UNKNOWN` của chuẩn phích là vắng
 *      thông tin, cùng khái niệm với ô null (ràng buộc 1), không phải chuẩn phích thứ ba.
 *   4. **Một chuỗi ⇒ một màu** (§4d-2). Năm sparkline `shape_class` dùng CHUNG `c5` và
 *      chung thang y; danh tính nằm ở vị trí + nhãn tiếng Việt. Năm hue cho năm dạng là
 *      đúng anti-pattern "categorical khi câu chuyện là hình dạng".
 */

import { useEffect, useMemo, useState } from "react";

import { PAGE_SIZE, fetchGridPage, fetchShapeClasses, type GridPage } from "../data/datamode";
import { pct, type Manifest } from "../data/manifest";
import type { StationOccupancy } from "../data/occupancy";
import { CONSTANTS, FIELD_BY_ID, constantShort } from "../fields";
import { shapeDayProfiles, type ShapeProfile } from "../viz/occ";
import { HAIRLINE_HEX, HATCH_HEX, RAMP_HEX } from "../viz/palette";
import { formatValue } from "./format";

const SERIES = RAMP_HEX[4]!;

export function DataMode({
  manifest,
  occupancy,
}: {
  manifest: Manifest | null;
  /** hồ sơ 168h — nguồn của small multiples (§3f-5). `null` = chưa nạp xong. */
  occupancy: StationOccupancy | null;
}) {
  if (!manifest) {
    return <div className="p-6 text-title text-ink-muted">đang nạp manifest…</div>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-6 py-5">
        <Kpi manifest={manifest} />
        <Connectors manifest={manifest} />
        <ShapeMultiples manifest={manifest} occupancy={occupancy} />
        <CoverageTable manifest={manifest} />
        <GridTable />
      </div>
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-hairline pt-3 pb-7 first:border-t-0 first:pt-0">
      <h2 className="pb-1 text-body tracking-[0.14em] text-ink-2">{title}</h2>
      {note && <p className="max-w-[70ch] pb-3 text-body leading-snug text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}

// ── 1. KPI row (§3f-1) ────────────────────────────────────────────────────────

/**
 * Hàng stat tile. Năm con số, và con số thứ năm là con số quan trọng nhất của trang.
 *
 * "Điểm sạc cá nhân đã loại" đứng ngang hàng với bốn con số kia **có chủ ý** (§3f-1): bản
 * đồ này không vẽ 2.408 điểm sạc, và im lặng về điều đó là nói dối về cung. Nó không phải
 * một chú thích cuối trang — nó là một KPI.
 */
function Kpi({ manifest }: { manifest: Manifest }) {
  const tt = manifest.totals;
  // Đọc hình dạng TRUNG TÍNH trong `totals` (cả hai bộ đều phát) chứ không đọc
  // `source_metrics` (chỉ bộ Hà Nội có, và tên trường mang chữ "hanoi").
  const occOk = tt?.occ_status_ok;
  const dropped = tt?.private_ac_dropped;

  if (!tt) {
    return (
      <Block title="TỔNG CUNG">
        <p className="text-body text-ink-2">
          Manifest của bộ dữ liệu này chưa có khối <code>totals</code> — hàng KPI không hiện.
          Nó KHÔNG được đoán từ đâu khác: §7c cấm gõ con số vào TS, và một tổng tính lại ở
          client sẽ là con số thứ hai cho cùng một khái niệm.
        </p>
      </Block>
    );
  }

  return (
    <Block
      title="TỔNG CUNG"
      note={`Mọi số đọc từ manifest.json, tính lúc export${
        manifest.province ? ` cho ${manifest.province.province_name}` : ""
      }. Trạm vành đệm 5 km để riêng: chúng có mặt để tính phủ đúng ở biên và không vào con số nào của phạm vi đang xem.`}
    >
      <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="trạm công cộng"
          value={tt.in_scope.n_stations.toLocaleString("vi-VN")}
          sub={`+${tt.buffer.n_stations.toLocaleString("vi-VN")} vành đệm`}
        />
        <Tile
          label="cổng lắp đặt"
          value={tt.in_scope.n_ports.toLocaleString("vi-VN")}
          // Luật 2 của trang: tổng trên cột có null là CHẶN DƯỚI.
          sub={
            tt.in_scope.n_ports_missing > 0
              ? `chặn dưới — ${tt.in_scope.n_ports_missing} trạm khuyết n_ports`
              : "không trạm nào khuyết"
          }
        />
        <Tile
          label="công suất lắp đặt"
          value={`${tt.in_scope.power_mw.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MW`}
          sub={
            tt.in_scope.power_missing > 0
              ? `chặn dưới — ${tt.in_scope.power_missing} trạm khuyết công suất`
              : "không trạm nào khuyết"
          }
        />
        {/*
          Hai tile cuối in "—" khi manifest không phát khối tương ứng, và câu phụ nói ra
          rằng đó là "chưa đo" chứ không phải "bằng 0". Ràng buộc 1 ở tầng chữ: một ô trống
          hay một số 0 ở đây đều đọc thành một khẳng định mà dữ liệu không đưa ra.
        */}
        <Tile
          label="trạm báo cáo đủ chuẩn"
          value={occOk ? pct(occOk.share) : "—"}
          sub={occOk ? `${occOk.n_ok}/${occOk.n_total} trạm có hồ sơ 30 ngày` : "bộ này chưa đo"}
        />
        <Tile
          label="điểm sạc cá nhân ĐÃ LOẠI"
          value={dropped ? dropped.n.toLocaleString("vi-VN") : "—"}
          sub={
            dropped
              ? `${pct(dropped.share_stations)} số trạm, nhưng chỉ ${pct(dropped.share_power)} công suất`
              : "bộ này chưa đo"
          }
        />
      </div>
      {/* Trạng thái vận hành — cùng nguồn với vòng nét đứt của §4d-3a, nên bảng và bản đồ
          không thể nói hai con số khác nhau. */}
      <p className="pt-2 text-body leading-snug text-ink-2">
        Trạng thái vận hành:{" "}
        {Object.entries(tt.op_status)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${constantShort(k)} ${v.toLocaleString("vi-VN")}`)
          .join(" · ")}
        .{" "}
        <span className="text-ink-muted">
          Hai nhóm giữa mang vòng nét đứt trên bản đồ khi bật lớp “Trạm không vận hành”.
        </span>
      </p>
    </Block>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-panel px-3 py-2.5">
      {/* Số lớn dùng figure TỈ LỆ, không `tabular-nums` — §4e: tabular để dành cho CỘT số
          phải thẳng hàng, và năm ô này không xếp thành cột. */}
      <div className="text-readout font-semibold leading-none">{value}</div>
      <div className="pt-1 text-body leading-tight text-ink-2">{label}</div>
      <div className="pt-0.5 text-note leading-tight text-ink-muted">{sub}</div>
    </div>
  );
}

// ── 4. Stacked bar ngang connectors (§3f-4) ───────────────────────────────────

/**
 * Một thanh ngang, ba đoạn. `UNKNOWN` vẽ **vân xám**, không phải bậc màu thứ ba.
 *
 * Đó là cả điểm của khối này: "không khớp registry" là **vắng thông tin**, cùng khái niệm
 * với ô null trên bản đồ (ràng buộc 1). Cho nó một bậc màu là xếp nó thành chuẩn phích thứ
 * ba, và một người đọc lướt sẽ đếm thành ba chuẩn.
 */
function Connectors({ manifest }: { manifest: Manifest }) {
  const c = manifest.totals?.connectors;
  if (!c) return null;
  const order = ["CCS2", "TYPE2", "UNKNOWN"];
  const entries = order
    .map((k) => ({ k, v: c.by_standard[k]?.n_guns ?? 0 }))
    .filter((e) => e.v > 0);
  const total = entries.reduce((s, e) => s + e.v, 0) || 1;

  // Luật vân xám phải nói ra CẢ KHI nó không nổ trên bộ dữ liệu này — cùng thủ pháp mà
  // `heatmapUnitSentence` dùng cho ngưỡng `observed_h`: im lặng ở đó thì một ô vân không
  // bao giờ xuất hiện trở thành một lời hứa suông trong chú giải.
  const nUnknown = c.by_standard["UNKNOWN"]?.n_guns ?? 0;
  const rule =
    nUnknown > 0
      ? "UNKNOWN vẽ vân xám vì nó là VẮNG THÔNG TIN, không phải một chuẩn thứ ba — cùng chất liệu với ô không đo được trên bản đồ."
      : "Luật vẫn chạy nhưng không nổ ở bộ này: không súng nào rơi vào UNKNOWN, nên không có đoạn vân xám nào trên thanh.";

  return (
    <Block
      title="CHUẨN PHÍCH"
      note={`${c.n_guns.toLocaleString("vi-VN")} súng trên ${c.n_stations_with_connectors.toLocaleString("vi-VN")} trạm có khai báo cổng. ${rule}`}
    >
      <div className="flex h-7 w-full overflow-hidden border border-hairline">
        {entries.map((e, i) => (
          <div
            key={e.k}
            className="relative"
            style={{
              width: `${(e.v / total) * 100}%`,
              // Hai chuẩn thật dùng hai bậc của CÙNG ramp (§4d-2: nhấn bằng độ đậm trong
              // cùng ramp, không bằng hue thứ hai). UNKNOWN dùng vân.
              background:
                e.k === "UNKNOWN"
                  ? `repeating-linear-gradient(45deg, ${HATCH_HEX} 0 1px, transparent 1px 5px)`
                  : i === 0
                    ? RAMP_HEX[5]
                    : RAMP_HEX[2],
            }}
            title={`${e.k}: ${e.v.toLocaleString("vi-VN")} súng`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1.5 text-body text-ink-2">
        {entries.map((e) => (
          <span key={e.k} className="tabular-nums">
            {e.k === "UNKNOWN" ? "không khớp registry" : e.k} —{" "}
            {e.v.toLocaleString("vi-VN")} súng · {pct(e.v / total)}
          </span>
        ))}
      </div>
    </Block>
  );
}

// ── 5. Small multiples 5 dạng `shape_class` (§3f-5) ───────────────────────────

/**
 * Cỡ một sparkline — đến từ ẢNH RENDER, không từ cảm giác.
 *
 * Bản đầu cao 34 px và năm hình trông **phẳng như nhau**: thang y chung bị kéo lên bởi dạng
 * cao nhất, nên bốn dạng còn lại nằm gọn trong 8 px và nhịp ngày của chúng biến mất. Đó
 * đúng là mục 10 của nghiệm thu, tái diễn ở một hình khác — và cách sửa cũng đúng như ở đó:
 * KHÔNG cấp thang riêng cho từng hình (§3f-5 cấm, và cấm đúng), mà cho kênh vị trí thêm
 * chỗ. 62 px cho dải 0–48% ⇒ một chênh lệch 5 điểm phần trăm vẫn còn ~6 px, tức vẫn đọc được.
 */
const SPARK_W = 220;
const SPARK_H = 62;

function ShapeMultiples({
  manifest,
  occupancy,
}: {
  manifest: Manifest;
  occupancy: StationOccupancy | null;
}) {
  const [classes, setClasses] = useState<Map<string, string> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Bộ dữ liệu tự khai lớp occupancy KHÔNG đọc được — `unusable_layers` là hợp đồng mà
  // tầng dữ liệu đã dựng sẵn cho đúng việc này (khác `missing_layers`: cột CÓ, nhưng gần
  // như toàn null). Đọc nó thay vì tự đặt ngưỡng ở đây: một ngưỡng thứ hai trong TS sẽ
  // trôi khỏi ngưỡng thật ở `n05_quality.MIN_OCC_MEASURED_SHARE`.
  const unusable = manifest.unusable_layers?.find((u) => u.layer === "occupancy") ?? null;
  const occOk = manifest.totals?.occ_status_ok;

  useEffect(() => {
    void fetchShapeClasses().then(setClasses, (e: unknown) =>
      setErr(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const profiles: ShapeProfile[] = useMemo(() => {
    if (!occupancy || !classes) return [];
    return shapeDayProfiles(
      occupancy.profiles,
      (s) => classes.get(occupancy.stations[s]!.code) ?? null,
    );
  }, [occupancy, classes]);

  // CÙNG THANG Y cho cả năm — §3f-5. Khác thang là mời so sánh sai, và với năm hình xếp
  // dọc cạnh nhau thì lời mời đó gần như chắc chắn được nhận.
  const top = useMemo(() => {
    const hi = profiles.reduce(
      (m, p) => Math.max(m, ...p.hours.map((v) => v ?? 0)),
      0,
    );
    return hi > 0 ? hi * 1.08 : 1;
  }, [profiles]);

  return (
    <Block
      title="HỒ SƠ NGÀY THEO DẠNG NHỊP"
      note="Năm dạng của shape_class, mỗi dạng một hồ sơ 24 giờ (Σ cổng bận ÷ Σ cổng lắp đặt, gộp trên cả tuần). CÙNG thang y cho cả năm — khác thang là mời so sánh sai. MỘT màu cho cả năm: danh tính nằm ở vị trí và nhãn, không tiêu một hue; năm hue cho năm dạng là đúng anti-pattern “categorical khi câu chuyện là hình dạng”."
    >
      {/*
        Mẫu số đứng TRƯỚC hình, không đứng sau. Ở Cao Bằng chỉ 3/30 trạm có hồ sơ đọc được;
        năm đường vẽ từ đó vẫn là năm đường trông rất thuyết phục. Đây đúng là nguyên tắc
        gốc của dự án — "một lớp vẽ từ một trường đã hỏng thì tệ hơn không vẽ, vì nó làm cái
        sai trông thuyết phục" — nên cảnh báo phải đọc được TRƯỚC khi mắt đọc hình.
      */}
      {unusable && (
        <p className="mb-3 flex max-w-[70ch] gap-1.5 border border-warn/60 px-2 py-1.5 text-body leading-snug text-ink-2">
          <span aria-hidden className="shrink-0 text-warn">
            ⚠
          </span>
          <span>
            Bộ dữ liệu này tự khai lớp <strong>occupancy không đọc được</strong>:{" "}
            {unusable.reason} ({unusable.measured}). Năm hình dưới đây vẫn dựng được về mặt
            kỹ thuật, nhưng chúng nói về một mẫu nhỏ chứ không nói về tỉnh.
          </span>
        </p>
      )}
      {!unusable && occOk && occOk.share < 1 && (
        <p className="pb-2 text-body text-ink-muted">
          Mẫu số: <span className="tabular-nums">{occOk.n_ok}/{occOk.n_total}</span> trạm báo
          cáo đủ chuẩn ({pct(occOk.share)}). Trạm không có hồ sơ không đóng góp vào đường nào
          — chúng không được coi là “vắng khách”.
        </p>
      )}

      {err && <p className="text-body text-ink-2">Không đọc được shape_class: {err}</p>}
      {!err && profiles.length === 0 && (
        <p className="text-body text-ink-muted">
          {occupancy
            ? "Không trạm nào của bộ dữ liệu này có nhãn dạng nhịp — không có gì để vẽ, và đó là một sự thật về dữ liệu chứ không phải một lỗi."
            : "đang gộp hồ sơ 168 giờ…"}
        </p>
      )}
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {profiles.map((p) => (
          <div key={p.cls}>
            <div className="flex items-baseline gap-2 text-body">
              <span className="font-semibold">{CONSTANTS[p.cls]?.short ?? p.cls}</span>
              <span className="tabular-nums text-ink-muted">{p.nStations} trạm</span>
            </div>
            <Spark hours={p.hours} top={top} />
          </div>
        ))}
      </div>
      {profiles.length > 0 && (
        <p className="pt-1 text-note text-ink-muted">
          Trục y chung: 0 – {(top * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}% ·
          trục x: 0h → 23h · đoạn ĐỨT = không trạm nào của dạng đó đủ quan sát ở giờ ấy (không
          phải 0).
        </p>
      )}
    </Block>
  );
}

/**
 * Sparkline 24 giờ. Đoạn `null` **để đứt**, không nối liền.
 *
 * Nối qua một khoảng trống là vẽ một giá trị không tồn tại — ràng buộc 1 trên chiều thời
 * gian, cùng luật mà ô vân xám giữ trên heatmap.
 */
function Spark({ hours, top }: { hours: (number | null)[]; top: number }) {
  const x = (h: number) => (h / 23) * (SPARK_W - 2) + 1;
  const y = (v: number) => SPARK_H - 3 - (v / top) * (SPARK_H - 6);
  let d = "";
  let pen = false;
  hours.forEach((v, h) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(h).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <svg width={SPARK_W} height={SPARK_H} className="block">
      {/* Đường 0 — mốc tham chiếu, hairline (§4d-2: không mang màu dữ liệu). Nó phải có mặt
          vì trục y không cắt gốc, và một sparkline không có đáy thì "cao" mất nghĩa. */}
      <line
        x1="0"
        y1={SPARK_H - 3}
        x2={SPARK_W}
        y2={SPARK_H - 3}
        stroke={HAIRLINE_HEX}
        strokeWidth="1"
      />
      <path d={d} fill="none" stroke={SERIES} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── 2. Bảng phủ (§3f-2) ───────────────────────────────────────────────────────

/**
 * Mỗi dòng một cột của lưới, hai meter ngang.
 *
 * Meter là một **track cùng họ màu** — một hue cho mọi dòng, độ dài mang giá trị. §3f nói
 * thẳng: không phải bar chart mỗi dòng một hue. Với 53 dòng thì 53 hue là một cầu vồng
 * không ai đọc, và nó sẽ tự nhận là một thang phân loại trong khi nó là một thang lượng.
 */
function CoverageTable({ manifest }: { manifest: Manifest }) {
  const [onlyGaps, setOnlyGaps] = useState(false);
  const all = Object.entries(manifest.coverage);
  const rows = all
    .filter(([, c]) => !onlyGaps || c.cell_share < 1)
    .sort((a, b) => a[1].cell_share - b[1].cell_share);
  // Cột "% dân" chỉ dựng khi bộ dữ liệu CÓ lớp dân số. 23 dòng cùng ghi "chưa có lớp dân
  // số" là 23 lần nói một câu — nói một lần ở chú thích rồi bỏ cột đi thì đọc được hơn, và
  // nó không để một cột trống trông như một cột đo được 0.
  const hasPop = all.some(([, c]) => c.pop_share !== undefined);

  return (
    <Block
      title="PHỦ TỪNG CỘT"
      note={
        <>
          Đây là bản đầy đủ của thứ rail chỉ hé ra qua badge ⚠.{" "}
          {hasPop ? (
            <>
              Hai con số là hai nghĩa khác nhau và chúng phải đi cùng nhau:{" "}
              <strong>% ô</strong> hỏi “bao nhiêu ô có giá trị”, <strong>% dân</strong> hỏi
              “những ô đó chứa bao nhiêu người”. Một cột phủ ít ô mà nhiều dân không phải “đo
              kém” — nó chỉ tồn tại ở nơi câu hỏi có nghĩa.
            </>
          ) : (
            <>
              Bộ dữ liệu này <strong>chưa có lớp dân số</strong>, nên chỉ có “% ô”. Cột “% dân”
              bị bỏ hẳn chứ không để trống: một phủ theo dân tính bằng trọng số đều sẽ đọc
              thành dân số thật.
              {manifest.missing_layers && ` ${manifest.missing_layers.reason}.`}
            </>
          )}
        </>
      }
    >
      <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-body text-ink-2">
        <input
          type="checkbox"
          checked={onlyGaps}
          onChange={(e) => setOnlyGaps(e.target.checked)}
          className="accent-cold-2"
        />
        chỉ hiện cột chưa phủ 100% ({Object.values(manifest.coverage).filter((c) => c.cell_share < 1).length})
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-body">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-2">
              <th className="py-1 pr-2 font-normal">cột</th>
              <th className="py-1 pr-2 font-normal">nhãn trong rail</th>
              <th className="w-[150px] py-1 pr-2 font-normal">% ô</th>
              {hasPop && <th className="w-[150px] py-1 pr-2 font-normal">% dân</th>}
              <th className="py-1 text-right font-normal">số ô có giá trị</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([col, c]) => {
              const f = FIELD_BY_ID.get(col);
              return (
                <tr key={col} className="border-b border-hairline align-middle">
                  <td className="py-1 pr-2 font-mono text-note">{col}</td>
                  <td className="py-1 pr-2 text-ink-2">{f?.label ?? "—"}</td>
                  <td className="py-1 pr-2">
                    <Meter share={c.cell_share} />
                  </td>
                  {/* Vắng `pop_share` ⇒ in CHỮ, không vẽ một meter dài 0 px. Một meter rỗng
                      đọc thành "0% dân" — đúng cái ràng buộc 1 cấm, chỉ khác là ở một thanh
                      thay vì ở một ô bản đồ. (Ở bộ không có lớp dân số thì cả CỘT bị bỏ,
                      xem `hasPop`; nhánh này lo trường hợp lẻ tẻ trong một bộ CÓ lớp đó.) */}
                  {hasPop && (
                    <td className="py-1 pr-2">
                      {c.pop_share === undefined ? (
                        <span className="italic text-ink-muted">không đo được</span>
                      ) : (
                        <Meter share={c.pop_share} />
                      )}
                    </td>
                  )}
                  <td className="py-1 text-right tabular-nums text-ink-2">
                    {c.n_present.toLocaleString("vi-VN")}/{manifest.n_cells.toLocaleString("vi-VN")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function Meter({ share }: { share: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 flex-1 bg-hairline">
        <span
          className="block h-2"
          style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: SERIES }}
        />
      </span>
      <span className="w-[46px] shrink-0 text-right tabular-nums text-ink-2">{pct(share)}</span>
    </span>
  );
}

// ── 3. Bảng dữ liệu (§3f-3) ───────────────────────────────────────────────────

/**
 * Bản đọc PHẲNG của bảng chính — sắp xếp, lọc, phân trang.
 *
 * Sắp xếp chạy trong SQL, không trong JS, và lý do là **null** chứ không phải tốc độ — xem
 * `fetchGridPage`. Ở đây chỉ còn một luật: giá trị `null` in ra bằng CHỮ qua `formatValue`,
 * không bao giờ thành ô trống. Một ô trống trong bảng đọc thành "0" hoặc thành "lỗi
 * render", và cả hai đều sai.
 */
function GridTable() {
  const [sort, setSort] = useState<string | null>(null);
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<GridPage | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGridPage({ sort, desc, offset: page * PAGE_SIZE, filter }).then(
      (d) => {
        if (!cancelled) setData(d);
      },
      (e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sort, desc, page, filter]);

  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <Block
      title="BẢNG DỮ LIỆU"
      note={
        <>
          Toàn bộ cột của <code>grid_h3_r8.parquet</code>, đúng như đã ship. Định nghĩa từng
          cột nằm ở <code>docs/COT.md</code> trong repo. Ô ghi “không đo được” là{" "}
          <code>null</code> thật trong dữ liệu — nó không bao giờ được in thành 0 hay thành
          ô trống.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3 pb-2 text-body">
        <input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
          placeholder="lọc theo tên xã hoặc mã H3"
          className="w-56 border border-hairline bg-panel px-2 py-1 outline-none focus:border-ink-muted"
        />
        <span className="tabular-nums text-ink-2">
          {total.toLocaleString("vi-VN")} dòng
          {filter && " khớp bộ lọc"} · trang {page + 1}/{lastPage + 1}
        </span>
        <span className="ml-auto flex gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="cursor-pointer border border-hairline px-2 py-0.5 disabled:cursor-default disabled:text-ink-muted/50"
          >
            ‹ trước
          </button>
          <button
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
            className="cursor-pointer border border-hairline px-2 py-0.5 disabled:cursor-default disabled:text-ink-muted/50"
          >
            sau ›
          </button>
        </span>
      </div>

      {err && <p className="text-body text-ink-2">Không đọc được bảng: {err}</p>}
      {!err && !data && <p className="text-body text-ink-muted">đang đọc…</p>}

      {data && (
        // Bảng 53 cột KHÔNG được kéo giãn trang — nó cuộn ngang trong hộp của chính nó.
        <div className="max-h-[520px] overflow-auto border border-hairline">
          <table className="text-note">
            <thead className="sticky top-0 z-10 bg-basemap">
              <tr className="text-left">
                {data.columns.map((c) => (
                  <th
                    key={c}
                    onClick={() => {
                      if (sort === c) setDesc((d) => !d);
                      else {
                        setSort(c);
                        setDesc(false);
                      }
                      setPage(0);
                    }}
                    className="cursor-pointer whitespace-nowrap border-b border-r border-hairline px-1.5 py-1 font-mono font-normal text-ink-2 hover:text-ink"
                    title={`sắp xếp theo ${c}`}
                  >
                    {c}
                    {sort === c && <span className="pl-1 text-ink">{desc ? "▼" : "▲"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-basemap">
                  {data.columns.map((c) => {
                    const v = r[c];
                    const isNull = v === null || v === undefined;
                    return (
                      <td
                        key={c}
                        className={`whitespace-nowrap border-b border-r border-hairline px-1.5 py-0.5 ${
                          isNull ? "italic text-ink-muted" : "tabular-nums text-ink-2"
                        }`}
                      >
                        {isNull ? "không đo được" : formatValue(cellOf(v))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pt-1 text-note text-ink-muted">
        Bấm tiêu đề cột để sắp xếp; <span className="tabular-nums">null</span> luôn nằm cuối ở
        cả hai chiều, nên “dòng đầu” không đổi nghĩa khi đảo chiều sắp.
      </p>
    </Block>
  );
}

/** Arrow trả về nhiều kiểu; đưa về thứ `formatValue` nhận. Không nhánh nào biến null thành 0. */
function cellOf(v: unknown): number | boolean | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return String(v);
}
