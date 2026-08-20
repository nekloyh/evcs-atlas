"""N12 — Bộ dữ liệu **cả nước xem một lần**: gộp 34 phân mảnh thành một lớp nhìn được ở z5.

Sinh:
  web/public/data/vn/grid_h3_r6.parquet   ~9,8 nghìn ô gộp — mặt dân số / POI / cung
  web/public/data/vn/grid_h3_r7.parquet   bậc MỊN, nạp lười khi phóng vào (LOD của 3D)
  web/public/data/vn/stations.parquet     6.380 trạm, toàn quốc, một file
  web/public/data/vn/poi.parquet          25.220 POI, toàn quốc, một file
  web/public/data/vn/provinces.json       34 dòng thuộc tính đầy đủ (KHÔNG có hình học)
  web/public/data/vn/manifest.json        bbox · ngân sách · cột có mặt

── VÌ SAO PHẢI CÓ BƯỚC NÀY, TRONG KHI N11 ĐÃ XUẤT ĐỦ 34 TỈNH ─────────────────────────

N11 xuất **34 bộ rời**, mỗi bộ mở được một mình. Không bộ nào trả lời được câu hỏi "cả
nước trông ra sao" — muốn trả lời thì phải tải 34 file lưới (158 MB) rồi tự cộng trong
trình duyệt. Đó không phải một màn hình, đó là một lần build.

Bước này làm phép cộng đó **một lần, lúc build**, và trả về một bảng đủ nhỏ để tải ngay.

── VÌ SAO R6 CHỨ KHÔNG PHẢI R8 HAY R5 ────────────────────────────────────────────────

Lưới r8 toàn quốc có 417.185 ô duy nhất. Ở mức phóng của cả nước (z≈5,2 cho bbox
102–110°E × 8,5–23,4°N) một ô r8 rộng **0,3 px** — không phải bản đồ, cũng không phải
texture, chỉ là nhiễu; và 417 nghìn mark là ~10 MB tải về để vẽ ra nhiễu đó.

Đo bằng chính dữ liệu này, số ô duy nhất theo bậc: **r5 → 1.753 · r6 → 9.813 · r7 → 62.219**.

  · **r5** (~252 km², ~15 km ngang, ~6 px ở z5) đọc rõ nhất ở đúng một mức phóng, rồi hết:
    phóng tới một vùng thì mỗi ô nuốt trọn một tỉnh nhỏ, và cả Hà Nội chỉ còn ~13 ô.
  · **r7** (~5,2 km², 62 nghìn ô, ~1,5 MB) vẽ được nhưng ở z5 mỗi ô rộng 1,3 px — vẫn là
    nhiễu ở chính mức phóng mà lớp này sinh ra để phục vụ.
  · **r6** (~36 km², ~6,4 km ngang) rộng ~2,6 px ở z5 và ~21 px ở z8. Ở z5 thảm ô đọc như
    một **mặt mật độ** (đúng thứ cần thấy: hai đồng bằng sáng lên, dãy Trường Sơn tối);
    phóng tới z8 thì từng ô lại là vật thể chỉ tay vào được. Một bậc phục vụ được cả hai
    đầu của quãng phóng mà màn hình này sống trong đó.

Chi tiết sâu hơn r6 **không thuộc về màn hình này** — nó thuộc về màn hình tỉnh, nơi lưới
r8 thật đã có sẵn. Bấm vào một tỉnh là đi tới đó.

── PHÉP CỘNG: CÁI GÌ CỘNG ĐƯỢC, CÁI GÌ KHÔNG ─────────────────────────────────────────

Đại lượng **quảng tính** (người, trạm, cổng, kW, mét đường, số POI) cộng thẳng. Đại lượng
**cường tính** (`*_frac`, mật độ) KHÔNG cộng được — chúng được tính lại bằng trung bình có
trọng số diện tích, tức đúng định nghĩa của chính chúng ở bậc r6.

**Ô biên nằm trong hai phân mảnh** (8.568 ô r8), và đó không phải lỗi: mỗi phân mảnh giữ
phần ô nằm trong tỉnh của nó (`area_frac`), còn dân số thì n05 neo theo tổng kiểm soát của
CHÍNH tỉnh đó cho phần đó. Nên **cộng thẳng qua các phân mảnh là đúng** — đo được: tổng
dân theo lưới 113.732.607 so với 113.625.653 công bố, lệch 0,09%. Cái không được cộng
thẳng là **diện tích**: `area_km2` là diện tích ô ĐẦY ĐỦ, nên phải nhân `area_frac` trước
khi cộng (335.012 km² so với 333.530 km² hình học, lệch 0,44%).
"""

