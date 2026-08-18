import * as React from "react";

/** Ngưỡng "màn rộng" của toàn app — §3g. Một con số, một chỗ. */
export const DESKTOP_MIN_PX = 1024;

/**
 * Màn có đủ rộng cho bố cục hai cột không.
 *
 * Ba bản sao của cùng đoạn `matchMedia` này từng sống ở `AtlasInspector`, `CompareDock` và
 * `FloatingWorkspace`, và một trong ba dùng `resize` thay vì `matchMedia` — tức ba bề mặt
 * cạnh nhau có thể bất đồng về việc màn hình đang rộng hay hẹp trong cùng một khung hình.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= DESKTOP_MIN_PX,
  );

  React.useEffect(() => {
    const media = window.matchMedia(`(min-width: ${DESKTOP_MIN_PX}px)`);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return isDesktop;
}
