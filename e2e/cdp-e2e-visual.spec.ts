// ---------------------------------------------------------------------------
// CDP E2E Visual & Deep Bug Tests
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

  // Ensure exactly 1 graph-view, reset to force layout
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    if (leaves.length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(2000);

  // Reset to force layout
  await page.evaluate(async () => {
    const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      const state = view.getState();
      await view.setState({ ...state, layout: "force" }, {});
    }
  });
  await page.waitForTimeout(3000);
});

// =========================================================================
// VISUAL-1: Layout rendering quality
// =========================================================================
test.describe("VISUAL-1: Layout Rendering", () => {
  const layouts = ["force", "cluster-force", "concentric", "tree", "arc", "sunburst", "timeline"];

  for (const layout of layouts) {
    test(`V1.${layouts.indexOf(layout)} screenshot ${layout} layout`, async () => {
      await page.evaluate(async (lname) => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!view) return;
        const state = view.getState();
        await view.setState({ ...state, layout: lname }, {});
      }, layout);
      await page.waitForTimeout(4000);

      // Check node visibility
      const nodeInfo = await page.evaluate(() => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!view) return null;

        // Check pixiNodes
        const pixiNodeIds = view.pixiNodes ? Object.keys(view.pixiNodes) : [];
        let visibleCount = 0;
        let offscreenCount = 0;

        if (view.pixiApp && view.worldContainer) {
          const bounds = view.pixiApp.screen;
          for (const id of pixiNodeIds) {
            const pn = view.pixiNodes[id];
            if (pn && pn.position) {
              // Transform to screen coords
              const global = view.worldContainer.toGlobal?.(pn.position) ?? pn.position;
              if (global.x >= 0 && global.x <= bounds.width && global.y >= 0 && global.y <= bounds.height) {
                visibleCount++;
              } else {
                offscreenCount++;
              }
            }
          }
        }

        return {
          rawNodeCount: view.rawData?.nodes?.length ?? -1,
          pixiNodeCount: pixiNodeIds.length,
          visibleInViewport: visibleCount,
          offscreen: offscreenCount,
          statusText: document.querySelector(".graph-status")?.textContent?.trim(),
        };
      });
      console.log(`  ${layout}: ${JSON.stringify(nodeInfo)}`);

      await page.screenshot({ path: `e2e/screenshot-${layout}.png`, fullPage: false });

      // Canvas should exist
      const canvasOk = await page.evaluate(() => document.querySelectorAll("canvas").length > 0);
      expect(canvasOk).toBe(true);
    });
  }
});

// =========================================================================
// VISUAL-2: Node rendering after "fit to view"
// =========================================================================
test.describe("VISUAL-2: Fit to View", () => {
  test("V2.1 click fit-to-view button and check rendering", async () => {
    // Reset to force
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (view) {
        const state = view.getState();
        await view.setState({ ...state, layout: "force" }, {});
      }
    });
    await page.waitForTimeout(3000);

    // Click "全体俯瞰" (fit to view) button
    await page.evaluate(() => {
      const btns = document.querySelectorAll(".graph-toolbar-btn");
      for (const btn of btns) {
        if (btn.getAttribute("aria-label")?.includes("全体俯瞰")) {
          (btn as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshot-fit-to-view.png", fullPage: false });

    // Check if nodes are visible
    const nodeInfo = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;
      const pixiNodeIds = view.pixiNodes ? Object.keys(view.pixiNodes) : [];
      return {
        pixiNodeCount: pixiNodeIds.length,
        statusText: document.querySelector(".graph-status")?.textContent?.trim(),
      };
    });
    console.log("After fit-to-view:", JSON.stringify(nodeInfo));
  });
});

// =========================================================================
// VISUAL-3: Color group label bug
// =========================================================================
test.describe("VISUAL-3: Color Group Labels", () => {
  test("V3.1 color group labels showing array indices", async () => {
    const r = await page.evaluate(() => {
      // Open panel first
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
      return null;
    });
    await page.waitForTimeout(500);

    const labels = await page.evaluate(() => {
      const groups = document.querySelectorAll(".gi-color-group-label, .graph-color-group-label");
      return Array.from(groups).map(g => g.textContent?.trim());
    });
    console.log("Color group labels:", JSON.stringify(labels));

    // Check for array index pattern (related.0, related.1, similar.0, etc.)
    const indexPattern = labels.filter(l => l && /\.\d+$/.test(l));
    if (indexPattern.length > 0) {
      console.log("*** BUG: Color group labels show array indices instead of values:", indexPattern);
    }
  });
});

// =========================================================================
// VISUAL-4: Panel sections detailed analysis
// =========================================================================
test.describe("VISUAL-4: Panel Content", () => {
  test("V4.1 dump all panel section contents", async () => {
    // Ensure panel is open
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

    const r = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel || panel.getBoundingClientRect().width === 0) return { error: "no visible panel" };

      const sections = panel.querySelectorAll(".graph-control-section, .tree-item");
      return Array.from(sections).map(s => {
        const header = s.querySelector(".graph-control-section-header");
        const content = s.querySelector(".tree-item-children");
        return {
          header: header?.textContent?.trim(),
          collapsed: s.classList.contains("is-collapsed"),
          childElements: content ? content.children.length : -1,
          contentSnippet: content?.textContent?.trim()?.slice(0, 100),
        };
      });
    });
    console.log("Panel sections:", JSON.stringify(r, null, 2));
  });

  test("V4.2 check for layout type selector absence", async () => {
    const r = await page.evaluate(() => {
      const panel = document.querySelector(".graph-panel");
      if (!panel || panel.getBoundingClientRect().width === 0) return { error: "panel not visible" };

      // Search all text content for layout-related words
      const allText = panel.textContent || "";
      const hasLayoutWord = allText.includes("レイアウト") || allText.includes("layout") || allText.includes("Layout");

      // Look for any select with layout options
      const selects = panel.querySelectorAll("select");
      const layoutSelects = Array.from(selects).filter(s => {
        const opts = Array.from((s as HTMLSelectElement).options).map(o => o.value);
        return opts.some(o => ["force", "cluster-force", "arc", "timeline"].includes(o));
      });

      return {
        hasLayoutWord,
        layoutSelectCount: layoutSelects.length,
        totalSelects: selects.length,
        panelTextSnippets: allText.match(/(レイアウト|layout|Layout|force|cluster)/gi),
      };
    });
    console.log("Layout selector check:", JSON.stringify(r));
    if (r && !r.error && r.layoutSelectCount === 0) {
      console.log("*** BUG CONFIRMED: No layout type selector in the UI panel ***");
      console.log("*** Users cannot switch between force/cluster-force/concentric/tree/arc/sunburst/timeline ***");
    }
  });
});

