"""N14 — Cặp tuyến minh hoạ: đường đi THẬT ↔ đoạn chim bay, cho cảnh CÂU CHUYỆN.

Sinh:
  store/p/<code>/routes_showcase.geojson   2–3 cặp (tuyến mạng, đoạn chim bay)
  store/qa/n14_showcase.json

── VÌ SAO CHỈ MỘT TỈNH ────────────────────────────────────────────────────────────────

``SHOWCASE_PROVINCES`` là một hằng, khai một chỗ, và hôm nay nó có đúng một phần tử.

Lý do KHÔNG phải chi phí — chi phí đo được là ~5 giây một tỉnh. Lý do là **luật chọn ô
không tổng quát hoá**. Ba bậc dân số 1k/5k/10k được chọn để kể một câu về Hà Nội: *"tỉ số
đi vòng cực đoan ở rìa là 7×, ở thị trấn là 4×, và ngay nội đô nó vẫn là 2×"*. Đo được:
ở **16/34 tỉnh** không đủ ô lấp cả ba bậc, và 4 tỉnh chỉ lấp được một. Dựng cho những tỉnh
ấy sẽ cho một hoặc hai tuyến rời rạc — chúng vẫn VẼ được, nhưng chúng không còn kể câu mà
cảnh C được viết ra để kể.

Và cảnh C chỉ mở ở tỉnh 01 (cổng biên tập ở ``n11``: văn cảnh gọi tên sông Hồng và sáu cây
cầu). Dựng dữ liệu cho một cảnh không mở là chở trọng lượng không ai đọc.

Mở rộng sau này là thêm một mã vào ``SHOWCASE_PROVINCES`` — nhưng phải hiệu chuẩn bậc dân
số theo phân phối TRONG TỈNH trước, nếu không "bậc 10k" ở Lai Châu là một khái niệm rỗng.

── LUẬT CHỌN Ô, GIỮ NGUYÊN CỦA BẢN HÀ NỘI ─────────────────────────────────────────────

Cố định để export tái lập được, không phải cherry-pick tay: trong các ô có tỉ số đi vòng
ĐO ĐƯỢC và đủ xa để tỉ số không phải chuyện ngõ ngách (chim bay ≥ 1 km), lấy **mỗi bậc dân
số một ô tỉ số cao nhất**. Một ngưỡng đơn không kể được cảnh.
"""

from __future__ import annotations

import json
import time

import numpy as np
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from evcs.core import grid as cgrid
from evcs.core import roadgraph as core_rg
from evcs.core.supply import is_serving

from . import paths, qa, roadgraph
from .runner import Step

VERSION = "1"

# Tỉnh được dựng cặp tuyến. MỘT chỗ khai — xem docstring để biết vì sao chỉ có 01.
SHOWCASE_PROVINCES: tuple[str, ...] = ("01",)

SHOWCASE_POP_TIERS = (1_000.0, 5_000.0, 10_000.0)
SHOWCASE_MIN_EUCLID_M = 1_000.0
COORD_DECIMALS = 5  # ~1,1 m — dưới sai số của chính OSM

FILE = "routes_showcase.geojson"


def _rd(x: float) -> float:
    return round(float(x), COORD_DECIMALS)


