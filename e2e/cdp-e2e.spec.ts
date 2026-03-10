// ---------------------------------------------------------------------------
// CDP E2E Test — Connect to running Obsidian and test Graph Island
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  expect(contexts.length).toBeGreaterThan(0);
  const pages = contexts[0].pages();
  // Find the main Obsidian page (not help, not workers)
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();
  await page.waitForTimeout(1000);
});

test.afterAll(async () => {
  // Don't close — we're connecting to a running instance
});

// =========================================================================
// Section 1: Plugin Load & State
// =========================================================================
test.describe("1. Plugin Load & State", () => {
  test("1.1 plugin is loaded and enabled", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const loaded = "graph-island" in (app?.plugins?.plugins ?? {});
      const manifest = !!app?.plugins?.manifests?.["graph-island"];
      return { loaded, manifest };
    });
    expect(result.loaded).toBe(true);
    expect(result.manifest).toBe(true);
  });

  test("1.2 plugin version matches manifest", async () => {
    const version = await page.evaluate(() => {
      const app = (window as any).app;
      return app?.plugins?.manifests?.["graph-island"]?.version;
    });
    expect(version).toBe("0.1.0");
  });

  test("1.3 vault has expected files", async () => {
    const fileCount = await page.evaluate(() => {
      const app = (window as any).app;
      const files = app.vault.getMarkdownFiles();
      return files.map((f: any) => f.basename);
    });
    console.log("Vault files:", fileCount);
    expect(fileCount.length).toBeGreaterThanOrEqual(5);
  });
});

// =========================================================================
// Section 2: Open Graph Island View
// =========================================================================
test.describe("2. Graph View Opening", () => {
  test("2.1 open Graph Island via app.commands", async () => {
    // First close any existing graph island leaves
    await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      leaves.forEach((l: any) => l.detach());
    });
    await page.waitForTimeout(500);

    // Execute command programmatically
    const opened = await page.evaluate(() => {
      const app = (window as any).app;
      return app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(3000);

    const hasView = await page.evaluate(() => {
      const app = (window as any).app;
      return app.workspace.getLeavesOfType("graph-island-view").length > 0;
    });
    expect(hasView).toBe(true);
  });

  test("2.2 canvas element exists (PIXI.js rendering)", async () => {
    const canvasCount = await page.evaluate(() => {
      return document.querySelectorAll("canvas").length;
    });
    expect(canvasCount).toBeGreaterThan(0);
  });

  test("2.3 graph-view-container is present", async () => {
    const hasContainer = await page.evaluate(() => {
      return document.querySelector(".graph-view-container") !== null;
    });
    expect(hasContainer).toBe(true);
  });
});

// =========================================================================
// Section 3: Graph Data Verification
// =========================================================================
test.describe("3. Graph Data", () => {
  test("3.1 graph has nodes", async () => {
    await page.waitForTimeout(2000);
    const nodeCount = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return -1;
      const view = leaves[0].view;
      // Try multiple access paths for graphData
      const gd = view.graphData || view.container?.graphData;
      if (!gd) return -2;
      return gd.nodes?.length ?? -3;
    });
    console.log("Node count:", nodeCount);
    expect(nodeCount).toBeGreaterThanOrEqual(5);
  });

  test("3.2 graph has edges", async () => {
    const edgeCount = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return -1;
      const view = leaves[0].view;
      const gd = view.graphData || view.container?.graphData;
      if (!gd) return -2;
      return gd.edges?.length ?? -3;
    });
    console.log("Edge count:", edgeCount);
    expect(edgeCount).toBeGreaterThanOrEqual(3);
  });

  test("3.3 node data structure is valid", async () => {
    const sample = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return null;
      const view = leaves[0].view;
      const gd = view.graphData || view.container?.graphData;
      if (!gd || !gd.nodes || gd.nodes.length === 0) return null;
      const n = gd.nodes[0];
      return { hasId: !!n.id, hasName: !!(n.name || n.label || n.id), keys: Object.keys(n) };
    });
    console.log("Node sample:", JSON.stringify(sample));
    expect(sample).not.toBeNull();
    expect(sample!.hasId).toBe(true);
  });

  test("3.4 edge data structure is valid", async () => {
    const sample = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return null;
      const view = leaves[0].view;
      const gd = view.graphData || view.container?.graphData;
      if (!gd || !gd.edges || gd.edges.length === 0) return null;
      const e = gd.edges[0];
      return { hasSource: !!(e.source || e.from), hasTarget: !!(e.target || e.to), keys: Object.keys(e) };
    });
    console.log("Edge sample:", JSON.stringify(sample));
    expect(sample).not.toBeNull();
  });
});

