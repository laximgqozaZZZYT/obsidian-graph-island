import { test, chromium } from "@playwright/test";

test("reload graph-island plugin", async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const page = browser.contexts()[0].pages()[0];
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);
});