from __future__ import annotations

import json

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from shapely import wkb
from shapely.geometry import mapping

from evcs.schema import GRID
from evcs.schema.national import national_table  # noqa: I001 — bậc là tham số, xem `national_table`

from . import admin, paths, qa

# Nhập từ n11 chứ không viết lại: cùng phép làm tròn toạ độ, cùng cách đóng gói
# FeatureCollection. Hai bản sao của cùng một hàm ghi GeoJSON là hai bộ file trông giống
# nhau mà lệch nhau ở chữ số cuối, và không có gì phát hiện ra.
from .n11_web_export import WEB_DATA, _fc, _round_coords
from .runner import Step

VERSION = "5"  # 5: schema tỉnh sạch suffix + KPI chuẩn hoá Phase 9

WEB_VN = WEB_DATA / "vn"

R_NATIONAL = 6

# Bậc thứ HAI, chỉ để phóng vào — xem `_grid_agg`. Không thay r6: ở khung nhìn cả nước một
# ô r7 rộng ~1 px, tức mịn hơn cả pixel, và cái "mịn" đó chỉ làm bản đồ nhoè chứ không thêm
# thông tin nào đọc được.
R_ZOOM = 7

# Hai danh sách dưới đây SUY RA từ `evcs.schema.GRID`, không gõ tay.
#
# Trước đây chúng là 22 tên cột chép tay rồi truyền thẳng vào `pq.read_table(columns=…)`,
# nên đổi tên một cột ở `n09` là bước này NỔ — và không phép kiểm nào bắt trước. Giờ khai
# một chỗ: `agg` nói cột gộp được bằng phép nào, `national` nói cột có lên màn hình cả
# nước không. Hai câu hỏi khác nhau: `road_len_local_m` cộng được nhưng không lên, vì ngân
# sách tải của màn hình ấy đã đo và đã chốt.

# Cộng thẳng — đại lượng quảng tính, mỗi phân mảnh giữ phần của mình.
SUM_COLS = [c.name for c in GRID.where(agg="sum", national=True)]

# Trung bình có trọng số DIỆN TÍCH — cường tính, cộng vào là vô nghĩa.
FRAC_COLS = [c.name for c in GRID.where(agg="area_mean", national=True)]

# Cột của bảng trạm được chở ra web. Bỏ hẳn `address`/`operator`/`station_id`: màn hình cả
# nước không đọc chúng, và 6.380 chuỗi địa chỉ là phần lớn dung lượng của bảng.
STATION_COLS = [
    "station_code",
    "lat",
    "lng",
    "name",
    "station_type",
    "current_type",
    "op_status",
    "n_ports",
    "power_kw_site",
    "province_code",
]

POI_COLS = ["group", "tag", "name", "levels", "lat", "lng", "osm_type", "osm_id"]
# Hình học đi vào 4 file GeoJSON, KHÔNG đi vào `poi.parquet`: bảng parquet nuôi lớp chấm
# của bản đồ cả nước (25 nghìn mark ở ~5 px), và ở cỡ đó một đa giác 4 ha vẽ ra đúng bằng
# một chấm — chở nó là trả vài MB cho một hình dạng không hiện lên pixel nào.
POI_GEOM_COL = "geometry_wkb"


