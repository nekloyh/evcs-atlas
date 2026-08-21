/**
 * Phase 6 — Simulation Controller Hook (simulation/use-simulation.ts)
 *
 * Coordinates data loading, admission checks, and engine execution for candidate placement.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1, §2, §3
 */

import { useEffect, useMemo } from "react";
import { candidateKeyOf, useSimulationStore } from "./store";
import { checkAdmission, type GridCellLookup } from "./admissions";
import { runSimulation, type GridCellSimInput, type StationSimInput } from "./engine";
import { fetchSimCalibration } from "./loader";
import { fetchOccupancySummary, fetchZoneCells } from "./zone-query";
import { zoneTruncatedAt } from "./geometry";
import type { CommuneCollection, StationPoint } from "../data/queries";
import type { Manifest } from "../data/manifest";

export interface UseSimulationParams {
  provinceCode?: string | null;
  boundary?: CommuneCollection | null;
  stations?: StationPoint[];
  communes?: CommuneCollection | null;
  manifest?: Manifest | null;
  /** F6 — tỉnh có lớp mức sử dụng bị loại (`layerUsable("occupancy")` từ manifest). */
  highLoadEvaluable?: boolean;
}

export function useSimulationController({
  provinceCode,
  boundary,
  stations = [],
  communes = null,
  manifest = null,
  highLoadEvaluable = true,
}: UseSimulationParams): void {
  const candidate = useSimulationStore((s) => s.candidate);
  const calibration = useSimulationStore((s) => s.calibration);
  const isCalibrationLoading = useSimulationStore((s) => s.isCalibrationLoading);
  const retryToken = useSimulationStore((s) => s.retryToken);

  // UX §7.5 điều kiện 3 — bảng mã→tên chuẩn, dựng MỘT lần cho mỗi bộ ranh giới đã nạp.
  // `commune.geojson` đã ở trong bộ nhớ của App; đây không phải một lượt đọc mới.
  const communeNamesByCode = useMemo(() => {
    if (!communes?.features) return null;
    const map = new Map<string, string>();
    for (const f of communes.features) {
      const code = f.properties?.["commune_code"];
      const name = f.properties?.["commune_name"];
      if (typeof code === "string" && typeof name === "string" && name.trim().length > 0) {
        map.set(code, name.trim());
      }
    }
    return map;
  }, [communes]);

  // Load calibration whenever provinceCode changes. Chưa có manifest thì chưa biết mã
  // tỉnh — giữ trạng thái "đang nạp" thay vì fetch(undefined) rồi kết luận nhầm là F2
  // và xoá ứng viên khôi phục từ hash. Manifest có mà không có mã tỉnh (proxy) mới là
  // "không có hiệu chuẩn" thật.
  const manifestReady = Boolean(manifest);
  useEffect(() => {
    if (!manifestReady) {
      useSimulationStore.getState().setCalibrationLoading();
      return;
    }
    let cancelled = false;
    useSimulationStore.getState().setCalibrationLoading();
    fetchSimCalibration(provinceCode).then(
      (cal) => {
        if (!cancelled) useSimulationStore.getState().setCalibration(cal);
      },
      () => {
        if (!cancelled) useSimulationStore.getState().setCalibration(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [provinceCode, manifestReady]);

  // Run simulation whenever candidate or inputs change
  useEffect(() => {
    const store = useSimulationStore.getState();
    if (!candidate) {
      if (store.result) store.setResult(null, null);
      return;
    }

    // §14.2 — danh tính của lượt tính này. Mọi lối ghi kết quả bên dưới đều phải đi qua
    // `commit`, và `commit` chỉ ghi khi ứng viên hiện tại VẪN là ứng viên đã mở request.
    // Cờ `cancelled` một mình là chưa đủ: React có thể chạy cleanup SAU khi promise đã
    // resolve trong cùng một microtask queue, và khi ấy một kết quả cũ vẫn kịp ghi đè.
    const requestKey = candidateKeyOf(candidate)!;
    const isCurrent = () =>
      candidateKeyOf(useSimulationStore.getState().candidate) === requestKey;

    // Chưa biết hiệu chuẩn thì chưa kết luận gì (panel ở trạng thái "đang tính").
    if (isCalibrationLoading) return;

    // F2/F11 — không có hiệu chuẩn hợp lệ cho gói đang mở: `sim=` trong hash bị BỎ QUA
    // lặng lẽ (toggle cũng đã ẩn), không phải một thẻ lỗi.
    if (!calibration) {
      store.clearCandidate();
      return;
    }

    // Dữ liệu nền của App (nạp ngay lúc boot) chưa về thì đợi lượt render sau.
    if (!boundary || !communes || stations.length === 0) return;

    let cancelled = false;

    void (async () => {
      let gridInputs: GridCellSimInput[];
      let occMap: Awaited<ReturnType<typeof fetchOccupancySummary>>;
      try {
        // §2.2 — MỘT truy vấn siêu tập vùng tại thời điểm đặt; occupancy 30 ngày cache phiên.
        [gridInputs, occMap] = await Promise.all([
          fetchZoneCells(candidate),
          fetchOccupancySummary(),
        ]);
      } catch {
        // F10 — truy vấn hỏng: GIỮ vị trí và cho thử lại (§10.3). Bản cũ xoá luôn ứng
        // viên, nên nút "Thử lại" sẽ không còn gì để thử.
        if (!cancelled && isCurrent()) {
          useSimulationStore
            .getState()
            .failQuery("Không đọc được dữ liệu quanh vị trí này.");
        }
        return;
      }
      if (cancelled || !isCurrent()) return;

      const gridCellMap = new Map<string, GridCellLookup>();
      for (const c of gridInputs) {
        gridCellMap.set(c.h3_r8, {
          h3: c.h3_r8,
          evidenceGrade: c.evidence_grade_distance,
          communeCode: c.commune_code,
          communeName: c.commune_name,
        });
      }

      const adm = checkAdmission(candidate, boundary, gridCellMap, calibration, communes);
      if (!adm.ok) {
        // F1/F3 — TỪ CHỐI đặt: không giữ ứng viên nào lại (marker, vòng 5 km, `sim=`
        // trong hash đều phải biến mất), chỉ thông báo ở lại.
        if (isCurrent()) useSimulationStore.getState().rejectCandidate(adm.message);
        return;
      }

      const stationInputs: StationSimInput[] = stations.map((st) => ({
        station_code: st.stationCode ?? st.id,
        name: st.name,
        lat: st.lat,
        lng: st.lng,
        op_status: st.opStatus,
        access: st.access,
        scope: st.scope,
        n_ports: st.nPorts,
        power_kw_site: st.powerKwSite,
      }));

      const simResult = runSimulation({
        candidate,
        candidateCell: adm.candidateCell,
        communeKind: adm.communeKind,
        communeCode: adm.communeCode,
        communeName: adm.communeName,
        provinceName: manifest?.province?.province_name ?? null,
        gridCells: gridInputs,
        stations: stationInputs,
        occupancyMap: occMap,
        calibration,
        manifestExported: manifest?.exported_utc,
        isHighLoadEvaluable: highLoadEvaluable,
        isZoneTruncated: zoneTruncatedAt(candidate.lat, candidate.lng, 5000, boundary),
        communeNamesByCode,
      });

      if (!cancelled && isCurrent()) {
        useSimulationStore.getState().setResult(simResult, requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    candidate,
    calibration,
    isCalibrationLoading,
    boundary,
    stations,
    communes,
    communeNamesByCode,
    manifest,
    highLoadEvaluable,
    retryToken,
  ]);
}
