import { Component, type ReactNode } from "react";

/**
 * Lưới an toàn cuối cùng của cả cây React — trước Phase 10 không tồn tại: một exception
 * render bất kỳ (kể cả từ một model chart gặp ca biên) unmount cả app thành màn hình
 * trắng vĩnh viễn, không thông điệp. Boundary này KHÔNG thay các trạng thái lỗi theo
 * surface (banner `role="alert"` của Workspace vẫn là nơi lỗi fetch đổ về) — nó chỉ hứng
 * những gì không surface nào hứng.
 *
 * Không dùng token Tailwind ở đây: nếu CSS chết là một phần của sự cố, thông điệp vẫn
 * phải đọc được. Inline style là có chủ đích.
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Giữ dấu vết cho người mở DevTools — thông điệp trên màn hình cố ý ngắn.
    console.error("[evcs] render crash:", error);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: "36rem",
          margin: "4rem auto",
          padding: "0 1.5rem",
          color: "#1f2320",
        }}
      >
        <h1 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          Ứng dụng gặp lỗi không phục hồi được
        </h1>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
          {this.state.error.message}
        </p>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
          <a href={`${location.pathname}${location.hash}`} onClick={() => location.reload()}>
            Tải lại trang
          </a>{" "}
          — nếu vẫn lỗi, xoá phần sau dấu <code>#</code> trên thanh địa chỉ rồi thử lại.
        </p>
      </div>
    );
  }
}
