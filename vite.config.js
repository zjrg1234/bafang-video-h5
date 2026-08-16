import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: "0.0.0.0",
    port: 5351,
    // open: true,
    proxy: {
      "/api": {
        // target:"http://124.221.39.181:8016",
        target:"http://124.221.39.181:7010",
        // target:"http://127.0.0.1:7001",
        changeOrigin: true,
        pathRewrite: {
          "^/api": "/api",
        },
      }
    },
  },
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
})
