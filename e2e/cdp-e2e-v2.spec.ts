// ---------------------------------------------------------------------------
// CDP E2E Test v2 — Corrected selectors based on actual view structure
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Ensure only 1 graph-view leaf is open
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    // Close all but the first
    for (let i = 1; i < leaves.length; i++) {
      leaves[i].detach();
    }
  });
  await page.waitForTimeout(1000);
});

test.afterAll(async () => {
  // don't close — reusing running Obsidian
});

// =========================================================================
// Helper: get graph view
// =========================================================================
async function getViewInfo() {
  return page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) return null;
    const view = leaves[0].view;
    return {
      leafCount: leaves.length,
      nodeCount: view.rawData?.nodes?.length ?? -1,
      edgeCount: view.rawData?.edges?.length ?? -1,
      hasPixiApp: !!view.pixiApp,
      hasSimulation: !!view.simulation,
      hasPanel: !!view.panel,
    };
  });
}

// =========================================================================
// 1. Basic State
// =========================================================================
test.describe("1. Plugin & View State", () => {
  test("1.1 plugin loaded and enabled", async () => {
    const r = await page.evaluate(() => {
      const app = (window as any).app;
      return {
        loaded: "graph-island" in (app.plugins?.plugins ?? {}),
        manifest: !!app.plugins?.manifests?.["graph-island"],
        version: app.plugins?.manifests?.["graph-island"]?.version,
      };
    });
    expect(r.loaded).toBe(true);
    expect(r.manifest).toBe(true);
    console.log("Plugin version:", r.version);
  });

  test("1.2 graph-view leaf exists", async () => {
    const info = await getViewInfo();
    expect(info).not.toBeNull();
    expect(info!.leafCount).toBeGreaterThanOrEqual(1);
    console.log("View info:", JSON.stringify(info));
  });

  test("1.3 graph has nodes and edges", async () => {
    const info = await getViewInfo();
    expect(info!.nodeCount).toBeGreaterThan(0);
    expect(info!.edgeCount).toBeGreaterThan(0);
    console.log(`Nodes: ${info!.nodeCount}, Edges: ${info!.edgeCount}`);
  });

  test("1.4 PIXI.js app initialized", async () => {
    const info = await getViewInfo();
    expect(info!.hasPixiApp).toBe(true);
  });

  test("1.5 canvas element present", async () => {
    const count = await page.evaluate(() => document.querySelectorAll("canvas").length);
    expect(count).toBeGreaterThan(0);
  });
});

// =========================================================================
// 2. Duplicate View Bug Check
// =========================================================================
test.describe("2. Duplicate View Detection", () => {
  test("2.1 only one graph-view leaf after cleanup", async () => {
    const count = await page.evaluate(() => {
      return (window as any).app.workspace.getLeavesOfType("graph-view").length;
    });
    console.log("Graph-view leaf count after cleanup:", count);
    expect(count).toBe(1);
  });

  test("2.2 opening command does not create duplicate", async () => {
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(2000);

    const count = await page.evaluate(() => {
      return (window as any).app.workspace.getLeavesOfType("graph-view").length;
    });
    console.log("After re-open command, leaf count:", count);
    // BUG if count > 1: command creates duplicate instead of focusing existing
  });
});

// =========================================================================
// 3. Settings Access & Plugin Settings
// =========================================================================
test.describe("3. Settings", () => {
  test("3.1 plugin settings object exists", async () => {
    const r = await page.evaluate(() => {
      const plugin = (window as any).app.plugins.plugins["graph-island"];
      if (!plugin?.settings) return null;
      return Object.keys(plugin.settings);
    });
    console.log("Plugin settings keys:", JSON.stringify(r));
    expect(r).not.toBeNull();
    expect(r!.length).toBeGreaterThan(0);
  });

  test("3.2 settings contain layout type", async () => {
    const r = await page.evaluate(() => {
      const plugin = (window as any).app.plugins.plugins["graph-island"];
      return {
        layoutType: plugin?.settings?.layoutType,
        hasLayoutType: "layoutType" in (plugin?.settings ?? {}),
      };
    });
    console.log("Layout setting:", JSON.stringify(r));
  });

  test("3.3 view getState/setState roundtrip", async () => {
    const r = await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      if (leaves.length === 0) return { error: "no view" };
      const view = leaves[0].view;
      const state = view.getState?.();
      return { hasGetState: typeof view.getState === "function", state: state ? Object.keys(state) : null };
    });
    console.log("State roundtrip:", JSON.stringify(r));
  });
});

