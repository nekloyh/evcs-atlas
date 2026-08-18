/**
 * Chế độ PROXY POI — "một tỉnh vô danh", chỉ để NHÌN kết quả tách POI.
 *
 * ── VÌ SAO NÓ KHÔNG PHẢI MỘT TỈNH ─────────────────────────────────────────────────────
 *
 * Vòng lặp soi một lớp POI ở notebook là: viết một luật → in ra 9.605 dòng → *đoán* xem
 * chúng có thật là chung cư không. Một bảng không trả lời được câu hỏi đó; một polygon
 * nằm trên nền bản đồ thì trả lời được trong nửa giây ("cái này là một toà, cái kia là cả
 * một khu, cái nọ nằm giữa ruộng").
 *
 * Nhưng bộ đang soi KHÔNG phải một bộ dữ liệu tỉnh: nó trải 7 tỉnh, nó có thể là phần *bị
 * loại* của một luật, cột của nó đổi sau mỗi lần chạy lại notebook, và nó **chưa được
 * kiểm chứng gì cả**. Mở nó ở màn hình tỉnh sẽ cho nó mượn toàn bộ uy tín của màn hình đó
 * — phủ, bậc màu theo phân vị, KPI tổng cung — trong khi không con số nào trong số đó có
 * mẫu số ở đây. Vì thế: một màn hình riêng, **không một phép tính nào**, và nói thẳng
 * ngay trên thanh tiêu đề rằng đây là dữ liệu đang thử.
 *
 * ── MỘT KHÁI NIỆM: "POI" ──────────────────────────────────────────────────────────────
 *
 * Lớp trên bản đồ tên là **POI**, không phải `CHUNG_CU`/`KHU_DO_THI`. Đó là yêu cầu, và
 * nó cũng là điều đúng: `lop` là thứ đang được KIỂM, không phải thứ được dùng để vẽ. Cột
 * `lop` vẫn in đầy đủ ở panel của từng dòng — chỗ nó là một *quan sát*, chứ không phải một
 * kênh thị giác nói rằng nó đã đúng.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DatasetPicker } from "../ui/DatasetPicker";
import { COLD_HEX } from "../viz/palette";
import {
  bboxOf,
  chiMuc,
  inGiaTri,
  khop,
  loadProxyManifest,
  loadProxySet,
  sapKhoa,
  type ProxyFeature,
  type ProxyManifest,
  type ProxySet,
} from "./data";
import { docGeoJSON, gioUtc, khoaNap, laTam, tomTat } from "./nap";
import { NapFile } from "./NapFile";
import { ProxyMap, type FitRequest } from "./ProxyMap";

/** Khoá hash của tập đang xem — cùng hợp đồng §9: link là lời hứa. */
const SET_KEY = "tap";

