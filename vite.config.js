import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "demo" ? "./" : "/",
  define: { __DEMO__: JSON.stringify(mode === "demo") },
  build: { chunkSizeWarningLimit: 1500, sourcemap: false },
  server: { host: "127.0.0.1", proxy: { "/api": { target: "http://127.0.0.1:4317", headers: { host: "127.0.0.1:4317" } } } },
}));
