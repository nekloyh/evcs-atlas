/**
 * AT10-5 — lifecycle của sổ kép `request-cache.ts` (Phase 10, sau QA).
 *
 * Đây là bản kiểm HÀNH VI, không phải kiểm cấu trúc: cache được tách khỏi `queries.ts`
 * đúng để chỗ này chạy được mà không dựng DuckDB. Hai ca mà QA đòi — hơn 4 request đồng
 * thời, và một request cũ ngã SAU khi bị thay — đều nằm ở đây.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { makeRequestCache } from "../src/data/request-cache";

/** Loader điều khiển được: mỗi khoá một cặp resolve/reject, đếm số lần được gọi. */
function harness() {
  const calls: string[] = [];
  const gates = new Map<string, { resolve: (v: string) => void; reject: (e: unknown) => void }>();
  const load = (key: string) => () => {
    calls.push(key);
    return new Promise<string>((resolve, reject) => gates.set(key, { resolve, reject }));
  };
  return { calls, gates, load };
}

test("khoá đã xong trả về từ sổ nhớ — loader không chạy lần hai", async () => {
  const h = harness();
  const c = makeRequestCache<string>(4);

  const first = c.get("a", h.load("a"));
  h.gates.get("a")!.resolve("A");
  assert.equal(await first, "A");
  assert.deepEqual(c.sizes(), { inFlight: 0, settled: 1 });

  assert.equal(await c.get("a", h.load("a")), "A");
  assert.deepEqual(h.calls, ["a"], "lần đọc thứ hai KHÔNG được phát truy vấn");
});

test("hai lần đọc cùng khoá trong lúc đang chạy dùng CHUNG một promise", async () => {
  const h = harness();
  const c = makeRequestCache<string>(4);

  const p1 = c.get("a", h.load("a"));
  const p2 = c.get("a", h.load("a"));
  assert.equal(p1, p2, "cùng một đối tượng promise");
  assert.deepEqual(h.calls, ["a"]);

  h.gates.get("a")!.resolve("A");
  assert.equal(await p2, "A");
});

test("QUÁ trần khi đang chạy: không promise nào bị đuổi, mỗi khoá vẫn đúng một truy vấn", async () => {
  const h = harness();
  const c = makeRequestCache<string>(4);
  const keys = ["a", "b", "c", "d", "e", "f", "g"]; // 7 > trần 4

  const all = keys.map((k) => c.get(k, h.load(k)));
  assert.deepEqual(c.sizes(), { inFlight: 7, settled: 0 },
    "sổ đang-chạy KHÔNG có trần — đuổi một promise đang bay chỉ tốn thêm một truy vấn");

  // Đọc lại toàn bộ trong lúc còn bay: vẫn không phát thêm truy vấn nào.
  keys.forEach((k) => c.get(k, h.load(k)));
  assert.deepEqual(h.calls, keys, "7 truy vấn cho 7 khoá, không hơn");

  for (const k of keys) h.gates.get(k)!.resolve(k.toUpperCase());
  assert.deepEqual(await Promise.all(all), ["A", "B", "C", "D", "E", "F", "G"]);

  // Sau khi ngã ngũ, trần mới có hiệu lực — và giữ 4 khoá XONG SAU CÙNG.
  assert.deepEqual(c.sizes(), { inFlight: 0, settled: 4 });
  assert.deepEqual(h.calls.length, 7);
  assert.equal(await c.get("g", h.load("g")), "G");
  assert.equal(h.calls.length, 7, "'g' xong sau cùng nên còn trong sổ nhớ");
  // 'a' đã bị đuổi: đọc lại PHẢI phát truy vấn mới. Không await — gate mới chưa ai mở, và
  // một test treo trên promise của chính nó thì không còn là cổng hồi quy.
  const again = c.get("a", h.load("a"));
  assert.equal(h.calls.length, 8, "'a' đã bị đuổi nên đọc lại là một truy vấn mới — đúng theo thiết kế");
  h.gates.get("a")!.resolve("A2");
  assert.equal(await again, "A2");
});

