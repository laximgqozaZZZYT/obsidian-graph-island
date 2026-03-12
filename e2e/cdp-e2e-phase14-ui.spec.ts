/**
 * Phase 14 – Dropdown & Popup Animation
 *
 * Validates:
 *  1. gi-popup-enter keyframe exists in the stylesheet
 *  2. Popup elements receive layered box-shadow
 *  3. Screenshot for visual confirmation
 */
import { test, expect, chromium } from "@playwright/test";

const CDP_URL = "http://127.0.0.1:9222";

test.describe("Phase 14 – Popup Animation", () => {
  test("gi-popup-enter keyframe is defined in stylesheets", async () => {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    expect(contexts.length).toBeGreaterThan(0);
    const pages = contexts[0].pages();
    expect(pages.length).toBeGreaterThan(0);
    const page = pages[0];

    // Check that the keyframe rule exists in any stylesheet
    const hasKeyframe = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (const rule of Array.from(rules)) {
            // CSSKeyframesRule check
            if ((rule as any).type === 7 && (rule as any).name === "gi-popup-enter") {
              return true;
            }
            // Also check cssText as fallback
            if (rule.cssText && rule.cssText.includes("gi-popup-enter")) {
              return true;
            }
          }
        } catch {
          // cross-origin stylesheet, skip
        }
      }
      return false;
    });
    expect(hasKeyframe).toBe(true);
  });

  test("popup classes have layered box-shadow", async () => {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    const pages = contexts[0].pages();
    const page = pages[0];

    // Verify via computed stylesheet rules that .gi-ont-rel-popup has the
    // layered shadow defined. We check the raw CSS text since the element
    // may not be visible.
    const hasLayeredShadow = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSStyleRule) {
              const sel = rule.selectorText || "";
              if (
                sel.includes(".gi-ont-rel-popup") ||
                sel.includes(".gi-ac-popup")
              ) {
                const shadow = rule.style.getPropertyValue("box-shadow");
                // layered shadow has at least two shadow definitions (comma-separated)
                if (shadow && shadow.includes(",")) {
                  return true;
                }
              }
            }
          }
        } catch {
          // skip cross-origin
        }
      }
      return false;
    });
    expect(hasLayeredShadow).toBe(true);
  });

  test("screenshot", async () => {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    const pages = contexts[0].pages();
    const page = pages[0];
    await page.screenshot({ path: "e2e/images/phase14-popup-animation.png" });
  });
});
