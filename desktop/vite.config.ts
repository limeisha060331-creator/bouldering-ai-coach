import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(desktopDir, "src"),
      "@lib": path.resolve(desktopDir, "..", "lib"),
      "@shared": path.join(desktopDir, "shared"),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    fs: {
      allow: [path.resolve(desktopDir, "..")],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome122",
    sourcemap: false,
  },
});
