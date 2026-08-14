import { POI_GROUP_BY_KEY, hasShape, poiAreaM2, poiRef, type PoiCollection, type PoiFeature } from "../data/poi";
import { formatValue } from "./format";

/**
 * Panel POI — M3.5 (P6). Cùng khuôn CellPanel / panel XÃ: tiêu đề → nhóm → thuộc tính,
 * `‹ quay lại`, khối NGUỒN neo đáy do Rail lo. Khác khuôn thì người dùng phải học hai lần.
 *
 * Luật M2.1-F1 áp nguyên: thuộc tính BIẾT thì hiện, KHÔNG biết thì bỏ hẳn dòng — `name`
 * OSM hay thiếu, `levels` chỉ 41,2% chung cư có tag; không in "không đo được" cho chúng.
 * Riêng "hình học" luôn có một dòng, vì chỉ-điểm ↔ có-polygon là chính điều P4 bắt phải
 * nói ra: "không biết cạnh ở đâu" là một sự thật về dữ liệu, không phải một giá trị thiếu.
 */
export function PoiPanel({
  refId,
  poi,
  onBack,
}: {
  refId: string;
  poi: PoiCollection | null;
  onBack: () => void;
}) {
  const feature: PoiFeature | undefined = poi?.features.find(
    (f) => poiRef(f.properties) === refId,
  );

  return (
    <div className="text-title">
      <div className="flex items-center gap-2 border-b border-hairline px-2 py-1.5">
        <button onClick={onBack} className="cursor-pointer text-body text-ink-2 hover:text-ink">
          ‹ quay lại
        </button>
        <span className="ml-auto font-mono text-note text-ink-muted">poi {refId}</span>
      </div>

      {!poi && <p className="p-3 text-body text-ink-muted">đang nạp poi.geojson…</p>}

      {poi && !feature && (
        <p className="p-3 text-body leading-snug text-ink-2">
          Không có POI nào mang tham chiếu <span className="font-mono">{refId}</span>. Tham
          chiếu đúng hình dạng nhưng không thuộc bản trích. Chỉ panel này rỗng — các khoá
          còn lại của hash giữ nguyên.
        </p>
      )}

      {feature && <PoiBody f={feature} />}
    </div>
  );
}

function PoiBody({ f }: { f: PoiFeature }) {
  const p = f.properties;
  const group = POI_GROUP_BY_KEY.get(p.group);
  const withShape = hasShape(f.geometry);
  const areaM2 = poiAreaM2(f.geometry);

  return (
    <>
      <div className="border-b border-hairline px-2 py-2">
        <div className="text-heading font-semibold leading-tight">
          {p.name ?? group?.label ?? p.group}
        </div>
        {/* Tên vắng là sự thật về OSM, nói ra được — khác với một giá trị đo thiếu. */}
        {p.name === null && (
          <div className="pt-0.5 text-body italic text-ink-muted">OSM không đặt tên</div>
        )}
        <div className="pt-0.5 text-body text-ink-muted">
          {group?.label} · <span className="font-mono">{p.tag}</span>
        </div>
      </div>

      <section>
        <h3 className="border-b border-hairline bg-basemap px-2 py-1 text-body tracking-[0.1em] text-ink-2">
          THUỘC TÍNH
        </h3>
        {/* Diện tích chỉ tồn tại khi có cạnh — tính lúc chạy từ hình học đã ship (§13c-1). */}
        {areaM2 !== null && (
          <Row k="diện tích polygon" v={`${formatValue(Math.round(areaM2))} m²`} />
        )}
        {p.levels !== null && <Row k="số tầng (building:levels)" v={formatValue(p.levels)} />}
        <Row
          k="hình học"
          v={
            withShape
              ? `polygon (${p.osm_type} ${p.osm_id})`
              : `chỉ điểm — OSM chưa vẽ cạnh (${p.osm_type} ${p.osm_id})`
          }
        />
        <Row k="toạ độ" v={`${p.lng.toFixed(5)}, ${p.lat.toFixed(5)}`} />
      </section>

      {!withShape && (
        <p className="p-3 text-body leading-snug text-ink-muted">
          POI này vẽ bằng mark <strong>rỗng</strong> trên bản đồ: vị trí biết, cạnh không
          biết — không vẽ vòng tròn thay hình, và ở chế độ 3D nó không có khối.
        </p>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-hairline px-2 py-1 text-body">
      <span className="min-w-0 flex-1 truncate text-ink-muted">{k}</span>
      <span className="text-ink-2">{v}</span>
    </div>
  );
}
