/**
 * NẠP FILE — nút chọn file + vùng thả cho cả cửa sổ.
 *
 * ── HAI LỐI VÀO, MỘT ĐƯỜNG XỬ LÝ ─────────────────────────────────────────────────────
 *
 * Kéo-thả là thao tác người ta thử ĐẦU TIÊN với một bản đồ, và nó vô hình: không có gì
 * trên màn hình nói rằng thả được. Nên vẫn phải có một nút. Ngược lại, chỉ có nút thì thao
 * tác tự nhiên nhất lại rơi vào hành vi mặc định của trình duyệt — **mở file đó thay cho
 * trang**, tức là mất luôn mọi tập đang nạp trong tab. Đó không phải một bất tiện nhỏ ở
 * đây: tập nạp tay chỉ sống trong RAM, nên một lần thả trượt là mất trắng.
 *
 * Vì thế `dragover`/`drop` bắt ở cấp `window` và luôn `preventDefault`, kể cả khi thả
 * trượt ra ngoài khung: chặn hành vi mặc định là việc chính, còn khung viền chỉ là chỉ báo.
 *
 * ── BỘ ĐẾM `sau`, KHÔNG PHẢI MỘT CỜ BOOLEAN ──────────────────────────────────────────
 *
 * `dragenter`/`dragleave` bắn cho MỌI phần tử con mà con trỏ đi qua, nên một cờ bật/tắt sẽ
 * nhấp nháy liên tục khi rê qua bản đồ. Đếm vào−ra và chỉ tắt ở 0 là cách duy nhất đúng.
 */

import { useEffect, useRef, useState } from "react";

/** Đuôi file đọc được — cùng danh sách với nhánh rẽ ở `ProxyApp.napFiles`. */
export const DUOI = ".geojson,.json,.parquet";

export interface NapFileProps {
  onFiles: (files: File[]) => void;
  /** tên file đang đọc, hoặc `null` — khoá nút lại để không chồng hai lần nạp */
  dangNap: string | null;
}

export function NapFile({ onFiles, dangNap }: NapFileProps) {
  const [treo, setTreo] = useState(false);
  const sau = useRef(0);

  useEffect(() => {
    const lay = (e: DragEvent): File[] => [...(e.dataTransfer?.files ?? [])];
    const over = (e: DragEvent) => e.preventDefault();
    const vao = (e: DragEvent) => {
      e.preventDefault();
      if (++sau.current === 1) setTreo(true);
    };
    const ra = () => {
      if (--sau.current <= 0) {
        sau.current = 0;
        setTreo(false);
      }
    };
    const tha = (e: DragEvent) => {
      e.preventDefault();
      sau.current = 0;
      setTreo(false);
      const f = lay(e);
      if (f.length) onFiles(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", vao);
    window.addEventListener("dragleave", ra);
    window.addEventListener("drop", tha);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", vao);
      window.removeEventListener("dragleave", ra);
      window.removeEventListener("drop", tha);
    };
  }, [onFiles]);

  return (
    <>
      <label
        className={`cursor-pointer border border-hairline px-2 py-0.5 text-[11px] uppercase tracking-wide ${
          dangNap ? "text-ink-muted" : "text-ink-2 hover:bg-basemap"
        }`}
        title="Đọc ngay trong trình duyệt — file KHÔNG được gửi đi đâu và KHÔNG ghi xuống đĩa"
      >
        {dangNap ? `đang đọc ${dangNap}…` : "＋ nạp file"}
        <input
          type="file"
          accept={DUOI}
          multiple
          disabled={!!dangNap}
          className="hidden"
          onChange={(e) => {
            const f = [...(e.target.files ?? [])];
            // Xoá value để thả LẠI cùng một file sau khi sửa nó vẫn kích hoạt `change` —
            // đây đúng là vòng lặp của màn hình này (sửa luật → xuất lại → xem lại).
            e.target.value = "";
            if (f.length) onFiles(f);
          }}
        />
      </label>

      {treo && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-panel/80">
          <div className="border-2 border-dashed border-ink-muted px-10 py-8 text-center">
            <div className="text-[15px] font-semibold">Thả file vào đây</div>
            <div className="mt-1 text-[12px] text-ink-muted">
              .geojson · .parquet — đọc trong tab, không gửi đi đâu
            </div>
          </div>
        </div>
      )}
    </>
  );
}