// =========================================================================
// 4. DOM Structure
// =========================================================================
test.describe("4. DOM Structure", () => {
  test("4.1 graph-container exists", async () => {
    const count = await page.evaluate(() => document.querySelectorAll(".graph-container").length);
    console.log("graph-container count:", count);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("4.2 graph-toolbar exists with children", async () => {
    const r = await page.evaluate(() => {
      const toolbars = document.querySelectorAll(".graph-toolbar");
      return Array.from(toolbars).map(t => ({
        childCount: t.children.length,
        visible: t.getBoundingClientRect().width > 0,
      }));
    });
    console.log("Toolbars:", JSON.stringify(r));
  });

  test("4.3 graph-panel exists with sections", async () => {
    const r = await page.evaluate(() => {
      const panels = document.querySelectorAll(".graph-panel");
      return Array.from(panels).map(p => ({
        childCount: p.children.length,
        visible: p.getBoundingClientRect().width > 0,
        sectionHeaders: Array.from(p.querySelectorAll(".graph-control-section-header")).map(h => h.textContent?.trim()),
      }));
    });
    console.log("Panels:", JSON.stringify(r));
  });

  test("4.4 graph-status shows info", async () => {
    const r = await page.evaluate(() => {
      const statuses = document.querySelectorAll(".graph-status");
      return Array.from(statuses).map(s => ({
        text: s.textContent?.trim(),
        visible: s.getBoundingClientRect().width > 0,
      }));
    });
    console.log("Status bars:", JSON.stringify(r));
  });
});

// =========================================================================
// 5. Panel Interactions — Toggle Sections
// =========================================================================
test.describe("5. Panel Section Toggles", () => {
  test("5.1 collapse/expand all panel sections", async () => {
    const r = await page.evaluate(() => {
      const headers = document.querySelectorAll(".graph-panel .graph-control-section-header.is-clickable");
      const results: any[] = [];
      for (const h of headers) {
        const section = h.closest(".graph-control-section, .tree-item");
        const wasClosed = section?.classList.contains("is-collapsed");
        (h as HTMLElement).click();
        const isNowClosed = section?.classList.contains("is-collapsed");
        results.push({
          text: h.textContent?.trim(),
          wasClosed,
          isNowClosed,
          toggled: wasClosed !== isNowClosed,
        });
      }
      return results;
    });
    console.log("Section toggles:", JSON.stringify(r));
  });
});

// =========================================================================
// 6. Layout Switching via UI
// =========================================================================
test.describe("6. Layout Switching", () => {
  test("6.1 find layout selector", async () => {
    const r = await page.evaluate(() => {
      // Look for select elements in graph panels
      const selects = document.querySelectorAll(".graph-panel select, .graph-container select");
      return Array.from(selects).map(s => ({
        options: Array.from((s as HTMLSelectElement).options).map(o => ({ value: o.value, text: o.text })),
        currentValue: (s as HTMLSelectElement).value,
        name: (s as HTMLSelectElement).name || s.getAttribute("data-setting"),
      }));
    });
    console.log("Select elements:", JSON.stringify(r, null, 2));
  });

  test("6.2 find all setting controls", async () => {
    const r = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return null;
      const controls: any[] = [];
      // Checkboxes
      panel.querySelectorAll("input[type='checkbox']").forEach(c => {
        const label = c.closest(".setting-item, .tree-item-self")?.textContent?.trim()?.slice(0, 50);
        controls.push({ type: "checkbox", checked: (c as HTMLInputElement).checked, label });
      });
      // Selects
      panel.querySelectorAll("select").forEach(s => {
        controls.push({
          type: "select",
          value: (s as HTMLSelectElement).value,
          options: Array.from((s as HTMLSelectElement).options).map(o => o.value),
        });
      });
      // Range sliders
      panel.querySelectorAll("input[type='range']").forEach(r => {
        controls.push({
          type: "range",
          value: (r as HTMLInputElement).value,
          min: (r as HTMLInputElement).min,
          max: (r as HTMLInputElement).max,
        });
      });
      // Text inputs
      panel.querySelectorAll("input[type='text'], input:not([type])").forEach(i => {
        const label = i.closest(".setting-item, .tree-item-self")?.textContent?.trim()?.slice(0, 50);
        controls.push({ type: "text", value: (i as HTMLInputElement).value, placeholder: (i as HTMLInputElement).placeholder, label });
      });
      return controls;
    });
    console.log("Panel controls:", JSON.stringify(r, null, 2));
  });

  test("6.3 switch layout via select dropdown", async () => {
    const layouts = ["force", "cluster-force", "concentric", "tree", "arc", "sunburst", "timeline"];
    const results: any[] = [];

    for (const layout of layouts) {
      const result = await page.evaluate(async (lname) => {
        const panel = document.querySelector(".graph-panel");
        if (!panel) return { layout: lname, error: "no panel" };

        const selects = panel.querySelectorAll("select");
        for (const s of selects) {
          const opts = Array.from((s as HTMLSelectElement).options).map(o => o.value);
          if (opts.includes(lname)) {
            (s as HTMLSelectElement).value = lname;
            s.dispatchEvent(new Event("change", { bubbles: true }));
            return { layout: lname, changed: true, selectOpts: opts };
          }
        }
        return { layout: lname, error: "no matching select" };
      }, layout);

      results.push(result);
      await page.waitForTimeout(2000);

      // Check canvas still alive
      const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
      if (!canvasOk) {
        results.push({ layout, CRASH: "canvas disappeared!" });
      }
    }

    console.log("Layout switch results:", JSON.stringify(results, null, 2));
  });
});

