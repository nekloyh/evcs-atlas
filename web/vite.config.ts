import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// KHÔNG bật COOP/COEP ở đây. Xem DESIGN.md §1a: tile của OpenFreeMap có CORS nhưng
// không có Cross-Origin-Resource-Policy, nên `require-corp` sẽ chặn tile. Ta dùng
// bundle `eh` (đơn luồng) của duckdb-wasm, không cần SharedArrayBuffer.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
});
