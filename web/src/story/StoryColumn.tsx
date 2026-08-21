import { useEffect, useMemo, useRef } from "react";

import { useIsDesktop } from "../components/atlas/use-desktop";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";

import { useStore } from "../state/store";
import { BeatBody, renderClaim } from "./StorySurface";
import { beatOf, renderableScenes, storyContext, type SceneId } from "./scenes";
import type { ResolveContext, StoryPackage } from "./resolve";
import type { ClaimTemplate } from "./spec";
import { Para } from "./parts";

/**
 * Cột cảnh — DESIGN.md §14c, PHASE7_STORY_MODE.md §5.
 *
 * 400px ở khe TRÁI, **THAY** cột đọc trong luồng: trong một cảnh không có bộ chọn trường,
 * vì cảnh chọn trường. Một rail radio bên cạnh một cảnh đang áp đặt trường là hai thứ tranh
 * nhau cùng một state, ngay trên màn hình.
 *
 * Cột KHÔNG sở hữu dữ liệu và KHÔNG đi lấy dữ liệu: nó nhận một `StoryPackage` từ `App`,
 * dựng mô hình một lần, rồi đưa xuống. Bản trước để mỗi thân cảnh tự `fetch`, và cái giá đo
 * được là ba trạng thái tải song song mà không cái nào biết cái nào — trong đó có một cái
 * hỏng im lặng (danh sách cặp tuyến biến mất hẳn vì state cục bộ được gieo từ một prop
 * không bao giờ nullish).
 */
