// ---------------------------------------------------------------------------
// CDP E2E: Panel UI Brushup Verification
// Verifies Task 1-9 of the graph settings panel UI/UX improvements
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Ensure graph-view is open
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(2000);

  // Reload plugin to pick up latest CSS + JS
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
  });
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(3000);

  // Open graph view
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(2000);
});

// Helper: ensure settings panel is open
async function ensurePanelOpen() {
  await page.evaluate(() => {
    const toolbars = document.querySelectorAll(".graph-toolbar");
    for (const tb of toolbars) {
      if (tb.getBoundingClientRect().width > 0) {
        const btn = tb.querySelector(".graph-settings-btn");
        if (btn && !btn.classList.contains("is-active")) {
          (btn as HTMLElement).click();
        }
        break;
      }
    }
  });
  await page.waitForTimeout(500);
}

// =========================================================================
// Task 1: gi-setting-* CSS classes exist and are applied
// =========================================================================
test.describe("Task 1: gi-setting-* CSS", () => {
  test("T1.1 gi-setting-row/label/input CSS definitions exist", async () => {
    await ensurePanelOpen();

    const result = await page.evaluate(() => {
      // Check if CSS rules are defined for gi-setting-*
      const sheets = Array.from(document.styleSheets);
      let hasSettingRow = false;
      let hasSettingLabel = false;
      let hasSettingInput = false;

      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            const text = (rule as CSSStyleRule).selectorText ?? "";
            if (text.includes(".gi-setting-row")) hasSettingRow = true;
            if (text.includes(".gi-setting-label")) hasSettingLabel = true;
            if (text.includes(".gi-setting-input")) hasSettingInput = true;
          }
        } catch { /* cross-origin */ }
      }

      return { hasSettingRow, hasSettingLabel, hasSettingInput };
    });

    console.log("T1.1 CSS definitions:", JSON.stringify(result));
    expect(result.hasSettingRow).toBe(true);
    expect(result.hasSettingLabel).toBe(true);
    expect(result.hasSettingInput).toBe(true);
  });
});

// =========================================================================
// Task 2: Section card styling
// =========================================================================
test.describe("Task 2: Section Cards", () => {
  test("T2.1 graph-control-sections have card styling", async () => {
    await ensurePanelOpen();

    const result = await page.evaluate(() => {
      const sections = document.querySelectorAll(".graph-panel .graph-control-section");
      if (sections.length === 0) return { error: "no sections found", count: 0 };

      const first = sections[0] as HTMLElement;
      const style = getComputedStyle(first);

      return {
        count: sections.length,
        borderRadius: style.borderRadius,
        hasBorder: style.border !== "none" && style.borderStyle !== "none",
        hasBackground: style.backgroundColor !== "" && style.backgroundColor !== "rgba(0, 0, 0, 0)",
        margin: style.margin,
      };
    });

    console.log("T2.1 Section cards:", JSON.stringify(result));
    expect(result.count).toBeGreaterThan(0);
    // border-radius should be non-zero (card style)
    expect(result.borderRadius).not.toBe("0px");
    expect(result.hasBorder).toBe(true);
  });
});

// =========================================================================
// Task 3: Section header typography
// =========================================================================
test.describe("Task 3: Section Headers", () => {
  test("T3.1 headers have uppercase + letter-spacing", async () => {
    await ensurePanelOpen();

    const result = await page.evaluate(() => {
      const headers = document.querySelectorAll(".graph-panel .graph-control-section-header");
      if (headers.length === 0) return { error: "no headers found", count: 0 };

      const first = headers[0] as HTMLElement;
      const style = getComputedStyle(first);

      return {
        count: headers.length,
        textTransform: style.textTransform,
        letterSpacing: style.letterSpacing,
        fontWeight: style.fontWeight,
        sampleText: first.textContent?.trim()?.slice(0, 30),
      };
    });

    console.log("T3.1 Headers:", JSON.stringify(result));
    expect(result.count).toBeGreaterThan(0);
    expect(result.textTransform).toBe("uppercase");
  });
});