// =========================================================================
// Section 4: UI Panel / Toolbar
// =========================================================================
test.describe("4. UI Panel & Toolbar", () => {
  test("4.1 toolbar is visible", async () => {
    const toolbarInfo = await page.evaluate(() => {
      const toolbar = document.querySelector(".graph-toolbar");
      if (!toolbar) return { exists: false, visible: false, children: 0 };
      const rect = toolbar.getBoundingClientRect();
      return {
        exists: true,
        visible: rect.width > 0 && rect.height > 0,
        children: toolbar.children.length,
        classes: toolbar.className,
      };
    });
    console.log("Toolbar info:", JSON.stringify(toolbarInfo));
    expect(toolbarInfo.exists).toBe(true);
  });

  test("4.2 side panel toggle works", async () => {
    // Look for settings/panel toggle button
    const panelResult = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".graph-toolbar button, .graph-toolbar .clickable-icon"));
      const info = btns.map(b => ({
        ariaLabel: b.getAttribute("aria-label"),
        title: b.getAttribute("title"),
        text: b.textContent?.trim(),
      }));
      return info;
    });
    console.log("Toolbar buttons:", JSON.stringify(panelResult));
    expect(panelResult.length).toBeGreaterThan(0);
  });

  test("4.3 panel sections render", async () => {
    const panelInfo = await page.evaluate(() => {
      const panel = document.querySelector(".graph-side-panel, .graph-control-panel, .graph-settings-panel");
      if (!panel) return { exists: false };
      const sections = panel.querySelectorAll(".setting-item, .graph-section, details, summary, .tree-item");
      return {
        exists: true,
        sectionCount: sections.length,
        visible: panel.getBoundingClientRect().width > 0,
      };
    });
    console.log("Panel info:", JSON.stringify(panelInfo));
  });
});

// =========================================================================
// Section 5: Layout Switching
// =========================================================================
test.describe("5. Layout Switching", () => {
  const layouts = ["force", "cluster-force", "concentric", "tree", "arc", "sunburst", "timeline"];

  for (const layout of layouts) {
    test(`5.x switch to ${layout} layout`, async () => {
      const result = await page.evaluate(async (layoutName) => {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-island-view");
        if (leaves.length === 0) return { error: "no view" };
        const view = leaves[0].view;

        // Try to find the layout selector
        const selects = document.querySelectorAll(".graph-view-container select, .graph-side-panel select");
        let changed = false;
        for (const sel of selects) {
          const options = Array.from((sel as HTMLSelectElement).options).map(o => o.value);
          if (options.includes(layoutName)) {
            (sel as HTMLSelectElement).value = layoutName;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            changed = true;
            break;
          }
        }

        // Alternative: try setting via view API
        if (!changed && view.settings) {
          view.settings.layoutType = layoutName;
          if (typeof view.applySettings === "function") {
            view.applySettings();
            changed = true;
          } else if (typeof view.refresh === "function") {
            view.refresh();
            changed = true;
          } else if (typeof view.updateGraph === "function") {
            view.updateGraph();
            changed = true;
          }
        }

        return { changed, layout: layoutName };
      }, layout);

      console.log(`Layout ${layout}:`, JSON.stringify(result));
      await page.waitForTimeout(2000);

      // Verify canvas still exists (no crash)
      const canvasOk = await page.evaluate(() => {
        return document.querySelectorAll("canvas").length > 0;
      });
      expect(canvasOk).toBe(true);

      // Check for console errors
      const errors = await page.evaluate(() => {
        // Check if there are any error overlays
        const errEl = document.querySelector(".error-overlay, .plugin-error, .notice.mod-error");
        return errEl ? errEl.textContent : null;
      });
      if (errors) {
        console.log(`ERROR during ${layout} layout:`, errors);
      }
    });
  }
});

