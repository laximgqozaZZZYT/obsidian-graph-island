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
        // Ratchet: floor to 1 decimal of actual coverage
        statements: 53.9,
        branches: 47.8,
        functions: 51.5,
        lines: 54.3,

      },
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