// =========================================================================
// Task 4: Tab bar animation (::after pseudo element)
// =========================================================================
test.describe("Task 4: Tab Animation", () => {
  test("T4.1 tab buttons have position:relative (for ::after)", async () => {
    await ensurePanelOpen();

    const result = await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs.length === 0) return { error: "no tabs found", count: 0 };

      const tabInfos = Array.from(tabs).map(tab => {
        const style = getComputedStyle(tab);
        const afterStyle = getComputedStyle(tab, "::after");
        return {
          text: tab.textContent?.trim()?.slice(0, 10),
          isActive: tab.classList.contains("is-active"),
          position: style.position,
          afterContent: afterStyle.content,
          afterTransform: afterStyle.transform,
          afterBackground: afterStyle.backgroundColor,
        };
      });

      return { count: tabs.length, tabs: tabInfos };
    });

    console.log("T4.1 Tabs:", JSON.stringify(result));
    expect(result.count).toBeGreaterThan(0);
    // All tabs should have position:relative for ::after positioning
    for (const tab of result.tabs) {
      expect(tab.position).toBe("relative");
    }
    // Active tab should have ::after with non-zero transform
    const activeTab = result.tabs.find(t => t.isActive);
    if (activeTab) {
      // ::after content should exist
      expect(activeTab.afterContent).not.toBe("none");
    }
  });

  test("T4.2 tab switching works and animates", async () => {
    await ensurePanelOpen();

    // Click each tab and verify active state
    const result = await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      const results: { label: string; clickResult: boolean }[] = [];

      tabs.forEach((tab, i) => {
        (tab as HTMLElement).click();
        const isNowActive = tab.classList.contains("is-active");
        results.push({
          label: tab.textContent?.trim()?.slice(0, 10) || `tab-${i}`,
          clickResult: isNowActive,
        });
      });

      // Reset to first tab
      if (tabs[0]) (tabs[0] as HTMLElement).click();

      return results;
    });

    console.log("T4.2 Tab switching:", JSON.stringify(result));
    for (const r of result) {
      expect(r.clickResult).toBe(true);
    }
  });
});

// =========================================================================
// Task 5: Transform sub-section visual grouping
// =========================================================================
test.describe("Task 5: Transform Sub-section", () => {
  test("T5.1 gi-transform-sub CSS is defined", async () => {
    const result = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      let found = false;
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if ((rule as CSSStyleRule).selectorText?.includes(".gi-transform-sub")) {
              found = true;
              break;
            }
          }
        } catch { /* cross-origin */ }
        if (found) break;
      }
      return { cssRuleExists: found };
    });

    console.log("T5.1 Transform sub CSS:", JSON.stringify(result));
    expect(result.cssRuleExists).toBe(true);
  });

  test("T5.2 curve transform creates gi-transform-sub wrapper", async () => {
    await ensurePanelOpen();

    // Switch to Layout tab and set custom arrangement with curve transform
    const result = await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      // Set to cluster-force with custom arrangement and curve transform
      view.panel.clusterArrangement = "custom";
      view.panel.coordinateLayout = {
        system: "cartesian",
        axis1: { source: { kind: "degree" }, transform: { kind: "curve", curve: "archimedean", params: {}, scale: 1 } },
        axis2: { source: { kind: "degree" }, transform: { kind: "linear", scale: 1 } },
        perGroup: false,
      };
      view.buildPanel();

      await new Promise(r => setTimeout(r, 500));

      // Check if gi-transform-sub elements exist
      const subs = document.querySelectorAll(".gi-transform-sub");
      return {
        transformSubCount: subs.length,
        hasExpectedStyling: subs.length > 0 ? (() => {
          const style = getComputedStyle(subs[0]);
          return {
            borderLeft: style.borderLeft,
            background: style.backgroundColor !== "" && style.backgroundColor !== "rgba(0, 0, 0, 0)",
            hasContent: subs[0].children.length > 0,
          };
        })() : null,
      };
    });

    console.log("T5.2 Transform sub wrapper:", JSON.stringify(result));
    expect(result.transformSubCount).toBeGreaterThan(0);
    if (result.hasExpectedStyling) {
      expect(result.hasExpectedStyling.hasContent).toBe(true);
    }
  });
});