def _mot_tinh(code: str) -> dict:
    ways, _ = roadgraph.load_ways(code)
    g = roadgraph.build(code, ways)
    m_lat, m_lon = roadgraph.scale_for(code)

    st = pq.read_table(
        paths.PROV / code / "stations.parquet",
        columns=["station_code", "name", "lat", "lng", "op_status", "access"],
    ).to_pandas()
    st = st[is_serving(st.op_status, st.access)].reset_index(drop=True)

    snodes, soff, ok, sx, sy = core_rg.snap(g, st.lng.to_numpy(), st.lat.to_numpy())
    d_to, pred = core_rg.multisource(g, snodes, soff, reverse=True, return_predecessors=True)

    # Đỉnh → trạm neo tại đỉnh đó, để polyline KẾT THÚC Ở TRẠM chứ không ở một đỉnh đồ thị.
    sd_all, si_all = g.tree.query(np.c_[sx, sy])
    node_station: dict[int, int] = {}
    for s_i in np.flatnonzero(ok):
        nd = int(g.gidx[si_all[s_i]])
        if nd not in node_station or sd_all[s_i] < sd_all[node_station[nd]]:
            node_station[nd] = int(s_i)

    gdf = pq.read_table(
        paths.PROV / code / "grid_h3_r8.parquet",
        columns=[
            "h3_r8",
            "detour_ratio",
            "population",
            "dist_station_network_m",
            "dist_station_euclid_m",
            "commune_name",
        ],
    ).to_pandas()
    cand = gdf[
        gdf.detour_ratio.notna() & (gdf.dist_station_euclid_m >= SHOWCASE_MIN_EUCLID_M)
    ].sort_values("detour_ratio", ascending=False)

    chon = []
    for min_pop in SHOWCASE_POP_TIERS:
        tier = cand[cand.population >= min_pop]
        tier = tier[~tier.h3_r8.isin([r.h3_r8 for r in chon])]
        if len(tier):
            chon.append(tier.iloc[0])

    stree = cKDTree(np.c_[sx, sy])
    feats = []
    for row in chon:
        clat, clng = cgrid.centroid(row.h3_r8)
        cx, cy = clng * m_lon, clat * m_lat
        _, ci = g.tree.query([cx, cy])
        anchor = int(g.gidx[ci])
        chain = core_rg.reconstruct_path(pred, anchor, g.n_super)
        s_i = node_station.get(chain[-1]) if chain else None

        net = [[_rd(clng), _rd(clat)]]
        net += [[_rd(g.lon[v]), _rd(g.lat[v])] for v in chain]
        if s_i is not None:
            net.append([_rd(st.lng.iloc[s_i]), _rd(st.lat.iloc[s_i])])

        _, e_i = stree.query([cx, cy])
        e_i = int(e_i)
        props = {
            "h3_r8": row.h3_r8,
            "detour_ratio": round(float(row.detour_ratio), 2),
            "dist_station_network_m": round(float(row.dist_station_network_m)),
            "dist_station_euclid_m": round(float(row.dist_station_euclid_m)),
            "population": round(float(row.population)),
            "commune_name": row.commune_name,
        }
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": net},
                "properties": {
                    **props,
                    "kind": "network",
                    "station_name": None if s_i is None else str(st.name.iloc[s_i]),
                },
            }
        )
        feats.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [net[0], [_rd(st.lng.iloc[e_i]), _rd(st.lat.iloc[e_i])]],
                },
                "properties": {
                    **props,
                    "kind": "euclid",
                    "station_name": str(st.name.iloc[e_i]),
                },
            }
        )

    out = paths.province_dir(code) / FILE
    out.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": feats},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    return {
        "n_cells": len(chon),
        "n_features": len(feats),
        "cells": [str(r.h3_r8) for r in chon],
        "detour_ratios": [round(float(r.detour_ratio), 2) for r in chon],
        "bytes": out.stat().st_size,
    }


def run() -> None:
    r = qa.Report(
        "n14_showcase",
        rule=(
            f"detour_ratio đo được ∧ chim bay ≥ {SHOWCASE_MIN_EUCLID_M:.0f} m → mỗi bậc dân "
            f"số {[int(t) for t in SHOWCASE_POP_TIERS]} một ô tỉ số cao nhất"
        ),
        scope_note=(
            "CHỈ dựng cho " + ", ".join(SHOWCASE_PROVINCES) + ". Ba bậc dân số là hằng số "
            "mật độ Hà Nội và không đủ ô ở 16/34 tỉnh — xem docstring module."
        ),
    )
    t0 = time.time()
    per = {c: _mot_tinh(c) for c in SHOWCASE_PROVINCES}
    r.stat(
        provinces=list(SHOWCASE_PROVINCES), per_province=per, elapsed_s=round(time.time() - t0, 1)
    )
    for c, m in per.items():
        # Ba bậc, ba ô. Ít hơn nghĩa là luật không lấp đủ — vẫn vẽ được, nhưng cảnh C mất
        # một chân của câu nó kể, và điều đó phải NHÌN THẤY được chứ không im lặng.
        r.check(
            f"du_ba_bac_{c}",
            m["n_cells"] == len(SHOWCASE_POP_TIERS),
            f"{m['n_cells']}/{len(SHOWCASE_POP_TIERS)} bậc lấp được · tỉ số {m['detour_ratios']}",
        )
        r.check(f"moi_o_hai_tuyen_{c}", m["n_features"] == 2 * m["n_cells"], f"{m['n_features']}")
    r.write(quiet=True)
    print(f"   {sum(m['n_cells'] for m in per.values())} ô × 2 tuyến · {time.time() - t0:.1f}s")


def _extra(_p: str | None) -> list:
    return [paths.PROV / c / FILE for c in SHOWCASE_PROVINCES]


STEP = Step(
    name="n14_showcase",
    scope="global",
    version=VERSION,
    run=run,
    reads=("road_graph", "stations", "grid_h3_r8", "src_vnsdi"),
    writes=(),
    extra_writes=_extra,
    desc="cặp tuyến minh hoạ (đường đi thật ↔ chim bay) cho cảnh CÂU CHUYỆN — chỉ tỉnh 01",
)


if __name__ == "__main__":
    paths.ensure_dirs()
    run()