def _grid_agg(res: int) -> tuple[pd.DataFrame, dict]:
    """Gộp 34 phân mảnh r8 lên MỘT bậc H3. Bậc là tham số — xem `national_table`."""
    key = f"h3_r{res}"
    cols = ["h3_r8", "province_code", "area_km2", "area_frac", *SUM_COLS, *FRAC_COLS]
    frames = []
    for code in admin.province_codes():
        f = paths.PROV / code / "grid_h3_r8.parquet"
        if f.exists():
            frames.append(pq.read_table(f, columns=cols).to_pandas())
    d = pd.concat(frames, ignore_index=True)
    n_rows, n_unique = len(d), d.h3_r8.nunique()

    # Diện tích HIỆU DỤNG: `area_km2` là ô đầy đủ, phần trong tỉnh mới là thứ cộng được.
    d["area_eff"] = d.area_km2 * d.area_frac
    d[key] = [h3.cell_to_parent(c, res) for c in d.h3_r8]

    agg = {c: "sum" for c in [*SUM_COLS, "area_eff"]}
    g = d.groupby(key, sort=True).agg(agg)
    g["n_cells_r8"] = d.groupby(key, sort=True).h3_r8.nunique()

    for c in FRAC_COLS:
        # Trọng số là diện tích hiệu dụng, không phải số ô: một ô biên góp 3% diện tích thì
        # nó góp 3% vào trung bình. Chia cho tổng trọng số của CHÍNH nhóm, nên ô r6 nằm nửa
        # ngoài biển vẫn ra tỉ lệ đúng cho phần đất của nó.
        w = d.area_eff
        num = (d[c].fillna(0) * w).groupby(d[key], sort=True).sum()
        den = w.where(d[c].notna(), 0).groupby(d[key], sort=True).sum()
        g[c] = np.divide(num, den, out=np.full(len(num), np.nan), where=den > 0)

    # Tỉnh CHỦ của ô gộp = tỉnh chiếm nhiều diện tích nhất trong ô. Dùng cho nhãn và cho
    # cú bấm "vào tỉnh này"; nó KHÔNG phải một phép phân bổ dữ liệu — mọi số ở trên đã cộng
    # đủ cả phần của các tỉnh khác trong cùng ô.
    owner = (
        d.groupby([key, "province_code"], sort=False)
        .area_eff.sum()
        .reset_index()
        .sort_values("area_eff", ascending=False)
        .drop_duplicates(key)
        .set_index(key)
    )
    g["province_code"] = owner.province_code
    g["n_provinces"] = d.groupby(key, sort=True).province_code.nunique()

    g = g.reset_index()
    g["area_km2"] = g.pop("area_eff")
    g["pop_density_ppkm2"] = np.divide(
        g.population, g.area_km2, out=np.full(len(g), np.nan), where=g.area_km2 > 0
    )
    # Toạ độ tâm ô: tầng vẽ cần chúng cho tooltip và cho lớp mark, và tính trong trình duyệt
    # nghĩa là nạp thư viện h3 vào bundle chỉ để lặp lại một phép tính tất định.
    ll = [h3.cell_to_latlng(c) for c in g[key]]
    g["lat"] = [p[0] for p in ll]
    g["lng"] = [p[1] for p in ll]

    front = [key, "province_code", "n_provinces", "n_cells_r8", "lat", "lng", "area_km2"]
    g = g[front + [c for c in g.columns if c not in front]]
    return _shrink(g, key), {"r8_rows_read": n_rows, "r8_cells_unique": n_unique}


