# Báo cáo QA — bộ dữ liệu Hà Nội

**51 PASS · 0 FAIL** trên toàn bộ 10 bước.


## `s01_admin.json` — admin

- **n_communes**: `126`
- **population_total**: `8732930`
- **area_km2_published**: `3359.77`
- **area_km2_geom**: `3348.92`
- **bbox_boundary**: `[105.288836, 20.563769, 106.020184, 21.383219]`
- **bbox_buffered**: `[105.240731, 20.51869, 106.068146, 21.428432]`
- **buffer_m**: `5000`

| check | kết quả | chi tiết |
|---|---|---|
| `commune_code_unique` | PASS | 126 mã |
| `all_geoms_valid` | PASS |  |
| `single_province` | PASS | ['01'] |
| `area_published_vs_geom_lt_2pct` | PASS | lệch 0.32% |
| `boundary_is_single_polygon` | PASS | Polygon |
| `buffer_contains_boundary` | PASS |  |

## `s02_grid.json` — grid

- **n_cells**: `4400`
- **n_inside**: `3904`
- **n_border**: `496`
- **n_buffered_cells**: `6659`
- **grid_area_km2_weighted**: `3363.86`
- **boundary_area_km2**: `3348.92`
- **median_commune_area_frac**: `1.0`
- **cells_with_ambiguous_commune_lt_0_6**: `573`
- **sliver_cells_excluded**: `{"min_area_frac": 0.01, "n": 27, "max_area_frac_among_excluded": 0.009644, "cells": ["8841430929fffff", "8841430dd5fffff", "8841430f23fffff", "8841434441fffff", "8841434519fffff", "8841434623fffff", "8841434cd1fffff", "88414360bbfffff", "8841436e35fffff", "8841437731fffff", "88415c32cdfffff", "88415ca035fffff", "88415ca185fffff", "88415ca2e7fffff", "88415caa95fffff", "88415cacabfffff", "88415cad95fffff", "88415d8925fffff", "88415dc1b3fffff", "88415dc1d9fffff", "88415dc42bfffff", "88415dc439fffff", "88415dc61bfffff", "88415dd847fffff", "88415dd859fffff", "88415ddb05fffff", "88415ddb0dfffff"]}`

| check | kết quả | chi tiết |
|---|---|---|
| `h3_unique` | PASS | 4400 ô |
| `no_sliver_cells_in_grid` | PASS | 27 ô vụn đã bị loại (area_frac < 0.01) |
| `every_cell_has_commune` | PASS | 0 thiếu |
| `area_frac_in_0_1` | PASS |  |
| `grid_area_matches_boundary_lt_1pct` | PASS | lưới 3,363.9 km² vs đa giác 3,348.9 km² (lệch 0.45%) |
| `commune_frac_sums_to_province_frac` | PASS | max lệch 5.21e-13 |

## `s03_osm_extract.json` — osm_extract

- **pbf_nodes_scanned**: `45788108`
- **pbf_ways_scanned**: `4670410`
- **roads**: `240212`
- **road_class_counts**: `{"LOCAL": 144343, "SERVICE": 79096, "TERTIARY": 5465, "PRIMARY": 4596, "SECONDARY": 3487, "TRUNK": 2258, "MOTORWAY": 967}`
- **roads_with_maxspeed_tag**: `2685`
- **poi**: `4300`
- **poi_class_counts**: `{"APARTMENT": 2551, "PARKING_OFF": 578, "FUEL": 409, "SUPERMARKET": 272, "MARKET": 233, "PARKING_STREET": 113, "DEPT_STORE": 88, "MALL": 56}`
- **power_substations**: `133`
- **dropped_in_bbox_but_outside_polygon**: `88063`
- **elapsed_s**: `156.5`

## `s04_population.json` — population

- **population_total**: `8831125.9`
- **population_published_vnsdi**: `8732930.0`
- **population_expected_after_substitution**: `8831204.3`
- **population_in_excluded_sliver_cells**: `78.5`
- **n_excluded_sliver_cells**: `27`
- **n_cells**: `4400`
- **n_cells_with_pop**: `4265`
- **worldpop_raw_total_in_boundary**: `9174421.3`
- **worldpop_bias_vs_official_pct**: `5.06`
- **pixels_in_boundary**: `323396`
- **pixels_in_bbox_outside_boundary_share**: `0.2888`
- **communes_without_weight**: `[]`
- **communes_with_implausible_official**: `[{"commune_code": "00328", "commune_name": "Phường Lĩnh Nam", "danso_published": 21, "worldpop2025_in_commune": 38608.8}, {"commune_code": "10369", "commune_name": "Xã Ứng Thiên", "danso_published": 54, "worldpop2025_in_commune": 59740.5}]`
- **pop_source_counts**: `{"WORLDPOP2025_ANCHORED_VNSDI": 4210, "ZERO_NO_WEIGHT": 135, "WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE": 55}`
- **max_cell_population**: `46232.4`

