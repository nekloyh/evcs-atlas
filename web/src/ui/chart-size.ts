/**
 * Bề rộng VẼ của mọi biểu đồ trong app — DESIGN.md §3h.
 *
 * Observable Plot và các SVG dựng tay ở đây đều cần một con số px lúc dựng, không nhận
 * `100%`. Trước đợt 17/8/2026 con số ấy là `344` chép ở năm chỗ, cộng một chỗ thứ sáu ghi
 * `296` (`MiniHeatmap`) — tức bề rộng biểu đồ là thứ mỗi file tự quyết, và không file nào
 * biết bề rộng CỘT chứa nó.
 *
 * Nay quan hệ đi theo chiều ngược lại và chỉ có một chiều: **bề rộng cột suy ra từ bề rộng
 * biểu đồ**, không phải ngược lại. `READ_COL_W = CHART_W + 2 × 12` (lề ngang một tiết).
 * Đổi `CHART_W` thì cột nới ra theo, và không hình nào tràn — thứ mà năm bản chép không thể
 * hứa: `344` trong một cột 320 px tràn 48 px, và phần tràn ở mép phải cột thì **mất luôn**,
 * không có thanh cuộn nào báo (cùng họ bẫy với §11-12).
 */
import { CHART_W, PANEL_PAD_X, READ_COL_W } from "../design-tokens";

export { CHART_W, PANEL_PAD_X, READ_COL_W };