test("LRU tính theo lần ĐỌC gần nhất, không theo lần nạp", async () => {
  const h = harness();
  const c = makeRequestCache<string>(2);
  for (const k of ["a", "b"]) {
    const p = c.get(k, h.load(k));
    h.gates.get(k)!.resolve(k);
    await p;
  }
  await c.get("a", h.load("a")); // chạm 'a' → 'b' thành cũ nhất

  const p = c.get("c", h.load("c"));
  h.gates.get("c")!.resolve("c");
  await p;

  assert.deepEqual(c.sizes(), { inFlight: 0, settled: 2 });
  assert.equal(await c.get("a", h.load("a")), "a");
  assert.equal(h.calls.filter((k) => k === "a").length, 1, "'a' vừa được chạm nên phải còn");

  const reloadB = c.get("b", h.load("b"));
  assert.equal(h.calls.filter((k) => k === "b").length, 2, "'b' là cũ nhất nên bị đuổi");
  h.gates.get("b")!.resolve("b2");
  assert.equal(await reloadB, "b2");
});

test("request cũ ngã KHÔNG được xoá entry mới hơn của cùng khoá", async () => {
  // Ca này là finding 10-QA-005: với một Map gộp, `catch` xoá theo KHOÁ nên một truy vấn
  // cũ lỗi sau khi bị thay sẽ bắn rụng promise mới. Ở đây nhánh lỗi so identity.
  const c = makeRequestCache<string>(4);
  let resolveOld!: (v: string) => void;
  let rejectOld!: (e: unknown) => void;
  let resolveNew!: (v: string) => void;

  const oldP = c.get("a", () => new Promise<string>((res, rej) => { resolveOld = res; rejectOld = rej; }));
  void resolveOld;

  // Ép "cũ" ra khỏi sổ đang-chạy bằng cách cho nó lỗi trước, rồi nạp lại — sau đó mới cho
  // promise cũ ngã lần nữa không thể xảy ra; nên dựng lại đúng hình huống bằng clear().
  c.clear();
  const newP = c.get("a", () => new Promise<string>((res) => { resolveNew = res; }));
  assert.notEqual(oldP, newP, "sau clear, khoá 'a' thuộc về một promise khác");

  rejectOld(new Error("truy vấn cũ ngã"));
  await assert.rejects(oldP, /truy vấn cũ ngã/);
  assert.deepEqual(c.sizes(), { inFlight: 1, settled: 0 },
    "promise MỚI vẫn còn nguyên trong sổ đang-chạy");

  resolveNew("A-mới");
  assert.equal(await newP, "A-mới");
  assert.deepEqual(c.sizes(), { inFlight: 0, settled: 1 });
});

test("promise lỗi KHÔNG vào sổ nhớ — lần đọc sau là một lần thử lại thật", async () => {
  const h = harness();
  const c = makeRequestCache<string>(4);

  const p = c.get("a", h.load("a"));
  h.gates.get("a")!.reject(new Error("mạng đứt"));
  await assert.rejects(p, /mạng đứt/);
  assert.deepEqual(c.sizes(), { inFlight: 0, settled: 0 });

  const retry = c.get("a", h.load("a"));
  assert.deepEqual(h.calls, ["a", "a"], "thử lại phải phát truy vấn mới");
  h.gates.get("a")!.resolve("A");
  assert.equal(await retry, "A");
});

test("trần phải là số nguyên ≥ 1 — cấu hình hỏng thì nổ ngay lúc dựng", () => {
  assert.throws(() => makeRequestCache<string>(0), /trần cache/);
  assert.throws(() => makeRequestCache<string>(-1), /trần cache/);
  assert.throws(() => makeRequestCache<string>(2.5), /trần cache/);
});

test("clear() dọn cả hai sổ", async () => {
  const h = harness();
  const c = makeRequestCache<string>(4);
  const p = c.get("a", h.load("a"));
  h.gates.get("a")!.resolve("A");
  await p;
  const bp = c.get("b", h.load("b"));
  assert.deepEqual(c.sizes(), { inFlight: 1, settled: 1 });
  c.clear();
  assert.deepEqual(c.sizes(), { inFlight: 0, settled: 0 });

  // Promise bị clear() bỏ rơi vẫn phải ngã ngũ bình thường — clear() không huỷ truy vấn,
  // nó chỉ quên chúng. (Và một promise treo sẽ làm `node --test` huỷ các test sau.)
  h.gates.get("b")!.resolve("B");
  assert.equal(await bp, "B");
  assert.deepEqual(c.sizes(), { inFlight: 0, settled: 0 }, "kết quả của promise đã bị quên KHÔNG quay lại sổ");
});