def _shrink(g: pd.DataFrame, key: str) -> pd.DataFrame:
    """Hạ độ chính xác xuống đúng mức bảng này CÓ, rồi mới ghi.

    Bảng thô là float64 ở mọi cột số và nặng 1,04 MB — nhưng không cột nào mang tới 15 chữ
    số có nghĩa. Dân số một ô r6 là kết quả của phép neo dasymetric (sai số phần nghìn), tỉ
    lệ lớp phủ đọc từ raster 10 m, toạ độ là tâm ô tính lại được. Chở 15 chữ số cho những
    số đó là chở **nhiễu đã nén**, và zstd không nén được nhiễu.

    float32 giữ nguyên số nguyên tới 16,7 triệu (mọi dân số ô, mọi số đếm) và cho ~0,8 m ở
    kinh độ 105° — dưới hẳn bán kính 3,2 km của chính ô. Làm tròn trước khi hạ kiểu vì hai
    phép này bù nhau: chữ số lặp lại thì zstd mới có cái để nén.
    """
    for c in g.columns:
        if c in (key, "province_code"):
            continue
        if pd.api.types.is_integer_dtype(g[c]):
            g[c] = g[c].astype("int32")
        else:
            nd = 5 if c in ("lat", "lng") else 4 if c.endswith("_frac") else 1
            g[c] = g[c].round(nd).astype("float32")
    return g


def _stations() -> pd.DataFrame:
    out = []
    for code in admin.province_codes():
        f = paths.PROV / code / "stations.parquet"
        if not f.exists():
            continue
        s = pq.read_table(f, columns=[*STATION_COLS, "scope"]).to_pandas()
        # Bỏ bản sao VÀNH ĐỆM. Một trạm sát ranh giới có mặt trong phân mảnh của cả hai tỉnh
        # (bất biến phân hoạch, QUYET_DINH §2) — giữ cả hai ở đây là đếm nó hai lần trên bản
        # đồ cả nước, và bản đồ sẽ vẽ hai chấm chồng nhau ở đúng một chỗ.
        out.append(s[s.scope != "BUFFER"][STATION_COLS])
    return pd.concat(out, ignore_index=True).sort_values("province_code").reset_index(drop=True)


def _poi() -> pd.DataFrame:
    out = []
    for code in admin.province_codes():
        f = paths.PROV / code / "poi_visual.parquet"
        if not f.exists():
            continue
        p = pq.read_table(f, columns=[*POI_COLS, POI_GEOM_COL]).to_pandas()
        p["province_code"] = code
        out.append(p)
    # POI **không** bị nhân bản ở vành đệm (bất biến phân hoạch, QUYET_DINH §2), nên không có
    # bước khử trùng nào ở đây — và không được thêm vào, vì nó sẽ im lặng bỏ hai POI thật
    # trùng toạ độ (hai tầng của cùng một trung tâm thương mại).
    return pd.concat(out, ignore_index=True)


