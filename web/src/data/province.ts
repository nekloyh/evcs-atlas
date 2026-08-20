/**
 * Chiều TỈNH của tầng dữ liệu — shim, không phải UI mới.
 *
 * `store/` toàn quốc phát `web/public/data/p/<province_code>/…` với **tên file giống hệt**
 * bộ Hà Nội đang chạy. Thứ duy nhất đổi là tiền tố đường dẫn, nên mọi hằng của `queries.ts`
 * chỉ cần đi qua `dataPath()` một lần và không hàm nào đổi chữ ký.
 *
 * ── Vì sao đổi tỉnh là TẢI LẠI TRANG, không phải đổi state ────────────────────────────
 *
 * Ba thứ trong app bị khoá theo tỉnh ngay từ lúc boot và không có đường rút lại sạch sẽ:
 *
 *   1. **DuckDB đã đăng ký file theo tên.** `registerFileURL` gắn một tên với một URL cho
 *      cả vòng đời worker. Đổi tỉnh mà giữ tên cũ là im lặng đọc lại dữ liệu tỉnh trước —
 *      bản đồ đổi tiêu đề mà không đổi số. (Ở đây tên ĐÃ mang tiền tố tỉnh nên hai tỉnh là
 *      hai tên khác nhau, tức bẫy đó đã bị bịt; nhưng nó chỉ bị bịt vì tên khác nhau.)
 *   2. **`manifest.json` cache một lần** — và manifest là thứ nói cột nào có mặt.
 *   3. **Bậc màu là PHÂN VỊ trên chính dữ liệu đang nạp** (`computeClassing`). Trộn hai
 *      tỉnh trong một phiên là để một thang màu cũ mô tả một phân phối mới.
 *
 * Tải lại tốn ~1 giây và đổi lại là **không có trạng thái nào của tỉnh A rò sang tỉnh B**.
 * Với một thao tác hiếm (đổi tỉnh), đó là đánh đổi đúng.
 */

/** Khoá hash chọn tỉnh. Đọc TRƯỚC mọi khoá khác vì nó quyết định dữ liệu, không phải cách xem. */
export const PROVINCE_KEY = "tinh";

/**
 * Giá trị `tinh=vn` — **cả nước**, không phải một tỉnh.
 *
 * Dùng lại khoá `tinh` thay vì thêm một khoá thứ hai vì đây đúng là cùng một câu hỏi: "bộ
 * dữ liệu nào đang mở". Bốn giá trị, bốn bộ, loại trừ nhau — vắng khoá là bộ Hà Nội đầy
 * đủ, hai chữ số là một tỉnh, `vn` là lớp gộp toàn quốc, `poi` là proxy. Một khoá thứ hai
 * sẽ cho phép trạng thái vô nghĩa `#tinh=79&qg=1` và bắt mọi chỗ đọc phải quyết định cái
 * nào thắng.
 *
 * KHÔNG khớp `CODE_RE` nên `PROVINCE` vẫn là `null` ở chế độ này: `dataPath()` không được
 * sinh tiền tố `p/vn/`, và mọi hằng của `queries.ts` không bao giờ chạy ở đây.
 */
export const NATIONAL = "vn";

/**
 * Giá trị `tinh=poi` — **chế độ PROXY POI**, một "tỉnh vô danh" để soi kết quả tách POI.
 *
 * Không phải một tỉnh và cố ý KHÔNG có mã: bảng đang soi có thể trải 7 tỉnh, có thể là
 * phần *bị loại* của một luật, có thể là 300 dòng của một xã. Gán cho nó một mã tỉnh là
 * mời nó vào cùng một danh mục với 34 bộ thật, và mọi con số của màn hình tỉnh (phủ, bậc
 * màu, KPI) sẽ nói về một mẫu số không tồn tại.
 *
 * Cùng lý do với `NATIONAL`, nó KHÔNG khớp `CODE_RE`: `dataPath()` không được sinh tiền
 * tố `p/poi/`, và không hằng nào của `queries.ts` chạy ở chế độ này.
 */
export const PROXY = "poi";

/** Thư mục của chế độ proxy — `vn.proxy_poi` ghi vào đây, không đụng bộ nào khác. */
export const PROXY_DIR = "proxy";
const CODE_RE = /^\d{2}$/;

/**
 * Bộ dữ liệu nào đang mở, suy từ MỘT chuỗi hash. Hàm THUẦN.
 *
 * Tách ra vì đây là hạt nhân của chiều tỉnh và nó không có test nào: `PROVINCE` là một
 * `const` đọc `window` lúc nạp module, nên không có cách nào gọi nó với một đầu vào khác.
 * Bốn giá trị, bốn bộ, loại trừ nhau — và "loại trừ nhau" là thứ cần assert, không phải
 * thứ cần tin.
 */
