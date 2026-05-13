import { defineConfig } from "vite";

export default defineConfig({
  base: "/formulagame/",
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2020",
  },
  server: {
    port: 5173,
    open: true,
  },
});
