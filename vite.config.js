import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [vue()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    server: {
      port: 5173,
      host: true,

      proxy: {
        "/api": {
          target: env.VITE_API_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true,
          secure: false,
          timeout: 10 * 60 * 1000,
        },

        "/uploads": {
          target: env.VITE_API_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true,
          secure: false,
          configure: (proxy, options) => {
            proxy.on("proxyRes", (proxyRes, req, res) => {
              res.setHeader("Cache-Control", "public, max-age=31536000");
            });
          },
        },
      },

      hmr: {
        overlay: true,
      },
    },

    build: {
      outDir: "dist",
      sourcemap: mode === "development",
      assetsDir: "assets",
      assetsInlineLimit: 4096,

      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              // ✅ 更细致的分包
              if (id.includes("md-editor-v3")) {
                return "editor-vendor";
              }
              if (
                id.includes("vue") ||
                id.includes("pinia") ||
                id.includes("router")
              ) {
                return "vue-vendor";
              }
              if (id.includes("element-plus") || id.includes("vant")) {
                return "ui-vendor";
              }
              if (id.includes("echarts")) {
                return "chart-vendor";
              }
              if (id.includes("axios") || id.includes("lodash")) {
                return "utils-vendor";
              }
              // 其他依赖
              return "vendor";
            }
          },

          chunkFileNames: "assets/js/[name]-[hash].js",
          entryFileNames: "assets/js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return "assets/css/[name]-[hash][extname]";
            }
            if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)$/i.test(assetInfo.name)) {
              return "assets/media/[name]-[hash][extname]";
            }
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name)) {
              return "assets/images/[name]-[hash][extname]";
            }
            return "assets/[name]-[hash][extname]";
          },
        },
      },

      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: mode !== "development",
          drop_debugger: true,
        },
      },

      // ✅ 提高限制，减少警告
      chunkSizeWarningLimit: 2000,
    },

    // ✅ 优化依赖预构建
    optimizeDeps: {
      include: [
        "vue",
        "vue-router",
        "pinia",
        "axios",
        "md-editor-v3", // ✅ 添加
        "@vueuse/core",
        "dayjs",
      ],
      // ✅ 排除有问题的包
      exclude: ["@kangc/v-md-editor"],
    },

    define: {
      __APP_VERSION__: JSON.stringify(env.VITE_APP_VERSION || "1.0.0"),
      __APP_ENV__: JSON.stringify(env.VITE_APP_ENV || "development"),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  };
});
