/**
 * Hợp đồng KHAI BÁO của chế độ CÂU CHUYỆN — PHASE7_STORY_MODE.md §7 tiêu chí 1, 2, 12–16, 19–21.
 *
 * File này không kiểm một con số nào. Nó kiểm **hình dạng của lời hứa**: mọi số là một khe
 * trỏ vào builder dùng chung, mọi mã xã là một luật phân giải, mọi khung hình là một phép
 * khớp, mọi giả định hiện ra kèm chữ *giả định*. Một cảnh vi phạm ở đây vẫn render bình
 * thường và vẫn trông đúng — đó chính là lý do nó cần một test chứ không cần một ảnh chụp.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { SCENES, sceneRenderable } from "../src/story/scenes.ts";
import { ASSUMPTIONS, buildStoryModels, EMPTY_PACKAGE } from "../src/story/resolve.ts";
import { FIELD_BY_ID, LENS_IDS } from "../src/fields.ts";
import { OVERLAY_IDS } from "../src/state/types.ts";
import { PRIMARY_CHART_IDS } from "../src/viz/chart-contracts.ts";
import type { BlockSpec, ClaimTemplate, MetricRef, SceneSpec } from "../src/story/spec.ts";
import type { Manifest } from "../src/data/manifest.ts";

const STORY_DIR = new URL("../src/story/", import.meta.url).pathname;

/** Manifest khai ĐỦ năng lực — mốc để đo "gỡ một thứ thì mất đúng cảnh nào". */
const FULL_MANIFEST = () =>
  ({
    available_columns: [
      "population",
      "pop_density_ppkm2",
      "n_ports",
      "detour_ratio",
      "dist_station_network_m",
      "dist_station_euclid_m",
      "util_cell",
    ],
    available_commune_columns: ["population", "n_ports", "ports_per_10k_pop"],
    available_road_columns: ["dist_station_m"],
    files: { "station_occupancy_profile_168h.parquet": {} },
    coverage: { util_cell: {} },
    totals: { private_ac_dropped: {} },
    snapshots: {},
    province: { province_code: "01", province_name: "" },
  }) as unknown as Manifest;

function* claimsOf(s: SceneSpec): Generator<ClaimTemplate> {
  yield s.claim;
  for (const b of s.beats) {
    if (b.filter) yield b.filter.label;
    for (const blk of b.blocks) {
      if (blk.kind === "figure") yield blk.caption;
      if (blk.kind === "stat" || blk.kind === "rule-output") yield blk.label;
      if (blk.kind === "para" || blk.kind === "so-what") yield blk.text;
      if (blk.kind === "assumption") yield blk.note;
      if (blk.kind === "subject-card") yield blk.why;
    }
  }
}

function* refsOf(s: SceneSpec): Generator<MetricRef> {
  for (const c of claimsOf(s)) {
    for (const p of c.parts) if (typeof p === "object" && "slot" in p) yield p.slot;
  }
  for (const b of s.beats) {
    for (const blk of b.blocks) {
      if (blk.kind === "figure" || blk.kind === "stat" || blk.kind === "rule-output") yield blk.value;
      if (blk.kind === "subject-card") {
        for (const r of blk.rows) yield { src: "subject", which: blk.which, select: r.select };
      }
    }
  }
}

// ══ Tiêu chí 1 — không literal số nào trong `story/` chạm tới màn hình ════════

