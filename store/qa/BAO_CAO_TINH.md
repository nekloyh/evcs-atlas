# Bảng thống kê theo tỉnh

Sinh tự động bởi `vn/n10_quality.py` — 34 tỉnh có trong store.
Mọi con số tính LẠI TỪ ĐẦU cho từng tỉnh; không hằng số toàn quốc nào.

| cột | nghĩa |
|---|---|
| `1AC %trạm` / `1AC %kW` | phần bị loại vì là điểm sạc cá nhân (1 súng AC) |
| `%đo được` | phần trạm có `util` đọc được — dưới 50% thì lớp mức sử dụng bị TẮT |
| `tới trạm TV` | trung vị khoảng cách theo MẠNG ĐƯỜNG từ ô tới trạm gần nhất (m) |
| `%dân >2km` | phần dân ở ô xa hơn 2 km theo đường |
| `%xã 0POI` | phần xã không có MỘT POI nào trong OSM — chỗ KHÔNG được diễn giải |
| `neo VNSDI` | `danso` công bố chia bề mặt WorldPop. >1 = số công bố cao hơn |
| `%ô tới được` | phần Ô tới được trạm bằng đường bộ. **Bối cảnh, không phải cờ** — thấp = biển/đảo/núi trong đa giác tỉnh (Trường Sa chiếm 8.558 ô của Khánh Hoà) |
| `%dân kẹt` | phần DÂN ở ô không tới được. Đây mới là con số nói lớp khoảng cách có lành hay không |

