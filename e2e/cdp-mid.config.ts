import { defineConfig } from "@playwright/test";

/**
 * Mid-tier test suite — 16 files covering all major feature areas.
 * Use for thorough validation without running the full 231-file suite.
 * Smoke (8 files): use cdp-smoke.config.ts
 * Full (231 files): use cdp-e2e.config.ts
 */
export default defineConfig({
  testDir: "./",
  testMatch: [
    "cdp-e2e-comprehensive-30.spec.ts",
    "cdp-e2e-settings-coverage.spec.ts",
    "cdp-e2e-arrangement-verify.spec.ts",
    "cdp-e2e-cycle86-groupby-collapse.spec.ts",
    "cdp-e2e-cycle86-search-filter.spec.ts",
    "cdp-e2e-all-edges-test.spec.ts",
    "cdp-e2e-cycle86-export.spec.ts",
    "cdp-e2e-cycle91-viewmode-ringchart.spec.ts",
    "cdp-e2e-cycle80-keyboard-shortcuts.spec.ts",
    "cdp-e2e-analysis-overlay.spec.ts",
    "cdp-e2e-cycle86-snapshot-timeline.spec.ts",
    "cdp-e2e-color-mode.spec.ts",
    "cdp-e2e-cycle87-hover-minimap-contrast.spec.ts",
    "cdp-e2e-cycle83-legend-renderer.spec.ts",
    "cdp-e2e-cycle81-stats-callback.spec.ts",
    "cdp-e2e-cycle87-enclosure.spec.ts",
  ],
  timeout: 60_000,
  retries: 1,
  workers: 1,
  use: {
    trace: "on-first-retry",
  },
  reporter: [["list"]],
});
