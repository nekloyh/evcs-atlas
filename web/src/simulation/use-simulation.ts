/**
 * Phase 6 — Simulation Controller Hook (simulation/use-simulation.ts)
 *
 * Coordinates data loading, admission checks, and engine execution for candidate placement.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1, §2, §3
 */

import { useEffect } from "react";
import { useSimulationStore } from "./store";
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
      if (store.result) store.setResult(null, store.error);
      return;
    }

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
        // F10 — truy vấn hỏng: xoá ứng viên (layer bản đồ biến mất), giữ thông báo, cho thử lại.
        if (!cancelled) {
          useSimulationStore
            .getState()
            .rejectCandidate(
              "Không truy vấn được dữ liệu quanh vị trí này — đặt lại trạm để thử lần nữa.",
            );
        }
        return;
      }
      if (cancelled) return;

      const gridCellMap = new Map<string, GridCellLookup>();
      for (const c of gridInputs) {
        gridCellMap.set(c.h3_r8, {
          h3: c.h3_r8,
          evidenceGrade: c.evidence_grade_distance,
          communeCode: c.commune_code,
        });
      }

      const adm = checkAdmission(candidate, boundary, gridCellMap, calibration, communes);
      if (!adm.ok) {
        // F1/F3 — TỪ CHỐI đặt: không giữ ứng viên nào lại (marker, vòng 5 km, `sim=`
        // trong hash đều phải biến mất), chỉ thông báo ở lại.
        useSimulationStore.getState().rejectCandidate(adm.message);
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
        gridCells: gridInputs,
        stations: stationInputs,
        occupancyMap: occMap,
        calibration,
        manifestExported: manifest?.exported_utc,
        isHighLoadEvaluable: highLoadEvaluable,
        isZoneTruncated: zoneTruncatedAt(candidate.lat, candidate.lng, 5000, boundary),
      });

      if (!cancelled) {
        useSimulationStore.getState().setResult(simResult, null);
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
    manifest,
    highLoadEvaluable,
  ]);
}
