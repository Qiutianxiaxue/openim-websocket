import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "OpenIMWebSocket",
      fileName: (format) => `openim-websocket.${format}.js`,
      formats: ["es", "umd", "cjs"],
    },
    rollupOptions: {
      external: ["ws"],
      output: {
        globals: {
          ws: "ws",
        },
      },
    },
  },
});