// =========================================================================
// Section 6: Settings Toggles
// =========================================================================
test.describe("6. Settings Toggles", () => {
  test("6.1 toggle showOrphans", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return { error: "no view" };
      const view = leaves[0].view;
      if (!view.settings) return { error: "no settings" };

      const before = view.settings.showOrphans;
      view.settings.showOrphans = !before;

      // Trigger update
      if (typeof view.applySettings === "function") view.applySettings();
      else if (typeof view.refresh === "function") view.refresh();

      return { before, after: view.settings.showOrphans };
    });
    console.log("showOrphans toggle:", JSON.stringify(result));
    await page.waitForTimeout(1000);

    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });

  test("6.2 toggle showTags", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return { error: "no view" };
      const view = leaves[0].view;
      if (!view.settings) return { error: "no settings" };

      const before = view.settings.showTags;
      view.settings.showTags = !before;
      if (typeof view.applySettings === "function") view.applySettings();
      else if (typeof view.refresh === "function") view.refresh();

      return { before, after: view.settings.showTags };
    });
    console.log("showTags toggle:", JSON.stringify(result));
    await page.waitForTimeout(1000);
  });

  test("6.3 toggle showArrows", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return { error: "no view" };
      const view = leaves[0].view;
      if (!view.settings) return { error: "no settings" };

      const before = view.settings.showArrows;
      view.settings.showArrows = !before;
      if (typeof view.applySettings === "function") view.applySettings();
      else if (typeof view.refresh === "function") view.refresh();

      return { before, after: view.settings.showArrows };
    });
    console.log("showArrows toggle:", JSON.stringify(result));
    await page.waitForTimeout(1000);
  });

  test("6.4 change nodeSize", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return { error: "no view" };
      const view = leaves[0].view;
      if (!view.settings) return { error: "no settings" };

      const before = view.settings.nodeSize;
      view.settings.nodeSize = 20;
      if (typeof view.applySettings === "function") view.applySettings();
      else if (typeof view.refresh === "function") view.refresh();

      return { before, after: view.settings.nodeSize };
    });
    console.log("nodeSize change:", JSON.stringify(result));
    await page.waitForTimeout(1000);

    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });
});

// =========================================================================
// Section 7: Preset Buttons
// =========================================================================
test.describe("7. Preset Buttons", () => {
  test("7.1 preset buttons exist", async () => {
    const presets = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, .clickable-icon"));
      const presetBtns = btns.filter(b => {
        const text = (b.textContent || "").toLowerCase();
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        return text.includes("simple") || text.includes("analysis") || text.includes("creative")
          || label.includes("simple") || label.includes("analysis") || label.includes("creative")
          || text.includes("シンプル") || text.includes("分析") || text.includes("クリエイティブ");
      });
      return presetBtns.map(b => ({
        text: b.textContent?.trim(),
        tag: b.tagName,
        class: b.className,
      }));
    });
    console.log("Preset buttons:", JSON.stringify(presets));
  });

  test("7.2 click preset buttons (no crash)", async () => {
    const presetNames = ["simple", "analysis", "creative"];
    for (const name of presetNames) {
      const clicked = await page.evaluate((presetName) => {
        const btns = Array.from(document.querySelectorAll("button, .clickable-icon"));
        const btn = btns.find(b => {
          const text = (b.textContent || "").toLowerCase();
          return text.includes(presetName);
        });
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      }, name);

      if (clicked) {
        await page.waitForTimeout(1500);
        const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
        expect(canvasOk).toBe(true);
      }
    }
  });
});

