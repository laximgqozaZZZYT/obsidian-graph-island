import { defineConfig } from "@playwright/test";

/**
 * Smoke test suite — single unified file, run by Stop hook.
 * 1 file, ~20 tests, target <3 min.
 * Run: pnpm test:e2e:smoke
 * Mid suite (16 files):  pnpm test:e2e:mid
 * Full suite (all files): pnpm test:e2e:full
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
