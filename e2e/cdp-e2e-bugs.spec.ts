// ---------------------------------------------------------------------------
// CDP E2E Bug Hunt — Targeted tests for suspected issues
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

  // Ensure exactly 1 graph-view
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    if (leaves.length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(3000);
});

// =========================================================================
// BUG 1: Duplicate views on re-open command
// =========================================================================
test.describe("BUG-1: Duplicate View Creation", () => {
  test("B1.1 command creates duplicate instead of focusing", async () => {
    // Start with 1 leaf
    await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-view");
      for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    });
    await page.waitForTimeout(500);

    const before = await page.evaluate(() =>
      (window as any).app.workspace.getLeavesOfType("graph-view").length
    );
    expect(before).toBe(1);

    // Execute open command again
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(2000);

    const after = await page.evaluate(() =>
      (window as any).app.workspace.getLeavesOfType("graph-view").length
    );

    console.log(`BUG-1: Before=${before}, After=${after}`);
    if (after > 1) {
      console.log("*** BUG CONFIRMED: Duplicate graph-view created on re-open ***");
    }
  });

  test("B1.2 repeated open creates N views", async () => {
    // Clean up first
    await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    });
    await page.waitForTimeout(500);

    // Open 3 more times
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      });
      await page.waitForTimeout(1000);
    }

    const count = await page.evaluate(() =>
      (window as any).app.workspace.getLeavesOfType("graph-view").length
    );
    console.log(`BUG-1.2: After 3 re-opens, leaf count = ${count}`);
    if (count > 1) {
      console.log("*** BUG CONFIRMED: Each open command creates a new view instead of reusing ***");
    }

    // Cleanup
    await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    });
    await page.waitForTimeout(1000);
  });
});

// =========================================================================
// BUG 2: layoutType not in plugin settings
// =========================================================================
test.describe("BUG-2: Settings / Layout Type", () => {
  test("B2.1 layoutType missing from plugin.settings", async () => {
    const r = await page.evaluate(() => {
      const plugin = (window as any).app.plugins.plugins["graph-island"];
      return {
        settingsKeys: Object.keys(plugin.settings),
        hasLayoutType: "layoutType" in plugin.settings,
        defaultLayout: plugin.settings.defaultLayout,
      };
    });
    console.log("BUG-2.1:", JSON.stringify(r));
    console.log(`  layoutType in settings: ${r.hasLayoutType}`);
    console.log(`  defaultLayout in settings: ${r.defaultLayout}`);
    // Note: layoutType is per-view state, defaultLayout is plugin setting
  });

  test("B2.2 view state vs plugin settings for layout", async () => {
    const r = await page.evaluate(() => {
      const plugin = (window as any).app.plugins.plugins["graph-island"];
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };

      const viewState = view.getState?.();
      return {
        pluginDefaultLayout: plugin.settings.defaultLayout,
        viewStateLayout: viewState?.layout,
        viewStateKeys: viewState ? Object.keys(viewState) : [],
        viewState: JSON.stringify(viewState).slice(0, 500),
      };
    });
    console.log("BUG-2.2:", JSON.stringify(r, null, 2));
  });
});

