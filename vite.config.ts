import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve iris-ui directly from its TypeScript source so no build step is needed.
      "iris-ui": path.resolve(__dirname, "../iris-ui/src"),
    },
  },
  server: {
    proxy: {
      // Proxy all /api/* calls to netvrk.nu, stripping the /api prefix.
      // This avoids CORS entirely in development.
      "/api/auth": {
        target: "https://netvrk.nu",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/auth/, ""),
      },
      "/api/cvr": {
        target: "https://netvrk.nu",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/cvr/, "/cvradapter"),
      },
      "/api/suggest": {
        target: "https://netvrk.nu",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/suggest/, "/suggest"),
      },
    },
  },
});
