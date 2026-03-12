import { test, expect } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

test.describe("Phase 13: Slider track fill", () => {
  test("slider has --progress CSS variable and track gradient", async ({ browser }) => {
    const cdpBrowser = await browser.browserType().connectOverCDP(CDP_URL);
    const contexts = cdpBrowser.contexts();
    expect(contexts.length).toBeGreaterThan(0);
    const pages = contexts[0].pages();
    expect(pages.length).toBeGreaterThan(0);
    const page = pages[0];

    // Wait for graph container
    await page.waitForSelector(".graph-container", { timeout: 10000 });

    // Open the settings panel by clicking the settings button
    const settingsBtn = page.locator(".graph-settings-btn").first();
    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
    }

    // Check --progress variable is set on a slider (evaluate in DOM context)
    const result = await page.evaluate(() => {
      const slider = document.querySelector('.graph-panel input[type="range"]') as HTMLInputElement | null;
      if (!slider) return { found: false, progress: "", hasGradient: false };
      const progress = slider.style.getPropertyValue("--progress");

      // Check CSS rules for gradient
      let hasGradient = false;
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSStyleRule &&
                rule.selectorText?.includes("slider-runnable-track") &&
                rule.style.background?.includes("linear-gradient")) {
              hasGradient = true;
              break;
            }
          }
        } catch { /* cross-origin */ }
        if (hasGradient) break;
      }

      return { found: true, progress, hasGradient };
    });

    expect(result.found).toBe(true);
    expect(result.progress).toMatch(/^\d+(\.\d+)?%$/);
    expect(result.hasGradient).toBe(true);

    // Verify progress value in valid range
    const pctNum = parseFloat(result.progress);
    expect(pctNum).toBeGreaterThanOrEqual(0);
    expect(pctNum).toBeLessThanOrEqual(100);

    // Screenshot
    await page.screenshot({ path: "e2e/images/phase13-slider-track-fill.png" });

    await cdpBrowser.close();
  });
});