// =========================================================================
// BUG 3: Panel visibility inconsistency
// =========================================================================
test.describe("BUG-3: Panel Visibility", () => {
  test("B3.1 graph-panel visible: false but has content", async () => {
    const r = await page.evaluate(() => {
      const panels = document.querySelectorAll(".graph-panel");
      return Array.from(panels).map((p, i) => {
        const rect = p.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(p);
        return {
          index: i,
          width: rect.width,
          height: rect.height,
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          opacity: computedStyle.opacity,
          overflow: computedStyle.overflow,
          children: p.children.length,
          parentClass: p.parentElement?.className?.slice(0, 80),
        };
      });
    });
    console.log("BUG-3.1 Panel visibility:", JSON.stringify(r, null, 2));
  });

  test("B3.2 settings button toggles panel", async () => {
    // Find the visible settings button and click it
    const before = await page.evaluate(() => {
      const panels = document.querySelectorAll(".graph-panel");
      return Array.from(panels).map(p => ({
        visible: p.getBoundingClientRect().width > 0,
      }));
    });

    await page.evaluate(() => {
      // Click settings button on the VISIBLE toolbar only
      const toolbars = document.querySelectorAll(".graph-toolbar");
      for (const tb of toolbars) {
        if (tb.getBoundingClientRect().width > 0) {
          const btn = tb.querySelector(".graph-settings-btn");
          if (btn) (btn as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const panels = document.querySelectorAll(".graph-panel");
      return Array.from(panels).map(p => ({
        visible: p.getBoundingClientRect().width > 0,
      }));
    });

    console.log("BUG-3.2 Before:", JSON.stringify(before), "After:", JSON.stringify(after));

    // Toggle back
    await page.evaluate(() => {
      const toolbars = document.querySelectorAll(".graph-toolbar");
      for (const tb of toolbars) {
        if (tb.getBoundingClientRect().width > 0) {
          const btn = tb.querySelector(".graph-settings-btn");
          if (btn) (btn as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(500);
  });
});

// =========================================================================
// BUG 4: Layout dropdown doesn't include force/arc/timeline/cluster-force
// =========================================================================
test.describe("BUG-4: Missing Layouts in Dropdown", () => {
  test("B4.1 check which layouts are available in UI", async () => {
    const r = await page.evaluate(() => {
      const panels = document.querySelectorAll(".graph-panel");
      const allSelects: any[] = [];
      for (const panel of panels) {
        if (panel.getBoundingClientRect().width === 0) continue;
        const selects = panel.querySelectorAll("select");
        for (const s of selects) {
          const opts = Array.from((s as HTMLSelectElement).options).map(o => o.value);
          allSelects.push({ options: opts, current: (s as HTMLSelectElement).value });
        }
      }
      return allSelects;
    });
    console.log("BUG-4.1 Available selects:", JSON.stringify(r, null, 2));

    // Check: the layout dropdown should include force, cluster-force, concentric, tree, arc, sunburst, timeline
    // But v2 tests showed it only has: spiral, concentric, tree, grid, triangle, random, mountain, sunburst
    // These look like CLUSTER ARRANGEMENT options, not layout types!
    console.log("*** OBSERVATION: No top-level layout selector (force/concentric/tree/arc/timeline) found in panel ***");
    console.log("*** The dropdown found is 'cluster arrangement' (spiral/grid/tree/etc), not layout type ***");
  });

  test("B4.2 how is layout actually changed in UI?", async () => {
    // Check if there are layout buttons, tabs, or other UI elements
    const r = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel || panel.getBoundingClientRect().width === 0) return { error: "no visible panel" };

      // Look for anything with "layout" in class/data
      const layoutEls = panel.querySelectorAll("[class*='layout'], [data-layout], [data-setting*='layout']");
      const results = Array.from(layoutEls).map(el => ({
        tag: el.tagName,
        class: el.className?.slice(0, 80),
        text: el.textContent?.trim()?.slice(0, 40),
      }));

      // Also look for section headers mentioning layout
      const headers = panel.querySelectorAll(".graph-control-section-header");
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim());

      return { layoutEls: results, sectionHeaders: headerTexts };
    });
    console.log("BUG-4.2:", JSON.stringify(r, null, 2));
  });

  test("B4.3 check view.getState() for current layout", async () => {
    const r = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;
      const state = view.getState?.();
      return state;
    });
    console.log("BUG-4.3 View state:", JSON.stringify(r, null, 2));
  });

  test("B4.4 try changing layout via setState", async () => {
    const layouts = ["force", "cluster-force", "concentric", "tree", "arc", "sunburst", "timeline"];
    for (const layout of layouts) {
      const result = await page.evaluate(async (lname) => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!view) return { error: "no view" };
        const before = view.getState?.();
        await view.setState?.({ ...before, layout: lname }, {});
        await new Promise(r => setTimeout(r, 500));
        const after = view.getState?.();
        return {
          layout: lname,
          beforeLayout: before?.layout,
          afterLayout: after?.layout,
          changed: before?.layout !== after?.layout,
        };
      }, layout);
      console.log(`  setState(${layout}):`, JSON.stringify(result));
      await page.waitForTimeout(2000);

      const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
      if (!canvasOk) {
        console.log(`*** CRASH: Canvas gone after switching to ${layout} ***`);
      }
    }
  });
});

