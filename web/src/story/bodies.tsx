import { useEffect, useState } from "react";

import { pct, type Manifest } from "../data/manifest";
import {
  fetchAreaPop,
  fetchDetourStats,
  fetchRoads,
  fetchShowcaseRoutes,
  type CommuneCollection,
  type DetourStats,
  type ShowcaseRoute,
} from "../data/queries";
import { selectionWireOf, useStore } from "../state/store";
import { formatNumber } from "../ui/format";
import { LorenzChart, CALLOUT_POP_SHARE } from "./LorenzChart";
import { areaShareForPop, lorenz, popShareForArea, type Lorenz } from "./lorenz";
import { MAJOR_BRIDGE_MIN_M, majorBridges } from "./bridges";
import { Figure, Para, Pending, SoWhat, Stat } from "./parts";
import {
  DETOUR_THRESHOLD,
  EUCLID_COVERAGE_RADIUS_M,
  GMM_CLAIM,
  NAMED_COMMUNES,
} from "./scenes";

/**
 * Thân của bốn cảnh — DESIGN.md §14b.
 *
 * **Không con số nào là hằng số trong file này.** Tất cả đo lúc chạy từ cột đã ship. §14b
 * nói vì sao luật §7c/§13c-1 gắt hơn ở đây so với chỗ khác: một câu chuyện là chỗ dễ nhất
 * để một con số cũ sống sót qua ba lần đổi dữ liệu mà không ai thấy, vì không ai đọc lại nó.
 */