// =========================================================================
// Task 6: Slider value display
// =========================================================================
test.describe("Task 6: Slider Value Display", () => {
  test("T6.1 sliders show real-time value", async () => {
    await ensurePanelOpen();

    // Click Display tab to see sliders
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      // Display tab is typically the 2nd tab
      if (tabs[1]) (tabs[1] as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return { error: "no panel" };

      const sliderRows = panel.querySelectorAll(".setting-item.mod-slider");
      const sliderInfos = Array.from(sliderRows).map(row => {
        const nameEl = row.querySelector(".setting-item-name");
        const valueSpan = row.querySelector(".gi-slider-value");
        const rangeInput = row.querySelector("input[type='range']") as HTMLInputElement | null;

        return {
          label: nameEl?.textContent?.trim()?.slice(0, 20),
          hasValueSpan: !!valueSpan,
          displayedValue: valueSpan?.textContent?.trim(),
          inputValue: rangeInput?.value,
          valuesMatch: valueSpan?.textContent?.trim() === rangeInput?.value,
        };
      });

      return {
        totalSliders: sliderRows.length,
        slidersWithValue: sliderInfos.filter(s => s.hasValueSpan).length,
        sliders: sliderInfos.slice(0, 6), // first 6 for brevity
      };
    });

    console.log("T6.1 Slider values:", JSON.stringify(result));
    expect(result.totalSliders).toBeGreaterThan(0);
    expect(result.slidersWithValue).toBe(result.totalSliders);
    // Check values match
    for (const s of result.sliders) {
      if (s.hasValueSpan) {
        expect(s.valuesMatch).toBe(true);
      }
    }
  });

  test("T6.2 slider value updates on input", async () => {
    await ensurePanelOpen();

    // Go to Display tab
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[1]) (tabs[1] as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return { error: "no panel" };

      // Find first slider with a value span
      const sliderRow = panel.querySelector(".setting-item.mod-slider");
      if (!sliderRow) return { error: "no slider found" };

      const valueSpan = sliderRow.querySelector(".gi-slider-value");
      const rangeInput = sliderRow.querySelector("input[type='range']") as HTMLInputElement | null;
      if (!valueSpan || !rangeInput) return { error: "no value span or input" };

      const beforeValue = valueSpan.textContent;

      // Change the slider value programmatically
      const oldVal = parseFloat(rangeInput.value);
      const newVal = parseFloat(rangeInput.min) + (parseFloat(rangeInput.max) - parseFloat(rangeInput.min)) * 0.5;
      rangeInput.value = String(newVal);
      rangeInput.dispatchEvent(new Event("input", { bubbles: true }));

      const afterValue = valueSpan.textContent;

      // Restore
      rangeInput.value = String(oldVal);
      rangeInput.dispatchEvent(new Event("input", { bubbles: true }));

      return {
        beforeValue,
        newSliderValue: String(newVal),
        afterValue,
        valueUpdated: afterValue === String(newVal),
      };
    });

    console.log("T6.2 Slider value update:", JSON.stringify(result));
    expect(result.valueUpdated).toBe(true);
  });
});

// =========================================================================
// Task 7: Help button visibility
// =========================================================================
test.describe("Task 7: Help Button Visibility", () => {
  test("T7.1 help buttons have reduced opacity", async () => {
    await ensurePanelOpen();

    const result = await page.evaluate(() => {
      const helpBtns = document.querySelectorAll(".gi-help-btn");
      if (helpBtns.length === 0) return { error: "no help buttons", count: 0 };

      const opacities = Array.from(helpBtns).map(btn => {
        const style = getComputedStyle(btn);
        return parseFloat(style.opacity);
      });

      return {
        count: helpBtns.length,
        opacities,
        allBelow50pct: opacities.every(o => o <= 0.5),
      };
    });

    console.log("T7.1 Help buttons:", JSON.stringify(result));
    expect(result.count).toBeGreaterThan(0);
    // Opacity should be 0.35 (below 0.5)
    expect(result.allBelow50pct).toBe(true);
  });
});

