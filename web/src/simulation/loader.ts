/**
 * Phase 6 — Simulation Calibration Loader (simulation/loader.ts)
 *
 * Fetches, validates, and caches province simulation calibration.
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §2.3, §5 F2
 */

import { dataPath } from "../data/province";
import type { SimCalibration } from "./types";

export const BAND_NAMES = [
  "200-500",
  "500-1000",
  "1000-2000",
  "2000-3000",
  "3000-5000",
  "5000-inf",
] as const;

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Hợp đồng §2.3 kiểm ở BIÊN nạp: đủ 6 dải với n/med/p90 hữu hạn, `near` là null hoặc đủ
 * ba số, `validation` đủ ba số, `valid === true`. File sai hình dạng bị đối xử đúng như
 * file vắng (F2) — nhờ đó client KHÔNG cần một hằng dự phòng nào (spec cấm hard-code).
 */
export function validateCalibration(data: unknown): SimCalibration | null {
  if (!data || typeof data !== "object") return null;
  const d = data as SimCalibration;
  if (d.valid !== true) return null;
  if (!finite(d.version)) return null;
  if (!d.bands || typeof d.bands !== "object") return null;
  for (const name of BAND_NAMES) {
    const b = d.bands[name];
    if (!b || !finite(b.n) || !finite(b.med) || !finite(b.p90)) return null;
  }
  if (d.near !== null) {
    const nr = d.near;
    if (!nr || !finite(nr.n) || !finite(nr.net_p50) || !finite(nr.net_p90)) return null;
  }
  const v = d.validation;
  if (!v || !finite(v.n) || !finite(v.within_20pct) || !finite(v.upper_miss)) return null;
  return d;
}

const calibrationCache = new Map<string, SimCalibration | null>();

/**
 * `null` khi không biết mã tỉnh (toàn quốc, proxy) — KHÔNG mặc định về "01": hằng Hà Nội
 * làm dự phòng là đúng thứ HAN_CHE.md cấm, và F11 cấm mô phỏng ngoài gói tỉnh r8.
 */
export async function fetchSimCalibration(
  provinceCode?: string | null,
): Promise<SimCalibration | null> {
  if (!provinceCode) return null;
  const code = provinceCode;
  if (calibrationCache.has(code)) {
    return calibrationCache.get(code) ?? null;
  }

  // Gói tỉnh (`#tinh=NN`) mang file ngay trong gói; bộ Hà Nội GỐC (data root, cùng
  // snapshot trạm 2026-07-29) không có bản sao cục bộ nên đọc từ `p/<code>/`.
  const paths = [
    dataPath("sim_calibration.json"),
    `data/p/${code}/sim_calibration.json`,
  ];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const cal = validateCalibration(await res.json());
        if (cal && cal.province_code === code) {
          calibrationCache.set(code, cal);
          return cal;
        }
      }
    } catch {
      // thử đường dẫn kế tiếp
    }
  }

  calibrationCache.set(code, null);
  return null;
}