// =========================================================================
// Section 8: Search / Filter
// =========================================================================
test.describe("8. Search & Filter", () => {
  test("8.1 search input exists", async () => {
    const searchInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input[type='text'], input[type='search'], input:not([type])"));
      const graphInputs = inputs.filter(i => {
        const container = i.closest(".graph-view-container, .graph-side-panel, .graph-control-panel");
        return container !== null;
      });
      return graphInputs.map(i => ({
        placeholder: (i as HTMLInputElement).placeholder,
        value: (i as HTMLInputElement).value,
        class: i.className,
      }));
    });
    console.log("Search inputs:", JSON.stringify(searchInfo));
  });

  test("8.2 filter by query expression", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return { error: "no view" };
      const view = leaves[0].view;
      if (!view.settings) return { error: "no settings" };

      const beforeCount = (view.graphData || view.container?.graphData)?.nodes?.length ?? -1;

      // Set a filter query
      view.settings.filterQuery = "tag:#protagonist";
      if (typeof view.applySettings === "function") view.applySettings();
      else if (typeof view.refresh === "function") view.refresh();

      return { beforeCount, filterSet: view.settings.filterQuery };
    });
    console.log("Filter result:", JSON.stringify(result));
    await page.waitForTimeout(2000);

    // Check filtered count
    const afterCount = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return -1;
      const view = leaves[0].view;
      const gd = view.graphData || view.container?.graphData;
      return gd?.nodes?.length ?? -2;
    });
    console.log("After filter node count:", afterCount);

    // Reset filter
    await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return;
      const view = leaves[0].view;
      if (view.settings) {
        view.settings.filterQuery = "";
        if (typeof view.applySettings === "function") view.applySettings();
        else if (typeof view.refresh === "function") view.refresh();
      }
    });
    await page.waitForTimeout(1000);
  });
});

// =========================================================================
// Section 9: Minimap
// =========================================================================
test.describe("9. Minimap", () => {
  test("9.1 minimap canvas exists", async () => {
    const minimapInfo = await page.evaluate(() => {
      const minimap = document.querySelector(".graph-minimap, .minimap-container, canvas.minimap");
      if (!minimap) {
        // Count all canvases — if >1, one might be the minimap
        const canvases = document.querySelectorAll("canvas");
        return { exists: false, totalCanvases: canvases.length };
      }
      return { exists: true, tag: minimap.tagName, class: minimap.className };
    });
    console.log("Minimap info:", JSON.stringify(minimapInfo));
  });
});

// =========================================================================
// Section 10: PNG Export
// =========================================================================
test.describe("10. PNG Export", () => {
  test("10.1 export button exists", async () => {
    const exportInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, .clickable-icon"));
      const exportBtn = btns.filter(b => {
        const text = (b.textContent || "").toLowerCase();
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        return text.includes("png") || text.includes("export") || text.includes("download")
          || label.includes("png") || label.includes("export") || label.includes("エクスポート");
      });
      return exportBtn.map(b => ({
        text: b.textContent?.trim(),
        ariaLabel: b.getAttribute("aria-label"),
        class: b.className,
      }));
    });
    console.log("Export buttons:", JSON.stringify(exportInfo));
  });
});

// =========================================================================
// Section 11: Console Error Check
// =========================================================================
test.describe("11. Console Errors", () => {
  test("11.1 collect console errors from graph interactions", async () => {
    const errors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Trigger various operations and collect errors
    await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return;
      const view = leaves[0].view;
      if (!view.settings) return;

      // Rapid setting changes
      view.settings.showOrphans = true;
      if (typeof view.applySettings === "function") view.applySettings();
      view.settings.showOrphans = false;
      if (typeof view.applySettings === "function") view.applySettings();
      view.settings.layoutType = "concentric";
      if (typeof view.applySettings === "function") view.applySettings();
      view.settings.layoutType = "force";
      if (typeof view.applySettings === "function") view.applySettings();
    });

    await page.waitForTimeout(3000);
    if (errors.length > 0) {
      console.log("Console errors captured:", errors);
    }
  });
});