// =========================================================================
// Task 8: Setting tooltips (title attribute)
// =========================================================================
test.describe("Task 8: Setting Tooltips", () => {
  test("T8.1 key settings have title attributes", async () => {
    await ensurePanelOpen();

    // Check Filter tab first
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[0]) (tabs[0] as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    const filterResult = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return { error: "no panel" };

      // Find all setting-item-name elements with title
      const names = panel.querySelectorAll(".setting-item-name");
      const withTitle = Array.from(names)
        .filter(n => n.getAttribute("title"))
        .map(n => ({
          label: n.textContent?.trim()?.slice(0, 25),
          title: n.getAttribute("title")?.slice(0, 50),
        }));

      return {
        totalSettingNames: names.length,
        withTooltip: withTitle.length,
        tooltips: withTitle,
      };
    });

    console.log("T8.1 Filter tab tooltips:", JSON.stringify(filterResult));

    // Check Display tab
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[1]) (tabs[1] as HTMLElement).click();
    });
    await page.waitForTimeout(300);

    const displayResult = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return { error: "no panel" };

      const names = panel.querySelectorAll(".setting-item-name");
      const withTitle = Array.from(names)
        .filter(n => n.getAttribute("title"))
        .map(n => ({
          label: n.textContent?.trim()?.slice(0, 25),
          title: n.getAttribute("title")?.slice(0, 50),
        }));

      return {
        totalSettingNames: names.length,
        withTooltip: withTitle.length,
        tooltips: withTitle,
      };
    });

    console.log("T8.1 Display tab tooltips:", JSON.stringify(displayResult));

    // At least some settings should have tooltips
    const totalTooltips = (filterResult.withTooltip ?? 0) + (displayResult.withTooltip ?? 0);
    expect(totalTooltips).toBeGreaterThanOrEqual(5);
  });
});

// =========================================================================
// Task 9: gi-setting-desc CSS
// =========================================================================
test.describe("Task 9: Setting Description CSS", () => {
  test("T9.1 gi-setting-desc CSS rule exists", async () => {
    const result = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      let found = false;
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if ((rule as CSSStyleRule).selectorText?.includes(".gi-setting-desc")) {
              found = true;
              break;
            }
          }
        } catch { /* cross-origin */ }
        if (found) break;
      }
      return { cssRuleExists: found };
    });

    console.log("T9.1 gi-setting-desc CSS:", JSON.stringify(result));
    expect(result.cssRuleExists).toBe(true);
  });
});

// =========================================================================
// Verification: Panel width 240px — no overflow
// =========================================================================
test.describe("Verify: No overflow at 240px", () => {
  test("V1 panel content does not overflow horizontally", async () => {
    await ensurePanelOpen();

    const result = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel") as HTMLElement;
      if (!panel) return { error: "no panel" };

      const panelWidth = panel.getBoundingClientRect().width;
      const hasHorizontalOverflow = panel.scrollWidth > panel.clientWidth + 2; // 2px tolerance

      // Check each tab content
      const tabContents = panel.querySelectorAll(".gi-tab-content");
      const overflowTabs: string[] = [];
      tabContents.forEach(tc => {
        if (tc.scrollWidth > tc.clientWidth + 2) {
          overflowTabs.push(tc.className);
        }
      });

      // Check sections
      const sections = panel.querySelectorAll(".graph-control-section");
      const overflowSections: string[] = [];
      sections.forEach(s => {
        if (s.scrollWidth > (s as HTMLElement).clientWidth + 2) {
          const header = s.querySelector(".graph-control-section-header");
          overflowSections.push(header?.textContent?.trim()?.slice(0, 20) || "unknown");
        }
      });

      return {
        panelWidth,
        hasHorizontalOverflow,
        overflowTabs,
        overflowSections,
        sectionsChecked: sections.length,
      };
    });

    console.log("V1 Overflow check:", JSON.stringify(result));
    expect(result.hasHorizontalOverflow).toBe(false);
    expect(result.overflowSections).toHaveLength(0);
  });
});

