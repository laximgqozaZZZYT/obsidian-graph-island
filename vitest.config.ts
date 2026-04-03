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
        // Baseline: Cycle4R1 (3268 tests, +256 tests covering EmbeddedGraphRenderer/InteractionManager/NodeDetail/GVC/RoadNetworkBuilder/RenderPipeline/PanelWidgets)
        statements: 30.2,
        branches: 28.2,
        functions: 28.1,
        lines: 29.8,
      },
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
