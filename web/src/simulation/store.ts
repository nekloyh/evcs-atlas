/**
 * Phase 6 — Simulation Transient State Store (simulation/store.ts)
 *
 * Dedicated zustand store for local heuristic station placement and results.
 * Follows the strict isolation principle (§1.10): transient simulation state
 * is isolated from EntitySelection and measurement stores.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1.10, §3.1
 *           docs/UX_SIMULATION_REDESIGN_SPEC.md §14.1, §14.2, §14.3, §16.3
 */

import { create } from "zustand";
import type { CandidatePoint, SimCalibration, SimulationResult } from "./types";

/**
 * UX §14.2 — khoá gắn một kết quả với ĐÚNG vị trí đã sinh ra nó.
 *
 * Năm chữ số vì đó là độ chính xác của wire format `sim=<lat5>,<lng5>` (§14.5): hai toạ độ
 * cùng làm tròn về một hash là cùng một ứng viên, nên chúng phải là cùng một khoá — nếu
 * không, một lượt reload sẽ tự thấy mình "khác vị trí" và tính lại một kết quả giống hệt.
 */
export function candidateKeyOf(c: CandidatePoint | null): string | null {
  return c ? `${c.lat.toFixed(5)},${c.lng.toFixed(5)}` : null;
}

/**
 * Vị trí đến từ đâu — §14.6 phân biệt hai đường vào bằng đúng cờ này:
 *  · `user`  = người vừa bấm lên bản đồ ⇒ khi kết quả sẵn sàng thì ĐƯA tiêu điểm về heading;
 *  · `hash`  = deep link lúc boot hoặc Back/Forward ⇒ KHÔNG được cướp tiêu điểm của trang.
 */
export type CandidateOrigin = "user" | "hash";
export type SimulationErrorKind = "admission" | "query";

export interface SimulationState {
  candidate: CandidatePoint | null;
  candidateOrigin: CandidateOrigin;
  placementMode: boolean;
  result: SimulationResult | null;
  /** Khoá của ứng viên đã sinh ra `result`. Panel chỉ in số khi nó khớp ứng viên hiện tại. */
  resultKey: string | null;
  error: string | null;
  /** Phân biệt lỗi vị trí F1/F3 với lỗi truy vấn F10 để CTA không hứa một thao tác vô hiệu. */
  errorKind: SimulationErrorKind | null;
  calibration: SimCalibration | null;
  isCalibrationLoading: boolean;
  /** UX §14.4 — mã xã đang được rê/tiêu điểm trong danh sách địa danh. Không vào hash. */
  focusedCommune: string | null;
  /** UX §16.3 — mỗi lần bấm "Thử lại" là một request THẬT, không phải một lần đọc cache. */
  retryToken: number;

  setPlacementMode: (active: boolean) => void;
  setCandidate: (candidate: CandidatePoint | null, origin?: CandidateOrigin) => void;
  clearCandidate: () => void;
  /** F1/F3 — đặt bị TỪ CHỐI: xoá ứng viên, giữ thông báo, và GIỮ chế độ đặt để chọn lại. */
  rejectCandidate: (message: string) => void;
  /** F10 — truy vấn hỏng: GIỮ vị trí (để còn thử lại), bỏ mọi số của lượt hỏng. */
  failQuery: (message: string) => void;
  retry: () => void;
  setCalibrationLoading: () => void;
  setCalibration: (cal: SimCalibration | null) => void;
  setResult: (result: SimulationResult | null, resultKey: string | null) => void;
  setFocusedCommune: (communeCode: string | null) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  candidate: null,
  candidateOrigin: "hash",
  placementMode: false,
  result: null,
  resultKey: null,
  error: null,
  errorKind: null,
  calibration: null,
  // true từ đầu: "chưa xác định được hiệu chuẩn" — nếu khởi tạo false, effect chạy mô
  // phỏng ở render đầu tiên sẽ tưởng là F2 (không có hiệu chuẩn) và xoá lặng ứng viên
  // vừa khôi phục từ hash trước khi fetch kịp bắt đầu.
  isCalibrationLoading: true,
  focusedCommune: null,
  retryToken: 0,

  setPlacementMode: (placementMode) =>
    set({
      placementMode,
      ...(placementMode ? { error: null } : {}),
      ...(placementMode ? { errorKind: null } : {}),
    }),

  setCandidate: (candidate, origin = "hash") =>
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
      // §14.2 — vị trí đổi thì MỌI số của vị trí cũ biến mất NGAY trong cùng một lượt set.
      // Bản cũ giữ `result` lại cho tới khi truy vấn mới về, nên có một quãng thật sự dài
      // (một lượt DuckDB) mà tiêu đề nói xã mới còn các con số vẫn của xã cũ.
      return {
        candidate,
        candidateOrigin: candidate ? origin : state.candidateOrigin,
        placementMode: false,
        error: null,
        errorKind: null,
        result: null,
        resultKey: null,
        focusedCommune: null,
      };
    }),

  clearCandidate: () =>
    set({
      candidate: null,
      placementMode: false,
      result: null,
      resultKey: null,
      error: null,
      errorKind: null,
      focusedCommune: null,
    }),

  rejectCandidate: (message) =>
    set({
      candidate: null,
      // §10.11 — "giữ placement mode để chọn lại": vị trí bị từ chối là một thao tác CHƯA
      // xong, nên đường đi tiếp phải còn mở sẵn thay vì bắt bấm lại nút ở nav rail.
      placementMode: true,
      result: null,
      resultKey: null,
      error: message,
      errorKind: "admission",
      focusedCommune: null,
    }),

  failQuery: (message) =>
    set({
      // §16.3 — khác hẳn F1/F3: vị trí vẫn hợp lệ, chỉ có lượt đọc dữ liệu hỏng. Giữ ứng
      // viên thì "Thử lại" mới có thứ để thử; bỏ `result` thì bản đồ không còn khoanh vùng
      // của một lượt tính đã hỏng.
      result: null,
      resultKey: null,
      error: message,
      errorKind: "query",
      focusedCommune: null,
    }),

  retry: () => set((s) => ({ error: null, errorKind: null, retryToken: s.retryToken + 1 })),

  setCalibrationLoading: () => set({ isCalibrationLoading: true }),

  setCalibration: (calibration) =>
    set({
      calibration,
      isCalibrationLoading: false,
    }),

  setResult: (result, resultKey) => set({ result, resultKey, error: null, errorKind: null }),

  setFocusedCommune: (focusedCommune) => set({ focusedCommune }),
}));
