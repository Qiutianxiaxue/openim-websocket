import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "OpenIMWebSocket",
      fileName: (format) => {
        if (format === "cjs") {
          return "openim-websocket.cjs";
        }
        return `openim-websocket.${format}.js`;
      },
      formats: ["es", "umd", "cjs"],
    },
    rollupOptions: {
      external: ["ws"],
      output: {
        globals: {
          ws: "ws",
        },
        // 为 CJS 格式禁用压缩
        compact: false,
      },
    },
    // 禁用整体压缩
    minify: false,
    // 添加 sourcemap
    sourcemap: true,
    // 禁用自动清理 dist 目录，避免删除类型声明文件
    emptyOutDir: false,
  },
});
