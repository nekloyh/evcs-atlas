"""N3 — Lớp cung theo tỉnh: trạm · cổng · occupancy · hồ sơ 168 giờ.

Sinh (mỗi tỉnh):
  store/p/<code>/stations.parquet
  store/p/<code>/connectors.parquet
  store/p/<code>/station_occupancy.parquet
  store/p/<code>/station_occupancy_profile_168h.parquet
  store/qa/<code>/n04_supply.json

Giữ NGUYÊN mọi luật của ``hanoi.s05``/``s06`` — cùng bộ lọc điểm sạc cá nhân, cùng cách
gán lại xã bằng hình học, cùng danh sách cột. Bốn chỗ khác, và cả bốn là hệ quả của việc
rời khỏi một tỉnh duy nhất:

1. **``util_pctl`` tính lại TRONG TỈNH.** ``s06`` viết rõ vì sao không dùng ``occ_pctl``
   toàn quốc của nguồn: phân vị chỉ có nghĩa trong lớp tham chiếu mà người đọc đang nhìn.
   Lập luận đó không đổi khi có 34 tỉnh — nó chỉ đổi lớp tham chiếu. Cột ``util_pctl_peer``
   ghi rõ lớp đó là gì (``"34|AC"``), nên hai tỉnh không bao giờ bị so nhầm phân vị.

2. **``commune_kind`` lấy từ bảng xã, không đoán từ tiền tố tên.** ``s06`` suy nó bằng
   ``startswith("Phường")`` → ``PHUONG``, còn lại ``XA``. Toàn quốc có 13 đặc khu và luật
   hai nhánh sẽ dán nhãn ``XA`` cho tất cả. Ở đây nối vào ``store/admin/communes.parquet``,
   nơi ``n01`` đã phân ba nhánh.

3. **``scope`` là ``IN``/``BUFFER``, không phải ``HANOI``/``BUFFER``.** Vành đệm của hai
   tỉnh kề nhau chồng lên nhau, nên MỘT trạm có thể là ``BUFFER`` ở vài tỉnh. Cộng dồn
   toàn quốc phải lọc ``scope='IN'``; ``n10_quality`` kiểm rằng tổng ``IN`` của 34 tỉnh
   đúng bằng tổng toàn quốc, không thừa không thiếu.

4. **Tỉ lệ điểm sạc cá nhân tính lại cho TỪNG tỉnh.** Con số Hà Nội (71,8% số trạm /
   7,0% công suất) là con số của Hà Nội. Đo trên 34 tỉnh: tỉ lệ số trạm trải từ 48,6%
   (Gia Lai) tới 78,7% (Bắc Ninh). Không hằng số toàn quốc nào ở đây cả.
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.dataset as pads
import pyarrow.parquet as pq
from shapely.geometry import Point
from shapely.prepared import prep
from shapely.strtree import STRtree

from evcs.core.grid import RES
from evcs.core.supply import STATION_KEEP, is_private_ac, peer_label, scope_of

from . import admin, paths, qa
from .runner import Step

VERSION = "2"  # 2: thêm cột h3_r8 (khoá nối trạm ↔ lưới cho util_pctl_cell)

RENAME = {
    "n_guns_installed": "n_ports",
    "max_power_kw_asset": "power_kw_max_port",
    "site_power_kw": "power_kw_site",
    "current_type_asset": "current_type",
    "official_matched": "verified_official",
    "config_src": "port_config_source",
}

OCC_KEEP = {
    "station_code": "station_code",
    "util": "util",
    "util_p95": "util_p95",
    "sat_frac": "saturation_frac",
    "duty_cycle": "duty_cycle",
    "grade": "grade",
    "coverage": "coverage",
    "obs_days": "obs_days",
    "util_reportable": "util_reportable",
    "occ_status": "occ_status",
    "shape_class": "shape_class",
    "peak_hour": "peak_hour",
    "peak_dow": "peak_dow",
    "night_share": "night_share",
    "weekend_ratio": "weekend_ratio",
    "n_ports": "util_denominator_ports",
    "ever_active": "ever_active",
}


def _canonical_stations() -> pd.DataFrame:
    t = (
        pads.dataset(paths.SRC_CANON_STATIONS, format="parquet", partitioning="hive")
        .to_table()
        .to_pandas()
    )
    return t[(t.is_primary) & (t.coord_resolved)].copy()


def run(province_code: str) -> None:
    r = qa.Report(
        "n03_supply",
        province_code,
        source="aGiang-evcs data/interim/canonical + data/interim/occ (evcs.vn, đã dedup vật lý)",
        province_name=admin.province_names()[province_code],
    )
    b, bb = admin.boundary(province_code), admin.buffered(province_code)
    minx, miny, maxx, maxy = bb.bounds

    t = _canonical_stations()
    n_national = len(t)
    t = t[t.lng.between(minx, maxx) & t.lat.between(miny, maxy)].copy()
    pts = [Point(x, y) for x, y in zip(t.lng, t.lat)]
    t["scope"] = scope_of(pts, prep(b), prep(bb))
    t = t[t.scope != "OUT"].copy()
    if len(t) == 0:
        raise SystemExit(f"Tỉnh {province_code}: không có trạm nào trong ranh giới + vành đệm.")

    # Phép kiểm chéo: nhãn tỉnh mà nguồn đã gán (điểm-trong-đa-giác trên VNSDI) phải khớp
    # phép gán của chính bước này. Lệch nhau ⇒ một trong hai đường dùng niên bản khác.
    ins = t[t.scope == "IN"]
    agree = float((ins.admin_l1_code == province_code).mean()) if len(ins) else 1.0

    # --- loại điểm sạc cá nhân (1 súng AC), CẢ hai scope --------------------
    priv = is_private_ac(t.n_guns_installed, t.current_type_asset)
    d_in = t[priv & (t.scope == "IN")]
    before_in = t[t.scope == "IN"]
    dropped = {
        "predicate": "n_guns_installed == 1 AND current_type_asset == 'AC'",
        "n_dropped_total": int(priv.sum()),
        "n_dropped_in": int(len(d_in)),
        "n_dropped_buffer": int((priv & (t.scope == "BUFFER")).sum()),
        "n_stations_in_before": int(len(before_in)),
        "share_of_stations_before": round(float(len(d_in) / max(len(before_in), 1)), 4),
        "share_of_ports_before": round(
            float(
                d_in.n_guns_installed.fillna(0).sum()
                / max(before_in.n_guns_installed.fillna(0).sum(), 1)
            ),
            4,
        ),
        "share_of_power_before": round(
            float(
                d_in.site_power_kw.fillna(0).sum() / max(before_in.site_power_kw.fillna(0).sum(), 1)
            ),
            4,
        ),
    }
    t = t[~priv].copy()

    # --- gán lại xã bằng hình học ------------------------------------------
    cm, geoms = admin.communes(province_code)
    codes, names = cm.maxa.tolist(), cm.tenxa.tolist()
    tree = STRtree(geoms)
    sub = [Point(x, y) for x, y in zip(t.lng, t.lat)]
    q = tree.query(sub, predicate="within")
    idx = np.full(len(sub), -1, dtype=np.int64)
    idx[q[0]] = q[1]
    t["commune_code"] = [codes[i] if i >= 0 else None for i in idx]
    t["commune_name"] = [names[i] if i >= 0 else None for i in idx]

    out = t[[c for c in STATION_KEEP if c in t.columns]].rename(columns=RENAME)
    out["province_code"] = province_code
    out["commune_code"] = t.commune_code.astype("string")
    out["commune_name"] = t.commune_name.astype("string")
    out["scope"] = t.scope.astype("string")
    out = (
        out.drop(columns=[c for c in ("is_primary", "coord_resolved") if c in out.columns])
        .sort_values("station_id")
        .reset_index(drop=True)
    )

    # Ô chứa trạm. Con số này vốn được `n04` tính rồi VỨT ĐI sau khi cộng cung về ô —
    # cùng loại lãng phí mà `dist_station_m` theo đoạn đã mắc. Giữ lại vì nó là khoá nối
    # trạm ↔ lưới mà giao diện cần: trường `util_pctl_cell` chạy một truy vấn tương quan
    # `WHERE s.h3_r8 = g.h3_r8`, và thiếu cột này thì trường ấy biến mất khỏi rail.
    out["h3_r8"] = pd.Series(
        [h3.latlng_to_cell(la, ln, RES) for la, ln in zip(out.lat, out.lng)], dtype="string"
    )

    # commune_kind BA nhánh, nối từ bảng xã của n01 — không đoán từ tiền tố tên.
    adm = pq.read_table(
        paths.ADMIN / "communes.parquet", columns=["commune_code", "commune_kind"]
    ).to_pandas()
    kind = dict(zip(adm.commune_code, adm.commune_kind))
    out["commune_kind"] = out.commune_code.map(kind).astype("string")
    out["province_code"] = out.province_code.astype("string")

    pdir = paths.province_dir(province_code)
    pq.write_table(pa.Table.from_pandas(out, preserve_index=False), pdir / "stations.parquet")

    # --- cổng sạc ----------------------------------------------------------
    ct = (
        pads.dataset(paths.SRC_CANON_CONNECTORS, format="parquet", partitioning="hive")
        .to_table()
        .to_pandas()
    )
    keep_ids = set(out.station_id)
    ct = ct[ct.station_id.isin(keep_ids)][
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
    ct["province_code"] = province_code
    pq.write_table(pa.Table.from_pandas(ct, preserve_index=False), pdir / "connectors.parquet")

    # --- occupancy ---------------------------------------------------------
    in_codes = set(out[out.scope == "IN"].station_code)
    o = pq.read_table(paths.SRC_OCC_STATION).to_pandas()
    o = o[o.station_code.isin(in_codes)].copy()
    occ = o[[c for c in OCC_KEEP if c in o.columns]].rename(columns=OCC_KEEP).copy()
    occ["province_code"] = province_code
    occ["current_type"] = occ.station_code.map(dict(zip(out.station_code, out.current_type)))
    occ["commune_kind"] = occ.station_code.map(dict(zip(out.station_code, out.commune_kind)))

    # Phân vị TRONG TỈNH, chỉ trên trạm đo được tin cậy — lớp tham chiếu ghi ở cột riêng.
    ok = (occ.grade == "GOOD") & occ.util_reportable & occ.util.notna()
    occ["util_pctl"] = pd.NA
    if ok.any():
        grp = occ.loc[ok].groupby(occ.loc[ok, "current_type"].astype("string"), dropna=False)
        occ.loc[ok, "util_pctl"] = grp.util.rank(pct=True) * 100
    occ["util_pctl"] = pd.to_numeric(occ.util_pctl, errors="coerce")
    occ["util_pctl_peer"] = pd.Series(
        [
            peer_label(province_code, c) if k else pd.NA
            for c, k in zip(occ.current_type.astype("string"), ok)
        ],
        dtype="string",
        index=occ.index,
    )
    if len(o):
        occ["window_start_utc"] = pd.to_datetime(
            o.window_start.min(), unit="ms", utc=True
        ).isoformat()
        occ["window_end_utc"] = pd.to_datetime(o.window_end.max(), unit="ms", utc=True).isoformat()
        occ["snapshot_id"] = str(o.snapshot_id.iloc[0])
    for c in ("station_code", "grade", "occ_status", "shape_class", "commune_kind", "current_type"):
        if c in occ:
            occ[c] = occ[c].astype("string")
    occ = occ.sort_values("station_code").reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(occ, preserve_index=False), pdir / "station_occupancy.parquet"
    )

    # --- hồ sơ 168 giờ -----------------------------------------------------
    p168 = pq.read_table(
        paths.SRC_OCC_PROFILE_168,
        columns=["station_code", "dow", "hour", "occ", "observed_h", "n_obs"],
        filters=[("station_code", "in", list(in_codes))] if in_codes else [("dow", "<", -1)],
    ).to_pandas()
    p168["station_code"] = p168.station_code.astype("string")
    p168["province_code"] = province_code
    p168 = p168.sort_values(["station_code", "dow", "hour"]).reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(p168, preserve_index=False),
        pdir / "station_occupancy_profile_168h.parquet",
    )

    # --- QA ----------------------------------------------------------------
    ins_out = out[out.scope == "IN"]
    r.doc["dropped_private_ac"] = dropped
    r.stat(
        n_stations_national_pool=n_national,
        n_stations_in=int(len(ins_out)),
        n_stations_buffer_ring=int((out.scope == "BUFFER").sum()),
        n_connectors_rows=int(len(ct)),
        n_ports_total=int(ins_out.n_ports.fillna(0).sum()),
        power_kw_site_total=round(float(ins_out.power_kw_site.fillna(0).sum()), 1),
        power_kw_per_station=round(
            float(ins_out.power_kw_site.fillna(0).sum() / max(len(ins_out), 1)), 1
        ),
        op_status=ins_out.op_status.value_counts(dropna=False).to_dict(),
        current_type={
            str(k): int(v) for k, v in ins_out.current_type.value_counts(dropna=False).items()
        },
        commune_kind={
            str(k): int(v) for k, v in ins_out.commune_kind.value_counts(dropna=False).items()
        },
        access=ins_out.access.value_counts(dropna=False).to_dict(),
        verified_official_share=round(float(ins_out.verified_official.mean()), 4)
        if len(ins_out)
        else None,
        n_communes_with_station=int(ins_out.commune_code.nunique()),
        n_stations_with_occ=int(len(occ)),
        occ_coverage=round(float(len(occ) / max(len(ins_out), 1)), 4),
        occ_grade=occ.grade.value_counts(dropna=False).to_dict(),
        util_median=round(float(occ.util.median()), 4)
        if len(occ) and occ.util.notna().any()
        else None,
        n_profile_rows=int(len(p168)),
        upstream_province_label_agreement=round(agree, 4),
    )
    r.check("station_id_unique", bool(out.station_id.is_unique), f"{len(out)} trạm")
    r.check(
        "every_in_station_has_commune",
        bool(ins_out.commune_code.notna().all()),
        f"{int(ins_out.commune_code.isna().sum())} thiếu",
    )
    r.check(
        "buffer_stations_have_no_commune",
        bool(out[out.scope == "BUFFER"].commune_code.isna().all()),
        "trạm ngoài tỉnh không được gán xã của tỉnh này",
    )
    r.check(
        "no_private_ac_left",
        not bool(is_private_ac(out.n_ports, out.current_type).any()),
        f"đã loại {dropped['n_dropped_in']} trạm 1-súng-AC "
        f"({dropped['share_of_stations_before']:.1%} số trạm, "
        f"nhưng {dropped['share_of_power_before']:.1%} công suất)",
    )
    r.check(
        "upstream_province_label_agrees",
        agree > 0.99,
        f"{agree:.2%} trạm IN có admin_l1_code khớp phép gán hình học ở đây",
    )
    r.check("connectors_fk_ok", bool(ct.station_id.isin(keep_ids).all()), "")
    r.check(
        "occ_only_for_in_scope",
        bool(occ.station_code.isin(in_codes).all()),
        "occupancy chỉ cho trạm thuộc tỉnh, không cho trạm vành đệm",
    )
    r.check(
        "profile_cells_le_168",
        bool(p168.groupby("station_code").size().max() <= 168) if len(p168) else True,
        f"max {int(p168.groupby('station_code').size().max()) if len(p168) else 0} ô/trạm",
    )
    r.write(quiet=True)
    print(
        f"   trạm {len(ins_out):,} (+{int((out.scope == 'BUFFER').sum()):,} đệm) · "
        f"cổng {int(ins_out.n_ports.fillna(0).sum()):,} · "
        f"{ins_out.power_kw_site.fillna(0).sum() / 1000:,.1f} MW · "
        f"loại 1-súng-AC {dropped['share_of_stations_before']:.1%} số trạm / "
        f"{dropped['share_of_power_before']:.1%} công suất"
    )


STEP = Step(
    name="n03_supply",
    scope="province",
    version=VERSION,
    run=run,
    reads=(
        "src_canon_stations",
        "src_canon_connectors",
        "src_occ_station",
        "src_occ_profile",
        "src_vnsdi",
        "admin_communes",
    ),
    writes=(
        "stations",
        "connectors",
        "station_occupancy",
        "station_profile_168h",
        "qa_n03_supply",
    ),
    desc="trạm · cổng · occupancy · hồ sơ 168h theo tỉnh",
)
