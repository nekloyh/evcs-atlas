/**
 * Phần THUẦN của đường NẠP FILE (chế độ proxy, cửa thứ hai).
 *
 * Ba nhóm rủi ro, và cả ba đều là loại "sai mà không nổ" — đúng hạng nguy hiểm nhất ở một
 * màn hình dựng ra để soi xem dữ liệu có đúng không:
 *
 *  1. **WKB đọc trượt** ⇒ mọi POI thành một chấm ⇒ màn hình nói "lớp này tuyển từ TÊN",
 *     một kết luận sai mà nhìn hoàn toàn bình thường.
 *  2. **Một ô lạ làm chết cả tập** (`bigint` của `osm_id`, `NaN` của cột đo) ⇒ 10 nghìn
 *     dòng biến mất vì một cột.
 *  3. **Dòng bị bỏ trong im lặng** ⇒ `n` nhỏ hơn thật mà không ai biết; `n_bo_qua` là thứ
 *     duy nhất nói ra điều đó nên nó phải đếm đúng.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coHinh,
  diemNhay,
  docGeoJSON,
  docWKB,
  gioUtc,
  gom,
  khoaNap,
  laTam,
  sach,
  tamHinh,
  toaDo,
  tomTat,
  tuFeature,
  tuHang,
} from "../src/proxy/nap";

// ── dựng WKB bằng tay ────────────────────────────────────────────────────────────────
// Không mượn thư viện: mục đích của test này là kiểm bộ đọc trước những byte THẬT mà
// shapely/PostGIS sinh ra, nên byte phải do test tự đặt.

function wkb(parts: (number | ["u32", number] | ["f64", number])[], le = true): Uint8Array {
  const buf: number[] = [];
  const dv = new DataView(new ArrayBuffer(8));
  for (const p of parts) {
    if (typeof p === "number") buf.push(p);
    else if (p[0] === "u32") {
      dv.setUint32(0, p[1], le);
      for (let i = 0; i < 4; i++) buf.push(dv.getUint8(i));
    } else {
      dv.setFloat64(0, p[1], le);
      for (let i = 0; i < 8; i++) buf.push(dv.getUint8(i));
    }
  }
  return new Uint8Array(buf);
}

const diemWKB = (x: number, y: number, ma = 1) =>
  wkb([1, ["u32", ma], ["f64", x], ["f64", y]]);

/** Polygon một vành, 4 đỉnh (hình vuông đóng). */
const oVuongWKB = (x: number, y: number, d: number) =>
  wkb([
    1,
    ["u32", 3],
    ["u32", 1], // 1 vành
    ["u32", 5], // 5 điểm
    ["f64", x], ["f64", y],
    ["f64", x + d], ["f64", y],
    ["f64", x + d], ["f64", y + d],
    ["f64", x], ["f64", y + d],
    ["f64", x], ["f64", y],
  ]);

test("docWKB đọc Point little-endian", () => {
  assert.deepEqual(docWKB(diemWKB(105.8342, 21.0278)), {
    type: "Point",
    coordinates: [105.8342, 21.0278],
  });
});

test("docWKB đọc cả BIG-endian — cờ byte-order phải được tôn trọng, không giả định", () => {
  const be = wkb([0, ["u32", 1], ["f64", 105.8342], ["f64", 21.0278]], false);
  assert.deepEqual(docWKB(be), { type: "Point", coordinates: [105.8342, 21.0278] });
});

test("docWKB đọc Polygon và giữ vành đóng", () => {
  const g = docWKB(oVuongWKB(105, 21, 0.001));
  assert.equal(g?.type, "Polygon");
  const v = (g as GeoJSON.Polygon).coordinates[0]!;
  assert.equal(v.length, 5);
  assert.deepEqual(v[0], v[4]); // vành phải đóng, không được rơi mất đỉnh cuối
});