// =========================================================================
// 7. Checkbox Toggle Tests
// =========================================================================
test.describe("7. Checkbox Toggles", () => {
  test("7.1 toggle each checkbox and verify no crash", async () => {
    const r = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return { error: "no panel" };

      const checkboxes = panel.querySelectorAll("input[type='checkbox']");
      const results: any[] = [];

      for (const cb of checkboxes) {
        const input = cb as HTMLInputElement;
        const label = input.closest(".setting-item, .tree-item-self, label")?.textContent?.trim()?.slice(0, 60);
        const before = input.checked;
        input.click();
        const after = input.checked;
        results.push({ label, before, after, toggled: before !== after });
      }

      return results;
    });
    console.log("Checkbox toggles:", JSON.stringify(r, null, 2));
    await page.waitForTimeout(2000);

    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });

  test("7.2 toggle checkboxes back to original", async () => {
    await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel) return;
      const checkboxes = panel.querySelectorAll("input[type='checkbox']");
      for (const cb of checkboxes) {
        (cb as HTMLInputElement).click();
      }
    });
    await page.waitForTimeout(2000);
  });
});

// =========================================================================
// 8. Toolbar Buttons
// =========================================================================
test.describe("8. Toolbar Buttons", () => {
  test("8.1 enumerate toolbar buttons", async () => {
    const r = await page.evaluate(() => {
      const toolbars = document.querySelectorAll(".graph-toolbar");
      const allButtons: any[] = [];
      for (const tb of toolbars) {
        const btns = tb.querySelectorAll("button, .clickable-icon");
        for (const b of btns) {
          allButtons.push({
            ariaLabel: b.getAttribute("aria-label"),
            title: b.getAttribute("title"),
            text: b.textContent?.trim()?.slice(0, 30),
            class: b.className?.slice(0, 50),
          });
        }
      }
      return allButtons;
    });
    console.log("Toolbar buttons:", JSON.stringify(r, null, 2));
  });

  test("8.2 click each toolbar button (no crash)", async () => {
    // Get button count first
    const btnCount = await page.evaluate(() => {
      const toolbar = document.querySelector(".graph-toolbar");
      return toolbar?.querySelectorAll("button").length ?? 0;
    });

    for (let i = 0; i < btnCount; i++) {
      const result = await page.evaluate((idx) => {
        const toolbar = document.querySelector(".graph-toolbar");
        const btns = toolbar?.querySelectorAll("button");
        if (!btns || !btns[idx]) return { error: "no button" };
        const btn = btns[idx] as HTMLButtonElement;
        const info = { ariaLabel: btn.getAttribute("aria-label"), text: btn.textContent?.trim() };
        btn.click();
        return info;
      }, i);

      console.log(`  Button ${i}:`, JSON.stringify(result));
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(1000);
    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });
});

// =========================================================================
// 9. Preset Buttons
// =========================================================================
test.describe("9. Preset Buttons", () => {
  test("9.1 find and click preset buttons", async () => {
    const r = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const presetKeywords = ["simple", "analysis", "creative", "シンプル", "分析", "クリエイティブ"];
      const found = btns.filter(b => {
        const txt = (b.textContent || "").toLowerCase();
        return presetKeywords.some(k => txt.includes(k));
      });
      return found.map(b => ({
        text: b.textContent?.trim()?.slice(0, 40),
        class: b.className?.slice(0, 60),
      }));
    });
    console.log("Preset buttons found:", JSON.stringify(r));

    // Click each
    for (let i = 0; i < r.length; i++) {
      await page.evaluate((text) => {
        const btns = Array.from(document.querySelectorAll("button"));
        const btn = btns.find(b => b.textContent?.includes(text.split("(")[0].trim()));
        if (btn) btn.click();
      }, r[i].text || "");
      await page.waitForTimeout(2000);

      const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
      console.log(`  After preset "${r[i].text}": canvas ok = ${canvasOk}`);
      expect(canvasOk).toBe(true);
    }
  });
});

