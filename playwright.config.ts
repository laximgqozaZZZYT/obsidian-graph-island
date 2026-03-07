import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15000,
  retries: 0,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1024, height: 768 },
  },
  reporter: [["list"]],
});
