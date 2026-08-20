import { LayerExtension } from "@deck.gl/core";

export interface HatchOpts {
  /**
   * Một góc cho MỖI trạng thái ô trống — Phase 8 §6.4, và `NULL_STATE_HATCH_DEG` là nơi khai:
   * `0` = ĐÃ LỌC theo luật của ta · `45` = THIẾU NGUỒN ("không biết", §4b) ·
   * `90` = KHÔNG ÁP DỤNG (§7a mở rộng, M3-Q3) · `135` = CHƯA ĐO ĐƯỢC.
   * `135` cũng là góc của overlay dạng VÙNG (§4d-1), nhưng khác MÀU nên không lẫn.
   *
   * Bốn góc null cùng màu xám vì cùng nghĩa "vắng giá trị"; khác góc vì khác NGUYÊN NHÂN, và
   * bốn góc cách nhau đúng 45° là khoảng cách lớn nhất chia được cho bốn hướng — tức ngưỡng
   * phân biệt được ở nét 1 px.
   *
   * Góc là kênh phân biệt, không phải trang trí: hai vân nghiêng ngược nhau thì chỗ chồng
   * nhau thành lưới caro và vẫn đọc ra được là "hai thứ cùng ở đây". Cùng góc khác màu thì
   * chỗ chồng nhau chỉ còn một màu thắng.
   */
  angle?: 0 | 45 | 90 | 135;
}

/**
 * Gạch chéo — DESIGN.md §4b (ô null) và §4d-1 (overlay vùng).
 *
 * Vẽ trong KHÔNG GIAN MÀN HÌNH (`gl_FragCoord`), nên nét giữ đúng 1px CSS và bước 6px CSS
 * ở mọi mức zoom — vùng có vân trông như một mẫu vân, không bao giờ như một mảng màu.
 * Phần giữa hai nét bị `discard`, để thứ bên dưới lộ ra.
 *
 * Là LayerExtension (không phải subclass) để `H3HexagonLayer` và `GeoJsonLayer` — vốn là
 * composite layer — chuyển tiếp được xuống sublayer của chúng.
 *
 * devicePixelRatio đi vào bằng `#define`, KHÔNG bằng `project.devicePixelRatio`: module
 * `project` của deck.gl chỉ khai báo `#define MODULE_PROJECT` trong fragment shader chứ
 * không mang theo uniform block, nên tham chiếu tới `project.*` ở đó là lỗi biên dịch.
 * (Đã kiểm bằng cách đọc source shader thật, không phải suy đoán.)
 * Hệ quả: kéo cửa sổ sang màn hình có DPR khác cần reload. Đánh đổi chấp nhận được.
 */
export class HatchExtension extends LayerExtension<Required<HatchOpts>> {
  static override extensionName = "HatchExtension";

  constructor(opts: HatchOpts = {}) {
    super({ angle: opts.angle ?? 45 });
  }

  /**
   * deck.gl gọi hàm này với `this` là LỚP chứ không phải extension, và truyền extension
   * vào làm tham số. Nên góc phải đọc từ tham số — đọc từ `this.opts` sẽ là `undefined`.
   */
  getShaders(extension: HatchExtension) {
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    // x + y ⇒ các đường nghiêng một chiều; x − y ⇒ nghiêng chiều ngược lại.
    // `mod` của GLSL luôn trả không âm với chu kỳ dương, nên hiệu số âm vẫn đúng.
    const a = extension.opts.angle;
    // Cùng quy ước với `repeating-linear-gradient` của CSS ở legend, nên vân trên bản đồ và
    // ô mẫu trong chú giải là CÙNG một hình: 0° = nét NGANG (chỉ phụ thuộc y), 90° = nét DỌC
    // (chỉ phụ thuộc x), 45°/135° = tổng/hiệu ⇒ hai chiều nghiêng ngược nhau.
    const axis =
      a === 0
        ? "gl_FragCoord.y"
        : a === 90
          ? "gl_FragCoord.x"
          : a === 135
            ? "gl_FragCoord.x - gl_FragCoord.y"
            : "gl_FragCoord.x + gl_FragCoord.y";
    return {
      defines: {
        HATCH_PERIOD: (6 * dpr).toFixed(1),
        HATCH_WIDTH: (1 * dpr).toFixed(1),
        HATCH_AXIS: axis,
      },
      inject: {
        "fs:DECKGL_FILTER_COLOR": /* glsl */ `
          if (mod(HATCH_AXIS, HATCH_PERIOD) > HATCH_WIDTH) {
            discard;
          }
        `,
      },
    };
  }
}