export function parseDataset(hash: string): {
  province: string | null;
  national: boolean;
  proxy: boolean;
} {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(PROVINCE_KEY);
  if (value === NATIONAL) return { province: null, national: true, proxy: false };
  if (value === PROXY) return { province: null, national: false, proxy: true };
  if (value && CODE_RE.test(value)) return { province: value, national: false, proxy: false };
  return { province: null, national: false, proxy: false };
}

/**
 * Tên file → đường dẫn tương đối, với một tỉnh CHO TRƯỚC. Hàm THUẦN.
 *
 * `dataPath` bọc nó bằng `PROVINCE` toàn cục; ở đây tỉnh là THAM SỐ, nên test gọi được
 * với mọi tỉnh mà không cần dựng `window`.
 */
export function pathIn(province: string | null, name: string): string {
  return province ? `p/${province}/${name}` : name;
}

function readProvince(): string | null {
  if (typeof window === "undefined") return null;
  return parseDataset(window.location.hash).province;
}

/** Đang xem lớp gộp TOÀN QUỐC (34 tỉnh một màn hình) chứ không phải một bộ dữ liệu tỉnh. */
export const isNationalMode =
  typeof window !== "undefined" && parseDataset(window.location.hash).national;

/** Đang ở chế độ PROXY POI — xem `PROXY`. */
export const isProxyMode =
  typeof window !== "undefined" && parseDataset(window.location.hash).proxy;

/**
 * Mã tỉnh đang xem, hoặc `null` = **bộ Hà Nội gốc** ở đường dẫn không tiền tố.
 *
 * Đọc MỘT lần lúc module nạp, đúng như `readHash()`. Hằng số trong suốt vòng đời trang là
 * điều kiện để ba thứ ở docstring trên an toàn.
 */
export const PROVINCE: string | null = readProvince();

/** Đang xem một tỉnh của store toàn quốc (chứ không phải bộ Hà Nội gốc)? */
export const isProvinceMode = PROVINCE !== null;

/**
 * Bundle tỉnh mặc định đang là pilot Hà Nội.
 *
 * Manifest gốc vẫn được giữ để tương thích với bundle cũ, nhưng các lớp đầy đủ của Hà Nội
 * đã được export vào `data/p/01/`. Nếu để `null` đi thẳng thành thư mục gốc, app sẽ đọc được
 * grid rồi 404 ở stations/roads/occupancy — đúng kiểu lỗi làm bản đồ hiện một phần nhưng
 * Data/Story và nhiều nút không hoạt động.
 */
const DEFAULT_PROVINCE_BUNDLE = "01";

/** Tên file → đường dẫn tương đối trong `public/data/`, theo tỉnh đang mở. */
export function dataPath(name: string): string {
  return pathIn(PROVINCE ?? DEFAULT_PROVINCE_BUNDLE, name);
}

/**
 * Giá trị `tinh` của bộ ĐANG MỞ, dạng mà bộ chọn dùng làm `value`. Hàm THUẦN, có test.
 *
 * `""` = bộ Hà Nội gốc, `"vn"` = toàn quốc, `"poi"` = proxy, `"NN"` = một tỉnh. Đây là
 * hàm nghịch của `switchDataset`, và nó phải tồn tại riêng vì `PROVINCE` **không đủ để
 * trả lời câu hỏi này**: ở cả ba trường hợp "Hà Nội gốc", "toàn quốc" và "proxy" thì
 * `PROVINCE` đều là `null`. Một bộ chọn đọc `PROVINCE ?? ""` sẽ đứng ở "Hà Nội" trong khi
 * màn hình đang là POI — tức cái điều khiển duy nhất nói ta đang ở đâu lại nói sai.
 */
export function currentDataset(hash: string): string {
  const d = parseDataset(hash);
  if (d.national) return NATIONAL;
  if (d.proxy) return PROXY;
  return d.province ?? "";
}

