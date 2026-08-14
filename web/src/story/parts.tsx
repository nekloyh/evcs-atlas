import type { ReactNode } from "react";

/**
 * Mảnh dùng chung của bốn cảnh — DESIGN.md §14c.
 *
 * Cùng khuôn cho cả bốn, cùng lý do khiến `CommunePanel` dùng lại khuôn của `CellPanel`:
 * bốn cảnh trả lời bốn câu hỏi khác nhau nhưng bằng cùng một cách đọc, nên khác khuôn thì
 * mentor phải học lại ở mỗi cảnh. Không thẻ nổi, không bo góc, không đổ bóng (§3).
 */

/** Con số dẫn dắt của một cảnh. Một hoặc hai cái mỗi cảnh — nhiều hơn thì không cái nào dẫn. */
export function Figure({
  value,
  unit,
  caption,
}: {
  value: string;
  unit?: string;
  caption: ReactNode;
}) {
  return (
    <div className="border-b border-hairline px-4 py-3">
      {/* Số lớn dùng figure TỈ LỆ, không `tabular-nums`: `tabular-nums` cho mọi chữ số bề
          rộng của số 0, nên ở cỡ lớn nó đọc thành lỏng lẻo. `tabular-nums` để dành cho cột
          số phải thẳng hàng — §4e. */}
      <div className="text-readout font-semibold leading-none">
        {value}
        {unit && <span className="pl-1.5 text-title font-normal text-ink-muted">{unit}</span>}
      </div>
      <div className="pt-1.5 text-body leading-snug text-ink-2">{caption}</div>
    </div>
  );
}

/** Dòng số phụ — dùng cho những con số đỡ cho con số dẫn, không tự đứng một mình. */
export function Stat({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-hairline px-4 py-1.5 text-body">
      <span className="min-w-0 flex-1 text-ink-2">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** Đoạn văn của cảnh. */
export function Para({ children }: { children: ReactNode }) {
  return <p className="px-4 py-2.5 text-title leading-relaxed text-ink-2">{children}</p>;
}

/**
 * Chỗ giữ chỗ trong lúc số đang được đo.
 *
 * KHÔNG hiện 0 hay một con số cũ trong lúc chờ: đó là ràng buộc 1 ở tầng UI — "chưa biết"
 * và "bằng 0" phải nhìn khác nhau, kể cả khi "chưa biết" chỉ kéo dài 300 ms.
 */
export function Pending({ label }: { label: string }) {
  return (
    <div className="border-b border-hairline px-4 py-3 text-body text-ink-muted">
      đang đo {label}…
    </div>
  );
}

/** Khối "vì sao điều này quyết định", đóng mỗi cảnh. */
export function SoWhat({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 my-3 border-l-2 border-cold-3 pl-3 text-title leading-relaxed text-ink">
      {children}
    </div>
  );
}