def _poi_geojson_by_group(po: pd.DataFrame) -> dict:
    """Bốn file GeoJSON, **một file một nhóm POI** — bàn giao dữ liệu, không phải lớp bản đồ.

    Bốn nhóm là đúng bốn nhóm mà `data/poi.ts` đã chốt và màn hình tỉnh đang vẽ:
    ``apartment`` · ``mall`` · ``public`` · ``edu_health``.

    ── HÌNH HỌC: ĐA GIÁC KHI CÓ, ĐIỂM KHI KHÔNG, VÀ LUÔN CÓ CẢ ``lat``/``lng`` ─────────

    85% đối tượng là ``way``/``relation`` nên có đa giác thật; 3.748 cái là ``node`` và
    OSM chỉ cho một điểm. Ghi mỗi loại vào một file riêng thì bên đọc phải hợp hai file để
    trả lời một câu hỏi; ghi chung mà bỏ đa giác thì mất hình dạng (một trung tâm thương
    mại 4 ha đọc thành một chấm). Nên: ``geometry`` là **đa giác nếu có, điểm nếu không**,
    và ``lat``/``lng`` **luôn nằm trong properties** — bên nào chỉ cần một chấm thì đọc
    thẳng hai trường đó, không phải tự tính trọng tâm.

    ``has_polygon`` nói ra loại hình học của từng feature, để một phép đếm trên tập này
    không im lặng trộn "toà nhà 4 ha" với "một điểm ai đó đánh dấu".

    Toạ độ làm tròn 6 chữ số (~11 cm) — dưới hẳn sai số vẽ tay của chính OSM.
    """
    names = admin.province_names()
    out: dict[str, dict] = {}
    d = WEB_VN / "poi"
    d.mkdir(parents=True, exist_ok=True)
    for grp, sub in po.groupby("group", sort=True):
        feats = []
        for row in sub.to_dict("records"):
            g = row.pop("geometry_wkb")
            has_poly = g is not None
            if has_poly:
                m = mapping(wkb.loads(bytes(g)))
                geom = {"type": m["type"], "coordinates": _round_coords(m["coordinates"], 6)}
            else:
                geom = {
                    "type": "Point",
                    "coordinates": [round(row["lng"], 6), round(row["lat"], 6)],
                }
            props = {k: (None if pd.isna(v) else v) for k, v in row.items()}
            props["lat"] = round(float(row["lat"]), 6)
            props["lng"] = round(float(row["lng"]), 6)
            props["has_polygon"] = has_poly
            props["province_name"] = names.get(str(row.get("province_code")), None)
            feats.append({"type": "Feature", "geometry": geom, "properties": props})
        p = d / f"{grp}.geojson"
        p.write_text(_fc(feats), encoding="utf-8")
        out[grp] = {
            "file": f"vn/poi/{grp}.geojson",
            "n": len(feats),
            "n_polygon": int(sub.geometry_wkb.notna().sum()),
            "bytes": p.stat().st_size,
        }
    return out


def _provinces_json() -> dict:
    """Thuộc tính 34 tỉnh, KHÔNG kèm hình học.

    Hình học đã nằm ở `provinces.geojson` mà n11 xuất và bộ chọn tỉnh đang tải. Chở đa giác
    lần thứ hai chỉ để đính thêm cột là trả 292 KB cho một phép nối mà `province_code` làm
    được miễn phí.
    """
    pv = pq.read_table(paths.ADMIN / "provinces.parquet").to_pandas()
    qp = pq.read_table(paths.QA / "provinces.parquet").to_pandas()
    # QA là chủ của các cột tính lại. Admin chỉ bổ sung cột chưa có trong QA; merge cả hai
    # bảng bằng mặc định pandas từng làm rò `_x/_y` và biến ba metric live thành all-null.
    shared = (set(pv.columns) & set(qp.columns)) - {"province_code", "province_name"}
    for column in shared:
        left = pv.set_index("province_code")[column]
        right = qp.set_index("province_code")[column]
        both = left.notna() & right.notna()
        if pd.api.types.is_numeric_dtype(left) and pd.api.types.is_numeric_dtype(right):
            assert np.allclose(left[both], right[both], rtol=0, atol=0.11), column
        else:
            assert bool((left[both].astype(str) == right[both].astype(str)).all()), column
    admin_only = [c for c in pv.columns if c not in qp.columns or c == "province_code"]
    idx = qp.merge(pv[admin_only], on="province_code", how="left", validate="one_to_one")
    idx["in_store"] = idx.n_stations.notna()
    recs = json.loads(idx.to_json(orient="records", force_ascii=False))
    for row in recs:
        flags = set((row.get("quality_flags") or "").split("|"))
        row["unusable_layers"] = (
            [
                {
                    "layer": "occupancy",
                    "reason": "dưới nửa số trạm có mức sử dụng đọc được",
                    "measured": row.get("share_stations_measured"),
                }
            ]
            if "KHONG_DO_DUOC_SU_DUNG" in flags
            else []
        )
        assert not any(str(key).endswith(("_x", "_y")) for key in row), row["province_code"]
    return {r["province_code"]: r for r in recs}


VIEW_POP_KEEP = 0.995


