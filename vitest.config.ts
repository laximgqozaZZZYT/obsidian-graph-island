import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/views/canvas2d/**"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        // Baseline: v0.6.1 (2885 tests, cycle220 computeAutoFitTransform + autoFitView minScale relaxation)
        statements: 29.4,
        branches: 27.5,
        functions: 27.2,
        lines: 29.0,
      },
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