// =========================================================================
// 10. Zoom/Pan Interactions
// =========================================================================
test.describe("10. Zoom & Pan", () => {
  test("10.1 zoom via mouse wheel", async () => {
    const canvas = page.locator("canvas").first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(500);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(500);
      }
    }
    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });

  test("10.2 pan via mouse drag", async () => {
    const canvas = page.locator("canvas").first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 150, cy + 100, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(500);
      }
    }
    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });
});

// =========================================================================
// 11. Node Interaction
// =========================================================================
test.describe("11. Node Click", () => {
  test("11.1 click on canvas center (simulating node click)", async () => {
    const canvas = page.locator("canvas").first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        // Single click
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(1000);

        // Check if node-detail view updated
        const detail = await page.evaluate(() => {
          const leaves = (window as any).app.workspace.getLeavesOfType("graph-node-detail");
          if (leaves.length === 0) return null;
          return { exists: true, content: leaves[0].view.contentEl?.textContent?.trim()?.slice(0, 100) };
        });
        console.log("Node detail after click:", JSON.stringify(detail));
      }
    }
  });

  test("11.2 double-click opens file", async () => {
    // This tests whether double-clicking a node opens the corresponding file
    // We can't target a specific node since PIXI is canvas-based, but we check the mechanism
    const r = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return { error: "no view" };
      return {
        hasOpenFile: typeof view.openFile === "function",
        hasDblClickHandler: typeof view.handleSuperNodeDblClick === "function",
      };
    });
    console.log("Double-click capability:", JSON.stringify(r));
  });
});

