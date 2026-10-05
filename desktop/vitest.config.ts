import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(desktopDir, "src"),
      "@lib": path.resolve(desktopDir, "..", "lib"),
      "@shared": path.join(desktopDir, "shared"),
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