| check | kết quả | chi tiết |
|---|---|---|
| `total_matches_official_plus_declared_substitutions` | PASS | 8,831,126 + 78.5 (ô vụn) vs kỳ vọng 8,831,204 (công bố 8,732,930 − 75 + 98,349) |
| `no_negative` | PASS |  |
| `no_communes_without_weight` | PASS | 0 xã dùng rải-đều: [] |
| `implausible_official_declared_not_silent` | PASS | 2 xã có danso công bố hỏng → thay bằng WorldPop, gắn cờ pop_source |
| `cells_covered` | PASS | 4,265/4,400 ô có dân |

## `s05_stations.json` — stations

- **n_stations_hanoi**: `710`
- **n_stations_buffer_ring**: `229`
- **n_connectors_rows**: `1602`
- **n_ports_total_hanoi**: `7785`
- **power_kw_site_total_hanoi**: `232841.3`
- **op_status**: `{"OPERATIONAL": 618, "MAINTENANCE": 57, "OUT_OF_SERVICE": 30, "UNKNOWN": 5}`
- **current_type**: `{"MIXED": 339, "DC": 305, "AC": 47, "nan": 19}`
- **station_type**: `{"VINFAST_CS": 704, "OTHER": 6}`
- **access**: `{"PUBLIC": 690, "RESTRICTED": 15, "UNKNOWN": 5}`
- **verified_official_share**: `0.993`
- **has_timeseries_share**: `0.9901`
- **n_communes_with_station**: `118`
- **n_cells_with_station**: `449`

| check | kết quả | chi tiết |
|---|---|---|
| `station_id_unique` | PASS | 939 trạm |
| `every_hanoi_station_has_commune` | PASS | 0 thiếu |
| `buffer_stations_have_no_commune` | PASS | trạm ngoài Hà Nội không được gán xã Hà Nội |
| `every_station_cell_in_grid` | PASS | 0 ngoài lưới |
| `connectors_fk_ok` | PASS |  |
| `power_site_le_nameplate_dropped` | PASS | đã bỏ nameplate_power_kw (phóng đại 1,82×) |
| `no_private_ac_left` | PASS | đã loại 2408 trạm 1-súng-AC (71.8% số trạm HN, nhưng chỉ 7.0% công suất) |

## `s06_occupancy.json` — occupancy

- **n_stations_hanoi_total**: `710`
- **n_stations_with_occ**: `703`
- **n_profile_rows**: `116785`
- **grade**: `{"GOOD": 680, "PARTIAL": 14, "INSUFFICIENT": 9}`
- **occ_status**: `{"OK": 676, "THIEU_COVERAGE": 23, "THIEU_PEER": 4}`
- **util_mean**: `0.2592`
- **util_median**: `0.2263`
- **util_p90_of_stations**: `0.5322`
- **saturation_frac_mean**: `0.0562`
- **n_with_pctl**: `676`
- **shape_class**: `{"HAI_DINH": 292, "BAN_NGAY_PHANG": 239, "THAT_THUONG": 89, "KHONG_XEP_LOAI": 49, "DEM_TROI": 34}`
- **commune_kind**: `{"XA": 415, "PHUONG": 288}`

| check | kết quả | chi tiết |
|---|---|---|
| `station_code_unique` | PASS | 703 trạm |
| `all_codes_are_hanoi` | PASS |  |
| `util_in_0_1` | PASS |  |
| `pctl_only_on_good_grade` | PASS | 676 trạm có phân vị |
| `profile_cells_le_168` | PASS | max 168 ô/trạm |
| `occ_covers_most_stations` | PASS | 703/710 = 99.0% |
| `commune_kind_matches_inherited_label` | PASS | PHUONG/XA dựng từ VNSDI khớp 100% nhãn urban_rural kế thừa |

## `s07_landcover.json` — landcover

- **n_cells**: `4400`
- **median_px_per_cell**: `10083`
- **built_frac_mean**: `0.1804`
- **water_frac_mean**: `0.0556`
- **crop_frac_mean**: `0.359`
- **built_frac_p90**: `0.4553`
- **n_cells_built_frac_lt_0_05**: `1404`
- **n_cells_water_frac_gt_0_50**: `144`

| check | kết quả | chi tiết |
|---|---|---|
| `every_cell_covered` | PASS | 0 ô rỗng |
| `fracs_sum_to_1` | PASS | max lệch 2.22e-16 |
| `all_grid_cells_present` | PASS | 4400/4400 |

## `s08_traveltime.json` — distance

