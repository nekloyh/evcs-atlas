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

const CODE_RE = /^[0-9]{2}$/;

/**
 * Giá trị `tinh=vn` — **cả nước**, không phải một tỉnh.
 *
 * Dùng lại khoá `tinh` thay vì thêm một khoá thứ hai vì đây đúng là cùng một câu hỏi: "bộ
 * dữ liệu nào đang mở". Ba giá trị, ba bộ, loại trừ nhau — vắng khoá là bộ Hà Nội đầy đủ,
 * hai chữ số là một tỉnh, `vn` là lớp gộp toàn quốc. Một khoá thứ hai sẽ cho phép trạng
 * thái vô nghĩa `#tinh=79&qg=1` và bắt mọi chỗ đọc phải quyết định cái nào thắng.
 *
 * KHÔNG khớp `CODE_RE` nên `PROVINCE` vẫn là `null` ở chế độ này: `dataPath()` không được
 * sinh tiền tố `p/vn/`, và mọi hằng của `queries.ts` không bao giờ chạy ở đây.
 */
export const NATIONAL = "vn";

/**
 * Bộ dữ liệu nào đang mở, suy từ MỘT chuỗi hash. Hàm THUẦN.
 *
 * Tách ra vì đây là hạt nhân của chiều tỉnh và nó không có test nào: `PROVINCE` là một
 * `const` đọc `window` lúc nạp module, nên không có cách nào gọi nó với một đầu vào khác.
 * Ba giá trị, ba bộ, loại trừ nhau — và "loại trừ nhau" là thứ cần assert, không phải thứ
 * cần tin.
 */
export function parseDataset(hash: string): { province: string | null; national: boolean } {
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get(PROVINCE_KEY);
  if (raw === NATIONAL) return { province: null, national: true };
  // Mã hỏng ⇒ về bộ mặc định, KHÔNG nổ. Cùng luật với mọi khoá hash khác (§9): một ký tự
  // gõ sai không được biến thành màn hình lỗi.
  return { province: raw && CODE_RE.test(raw) ? raw : null, national: false };
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

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get(PROVINCE_KEY);
}

function readProvince(): string | null {
  if (typeof window === "undefined") return null;
  return parseDataset(window.location.hash).province;
}

/** Đang xem lớp gộp TOÀN QUỐC (34 tỉnh một màn hình) chứ không phải một bộ dữ liệu tỉnh. */
export const isNationalMode: boolean = readRaw() === NATIONAL;

/**
 * Mã tỉnh đang xem, hoặc `null` = **bộ Hà Nội gốc** ở đường dẫn không tiền tố.
 *
 * Đọc MỘT lần lúc module nạp, đúng như `readHash()`. Hằng số trong suốt vòng đời trang là
 * điều kiện để ba thứ ở docstring trên an toàn.
 */
export const PROVINCE: string | null = readProvince();

/** Đang xem một tỉnh của store toàn quốc (chứ không phải bộ Hà Nội gốc)? */
export const isProvinceMode = PROVINCE !== null;

/** Tên file → đường dẫn tương đối trong `public/data/`, theo tỉnh đang mở. */
export function dataPath(name: string): string {
  return pathIn(PROVINCE, name);
}

/**
 * Chuyển sang tỉnh khác — đặt khoá `tinh` rồi TẢI LẠI. `null` về bộ Hà Nội gốc.
 *
 * Xoá mọi khoá khác của hash là CỐ Ý: `f` (trường), `c` (ô), `b` (brush), `s` (cảnh) đều
 * trỏ tới thứ của tỉnh cũ. Mang chúng sang tỉnh mới thì hoặc chúng vô nghĩa, hoặc tệ hơn,
 * chúng TRÔNG có nghĩa — một mã ô H3 của Hà Nội vẫn là một chuỗi hợp lệ ở Cà Mau.
 */
export function switchProvince(code: string | null): void {
  const hash = code ? `#${PROVINCE_KEY}=${code}` : "";
  window.location.href = window.location.pathname + window.location.search + hash;
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