| mã | tỉnh           | dân số     | trạm | cổng   | MW    | 1AC %trạm | 1AC %kW | cổng/10k | %đo được | tới trạm TV | %dân >2km | built | POI   | %xã 0POI | neo VNSDI | %ô tới được | %dân kẹt | cờ                                                                                                          |
|----|----------------|------------|------|--------|-------|-----------|---------|----------|----------|-------------|-----------|-------|-------|----------|-----------|-------------|----------|-------------------------------------------------------------------------------------------------------------|
| 79 | TP Hồ Chí Minh | 14.668.098 | 926  | 10.064 | 268.2 | 59.2%     | 4.5%    | 6.86     | 94.2%    | 4.295       | 18.2%     | 14.3% | 4.989 | 3.6%     | 1.01      | 92.9%       | 0.1%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 01 | TP Hà Nội      | 8.732.930  | 710  | 7.785  | 232.8 | 71.8%     | 7.0%    | 8.91     | 95.2%    | 2.322       | 28.8%     | 18.0% | 3.919 | 7.1%     | 0.95      | 99.9%       | 0.1%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 25 | Phú Thọ        | 4.022.493  | 329  | 2.449  | 71.0  | 69.7%     | 9.4%    | 6.09     | 76.9%    | 6.576       | 60.6%     | 3.7%  | 224   | 55.4%    | 1.09      | 97.0%       | 0.0%     | POI_KHONG_DIEN_GIAI_DUOC, DIA_GIOI_CO_SO_CONG_BO_HONG                                                       |
| 75 | Đồng Nai       | 4.491.408  | 318  | 1.906  | 49.5  | 67.9%     | 11.5%   | 4.24     | 96.9%    | 8.134       | 54.3%     | 4.5%  | 497   | 26.3%    | 1.00      | 88.5%       | 0.2%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 31 | TP Hải Phòng   | 4.664.124  | 238  | 2.150  | 68.4  | 74.4%     | 9.1%    | 4.61     | 93.7%    | 3.573       | 55.7%     | 15.0% | 368   | 49.1%    | 1.13      | 95.4%       | 0.0%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 24 | Bắc Ninh       | 3.619.433  | 238  | 1.524  | 46.9  | 78.7%     | 15.6%   | 4.21     | 76.5%    | 5.426       | 57.8%     | 7.8%  | 575   | 36.4%    | 1.01      | 96.2%       | 0.0%     | —                                                                                                           |
| 68 | Lâm Đồng       | 3.872.999  | 237  | 2.358  | 64.7  | 55.8%     | 4.3%    | 6.09     | 92.0%    | 9.547       | 65.1%     | 1.8%  | 749   | 20.2%    | 1.17      | 70.4%       | 1.6%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 66 | Đắk Lắk        | 3.346.853  | 234  | 1.317  | 33.9  | 49.4%     | 6.3%    | 3.94     | 70.5%    | 10.233      | 64.9%     | 1.9%  | 365   | 32.4%    | 1.20      | 73.6%       | 0.3%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 33 | Hưng Yên       | 3.567.943  | 231  | 1.937  | 61.1  | 74.2%     | 9.6%    | 5.43     | 87.9%    | 3.330       | 64.3%     | 15.8% | 330   | 49.0%    | 1.10      | 99.9%       | 0.0%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 37 | Ninh Bình      | 4.412.264  | 220  | 1.602  | 51.6  | 73.7%     | 10.6%   | 3.63     | 95.5%    | 3.900       | 65.6%     | 13.6% | 413   | 48.1%    | 1.26      | 98.4%       | 0.0%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 48 | TP Đà Nẵng     | 3.122.915  | 191  | 1.840  | 60.4  | 64.1%     | 5.0%    | 5.89     | 85.3%    | 11.786      | 48.2%     | 2.4%  | 590   | 42.5%    | 1.12      | 59.0%       | 0.9%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 38 | Thanh Hóa      | 4.320.947  | 188  | 1.747  | 48.9  | 74.1%     | 9.6%    | 4.04     | 88.3%    | 9.327       | 72.5%     | 3.3%  | 174   | 57.2%    | 1.18      | 89.2%       | 0.1%     | POI_KHONG_DIEN_GIAI_DUOC, DIA_GIOI_CO_SO_CONG_BO_HONG                                                       |
| 91 | An Giang       | 4.995.214  | 187  | 1.496  | 39.3  | 52.9%     | 5.0%    | 2.99     | 81.8%    | 11.015      | 74.2%     | 3.9%  | 385   | 42.2%    | 1.61      | 87.8%       | 4.0%     | DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG                                                  |
| 80 | Tây Ninh       | 3.254.170  | 177  | 1.707  | 42.8  | 62.7%     | 6.3%    | 5.25     | 81.4%    | 8.001       | 69.5%     | 5.0%  | 246   | 32.3%    | 1.06      | 97.1%       | 0.1%     | —                                                                                                           |
| 52 | Gia Lai        | 3.583.691  | 169  | 1.223  | 33.9  | 48.6%     | 4.7%    | 3.41     | 76.9%    | 11.541      | 66.6%     | 1.9%  | 268   | 49.6%    | 1.15      | 68.6%       | 0.8%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 44 | Quảng Trị      | 1.870.844  | 153  | 1.504  | 41.5  | 59.6%     | 4.8%    | 8.04     | 73.2%    | 8.632       | 65.4%     | 1.9%  | 315   | 25.6%    | 1.21      | 65.8%       | 0.3%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 82 | Đồng Tháp      | 4.370.046  | 149  | 1.009  | 31.0  | 55.3%     | 5.7%    | 2.31     | 86.6%    | 6.906       | 71.3%     | 5.8%  | 272   | 38.2%    | 1.34      | 96.4%       | 3.0%     | DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG                                                  |
| 86 | Vĩnh Long      | 4.257.581  | 146  | 899    | 27.9  | 55.8%     | 5.9%    | 2.11     | 78.8%    | 8.247       | 81.2%     | 4.6%  | 203   | 54.0%    | 1.34      | 91.2%       | 3.6%     | POI_KHONG_DIEN_GIAI_DUOC, DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG                        |
| 22 | Quảng Ninh     | 1.497.447  | 142  | 1.113  | 36.3  | 75.6%     | 10.5%   | 7.43     | 94.4%    | 8.352       | 45.1%     | 2.8%  | 286   | 31.5%    | 1.04      | 75.4%       | 1.6%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 19 | Thái Nguyên    | 1.799.489  | 136  | 1.973  | 46.9  | 73.6%     | 7.3%    | 10.96    | 61.0%    | 13.223      | 64.5%     | 1.8%  | 115   | 59.8%    | 1.06      | 87.0%       | 1.9%     | POI_KHONG_DIEN_GIAI_DUOC                                                                                    |
| 92 | TP Cần Thơ     | 4.199.788  | 126  | 999    | 29.1  | 65.2%     | 7.2%    | 2.38     | 91.3%    | 9.950       | 79.5%     | 5.4%  | 356   | 55.3%    | 1.45      | 98.4%       | 1.3%     | POI_KHONG_DIEN_GIAI_DUOC, DIA_GIOI_CO_SO_CONG_BO_HONG                                                       |
| 40 | Nghệ An        | 3.831.694  | 118  | 1.068  | 31.1  | 76.3%     | 10.6%   | 2.79     | 83.0%    | 13.341      | 76.1%     | 2.2%  | 266   | 52.3%    | 1.06      | 69.1%       | 0.7%     | POI_KHONG_DIEN_GIAI_DUOC, DIA_GIOI_CO_SO_CONG_BO_HONG                                                       |
| 56 | Khánh Hòa      | 2.243.553  | 111  | 1.250  | 34.0  | 63.8%     | 5.2%    | 5.57     | 92.8%    | 8.834       | 56.9%     | 1.7%  | 535   | 13.9%    | 1.19      | 33.4%       | 0.9%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 08 | Tuyên Quang    | 1.858.056  | 101  | 531    | 18.3  | 68.1%     | 10.5%   | 2.86     | 81.2%    | 14.887      | 83.0%     | 0.6%  | 151   | 55.6%    | 1.06      | 85.6%       | 3.9%     | POI_KHONG_DIEN_GIAI_DUOC, DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG                        |
| 42 | Hà Tĩnh        | 1.623.061  | 99   | 825    | 23.7  | 68.7%     | 7.9%    | 5.08     | 68.7%    | 6.222       | 70.2%     | 4.0%  | 227   | 43.5%    | 1.25      | 71.4%       | 0.1%     | —                                                                                                           |
| 15 | Lào Cai        | 1.770.645  | 87   | 639    | 24.6  | 73.8%     | 9.1%    | 3.61     | 78.2%    | 15.606      | 77.6%     | 0.9%  | 180   | 53.5%    | 1.06      | 80.6%       | 1.5%     | POI_KHONG_DIEN_GIAI_DUOC, DIA_GIOI_CO_SO_CONG_BO_HONG                                                       |
| 51 | Quảng Ngãi     | 2.161.735  | 82   | 631    | 17.1  | 56.6%     | 5.7%    | 2.92     | 72.0%    | 17.516      | 71.8%     | 1.5%  | 249   | 49.0%    | 1.20      | 77.5%       | 1.5%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 96 | Cà Mau         | 1.988.464  | 76   | 496    | 15.4  | 67.0%     | 8.8%    | 2.49     | 81.6%    | 12.429      | 74.0%     | 2.8%  | 31    | 76.6%    | 0.98      | 80.2%       | 10.7%    | POI_KHONG_DIEN_GIAI_DUOC, DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG                        |
| 46 | TP Huế         | 1.432.986  | 64   | 623    | 17.9  | 65.6%     | 6.0%    | 4.35     | 85.9%    | 7.725       | 65.2%     | 3.0%  | 173   | 30.0%    | 1.27      | 61.6%       | 0.1%     | DIA_GIOI_CO_SO_CONG_BO_HONG                                                                                 |
| 14 | Sơn La         | 1.404.587  | 64   | 540    | 17.6  | 57.3%     | 4.6%    | 3.84     | 4.7%     | 19.304      | 78.6%     | 0.6%  | 98    | 62.7%    | 1.02      | 82.5%       | 4.1%     | KHONG_DO_DUOC_SU_DUNG, POI_KHONG_DIEN_GIAI_DUOC, DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG |
| 20 | Lạng Sơn       | 881.384    | 40   | 319    | 9.9   | 64.6%     | 6.9%    | 3.62     | 95.0%    | 16.561      | 76.5%     | 0.7%  | 94    | 53.8%    | 1.09      | 88.9%       | 1.5%     | POI_KHONG_DIEN_GIAI_DUOC, DIA_GIOI_CO_SO_CONG_BO_HONG                                                       |
| 11 | Điện Biên      | 673.091    | 39   | 209    | 6.7   | 70.2%     | 12.0%   | 3.11     | 0.0%     | 19.191      | 77.2%     | 0.4%  | 44    | 64.4%    | 1.00      | 72.2%       | 6.9%     | KHONG_DO_DUOC_SU_DUNG, POI_KHONG_DIEN_GIAI_DUOC, DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG |
| 04 | Cao Bằng       | 573.119    | 30   | 139    | 4.9   | 74.8%     | 15.9%   | 2.43     | 10.0%    | 15.426      | 73.8%     | 0.4%  | 123   | 48.2%    | 1.08      | 84.2%       | 8.6%     | KHONG_DO_DUOC_SU_DUNG, DAN_KHONG_TOI_DUOC_BANG_DUONG                                                        |
| 12 | Lai Châu       | 512.601    | 24   | 88     | 3.9   | 74.2%     | 14.5%   | 1.72     | 16.7%    | 24.719      | 82.3%     | 0.4%  | 69    | 47.4%    | 0.98      | 67.5%       | 2.8%     | QUA_IT_TRAM, KHONG_DO_DUOC_SU_DUNG, DAN_KHONG_TOI_DUOC_BANG_DUONG, DIA_GIOI_CO_SO_CONG_BO_HONG              |

## Cờ chất lượng

| cờ | nghĩa |
|---|---|
| `KHONG_CO_TRAM` / `QUA_IT_TRAM` | dưới ngưỡng số trạm — không nói được gì ở cấp xã |
| `KHONG_DO_DUOC_SU_DUNG` | dưới nửa số trạm đo được `util` ⇒ lớp mức sử dụng TẮT ở tỉnh đó |
| `POI_KHONG_DIEN_GIAI_DUOC` | quá nửa số xã không có POI — **không** loại tỉnh, chỉ cấm đọc POI như thước đo |
| `DIA_GIOI_CO_SO_CONG_BO_HONG` | tỉnh có xã mang cờ chất lượng địa giới (xem `store/admin/communes.parquet`) |
| `DAN_KHONG_TOI_DUOC_BANG_DUONG` | quá 2% DÂN ở ô không tới được trạm nào bằng đường — đọc `dist_station_*` dè dặt; **không** loại tỉnh |
| `THIEU_NHA_VAN_HANH_KHAC` | nguồn phụ có >5% trạm mà nguồn chính không có |
