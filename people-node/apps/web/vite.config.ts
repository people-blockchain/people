import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.NODE_API_URL ?? "http://127.0.0.1:4001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/ws": {
        target: process.env.NODE_API_URL ?? "http://127.0.0.1:4001",
        ws: true,
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.NODE_API_URL ?? "http://127.0.0.1:4001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/ws": {
        target: process.env.NODE_API_URL ?? "http://127.0.0.1:4001",
        ws: true,
        changeOrigin: true
      }
    }
  }
});