test("KHÔNG chuỗi hiển thị nào trong `src/story/**` mang chữ số (tiêu chí 1)", () => {
  // Ngoại lệ DUY NHẤT là hằng số chính sách đã đăng ký, và chúng sống ở
  // `domain-thresholds.ts` — ngoài `story/`. Ở đây quét đúng những gì đi ra màn hình:
  // chuỗi literal trong TSX/TS của gói, trừ chú thích và trừ đường dẫn/khoá kỹ thuật.
  const offenders: string[] = [];
  for (const f of readdirSync(STORY_DIR)) {
    if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
    const src = readFileSync(STORY_DIR + f, "utf8");
    // Bỏ chú thích khối và chú thích dòng trước khi quét — số trong tài liệu là tài liệu.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      // Đường dẫn module không phải câu chữ.
      .replace(/from\s+["'][^"']*["']/g, "")
      // NHÃN đặt tên cho một thứ; CÂU khẳng định một điều. Luật nghiêm áp cho câu.
      //
      // Một đơn vị ("cổng trên 10k dân") mang chữ số vì mẫu số nằm trong CHÍNH TÊN của đại
      // lượng — `ports_per_10k_pop` — chứ không vì ai đó gõ một số đo vào. Đổi dữ liệu
      // không làm nhãn ấy sai. Ngược lại, một câu như "lệch hơn 10% ở 31 trong 126 xã" là
      // một SỐ ĐO gõ tay, và nó sai âm thầm ngay lần đổi gói đầu tiên — nên nó bị cấm.
      //
      // Ranh giới cụ thể: `unit:` · `label:` · `text:` · `why:` · `kicker:` · `title:` ở
      // dạng CHUỖI là nhãn. Mọi thứ trong `parts: [...]` là câu, và không được miễn.
      .replace(/\b(unit|label|text|why|kicker|title):\s*"[^"]*"/g, "");
    for (const m of code.matchAll(/"([^"\\]*)"|'([^'\\]*)'/g)) {
      const lit = m[1] ?? m[2] ?? "";
      if (!/\d/.test(lit)) continue;
      // Ba loại chuỗi KHÔNG đi ra màn hình dưới dạng một con số, và cả ba nhận ra được:
      //   · danh sách class Tailwind — chỉ chữ thường, số, gạch, hai chấm, ngoặc vuông;
      //   · đường dẫn khe (`steps.0.nComponents`) — chấm nối các định danh;
      //   · tên cột (`area_km2`) — snake_case.
      if (/^[a-z0-9\-:/[\]%.\s_]*$/.test(lit)) continue;
      if (/^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(lit)) continue;
      // Còn lại: một câu. Số trong một câu phải là một KHE.
      const prose = lit.replace(/\b[a-z][a-z0-9]*_[a-z0-9_]*\b/g, "");
      if (/\d/.test(prose)) offenders.push(`${f}: ${lit}`);
    }
  }
  assert.deepEqual(offenders, [], "câu chữ mang chữ số phải là một KHE, không phải literal");
});

// ══ Tiêu chí 1b — số VIẾT BẰNG CHỮ cũng là số ═══════════════════════════════

/** Mọi CHUỖI hiển thị của một cảnh: phần câu, chữ nhấn, nhãn nhịp, đơn vị, tiêu đề. */
function* displayStringsOf(s: SceneSpec): Generator<[where: string, text: string]> {
  yield [s.id, s.title];
  yield [s.id, s.kicker];
  for (const c of claimsOf(s)) {
    for (const p of c.parts) {
      if (typeof p === "string") yield [s.id, p];
      else if ("em" in p) yield [s.id, p.em];
      else if ("slot" in p && p.unit) yield [s.id, p.unit];
    }
  }
  for (const b of s.beats) {
    yield [`${s.id}/${b.id}`, b.label];
    for (const blk of b.blocks) {
      if (blk.kind === "heading") yield [`${s.id}/${b.id}`, blk.text];
      if ("unit" in blk && blk.unit) yield [`${s.id}/${b.id}`, blk.unit];
      if (blk.kind === "subject-card") {
        for (const r of blk.rows) yield [`${s.id}/${b.id}`, r.unit];
      }
    }
  }
}

