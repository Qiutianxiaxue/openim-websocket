import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'OpenIMWebSocket',
      fileName: 'openim-websocket',
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: ['ws'],
      output: {
        globals: {
          ws: 'ws'
        }
      }
    }
  }
}); 