export function StoryColumn({
  pkg,
}: {
  pkg: StoryPackage;
  /**
   * Thang của `station:occ` — CHÍNH object mà `App` dựng cho bản đồ, dock và panel (CR 4.1
   * §"exact scale object identity"). Cảnh là người dùng thứ TƯ của nó, không phải chủ của
   * một bản thứ hai.
   *
   * Nó đi kèm props chứ không nằm trong `StoryPackage`: gói là DỮ LIỆU cảnh đọc, thang là
   * một quyết định MÃ HOÁ. Trộn hai thứ thì `resolve.ts` — nơi được viết để không biết gì
   * về màu — sẽ phải mang một kiểu của `viz/`.
   */
}) {
  const scene = useStore((s) => s.scene);
  const beatId = useStore((s) => s.beat);
  const enterScene = useStore((s) => s.enterScene);
  const setBeat = useStore((s) => s.setBeat);
  // Màn hẹp (< 1024 px): cột cảnh là SHEET trái — DESIGN.md §3 đòi bản đồ toàn màn ở
  // một cột. Dùng CHÍNH cờ `readColumnOpen`: cột cảnh THAY cột đọc ở cùng khe (§14c),
  // nên nút bottom-nav "cột đọc" mở đúng bề mặt đang giữ khe ấy.
  const isDesktop = useIsDesktop();
  const sheetOpen = useStore((s) => s.readColumnOpen);
  const setSheetOpen = useStore((s) => s.setReadColumnOpen);
  const root = useRef<HTMLDivElement>(null);
  const blocks = useRef(new Map<SceneId, HTMLElement>());
  /** Cảnh mà lần cuộn tự động đang nhắm tới — xem `IntersectionObserver` bên dưới. */
  const scrollTarget = useRef<SceneId | null>(null);

  // `renderableScenes()` đọc biến module mà `App` vừa ghi cùng lúc với `pkg`, nên `pkg` là
  // khoá nhớ đúng cho cả hai — không phải một mảng mới mỗi lần render.
  const scenes = useMemo(() => renderableScenes(), [pkg]);

  const activeIdx = Math.max(
    0,
    scenes.findIndex((s) => s.id === scene),
  );

  const navigateToScene = (id: SceneId) => {
    scrollTarget.current = id;
    enterScene(id);
    scrollIntoView(blocks.current.get(id));
  };

  // Cuộn → cảnh. Trình duyệt đã biết phần tử nào đang trong khung; tự tính lại từ
  // `scrollTop` là chép lại việc đó, chậm hơn.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset["scene"] as SceneId | undefined;
          if (!id) continue;
          // Trong lúc một chuyến cuộn tự động đang bay qua các cảnh giữa đường, KHÔNG
          // nhận cảnh đang lướt qua. Cổng là "đã tới đích chưa", không phải một `setTimeout`
          // đoán độ dài chuyến cuộn — mà độ dài ấy do trình duyệt quyết và tỉ lệ với
          // khoảng cách, nên một hằng số thời gian sẽ sai ngay ở cú nhảy dài đầu tiên.
          if (scrollTarget.current !== null) {
            if (id !== scrollTarget.current) continue;
            scrollTarget.current = null;
          }
          if (id !== useStore.getState().scene) enterScene(id);
        }
      },
      { root: el, rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const node of blocks.current.values()) io.observe(node);
    return () => io.disconnect();
    // `isDesktop`/`sheetOpen` trong deps: sheet đóng là cây bị tháo, mở lại phải gắn lại observer.
  }, [enterScene, scenes, isDesktop, sheetOpen]);

  // Cảnh đổi mà KHÔNG do cột này gây ra — link dán tay, Back/Forward, một cảnh bị gỡ khỏi
  // danh sách dựng được — thì cột phải đi theo. Bản trước chỉ cuộn đúng một lần lúc gắn,
  // nên `#s=cung-lech` dán vào một câu chuyện đang mở để lại cột ở cảnh 3 trong khi bản đồ
  // đã ở cảnh 2, và người xem đọc một đoạn văn mô tả một mặt tô không có trên màn hình.
  useEffect(() => {
    if (!scene) return;
    if (scrollTarget.current !== null) return;
    const node = blocks.current.get(scene);
    if (!node) return;
    const el = root.current;
    if (!el) return;
    const mid = el.clientHeight / 2;
    const box = node.getBoundingClientRect();
    const rootBox = el.getBoundingClientRect();
    const already = box.top - rootBox.top <= mid && box.bottom - rootBox.top >= mid;
    if (already) return;
    scrollTarget.current = scene;
    node.scrollIntoView({ block: "start", behavior: "instant" });
    scrollTarget.current = null;
  }, [scene]);

  // Bàn phím: CHỈ mũi tên ngang và PageUp/PageDown.
  //
  // Mũi tên LÊN/XUỐNG cố tình không bị bắt: cột này cuộn được, và cuộn bằng bàn phím là
  // hành vi mặc định của trình duyệt mà người đọc bằng bàn phím đang dựa vào. Bản trước
  // `preventDefault` cả hai, nên một cú ArrowDown nhảy nguyên một cảnh (đo được 3.860 px)
  // thay vì cuộn vài dòng, và cú thứ tư rơi thẳng ra khỏi chế độ CÂU CHUYỆN.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      const i = scenes.findIndex((s) => s.id === useStore.getState().scene);
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        // Ở cảnh cuối thì KHÔNG làm gì. Rơi ra khỏi câu chuyện vì một phím mũi tên là một
        // chuyển trạng thái lớn do một cử chỉ rẻ — lối ra là cái nút, và nó luôn ở đó.
        if (i >= 0 && i < scenes.length - 1) {
          e.preventDefault();
          navigateToScene(scenes[i + 1]!.id);
        }
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (i > 0) {
          e.preventDefault();
          navigateToScene(scenes[i - 1]!.id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        enterScene(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterScene, scenes]);

  const body =
    scenes.length === 0 ? (
      <Para>
        Bộ dữ liệu đang mở không dựng được cảnh nào. Cảnh vắng mặt chứ không bị làm mờ —
        một bước chết trong một chuỗi là một ngõ cụt.
      </Para>
    ) : (
      <>
      <div className="sticky top-0 z-20 border-b border-hairline bg-panel/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-note font-semibold tracking-wider text-ink-muted">CÂU CHUYỆN</span>
            <span className="rounded border border-hairline bg-basemap px-1.5 py-0.5 text-note tabular-nums text-ink-2">
              {activeIdx + 1} / {scenes.length}
            </span>
          </div>
          <button
            onClick={() => enterScene(null)}
            title="Thoát chế độ CÂU CHUYỆN về BẢN ĐỒ (Esc)"
            className="flex cursor-pointer items-center gap-1 text-note text-ink-muted hover:text-ink hover:underline"
          >
            <span>Bản đồ</span>
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div className="flex gap-1.5 pb-2">
          {scenes.map((s, i) => (
            <button
              key={s.id}
              onClick={() => navigateToScene(s.id)}
              title={`${s.kicker}: ${s.title}`}
              aria-label={`${s.kicker}: ${s.title}`}
              className={`h-1.5 flex-1 cursor-pointer rounded-full transition-all ${
                scene === s.id ? "h-2 bg-c5" : i < activeIdx ? "bg-c3" : "bg-hairline hover:bg-ink-muted/40"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5 text-body">
          <button
            onClick={() => activeIdx > 0 && navigateToScene(scenes[activeIdx - 1]!.id)}
            disabled={activeIdx === 0}
            className={`flex items-center gap-1 rounded border border-hairline px-2 py-1 transition ${
              activeIdx === 0
                ? "cursor-not-allowed text-ink-muted opacity-30"
                : "cursor-pointer text-ink hover:bg-basemap"
            }`}
          >
            <span aria-hidden>←</span>
            <span>Trước</span>
          </button>

          <span className="max-w-[170px] truncate text-note font-medium text-ink" title={scenes[activeIdx]?.title}>
            {scenes[activeIdx]?.title}
          </span>

          <button
            onClick={() => activeIdx < scenes.length - 1 && navigateToScene(scenes[activeIdx + 1]!.id)}
            disabled={activeIdx >= scenes.length - 1}
            className={`flex items-center gap-1 rounded border border-hairline px-2 py-1 font-medium transition ${
              activeIdx >= scenes.length - 1
                ? "cursor-not-allowed text-ink-muted opacity-30"
                : "cursor-pointer bg-basemap/60 text-ink hover:bg-basemap"
            }`}
          >
            <span>Tiếp</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {scenes.map((s, i) => {
        const isActive = scene === s.id;
        const beat = beatOf(s.id, isActive ? beatId : null);
        return (
          <section
            key={s.id}
            data-scene={s.id}
            ref={(node) => {
              if (node) blocks.current.set(s.id, node);
              else blocks.current.delete(s.id);
            }}
            // `min-h-full` để mỗi cảnh chiếm trọn cột: dải ngưỡng ở giữa chỉ cắt qua đúng
            // một cảnh mỗi lúc, nên không có trạng thái "hai cảnh cùng đang hoạt động".
            className={`flex min-h-full flex-col border-b border-hairline ${
              isActive ? "" : "opacity-40"
            } transition-opacity duration-200`}
          >
            <div className="py-6">
              <header className="px-4 pb-3">
                <div className="flex items-baseline gap-2 text-note tracking-[0.14em] text-ink-muted">
                  <span className="font-semibold">{s.kicker}</span>
                  <span className="tabular-nums">
                    {i + 1}/{scenes.length}
                  </span>
                </div>
                <h2 className="pt-1 text-display font-semibold leading-tight">{s.title}</h2>
                <SceneClaim claim={s.claim} ctx={storyContext(s.id)} sceneId={s.id} />
              </header>

              {s.beats.length > 1 && (
                <div className="flex gap-px border-y border-hairline bg-hairline text-body">
                  {s.beats.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        if (!isActive) navigateToScene(s.id);
                        setBeat(b.id);
                      }}
                      className={`flex-1 cursor-pointer py-1.5 transition ${
                        isActive && beat.id === b.id
                          ? "bg-basemap font-semibold text-ink"
                          : "bg-panel text-ink-2 hover:text-ink"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}

              <BeatBody beat={beat} ctx={storyContext(s.id)} loading={pendingLabel(s.id, pkg)} />
            </div>
          </section>
        );
      })}

      <div className="border-t border-hairline bg-panel px-4 py-4">
        <button
          onClick={() => enterScene(null)}
          className="w-full cursor-pointer border border-hairline px-3 py-2 text-center text-title font-semibold transition hover:bg-basemap"
        >
          Mở trong BẢN ĐỒ →
        </button>
        <p className="pt-2 text-center text-body leading-snug text-ink-muted">
          Giữ nguyên trường, khung nhìn và lớp của cảnh đang xem — rail hiện ra và mọi thứ bấm được.
        </p>
      </div>
      </>
    );

  /* Dưới 1024 px cột cảnh là SHEET trái (DESIGN.md §3: màn hẹp là MỘT cột, bản đồ toàn
     màn). Bản cũ giữ 400 px inline ở mọi bề rộng — đo được bản đồ chỉ còn 360 px ở 760 px. */
  if (!isDesktop) {
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          className="flex h-full w-full flex-col border-r border-hairline bg-panel p-0 text-ink sm:w-[400px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Cột cảnh câu chuyện</SheetTitle>
          </SheetHeader>
          <div ref={root} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      ref={root}
      /* `border-r`, không `border-l`: cột này đứng ở khe TRÁI, đúng khe mà cột đọc chiếm
         ngoài chế độ CÂU CHUYỆN (§3h).

         KHÔNG bọc các `section` trong một div `flex-1`: `min-h-full` của chúng phân giải
         theo chiều cao của thẻ cha, và một div nội dung-tự-co làm mỗi cảnh phồng lên
         3.707 px trên một cột cao 1.481 px — đo được 78% mỗi cảnh là khoảng trắng. Các
         `section` phải là con TRỰC TIẾP của thẻ cuộn. */
      className="w-100 shrink-0 overflow-y-auto border-r border-hairline bg-panel"
    >
      {body}
    </aside>
  );
}