// =========================================================================
// VISUAL-5: Node Detail Panel
// =========================================================================
test.describe("VISUAL-5: Node Detail", () => {
  test("V5.1 check node detail sidebar", async () => {
    const r = await page.evaluate(() => {
      const leaves = (window as any).app.workspace.getLeavesOfType("graph-node-detail");
      if (leaves.length === 0) return { exists: false };
      const view = leaves[0].view;
      return {
        exists: true,
        bodyText: view.bodyEl?.textContent?.trim()?.slice(0, 200),
        hasHold: !!view.holdBtn,
        isHeld: !!view.held,
      };
    });
    console.log("Node detail:", JSON.stringify(r));
  });
});

// =========================================================================
// VISUAL-6: Stale pixiNodes after layout switch
// =========================================================================
test.describe("VISUAL-6: PixiNodes Staleness", () => {
  test("V6.1 pixiNodes empty after layout changes", async () => {
    const results: any[] = [];
    const layouts = ["force", "cluster-force", "concentric"];

    for (const layout of layouts) {
      await page.evaluate(async (lname) => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (view) {
          const state = view.getState();
          await view.setState({ ...state, layout: lname }, {});
        }
      }, layout);
      await page.waitForTimeout(4000);

      const info = await page.evaluate(() => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!view) return null;
        const pixiNodeIds = view.pixiNodes ? Object.keys(view.pixiNodes) : [];
        const rawNodeCount = view.rawData?.nodes?.length ?? -1;

        // Check worldContainer children
        const worldChildren = view.worldContainer?.children?.length ?? -1;

        // Check nodeCircleBatch
        const batchChildren = view.nodeCircleBatch?.children?.length ?? -1;

        return {
          layout,
          rawNodes: rawNodeCount,
          pixiNodeCount: pixiNodeIds.length,
          worldChildren,
          batchChildren,
          statusText: document.querySelector(".graph-status")?.textContent?.trim(),
        };
      });
      results.push(info);
    }

    console.log("PixiNodes after layout switches:");
    for (const r of results) {
      console.log(`  ${JSON.stringify(r)}`);
      if (r && r.pixiNodeCount === 0 && r.rawNodes > 0) {
        console.log(`  *** BUG: pixiNodes empty for ${r.layout} layout despite ${r.rawNodes} raw nodes ***`);
      }
    }
  });
});

// =========================================================================
// VISUAL-7: Enclosure labels & tag display
// =========================================================================
test.describe("VISUAL-7: Enclosure Display", () => {
  test("V7.1 check enclosure label rendering", async () => {
    const r = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;

      return {
        hasEnclosureGraphics: !!view.enclosureGraphics,
        hasEnclosureLabelContainer: !!view.enclosureLabelContainer,
        enclosureLabelChildren: view.enclosureLabelContainer?.children?.length ?? -1,
        enclosureGraphicsChildren: view.enclosureGraphics?.children?.length ?? -1,
      };
    });
    console.log("Enclosure info:", JSON.stringify(r));
  });
});

// =========================================================================
// VISUAL-8: Comprehensive state dump for all views
// =========================================================================
test.describe("VISUAL-8: Full State Dump", () => {
  test("V8.1 dump complete panel state", async () => {
    const r = await page.evaluate(() => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (!view) return null;
      const state = view.getState();
      return state;
    });
    console.log("Complete view state:", JSON.stringify(r, null, 2).slice(0, 3000));
  });
});

// =========================================================================
// Screenshots per layout
// =========================================================================
test.describe("VISUAL-9: Final Screenshots", () => {
  test("V9.1 reset to force and screenshot", async () => {
    await page.evaluate(async () => {
      const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
      if (view) {
        const state = view.getState();
        await view.setState({ ...state, layout: "force" }, {});
      }
    });
    await page.waitForTimeout(4000);

    // Fit to view
    await page.evaluate(() => {
      const btns = document.querySelectorAll(".graph-toolbar-btn");
      for (const btn of btns) {
        if (btn.getAttribute("aria-label")?.includes("全体俯瞰")) {
          (btn as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshot-final-force.png", fullPage: false });
    console.log("Final force screenshot saved");
  });
});
