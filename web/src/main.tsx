import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { UNKNOWN, apply, factsFrom } from "./data/bootstrap";
import { loadManifest } from "./data/manifest";
import { PROVINCE, isNationalMode, isProxyMode } from "./data/province";
import "./index.css";

/**
 * Nạp `manifest.json` TRƯỚC khi render — không phải trong một effect.
 *
 * Manifest nói cột nào có mặt (`available_columns`), và store khởi tạo `field` ngay lúc
 * module nạp, từ hash. Nếu manifest tới sau, một link `#tinh=96&f=population` sẽ chạy đúng
 * một truy vấn `SELECT "population"` trên một lưới không có cột đó — DuckDB ném lỗi và
 * người dùng thấy màn hình trắng, đúng lúc mà lẽ ra phải thấy "trường này chưa tính".
 *
 * Cái giá là một request chặn ~10 KB. Cái mua được là **thứ tự**: không có trạng thái nào
 * tồn tại trước khi biết dữ liệu có gì.
 *
 * Manifest hỏng thì vẫn render — bộ Hà Nội gốc không cần `available_columns` (nó có đủ 45
 * trường), nên "không nạp được manifest" phải thoái lui về "không lọc gì", không phải về
 * một trang lỗi.
 */
async function boot() {
  // Lớp gộp TOÀN QUỐC rẽ TRƯỚC mọi thứ khác, và nó không chạm gì ở dưới.
  //
  // `manifest.json`, `available_columns`, `unusable_layers`, `story_enabled`, `INITIAL_VIEW`
  // đều nói về **một bộ dữ liệu tỉnh**: cột nào có trong lưới r8, lớp nào đọc được, cảnh có
  // dựng được không. Ở bậc toàn quốc không cái nào trong số đó có nghĩa — đơn vị đọc là ô
  // gộp r6 và tỉnh, và danh mục trường là một danh mục khác (`national/fields.ts`). Chạy
  // qua khối dưới rồi mới rẽ là để một manifest của tỉnh đặt trạng thái cho một màn hình
  // không đọc trạng thái đó.
  // Chế độ PROXY POI rẽ TRƯỚC cả toàn quốc, và cùng một lý do: nó không đọc `manifest.json`
  // của tỉnh, không có `available_columns`, không có trường nào để mà khoá trạng thái. Nó
  // cũng là chỗ DUY NHẤT trong app hiển thị dữ liệu chưa qua pipeline, nên nó phải không
  // chạm được vào bất kỳ trạng thái nào của hai bộ kia.
  if (isProxyMode) {
    document.title = "POI · tỉnh vô danh (test)";
    const { default: ProxyApp } = await import("./proxy/ProxyApp");
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ProxyApp />
      </StrictMode>,
    );
    return;
  }
  if (isNationalMode) {
    document.title = "EVCS · Toàn quốc";
    const { default: NationalApp } = await import("./national/NationalApp");
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <NationalApp />
      </StrictMode>,
    );
    return;
  }
  // Năm biến module-level phải được ghi TRƯỚC `import("./App")`. Chúng đi cùng nhau trong
  // `bootstrap.apply` — xem docstring ở đó để biết vì sao đây là một hàm chứ không phải
  // năm dòng kèm một comment.
  let title: string | null = null;
  try {
    const f = factsFrom(await loadManifest());
    apply(f);
    title = f.title;
  } catch {
    // Manifest hỏng là CHƯA BIẾT bộ dữ liệu thiếu gì, mà "chưa biết" không được biến thành
    // "biết là thiếu". Bộ Hà Nội gốc không có `available_columns` và phải chạy y như trước.
    apply(UNKNOWN);
    title = PROVINCE ? `EVCS · tỉnh ${PROVINCE}` : null;
  }
  if (title) document.title = title;
  // Import ĐỘNG, sau khi manifest đã về: `store.ts` đọc `INITIAL_VIEW` và `fields.ts` ngay
  // lúc nạp module, nên nạp `App` sớm hơn là khoá trạng thái trước khi biết dữ liệu có gì.
  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
