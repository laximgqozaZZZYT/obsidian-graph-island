import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "obsidian-*.spec.ts",
  timeout: 60_000,
  retries: 0,
  workers: 1, // Electron tests must run sequentially
  use: {
    trace: "on-first-retry",
  },
  reporter: [["list"]],
});
