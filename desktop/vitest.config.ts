import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const desktopModules = path.join(desktopDir, "node_modules");

export default defineConfig({
  plugins: [react()],
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
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.join(desktopDir, "tests", "setup.ts")],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    css: false,
  },
});