const readSetKey = () =>
  new URLSearchParams(window.location.hash.replace(/^#/, "")).get(SET_KEY);

/**
 * Ghi khoá tập vào hash — hoặc XOÁ nó, khi tập đang xem chỉ sống trong tab.
 *
 * Đây là chỗ hợp đồng §9 ("link là một lời hứa") gặp tập nạp tay, và nó phải rẽ: một tập
 * xuất bằng lệnh có file trên đĩa nên `#tap=b3` mở lại đúng cái đó ở máy khác; một tập thả
 * tay thì KHÔNG — ghi khoá của nó vào hash là hứa một thứ chỉ có trong RAM của tab này.
 * Người nhận link sẽ mở ra một khoá không khớp gì và rơi về tập mặc định, mà không hiểu vì
 * sao. Xoá khoá đi thì link nói đúng thứ nó thật sự chở: "mở chế độ POI".
 */
function writeSetKey(key: string | null): void {
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (key === null) p.delete(SET_KEY);
  else p.set(SET_KEY, key);
  history.replaceState(null, "", `#${p.toString()}`);
}

const nf = (n: number) => n.toLocaleString("vi-VN");

export default function ProxyApp() {
  const [man, setMan] = useState<ProxyManifest | null>(null);
  const [setKey, setSetKey] = useState<string | null>(readSetKey());
  const [feats, setFeats] = useState<ProxyFeature[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [showPoints, setShowPoints] = useState(true);
  const [selected, setSelected] = useState<ProxyFeature | null>(null);
  const [hovered, setHovered] = useState<ProxyFeature | null>(null);
  const [fit, setFit] = useState<FitRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tập NẠP TAY, chỉ sống trong tab. Mô tả (`ProxySet`) vào state vì nó vẽ ra giao diện;
  // feature vào `ref` vì nó KHÔNG vẽ gì trực tiếp và một mảng 10 nghìn phần tử đi qua
  // `setState` là một lần so sánh thừa ở mỗi render.
  const [napped, setNapped] = useState<ProxySet[]>([]);
  const napFeats = useRef(new Map<string, ProxyFeature[]>());
  const [dangNap, setDangNap] = useState<string | null>(null);
  /** Manifest hỏng/vắng — GỢI Ý, không phải lỗi: bản golive không có file này là chuyện thường. */
  const [manErr, setManErr] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  // Người dùng đã tự chọn một tập chưa. Cổng cho manifest: một promise về MUỘN không được
  // kéo màn hình về tập mặc định sau khi người dùng đã thả file hoặc đổi ô TẬP. Cache ở
  // `loadProxyManifest` đã bịt nguyên nhân hay gặp nhất, nhưng nguyên nhân không phải là
  // thứ cần tin — điều kiện thắng/thua ở đây mới là.
  const daChon = useRef(false);
  const chon = (k: string) => {
    daChon.current = true;
    setSetKey(k);
  };

  useEffect(() => {
    void loadProxyManifest().then(
      (m) => {
        setMan(m);
        // Tập trong link thắng; không có thì lấy tập xuất GẦN NHẤT — ở một vòng lặp soi dữ
        // liệu, tập vừa xuất xong gần như luôn là tập muốn xem.
        if (daChon.current) return;
        const k = readSetKey();
        setSetKey(m.tap.find((t) => t.key === k)?.key ?? m.tap[0]?.key ?? null);
      },
      (e: unknown) => setManErr(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  // Tập nạp tay đứng TRƯỚC tập trên đĩa: cái vừa thả vào gần như luôn là cái muốn xem, và
  // nó cũng là cái sẽ biến mất trước — để nó lẫn dưới 12 dòng đã xuất là giấu nó đi.
  const tapAll = useMemo(() => [...napped, ...(man?.tap ?? [])], [napped, man]);

  const set: ProxySet | null = useMemo(
    () => tapAll.find((t) => t.key === setKey) ?? null,
    [tapAll, setKey],
  );

  useEffect(() => {
    if (!set) return;
    setSelected(null);
    if (laTam(set)) {
      // Không có gì để `fetch` — feature đã nằm trong RAM từ lúc đọc file. `setLoading(false)`
      // phải có mặt: nhánh này có thể chen vào giữa một lần tải tập trên đĩa, và cái
      // `.finally` của lần tải đó đã bị `huy` chặn lại.
      setLoading(false);
      writeSetKey(null);
      setFeats(napFeats.current.get(set.key) ?? []);
      setFit({ bbox: set.bbox, nonce: Date.now() });
      return;
    }
    setLoading(true);
    setFeats(null);
    writeSetKey(set.key);
    // `huy` KHÔNG phải một phòng xa lý thuyết — đã đo: thả một file vào trong lúc một tập
    // 11 MB trên đĩa còn đang tải, thì `.then` của tập cũ về SAU và ghi đè `feats` của tập
    // mới. Panel nói "2 POI" trong khi lớp đếm 9.613 và bản đồ vẽ dữ liệu của tập kia —
    // đúng kiểu sai im lặng mà cả màn hình này được dựng ra để bắt.
    let huy = false;
    void loadProxySet(set)
      .then(
        (f) => {
          if (huy) return;
          setFeats(f);
          setFit({ bbox: set.bbox, nonce: Date.now() });
        },
        (e: unknown) => !huy && fail(e),
      )
      .finally(() => !huy && setLoading(false));
    return () => {
      huy = true;
    };
  }, [set]);

  /**
   * Đọc một hay nhiều file người dùng đưa vào — TUẦN TỰ, không `Promise.all`.
   *
   * Thả 5 file parquet cùng lúc và đọc song song là 5 buffer nằm trong worker DuckDB cùng
   * một lúc; tuần tự thì đỉnh bộ nhớ bằng file lớn nhất. Đọc xong file nào thì file đó vào
   * bộ chọn ngay, nên chờ tuần tự không hề trông như đứng im.
   *
   * Một file hỏng KHÔNG chặn những file còn lại: người thả cả thư mục vào không phải đoán
   * xem app dừng ở file thứ mấy.
   */
  const napFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      for (const file of files) {
        setDangNap(file.name);
        try {
          const kq = /\.parquet$/i.test(file.name)
            ? await (await import("./nap-parquet")).docParquet(file)
            : docGeoJSON(await file.text());
          // Khoá né tập TRÊN ĐĨA (tập đã kiểm, không được để một file thả tay che), nhưng
          // KHÔNG né tập nạp tay cùng tên — thả lại cùng một file là THAY nó.
          const key = khoaNap(
            file.name,
            (man?.tap ?? []).map((t) => t.key),
          );
          const s = tomTat({
            key,
            nguon: file.name,
            bytes: file.size,
            kq,
            luc: gioUtc(new Date()),
          });
          napFeats.current.set(key, kq.feats);
          setNapped((cu) => [s, ...cu.filter((t) => t.key !== key)]);
          chon(key);
        } catch (e) {
          fail(e);
        } finally {
          setDangNap(null);
        }
      }
    },
    [man],
  );

  // Chỉ mục lọc dựng MỘT lần cho mỗi tập, không phải mỗi lần gõ — xem `chiMuc`.
  const index = useMemo(() => (feats ?? []).map(chiMuc), [feats]);
  const shown = useMemo(
    () => (feats ?? []).filter((_, i) => khop(index[i]!, q)),
    [feats, index, q],
  );
  const nPoly = useMemo(() => shown.filter((f) => f.geometry.type !== "Point").length, [shown]);

  const fitTo = (bbox: [number, number, number, number] | null) =>
    bbox && setFit({ bbox, nonce: Date.now() });

  return (
    <div className="flex h-full flex-col bg-panel text-ink">
      <nav className="flex h-11 shrink-0 items-center gap-4 border-b border-hairline px-4 text-heading">
        <span className="font-semibold tracking-[0.14em]">POI · TỈNH VÔ DANH</span>
        {/* Nhãn CẢNH BÁO, không phải trang trí: mọi thứ trên màn hình này là dữ liệu chưa
            kiểm chứng, và người xem phải biết điều đó trước khi đọc một mark nào. */}
        <span className="border border-hairline px-1.5 py-0.5 text-note uppercase tracking-wide text-ink-muted">
          chế độ test · không có phép tính nào
        </span>
        <div className="ml-auto flex items-center gap-4">
          <DatasetPicker />
        </div>
        <label className="flex items-center gap-1.5 text-body text-ink-2">
          <span className="uppercase tracking-wide text-ink-muted">TẬP</span>
          <select
            value={set?.key ?? ""}
            onChange={(e) => chon(e.target.value)}
            disabled={!tapAll.length}
            className="max-w-[22rem] bg-transparent text-ink outline-none disabled:opacity-40"
          >
            {!tapAll.length && (
              <option value="">{man || manErr ? "chưa có tập nào" : "đang nạp…"}</option>
            )}
            {/* HAI nhóm, và ranh giới giữa chúng là ranh giới của cả tính năng này: nhóm
                trên biến mất khi tải lại trang, nhóm dưới thì không. Trộn chúng thành một
                danh sách phẳng là mời người dùng đóng tab với một tập họ tưởng đã lưu. */}
            {!!napped.length && (
              <optgroup label="NẠP TAY — chỉ trong tab này">
                {napped.map((t) => (
                  <option key={t.key} value={t.key}>
                    ◇ {t.key} — {nf(t.n)} POI
                  </option>
                ))}
              </optgroup>
            )}
            {!!man?.tap.length && (
              <optgroup label="ĐÃ XUẤT — có file trên đĩa">
                {man.tap.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key} — {nf(t.n)} POI
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <NapFile onFiles={(f) => void napFiles(f)} dangNap={dangNap} />
      </nav>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <ProxyMap
            feats={shown}
            selected={selected}
            onSelect={setSelected}
            onHover={setHovered}
            fit={fit}
            showPoints={showPoints}
          />
          {error && (
            <div className="absolute inset-x-0 top-0 z-10 border-b border-hairline bg-panel px-4 py-2 text-heading">
              {error}
            </div>
          )}
          {(loading || dangNap) && (
            <div className="absolute left-3 top-3 z-10 border border-hairline bg-panel/95 px-2 py-1 text-body text-ink-muted">
              đang {dangNap ? `đọc ${dangNap}` : `nạp ${set?.file}`}…
            </div>
          )}
          {/* KHÔNG có tập nào — và ở một bản đã golive đây là màn hình ĐẦU TIÊN người dùng
              thấy, không phải một trạng thái lỗi hiếm gặp. Nó phải nói ra việc cần làm
              (thả một file) chứ không phải một lệnh terminal mà họ không có repo để chạy. */}
          {!set && !dangNap && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel/70">
              <div className="max-w-md border border-dashed border-hairline px-8 py-7 text-center">
                <div className="text-heading font-semibold">Chưa có tập POI nào</div>
                <p className="mt-2 text-title leading-relaxed text-ink-muted">
                  Kéo một file <b className="text-ink-2">.geojson</b> hoặc{" "}
                  <b className="text-ink-2">.parquet</b> thả vào cửa sổ này — hoặc bấm{" "}
                  <b className="text-ink-2">＋ NẠP FILE</b> ở thanh trên. File được đọc ngay trong
                  trình duyệt: không gửi đi đâu, không ghi xuống đĩa, và mất khi tải lại trang.
                </p>
                {manErr && (
                  <p className="mt-3 border-t border-hairline pt-2 text-body text-ink-muted">
                    {manErr}
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Bảng đọc của POI đang rê chuột — đặt TRÊN bản đồ, cùng lý do với màn hình toàn
              quốc: nó đổi theo con trỏ, và mắt không nên rời khỏi chỗ đang chỉ. */}
          {hovered && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-sm border border-hairline bg-panel/95 px-3 py-2 text-body">
              <div className="text-title font-semibold">
                {String(hovered.properties["name"] ?? "— không có tên —")}
              </div>
              <div className="text-ink-muted">
                {hovered.properties.co_hinh ? "có đa giác" : "chỉ biết vị trí"}
                {typeof hovered.properties["area_m2"] === "number" &&
                  ` · ${nf(Math.round(hovered.properties["area_m2"]))} m²`}
              </div>
            </div>
          )}
        </main>

        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-l border-hairline text-body">
          <Group title="LỚP">
            {/* MỘT lớp, tên "POI". Không tách theo `lop` — xem docstring của file. */}
            <div className="flex items-start gap-2 px-3 py-1.5">
              <span
                className="mt-0.5 inline-block h-3 w-3 shrink-0 border-[1.5px]"
                style={{ borderColor: COLD_HEX[1], background: `${COLD_HEX[1]}2e` }}
              />
              <span>
                POI
                <span className="block text-ink-muted">
                  {feats
                    ? `${nf(shown.length)} đang hiện${q ? ` / ${nf(feats.length)}` : ""} · ${nf(nPoly)} có đa giác`
                    : "…"}
                </span>
              </span>
            </div>
            <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-basemap">
              <input
                type="checkbox"
                checked={showPoints}
                onChange={() => setShowPoints((v) => !v)}
              />
              <span>
                Hiện cả POI chỉ-điểm
                <span className="block text-ink-muted">
                  mark rỗng = chưa biết cạnh ở đâu; tắt đi để chỉ soi phần có đa giác
                </span>
              </span>
            </label>
          </Group>

          <Group title="LỌC">
            <div className="px-3 py-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="gõ để lọc — mọi cột, ví dụ: bus_stop, Vinhomes"
                className="w-full border border-hairline bg-panel px-2 py-1 outline-none focus:border-ink-muted"
              />
              <div className="mt-1 flex items-center justify-between text-ink-muted">
                <span>quét toàn bộ thuộc tính, không phân biệt hoa thường</span>
                <button
                  onClick={() => fitTo(bboxOf(shown))}
                  disabled={!shown.length}
                  className="cursor-pointer underline-offset-2 hover:underline disabled:cursor-default disabled:opacity-40"
                >
                  bay tới
                </button>
              </div>
            </div>
          </Group>

          {selected && (
            <Group title="MỘT POI">
              <div className="px-3 pb-2 pt-1">
                <div className="mb-1 flex items-center justify-between">
                  <button
                    onClick={() => fitTo(dot(selected))}
                    className="cursor-pointer text-ink-2 underline-offset-2 hover:underline"
                  >
                    bay tới điểm này
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="cursor-pointer text-ink-muted underline-offset-2 hover:underline"
                  >
                    bỏ chọn
                  </button>
                </div>
                {/* MỌI thuộc tính, nguyên văn. Đây là điểm của một proxy soi dữ liệu: cột
                    nào notebook vừa thêm thì nó hiện ra ở đây mà không phải sửa web. */}
                <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5">
                  {sapKhoa(selected.properties).map((k) => (
                    <Row key={k} k={k} v={inGiaTri(selected.properties[k])} />
                  ))}
                  <Row k="hình học" v={selected.geometry.type} />
                </dl>
              </div>
            </Group>
          )}

          {!!set?.diem_nhay.length && (
            <Group title="BAY TỚI">
              {set.diem_nhay.map((d) => (
                <button
                  key={d.ten}
                  onClick={() => fitTo(d.bbox)}
                  className="flex w-full cursor-pointer justify-between px-3 py-1 text-left text-ink-2 hover:bg-basemap"
                >
                  <span>{d.ten}</span>
                  <span className="tabular-nums text-ink-muted">{nf(d.n)}</span>
                </button>
              ))}
              <button
                onClick={() => fitTo(set.bbox)}
                className="w-full cursor-pointer px-3 py-1 text-left text-ink-muted hover:bg-basemap"
              >
                toàn bộ tập
              </button>
            </Group>
          )}

          <Group title="TẬP NÀY LÀ GÌ">
            {set ? (
              <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 px-3 py-2">
                <Row k="nguồn" v={set.nguon} />
                {/* Dòng CẢNH BÁO, đặt ngay dưới nguồn: nó là thứ khác biệt duy nhất giữa
                    hai loại tập, và người xem phải gặp nó trước khi đọc một con số nào. */}
                {laTam(set) && <Row k="trạng thái" v="nạp tay — mất khi tải lại trang" />}
                <Row k="POI" v={nf(set.n)} />
                <Row k="có đa giác" v={`${nf(set.n_hinh)} · ${pct(set.n_hinh, set.n)}`} />
                {set.n_bo_qua > 0 && <Row k="bỏ (không toạ độ)" v={nf(set.n_bo_qua)} />}
                <Row k="cột" v={nf(set.cot.length)} />
                <Row k="xuất lúc" v={set.xuat_utc.replace("T", " ").replace("+00:00", " UTC")} />
                <Row k="nặng" v={`${(set.bytes / 1e6).toFixed(1)} MB`} />
              </dl>
            ) : (
              <div className="px-3 py-2 text-ink-muted">chưa chọn tập nào</div>
            )}
          </Group>

          <Group title="ĐỌC MÀN HÌNH NÀY THẾ NÀO">
            <div className="space-y-1.5 px-3 py-2 leading-relaxed text-ink-muted">
              <p>
                Đây là <b className="text-ink-2">dữ liệu đang thử</b>, chưa qua bước kiểm nào của
                pipeline. Không có bậc màu, không có phủ, không có mẫu số — mọi POI một màu, và
                thứ duy nhất mark nói ra là <b className="text-ink-2">có đa giác</b> (đặc) hay{" "}
                <b className="text-ink-2">chỉ biết vị trí</b> (rỗng).
              </p>
              <p>
                Lớp tên là <b className="text-ink-2">POI</b> chứ không phải tên `lop`: `lop` là thứ
                đang được kiểm ở đây, nên nó không được dùng làm màu. Bấm một POI để xem nguyên văn
                mọi cột của dòng đó.
              </p>
              <p className="border-t border-hairline pt-1.5">
                <b className="text-ink-2">Đưa dữ liệu vào:</b> kéo-thả một file{" "}
                <code className="text-ink-2">.geojson</code> /{" "}
                <code className="text-ink-2">.parquet</code> vào cửa sổ. Cần cột{" "}
                <code className="text-ink-2">lat</code>/<code className="text-ink-2">lng</code>,
                hoặc hình học sẵn trong file. Đọc trong trình duyệt — không gửi đi đâu.
              </p>
              <p>
                Muốn tập ở lại sau khi tải lại trang thì phải xuất bằng lệnh:{" "}
                <code className="text-ink-2">make poi-proxy SRC=&lt;file.parquet&gt;</code>
              </p>
            </div>
          </Group>
        </aside>
      </div>
    </div>
  );
}

/** Bbox suy biến quanh một POI — "bay tới điểm này" cần một khung, không phải một điểm. */
function dot(f: ProxyFeature): [number, number, number, number] | null {
  const { lat, lng } = f.properties;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const d = 0.0015; // ~165 m — vừa một toà nhà cùng vài hàng xóm của nó
  return [lng - d, lat - d, lng + d, lat + d];
}

function pct(a: number, b: number): string {
  return b ? `${((a / b) * 100).toFixed(a / b > 0.9 || a / b < 0.1 ? 1 : 0)}%` : "—";
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="truncate text-ink-muted" title={k}>
        {k}
      </dt>
      {/* `break-all` + `min-w-0`: giá trị ở đây là dữ liệu LẠ — một `tags` JSON 300 ký tự
          không có dấu cách nào sẽ đẩy cả rail rộng ra và sinh thanh cuộn ngang, đúng như
          đã đo ở lần dựng đầu. Rail phải chịu được mọi chuỗi, không chỉ chuỗi đẹp. */}
      <dd className="min-w-0 break-all">{v}</dd>
    </>
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