def _view_bbox(g: pd.DataFrame) -> list[float]:
    """Khung nhìn mặc định — bbox chứa 99,5% DÂN, không phải bbox của lãnh thổ.

    bbox lãnh thổ trải 102,1–117,8°E vì **Đặc khu Trường Sa** đẩy mép đông ra thêm 7,7 độ.
    Fit theo nó thì Việt Nam nằm gọn ở một phần ba trái màn hình còn hai phần ba là Biển
    Đông — mở màn hình ra là thấy chủ yếu nước.

    Cắt theo dân chứ không cắt theo một danh sách đặc khu gõ tay: Trường Sa và Hoàng Sa rơi
    ra vì chúng gần như không có dân, và luật đó tự đúng khi địa giới đổi. `bbox` lãnh thổ
    đầy đủ vẫn nằm trong manifest — hai con số, hai vai, và **đảo vẫn được vẽ**, chỉ là
    khung nhìn ban đầu không lấy chúng làm mép.
    """
    tail = (1 - VIEW_POP_KEEP) / 2

    def cut(axis: str) -> tuple[float, float]:
        d = g[[axis, "population"]].sort_values(axis)
        c = d.population.cumsum() / d.population.sum()
        lo = d[axis][c >= tail].iloc[0]
        hi = d[axis][c <= 1 - tail].iloc[-1]
        return float(lo), float(hi)

    w, e = cut("lng")
    s, n = cut("lat")
    return [round(v, 4) for v in (w, s, e, n)]


