import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync } from "fs";

// 读取 package.json 获取版本号
const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const VERSION = packageJson.version;

export default defineConfig({
  define: {
    // 注入版本号到全局变量
    __VERSION__: JSON.stringify(VERSION),
  },
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
    // 禁用 sourcemap 生成，避免其他项目引入时的解析错误
    sourcemap: false,
    // 禁用自动清理 dist 目录，避免删除类型声明文件
    emptyOutDir: false,
  },
});