test("docWKB đọc MultiPolygon — phần tử con mang HEADER RIÊNG", () => {
  const a = oVuongWKB(105, 21, 0.001);
  const b = oVuongWKB(106, 22, 0.002);
  const bytes = new Uint8Array([...wkb([1, ["u32", 6], ["u32", 2]]), ...a, ...b]);
  const g = docWKB(bytes);
  assert.equal(g?.type, "MultiPolygon");
  assert.equal((g as GeoJSON.MultiPolygon).coordinates.length, 2);
});

test("docWKB bỏ chiều Z ở CẢ HAI phương ngữ — ISO 1001 và cờ cao của EWKB", () => {
  // ISO: 1000 + 1 = PointZ. Một toạ độ thứ ba phải bị nuốt, không được trôi thành điểm sau.
  const iso = wkb([1, ["u32", 1001], ["f64", 105.5], ["f64", 21.5], ["f64", 12]]);
  assert.deepEqual(docWKB(iso), { type: "Point", coordinates: [105.5, 21.5] });
  // EWKB: bit 0x80000000 = Z, 0x20000000 = có SRID (4 byte đứng ngay sau mã loại).
  const ew = wkb([
    1,
    ["u32", (0x80000000 | 0x20000000 | 1) >>> 0],
    ["u32", 4326],
    ["f64", 105.5], ["f64", 21.5], ["f64", 12],
  ]);
  assert.deepEqual(docWKB(ew), { type: "Point", coordinates: [105.5, 21.5] });
});

test("docWKB trả null (không NÉM) khi byte hỏng — dữ liệu hỏng không được thành lỗi app", () => {
  assert.equal(docWKB(new Uint8Array([1, 2, 3])), null);
  assert.equal(docWKB(new Uint8Array(0)), null);
  // Mã loại 7 = GeometryCollection: KHÔNG đoán một hình con làm đại diện.
  assert.equal(docWKB(wkb([1, ["u32", 7], ["u32", 0]])), null);
});

test("docWKB làm tròn 6 chữ số — cùng GEO_DECIMALS với bên python", () => {
  const g = docWKB(diemWKB(105.83421234567, 21.02781234567)) as GeoJSON.Point;
  assert.deepEqual(g.coordinates, [105.834212, 21.027812]);
});

test("coHinh: chỉ hình CÓ CẠNH mới là 'có hình' — MultiPoint vẫn là vị trí", () => {
  assert.equal(coHinh({ type: "Polygon" }), true);
  assert.equal(coHinh({ type: "LineString" }), true);
  assert.equal(coHinh({ type: "Point" }), false);
  assert.equal(coHinh({ type: "MultiPoint" }), false);
  assert.equal(coHinh(null), false);
});

test("sach giữ osm_id dạng bigint mà KHÔNG làm hỏng nó", () => {
  assert.equal(sach(1503681357n), 1503681357); // vừa Number ⇒ số
  // Vượt ngưỡng an toàn ⇒ CHUỖI, không phải một số đã bị làm tròn trong im lặng.
  assert.equal(sach(9007199254740993n), "9007199254740993");
});

test("sach: NaN/null/binary → null, và null bị loại khỏi properties", () => {
  assert.equal(sach(NaN), null);
  assert.equal(sach(Infinity), null);
  assert.equal(sach(null), null);
  assert.equal(sach(undefined), null);
  assert.equal(sach(new Uint8Array([1, 2])), null);
  assert.equal(sach(true), true);
  assert.equal(sach("Ngô Gia Tự"), "Ngô Gia Tự");
});

test("toaDo chấp nhận tên cột thay thế và dấu phẩy thập phân vi-VN", () => {
  assert.deepEqual(toaDo({ lat: 21, lng: 105 }), { lat: 21, lng: 105 });
  assert.deepEqual(toaDo({ latitude: 21, longitude: 105 }), { lat: 21, lng: 105 });
  // Cột đọc từ CSV/JSON hay về dạng chuỗi; "21,03" mà trượt là cả tập rơi vào n_bo_qua.
  assert.deepEqual(toaDo({ lat: "21,03", lng: "105,85" }), { lat: 21.03, lng: 105.85 });
  assert.equal(toaDo({ ten: "x" }), null);
  assert.equal(toaDo({ lat: 21 }), null); // thiếu một nửa thì không phải một toạ độ
});

