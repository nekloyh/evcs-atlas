/**
 * Test cho serialization URL hash — DESIGN.md §9.
 *
 * Vì sao có file này: §9 là một **hợp đồng**, không phải một trạng thái. Ảnh chụp chứng
 * minh được rằng MỘT hash hỏng bị bỏ đúng cách; nó không chứng minh được rằng mọi khoá
 * hỏng đều bị bỏ RIÊNG khoá đó, rằng khoá để dành của M4 không bị xén, hay rằng vòng
 * đọc↔ghi hội tụ. Đây là logic thuần trên chuỗi (§12).
 *
 * `parseHash`/`serializeHash` cố tình nhận CHUỖI chứ không đụng `window`, đúng để test
 * được ngoài trình duyệt.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseHash, resolveHashField, serializeHash } from "../src/state/hash.ts";
import {
  parseNationalHash,
  serializeNationalHash,
} from "../src/national/hash.ts";
import type { HashState } from "../src/state/types.ts";
import { DEFAULT_DATASET_ID } from "../src/state/selection.ts";

const VIEW = { lng: 105.84, lat: 21, zoom: 9.3, pitch: 0, bearing: 0 };
const BASE: HashState = {
  field: "population",
  scaleMode: "binned",
  mode: "2d",
  view: VIEW,
  layers: [],
  cell: null,
  scene: null,
  paintOn: true,
  dataMode: false,
  nationalMode: false,
  t: 0,
  filter: null,
};

test("field hash phân biệt khoá bị xoá với khoá có mặt nhưng sai", () => {
  assert.equal(resolveHashField("built_frac", undefined, { fieldPresent: false }), "population");
  assert.equal(resolveHashField("built_frac", undefined, { fieldPresent: true }), "built_frac");
  assert.equal(resolveHashField("built_frac", "n_ports", { fieldPresent: true }), "n_ports");
});

test("hash Hà Nội canonicalize khoá dataset cũ thay vì giữ state giả", () => {
  const serialized = serializeHash(BASE, "#tinh=79&f=population");
  assert.doesNotMatch(serialized, /(?:^|&)tinh=/);
  assert.match(serialized, /(?:^|&)f=population/);
});

test("`tinh=vn` là primary mode bền và thắng các mode chung trong hash gõ tay", () => {
  assert.deepEqual(parseHash("#tinh=vn&d=1&s=von-cuc&f=population"), { nationalMode: true });
});

test("serializer chung giữ state do NationalApp sở hữu nhưng xoá mode xung đột", () => {
  const out = serializeHash(
    { ...BASE, nationalMode: true },
    "#tinh=vn&f=ports_per_10k_pop&l=stations&m=3d&s=von-cuc&d=1",
  );
  assert.match(out, /(?:^|&)tinh=vn/);
  assert.match(out, /(?:^|&)f=ports_per_10k_pop/);
  assert.match(out, /(?:^|&)l=stations/);
  assert.match(out, /(?:^|&)m=3d/);
  assert.doesNotMatch(out, /(?:^|&)(?:s|d)=/);
});

// ── Khoá `l` — overlay (§4d, mới ở M2) ─────────────────────────────────────────

test("`l` đọc được danh sách overlay", () => {
  assert.deepEqual(parseHash("#l=stations,beyond2km").layers, ["stations", "beyond2km"]);
});

test("ID overlay lạ bị bỏ RIÊNG nó, các ID hợp lệ vẫn bật", () => {
  // Cùng luật "bỏ từng khoá" của §9 nhưng ở một bậc sâu hơn: một ID gõ sai không được
  // phép tắt hết những lớp người dùng thật sự yêu cầu.
  assert.deepEqual(parseHash("#l=stations,khongcothat,beyond2km").layers, ["stations", "beyond2km"]);
});

test("`l` toàn ID lạ ⇒ danh sách rỗng, KHÔNG phải undefined", () => {
  // Khác nhau thật: rỗng = "người dùng nói không bật gì"; undefined = "hash không nói gì".
  assert.deepEqual(parseHash("#l=abc,xyz").layers, []);
});

test("hash không có khoá `l` thì `layers` là undefined — im lặng khác với nói không", () => {
  assert.equal(parseHash("#f=population").layers, undefined);
});

test("ID trùng lặp bị gộp — một lớp không bật được hai lần", () => {
  assert.deepEqual(parseHash("#l=stations,stations").layers, ["stations"]);
});

test("khoảng trắng quanh ID vẫn nhận — người ta sửa tay URL thì hay để lọt dấu cách", () => {
  assert.deepEqual(parseHash("#l=stations, beyond2km").layers, ["stations", "beyond2km"]);
});

test("`l` ghi theo thứ tự CHUẨN HOÁ, không theo thứ tự bấm", () => {
  // Cùng một trạng thái phải cho cùng một chuỗi, nếu không hai link giống hệt nhau về nội
  // dung sẽ trông khác nhau khi so bằng mắt.
  const a = serializeHash({ ...BASE, layers: ["beyond2km", "stations"] });
  const b = serializeHash({ ...BASE, layers: ["stations", "beyond2km"] });
  assert.equal(a, b);
  assert.match(a, /l=stations,beyond2km/);
});

test("không overlay nào bật thì KHÔNG ghi khoá `l` rỗng", () => {
  assert.doesNotMatch(serializeHash(BASE), /l=/);
});

test("`sc` round-trip gradient; absent và giá trị lạ đều về binned", () => {
  assert.equal(parseHash("#sc=g").scaleMode, "gradient");
  assert.equal(parseHash("#f=population").scaleMode, "binned");
  assert.equal(parseHash("#sc=continuous").scaleMode, "binned");
  assert.match(serializeHash({ ...BASE, scaleMode: "gradient" }), /(?:^|&)sc=g(?:&|$)/);
  assert.doesNotMatch(serializeHash(BASE), /(?:^|&)sc=/);
});

test("story pin binned và preset/hash mặc định không tự phát `sc`", () => {
  assert.equal(parseHash("#s=von-cuc&sc=g").scaleMode, "binned");
  assert.doesNotMatch(serializeHash(BASE), /(?:^|&)sc=/);
});

// ── Khoá `f` — hai họ trường (§6b) ─────────────────────────────────────────────

test("tên trần là trường của Ô, tiền tố `commune:` là trường của XÃ", () => {
  assert.equal(parseHash("#f=population").field, "population");
  assert.equal(parseHash("#f=commune:population").field, "commune:population");
});

test("dấu `:` KHÔNG bị percent-encode — hash là thứ mentor đọc và gửi", () => {
  const s = serializeHash({ ...BASE, field: "commune:population" });
  assert.match(s, /f=commune:population/);
  assert.doesNotMatch(s, /%3A/i);
});

test("tên trường không có thật bị bỏ", () => {
  assert.equal(parseHash("#f=khong_co_that").field, undefined);
  assert.equal(parseHash("#f=commune:khong_co_that").field, undefined);
  // Trường của Ô mà gắn tiền tố xã cũng là không có thật.
  assert.equal(parseHash("#f=commune:n_mall").field, undefined);
});

test("biến inspect-only không phải deep link bản đồ hợp lệ", () => {
  assert.equal(parseHash("#f=road_len_m").field, undefined);
  assert.equal(parseHash("#f=demand_supply_gap").field, undefined);
});

// ── §9: hash hỏng thì bỏ TỪNG KHOÁ, không reset cả app ─────────────────────────

test("khoá hỏng không kéo theo khoá lành", () => {
  const p = parseHash("#f=khong_co_that&m=4d&v=xxx&l=stations&c=88415cb637fffff");
  assert.equal(p.field, undefined);
  assert.equal(p.mode, undefined);
  assert.equal(p.view, undefined);
  // Hai khoá lành vẫn nguyên vẹn.
  assert.deepEqual(p.layers, ["stations"]);
  assert.equal(p.cell, "88415cb637fffff");
});

test("`v` phải đủ 5 số và trong biên; thiếu một số thì bỏ cả khoá", () => {
  assert.equal(parseHash("#v=105.84,21.00,9.3,0").view, undefined);
  assert.equal(parseHash("#v=105.84,21.00,9.3,0,0").view?.zoom, 9.3);
  assert.equal(parseHash("#v=999,21.00,9.3,0,0").view, undefined, "lng ngoài biên");
  assert.equal(parseHash("#v=105.84,21.00,99,0,0").view, undefined, "zoom ngoài biên");
  assert.equal(parseHash("#v=105.84,21.00,9.3,99,0").view, undefined, "pitch ngoài biên");
});

test("`m=3d` là chế độ THẬT từ M3.5; giá trị lạ vẫn bị bỏ", () => {
  // Luật cũ (bỏ `3d` như khoá hỏng) đứng trên tiền đề "bật nó không vẽ gì khác đi" —
  // tiền đề đó hết đúng khi M3.5 dựng fill-extrusion + khối POI (§9).
  assert.equal(parseHash("#m=3d").mode, "3d");
  assert.equal(parseHash("#m=2d").mode, "2d");
  assert.equal(parseHash("#m=4d").mode, undefined);
});

test("`c` sai hình dạng bị bỏ; đúng hình dạng thì nhận", () => {
  assert.equal(parseHash("#c=khong-phai-h3").cell, undefined);
  assert.equal(parseHash("#c=88415CB637FFFFF").cell, undefined, "H3 là hex CHỮ THƯỜNG");
  assert.equal(parseHash("#c=88415cb637fffff").cell, "88415cb637fffff");
});

// ── `t`/`b` từ khoá ĐỂ DÀNH thành khoá THẬT — M4 (§9b) ─────────────────────────
//
// Test cũ khẳng định `t`/`b` được **chép nguyên văn** khi ghi lại, kể cả khi nội dung là
// rác (`b=pop:120-4400` — cú pháp nháp của §9 trước M4). Tiền đề của nó là "M4 chưa dựng,
// nên bản hiện tại không có quyền có ý kiến về nội dung hai khoá đó". Tiền đề hết đúng khi
// M4 dựng dock và scrubber: giờ chúng đi qua bộ kiểm của chính mình, và chép nguyên văn
// một chuỗi rác chính là thứ §9 cấm ("hash không hợp lệ thì bỏ qua từng khoá một").

test("`t`/`b` KHÔNG còn được chép nguyên văn từ hash cũ — chúng đọc từ state", () => {
  const s = serializeHash(BASE, "#f=population&t=48&b=pop:120-4400");
  assert.doesNotMatch(s, /t=48/, "`t` của state là 0, nên không ghi ra");
  assert.doesNotMatch(s, /b=/, "`b` của state rỗng, và cú pháp cũ `pop:120-4400` là rác");
});

test("khoá lạ hoàn toàn thì KHÔNG được giữ", () => {
  assert.doesNotMatch(serializeHash(BASE, "#zzz=1"), /zzz/);
});

// ── Khoá `t` — vị trí scrubber (§3e) ───────────────────────────────────────────

test("`t` đọc được số nguyên trong 0–167", () => {
  assert.equal(parseHash("#t=0").t, 0);
  assert.equal(parseHash("#t=46").t, 46);
  assert.equal(parseHash("#t=167").t, 167);
});

test("`t` ngoài biên hoặc không nguyên bị bỏ — không làm tròn hộ người gửi link", () => {
  for (const bad of ["-1", "168", "999", "48.5", "abc", ""]) {
    assert.equal(parseHash(`#t=${bad}`).t, undefined, bad);
  }
});

test("chỉ ghi `t` khi KHÁC mặc định — cùng khuôn `l` rỗng và `p=1`", () => {
  assert.doesNotMatch(serializeHash(BASE), /[?&]t=/);
  assert.match(serializeHash({ ...BASE, t: 75 }), /t=75/);
});

test("`t` hỏng không kéo theo khoá lành", () => {
  const p = parseHash("#f=population&t=999&l=stations");
  assert.equal(p.t, undefined);
  assert.equal(p.field, "population");
  assert.deepEqual(p.layers, ["stations"]);
});

test("`t`/`b` KHÔNG đọc và KHÔNG ghi trong CÂU CHUYỆN — dock/scrubber không dựng ở đó", () => {
  const p = parseHash("#s=di-vong&t=46&b=h:population:1..2");
  assert.equal(p.t, undefined);
  assert.equal(p.filter, undefined);
  const s = serializeHash({
    ...BASE,
    scene: "von-cuc",
    t: 46,
    filter: {
      version: 1,
      mode: "subset",
      datasetId: DEFAULT_DATASET_ID,
      entity: "h3-cell",
      field: "population",
      op: "between",
      lo: 1,
      hi: 2,
      missing: "exclude",
      source: "demand-population-histogram",
    },
  });
  assert.doesNotMatch(s, /[?&]t=/);
  assert.doesNotMatch(s, /[?&]b=/);
});

// ── Khoá `b` — đúng một Phase 4 SUBSET filter ─────────────────────────────────

test("`b` đọc filter Phase 4 và legacy histogram; scatter/window legacy không sống lại", () => {
  const modern = parseHash("#b=f1~h3-cell~population~between~120..4400").filter;
  assert.ok(modern && modern.entity === "h3-cell" && modern.op === "between");
  assert.equal(modern.lo, 120);
  assert.equal(modern.hi, 4400);

  const legacy = parseHash("#b=h:population:50..99,w:0..4:7..19").filter;
  assert.ok(legacy && legacy.entity === "h3-cell" && legacy.op === "between");
  assert.equal(legacy.lo, 50);
  assert.equal(legacy.hi, 99);
});

test("`b` rác ⇒ như khoá filter vắng mặt", () => {
  assert.equal(parseHash("#b=pop:120-4400").filter, undefined);
  assert.equal(parseHash("#b=xyz").filter, undefined);
  assert.equal(parseHash("#b=").filter, undefined);
});

test("filter hỏng không kéo theo khoá lành", () => {
  const p = parseHash("#f=population&b=xyz&t=46&l=stations");
  assert.equal(p.filter, undefined);
  assert.equal(p.field, "population");
  assert.equal(p.t, 46);
  assert.deepEqual(p.layers, ["stations"]);
});

// Tên cũ của phép kiểm này là "hội tụ ở lần thứ HAI", và nó khẳng định
// `lo === 120.1235`, tức khẳng định chính phép làm tròn đang bóp hẹp tập con (xem docstring
// của `fmt` trong `state/filter.ts`). Phép kiểm đó xanh trong khi link gửi đi mất một ô —
// cùng loại lỗi với fixture bịa `district_name` ở `search.test.ts`: một khẳng định về CÁCH
// LÀM đã che mất một khẳng định về KẾT QUẢ.
//
// Ghi không mất mát hội tụ ngay ở lần THỨ NHẤT, nên phép kiểm chặt hơn: `once === twice`
// vẫn phải đúng, và biên phải đọc lại ĐÚNG BẰNG biên đã ghi.
test("vòng ghi ↔ đọc filter hội tụ ngay lần đầu và không đổi biên", () => {
  const lo = 120.123456;
  const state: HashState = {
    ...BASE,
    t: 75,
    filter: { version: 1, mode: "subset", datasetId: DEFAULT_DATASET_ID, entity: "h3-cell", field: "population", op: "between", lo, hi: 4400, missing: "exclude", source: "demand-population-histogram" },
  };
  const once = serializeHash(state);
  const back = parseHash(`#${once}`);
  const twice = serializeHash({ ...state, ...back, filter: back.filter ?? null }, `#${once}`);
  assert.equal(once, twice);
  assert.equal(back.t, 75);
  assert.equal(back.filter?.entity, "h3-cell");
  assert.equal(
    back.filter?.entity === "h3-cell" ? back.filter.lo : undefined,
    lo,
    "biên phải đọc lại đúng bằng biên đã ghi, không làm tròn",
  );
  // Một ô nằm ĐÚNG trên biên vẫn phải thuộc tập con sau khi đi qua URL.
  assert.ok(back.filter?.entity === "h3-cell" && lo >= back.filter.lo && lo <= back.filter.hi);
});

test("filter range giữ `..` và `-` đọc được bằng mắt", () => {
  const s = serializeHash({
    ...BASE,
    filter: { version: 1, mode: "subset", datasetId: DEFAULT_DATASET_ID, entity: "h3-cell", field: "population", op: "between", lo: -2000, hi: 500, missing: "exclude", source: "demand-population-histogram" },
  });
  assert.match(s, /b=f1~h3-cell~population~between~-2000\.\.500/);
  assert.doesNotMatch(s, /%2E|%2D/i);
});

// ── Vòng đọc ↔ ghi phải hội tụ ─────────────────────────────────────────────────

test("ghi rồi đọc lại cho đúng state ban đầu", () => {
  const state: HashState = {
    field: "commune:ports_per_10k_pop",
    scaleMode: "binned",
    mode: "2d",
    view: { lng: 105.84, lat: 21, zoom: 11, pitch: 0, bearing: 0 },
    layers: ["stations", "beyond2km"],
    cell: "88415cb637fffff",
    scene: null,
    paintOn: true,
    dataMode: false,
    nationalMode: false,
    t: 0,
    filter: null,
    };
  const back = parseHash(`#${serializeHash(state)}`);
  assert.equal(back.field, state.field);
  assert.equal(back.mode, state.mode);
  assert.deepEqual(back.view, state.view);
  assert.deepEqual(back.layers, state.layers);
  assert.equal(back.cell, state.cell);
});

test("ghi hai lần liên tiếp cho cùng một chuỗi — vòng hashchange phải DỪNG", () => {
  // Đây là điều kiện để listener `hashchange` không lặp vô hạn: nếu chuỗi ghi ra khác
  // chuỗi vừa đọc vào, mỗi vòng lại sinh một sự kiện nữa.
  const state: HashState = { ...BASE, layers: ["beyond2km", "stations"], cell: "88415cb637fffff" };
  const once = serializeHash(state);
  const parsed = parseHash(`#${once}`);
  const twice = serializeHash({ ...state, ...parsed, layers: parsed.layers ?? [] }, `#${once}`);
  assert.equal(once, twice);
});

// ── Khoá `c` mang HAI loại đối tượng — M2.1-A ──────────────────────────────────

test("`c` nhận cả ô lẫn xã, và phân biệt được chúng", () => {
  assert.equal(parseHash("#c=88415cb637fffff").cell, "88415cb637fffff");
  assert.equal(parseHash("#c=commune:00004").cell, "commune:00004");
});

test("mã xã sai hình dạng bị bỏ — 5 chữ số, không hơn không kém", () => {
  for (const bad of ["commune:4", "commune:000045", "commune:0000a", "commune:", "commune:abcde"]) {
    assert.equal(parseHash(`#c=${bad}`).cell, undefined, bad);
  }
});

test("`c` hỏng không kéo theo khoá nào khác", () => {
  const p = parseHash("#f=population&c=commune:xx&l=stations");
  assert.equal(p.cell, undefined);
  assert.equal(p.field, "population");
  assert.deepEqual(p.layers, ["stations"]);
});

test("chọn xã: ghi rồi đọc lại ra đúng chuỗi cũ, và `:` không bị encode", () => {
  const s = serializeHash({ ...BASE, cell: "commune:00004" });
  assert.match(s, /c=commune:00004/);
  assert.doesNotMatch(s, /%3A/i);
  assert.equal(parseHash(`#${s}`).cell, "commune:00004");
});

// ── Khoá `p` — nút TẮT mặt tô, thêm sau M3.5 (§6c) ──────────────────────────────

test("`p=0` tắt mặt tô; `p=1` và vắng mặt đều là bật", () => {
  assert.equal(parseHash("#p=0").paintOn, false);
  assert.equal(parseHash("#p=1").paintOn, true);
  assert.equal(parseHash("#").paintOn, undefined, "vắng mặt ⇒ không set, applyHash tự mặc định true");
});

test("giá trị `p` lạ bị bỏ như mọi khoá hỏng khác", () => {
  assert.equal(parseHash("#p=xyz").paintOn, undefined);
});

test("serializeHash chỉ ghi `p=0` khi tắt — mặc định bật không ghi gì, cùng khuôn với `l` rỗng", () => {
  assert.doesNotMatch(serializeHash(BASE), /[?&]p=/);
  assert.match(serializeHash({ ...BASE, paintOn: false }), /p=0/);
});

test("vòng ghi ↔ đọc `p` hội tụ", () => {
  const off = { ...BASE, paintOn: false };
  assert.equal(parseHash(`#${serializeHash(off)}`).paintOn, false);
  assert.equal(parseHash(`#${serializeHash(BASE)}`).paintOn, undefined);
});

test("khoá `p` KHÔNG được ghi khi có `s` — cùng luật §9a với f/v/l", () => {
  const s = serializeHash({ ...BASE, scene: "von-cuc", paintOn: false });
  assert.doesNotMatch(s, /[?&]p=/);
});


// ── Khoá `m` ở bậc TOÀN QUỐC — chế độ 3D (§9) ───────────────────────────────────
//
// Cùng khoá, cùng từ vựng với bậc tỉnh, và đó là cả điểm: một người đã học `m=3d` ở
// `#tinh=01` phải gõ đúng chữ ấy ở `#tinh=vn`. Hash của hai bậc là hai module khác nhau,
// nên "cùng từ vựng" là thứ phải assert chứ không phải thứ để tin.

const KNOWN_F = new Set(["c:population", "p:n_stations"]);
const KNOWN_L = new Set(["stations", "poi_mall"]);
const parseN = (h: string) => parseNationalHash(h, "c:population", KNOWN_F, KNOWN_L);

test("`m=3d` đọc được; vắng khoá là 2d", () => {
  assert.equal(parseN("#tinh=vn&m=3d").mode, "3d");
  assert.equal(parseN("#tinh=vn").mode, "2d");
});

test("giá trị `m` lạ về 2d, KHÔNG nổ — cùng luật với mọi khoá hỏng khác", () => {
  for (const xau of ["4d", "", "3D", "true", "2d ", "3d,3d"]) {
    assert.equal(parseN(`#tinh=vn&m=${encodeURIComponent(xau)}`).mode, "2d", xau);
  }
});

test("serialize chỉ ghi `m` khi 3d — mặc định 2d không ghi rác vào link", () => {
  const base = { field: "c:population", layers: new Set<string>() };
  assert.doesNotMatch(serializeNationalHash("", { ...base, mode: "2d" }), /[?&#]m=/);
  assert.match(serializeNationalHash("", { ...base, mode: "3d" }), /m=3d/);
});

test("bật rồi tắt 3D thì khoá `m` biến mất hẳn, không thành `m=2d`", () => {
  const base = { field: "c:population", layers: new Set<string>() };
  const on = serializeNationalHash("", { ...base, mode: "3d" });
  const off = serializeNationalHash(on, { ...base, mode: "2d" });
  assert.doesNotMatch(off, /[?&#]m=/);
});

test("vòng ghi ↔ đọc `m` hội tụ", () => {
  const st = { field: "c:population", layers: new Set(["stations"]), mode: "3d" as const };
  const back = parseN(serializeNationalHash("", st));
  assert.equal(back.mode, "3d");
  assert.equal(back.field, st.field);
  assert.deepEqual([...back.layers], ["stations"]);
});

test("đổi mode KHÔNG làm mất khoá khác của hash", () => {
  const prev = "#tinh=vn&f=c:population&l=stations&giu=nguyen";
  const s = serializeNationalHash(prev, {
    field: "c:population",
    layers: new Set(["stations"]),
    mode: "3d",
  });
  assert.match(s, /giu=nguyen/);
  assert.match(s, /tinh=vn/);
  assert.match(s, /l=stations/);
  assert.match(s, /m=3d/);
});

test("hash toàn quốc loại khoá do workspace tỉnh sở hữu nhưng giữ extension lạ", () => {
  const s = serializeNationalHash("#v=105,21,9,0,0&c=commune:00004&t=46&giu=nguyen", {
    field: "c:population",
    layers: new Set(),
    mode: "2d",
  });
  assert.doesNotMatch(s, /(?:^|[&#])(?:v|c|t)=/);
  assert.match(s, /giu=nguyen/);
  assert.match(s, /f=c:population/);
  assert.doesNotMatch(s, /%3A/i);
});
