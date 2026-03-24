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
        // Baseline: v0.5.1 (2394 tests, cycle184)
        statements: 28.9,
        branches: 27.5,
        functions: 25.7,
        lines: 28.6,
      },
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