test("tamHinh: tâm BBOX của một đa giác, không phải đỉnh đầu tiên", () => {
  const g = docWKB(oVuongWKB(105, 21, 0.002)) as GeoJSON.Polygon;
  assert.deepEqual(tamHinh(g), [105.001, 21.001]);
});

test("tuHang: hình học THẬT thắng, và co_hinh nói ra ta đang nhìn cái nào", () => {
  const f = tuHang({
    osm_id: 123n,
    name: "Chung cư A",
    geometry_wkb: oVuongWKB(105, 21, 0.002),
    lat: 21.001,
    lng: 105.001,
    area_m2: 1234.5,
  })!;
  assert.equal(f.geometry.type, "Polygon");
  assert.equal(f.properties.co_hinh, true);
  assert.equal(f.properties["osm_id"], 123);
  // geometry_wkb KHÔNG được lọt vào properties — ship hai lần cùng một thứ.
  assert.ok(!("geometry_wkb" in f.properties));
});

test("tuHang: không có WKB thì lui về Point, và co_hinh = false", () => {
  const f = tuHang({ name: "x", lat: 21, lng: 105 })!;
  assert.deepEqual(f.geometry, { type: "Point", coordinates: [105, 21] });
  assert.equal(f.properties.co_hinh, false);
});

test("tuHang: WKB HỎNG + có lat/lng ⇒ vẫn giữ dòng, chỉ tụt xuống 'chỉ biết vị trí'", () => {
  const f = tuHang({ geometry_wkb: new Uint8Array([9, 9]), lat: 21, lng: 105 })!;
  assert.equal(f.geometry.type, "Point");
  assert.equal(f.properties.co_hinh, false);
});

test("tuHang: không toạ độ và không hình ⇒ null (sẽ được ĐẾM vào n_bo_qua)", () => {
  assert.equal(tuHang({ name: "x" }), null);
});

test("tuHang: có WKB nhưng KHÔNG có cột lat/lng ⇒ suy tâm, không mất dòng", () => {
  const f = tuHang({ geometry_wkb: oVuongWKB(105, 21, 0.002) })!;
  assert.equal(f.properties["lat"], 21.001);
  assert.equal(f.properties["lng"], 105.001);
});

test("tuFeature: lat/lng trong properties THẮNG tâm bbox suy từ hình", () => {
  const f = tuFeature({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[105, 21], [105.01, 21], [105.01, 21.01], [105, 21]]] },
    properties: { lat: 21.004, lng: 105.004, name: "A" },
  })!;
  assert.equal(f.properties["lat"], 21.004);
  assert.equal(f.properties.co_hinh, true);
});

test("docGeoJSON nhận FeatureCollection, mảng trần, và MỘT Feature đơn lẻ", () => {
  const p = { type: "Feature", geometry: { type: "Point", coordinates: [105, 21] }, properties: {} };
  assert.equal(docGeoJSON(JSON.stringify({ type: "FeatureCollection", features: [p] })).feats.length, 1);
  assert.equal(docGeoJSON(JSON.stringify([p, p])).feats.length, 2);
  assert.equal(docGeoJSON(JSON.stringify(p)).feats.length, 1);
});

test("docGeoJSON NÉM câu nói ra cái sai ở FILE, không phải lỗi parser", () => {
  assert.throws(() => docGeoJSON("<html>"), /không phải JSON hợp lệ/);
  assert.throws(() => docGeoJSON('{"type":"Topology"}'), /Topology/);
  assert.throws(() => docGeoJSON('{"type":"FeatureCollection","features":[]}'), /RỖNG/);
  assert.throws(
    () => docGeoJSON('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{}}]}'),
    /lat\/lng/,
  );
});

test("gom đếm n_bo_qua — dòng bỏ đi phải ĐẾM ĐƯỢC, không biến mất im lặng", () => {
  const ok = tuHang({ lat: 21, lng: 105, a: 1 });
  const kq = gom([ok, null, ok, null, null], 5);
  assert.equal(kq.feats.length, 2);
  assert.equal(kq.n_bo_qua, 3);
});

