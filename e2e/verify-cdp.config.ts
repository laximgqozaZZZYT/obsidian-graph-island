import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: ["verify-features.spec.ts", "comprehensive-e2e.spec.ts"],
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    trace: "off",
  },
  reporter: [["list"]],
});