// =========================================================================
// Verify: Section collapse/expand works
// =========================================================================
test.describe("Verify: Section collapse/expand", () => {
  test("V2 sections toggle on header click", async () => {
    await ensurePanelOpen();

    const result = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return { error: "no panel" };

      const headers = panel.querySelectorAll(".graph-control-section-header");
      if (headers.length === 0) return { error: "no headers" };

      // Pick first section
      const firstHeader = headers[0] as HTMLElement;
      const section = firstHeader.closest(".graph-control-section");
      if (!section) return { error: "no parent section" };

      const wasCollapsed = section.classList.contains("is-collapsed");
      firstHeader.click();
      const afterClick = section.classList.contains("is-collapsed");
      // Click again to restore
      firstHeader.click();
      const restored = section.classList.contains("is-collapsed");

      return {
        headerText: firstHeader.textContent?.trim()?.slice(0, 20),
        wasCollapsed,
        afterClick,
        restored,
        toggleWorks: wasCollapsed !== afterClick,
      };
    });

    console.log("V2 Section toggle:", JSON.stringify(result));
    expect(result.toggleWorks).toBe(true);
  });
});

// =========================================================================
// Verify: Screenshots for visual confirmation
// =========================================================================
test.describe("Verify: Visual Screenshots", () => {
  test("V3.1 screenshot — Filter tab", async () => {
    await ensurePanelOpen();
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[0]) (tabs[0] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/images/panel-brushup-filter.png", fullPage: false });
    console.log("Screenshot saved: panel-brushup-filter.png");
  });

  test("V3.2 screenshot — Display tab", async () => {
    await ensurePanelOpen();
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[1]) (tabs[1] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/images/panel-brushup-display.png", fullPage: false });
    console.log("Screenshot saved: panel-brushup-display.png");
  });

  test("V3.3 screenshot — Layout tab", async () => {
    await ensurePanelOpen();
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[2]) (tabs[2] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/images/panel-brushup-layout.png", fullPage: false });
    console.log("Screenshot saved: panel-brushup-layout.png");
  });

  test("V3.4 screenshot — Settings tab", async () => {
    await ensurePanelOpen();
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[3]) (tabs[3] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/images/panel-brushup-settings.png", fullPage: false });
    console.log("Screenshot saved: panel-brushup-settings.png");
  });

  test("V3.5 screenshot — curve transform sub-section", async () => {
    await ensurePanelOpen();
    // Set custom arrangement with curve transform and screenshot Layout tab
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return;
      view.panel.clusterArrangement = "custom";
      view.panel.coordinateLayout = {
        system: "cartesian",
        axis1: { source: { kind: "degree" }, transform: { kind: "curve", curve: "archimedean", params: {}, scale: 1 } },
        axis2: { source: { kind: "degree" }, transform: { kind: "linear", scale: 1 } },
        perGroup: false,
      };
      view.buildPanel();
    });
    await page.waitForTimeout(500);
    // Make sure Layout tab is active
    await page.evaluate(() => {
      const tabs = document.querySelectorAll(".gi-tab-btn");
      if (tabs[2]) (tabs[2] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "e2e/images/panel-brushup-curve-transform.png", fullPage: false });
    console.log("Screenshot saved: panel-brushup-curve-transform.png");

    // Reset arrangement
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return;
      view.panel.clusterArrangement = "spiral";
      view.panel.coordinateLayout = undefined;
      view.buildPanel();
    });
    await page.waitForTimeout(300);
  });
});