/** Luận điểm của cảnh — MỘT câu, và nó biến mất nếu số của nó chưa về (luật R5). */
function SceneClaim({
  claim,
  ctx,
  sceneId,
}: {
  claim: ClaimTemplate;
  ctx: ResolveContext | null;
  sceneId: string;
}) {
  if (!ctx) return null;
  const node = renderClaim(claim, ctx, sceneId);
  if (node === null) return null;
  return <p className="pt-2 text-title leading-relaxed text-ink-2">{node}</p>;
}

function scrollIntoView(node: HTMLElement | undefined): void {
  if (!node) return;
  const reduce =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({ block: "start", behavior: reduce ? "instant" : "smooth" });
}

/**
 * Cảnh này còn đang chờ mảnh dữ liệu nào — hay `null` khi đã đủ để nói.
 *
 * Từng cảnh chờ thứ khác nhau, và nói "đang đo" khi đã đủ số là cũng sai như nói "0" khi
 * chưa đo: cả hai đều mô tả sai trạng thái của màn hình.
 */
function pendingLabel(id: SceneId, pkg: StoryPackage): string | null {
  switch (id) {
    case "von-cuc":
      return pkg.demand ? null : "phân bố dân trên diện tích";
    case "cung-lech":
      return pkg.demand && pkg.communes ? null : "cung theo ô và theo xã";
    case "di-vong":
      return pkg.detour && pkg.roads ? null : "mạng đường và hệ số đi vòng";
    case "ngoai-2km":
      return pkg.opportunity ? null : "dân theo cự ly mạng đường";
    case "nhip-tuan":
      return pkg.occupancy ? null : "hồ sơ giờ của cả tuần";
    case "mot-quyet-dinh":
      return pkg.manifest && pkg.stations ? null : "cơ cấu công suất trạm";
    case "chua-biet":
      return pkg.manifest ? null : "số đo phủ của bộ dữ liệu";
  }
}