test("số viết BẰNG CHỮ trong câu cũng là literal — bản QA bắt được “một phần tư” sống sót qua test chữ số", () => {
  // "gần ba trong mười", "một phần ba mươi", "một phần tư" đều là SỐ ĐO gõ tay: dữ liệu
  // thật cho dải 18,2%–83,0% (dân ngoài 2 km) và 1,4%–6,7% (xã nặng nhất) giữa 34 gói,
  // nên câu chữ đó sai ở phần lớn tỉnh. "một nửa"/"10%" thì KHÔNG bị cấm: chúng là ĐIỂM
  // ĐỌC đã đăng ký của mô hình (POP_READ_SHARE/AREA_READ_SHARE) và đi kèm khe của chính nó.
  const banned =
    /(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(phần\s+(hai|ba|tư|bốn|năm|sáu|bảy|tám|chín|mười|trăm|nghìn)|trong\s+(mười|trăm|nghìn))|\b(hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(lần|lát cắt|ô|giới hạn|cây cầu|luận điểm|cảnh báo)\b|\bchữ số\b/iu;
  const offenders: string[] = [];
  for (const s of SCENES) {
    for (const [where, text] of displayStringsOf(s)) {
      const m = text.match(banned);
      if (m) offenders.push(`${where}: “…${m[0]}…”`);
    }
  }
  assert.deepEqual(offenders, [], "một đại lượng phân tích phải là một KHE, kể cả khi viết bằng chữ");
});

// ══ Tiêu chí 1c — địa danh chỉ sống trong khối đã GATE đúng tỉnh ═════════════

test("văn khả chuyển KHÔNG gọi tên Hà Nội / sông Hồng / cầu — trừ khối para đã gate `editorialProvince`", () => {
  const places = /Hà Nội|[Ss]ông Hồng|Thăng Long|Nhật Tân|Long Biên|Chương Dương|Vĩnh Tuy|Thanh Trì/u;
  const offenders: string[] = [];
  const scan = (where: string, tpl: ClaimTemplate) => {
    for (const p of tpl.parts) {
      const text = typeof p === "string" ? p : "em" in p ? p.em : "";
      if (places.test(text)) offenders.push(`${where}: “${text.slice(0, 60)}…”`);
    }
  };
  for (const s of SCENES) {
    scan(s.id, s.claim);
    for (const b of s.beats) {
      if (b.filter) scan(`${s.id}/${b.id}`, b.filter.label);
      for (const blk of b.blocks) {
        if (blk.kind === "para") {
          if (blk.editorialProvince) continue; // văn biên tập, chỉ render trên đúng tỉnh ấy
          scan(`${s.id}/${b.id}`, blk.text);
        }
        if (blk.kind === "figure") scan(`${s.id}/${b.id}`, blk.caption);
        if (blk.kind === "stat" || blk.kind === "rule-output") scan(`${s.id}/${b.id}`, blk.label);
        if (blk.kind === "so-what") scan(`${s.id}/${b.id}`, blk.text);
        if (blk.kind === "assumption") scan(`${s.id}/${b.id}`, blk.note);
        if (blk.kind === "subject-card") scan(`${s.id}/${b.id}`, blk.why);
      }
    }
  }
  // Chú thích của giả định cũng đi ra màn hình, trên MỌI tỉnh dùng ngưỡng ấy.
  for (const [id, a] of Object.entries(ASSUMPTIONS)) {
    if (places.test(a.what)) offenders.push(`assumption ${id}: “${a.what}”`);
  }
  assert.deepEqual(offenders, []);
});

test("khối gate tỉnh chỉ là VĂN BIÊN TẬP của di-vong, và gate về đúng “01”", () => {
  for (const s of SCENES) {
    for (const b of s.beats) {
      for (const blk of b.blocks) {
        if (blk.kind === "para" && blk.editorialProvince) {
          assert.equal(s.id, "di-vong", `${s.id}: gate tỉnh ngoài cảnh cầu`);
          assert.equal(blk.editorialProvince, "01");
        }
      }
    }
  }
});

test("câu nhân quả vận hành phải tự nhận là suy đoán, không được quay lại khẳng định", () => {
  const proseOf = (sceneId: string) => {
    const scene = SCENES.find((s) => s.id === sceneId)!;
    return [...claimsOf(scene)]
      .flatMap((claim) => claim.parts)
      .map((part) => (typeof part === "string" ? part : "em" in part ? part.em : ""))
      .join(" ");
  };

  const utilization = proseOf("nhip-tuan");
  assert.match(utilization, /Suy đoán vận hành/);
  assert.match(utilization, /không đo hàng chờ hay lượt sạc bị từ chối/);
  assert.doesNotMatch(
    utilization,
    /kê theo giờ vắng thì thành hàng chờ|sắt thép nằm không/,
    "không được biến một cách đọc hợp lý thành hệ quả đã chứng minh",
  );

  const exclusion = proseOf("mot-quyet-dinh");
  assert.match(exclusion, /khớp với — nhưng không chứng minh/);
  assert.match(exclusion, /ổ cắm treo tường/);
  assert.doesNotMatch(
    exclusion,
    /Đúng hình dạng ta chờ đợi|⇒ đây là ổ cắm cá nhân/,
    "rule phân loại không được trình bày như thuộc tính đã quan sát",
  );
});

// ══ Tiêu chí 1d — cảnh khả chuyển dựng được trên CẢ 34 manifest THẬT ═════════

test("mọi manifest tỉnh đã xuất: tập cảnh dựng được do NĂNG LỰC quyết, không do mã tỉnh", () => {
  const pDir = new URL("../public/data/p/", import.meta.url).pathname;
  let provinces: string[] = [];
  try {
    provinces = readdirSync(pDir).filter((d) => /^\d{2}$/.test(d));
  } catch {
    provinces = [];
  }
  if (provinces.length === 0) return; // chưa xuất store — cổng này chạy ở máy có dữ liệu
  for (const code of provinces) {
    const m = JSON.parse(readFileSync(`${pDir}${code}/manifest.json`, "utf8")) as Manifest;
    const here = SCENES.filter((s) => sceneRenderable(s, m)).map((s) => s.id);
    // Đổi mã tỉnh trên CÙNG manifest không được đổi tập cảnh — cùng luật tiêu chí 15,
    // nhưng đo trên 34 manifest thật thay vì một manifest bịa.
    const swapped = {
      ...m,
      province: { ...(m as { province?: object }).province, province_code: "99" },
    } as Manifest;
    const there = SCENES.filter((s) => sceneRenderable(s, swapped)).map((s) => s.id);
    assert.deepEqual(here, there, `${code}: tập cảnh đổi theo mã tỉnh`);
  }
});

// ══ Tiêu chí 2 — mọi khe phân giải, hoặc câu của nó bị GIỮ LẠI ═══════════════

test("mọi `MetricRef` trỏ vào một mô hình / khoá manifest / giả định đã KHAI (tiêu chí 2)", () => {
  const models = buildStoryModels(EMPTY_PACKAGE);
  for (const s of SCENES) {
    for (const ref of refsOf(s)) {
      if (ref.src === "model") {
        assert.ok(ref.model in models, `${s.id}: mô hình lạ "${ref.model}"`);
        assert.ok(ref.select.length > 0, `${s.id}: khe rỗng`);
      } else if (ref.src === "assumption") {
        assert.ok(ASSUMPTIONS[ref.id], `${s.id}: giả định chưa đăng ký "${ref.id}"`);
      } else if (ref.src === "subject") {
        assert.ok(ref.which < s.subjects.length, `${s.id}: đối tượng ${ref.which} không tồn tại`);
      } else {
        assert.ok(/^[a-z_]+(\.[a-z_0-9]+)*$/i.test(ref.path), `${s.id}: đường dẫn lạ "${ref.path}"`);
      }
    }
  }
});

test("gói RỖNG ⇒ mọi mô hình `null`, và không khe nào phân giải ra một con số", () => {
  // Đây là luật R5 ở dạng thi hành được: không dữ liệu thì không có số, kể cả 0.
  const models = buildStoryModels(EMPTY_PACKAGE);
  for (const [id, m] of Object.entries(models)) {
    assert.equal(m, null, `mô hình "${id}" tự dựng ra một giá trị từ gói rỗng`);
  }
});

// ══ Tiêu chí 12–13 — ranh giới kiến trúc ════════════════════════════════════

test("`src/story/**` KHÔNG chứa SQL, KHÔNG import duckdb, KHÔNG có hàm số đo (tiêu chí 12)", () => {
  for (const f of readdirSync(STORY_DIR)) {
    if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
    const src = readFileSync(STORY_DIR + f, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Phân biệt CHỮ HOA có chủ ý: `r.select` là một trường, `SELECT … FROM` là SQL.
    assert.ok(!/\bSELECT\b[\s\S]{0,400}?\bFROM\b/.test(code), `${f}: có SQL`);
    assert.ok(!/from ["'].*duckdb/.test(code), `${f}: import duckdb`);
    assert.ok(!/\bregisterParquet\b/.test(code), `${f}: chạm tầng truy vấn`);
  }
});

test("Lorenz có ĐÚNG một bản cài đặt, và nó ở `viz/` (tiêu chí 13)", () => {
  const files = readdirSync(STORY_DIR);
  assert.ok(!files.includes("lorenz.ts"), "`story/lorenz.ts` phải đã chuyển sang `viz/`");
  // Mũi tên phụ thuộc phải xuôi: `viz/equity.ts` đọc Lorenz, nên Lorenz không được nằm
  // dưới `story/` — nếu không, lớp dùng chung phụ thuộc ngược vào một bề mặt trình bày.
  const equity = readFileSync(new URL("../src/viz/equity.ts", import.meta.url).pathname, "utf8");
  assert.ok(/from "\.\/lorenz"/.test(equity));
});

// ══ Tiêu chí 14–15 — điều kiện dựng ═════════════════════════════════════════

test("mọi cảnh KHAI `requires`, và cảnh trượt điều kiện thì VẮNG MẶT (tiêu chí 14)", () => {
  for (const s of SCENES) {
    assert.ok(s.requires, `${s.id}: thiếu requires`);
    assert.ok(Object.keys(s.requires).length > 0, `${s.id}: requires rỗng`);
  }
  // Một manifest KHAI đủ cột ⇒ mọi cảnh dựng được.
  const full = FULL_MANIFEST();
  for (const s of SCENES) assert.ok(sceneRenderable(s, full), `${s.id} phải dựng được`);

  // Gỡ MỘT cột và đúng những cảnh cần nó biến mất — không phải cả câu chuyện.
  const noDetour = {
    ...full,
    available_columns: full.available_columns!.filter((c) => c !== "detour_ratio"),
  } as Manifest;
  const gone = SCENES.filter((s) => !sceneRenderable(s, noDetour)).map((s) => s.id);
  assert.deepEqual(gone, ["di-vong"]);

  // Lớp vận hành không đo được ⇒ cảnh nhịp tuần vắng mặt. Một heatmap gần rỗng đọc thành
  // "vắng khách", không đọc thành "chưa đo" — nên nó không được render chút nào.
  const noOcc = {
    ...full,
    unusable_layers: [{ layer: "occupancy", reason: "", measured: "" }],
  } as Manifest;
  assert.equal(
    SCENES.filter((s) => !sceneRenderable(s, noOcc)).map((s) => s.id).join(),
    "nhip-tuan",
  );
});

test("cổng năng lực KHÔNG phải một phép so mã tỉnh (tiêu chí 15)", () => {
  // Cảnh duy nhất được phép ghim tỉnh là cảnh có VĂN gọi tên một nơi. Hôm nay không cảnh
  // nào ghim Ở TẦNG CẢNH: văn về sông Hồng gate ở tầng KHỐI (`para.editorialProvince`),
  // nên cảnh vẫn khả chuyển và chỉ đoạn biên tập biến mất ở 33 tỉnh còn lại.
  assert.deepEqual(SCENES.filter((s) => s.requires.editorialProvince).map((s) => s.id), []);

  // Và đổi MÃ TỈNH trên cùng một manifest KHÔNG được đổi tập cảnh dựng được: năng lực
  // quyết định, không phải danh tính. Bản trước gác bằng `code == "01"`, nên năm cảnh khả
  // chuyển bị giữ lại vì một cảnh thiếu vật trang trí của nó.
  const base = FULL_MANIFEST();
  const at = (code: string) =>
    SCENES.filter((s) => sceneRenderable(s, { ...base, province: { ...base.province, province_code: code } } as Manifest))
      .map((s) => s.id)
      .join();
  assert.equal(at("01"), at("04"));
  assert.equal(at("01"), SCENES.map((s) => s.id).join(), "đủ năng lực ⇒ đủ bảy cảnh");
});

// ══ Tiêu chí 16 — khung hình đến từ hình học ════════════════════════════════

test("không cảnh nào chứa literal mức phóng (tiêu chí 16)", () => {
  for (const s of SCENES) {
    for (const cam of [s.camera, ...s.beats.map((b) => b.camera)]) {
      if (!cam) continue;
      assert.ok(["fit-province", "fit-subject", "fit-marks"].includes(cam.kind), `${s.id}`);
      if (cam.kind === "fit-subject") {
        assert.ok(cam.which < s.subjects.length, `${s.id}: khớp vào đối tượng không tồn tại`);
      }
    }
  }
});

// ══ Tiêu chí 19–21 — bất biến trình bày ════════════════════════════════════

test("ĐÚNG MỘT trường mỗi nhịp, và trường đó có thật (tiêu chí 19)", () => {
  for (const s of SCENES) {
    assert.ok(s.beats.length >= 1, s.id);
    assert.equal(new Set(s.beats.map((b) => b.id)).size, s.beats.length, `${s.id}: id nhịp trùng`);
    for (const b of s.beats) {
      assert.equal(typeof b.field, "string");
      assert.ok(FIELD_BY_ID.has(b.field), `${s.id}/${b.id}: trường "${b.field}" không có thật`);
      // Bộ lọc phải lọc CHÍNH trường đang tô — nếu không, tập ô vẽ ra thuộc một câu hỏi
      // khác với câu hỏi mà chú giải đang mô tả.
      if (b.filter) assert.equal(b.filter.field, b.field, `${s.id}/${b.id}`);
    }
  }
});

test("mọi giả định KHAI BÁO render kèm giá trị VÀ chữ giả định (tiêu chí 21)", () => {
  // Cách thi hành: một giả định chỉ tới màn hình qua khối `assumption`, và khối đó luôn in
  // cả hai (xem `StorySurface`). Ở đây kiểm phần khai báo: mỗi ngưỡng mà một nhịp dùng
  // phải có một khối `assumption` cùng id trong CÙNG nhịp.
  for (const s of SCENES) {
    for (const b of s.beats) {
      if (b.filter?.value.kind !== "assumption") continue;
      const wanted = b.filter.value.id;
      const declared = b.blocks.some(
        (blk: BlockSpec) => blk.kind === "assumption" && blk.id === wanted,
      );
      assert.ok(declared, `${s.id}/${b.id}: ngưỡng giả định không được in ra`);
    }
  }
  // Và mọi giả định đã đăng ký đều có câu giải thích — một số trần không nói nó là lựa chọn.
  for (const [id, a] of Object.entries(ASSUMPTIONS)) {
    assert.ok(a.what.length > 0, `giả định "${id}" không nói nó là lựa chọn gì`);
  }
});

// ══ Hình dạng chung ════════════════════════════════════════════════════════

test("lens, overlay và ràng buộc biểu đồ của mọi cảnh đều hợp lệ", () => {
  for (const s of SCENES) {
    assert.ok((LENS_IDS as readonly string[]).includes(s.lens), `${s.id}: lens lạ`);
    for (const l of s.layers) {
      assert.ok((OVERLAY_IDS as readonly string[]).includes(l), `${s.id}: overlay lạ "${l}"`);
    }
    if (s.chart.kind === "primary") {
      assert.ok((PRIMARY_CHART_IDS as readonly string[]).includes(s.chart.id), `${s.id}`);
    } else {
      assert.ok(s.chart.why.length > 0, `${s.id}: “không biểu đồ” phải nói lý do`);
    }
  }
});

test("cảnh sở hữu `t` được, nhưng KHÔNG cảnh nào sở hữu `b` (§1.9)", () => {
  for (const s of SCENES) {
    for (const b of s.beats) {
      if (b.t) assert.equal(b.t.kind, "model-argmax", `${s.id}/${b.id}`);
      // Không có đường nào để một cảnh khai brush: kiểu `BeatSpec` không có trường đó, và
      // test này ghim lại điều đó — một câu chuyện lọc brush của workspace sẽ trả người xem
      // về một bản đồ đã bị lọc mà không hề nói ra.
      assert.equal("brush" in b, false, `${s.id}/${b.id}`);
    }
  }
});

test("mark chỉ sống ở nhịp có trường ĐƯỜNG — nếu không, App không nạp roads.parquet", () => {
  for (const s of SCENES) {
    for (const b of s.beats) {
      if (b.marks.length === 0) continue;
      assert.ok(b.field.startsWith("road:"), `${s.id}/${b.id}: mark ở nhịp không tô đường`);
    }
  }
});
