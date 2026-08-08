"""A3 — Tâm hình học có đủ đại diện cho ô không.

Mọi khoảng cách trong bộ dữ liệu đo từ TÂM HÌNH HỌC của lục giác. Nhưng dân trong ô không
rải đều: một ô ven đô có thể dồn hết dân về một mép. Độ lệch tối đa về lý thuyết bằng cạnh
lục giác r8 ≈ 460 m — trên trung vị khoảng cách 2.306 m thì đó là sai số tới 20%.

Người dùng đã chốt: chấp nhận, nhưng phải GIẢI THÍCH ĐƯỢC. Nên ở đây không tranh luận nữa,
chỉ đo để câu "chấp nhận được" có một con số đứng sau.

Đo: tâm-có-trọng-số-dân từ chính raster WorldPop 100 m đã dùng ở s04, so với tâm hình học.

Ghi: data/qa/critique/a03.json
"""

from __future__ import annotations

import numpy as np
import rasterio
import rasterio.features

from _common import ROOT, emit, grid

M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 103_940.0


def main() -> None:
    import sys

    sys.path.insert(0, str(ROOT / "src"))
    from evcs.core import grid as gridmod

    g = grid().set_index("h3_r8")
    cells = list(g.index)
    idx = {c: i + 1 for i, c in enumerate(cells)}  # 0 = ngoài lưới
    shapes = [(gridmod.cell_polygon(c), idx[c]) for c in cells]

    with rasterio.open(ROOT / "data/raw/worldpop2025_hanoi_window.tif") as ds:
        pop = ds.read(1).astype(np.float64)
        tr = ds.transform
        ras = rasterio.features.rasterize(
            shapes, out_shape=pop.shape, transform=tr, fill=0, dtype="int32", all_touched=False
        )
    pop = np.where(np.isfinite(pop) & (pop > 0), pop, 0.0)

    rows, cols = np.nonzero(ras)
    lab = ras[rows, cols]
    val = pop[rows, cols]
    # tâm pixel theo toạ độ địa lý
    xs = tr.c + (cols + 0.5) * tr.a
    ys = tr.f + (rows + 0.5) * tr.e

    n = len(cells) + 1
    sw = np.bincount(lab, weights=val, minlength=n)
    sx = np.bincount(lab, weights=val * xs, minlength=n)
    sy = np.bincount(lab, weights=val * ys, minlength=n)
    has = sw[1:] > 0
    wlng = np.divide(sx[1:], sw[1:], out=np.full(len(cells), np.nan), where=has)
    wlat = np.divide(sy[1:], sw[1:], out=np.full(len(cells), np.nan), where=has)

    glat = np.array([gridmod.centroid(c)[0] for c in cells])
    glng = np.array([gridmod.centroid(c)[1] for c in cells])
    dx = (wlng - glng) * M_PER_DEG_LON
    dy = (wlat - glat) * M_PER_DEG_LAT
    disp = np.hypot(dx, dy)
    ok = np.isfinite(disp)

    popn = g.population.to_numpy()
    dist = g.dist_station_network_m.to_numpy()
    # tỉ lệ độ lệch so với chính khoảng cách của ô — thước đo mức ảnh hưởng thật
    with np.errstate(invalid="ignore", divide="ignore"):
        rel = disp / dist

    q = np.nanpercentile(disp[ok], [50, 75, 90, 95, 99])
    w_mean = float(np.nansum(disp[ok] * popn[ok]) / np.nansum(popn[ok]))

    report = {
        "cau_hoi": "tâm hình học lệch bao nhiêu so với tâm dân số, và có đủ nhỏ để bỏ qua không",
        "phuong_phap": (
            "tâm có trọng số dân tính từ pixel WorldPop 100 m trong từng ô "
            "(cùng raster s04 dùng), so với tâm hình học H3 mà s08 dùng làm điểm neo"
        ),
        "canh_luc_giac_r8_m": 461,
        "n_o_do_duoc": int(ok.sum()),
        "n_o_khong_co_dan": int((~ok).sum()),
        "do_lech_m": {
            "trung_vi": round(float(q[0]), 1),
            "p75": round(float(q[1]), 1),
            "p90": round(float(q[2]), 1),
            "p95": round(float(q[3]), 1),
            "p99": round(float(q[4]), 1),
            "max": round(float(np.nanmax(disp[ok])), 1),
            "trung_binh_co_trong_so_dan": round(w_mean, 1),
        },
        "so_voi_khoang_cach_toi_tram": {
            "ti_le_do_lech_tren_dist_trung_vi": round(float(np.nanmedian(rel)), 4),
            "ti_le_p90": round(float(np.nanpercentile(rel[np.isfinite(rel)], 90)), 4),
            "n_o_do_lech_vuot_20pct_dist": int(np.nansum(rel > 0.2)),
            "dan_o_do_lech_vuot_20pct_dist": int(np.nansum(popn * (rel > 0.2))),
        },
        "n_o_lech_gt_150m": int(np.nansum(disp[ok] > 150)),
        "share_o_lech_gt_150m": round(float(np.nanmean(disp[ok] > 150)), 4),
        "n_o_lech_gt_300m": int(np.nansum(disp[ok] > 300)),
    }
    # Tiêu chí đã nêu với người dùng: trung vị < 150 m thì bỏ qua là bào chữa được.
    dat = float(q[0]) < 150
    report["ket_luan"] = [
        f"Độ lệch tâm hình học ↔ tâm dân số: trung vị {q[0]:.0f} m, p90 {q[2]:.0f} m, "
        f"max {np.nanmax(disp[ok]):.0f} m (cạnh lục giác 461 m).",
        f"So với khoảng cách tới trạm: trung vị {np.nanmedian(rel):.1%} — "
        f"{int(np.nansum(rel > 0.2))} ô có độ lệch vượt 20% khoảng cách của chính nó.",
        (
            "ĐẠT tiêu chí bỏ qua (trung vị < 150 m)."
            if dat
            else "KHÔNG đạt tiêu chí trung vị < 150 m."
        ),
    ]
    emit("A03", "KHONG_HONG" if dat else "CANH_BAO", report)


if __name__ == "__main__":
    main()