test("gom: cột theo thứ tự GẶP ĐẦU TIÊN, gộp cả cột chỉ có ở dòng sau", () => {
  const a = tuHang({ lat: 21, lng: 105, name: "a" });
  const b = tuHang({ lat: 22, lng: 106, name: "b", them: "x" });
  assert.deepEqual(gom([a, b], 2).cot, ["lat", "lng", "name", "co_hinh", "them"]);
});

test("khoaNap: né khoá đã có trên đĩa, KHÔNG né chính nó (thả lại = thay)", () => {
  assert.equal(khoaNap("poi_chungcu.geojson", []), "poi_chungcu");
  assert.equal(khoaNap("poi_chungcu.parquet", ["poi_chungcu"]), "poi_chungcu-2");
  assert.equal(khoaNap("poi_chungcu.parquet", ["poi_chungcu", "poi_chungcu-2"]), "poi_chungcu-3");
  assert.equal(khoaNap(".geojson", []), "tap");
});

test("diemNhay gom theo province_name, xếp theo SỐ LƯỢNG giảm dần", () => {
  const f = (ten: string, lat: number, lng: number) =>
    tuHang({ province_name: ten, lat, lng })!;
  const d = diemNhay([f("Hà Nội", 21, 105), f("Huế", 16, 107), f("Hà Nội", 21.2, 105.4)]);
  assert.deepEqual(
    d.map((x) => [x.ten, x.n]),
    [["Hà Nội", 2], ["Huế", 1]],
  );
  assert.deepEqual(d[0]!.bbox, [105, 21, 105.4, 21.2]);
});

test("diemNhay rỗng khi bảng không có cột tỉnh — không bịa một chiều tỉnh", () => {
  assert.deepEqual(diemNhay([tuHang({ lat: 21, lng: 105 })!]), []);
});

test("tomTat: bbox từ lat/lng, cờ tam, và n_bo_qua đi thẳng ra panel", () => {
  const kq = gom(
    [tuHang({ lat: 21, lng: 105, geometry_wkb: oVuongWKB(105, 21, 0.002) }), tuHang({ lat: 16, lng: 107 }), null],
    3,
  );
  const s = tomTat({ key: "k", nguon: "a.parquet", bytes: 999, kq, luc: "2026-08-09T00:00:00+00:00" });
  assert.equal(s.n, 2);
  assert.equal(s.n_hinh, 1);
  assert.equal(s.n_bo_qua, 1);
  assert.equal(s.file, ""); // không có file trên đĩa
  assert.equal(laTam(s), true);
  assert.equal(laTam({ tam: undefined }), false);
  assert.deepEqual(s.bbox, [105, 16, 107, 21]);
  // `co_hinh` là cờ của proxy, không phải một cột của nguồn — không được kể vào `cot`.
  assert.ok(!s.cot.includes("co_hinh"));
});

test("tomTat: tập không có toạ độ nào ⇒ bbox CẢ NƯỚC, không phải một khung bịa", () => {
  // Chỉ hình học, không cột toạ độ ⇒ lat/lng vẫn suy được ⇒ bbox thật. Dựng ca rỗng thật:
  const kq = { feats: [], n_bo_qua: 0, cot: [] };
  const s = tomTat({ key: "k", nguon: "x", bytes: 0, kq, luc: "2026-08-09T00:00:00+00:00" });
  assert.deepEqual(s.bbox, [102.1, 8.4, 109.5, 23.4]);
});

test("gioUtc in ĐÚNG khuôn xuat_utc của manifest — không phải toISOString()", () => {
  // Panel in bằng `.replace('T',' ').replace('+00:00',' UTC')`; một chuỗi kết thúc bằng
  // `.189Z` đi qua cặp replace đó sẽ hiện nguyên xi giữa những dòng `… UTC`.
  assert.equal(gioUtc(new Date(Date.UTC(2026, 7, 9, 1, 57, 9, 189))), "2026-08-09T01:57:09+00:00");
});