- **n_cells**: `4400`
- **n_reachable**: `4399`
- **dist_median_m**: `2322.8`
- **dist_p90_m**: `4832.8`
- **euclid_median_m**: `1487.2`
- **detour_ratio_median**: `1.474`
- **detour_ratio_p90**: `2.289`
- **detour_ratio_max**: `36.08`
- **cells_where_euclid_understates_gt_2x**: `696`
- **detour_ratio_null_cells**: `88`
- **asym_median_m**: `0.0`
- **asym_p90_m**: `151.9`
- **asym_max_m**: `16293.0`
- **cells_asym_gt_500m**: `182`
- **neighbor_pairs**: `12768`
- **neighbor_jump_median_m**: `740.6`
- **neighbor_jump_p90_m**: `1664.6`
- **neighbor_jump_p99_m**: `4367.6`
- **neighbor_jump_max_m**: `20523.0`
- **neighbor_pairs_jump_gt_2km**: `860`
- **neighbor_pairs_jump_gt_2km_share**: `0.0674`
- **euclid_coverage_error_by_radius**: `{"1000m": {"cells_covered_euclid": 1325, "cells_covered_network": 595, "false_positive_cells": 730, "false_positive_share": 0.5509}, "2000m": {"cells_covered_euclid": 2964, "cells_covered_network": 1837, "false_positive_cells": 1127, "false_positive_share": 0.3802}, "3000m": {"cells_covered_euclid": 3864, "cells_covered_network": 2879, "false_positive_cells": 985, "false_positive_share": 0.2549}, "5000m": {"cells_covered_euclid": 4369, "cells_covered_network": 4011, "false_positive_cells": 358, "false_positive_share": 0.0819}}`

| check | kết quả | chi tiết |
|---|---|---|
| `all_cells_present` | PASS | 4400/4400 |
| `network_ge_euclid` | PASS | min tỉ số 1.009 (đường mạng không thể ngắn hơn chim bay) |
| `most_cells_reachable` | PASS | 4399/4400 = 100.0% |
| `no_negative_distance` | PASS |  |
| `no_time_field` | PASS | bộ dữ liệu không phát trường thời gian nào — chỉ mét |
| `all_anchors_in_giant_scc` | PASS | mọi điểm neo (ô và trạm) đều nằm trong SCC lớn — xe đi tiếp được |

## `s09_grid_features.json` — grid_features

- **road_len_total_km**: `30476.7`
- **road_len_arterial_km**: `3109.4`
- **road_len_by_class_km**: `{"local": 19840.2, "motorway": 411.0, "primary": 1008.3, "secondary": 973.6, "service": 5667.2, "tertiary": 1859.9, "trunk": 716.6}`
- **poi_in_hanoi**: `3955`
- **poi_by_class**: `{"fuel": 321, "parking_off": 509, "parking_street": 67, "mall": 47, "dept_store": 83, "supermarket": 253, "market": 193, "apartment": 2482}`
- **road_len_in_hanoi_km**: `29296.8`
- **road_outside_boundary_share**: `0.0387`
- **cells_with_supply**: `449`
- **ports_total**: `7785`

| check | kết quả | chi tiết |
|---|---|---|
| `road_total_equals_class_sum` | PASS |  |
| `cells_with_road` | PASS | 4219/4400 = 95.9% |
| `poi_total_matches` | PASS | 3955 vs 3955 |
| `supply_matches_station_table` | PASS | 710 vs 710 |
| `clipped_road_le_full_cell` | PASS | phần ngoài ranh giới 3.87% tổng chiều dài |

## `s10_assemble.json` — grid_h3_r8

- **n_cells**: `4400`
- **n_columns**: `56`
- **population_total**: `8831125.9`
- **cells_with_supply**: `449`
- **cells_with_measured_util**: `437`
- **util_cell_median**: `0.2293`
- **dist_station_network_median_m**: `2322.8`
- **dist_station_network_p90_m**: `4832.8`
- **pop_beyond_2km_network**: `2557260`
- **pop_beyond_5km_network**: `143566`
- **pop_unreachable**: `37`

| check | kết quả | chi tiết |
|---|---|---|
| `h3_unique` | PASS | 4400 ô |
| `no_missing_after_join` | PASS |  |
| `population_total_preserved_minus_declared_slivers` | PASS | 8,831,126 vs 8,831,204 − 78.5 (ô vụn đã loại) |
| `util_cell_null_not_zero` | PASS | ô không đo được là null, không phải 0 |
| `no_rejected_variant_columns` | PASS | không cột biến thể / cột đã bỏ nào lọt vào bảng cuối |
| `border_convention_declared` | PASS | ô biên đo được chênh lệch giữa hai quy ước cắt biên |
