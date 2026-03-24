import { defineConfig } from "@playwright/test";

/**
 * Smoke test suite — single unified file, run by Stop hook.
 * 1 file, ~20 tests, target <3 min.
 * Mid suite (16 files):   use cdp-mid.config.ts
 * Full suite (231 files): use cdp-e2e.config.ts
 */
export default defineConfig({
  testDir: "./",
  testMatch: ["smoke.spec.ts"],
  timeout: 300_000,
  retries: 0,
  workers: 1,
  use: {
    trace: "off",
  },
  reporter: [["line"]],
});
