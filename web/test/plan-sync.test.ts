/**
 * BẢN ĐỒ và LEGEND phải mô tả cùng một mặt tô — bằng cấu trúc, không bằng kỷ luật.
 *
 * Lỗi đã có thật: `MapView.tsx:392` truyền `filtered: Boolean(filter)`, `Legend.tsx:49-54`
 * bỏ hẳn khoá đó. Trong một nhịp CÂU CHUYỆN có lọc ô ở zoom < 11, bản đồ nhận
 * `{paint:"hex"}` còn legend nhận `{paint:"none", reason:"zoom"}`. Legend nói "ô nhỏ quá,
 * không vẽ" trên một bản đồ đang vẽ ô H3 — đúng cái desync mà chú thích ở `Legend` khẳng
 * định nó tồn tại để chặn.
 *
 * Nguyên nhân là HÌNH DẠNG, không phải bất cẩn: hai call site cùng *tính lại* một plan thay
 * vì *chia nhau* một plan. Test này khoá lại cả hai đầu — hành vi (cùng đầu vào ⇒ cùng
 * plan) và cấu trúc (không còn ai gọi thẳng `renderPlan`).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { HEX_MIN_ZOOM, planFor, renderPlan, type PlanSource } from "../src/viz/render-plan";

const SRC = new URL("../src", import.meta.url).pathname;

/** Đúng tình huống đã hỏng: nhịp câu chuyện, có lọc ô, zoom dưới ngưỡng. */
const NHIP_CO_LOC: PlanSource = {
  readAs: "cell",
  hasSurface: false,
  zoom: HEX_MIN_ZOOM - 2,
  filtered: true,
  inStory: true,
};

test("nhịp có lọc ô ở zoom thấp VẪN vẽ hex", () => {
  assert.equal(planFor(NHIP_CO_LOC).paint, "hex");
});

test("bỏ sót `filtered` là đổi kết luận — đây chính là lỗi cũ", () => {
  const dung = planFor(NHIP_CO_LOC);
  const bo_sot = renderPlan({
    unit: NHIP_CO_LOC.readAs,
    zoom: NHIP_CO_LOC.zoom,
    hasSurface: NHIP_CO_LOC.hasSurface,
    inStory: NHIP_CO_LOC.inStory,
  });
  assert.equal(dung.paint, "hex");
  assert.equal(bo_sot.paint, "none");
  assert.notDeepEqual(dung, bo_sot);
});

test("planFor thuần: cùng đầu vào luôn cùng kết quả", () => {
  const mau: PlanSource[] = [];
  for (const readAs of ["cell", "commune", "road", "station"] as const)
    for (const zoom of [7, 9.3, HEX_MIN_ZOOM, 13])
      for (const filtered of [false, true])
        for (const inStory of [false, true])
          for (const hasSurface of [false, true])
            mau.push({ readAs, zoom, filtered, inStory, hasSurface });

  for (const s of mau) assert.deepEqual(planFor(s), planFor({ ...s }));
  assert.equal(mau.length, 4 * 4 * 2 * 2 * 2);
});

test("mọi plan đều rơi vào một mặt tô hợp lệ", () => {
  const hop_le = new Set(["hex", "commune", "road", "station", "surface", "none"]);
  for (const zoom of [6, 9.3, 11, 15])
    for (const readAs of ["cell", "commune", "road", "station"] as const)
      for (const inStory of [false, true])
        assert.ok(
          hop_le.has(planFor({ readAs, zoom, hasSurface: true, filtered: false, inStory }).paint),
        );
});

test("chỉ `render-plan.ts` được gọi renderPlan — mọi nơi khác đi qua planFor", () => {
  const pham: string[] = [];
  for (const f of ["map/MapView.tsx", "ui/Legend.tsx"]) {
    const src = readFileSync(`${SRC}/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/\brenderPlan\s*\(/.test(src)) pham.push(f);
  }
  assert.deepEqual(
    pham,
    [],
    `gọi thẳng renderPlan sẽ dựng lại đúng lỗi cũ — dùng planFor: ${pham.join(", ")}`,
  );
});

test("buildLayers được export — 26 layer phải assert được không cần WebGL", () => {
  const src = readFileSync(`${SRC}/map/MapView.tsx`, "utf8");
  assert.match(src, /export function buildLayers\(/);
});