def run() -> None:
    WEB_VN.mkdir(parents=True, exist_ok=True)
    r = qa.Report("n12_national", target=str(WEB_VN.relative_to(paths.ROOT)), resolution=R_NATIONAL)

    # HAI bậc, cùng một hàm gộp. r6 là bậc mặc định (nhìn cả nước); r7 chỉ tải khi phóng
    # vào — xem `R_ZOOM`. Chúng KHÔNG được trộn trong một lần đọc: mỗi bậc có bậc màu phân
    # vị riêng vì một ô r7 đo một đại lượng khác (dân của 5,2 km², không phải của 36 km²).
    grids: dict[int, tuple] = {}
    for res in (R_NATIONAL, R_ZOOM):
        gg, meta = _grid_agg(res)
        path = WEB_VN / f"grid_h3_r{res}.parquet"
        pq.write_table(pa.Table.from_pandas(gg, preserve_index=False), path, compression="zstd")

        # Cổng chặn thứ ba. Bảng gộp KHÔNG được khai lại ở schema — nó SUY RA từ `GRID`:
        # danh tính của ô gộp + mọi cột `national=True` + một tỉ số tính lại. Nên phép kiểm
        # này trả lời một câu mạnh hơn "có đủ cột không": nó nói lớp cả nước chở ĐÚNG những
        # cột đã đánh dấu là cả-nước, không thừa một cột nào, đúng thứ tự lẫn độ chính xác.
        # Chạy cho CẢ HAI bậc: một bậc lệch khỏi bậc kia là chế độ LOD đổi cột giữa chừng.
        decl = national_table(res)
        _s = pq.read_schema(path)
        lech = decl.validate(list(_s.names), {n: str(t) for n, t in zip(_s.names, _s.types)})
        r.check(
            f"schema_r{res}_khop_khai_bao",
            not lech,
            "; ".join(lech) if lech else f"{len(decl.columns)} cột, suy ra từ GRID",
        )
        grids[res] = (gg, meta, path)

    g, gmeta, gp = grids[R_NATIONAL]

    st = _stations()
    sp = WEB_VN / "stations.parquet"
    pq.write_table(pa.Table.from_pandas(st, preserve_index=False), sp, compression="zstd")

    po = _poi()
    poi_groups = _poi_geojson_by_group(po)
    pp = WEB_VN / "poi.parquet"
    pq.write_table(
        pa.Table.from_pandas(po.drop(columns=[POI_GEOM_COL]), preserve_index=False),
        pp,
        compression="zstd",
    )

    provs = _provinces_json()
    pj = WEB_VN / "provinces.json"
    pj.write_text(json.dumps(provs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pv = pq.read_table(paths.ADMIN / "provinces.parquet").to_pandas()
    bbox = [
        float(pv.lng_min.min()),
        float(pv.lat_min.min()),
        float(pv.lng_max.max()),
        float(pv.lat_max.max()),
    ]
    view_bbox = _view_bbox(g)
    files = {p.name: p.stat().st_size for p in (gp, grids[R_ZOOM][2], sp, pp, pj)}
    # Hai ngân sách khác nhau, và gộp chúng lại là nói sai về cái đắt. **Tải lần đầu** là
    # thứ trả trước khi thấy gì: lưới gộp + bảng tỉnh. Trạm và POI nạp LƯỜI đúng như ở màn
    # hình tỉnh (§5a) — chúng chỉ tới khi một lớp được bật.
    first_load = files["grid_h3_r6.parquet"] + files["provinces.json"]
    # Khối GRIDS — hợp đồng của chế độ LOD. Bên đọc không phải đoán tên file, không phải
    # đoán số ô, và **không được gõ tay diện tích ô vào TS** (ràng buộc 4): chú giải phải
    # đổi câu "đọc theo Ô GỘP ~40,1 km²" theo đúng bậc đang xem.
    grids_meta = {
        str(res): {
            "file": path.name,
            "key": f"h3_r{res}",
            "n_cells": len(gg),
            "cell_km2_median": round(float(gg.area_km2.median()), 3),
            "bytes": path.stat().st_size,
        }
        for res, (gg, _m, path) in grids.items()
    }
    manifest = {
        "vintage": admin.VINTAGE,
        "resolution": R_NATIONAL,
        "bbox": bbox,
        # Khung nhìn mặc định — xem `_view_bbox`. Khác `bbox` ở chỗ nó KHÔNG lấy Trường Sa
        # làm mép đông; đảo vẫn được vẽ, chỉ không quyết định khung hình đầu tiên.
        "view_bbox": view_bbox,
        "n_cells": int(len(g)),
        "n_stations": int(len(st)),
        "n_poi": int(len(po)),
        "n_provinces": int(len(provs)),
        "available_columns": sorted(g.columns),
        # Bốn nhóm POI, mỗi nhóm một file GeoJSON riêng — bàn giao dữ liệu. Số đếm và
        # đường dẫn ở đây là hợp đồng: bên đọc không phải đoán tên file hay tự thử `HEAD`.
        "poi_groups": poi_groups,
        "files": files,
        "bytes_total": sum(files.values()),
        "bytes_first_load": first_load,
        "lazy_files": ["stations.parquet", "poi.parquet", f"grid_h3_r{R_ZOOM}.parquet"],
        "grids": grids_meta,
        # Bậc mịn chỉ nạp khi phóng đủ sâu. Ngưỡng sống ở TS (`national/lod.ts`) vì nó là
        # một quyết định về CÁCH XEM, không phải về dữ liệu; ở đây chỉ khai bậc nào có.
        "resolution_zoom": R_ZOOM,
        # Ô r6 rộng ~6,4 km. In ra chứ không để tầng vẽ đoán: chú giải phải nói ĐƠN VỊ ĐỌC,
        # và đơn vị đọc ở đây không phải ô r8 mà mọi màn hình khác của app đang dùng.
        "cell_km2_median": round(float(g.area_km2.median()), 3),
        "totals": {
            "population": int(g.population.sum()),
            "n_stations": int(g.n_stations.sum()),
            "n_ports": int(g.n_ports.sum()),
            "power_mw": round(float(g.power_kw_site.sum()) / 1000, 1),
            "n_apartment": int(g.n_apartment.sum()),
            "n_poi_total": int(g.n_poi_total.sum()),
            "area_km2": round(float(g.area_km2.sum())),
        },
    }
    (WEB_VN / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    qa_prov = pq.read_table(paths.QA / "provinces.parquet").to_pandas()
    r.stat(
        **gmeta,
        n_cells_r6=int(len(g)),
        median_r8_per_r6=int(g.n_cells_r8.median()),
        n_cells_multi_province=int((g.n_provinces > 1).sum()),
        n_stations=int(len(st)),
        n_poi=int(len(po)),
        bbox=bbox,
        view_bbox=view_bbox,
        bytes=files,
        ngan_sach_tai_lan_dau_MB=round(first_load / 1e6, 2),
        ngan_sach_ke_ca_lop_nap_luoi_MB=round(sum(files.values()) / 1e6, 2),
        totals=manifest["totals"],
    )
    # Phân hoạch không được LÀM MẤT hay NHÂN ĐÔI cái gì: tổng ở bậc r6 phải khớp tổng ở bậc
    # tỉnh mà n10 đã đo độc lập. Đây là phép kiểm duy nhất bắt được lỗi gộp sai bậc.
    r.check(
        "stations_khop_bang_tinh",
        int(g.n_stations.sum()) == int(qa_prov.n_stations.sum()) == len(st),
        f"r6 {int(g.n_stations.sum())} · tỉnh {int(qa_prov.n_stations.sum())} · bảng trạm {len(st)}",
    )
    r.check(
        "ports_khop_bang_tinh",
        int(g.n_ports.sum()) == int(qa_prov.n_ports.sum()),
        f"r6 {int(g.n_ports.sum())} · tỉnh {int(qa_prov.n_ports.sum())}",
    )
    pop_r6, pop_pub = float(g.population.sum()), float(qa_prov.population.sum())
    r.check(
        "dan_so_lech_duoi_1_phan_tram",
        abs(pop_r6 - pop_pub) / pop_pub < 0.01,
        f"{pop_r6:,.0f} so với {pop_pub:,.0f} công bố — lệch {abs(pop_r6 - pop_pub) / pop_pub:.2%}",
    )
    r.check(
        "khong_trung_tram",
        st.station_code.is_unique,
        f"{len(st)} trạm, {st.station_code.nunique()} mã duy nhất",
    )
    r.check(
        "moi_o_co_tinh_chu",
        bool(g.province_code.notna().all()),
        f"{int(g.province_code.isna().sum())} ô không gán được tỉnh chủ",
    )
    r.check(
        "bon_nhom_poi_du_va_khong_mat_cai_nao",
        sum(v["n"] for v in poi_groups.values()) == len(po) and len(poi_groups) == 4,
        " · ".join(
            f"{k} {v['n']:,} ({v['n_polygon']:,} đa giác, {v['bytes'] / 1e6:.1f} MB)"
            for k, v in poi_groups.items()
        ),
    )
    r.check(
        "tai_lan_dau_duoi_1MB",
        first_load < 1_000_000,
        f"{first_load / 1e6:.2f} MB (lưới gộp + bảng tỉnh); "
        f"thêm {(sum(files.values()) - first_load) / 1e6:.2f} MB nạp lười cho trạm + POI",
    )
    r.write()


def outputs() -> list:
    return [
        WEB_VN / "grid_h3_r6.parquet",
        WEB_VN / f"grid_h3_r{R_ZOOM}.parquet",
        WEB_VN / "stations.parquet",
        WEB_VN / "poi.parquet",
        WEB_VN / "provinces.json",
        WEB_VN / "manifest.json",
    ]


STEP = Step(
    name="n12_national",
    scope="global",
    version=VERSION,
    run=run,
    reads=(
        "admin_provinces",
        "qa_provinces",
        "grid_h3_r8",
        "stations",
        "poi_visual",
    ),
    extra_writes=lambda _p: outputs(),
    desc="gộp 34 phân mảnh thành một lớp cả nước xem một lần (H3 r6 + trạm + POI)",
)
