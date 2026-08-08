"""A12 — ``dist_substation_m`` dựng từ 133 trạm biến áp OSM.

Kiểm: phân bố có dạng "lớp thưa giả tạo" không — nhiều ô cùng neo vào một trạm biến áp,
tạo bậc thang giả. Đếm số ô mỗi trạm biến áp "phục vụ".
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from _common import ROOT, emit, grid

M_LAT, M_LON = 110_574.0, 103_940.0


def main() -> None:
    g = grid()
    pw = pd.read_parquet(ROOT / "data/raw/osm_hanoi_power.parquet")
    kt = cKDTree(np.c_[pw.lng * M_LON, pw.lat * M_LAT])
    d, i = kt.query(np.c_[g.lng * M_LON, g.lat * M_LAT])

    counts = pd.Series(i).value_counts()
    # đối chứng: 133 trạm biến áp cho 3.360 km² so với mật độ lưới thật của EVN
    report = {
        "cau_hoi": "133 trạm biến áp OSM có đủ để trường này mang thông tin không?",
        "nguon": {
            "n_tram_bien_ap_trong_aoi": int(len(pw)),
            "dien_tich_aoi_km2_xap_xi": 3359.8,
            "km2_moi_tram_bien_ap": round(3359.8 / len(pw), 1),
            "tag_da_lay": "power=substation (s03 bỏ qua transformer/pole/portal/minor_line)",
        },
        "phan_bo_khoang_cach_m": {
            "min": float(d.min()),
            "p10": float(np.percentile(d, 10)),
            "median": float(np.median(d)),
            "p90": float(np.percentile(d, 90)),
            "max": float(d.max()),
        },
        "lop_thua_gia_tao": {
            "n_tram_bien_ap_duoc_dung_lam_lang_gieng_gan_nhat": int(counts.size),
            "n_tram_bien_ap_khong_phuc_vu_o_nao": int(len(pw) - counts.size),
            "so_o_moi_tram_max": int(counts.max()),
            "so_o_moi_tram_median": int(counts.median()),
            "ty_trong_o_neo_vao_5_tram_dong_nhat": float(counts.nlargest(5).sum() / len(g)),
        },
        "suc_phan_biet": {
            "note": "Trạm sạc THẬT có nằm gần trạm biến áp hơn ô ngẫu nhiên không? Nếu không, trường này không mang tín hiệu.",
            "median_o_co_tram_sac_m": float(np.median(d[g.n_stations.to_numpy() > 0])),
            "median_o_khong_tram_sac_m": float(np.median(d[g.n_stations.to_numpy() == 0])),
        },
    }
    emit("A12", "CANH_BAO", report)


if __name__ == "__main__":
    main()