const pctStr = (x: number) => x.toLocaleString("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// ── Cảnh A — cầu vón cục ───────────────────────────────────────────────────────

export function SceneVonCuc() {
  const [data, setData] = useState<Lorenz | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAreaPop().then(
      (rows) => !cancelled && setData(lorenz(rows)),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Para>Không đo được đường Lorenz: {error}</Para>;
  if (!data) return <Pending label="phân bố dân trên diện tích" />;

  const half = areaShareForPop(data, CALLOUT_POP_SHARE);
  const tenth = popShareForArea(data, 0.1);

  return (
    <>
      {half !== null && (
        <Figure
          value={pctStr(half)}
          unit="diện tích"
          caption={
            <>
              là tất cả những gì cần để chứa <strong>một nửa</strong> dân số Hà Nội. Phần diện
              tích còn lại — hơn chín phần mười thành phố — chứa nửa kia.
            </>
          }
        />
      )}
      <LorenzChart data={data} />
      {tenth !== null && (
        <Stat label={`10% diện tích dày dân nhất chứa`} value={pctStr(tenth)} />
      )}
      <Stat label="hệ số Gini của dân trên diện tích" value={formatNumber(data.gini)} />
      <Stat label="ô lưới đưa vào phép tính" value={formatNumber(data.nCells)} />
      <Para>
        Đường cong trên là <em>Lorenz</em>: ô lưới xếp theo mật độ giảm dần, rồi cộng dồn cả
        diện tích lẫn dân số. Đường thẳng nhạt là hình dạng mà một Hà Nội <em>trải đều</em>{" "}
        sẽ có. Khoảng cách giữa hai đường chính là sự vón cục — nó lớn tới mức không cần đo
        cũng thấy.
      </Para>
      <Para>
        Diện tích ở đây là phần <strong>nằm trong ranh giới Hà Nội</strong> (
        <code>area_km2 × area_frac</code>), không phải diện tích hình học của ô. Dân số của ô
        biên chỉ tính phần trong thành phố, nên mẫu số phải khớp — nếu không, ô biên được gán
        một phần diện tích mà dân của nó không ở trong đó, và đường cong sẽ nói Hà Nội trải
        đều hơn thực tế.
      </Para>
      <SoWhat>
        Nếu cầu trải đều thì thuật toán đúng là chia lưới, và mọi mô hình cụm đều thừa. Cầu
        <strong> không</strong> trải đều, và nó vón cục quanh vài tâm chứ không rải ngẫu nhiên
        — đó chính xác là cấu trúc mà một <strong>mô hình hỗn hợp</strong> nắm bắt được.
      </SoWhat>
    </>
  );
}

// ── Cảnh B — cung lệch khỏi cầu ────────────────────────────────────────────────

interface CommuneFacts {
  code: string;
  name: string;
  population: number | null;
  ports: number | null;
  perPop: number | null;
  /** gấp mấy lần trung vị 126 xã — `null` khi trung vị bằng 0 hoặc thiếu số */
  vsMedian: number | null;
}

/**
 * Số của hai xã được gọi tên, đo trên chính 126 feature đã nạp.
 *
 * Hàm riêng, không viết thẳng trong JSX: nó có ba nhánh "thiếu số thì nói câu không có số"
 * và những nhánh đó là chỗ một `?? 0` hay mọc ra.
 */
function communeFacts(fc: CommuneCollection | null): { facts: CommuneFacts[]; median: number | null } {
  if (!fc) return { facts: [], median: null };

  const ratios = fc.features
    .map((f) => f.properties["ports_per_10k_pop"])
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
  const median =
    ratios.length === 0
      ? null
      : ratios.length % 2
        ? ratios[(ratios.length - 1) / 2]!
        : (ratios[ratios.length / 2 - 1]! + ratios[ratios.length / 2]!) / 2;

  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const facts = NAMED_COMMUNES.map((n) => {
    const f = fc.features.find((x) => x.properties["commune_code"] === n.code);
    const perPop = num(f?.properties["ports_per_10k_pop"]);
    return {
      code: n.code,
      name: String(f?.properties["commune_name"] ?? `xã ${n.code}`),
      population: num(f?.properties["population"]),
      ports: num(f?.properties["n_ports"]),
      perPop,
      vsMedian: perPop !== null && median ? perPop / median : null,
    };
  });
  return { facts, median };
}

export function SceneCungLech({ communes }: { communes: CommuneCollection | null }) {
  const selected = useStore(selectionWireOf);
  const flyTo = useStore((s) => s.flyTo);
  const { facts, median } = communeFacts(communes);

  if (!communes) return <Pending label="126 đa giác xã" />;

  return (
    <>
      {facts.map((f, i) => {
        const named = NAMED_COMMUNES[i]!;
        const on = selected === `commune:${f.code}`;
        return (
          <button
            key={f.code}
            onClick={() => flyTo(named.view, `commune:${f.code}`)}
            className={`block w-full cursor-pointer border-b border-hairline px-4 py-3 text-left ${
              on ? "bg-basemap" : "hover:bg-basemap"
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-heading font-semibold">{f.name}</span>
              {on && <span className="text-note tracking-[0.1em] text-cold-3">ĐANG XEM</span>}
            </div>
            <div className="pt-1 text-body leading-snug text-ink-2">{named.why}</div>
            <div className="flex gap-4 pt-2 tabular-nums">
              <span>
                <span className="text-display font-semibold">
                  {f.population === null ? "—" : formatNumber(f.population)}
                </span>
                <span className="pl-1 text-note text-ink-muted">dân</span>
              </span>
              <span>
                <span className="text-display font-semibold">
                  {f.ports === null ? "—" : formatNumber(f.ports)}
                </span>
                <span className="pl-1 text-note text-ink-muted">cổng</span>
              </span>
              <span>
                <span className="text-display font-semibold">
                  {f.perPop === null ? "—" : formatNumber(f.perPop)}
                </span>
                <span className="pl-1 text-note text-ink-muted">cổng/10k dân</span>
              </span>
            </div>
            {f.vsMedian !== null && (
              <div className="pt-1 text-body text-ink-muted tabular-nums">
                {f.vsMedian < 1
                  ? `${formatNumber(f.vsMedian)}× trung vị`
                  : `${formatNumber(f.vsMedian)}× trung vị 126 xã`}
              </div>
            )}
          </button>
        );
      })}

      {median !== null && <Stat label="trung vị 126 xã" value={`${formatNumber(median)} cổng/10k dân`} />}

      <Para>
        Bấm vào một trong hai thẻ trên để bay tới xã đó. Bản đồ đang tô{" "}
        <strong>cổng trên 10k dân</strong> — cùng trường mở app, vì luận điểm này đã được trả
        lời ngay ở màn hình đầu tiên và không cần tô lại. Thang tuần tự giữ
        ngữ pháp chung: <strong>nhạt = ít cổng/10k dân, đậm = nhiều</strong>. Chấm là
        939 trạm công cộng.
      </Para>
      <Para>
        Đây là <em>tỉ số</em>, và tỉ số với mẫu số nhỏ thì vọt: một xã ít dân có vài trạm lớn
        sẽ lên rất cao mà không có nghĩa là nó được phục vụ tốt hơn. Đó chính là lý do phải
        đọc kèm cột dân số, và là lý do hai xã trên được gọi tên chứ không chỉ được tô màu.
      </Para>
      <SoWhat>
        Cung không đi theo cầu, và nó lệch tới <strong>hai bậc độ lớn</strong> giữa hai đơn vị
        cùng cấp trong cùng một thành phố. Nếu không lệch thì không có bài toán đặt trạm nào
        để giải — chỉ có bài toán nhân bản đều.
      </SoWhat>
    </>
  );
}

// ── Cảnh C — thước đo phải theo mạng đường ─────────────────────────────────────

export function SceneDiVong({ manifest }: { manifest: Manifest | null }) {
  const [stats, setStats] = useState<DetourStats | null>(null);
  const [routes, setRoutes] = useState<ShowcaseRoute[] | null>(null);
  const [nBigBridges, setNBigBridges] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const beat = useStore((s) => s.beat) ?? "mang-duong";
  const setBeat = useStore((s) => s.setBeat);

  useEffect(() => {
    let cancelled = false;
    const fail = (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e));
    void fetchDetourStats(DETOUR_THRESHOLD, EUCLID_COVERAGE_RADIUS_M).then(
      (s) => !cancelled && setStats(s),
      fail,
    );
    void fetchShowcaseRoutes().then((r) => !cancelled && setRoutes(r), fail);
    // Số cầu lớn đo LÚC CHẠY trên chính mảng sẽ được vẽ — không gõ "48" vào đây. Ngưỡng
    // đổi thì con số trong câu đổi theo, và hai thứ không thể trôi khỏi nhau.
    void fetchRoads().then((rs) => !cancelled && setNBigBridges(majorBridges(rs).length), fail);
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Para>Không đo được hệ số đi vòng: {error}</Para>;
  if (!stats) return <Pending label="hệ số đi vòng trên 4.400 ô" />;

  const falsePositive = stats.euclidCovered - stats.networkCovered;
  const fpShare = stats.euclidCovered ? falsePositive / stats.euclidCovered : null;
  const km = EUCLID_COVERAGE_RADIUS_M / 1000;
  const r = manifest?.roads;
  // Một cặp = 2 feature (network + euclid) của cùng một ô. Gộp lại theo ô để mỗi ô một dòng.
  const pairs = routes ? routes.filter((x) => x.kind === "network") : [];

  return (
    <>
      {/* Chuyển NHỊP. Hai nhịp = hai vai đã phân ở §11: mạng đường là NGUYÊN NHÂN nhìn thấy
          được, 672 ô là HẬU QUẢ đo được. Nút đứng đầu panel vì nó đổi cả bản đồ. */}
      <div className="flex gap-px border-b border-hairline bg-hairline text-body">
        {[
          { id: "mang-duong", label: "nguyên nhân" },
          { id: "hau-qua", label: "hậu quả đo được" },
        ].map((b) => (
          <button
            key={b.id}
            onClick={() => setBeat(b.id)}
            className={`flex-1 cursor-pointer py-1.5 ${
              beat === b.id ? "bg-basemap font-semibold text-ink" : "bg-panel text-ink-2 hover:text-ink"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {beat === "mang-duong" ? (
        <>
          <Para>
            Bản đồ đang tô <strong>mạng đường</strong>, không phải ô lưới: mỗi đoạn phố mang
            khoảng cách theo đường tới trạm gần nhất. Đây là cùng phép Dijkstra đã tính khoảng
            cách cho từng ô — chỉ khác là lần này ta giữ lại nhãn trên <em>đoạn</em> thay vì
            ném nó đi.
          </Para>
          {r && (
            <>
              <Stat label="đoạn đường được tô" value={formatNumber(r.ways_shipped)} />
              <Stat
                label={`đoạn cầu dài > ${formatNumber(MAJOR_BRIDGE_MIN_M / 1000)} km — kẻ đậm`}
                value={nBigBridges === null ? "…" : formatNumber(nBigBridges)}
              />
              <Stat
                label="tổng đoạn mang cờ cầu (phần lớn là cống)"
                value={formatNumber(r.bridge_ways_shipped)}
              />
              <Stat
                label="đoạn không tới được — vẽ xám, không phải 0"
                value={formatNumber(r.ways_unreachable_null_dist)}
              />
            </>
          )}
          <Para>
            Nhìn màu <em>chảy</em>: nó đi dọc phố, đậm dần khi xa trạm, rồi <strong>khựng lại
            ở sông Hồng</strong> — nét xanh nhạt. Bờ đông không hề xa trung tâm theo đường chim
            bay, nhưng theo đường đi thì nó phải vòng qua vài cây cầu, và mọi thứ ở đó tối đi
            cùng một lúc.
          </Para>
          <Para>
            Sáu cây cầu chính qua sông Hồng trong phạm vi này là Thăng Long · Nhật Tân · Long
            Biên · Chương Dương · Vĩnh Tuy · Thanh Trì.{" "}
            <span className="text-ink-muted">
              Tên là chữ biên tập, <strong>không</strong> đến từ dữ liệu: bản trích OSM không
              mang cột <code>name</code>. Vì thế chúng nằm ở đây dưới dạng câu chứ không dán
              làm nhãn trên bản đồ — dán nhãn là khẳng định một toạ độ mà ta không neo được.
            </span>
          </Para>

          {pairs.length > 0 && (
            <>
              <h3 className="border-y border-hairline bg-basemap px-4 py-1 text-body tracking-[0.1em] text-ink-2">
                BA CẶP TUYẾN — ĐƯỜNG THẬT ↔ CHIM BAY
              </h3>
              {pairs.map((p) => (
                <div key={p.h3} className="border-b border-hairline px-4 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-title font-semibold">{p.communeName}</span>
                    <span className="ml-auto text-heading font-semibold tabular-nums">
                      {formatNumber(p.detour)}×
                    </span>
                  </div>
                  <div className="pt-0.5 text-body tabular-nums text-ink-2">
                    đường thật {formatNumber(p.networkM)} m ↔ chim bay {formatNumber(p.euclidM)} m
                  </div>
                </div>
              ))}
              <Para>
                Nét lạnh <strong>đậm</strong> là đường đi có thật mà Dijkstra trả về; nét lạnh{" "}
                <strong>nhạt</strong> là đoạn thẳng chim bay của cùng ô đó. Ba ô chọn theo{" "}
                <em>mỗi bậc dân số một ô</em>, không theo một ngưỡng đơn — một ngưỡng đơn thì
                hoặc toàn ô vành ngoài, hoặc mất hẳn ô cực đoan.
              </Para>
            </>
          )}
          <Para>
            Đây cũng là chỗ thay cho cảnh “vòng tròn chim bay morph sang đường đồng khoảng
            cách” từng định làm: hai cột khoảng cách đều đo tới trạm <strong>gần nhất</strong>,
            không tới một trạm chỉ định, nên không có đường đồng khoảng cách nào để morph. Vẽ
            một đường đi có thật thì rẻ hơn và thành thật hơn một hình tròn nội suy.
          </Para>
        </>
      ) : (
        <>
          <Figure
            value={formatNumber(stats.nCells)}
            unit="ô"
            caption={
              <>
                có đường đi thật dài hơn <strong>{DETOUR_THRESHOLD} lần</strong> đường chim
                bay — và <strong>{formatNumber(stats.pop)} người</strong> sống trong chúng. Đây
                là hậu quả đo được của cái cơ chế vừa xem.
              </>
            }
          />
          <Stat
            label="hệ số đi vòng, trung vị toàn lưới"
            value={stats.median === null ? "—" : `${formatNumber(stats.median)}×`}
          />
          <Stat
            label={`ô mà CHIM BAY nói đã phủ trong ${formatNumber(km)} km`}
            value={formatNumber(stats.euclidCovered)}
          />
          <Stat label="ô mà MẠNG ĐƯỜNG xác nhận đã phủ" value={formatNumber(stats.networkCovered)} />
          <Stat
            label="chênh lệch — ô báo phủ nhầm"
            value={
              fpShare === null
                ? formatNumber(falsePositive)
                : `${formatNumber(falsePositive)} · ${pctStr(fpShare)}`
            }
          />
          <Para>
            Sai số của chim bay không ngẫu nhiên — nó sai <strong>về một phía</strong>. Đường
            đi thật không bao giờ ngắn hơn đường thẳng, nên mọi ước lượng chim bay đều{" "}
            <em>lạc quan</em>: nó báo đã phủ ở nơi chưa phủ, không bao giờ ngược lại. Ở bán
            kính {formatNumber(km)} km, {fpShare === null ? "phần lệch" : pctStr(fpShare)} số ô
            nó nói là đã phủ thì thực tế chưa.
          </Para>
          <Para>
            Bản đồ chỉ vẽ {formatNumber(stats.nCells)} ô thoả điều kiện. Ô còn lại{" "}
            <strong>không vẽ gì cả</strong>, kể cả vân xám của ô không đo được: chúng không
            phải “không biết”, chúng là “biết, và không thoả” — hai thứ khác nhau thì không
            được đeo cùng một ký hiệu (§7a).
          </Para>
        </>
      )}

      <SoWhat>
        Đây là câu trả lời cho <em>“vì sao không dùng k-means Euclid cho xong”</em>. k-means
        tối thiểu hoá khoảng cách <strong>thẳng</strong>; ở Hà Nội, khoảng cách thẳng là một
        đại lượng sai lệch <strong>có hệ thống và có nguyên nhân hình học</strong> — sông Hồng
        cùng số cầu ít. Thước đo phải theo mạng đường, nên phép tính khoảng cách của thuật
        toán cũng phải vậy.
      </SoWhat>
    </>
  );
}

// ── Cảnh kết — ba điều ta không biết ───────────────────────────────────────────

export function SceneChuaBiet({ manifest }: { manifest: Manifest | null }) {
  const util = manifest?.coverage["util_cell"];
  const snap = manifest?.snapshots;

  return (
    <>
      <ol className="list-none">
        <Unknown
          n={1}
          title="Ta không quan sát được cầu — ta chỉ suy ra nó"
          body={
            <>
              Mức sử dụng thật chỉ đo được ở{" "}
              {/* Vế "% dân" chỉ có mặt khi bộ dữ liệu CÓ lớp dân số — store toàn quốc chưa
                  có, và `pop_share` khi đó vắng hẳn (xem `Coverage.pop_share`). Bỏ vế đó đi
                  chứ không in "0% dân": số 0 ở đây là một khẳng định sai. */}
              {util ? (
                <strong>
                  {pct(util.cell_share)} số ô
                  {util.pop_share !== undefined ? ` (${pct(util.pop_share)} dân)` : ""}
                </strong>
              ) : (
                <strong>một phần nhỏ số ô</strong>
              )}
              , vì telemetry chỉ tồn tại ở nơi <em>đã có trạm</em>. Chỗ chưa có trạm thì theo
              định nghĩa không có dữ liệu sạc nào — mà đó chính là chỗ bài toán hỏi. Nên “cầu”
              trong toàn bộ ba luận điểm trên là <strong>dân số và điểm quan tâm</strong>, một
              biến thay thế, không phải lượt sạc đã xảy ra.
            </>
          }
        />
        <Unknown
          n={2}
          title="Ta không biết chỗ nào cắm điện được"
          body={
            <>
              Lớp lưới điện đã <strong>ra khỏi phạm vi</strong>: không có khoảng cách tới trạm
              biến áp, không có công suất khả dụng, không có kVA. Bộ dữ liệu này cũng không còn
              cột <code>buildable</code>. Hệ quả thẳng thắn: một điểm mà thuật toán chọn có thể
              hoàn hảo về cầu và <em>không đấu được điện</em>, và không có gì trong app này báo
              được điều đó. Vẽ một con số kVA ở đây sẽ là bịa số.
            </>
          }
        />
        <Unknown
          n={3}
          title="Ta không biết ngày mai — đây là một ảnh chụp"
          body={
            <>
              Trạm, OSM và telemetry đều là ảnh chụp một thời điểm
              {snap && (
                <>
                  {" "}
                  (<span className="tabular-nums">{snap.stations_canonical}</span> · OSM{" "}
                  <span className="tabular-nums">{snap.osm_pbf}</span>)
                </>
              )}
              . Không có xu hướng, không có mùa vụ, và <strong>không có kế hoạch mở trạm</strong>{" "}
              của bất kỳ nhà vận hành nào. Một xã hôm nay 0 cổng có thể đã nằm trong kế hoạch quý
              sau; bộ dữ liệu không biết, nên app cũng không biết.
            </>
          }
        />
      </ol>

      <SoWhat>
        Ghép ba luận điểm lại chính là luận điểm của cả app: <strong>{GMM_CLAIM}</strong>
      </SoWhat>

      <Para>
        Ba giới hạn trên không làm ba luận điểm kia sai — chúng nói ba luận điểm đó{" "}
        <em>đủ cho việc gì</em>. Đủ để chọn <strong>dạng mô hình</strong> và{" "}
        <strong>thước đo khoảng cách</strong>. Chưa đủ để nói một điểm cụ thể là điểm nên xây.
      </Para>
      <Para>
        App này <strong>không</strong> ship kết quả thuật toán — chưa có kết quả nào. Nó dựng
        nền cho việc đó, và cảnh này là chỗ nói ra phần nền còn thiếu.
      </Para>
    </>
  );
}

function Unknown({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <li className="border-b border-hairline px-4 py-3">
      <div className="flex gap-2">
        <span className="shrink-0 text-body tabular-nums text-ink-muted">{n}</span>
        <div>
          <div className="text-heading font-semibold leading-snug">{title}</div>
          <p className="pt-1.5 text-body leading-relaxed text-ink-2">{body}</p>
        </div>
      </div>
    </li>
  );
}
