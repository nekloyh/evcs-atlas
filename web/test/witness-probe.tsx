/**
 * Dụng cụ đo cho witness Phase 10 (`docs/qa/phase10/run_witness.py`). KHÔNG phải test, và
 * KHÔNG có file nào trong `src/` import nó — nên nó không nằm trong bundle sản phẩm.
 *
 * Vì sao phải là một file chứ không phải một chuỗi trong `Runtime.evaluate`: JS chạy qua
 * CDP là JS TRẦN, nên `import("react-dom/client")` ở đó ném "Failed to resolve module
 * specifier". Chỉ module đi qua bộ biến đổi của Vite mới giải được specifier trần. Đặt ở
 * `web/test/` (không phải `src/`) để Vite phục vụ được nó mà không ai vô tình import.
 *
 * Cả hai dụng cụ dưới đây đều KHÔNG chạm mã sản phẩm: một cái dựng root React riêng, một
 * cái vá prototype của thư viện từ bên ngoài. Không có cửa hậu nào được mở trong `src/`.
 */

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";

import { AppErrorBoundary } from "../src/AppErrorBoundary";

/**
 * AT10-1 — tiêm một exception RENDER thật vào một cây React thật, đọc lại màn hình.
 *
 * Root riêng chứ không phá app đang chạy: phép đo cần chứng minh boundary biến lỗi thành
 * một thông điệp đọc được, không cần chứng minh nó làm thế trong khi giết màn hình chính.
 */
export async function crashProbe(message: string): Promise<{ text: string; alert: boolean; html: string }> {
  const host = document.createElement("div");
  host.id = "evcs-crash-probe";
  document.body.appendChild(host);
  const Boom = () => {
    throw new Error(message);
  };
  const root = createRoot(host);
  // React in lại lỗi ra console dù boundary đã hứng; tắt trong đúng cửa sổ này để log của
  // witness không lẫn một "lỗi" mà chính witness gây ra.
  const quiet = console.error;
  console.error = () => {};
  root.render(createElement(AppErrorBoundary, null, createElement(Boom)));
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.error = quiet;
  const out = {
    text: host.textContent ?? "",
    alert: host.querySelector('[role="alert"]') !== null,
    html: host.innerHTML.slice(0, 400),
  };
  root.unmount();
  host.remove();
  return out;
}

interface CameraCall {
  method: "easeTo" | "jumpTo" | "flyTo";
  pitch: number | null;
}

declare global {
  interface Window {
    __evcsCamera?: CameraCall[];
  }
}

/**
 * AT10-4 — ghi lại app gọi phương thức camera NÀO.
 *
 * Đếm khung hình rAF đã bị bác một lần: dưới SwiftShader headless, `easeTo(500ms)` chỉ
 * kịp 2 khung còn nhiễu nền là 7 — phép đo không phân biệt được hai nhánh. Thứ phân biệt
 * được là chính lời gọi: nhánh reduced-motion phải gọi `jumpTo`, nhánh thường gọi `easeTo`.
 *
 * Vá prototype của `maplibre-gl` từ ngoài, sau khi app đã dựng map: cùng một instance
 * module (Vite phục vụ một bản duy nhất), nên map đang sống kế thừa bản đã vá.
 */
export function tapCamera(): number {
  if (!window.__evcsCamera) {
    window.__evcsCamera = [];
    const proto = maplibregl.Map.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const method of ["easeTo", "jumpTo", "flyTo"] as const) {
      const original = proto[method]!;
      proto[method] = function (this: unknown, ...args: unknown[]) {
        const first = args[0] as { pitch?: number } | undefined;
        window.__evcsCamera!.push({ method, pitch: first?.pitch ?? null });
        return original.apply(this, args);
      };
    }
  }
  window.__evcsCamera.length = 0;
  return 0;
}

/** Đọc và xoá sổ ghi camera. */
export function readCamera(): CameraCall[] {
  const out = [...(window.__evcsCamera ?? [])];
  if (window.__evcsCamera) window.__evcsCamera.length = 0;
  return out;
}