// =========================================================================
// BUG 5: Checkbox toggles not found
// =========================================================================
test.describe("BUG-5: Missing Checkboxes", () => {
  test("B5.1 find all toggle elements in panel", async () => {
    const r = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel || panel.getBoundingClientRect().width === 0) return { error: "no visible panel" };

      // Look for various toggle types
      const checkboxes = panel.querySelectorAll("input[type='checkbox']");
      const toggles = panel.querySelectorAll(".checkbox-container, .mod-toggle, [role='switch']");
      const clickableToggles = panel.querySelectorAll(".clickable-icon, .setting-item-control");

      // Also look for Obsidian-style toggles (div.checkbox-container)
      const obsToggles = panel.querySelectorAll(".checkbox-container");

      return {
        checkboxCount: checkboxes.length,
        toggleCount: toggles.length,
        obsToggleCount: obsToggles.length,
        obsToggleDetails: Array.from(obsToggles).map(t => ({
          class: t.className,
          checked: t.classList.contains("is-enabled"),
          parent: t.parentElement?.textContent?.trim()?.slice(0, 60),
        })),
      };
    });
    console.log("BUG-5.1:", JSON.stringify(r, null, 2));
  });

  test("B5.2 toggle Obsidian-style checkboxes", async () => {
    const r = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel || panel.getBoundingClientRect().width === 0) return { error: "no visible panel" };

      const toggles = panel.querySelectorAll(".checkbox-container");
      const results: any[] = [];
      for (const t of toggles) {
        const before = t.classList.contains("is-enabled");
        (t as HTMLElement).click();
        const after = t.classList.contains("is-enabled");
        const label = t.closest(".setting-item")?.querySelector(".setting-item-name")?.textContent?.trim();
        results.push({ label, before, after, toggled: before !== after });
      }
      return results;
    });
    console.log("BUG-5.2 Toggle results:", JSON.stringify(r, null, 2));
    await page.waitForTimeout(2000);

    // Toggle back
    await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return;
      const toggles = panel.querySelectorAll(".checkbox-container");
      for (const t of toggles) {
        (t as HTMLElement).click();
      }
    });
    await page.waitForTimeout(1000);
  });
});

// =========================================================================
// BUG 6: Preset buttons not found
// =========================================================================
test.describe("BUG-6: Preset Buttons", () => {
  test("B6.1 search for preset UI elements exhaustively", async () => {
    const r = await page.evaluate(() => {
      // Search entire document
      const allBtns = Array.from(document.querySelectorAll("button"));
      const btnTexts = allBtns.map(b => b.textContent?.trim()?.slice(0, 50)).filter(Boolean);

      // Search for common preset-related patterns
      const presetKeywords = ["preset", "simple", "analysis", "creative", "シンプル", "分析", "クリエイティブ", "プリセット", "テンプレート"];
      const matchingBtns = allBtns.filter(b => {
        const txt = (b.textContent || "").toLowerCase();
        const cls = (b.className || "").toLowerCase();
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        return presetKeywords.some(k => txt.includes(k) || cls.includes(k) || label.includes(k));
      });

      // Also check the panel sections for preset content
      const panel = document.querySelector(".graph-panel");
      let panelHTML = "";
      if (panel) {
        panelHTML = panel.innerHTML.slice(0, 2000);
      }

      return {
        totalButtons: allBtns.length,
        matchingButtons: matchingBtns.map(b => ({
          text: b.textContent?.trim()?.slice(0, 50),
          class: b.className,
          ariaLabel: b.getAttribute("aria-label"),
        })),
        panelContainsPreset: panelHTML.toLowerCase().includes("preset") || panelHTML.includes("プリセット"),
        sampleBtnTexts: btnTexts.slice(0, 20),
      };
    });
    console.log("BUG-6.1:", JSON.stringify(r, null, 2));
  });
});

// =========================================================================
// BUG 7: Node count discrepancy (rawData vs displayed)
// =========================================================================
test.describe("BUG-7: Node Count Discrepancy", () => {
  test("B7.1 compare rawData count vs displayed count", async () => {
    const r = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;

      const rawNodes = view.rawData?.nodes?.length ?? -1;
      const originalNodes = view.originalGraphData?.nodes?.length ?? -1;
      const pixiNodeCount = view.pixiNodes ? Object.keys(view.pixiNodes).length : -1;

      // Status bar text
      const status = document.querySelector(".graph-status");
      const statusText = status?.textContent?.trim();

      return { rawNodes, originalNodes, pixiNodeCount, statusText };
    });
    console.log("BUG-7.1:", JSON.stringify(r));
    if (r && r.rawNodes !== r.pixiNodeCount && r.pixiNodeCount > 0) {
      console.log(`*** DISCREPANCY: rawData has ${r.rawNodes} nodes but pixiNodes has ${r.pixiNodeCount} ***`);
    }
    if (r && r.rawNodes !== r.originalNodes) {
      console.log(`*** DISCREPANCY: rawData has ${r.rawNodes}, originalGraphData has ${r.originalNodes} ***`);
    }
  });
});