/**
 * Chuyển sang BỘ DỮ LIỆU khác — đặt khoá `tinh` rồi TẢI LẠI. `null`/`""` về bộ Hà Nội gốc.
 *
 * Tên là `switchDataset` chứ không phải `switchProvince`: từ lúc có `tinh=vn` thì hai
 * trong bốn giá trị nó nhận **không phải một tỉnh**, và cái tên cũ đã kịp sinh ra ba bộ
 * điều khiển rời nhau (mỗi màn hình tự dựng một cái, không cái nào biết đủ bốn bộ).
 *
 * Xoá mọi khoá khác của hash là CỐ Ý: `f` (trường), `c` (ô), `b` (brush), `s` (cảnh), `tap`
 * (tập proxy) đều trỏ tới thứ của bộ cũ. Mang chúng sang bộ mới thì hoặc chúng vô nghĩa,
 * hoặc tệ hơn, chúng TRÔNG có nghĩa — một mã ô H3 của Hà Nội vẫn là một chuỗi hợp lệ ở Cà Mau.
 *
 * ── Vì sao ghi `location.hash` chứ không ghi `location.href` ──────────────────────────
 *
 * Bản cũ gán `href = pathname + search` (bỏ hẳn fragment) rồi `reload()`. Với hai bộ đều
 * có fragment thì chạy đúng; với **đích là Hà Nội gốc** (fragment rỗng) thì không: gán một
 * URL *không có* fragment không phải một phép đổi fragment, `reload()` chạy ngay sau đó
 * nạp lại đúng URL cũ — **kể cả hash cũ**. Kết quả là mục "Hà Nội — bộ đầy đủ" trong bộ
 * chọn bấm không ra gì, im lặng. Đã đo bằng trình duyệt: `#tinh=poi&tap=…` → chọn Hà Nội
 * → hash không đổi.
 *
 * Ghi `location.hash` thì mọi đích đi qua **cùng một cơ chế** (đổi fragment, đồng bộ), rồi
 * `reload()` nạp lại URL đã đổi. Bộ Hà Nội gốc thành `#` hoặc không fragment tuỳ trình
 * duyệt — cả hai đều `parseDataset` ra "không có khoá", tức đúng bộ.
 */
export function switchDataset(id: string | null): void {
  window.location.hash = id ? `${PROVINCE_KEY}=${id}` : "";
  window.location.reload();
}

// --- chỉ mục toàn quốc ----------------------------------------------------
export interface ProvinceIndexEntry {
  province_code: string;
  province_name: string;
  population: number;
  n_stations: number | null;
  n_ports: number | null;
  ports_per_10k_pop: number | null;
  in_store: boolean;
}

export interface ProvinceIndex {
  type: "FeatureCollection";
  features: { geometry: unknown; properties: ProvinceIndexEntry }[];
}

let indexCache: Promise<ProvinceIndex | null> | null = null;

/**
 * 34 đa giác tỉnh + số cung — **ngân sách tải lần đầu**, đo được 0,32 MB.
 *
 * Trả `null` thay vì ném khi thiếu file: một bản build chỉ có bộ Hà Nội vẫn phải chạy được
 * y như trước. Thiếu chỉ mục nghĩa là "chưa có store toàn quốc", không nghĩa là hỏng.
 */
export function loadProvinceIndex(): Promise<ProvinceIndex | null> {
  indexCache ??= fetch(new URL("data/provinces.geojson", window.location.href))
    .then((r) => (r.ok ? (r.json() as Promise<ProvinceIndex>) : null))
    .catch(() => null);
  return indexCache;
}

let proxyCountCache: Promise<number> | null = null;

/**
 * Có bao nhiêu tập POI đã xuất — `0` nghĩa là **chưa chạy `make poi-proxy`**.
 *
 * Ở đây chứ không ở `proxy/data.ts`, và đó không phải chuyện tiện: câu hỏi này là "bộ dữ
 * liệu nào ĐANG CÓ trên đĩa", cùng hạng với `loadProvinceIndex`, và nó được hỏi bởi bộ
 * chọn — thứ chạy ở **cả ba** màn hình. Để nó ở gói proxy là kéo cả gói proxy vào bundle
 * của màn hình tỉnh chỉ để đếm một con số.
 *
 * Bộ chọn dùng con số này để CHÚ THÍCH mục POI, KHÔNG để làm mờ nó: từ khi màn hình đó
 * nạp được file thả tay, `0` không còn nghĩa là "bấm vào không ra gì" — nó nghĩa là "chưa
 * có tập nào sẵn trên đĩa, hãy thả một file vào". Xem `DatasetPicker`.
 */
export function countProxySets(): Promise<number> {
  proxyCountCache ??= fetch(new URL(`data/${PROXY_DIR}/manifest.json`, window.location.href))
    .then((r) => (r.ok ? (r.json() as Promise<{ tap?: unknown[] }>) : null))
    .then((m) => (Array.isArray(m?.tap) ? m.tap.length : 0))
    .catch(() => 0);
  return proxyCountCache;
}