// =========================================================================
// 12. Close & Reopen
// =========================================================================
test.describe("12. Close & Reopen", () => {
  test("12.1 close and reopen graph view", async () => {
    // Close
    await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
      leaves.forEach((l: any) => l.detach());
    });
    await page.waitForTimeout(1000);

    // Verify closed
    const afterClose = await page.evaluate(() => ({
      leaves: (window as any).app.workspace.getLeavesOfType("graph-view").length,
      containers: document.querySelectorAll(".graph-container").length,
    }));
    console.log("After close:", JSON.stringify(afterClose));
    expect(afterClose.leaves).toBe(0);

    // Reopen
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(3000);

    const afterReopen = await page.evaluate(() => ({
      leaves: (window as any).app.workspace.getLeavesOfType("graph-view").length,
      containers: document.querySelectorAll(".graph-container").length,
      hasCanvas: document.querySelectorAll("canvas").length > 0,
    }));
    console.log("After reopen:", JSON.stringify(afterReopen));
    expect(afterReopen.leaves).toBeGreaterThanOrEqual(1);
    expect(afterReopen.hasCanvas).toBe(true);
  });
});

// =========================================================================
// 13. Console Error Collection
// =========================================================================
test.describe("13. Error Collection", () => {
  test("13.1 collect JS errors during stress test", async () => {
    const errors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Rapid operations
    await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return;

      // Check for programmatic access to settings
      const plugin = (window as any).app.plugins.plugins["graph-island"];
      if (!plugin?.settings) return;

      // Rapid layout changes via plugin settings
      const layouts = ["force", "concentric", "tree", "arc", "force"];
      for (const l of layouts) {
        plugin.settings.layoutType = l;
      }
    });

    await page.waitForTimeout(3000);

    if (errors.length > 0) {
      console.log("=== JS ERRORS FOUND ===");
      errors.forEach((e, i) => console.log(`  Error ${i}: ${e.slice(0, 200)}`));
    } else {
      console.log("No JS errors during stress test");
    }
  });
});

// =========================================================================
// 14. Edge Case — Empty Filter
// =========================================================================
test.describe("14. Edge Cases", () => {
  test("14.1 set invalid filter query", async () => {
    const r = await page.evaluate(() => {
      const plugin = (window as any).app.plugins.plugins["graph-island"];
      if (!plugin?.settings) return { error: "no settings" };
      const prev = plugin.settings.filterQuery;
      plugin.settings.filterQuery = "invalid:::broken(((";
      return { prev, set: plugin.settings.filterQuery };
    });
    console.log("Invalid filter:", JSON.stringify(r));
    await page.waitForTimeout(2000);

    // Canvas should survive
    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);

    // Reset
    await page.evaluate(() => {
      const plugin = (window as any).app.plugins.plugins["graph-island"];
      if (plugin?.settings) plugin.settings.filterQuery = "";
    });
  });

  test("14.2 resize window", async () => {
    const original = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

    // Trigger resize event
    await page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(1000);

    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });

  test("14.3 rawData node structure sample", async () => {
    const r = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view?.rawData?.nodes) return null;
      const node = view.rawData.nodes[0];
      return { keys: Object.keys(node), sample: JSON.stringify(node).slice(0, 300) };
    });
    console.log("Node structure:", JSON.stringify(r, null, 2));
  });

  test("14.4 rawData edge structure sample", async () => {
    const r = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view?.rawData?.edges) return null;
      const edge = view.rawData.edges[0];
      return { keys: Object.keys(edge), sample: JSON.stringify(edge).slice(0, 300) };
    });
    console.log("Edge structure:", JSON.stringify(r, null, 2));
  });
});

// =========================================================================
// 15. Screenshot for visual verification
// =========================================================================
test.describe("15. Visual Check", () => {
  test("15.1 take screenshot of current state", async () => {
    await page.screenshot({ path: "e2e/screenshot-e2e-state.png", fullPage: false });
    console.log("Screenshot saved to e2e/screenshot-e2e-state.png");
  });
});
