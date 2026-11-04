import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const desktopModules = path.join(desktopDir, "node_modules");

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.join(desktopDir, "src"),
      "@ui": path.resolve(desktopDir, "..", "components"),
      "@lib": path.resolve(desktopDir, "..", "lib"),
      "@shared": path.join(desktopDir, "shared"),
      react: path.join(desktopModules, "react"),
      "react-dom": path.join(desktopModules, "react-dom"),
      "lucide-react": path.join(desktopModules, "lucide-react"),
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
