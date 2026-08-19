/**
 * Phase 5 §1 — Search index, normalization and ranking.
 *
 * Pure: no React, no DuckDB, no store. Every function here runs under `node --test`.
 *
 * Hai luật đứng sau toàn bộ module này:
 *
 * 1. **Xếp hạng là một thứ tự TOÀN PHẦN.** Bản cũ `break` ở `count >= 5` khi quét mảng thô,
 *    nên năm kết quả trả về là năm dòng ĐẦU TIÊN trong tệp, không phải năm dòng khớp nhất.
 *    Đo được trên `commune.geojson` thật: `ha` khớp 17 xã, bản cũ trả đúng 5 dòng đầu và
 *    **`Phường Hà Đông` không bao giờ tới được** — không có dấu hiệu nào nói còn 12 dòng nữa.
 *    Ở đây mọi ứng viên được chấm điểm trước, cắt sau, và phần bị cắt được ĐẾM để UI nói ra.
 *
 * 2. **Chỉ khớp trên trường có thật trong gói đang mở.** `district_name` / `ten_huyen` /
 *    `ten_xa` KHÔNG có trong `commune.geojson` (21 property, không cái nào là chúng), nên
 *    nhánh khớp huyện của bản cũ là code chết và mọi subtitle xã tụt về `Mã xã: …`. Tệ hơn:
 *    fixture của test tự bịa `district_name` ra, nên test xanh trong khi tính năng không thể
 *    chạy. Cả hai đã bị xoá; `test/search.test.ts` có một phép grep chặn chúng quay lại.
 */

import type { CommuneCollection, CommuneFeature, GridCell, StationPoint } from "../data/queries";

// ── Kiểu công khai — §1.3.1 ─────────────────────────────────────────────────

export type SearchResultKind = "commune" | "station" | "cell";

/**
 * Bậc khớp, cao thắng — §1.4.
 *
 * `SECONDARY` cố tình thấp hẳn: `operator` có 933/939 dòng là `VinFast`, nên nếu nó cùng bậc
 * với tên thì gõ `vinfast` sẽ quét sạch danh sách và đẩy mọi xã ra ngoài.
 */
export const MATCH_TIER = {
  EXACT_ID: 100,
  PREFIX_ID: 80,
  NAME_PREFIX: 60,
  WORD_START: 40,
  SUBSTRING: 20,
  SECONDARY: 10,
} as const;

export type MatchTier = (typeof MATCH_TIER)[keyof typeof MATCH_TIER];

export interface MatchScore {
  readonly tier: MatchTier;
  /** Vị trí khớp trong chuỗi đã khớp — khớp sớm hơn là khớp tốt hơn. */
  readonly offset: number;
  /** Độ dài chuỗi đã khớp — `Xã Đa Phúc` thắng `Xã Đa Phúc Thượng` cho `da phuc`. */
  readonly length: number;
}

export interface SearchResult {
  /** Duy nhất toàn cục; ĐÚNG dạng dây của khoá `c`, nên cũng dùng làm React key. */
  readonly id: string;
  readonly kind: SearchResultKind;
  /** Nguyên bản, còn dấu — KHÔNG BAO GIỜ là dạng đã chuẩn hoá. */
  readonly title: string;
  readonly subtitle: string;
  readonly center: readonly [number, number];
  /** Chỉ Xã có; Trạm và Ô suy mức phóng lúc điều hướng (§1.8). */
  readonly bbox: readonly [number, number, number, number] | null;
  readonly score: MatchScore;
}

/**
 * Kết quả một lượt xếp hạng.
 *
 * `matched` là số ứng viên TRƯỚC mọi phép cắt. Nó có mặt ở đây vì §1.5 cấm cắt im lặng:
 * "còn N kết quả khác" chỉ nói được nếu N được mang ra khỏi hàm. G5 của §6.6 cũng đọc nó.
 */
export interface SearchOutcome {
  readonly results: readonly SearchResult[];
  /** Tổng ứng viên khớp, trước cả cap theo loại lẫn cap toàn cục. */
  readonly matched: number;
  /** `matched - results.length` — số dòng đã bị cắt, luôn phải hiện ra. */
  readonly truncated: number;
}

