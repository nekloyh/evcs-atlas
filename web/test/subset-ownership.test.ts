/**
 * Phase 4 — §5.2/§5.4: ai được SỞ HỮU phép lọc, và ai chỉ được vẽ.
 *
 * Đọc mã nguồn dạng văn bản, cùng lối với `plan-sync.test.ts`: dựng `buildLayers` thật cần
 * WebGL, mà thứ đang kiểm ở đây là RANH GIỚI QUYỀN SỞ HỮU chứ không phải pixel. Bốn bản
 * sao của cùng một predicate từng trôi khỏi nhau mà mọi test hành vi vẫn xanh — nên cái
 * cần khoá lại chính là "chỉ có một bản".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = (rel: string) => readFileSync(`${SRC}${rel}`, "utf8");

/**
 * Bỏ chú thích trước khi khẳng định.
 *
 * Các test này nói về MÃ CHẠY. Không bỏ chú thích thì chính câu giải thích "đã bỏ `MUTED`"
 * lại làm test tìm thấy chữ `MUTED` và báo đỏ — test bắt được văn xuôi của chính nó.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("MapView KHÔNG tự viết lại phép thử của bộ lọc", () => {
  const src = code("map/MapView.tsx");

  // So sánh biên `lo`/`hi` hay đọc `.values` của filter trong tầng vẽ nghĩa là một bản sao
  // predicate thứ hai vừa ra đời — đúng cách bốn bản cũ đã lệch nhau.
  assert.doesNotMatch(src, /analysisFilter\s*\.\s*(lo|hi|values)/,
    "MapView đọc trực tiếp biên bộ lọc — phải nhận mảng đã lọc từ App");
  assert.doesNotMatch(src, /filterKeepsCell|filterKeepsStation|powerTierOf/,
    "MapView tự phân loại/lọc — việc đó thuộc App + state/filter.ts (§5.2)");

  // Tập phân tích phải tới bằng props.
  assert.match(src, /analyticalCells\?:\s*GridCell\[\]/);
  assert.match(src, /analyticalStations\?:\s*StationPoint\[\]/);
});

test("KHÔNG còn lớp mark phân tích bị làm XÁM — bị loại là VẮNG MẶT (§6.3 mục 23)", () => {
  const src = code("map/MapView.tsx");
  assert.doesNotMatch(src, /\bMUTED\b/,
    "màu 'bị brush loại' của bản đồ đã bị bỏ: SUBSET nghĩa là không vẽ, không phải vẽ mờ");
  // `filter.keep(...)` của cảnh CÂU CHUYỆN (§13b-2) là thứ KHÁC và vẫn hợp lệ: nó thu hẹp
  // tập ô của một nhịp, không phải một bộ lọc phân tích. Chỉ cấm phép `keep()` của brush.
  assert.doesNotMatch(src, /\bkeepCell\b/, "helper brush cũ không được sống lại");
  assert.doesNotMatch(src, /(?<!filter\.)\bkeep\(brush/, "phép `keep()` của brush đã bị bỏ");
});

test("App là nơi DUY NHẤT dẫn xuất tập phân tích, và nó có memo", () => {
  const src = code("App.tsx");
  assert.match(src, /filterKeepsCell/, "App phải dùng predicate dùng chung");
  assert.match(src, /filterKeepsStation/);

  // Dẫn xuất phải nằm trong `useMemo`: nó chạy trên toàn bộ lưới, và App render lại mỗi
  // nhịp scrubber khi đang play.
  assert.match(
    src,
    /const analyticalCells = useMemo\(/,
    "tập ô phân tích phải được memo hoá, không lọc lại mỗi lượt render",
  );
  assert.match(src, /const analyticalStations = useMemo\(/);

  // Luật IN-only là tính chất của tập phân tích, áp KỂ CẢ khi không có bộ lọc.
  assert.match(src, /st\.inScope && filterKeepsStation/);
});

test("Inspector NHẬN cờ ngoài-tập-lọc, không tự suy (§5.4)", () => {
  const card = code("components/atlas/EvidenceCard.tsx");
  assert.match(card, /outsideActiveSubset/, "phải nhận cờ qua props");
  assert.doesNotMatch(card, /cells\.find|stations\.find/,
    "tự tra hàng trong snapshot là cách cũ: hàng vắng mặt cho ra 'đang trong tập lọc' sai");
  assert.doesNotMatch(card, /filter\.active/,
    "EvidenceCard không được tự đọc bộ lọc để suy ra trạng thái tập con");

  const app = read("App.tsx");
  assert.match(app, /outsideActiveSubset=\{outsideActiveSubset\}/, "App phải truyền cờ xuống");
});

test("bộ lọc luôn có một dòng tóm tắt thấy được, kể cả khi cột ĐỌC đóng (§2.1)", () => {
  const app = code("App.tsx");
  assert.match(app, /<FilterChip/, "cần một chip neo trên bản đồ — cột ĐỌC đóng được");
  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /<FilterSummary/);
  assert.match(controller, /<FilterClearedNotice/, "xoá vì đổi Lens phải nói được lý do (§2.3)");
});

test("PrimaryLensChart vét cạn — thêm chart mới mà quên định tuyến là LỖI BIÊN DỊCH", () => {
  const src = code("components/atlas/PrimaryLensChart.tsx");
  assert.doesNotMatch(src, /default:\s*\n?\s*return null/,
    "nhánh `default` nuốt mất chart chưa định tuyến (§6.1 mục 2)");
  assert.match(src, /const exhaustive: never = chartId/);
});

test("ngưỡng 2 km khai ĐÚNG MỘT chỗ, mọi nơi khác import (§4.2)", () => {
  const domain = code("domain-thresholds.ts");
  assert.match(domain, /export const BEYOND_2KM_M = 2000/);

  for (const rel of ["viz/chart-models.ts", "data/queries.ts", "fields.ts", "bench.ts"]) {
    const src = code(rel);
    assert.match(src, /BEYOND_2KM_M/, `${rel} phải import ngưỡng, không gõ lại`);
    const bare = src.match(/(?<![\w.])2000(?![\w])/g) ?? [];
    assert.equal(
      bare.length,
      0,
      `${rel} còn ${bare.length} chỗ gõ thẳng 2000 — một lần đổi ngưỡng sẽ tách một luật thành nhiều luật`,
    );
  }
});

test("brush cũ đã rời khỏi mọi đường chạy thật (§5.5 bước 5)", () => {
  for (const rel of ["state/store.ts", "state/types.ts", "App.tsx", "map/MapView.tsx", "ui/Scrubber.tsx"]) {
    const src = code(rel);
    assert.doesNotMatch(src, /BrushState|setBrush|reconcileBrush|NO_BRUSH/,
      `${rel} còn giữ state brush cũ — hash không còn đọc/ghi nó, nên nó chỉ là đường chết`);
  }
});
