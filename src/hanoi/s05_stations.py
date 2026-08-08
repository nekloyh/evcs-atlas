"""B5 — Lớp cung: trạm sạc + cổng sạc trong Hà Nội.

Nguồn: bảng canonical của aGiang-evcs (đã gộp evcs.vn + registry chính thức VinFast, đã khử
trùng lặp vật lý). Chỉ ĐỌC.

Bốn việc bộ dữ liệu mới làm khác repo cũ:

0. **Loại điểm sạc cá nhân tại nhà** — xem `PRIVATE_AC` bên dưới. Đây là bộ lọc đứng
   TRƯỚC mọi thứ khác, nên mọi trường dẫn xuất ở B6/B8/B9/B10/B11 đã là "sau khi loại".
1. **Lọc theo đa giác, không theo mã tỉnh cũ.** Repo cũ phân vùng theo `province_code` 63
   tỉnh trước sáp nhập; nhãn hành chính của nó chỉ đúng 72,9% (nợ N-6). Ở đây mỗi trạm
   được gán lại xã/phường bằng phép điểm-trong-đa-giác trên ranh giới VNSDI hiện hành.
2. **Một trạng thái, không bốn.** `status` (thô evcs) · `is_operational` (bool) ·
   `official_charging_status` (registry) đều là biến thể của `op_status` → chỉ giữ
   `op_status`. `AllBusy` là tín hiệu bận thời điểm, thuộc lớp occupancy, không phải trạng
   thái vận hành.
3. **Một công suất điểm.** `nameplate_power_kw` = Σ nameplate từng súng, phóng đại 1,82×
   so với công suất tủ; giữ `site_power_kw` (cộng theo tủ) và bỏ bản kia.

Sinh:
  data/processed/stations.parquet
  data/processed/connectors.parquet
  data/qa/s05_stations.json
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.dataset as pads
import pyarrow.parquet as pq
from shapely.geometry import Point
from shapely.prepared import prep
from shapely.strtree import STRtree

from . import aoi, grid, paths


def is_private_ac(n_guns, current_type) -> "pd.Series":
    """Trạm CÓ ĐÚNG MỘT SÚNG VÀ SÚNG ĐÓ LÀ AC — điểm sạc cá nhân lắp tại nhà.

    Bộ dữ liệu này coi chúng như **không tồn tại**: không vào bảng `stations`, nên cũng
    không vào bất kỳ trường dẫn xuất nào (nguồn Dijkstra của `dist_station_network_m`,
    `n_stations`, `n_ports`, `power_kw_site`, `util_cell`, các cột theo xã ở B11).

    Vì sao: đó là hạ tầng khác hẳn về ca sử dụng — chủ nhà sạc xe của chính mình qua đêm,
    không phục vụ công cộng. Chúng chiếm phần lớn SỐ TRẠM nhưng một phần nhỏ SỐ CỔNG và
    công suất, nên gộp chung làm loãng mọi thống kê cung: "khoảng cách tới trạm gần nhất"
    sẽ đo tới ổ cắm trong sân nhà người khác.

    **Bộ lọc theo cấu trúc, không theo tên.** Tên gọi không tin được: chỉ ~64% mang tiền tố
    `Tư nhân`, phần còn lại là `NQ Tư Nhân`, `Nhượng quyền`, `HKD`… Cặp (1 súng, AC) thì đo
    được và tái lập được.

    `n_guns` hoặc `current_type` null thì **giữ lại** — "không biết" không phải "biết là
    cá nhân". Cùng nguyên tắc với ràng buộc 1 của web (§7a: ⚠ chỉ dành cho "không biết").
    """
    return (n_guns == 1) & (current_type == "AC")


KEEP = [
    "station_id",
    "station_code",
    "lat",
    "lng",
    "name",
    "address",
    "operator",
    "station_type",
    "vehicle_class",
    "op_status",
    "access",
    "current_type_asset",
    "n_guns_installed",
    "n_guns_imputed",
    "max_power_kw_asset",
    "site_power_kw",
    "config_src",
    "official_matched",
    "freshness",
    "has_timeseries",
    "is_primary",
    "coord_resolved",
]


def main() -> None:
    paths.assert_sources()
    t = (
        pads.dataset(paths.SRC_CANON_STATIONS, format="parquet", partitioning="hive")
        .to_table()
        .to_pandas()
    )

    # Chỉ giữ bản chính của mỗi trạm vật lý và toạ độ đã giải quyết được — hai cổng này
    # thay cho toàn bộ vết kiểm trùng lặp (`dup_group_id`, `physical_id`, `n_dup_members`…),
    # thứ không có ý nghĩa với người dùng bộ dữ liệu này.
    t = t[(t.is_primary) & (t.coord_resolved)].copy()

    b, bb = aoi.boundary(), aoi.buffered()
    minx, miny, maxx, maxy = bb.bounds
    t = t[t.lng.between(minx, maxx) & t.lat.between(miny, maxy)].copy()
    pb, pbb = prep(b), prep(bb)
    pts = [Point(x, y) for x, y in zip(t.lng, t.lat)]
    t["scope"] = [
        ("HANOI" if pb.contains(p) else ("BUFFER" if pbb.contains(p) else "OUT")) for p in pts
    ]
    t = t[t.scope != "OUT"].copy()

    # --- loại điểm sạc cá nhân (1 súng AC) -----------------------------------
    # Loại ở ĐÂY, không loại ở tầng hiển thị: mọi bước sau (B6 occupancy, B8 Dijkstra,
    # B9 cung theo ô, B10 util_cell, B11 theo xã) đọc `stations.parquet`, nên loại một
    # lần ở đây là mọi trường dẫn xuất tự nhất quán. Loại ở tầng vẽ thì bản đồ nói một
    # đằng và `n_stations` nói một nẻo. Xem `is_private_ac`.
    #
    # Loại ở CẢ hai scope. Trạm BUFFER có mặt để tính phủ đúng ở biên — một ổ cắm trong
    # sân nhà ở Bắc Ninh cũng không phục vụ công cộng, y hệt một ổ cắm ở Hà Nội.
    priv = is_private_ac(t.n_guns_installed, t.current_type_asset)
    d = t[priv]
    dh = d[d.scope == "HANOI"]
    # Đối chiếu được: số trạm bị loại, và phần cung mà chúng mang theo. Hai con số phải
    # đi cùng nhau — "72% số trạm" nghe như mất phần lớn dữ liệu, "7% công suất" nói thật.
    dropped_stats = {
        "predicate": "n_guns_installed == 1 AND current_type_asset == 'AC'",
        "n_dropped_total": int(priv.sum()),
        "n_dropped_hanoi": int(len(dh)),
        "n_dropped_buffer": int((priv & (t.scope == "BUFFER")).sum()),
        "share_of_hanoi_stations_before": round(
            float(len(dh) / max((t.scope == "HANOI").sum(), 1)), 4
        ),
        "share_of_hanoi_ports_before": round(
            float(
                dh.n_guns_installed.fillna(0).sum()
                / max(t.loc[t.scope == "HANOI", "n_guns_installed"].fillna(0).sum(), 1)
            ),
            4,
        ),
        "share_of_hanoi_power_before": round(
            float(
                dh.site_power_kw.fillna(0).sum()
                / max(t.loc[t.scope == "HANOI", "site_power_kw"].fillna(0).sum(), 1)
            ),
            4,
        ),
    }
    t = t[~priv].copy()

    # --- gán lại xã/phường bằng hình học (sửa nợ N-6) ------------------------
    hn, geoms = aoi.communes()
    codes, names = hn.maxa.tolist(), hn.tenxa.tolist()
    tree = STRtree(geoms)
    sub = [Point(x, y) for x, y in zip(t.lng, t.lat)]
    q = tree.query(sub, predicate="within")
    idx = np.full(len(sub), -1, dtype=np.int64)
    idx[q[0]] = q[1]
    t["commune_code"] = [codes[i] if i >= 0 else None for i in idx]
    t["commune_name"] = [names[i] if i >= 0 else None for i in idx]

    out = t[[c for c in KEEP if c in t.columns]].copy()
    out = out.rename(
        columns={
            "n_guns_installed": "n_ports",
            "max_power_kw_asset": "power_kw_max_port",
            "site_power_kw": "power_kw_site",
            "current_type_asset": "current_type",
            "official_matched": "verified_official",
            "config_src": "port_config_source",
        }
    )
    out["commune_code"] = t.commune_code.astype("string")
    out["commune_name"] = t.commune_name.astype("string")
    out["scope"] = t.scope.astype("string")
    out["h3_r8"] = [grid.cell_of(la, ln) for la, ln in zip(out.lat, out.lng)]
    out["h3_r8"] = out.h3_r8.astype("string")
    out = (
        out.drop(columns=["is_primary", "coord_resolved"])
        .sort_values("station_id")
        .reset_index(drop=True)
    )

    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False), paths.PROCESSED / "stations.parquet"
    )

    # --- cổng sạc ----------------------------------------------------------
    ct = (
        pads.dataset(paths.SRC_CANON_CONNECTORS, format="parquet", partitioning="hive")
        .to_table()
        .to_pandas()
    )
    keep_ids = set(out.station_id)
    ct = ct[ct.station_id.isin(keep_ids)].copy()
    ct = ct[
        [
            "connector_id",
            "station_id",
            "station_code",
            "connector_standard",
            "current_type",
            "power_kw",
            "vehicle_class",
            "count_total",
        ]
    ].sort_values(["station_id", "connector_id"])
    pq.write_table(
        pa.Table.from_pandas(ct, preserve_index=False), paths.PROCESSED / "connectors.parquet"
    )

    # --- QA ----------------------------------------------------------------
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    hn_only = out[out.scope == "HANOI"]
    chk("station_id_unique", out.station_id.is_unique, f"{len(out)} trạm")
    chk(
        "every_hanoi_station_has_commune",
        hn_only.commune_code.notna().all(),
        f"{int(hn_only.commune_code.isna().sum())} thiếu",
    )
    chk(
        "buffer_stations_have_no_commune",
        out[out.scope == "BUFFER"].commune_code.isna().all(),
        "trạm ngoài Hà Nội không được gán xã Hà Nội",
    )
    chk(
        "every_station_cell_in_grid",
        bool(hn_only.h3_r8.isin(set(grid.hanoi_cells())).all()),
        f"{int((~hn_only.h3_r8.isin(set(grid.hanoi_cells()))).sum())} ngoài lưới",
    )
    chk("connectors_fk_ok", bool(ct.station_id.isin(keep_ids).all()), "")
    chk(
        "power_site_le_nameplate_dropped",
        "nameplate_power_kw" not in out.columns,
        "đã bỏ nameplate_power_kw (phóng đại 1,82×)",
    )
    # Bộ lọc phải quét sạch — nếu còn sót một trạm 1-súng-AC thì mọi trường dẫn xuất đã
    # sai và không có chỗ nào khác phát hiện ra.
    chk(
        "no_private_ac_left",
        not bool(is_private_ac(out.n_ports, out.current_type).any()),
        f"đã loại {dropped_stats['n_dropped_total']} trạm 1-súng-AC "
        f"({dropped_stats['share_of_hanoi_stations_before']:.1%} số trạm HN, "
        f"nhưng chỉ {dropped_stats['share_of_hanoi_power_before']:.1%} công suất)",
    )

    report = {
        "layer": "stations",
        "source": "aGiang-evcs data/interim/canonical (evcs.vn + registry VinFast, đã dedup vật lý)",
        "dropped_private_ac": dropped_stats,
        "stats": {
            "n_stations_hanoi": int(len(hn_only)),
            "n_stations_buffer_ring": int((out.scope == "BUFFER").sum()),
            "n_connectors_rows": int(len(ct)),
            "n_ports_total_hanoi": int(hn_only.n_ports.fillna(0).sum()),
            "power_kw_site_total_hanoi": round(float(hn_only.power_kw_site.fillna(0).sum()), 1),
            "op_status": hn_only.op_status.value_counts(dropna=False).to_dict(),
            "current_type": {
                str(k): int(v) for k, v in hn_only.current_type.value_counts(dropna=False).items()
            },
            "station_type": hn_only.station_type.value_counts(dropna=False).to_dict(),
            "access": hn_only.access.value_counts(dropna=False).to_dict(),
            "verified_official_share": round(float(hn_only.verified_official.mean()), 4),
            "has_timeseries_share": round(float(hn_only.has_timeseries.mean()), 4),
            "n_communes_with_station": int(hn_only.commune_code.nunique()),
            "n_cells_with_station": int(hn_only.h3_r8.nunique()),
        },
        "checks": checks,
    }
    (paths.QA / "s05_stations.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
