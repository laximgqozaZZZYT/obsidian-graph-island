import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "cdp-e2e*.spec.ts",
  testIgnore: ["archive/**"],
  timeout: 60_000,
  retries: 1,
  workers: 1,
  use: {
    trace: "on-first-retry",
  },
  reporter: [["list"]],
});
