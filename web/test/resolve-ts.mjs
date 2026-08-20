/**
 * Cho phép `node --test` giải các import KHÔNG ĐUÔI của `src/`.
 *
 * Vì sao cần: Vite giải `./fields` thành `./fields.ts`; Node ESM thì không — nó đòi đuôi
 * đầy đủ. Nếu không có chỗ này thì chỉ những module không import gì mới test được, tức
 * §12 ("logic thuần thì có test") chỉ áp dụng được cho lá của cây phụ thuộc.
 *
 * Hai đường khác đã bị loại:
 *   · Gõ `.ts` vào ~30 câu import trong `src/` — sửa mã nguồn để chiều lòng bộ chạy test.
 *   · Thêm `tsx`/`ts-node` — thêm dependency, §1 cấm.
 *
 * `module.registerHooks` là API SẴN CÓ của Node (đồng bộ, từ 22.15). Không dependency nào.
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.includes("?url")) {
      return {
        url: 'data:text/javascript,export default "";',
        shortCircuit: true,
      };
    }
    // Chỉ đụng đường dẫn tương đối không có đuôi. Gói trong `node_modules` giữ nguyên.
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        try {
          return next(`${specifier}.tsx`, context);
        } catch {
          // Không có `.ts` hay `.tsx` thì để Node báo lỗi gốc — thông báo của nó rõ hơn của ta.
        }
      }
    }
    return next(specifier, context);
  },
});
