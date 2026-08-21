/**
 * Trục giờ của hồ sơ 168 giờ — được phép gọi nó là gì.
 *
 * `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §16, §24-1.
 *
 * ── Vấn đề, và vì sao nó là một hợp đồng chứ không phải một chuỗi định dạng ────────────
 *
 * `dow`/`hour` trong `station_occupancy_profile_168h.parquet` được bucket ở THƯỢNG NGUỒN
 * (`aGiang-evcs`), và không cột nào, không khoá metadata nào của file ấy nói nó bucket
 * theo múi giờ nào. Cửa sổ quan sát trong manifest là UTC, nhưng cửa sổ không nói gì về
 * trục: một pipeline hoàn toàn có thể ghi cửa sổ bằng UTC rồi bucket giờ bằng giờ địa
 * phương.
 *
 * Hệ quả đo được: đỉnh của Hà Nội rơi vào ô `t = 167`. Đọc theo giờ địa phương thì đó là
 * 23:00 và đường cong hợp lý; đọc theo UTC thì đó là 06:00 sáng và câu chuyện khác hẳn.
 * **Không có gì trong kho nói được cái nào đúng.** Nên UI không được chọn hộ.
 *
 * Luật: vắng field ⇒ trục là **ô giờ 0…23**, kèm một câu công bố. Có field hợp lệ ⇒ được
 * in nhãn đồng hồ kèm tên múi giờ. Client **không bao giờ** chuyển đổi lại 168 bucket —
 * field chỉ CÔNG BỐ nghĩa của trục đã tạo ở thượng nguồn, nó không phải một tham số để
 * dịch chuyển dữ liệu.
 */

/**
 * IANA `Area/Location` (cho phép `Area/Sub/Location`), hoặc đúng chữ `UTC`.
 *
 * Kiểm ở đây thay vì tin manifest, và không dùng `Intl.DateTimeFormat` để kiểm: một chuỗi
 * lạ sẽ khiến `Intl` ném lỗi lúc render, tức một manifest hỏng làm trắng cả cột thay vì
 * rơi về trạng thái "chưa công bố" — đúng chế độ hỏng mà cả hợp đồng này tồn tại để tránh.
 */
const IANA_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2}$/;

export type OccTimezoneState =
  | { kind: "unknown" }
  | { kind: "declared"; tz: string };

export const OCC_TZ_UNKNOWN: OccTimezoneState = { kind: "unknown" };

/** Đọc `snapshots.occupancy_hour_tz`. Vắng **và** không hợp lệ đều cho `unknown`. */
export function occTimezoneOf(
  snapshots: { occupancy_hour_tz?: string | null } | null | undefined,
): OccTimezoneState {
  const raw = snapshots?.occupancy_hour_tz;
  if (typeof raw !== "string") return OCC_TZ_UNKNOWN;
  const tz = raw.trim();
  if (!tz) return OCC_TZ_UNKNOWN;
  if (tz === "UTC" || IANA_RE.test(tz)) return { kind: "declared", tz };
  return OCC_TZ_UNKNOWN;
}

/**
 * Nhãn của một ô giờ. `ô giờ 18` khi chưa công bố, `18:00 · Asia/Ho_Chi_Minh` khi đã.
 *
 * Kể cả khi đã công bố, nhãn vẫn KHÔNG gắn ngày lịch: hồ sơ là một **tuần điển hình** gộp
 * từ 30 ngày, không phải một dấu thời gian.
 */
export function hourBucketLabel(hour: number, state: OccTimezoneState): string {
  if (state.kind === "declared") {
    return `${String(hour).padStart(2, "0")}:00 · ${state.tz}`;
  }
  return `ô giờ ${hour}`;
}

/** Nhãn ngắn cho trục/chip, không kèm tên múi giờ. */
export function hourBucketShort(hour: number, state: OccTimezoneState): string {
  return state.kind === "declared" ? `${String(hour).padStart(2, "0")}h` : `ô ${hour}`;
}

export const OCC_TZ_DISCLOSURE = "Múi giờ của profile chưa được công bố";

/** Câu công bố đi kèm mọi chỗ in giờ; `null` khi múi giờ đã được khai. */
export function occTimezoneDisclosure(state: OccTimezoneState): string | null {
  return state.kind === "declared" ? null : OCC_TZ_DISCLOSURE;
}
