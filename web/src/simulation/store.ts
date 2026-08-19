/**
 * Phase 6 — Simulation Transient State Store (simulation/store.ts)
 *
 * Dedicated zustand store for local heuristic station placement and results.
 * Follows the strict isolation principle (§1.10): transient simulation state
 * is isolated from EntitySelection and measurement stores.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1.10, §3.1
 */

import { create } from "zustand";
import type { CandidatePoint, SimCalibration, SimulationResult } from "./types";

export interface SimulationState {
  candidate: CandidatePoint | null;
  placementMode: boolean;
  result: SimulationResult | null;
  error: string | null;
  calibration: SimCalibration | null;
  isCalibrationLoading: boolean;

  setPlacementMode: (active: boolean) => void;
  setCandidate: (candidate: CandidatePoint | null) => void;
  clearCandidate: () => void;
  /** F1/F3/F10 — đặt bị TỪ CHỐI: xoá ứng viên (marker + `sim=` biến mất) nhưng giữ thông báo. */
  rejectCandidate: (message: string) => void;
  setCalibrationLoading: () => void;
  setCalibration: (cal: SimCalibration | null) => void;
  setResult: (result: SimulationResult | null, error?: string | null) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  candidate: null,
  placementMode: false,
  result: null,
  error: null,
  calibration: null,
  // true từ đầu: "chưa xác định được hiệu chuẩn" — nếu khởi tạo false, effect chạy mô
  // phỏng ở render đầu tiên sẽ tưởng là F2 (không có hiệu chuẩn) và xoá lặng ứng viên
  // vừa khôi phục từ hash trước khi fetch kịp bắt đầu.
  isCalibrationLoading: true,

  setPlacementMode: (placementMode) =>
    set({
      placementMode,
      ...(placementMode ? { error: null } : {}),
    }),

  setCandidate: (candidate) =>
    set((state) => {
      // Cùng toạ độ thì giữ nguyên tham chiếu — hashchange lặp lại không được phép kích
      // tính lại một kết quả tất định (§1.10) chỉ vì object mới.
      if (
        candidate &&
        state.candidate &&
        state.candidate.lat === candidate.lat &&
        state.candidate.lng === candidate.lng
      ) {
        return { placementMode: false };
      }
      return {
        candidate,
        placementMode: false,
        error: null,
        ...(candidate ? {} : { result: null }),
      };
    }),

  clearCandidate: () =>
    set({
      candidate: null,
      placementMode: false,
      result: null,
      error: null,
    }),

  rejectCandidate: (message) =>
    set({
      candidate: null,
      placementMode: false,
      result: null,
      error: message,
    }),

  setCalibrationLoading: () => set({ isCalibrationLoading: true }),

  setCalibration: (calibration) =>
    set({
      calibration,
      isCalibrationLoading: false,
    }),

  setResult: (result, error = null) =>
    set({
      result,
      error: error ?? null,
    }),
}));
