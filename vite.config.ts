import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env / .env.local etc. so we can read them in the config itself.
  const env = loadEnv(mode, process.cwd(), "");

  // CVR adapter target — override in .env.local for local development:
  //   CVR_TARGET=http://localhost:5039
  //   CVR_REWRITE=    (leave blank to keep /api/cvr path as-is)
  const cvrTarget = env.CVR_TARGET ?? "https://netvrk.nu";
  const cvrLocalDev = !!env.CVR_TARGET;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // Resolve iris-ui directly from its TypeScript source so no build step is needed.
        "iris-ui": path.resolve(__dirname, "../iris-ui/src"),
      },
    },
    server: {
      proxy: {
        "/api/auth": {
          target: "https://netvrk.nu",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/auth/, ""),
        },
        "/api/cvr": {
          target: cvrTarget,
          changeOrigin: true,
          // Production proxy: /api/cvr/123 → https://netvrk.nu/cvradapter/123
          // Local dev proxy:  /api/cvr/123 → http://localhost:5039/api/CvrAdapter/123
          rewrite: cvrLocalDev
            ? (p) => p.replace(/^\/api\/cvr/, "/api/CvrAdapter")
            : (p) => p.replace(/^\/api\/cvr/, "/cvradapter"),
        },
        "/api/suggest": {
          target: "https://netvrk.nu",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/suggest/, "/suggest"),
        },
        "/api/AiReport": {
          target: cvrTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