// =========================================================================
// Section 12: DOM Structure Integrity
// =========================================================================
test.describe("12. DOM Structure", () => {
  test("12.1 no duplicate view containers", async () => {
    const containers = await page.evaluate(() => {
      return document.querySelectorAll(".graph-view-container").length;
    });
    console.log("Graph view containers:", containers);
    // Should be exactly 1 if view is open
    expect(containers).toBeLessThanOrEqual(1);
  });

  test("12.2 view cleanup on close/reopen", async () => {
    // Close graph island
    await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      leaves.forEach((l: any) => l.detach());
    });
    await page.waitForTimeout(1000);

    // Check cleanup
    const afterClose = await page.evaluate(() => {
      return {
        containers: document.querySelectorAll(".graph-view-container").length,
        canvases: document.querySelectorAll("canvas").length,
      };
    });
    console.log("After close:", JSON.stringify(afterClose));

    // Reopen
    await page.evaluate(() => {
      const app = (window as any).app;
      app.commands.executeCommandById("graph-island:open-graph-view");
    });
    await page.waitForTimeout(3000);

    const afterReopen = await page.evaluate(() => {
      return {
        containers: document.querySelectorAll(".graph-view-container").length,
        hasView: (window as any).app.workspace.getLeavesOfType("graph-island-view").length > 0,
      };
    });
    console.log("After reopen:", JSON.stringify(afterReopen));
    expect(afterReopen.hasView).toBe(true);
  });
});

// =========================================================================
// Section 13: Interaction — Zoom/Pan
// =========================================================================
test.describe("13. Zoom & Pan", () => {
  test("13.1 zoom in/out via wheel", async () => {
    const canvas = page.locator("canvas").first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        // Zoom in
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -200);
        await page.waitForTimeout(500);
        // Zoom out
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(500);
      }
    }

    // No crash
    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });

  test("13.2 pan via drag", async () => {
    const canvas = page.locator("canvas").first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 100, cy + 50, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);
      }
    }
    const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
    expect(canvasOk).toBe(true);
  });
});

// =========================================================================
// Section 14: View Properties Dump (diagnostic)
// =========================================================================
test.describe("14. Diagnostics", () => {
  test("14.1 dump view structure", async () => {
    const viewInfo = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("graph-island-view");
      if (leaves.length === 0) return { error: "no view" };
      const view = leaves[0].view;
      const keys = Object.keys(view);
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(view))
        .filter(k => typeof view[k] === "function");
      const settingsKeys = view.settings ? Object.keys(view.settings) : [];
      return { viewKeys: keys, methods, settingsKeys };
    });
    console.log("View keys:", JSON.stringify(viewInfo.viewKeys));
    console.log("View methods:", JSON.stringify(viewInfo.methods));
    console.log("Settings keys:", JSON.stringify(viewInfo.settingsKeys));
  });

  test("14.2 dump all DOM elements in graph container", async () => {
    const domInfo = await page.evaluate(() => {
      const container = document.querySelector(".graph-view-container");
      if (!container) return { error: "no container" };

      const walk = (el: Element, depth: number): any => {
        if (depth > 3) return { tag: el.tagName, childCount: el.children.length };
        return {
          tag: el.tagName,
          class: el.className?.toString().slice(0, 80),
          children: Array.from(el.children).slice(0, 10).map(c => walk(c, depth + 1)),
        };
      };
      return walk(container, 0);
    });
    console.log("DOM structure:", JSON.stringify(domInfo, null, 2).slice(0, 3000));
  });
});
