
let __unconfig_data;
let __unconfig_stub = function (data = {}) { __unconfig_data = data };
__unconfig_stub.default = (data = {}) => { __unconfig_data = data };
import { defineConfig } from 'vite';
import { resolve } from 'path';

const __unconfig_default =  defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'OpenIMWebSocket',
      fileName: (format) => `openim-websocket.${format}.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: ['ws'],
      output: {
        globals: {
          ws: 'ws'
        },
        format: 'es'
      }
    }
  }
}); 
if (typeof __unconfig_default === "function") __unconfig_default(...[{"command":"serve","mode":"development"}]);export default __unconfig_data;