// =========================================================================
// BUG 8: Memory leak on close/reopen
// =========================================================================
test.describe("BUG-8: Memory / Resource Cleanup", () => {
  test("B8.1 check PIXI resources after close/reopen", async () => {
    // Get initial state
    const before = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize ?? -1;
    });

    // Close and reopen 3 times
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
        leaves.forEach((l: any) => l.detach());
      });
      await page.waitForTimeout(1000);

      await page.evaluate(() => {
        (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      });
      await page.waitForTimeout(3000);
    }

    const after = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize ?? -1;
    });

    console.log(`BUG-8.1: Memory before=${before}, after=${after}`);
    if (before > 0 && after > 0) {
      const increase = after - before;
      const pct = ((increase / before) * 100).toFixed(1);
      console.log(`  Memory change: ${increase} bytes (${pct}%)`);
      if (increase > 50_000_000) {
        console.log("*** POTENTIAL MEMORY LEAK: >50MB increase after 3 close/reopen cycles ***");
      }
    }
  });
});

// =========================================================================
// BUG 9: Color group labels — rendering
// =========================================================================
test.describe("BUG-9: Color Groups", () => {
  test("B9.1 check color group labels", async () => {
    const r = await page.evaluate(() => {
      const groups = document.querySelectorAll(".graph-color-group");
      return Array.from(groups).map(g => {
        const label = g.querySelector(".graph-color-group-label, .gi-color-group-label");
        const colorBtn = g.querySelector(".graph-color-button, input[type='color']");
        return {
          labelText: label?.textContent?.trim(),
          hasColor: !!colorBtn,
          childCount: g.children.length,
        };
      });
    });
    console.log("BUG-9.1 Color groups:", JSON.stringify(r, null, 2));
  });
});

// =========================================================================
// BUG 10: Minimap state
// =========================================================================
test.describe("BUG-10: Minimap", () => {
  test("B10.1 minimap canvas check", async () => {
    const r = await page.evaluate(() => {
      const allCanvases = document.querySelectorAll("canvas");
      const canvasInfo = Array.from(allCanvases).map(c => ({
        width: c.width,
        height: c.height,
        boundingWidth: c.getBoundingClientRect().width,
        boundingHeight: c.getBoundingClientRect().height,
        parentClass: c.parentElement?.className?.slice(0, 60),
        id: c.id,
      }));
      return canvasInfo;
    });
    console.log("BUG-10.1 All canvases:", JSON.stringify(r, null, 2));
  });
});

// =========================================================================
// BUG 11: Rapid settings changes cause race conditions
// =========================================================================
test.describe("BUG-11: Rapid Setting Changes", () => {
  test("B11.1 rapid checkbox toggles", async () => {
    const errors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", err => {
      errors.push(`PAGE ERROR: ${err.message}`);
    });

    await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel || panel.getBoundingClientRect().width === 0) return;

      const toggles = panel.querySelectorAll(".checkbox-container");
      // Rapid toggle 10 times
      for (let i = 0; i < 10; i++) {
        for (const t of toggles) {
          (t as HTMLElement).click();
        }
      }
    });

    await page.waitForTimeout(5000);

    if (errors.length > 0) {
      console.log("*** ERRORS during rapid toggle:", errors.slice(0, 5));
    } else {
      console.log("No errors during rapid toggle");
    }

    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });

  test("B11.2 rapid slider changes", async () => {
    const errors: string[] = [];
    page.on("pageerror", err => {
      errors.push(`PAGE ERROR: ${err.message}`);
    });

    await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel || panel.getBoundingClientRect().width === 0) return;

      const sliders = panel.querySelectorAll("input[type='range']");
      for (const s of sliders) {
        const slider = s as HTMLInputElement;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        // Rapidly change values
        for (let i = 0; i < 20; i++) {
          slider.value = String(min + (max - min) * Math.random());
          slider.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    });

    await page.waitForTimeout(5000);

    if (errors.length > 0) {
      console.log("*** ERRORS during rapid slider:", errors.slice(0, 5));
    } else {
      console.log("No errors during rapid slider changes");
    }

    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });
});

// =========================================================================
// BUG 12: Toolbar visibility mismatch
// =========================================================================
test.describe("BUG-12: Toolbar Visibility", () => {
  test("B12.1 toolbar visible:false on one instance", async () => {
    const r = await page.evaluate(() => {
      const toolbars = document.querySelectorAll(".graph-toolbar");
      return Array.from(toolbars).map((tb, i) => ({
        index: i,
        visible: tb.getBoundingClientRect().width > 0,
        parentVisible: tb.parentElement?.getBoundingClientRect().width! > 0,
        parentClass: tb.parentElement?.className?.slice(0, 60),
      }));
    });
    console.log("BUG-12.1 Toolbar visibility:", JSON.stringify(r, null, 2));
  });
});

// =========================================================================
// Final screenshot
// =========================================================================
test.describe("Final", () => {
  test("take screenshot", async () => {
    await page.screenshot({ path: "e2e/screenshot-bugtest.png", fullPage: false });
    console.log("Screenshot saved");
  });
});
