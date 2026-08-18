import { useEffect, useRef } from "react";

import type { Manifest } from "../data/manifest";
import type { CommuneCollection } from "../data/queries";
import { useStore } from "../state/store";
import { SceneChuaBiet, SceneCungLech, SceneDiVong, SceneVonCuc } from "./bodies";
import { SCENES, type SceneId } from "./scenes";

/**
 * Cột cảnh — DESIGN.md §14c.
 *
 * 400px bên phải, **THAY** rail chứ không đứng cạnh: trong một cảnh không có bộ chọn
 * trường, vì cảnh chọn trường. Một rail radio bên cạnh một cảnh đang áp đặt trường là hai
 * thứ tranh nhau cùng một state, ngay trên màn hình.
 *
 * Chuyển cảnh bằng `IntersectionObserver` chứ không bằng nghe `scroll`: trình duyệt đã biết
 * phần tử nào đang trong khung, và tự tính lại từ `scrollTop` là chép lại việc đó, chậm hơn.
 * Không thêm dependency (§1).
 */
export function StoryColumn({
  communes,
  manifest,
}: {
  communes: CommuneCollection | null;
  manifest: Manifest | null;
}) {
  const scene = useStore((s) => s.scene);
  const enterScene = useStore((s) => s.enterScene);
  const root = useRef<HTMLDivElement>(null);
  const blocks = useRef(new Map<SceneId, HTMLElement>());

  // Cuộn → cảnh. Ngưỡng là một DẢI HẸP giữa cột (`rootMargin` cắt trên 45% và dưới 45%),
  // không phải "phần tử nào chiếm nhiều diện tích nhất": dải hẹp cho một điểm chuyển rõ
  // ràng, còn so diện tích thì hai cảnh dài ngắn khác nhau sẽ chuyển ở chỗ khác nhau.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset["scene"] as SceneId | undefined;
          if (id && id !== useStore.getState().scene) enterScene(id);
        }
      },
      { root: el, rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const node of blocks.current.values()) io.observe(node);
    return () => io.disconnect();
  }, [enterScene]);

  // Link mở thẳng vào một cảnh (`#s=di-vong`) phải CUỘN tới cảnh đó, nếu không cột đứng ở
  // đầu trong khi bản đồ đã ở cảnh C — và cái người xem đọc được sẽ mô tả sai cái họ nhìn.
  // `instant` chứ không `smooth`: đây là trạng thái khởi động, không phải một chuyển cảnh.
  useEffect(() => {
    if (!scene) return;
    blocks.current.get(scene)?.scrollIntoView({ block: "start", behavior: "instant" });
    // Chỉ lúc gắn. Cuộn theo mọi lần `scene` đổi sẽ đá nhau với chính người đang cuộn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside
      ref={root}
      /* `border-r`, không `border-l`: từ đợt 17/8/2026 cột này đứng ở khe TRÁI, đúng khe mà
         cột đọc chiếm ngoài chế độ CÂU CHUYỆN (§3h). Một hairline vẽ sai cạnh không hỏng
         layout — nó chỉ để cột trôi ra khỏi bản đồ, thứ mắt thấy trước khi hiểu vì sao. */
      className="w-100 shrink-0 overflow-y-auto border-r border-hairline bg-panel"
    >
      {SCENES.map((s, i) => (
        <section
          key={s.id}
          data-scene={s.id}
          ref={(node) => {
            if (node) blocks.current.set(s.id, node);
            else blocks.current.delete(s.id);
          }}
          // `min-h-full` để mỗi cảnh chiếm trọn cột: dải ngưỡng ở giữa chỉ cắt qua đúng
          // một cảnh mỗi lúc, nên không có trạng thái "hai cảnh cùng đang hoạt động".
          className={`flex min-h-full flex-col justify-center border-b border-hairline ${
            scene === s.id ? "" : "opacity-45"
          } transition-opacity`}
        >
          <div className="py-6">
            <header className="px-4 pb-3">
              <div className="flex items-baseline gap-2 text-note tracking-[0.14em] text-ink-muted">
                <span>{s.kicker}</span>
                <span className="tabular-nums">
                  {i + 1}/{SCENES.length}
                </span>
              </div>
              <h2 className="pt-1 text-display font-semibold leading-tight">{s.title}</h2>
              {/* MỘT câu — §3a. Đây là luận điểm, không phải đoạn tóm tắt. */}
              <p className="pt-2 text-title leading-relaxed text-ink-2">{s.claim}</p>
            </header>

            {s.id === "von-cuc" && <SceneVonCuc />}
            {s.id === "cung-lech" && <SceneCungLech communes={communes} />}
            {s.id === "di-vong" && <SceneDiVong manifest={manifest} />}
            {s.id === "chua-biet" && <SceneChuaBiet manifest={manifest} />}
          </div>
        </section>
      ))}

      {/* Lối ra, ở đáy — luật L2 của §14a. Nói rõ nó GIỮ LẠI cái gì, vì đó là toàn bộ giá
          trị của nút này: nếu thoát ra là về màn hình mặc định thì cảnh vừa xem chỉ là một
          đoạn phim, xem xong là mất. */}
      <div className="border-t border-hairline px-4 py-4">
        <button
          onClick={() => enterScene(null)}
          className="cursor-pointer border border-hairline px-3 py-1.5 text-title hover:bg-basemap"
        >
          Mở trong BẢN ĐỒ →
        </button>
        <p className="pt-2 text-body leading-snug text-ink-muted">
          Giữ nguyên trường, khung nhìn và lớp của cảnh đang xem — chỉ khác là rail hiện ra và
          mọi thứ bấm được.
        </p>
      </div>
    </aside>
  );
}
