import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  retries: 0,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1024, height: 768 },
  },
  reporter: [["list"]],
});
