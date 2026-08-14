/**
 * Dòng ĐỌC SỐ dưới một biểu đồ — sửa mục 9 của nghiệm thu ("biểu đồ còn yếu"), sau M4.
 *
 * ── Vấn đề ────────────────────────────────────────────────────────────────────────────
 *
 * Bốn biểu đồ của app (histogram · scatter · heatmap 168h · Lorenz) **chọn được nhưng
 * không đọc được**: không có cách nào biết cột kia cao bao nhiêu, ô kia bằng mấy phần trăm,
 * đường cong đi qua đâu ở 30% diện tích. Với một mentor đang đánh giá *phương pháp*, một
 * hình mà mọi con số trong nó phải đoán thì nó là trang trí — đúng thứ §0 nói là không đủ.
 *
 * ── Vì sao một DẢI CỐ ĐỊNH chứ không phải tooltip nổi ─────────────────────────────────
 *
 * §3 cấm thẻ nổi một cách vô điều kiện — bốn dải chrome dán cứng vào bốn cạnh, không bo
 * góc, không đổ bóng. Một tooltip theo con trỏ phá đúng luật đó, và nó còn che mất chính
 * phần dữ liệu đang được hỏi. Dải cố định ngay dưới hình thì không che gì, đọc được bằng
 * mắt ngoại vi trong lúc con trỏ vẫn quét, và nó **giữ nguyên chiều cao khi rỗng** nên
 * layout không giật — thứ khiến người dùng ngừng rê chuột.
 *
 * ── Ba luật của nội dung ──────────────────────────────────────────────────────────────
 *
 *   1. **Chưa rê thì in GỢI Ý, không in số cũ.** Một con số đứng đó mà không biết nó thuộc
 *      về vị trí nào là tệ hơn không có số (cùng họ với `Pending` của `story/parts`).
 *   2. **`null` in thành chữ, không thành 0** — ràng buộc 1 ở tầng chữ, y như `formatValue`.
 *   3. **Đơn vị luôn đi kèm.** Dòng này thay cho việc đọc trục, nên nó phải tự đủ nghĩa.
 */

import type { ReactNode } from "react";

export function Readout({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    // `h-4` + `overflow-hidden` + `whitespace-nowrap`: chiều cao KHÔNG đổi giữa trạng thái
    // rỗng và trạng thái có số, và một câu dài không được đẩy khối chữ bên dưới xuống. Ảnh
    // render đã bắt đúng lỗi đó ở bản đầu — dòng readout xuống hai hàng và đè lên câu đơn vị
    // của mục ngay dưới. Câu dài thuộc về `note` của mục, chỗ có bề rộng để xuống dòng.
    <div className="flex h-4 items-center gap-1 overflow-hidden whitespace-nowrap text-note leading-4 text-ink-2">
      {/*
        Kiểm THẬT/GIẢ, KHÔNG dùng `children ?? hint`. Bẫy đã sập một lần và ảnh render bắt
        được: chỗ gọi viết `{a !== null && b !== null && (<>…</>)}`, và khi điều kiện sai
        thì biểu thức ra `false` chứ không ra `null` — mà `false ?? hint` là `false`, nên
        dòng gợi ý **không bao giờ hiện**. Không lỗi nào, chỉ một dải trống.
      */}
      {children ? children : <span className="text-ink-muted">{hint}</span>}
    </div>
  );
}
