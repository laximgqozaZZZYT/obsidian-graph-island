import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "cdp-e2e*.spec.ts",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    trace: "on-first-retry",
  },
  reporter: [["list"]],
});