// ── Hằng của hợp đồng — §1.4, §1.5 ──────────────────────────────────────────

/**
 * Dưới 2 ký tự thì không xếp hạng.
 *
 * Một ký tự chạm bậc `WORD_START` ở hàng trăm dòng, và mọi cap đặt lên trên đó đều là một
 * lát cắt tuỳ tiện. §1.6 cho nó một trạng thái riêng (Gợi ý) thay vì một danh sách sai.
 */
export const MIN_QUERY_LENGTH = 2;
/** Cap theo LOẠI — giữ cho một loại không nuốt chỗ của loại khác (§1.5). */
export const PER_KIND_CAP = 5;
/** Cap TOÀN CỤC, áp SAU khi xếp hạng và sau cap theo loại (§1.5). */
export const GLOBAL_CAP = 10;

/**
 * Độ dài tối thiểu của tiền tố mã H3 — §0.3-E.
 *
 * Đo trên 4.400 mã của gói: len 7 → nhóm lớn nhất 924 ô; len 8 → 98; len 9 → 7; len 10 → duy
 * nhất. Dưới 9 ký tự, "ba ô đầu" là một lát cắt tuỳ tiện của tới 924 ô không phân biệt được.
 * Cổng cũ `q.startsWith("8")` còn vô nghĩa hơn: cả 4.400 mã đều bắt đầu bằng `8841`.
 */
export const H3_MIN_PREFIX = 9;
export const COMMUNE_CODE_MIN_PREFIX = 2;
export const STATION_ID_MIN_PREFIX = 3;

/** Truy vấn TRÔNG như mã H3: đủ dài để phân biệt, chưa quá 15. */
const H3_QUERY_RE = /^[0-9a-f]{9,15}$/;

/**
 * Truy vấn này có phải một mã H3 hợp lệ không.
 *
 * SearchBar cần nó để phân biệt "không tìm thấy" với "chưa nạp lớp Ô" (§1.6): báo không tìm
 * thấy khi corpus vắng mặt là một phủ định sai, không phải một câu trả lời.
 */
export function isCellQuery(normalizedQuery: string): boolean {
  return H3_QUERY_RE.test(normalizedQuery);
}

// ── Chuẩn hoá — §1.2 ────────────────────────────────────────────────────────

/**
 * Hàm chuẩn hoá DUY NHẤT. Cả truy vấn lẫn mọi chuỗi vào index đều đi qua đây.
 *
 * | Bước | Luật | Vì sao, đã đo |
 * |---|---|---|
 * | 1 | `toLowerCase()` | — |
 * | 2 | `NFD` rồi bỏ `\p{Mn}` | Gấp mọi thanh điệu và cả dấu móc/trăng/mũ. `ơ` (U+01A1) phân rã thành `o` + U+031B (loại `Mn`), nên không cần luật riêng. |
 * | 3 | `đ → d` | `Đ` (U+0110) mang nét GẠCH chứ không phải dấu tổ hợp, `NFD` không phân rã nó. Bước 1 đã hạ về `đ` rồi, nên luật `.replace(/Đ/g,"d")` cũ là code chết và đã bỏ. |
 * | 4 | `, . - + / _ ( )` → một dấu cách | 456/939 tên trạm chứa một trong số đó; 933/939 `station_code` chứa `.` (`C.AC000091`); một tên xã chứa `-` (`Phường Văn Miếu - Quốc Tử Giám`). Thiếu bước này thì cả `c ac000091` lẫn `van mieu quoc tu giam` đều trả 0 dòng — đã đo. |
 * | 5 | Gộp dãy khoảng trắng | 30 tên trạm và 17 địa chỉ chứa dấu cách đôi. |
 * | 6 | `trim()` | — |
 *
 * Hàm LUỸ ĐẲNG: `normalize(normalize(x)) === normalize(x)`. Tính chất này được KHẲNG ĐỊNH
 * trong test chứ không giả định, vì xếp hạng so một truy vấn đã chuẩn hoá với một index đã
 * chuẩn hoá sẵn — lệch một bước là lệch cả bảng.
 */
