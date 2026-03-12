import { test, expect, chromium } from "@playwright/test";

test.describe("Phase 16 — Search UX (icon + clear button)", () => {
  test("search wrapper contains search icon and clear button", async () => {
    const browser = await chromium.connectOverCDP("http://localhost:9222");
    const contexts = browser.contexts();
    expect(contexts.length).toBeGreaterThan(0);
    const pages = contexts[0].pages();
    expect(pages.length).toBeGreaterThan(0);
    const page = pages[0];

    // Wait for graph container
    await page.waitForSelector(".graph-container", { timeout: 10000 });

    // Open the settings panel if hidden
    const panel = page.locator(".graph-panel");
    const isHidden = await panel.evaluate(el => el.classList.contains("is-hidden"));
    if (isHidden) {
      const settingsBtn = page.locator(".graph-settings-btn").first();
      if (await settingsBtn.count() > 0) {
        await settingsBtn.click();
        await page.waitForTimeout(500);
      }
    }

    await expect(panel).toBeVisible({ timeout: 5000 });

    // --- Top search bar ---
    const searchWrapper = panel.locator(".gi-search-row .gi-search-wrapper").first();
    await expect(searchWrapper).toBeVisible();

    // Search icon present
    const searchIcon = searchWrapper.locator(".gi-search-icon");
    await expect(searchIcon).toBeVisible();
    const iconSvg = searchIcon.locator("svg");
    await expect(iconSvg).toBeAttached();

    // Clear button exists but hidden when empty
    const clearBtn = searchWrapper.locator(".gi-search-clear");
    await expect(clearBtn).toBeAttached();
    const clearStyle = await clearBtn.getAttribute("style");
    expect(clearStyle).toContain("display: none");

    // --- Settings filter ---
    const settingsWrapper = panel.locator(".gi-settings-filter-wrapper").first();
    await expect(settingsWrapper).toBeVisible();

    const settingsIcon = settingsWrapper.locator(".gi-search-icon");
    await expect(settingsIcon).toBeVisible();

    const settingsClear = settingsWrapper.locator(".gi-search-clear");
    await expect(settingsClear).toBeAttached();

    // Screenshot
    await panel.screenshot({ path: "e2e/images/phase16-search-ux.png" });
  });
});
