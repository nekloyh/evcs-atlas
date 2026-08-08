import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { loadManifest } from "./data/manifest";
import { setUnavailableOverlays, unavailableOverlayPairs } from "./data/overlays";
import { PROVINCE, isNationalMode } from "./data/province";
import { setAvailableColumns, setUnusableLayers } from "./fields";
import { setInitialViewFromBbox } from "./map/positron";
import { setStoryEnabled } from "./story/scenes";
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
  try {
    const m = await loadManifest();
    setAvailableColumns(m.available_columns, m.available_commune_columns);
    setUnusableLayers(m.unusable_layers?.map((l) => l.layer));
    // Hai cờ cùng họ với hai dòng trên, và cùng phải đặt TRƯỚC `import("./App")`: chúng
    // quyết định khoá `s` và khoá `l` của hash đọc ra cái gì, mà `store.ts` đọc hash ngay
    // lúc nạp module. Đặt muộn hơn là để một cảnh Hà Nội mở ra trên một tỉnh trong đúng
    // một nhịp render — và một nhịp là đủ để nó chụp ảnh được.
    setStoryEnabled(m.story_enabled !== false);
    setUnavailableOverlays(unavailableOverlayPairs(m));
    if (m.province) {
      document.title = `EVCS · ${m.province.province_name}`;
      setInitialViewFromBbox(m.province.bbox);
    }
  } catch {
    setAvailableColumns(undefined);
    setUnusableLayers(undefined);
    // Thoái lui về "không lọc gì", đúng như hai dòng trên: manifest hỏng là chưa biết bộ
    // dữ liệu thiếu gì, mà "chưa biết" không được biến thành "biết là thiếu".
    setStoryEnabled(true);
    setUnavailableOverlays([]);
    if (PROVINCE) document.title = `EVCS · tỉnh ${PROVINCE}`;
  }
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