export function normalizeSearchText(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[,.\-+/_()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Hình học — §5 ───────────────────────────────────────────────────────────

/**
 * Hộp bao của một feature, hoặc `null` khi feature không có toạ độ nào.
 *
 * Bản cũ trả `[105.8, 21.0]` cho trường hợp đó — một xã không có hình được đặt vào GIỮA Hà
 * Nội và trông y hệt một kết quả thật. §5 đổi luật: không toạ độ thì RỚT khỏi index.
 */
export function featureBounds(
  feature: CommuneFeature,
): [number, number, number, number] | null {
  const geom = feature.geometry;
  if (!geom || !geom.coordinates) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const traverse = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lng, lat] = coords as [number, number];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const item of coords) traverse(item);
    }
  };

  traverse(geom.coordinates);
  if (minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

// ── Index — §1.2, §1.3 ──────────────────────────────────────────────────────

interface CommuneEntry {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly center: readonly [number, number];
  readonly bbox: readonly [number, number, number, number];
  /** `commune_name` đã chuẩn hoá, còn nguyên phân loại — `phuong ba dinh`. */
  readonly full: string;
  /** `full` đã bỏ phân loại dẫn đầu khi nó KHỚP `commune_kind` — `ba dinh`. */
  readonly core: string;
  readonly code: string;
}

interface StationEntry {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly center: readonly [number, number];
  readonly name: string;
  readonly stationId: string;
  readonly stationCode: string;
  /** `address`, `commune_name` (null trên cả 229 dòng BUFFER), `operator` — đã chuẩn hoá. */
  readonly secondary: readonly string[];
  /** Tiêu đề đã chuẩn hoá, tính SẴN cho bậc phân định thứ 4 của `compareScored`. */
  readonly sortKey: string;
}

interface CellEntry {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly center: readonly [number, number];
  readonly h3: string;
}

export interface SearchIndex {
  readonly communes: readonly CommuneEntry[];
  readonly stations: readonly StationEntry[];
  readonly cells: readonly CellEntry[];
}

export interface SearchCorpus {
  readonly communes: CommuneCollection | null;
  readonly stations: readonly StationPoint[] | null;
  readonly cells: readonly GridCell[] | null;
}

export const EMPTY_INDEX: SearchIndex = { communes: [], stations: [], cells: [] };

/** Kết quả của một truy vấn chưa đủ dài — dùng để KHÔNG phải dựng index mới biết là rỗng. */
export const EMPTY_SEARCH_OUTCOME: SearchOutcome = { results: [], matched: 0, truncated: 0 };

/** Nhãn phân loại xã (để hiện) và token đã chuẩn hoá của nó (để tách lõi). */
const COMMUNE_KIND: Record<string, { label: string; token: string }> = {
  PHUONG: { label: "Phường", token: "phuong" },
  XA: { label: "Xã", token: "xa" },
};

/** Tiền tố phân loại ở dạng đã chuẩn hoá — dùng để nhận ra truy vấn tự mang phân loại. */
const CLASSIFIER_TOKENS = ["phuong", "xa"] as const;

/**
 * Tách tên LÕI của một xã.
 *
 * Suy từ `commune_kind` chứ không cắt chuỗi: một xã tương lai tên thật là `Xã Xã Tắc` sẽ bị
 * cắt cụt nếu ta chỉ bỏ token đầu. Khi token dẫn đầu KHÔNG khớp `commune_kind`, `core` bằng
 * `full` và một cảnh báo gọi tên dòng đó ra — dữ liệu lệch phải nói, không được đoán.
 */
function communeCore(full: string, kind: string, code: string): string {
  const spec = COMMUNE_KIND[kind];
  if (!spec) return full;
  const prefix = `${spec.token} `;
  if (!full.startsWith(prefix)) {
    if (typeof console !== "undefined") {
      console.warn(
        `[search] xã ${code}: commune_kind=${kind} nhưng tên "${full}" không bắt đầu bằng "${prefix.trim()}" — giữ nguyên tên đầy đủ.`,
      );
    }
    return full;
  }
  return full.slice(prefix.length);
}

function communeSubtitle(props: Record<string, unknown>, code: string): string {
  const kind = String(props["commune_kind"] ?? "");
  const parts: string[] = [];
  const kindLabel = COMMUNE_KIND[kind]?.label;
  if (kindLabel) parts.push(kindLabel);
  parts.push(`Mã ${code}`);
  const pop = props["population"];
  if (typeof pop === "number" && Number.isFinite(pop)) {
    parts.push(`${INT_FMT.format(Math.round(pop))} người`);
  }
  return parts.join(" · ");
}

/**
 * Bộ định dạng dùng lại, KHÔNG gọi `Number.prototype.toLocaleString` trong vòng lặp.
 *
 * `toLocaleString` dựng một `Intl.NumberFormat` mới ở mỗi lần gọi. Index dựng subtitle cho
 * 4.400 ô, tức 4.400 lần dựng, và đó là phần lớn nhất của thời gian dựng index đo được.
 */
const INT_FMT = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function stationSubtitle(s: StationPoint): string {
  const parts: string[] = [];
  const address = (s.address ?? "").trim();
  if (address) parts.push(truncate(address, 48));
  parts.push(s.inScope ? "IN" : "vành đệm 5 km");
  if (s.nPorts !== null && s.nPorts !== undefined) parts.push(`${s.nPorts} cổng`);
  return parts.join(" · ");
}

function cellSubtitle(c: GridCell): string {
  const parts: string[] = [];
  if (typeof c.pop === "number" && Number.isFinite(c.pop)) {
    parts.push(`${INT_FMT.format(Math.round(c.pop))} người`);
  }
  if (typeof c.dist === "number" && Number.isFinite(c.dist)) {
    parts.push(`${INT_FMT.format(Math.round(c.dist))} m tới trạm`);
  }
  return parts.length ? parts.join(" · ") : "Chưa có số đo cho ô này";
}

/**
 * Dựng index một lần cho mỗi corpus của mỗi phiên dữ liệu (§4, G3).
 *
 * Gõ phím KHÔNG dựng lại: `SearchBar` memo hoá trên chính ba mảng mà `App` đã giữ ổn định.
 */
export function buildSearchIndex(corpus: SearchCorpus): SearchIndex {
  const communes: CommuneEntry[] = [];
  for (const feature of corpus.communes?.features ?? []) {
    const props = feature.properties as Record<string, unknown>;
    const code = String(props["commune_code"] ?? "");
    const name = String(props["commune_name"] ?? "");
    if (!code || !name) continue;
    const bbox = featureBounds(feature);
    // §7.2-8: không toạ độ ⇒ rớt khỏi index, không đặt vào giữa Hà Nội.
    if (!bbox) continue;
    const full = normalizeSearchText(name);
    communes.push({
      id: `commune:${code}`,
      title: name,
      subtitle: communeSubtitle(props, code),
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
      bbox,
      full,
      core: communeCore(full, String(props["commune_kind"] ?? ""), code),
      code,
    });
  }

  const stations: StationEntry[] = [];
  for (const s of corpus.stations ?? []) {
    if (!Number.isFinite(s.lng) || !Number.isFinite(s.lat)) continue;
    const name = (s.name ?? "").trim();
    const title = name || `Trạm ${s.stationCode ?? s.id}`;
    const secondary: string[] = [];
    // `commune_name` null trên đúng 229/229 dòng BUFFER — trường CÓ ĐIỀU KIỆN, không phải
    // trường thiếu. Chỉ index 710 dòng có nó.
    for (const raw of [s.address, s.communeName, s.operator]) {
      const norm = normalizeSearchText(raw);
      if (norm) secondary.push(norm);
    }
    stations.push({
      id: `station:${s.id}`,
      title,
      subtitle: stationSubtitle(s),
      center: [s.lng, s.lat],
      name: normalizeSearchText(name),
      stationId: normalizeSearchText(s.id),
      stationCode: normalizeSearchText(s.stationCode),
      secondary,
      sortKey: normalizeSearchText(title),
    });
  }

  const cells: CellEntry[] = [];
  for (const c of corpus.cells ?? []) {
    if (!c.h3 || !Number.isFinite(c.lng) || !Number.isFinite(c.lat)) continue;
    const h3 = c.h3.toLowerCase();
    cells.push({
      id: h3,
      title: `Ô H3 ${h3}`,
      subtitle: cellSubtitle(c),
      center: [c.lng, c.lat],
      h3,
    });
  }

  return { communes, stations, cells };
}

// ── Chấm điểm — §1.4 ────────────────────────────────────────────────────────

function nameScore(haystack: string, q: string): MatchScore | null {
  if (!haystack) return null;
  const idx = haystack.indexOf(q);
  if (idx < 0) return null;
  if (idx === 0) return { tier: MATCH_TIER.NAME_PREFIX, offset: 0, length: haystack.length };
  if (haystack[idx - 1] === " ") {
    return { tier: MATCH_TIER.WORD_START, offset: idx, length: haystack.length };
  }
  return { tier: MATCH_TIER.SUBSTRING, offset: idx, length: haystack.length };
}

function idScore(identifier: string, q: string, minPrefix: number): MatchScore | null {
  if (!identifier) return null;
  if (identifier === q) {
    return { tier: MATCH_TIER.EXACT_ID, offset: 0, length: identifier.length };
  }
  if (q.length >= minPrefix && identifier.startsWith(q)) {
    return { tier: MATCH_TIER.PREFIX_ID, offset: 0, length: identifier.length };
  }
  return null;
}

function secondaryScore(fields: readonly string[], q: string): MatchScore | null {
  let best: MatchScore | null = null;
  for (const f of fields) {
    const idx = f.indexOf(q);
    if (idx < 0) continue;
    const candidate: MatchScore = { tier: MATCH_TIER.SECONDARY, offset: idx, length: f.length };
    if (!best || compareScore(candidate, best) < 0) best = candidate;
  }
  return best;
}

/** So hai điểm: bậc giảm dần, rồi offset tăng, rồi length tăng. Âm nghĩa là a tốt hơn. */
function compareScore(a: MatchScore, b: MatchScore): number {
  if (a.tier !== b.tier) return b.tier - a.tier;
  if (a.offset !== b.offset) return a.offset - b.offset;
  return a.length - b.length;
}

/**
 * Giữ bậc CAO NHẤT của một ứng viên — §1.4: "một ứng viên không bao giờ xuất hiện hai lần".
 */
function bestOf(...scores: (MatchScore | null)[]): MatchScore | null {
  let best: MatchScore | null = null;
  for (const s of scores) {
    if (!s) continue;
    if (!best || compareScore(s, best) < 0) best = s;
  }
  return best;
}

/**
 * Ứng viên kèm KHOÁ SẮP XẾP đã tính sẵn.
 *
 * Khoá nằm ở đây chứ không tính trong comparator, và đó là một sửa lỗi có số đo. Bản đầu gọi
 * `normalizeSearchText(title)` ngay trong `compareResults`; với `vinfast` (933 ứng viên) phép
 * sắp xếp gọi comparator ~9.200 lần, tức ~18.400 lần NFD + bốn regex, và p95 đo được là
 * **31,7 ms cho MỖI PHÍM GÕ**. Tính trước một lần cho mỗi ứng viên đưa nó về dưới 1 ms.
 * Chuẩn hoá là rẻ; chuẩn hoá bên trong một vòng `O(n log n)` thì không.
 */
interface Scored {
  readonly result: SearchResult;
  /** Tiêu đề đã chuẩn hoá — bậc phân định thứ 4. */
  readonly key: string;
}

/**
 * Thứ tự TOÀN PHẦN — §1.4.
 *
 * Năm bậc phân định, áp lần lượt tới khi một bậc phân biệt được. Bậc 4 so chuỗi đã gấp về
 * ASCII bằng `<` chứ không `localeCompare`: thứ tự không được đổi theo dữ liệu ICU của
 * runtime, nếu không cùng một corpus + cùng một truy vấn lại ra hai danh sách khác nhau.
 * Bậc 5 là `id`, duy nhất theo cấu tạo, nên quan hệ này là một thứ tự toàn phần thật.
 *
 * LOẠI cố ý KHÔNG phải một bậc phân định: một xã không thắng một trạm vì nó là xã, nó thắng
 * vì nó khớp tốt hơn. Loại được nói bằng icon của dòng.
 */
function compareScored(a: Scored, b: Scored): number {
  const byScore = compareScore(a.result.score, b.result.score);
  if (byScore !== 0) return byScore;
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  return a.result.id < b.result.id ? -1 : a.result.id > b.result.id ? 1 : 0;
}

/** Truy vấn có tự mang token phân loại xã không (`phuong`, `xa`, `phuong ba dinh`…). */
function queryHasClassifier(q: string): boolean {
  return CLASSIFIER_TOKENS.some((t) => q === t || q.startsWith(`${t} `));
}

/**
 * Xếp hạng một truy vấn trên một index đã dựng.
 *
 * Trình tự bắt buộc: **chấm hết → sắp xếp → cắt**. Cắt trong lúc quét là đúng thứ lỗi §0.3-C
 * mô tả; cắt sau khi sắp xếp thì phần bị bỏ là phần khớp kém nhất, và số lượng của nó đếm
 * được nên UI nói ra được.
 */
export function rankSearchResults(rawQuery: string, index: SearchIndex): SearchOutcome {
  const q = normalizeSearchText(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) return { results: [], matched: 0, truncated: 0 };

  const useFull = queryHasClassifier(q);

  const communeHits: Scored[] = [];
  for (const c of index.communes) {
    const score = bestOf(
      nameScore(useFull ? c.full : c.core, q),
      idScore(c.code, q, COMMUNE_CODE_MIN_PREFIX),
    );
    if (!score) continue;
    communeHits.push({
      result: {
        id: c.id,
        kind: "commune",
        title: c.title,
        subtitle: c.subtitle,
        center: c.center,
        bbox: c.bbox,
        score,
      },
      key: c.full,
    });
  }

  const stationHits: Scored[] = [];
  for (const s of index.stations) {
    const score =
      bestOf(
        nameScore(s.name, q),
        idScore(s.stationId, q, STATION_ID_MIN_PREFIX),
        idScore(s.stationCode, q, STATION_ID_MIN_PREFIX),
      ) ?? secondaryScore(s.secondary, q);
    if (!score) continue;
    stationHits.push({
      result: {
        id: s.id,
        kind: "station",
        title: s.title,
        subtitle: s.subtitle,
        center: s.center,
        bbox: null,
        score,
      },
      key: s.sortKey,
    });
  }

  const cellHits: Scored[] = [];
  // Cổng H3 đứng NGOÀI vòng lặp: dưới 9 ký tự không mã nào được xét, nên `884` trả 0 ô thay
  // vì 3 ô tuỳ tiện trong số 924 ô không phân biệt được.
  if (isCellQuery(q)) {
    for (const c of index.cells) {
      // `idScore` cho `EXACT_ID` khi bằng nhau và `PREFIX_ID` khi là tiền tố — truy vấn ở
      // đây luôn dài >= 9 nên cổng độ dài đã thoả sẵn.
      const score = idScore(c.h3, q, H3_MIN_PREFIX);
      if (!score) continue;
      cellHits.push({
        result: {
          id: c.id,
          kind: "cell",
          title: c.title,
          subtitle: c.subtitle,
          center: c.center,
          bbox: null,
          score,
        },
        key: c.h3,
      });
    }
  }

  const matched = communeHits.length + stationHits.length + cellHits.length;

  const capped: Scored[] = [];
  for (const bucket of [communeHits, stationHits, cellHits]) {
    bucket.sort(compareScored);
    for (let i = 0; i < Math.min(bucket.length, PER_KIND_CAP); i++) capped.push(bucket[i]!);
  }
  capped.sort(compareScored);
  const results = capped.slice(0, GLOBAL_CAP).map((x) => x.result);

  return { results, matched, truncated: matched - results.length };
}
