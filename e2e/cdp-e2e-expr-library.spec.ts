/**
 * E2E: Verify the Expression Library UI exists and clicking entries
 * applies the correct layout with proper shapes.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  expect(contexts.length).toBeGreaterThan(0);
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();

  // Reload plugin
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  // Close stale leaves, open fresh graph view
  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace.getLeavesOfType("graph-view").forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
});

test.afterAll(async () => {});

/**
 * Helper: Switch to custom arrangement so coordinate controls appear,
 * then interact with the expression library.
 */
async function setupCustomArrangement(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return;
    const view = leaves[0].view as any;
    const panel = typeof view.getPanel === "function" ? view.getPanel() : view.panelState;
    if (!panel) return;
    panel.clusterArrangement = "custom";
    panel.coordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    if (typeof view.applyClusterForce === "function") view.applyClusterForce();
    if (typeof view.rebuildPanel === "function") view.rebuildPanel();
    await new Promise(r => setTimeout(r, 1000));
  });
}

// =========================================================================
// Test 01: Library UI exists with entries
// =========================================================================

test("01 — expression library UI exists with entries", async () => {
  test.setTimeout(30_000);
  await setupCustomArrangement(page);

  const libraryInfo = await page.evaluate(() => {
    const header = document.querySelector(".gi-expr-library-header");
    const body = document.querySelector(".gi-expr-library-body");
    const items = document.querySelectorAll(".gi-expr-library-item");
    const helpBtn = document.querySelector(".gi-expr-library .gi-help-btn");

    return {
      hasHeader: !!header,
      headerText: header?.textContent?.trim() ?? "",
      hasBody: !!body,
      bodyVisible: body ? (body as HTMLElement).style.display !== "none" : false,
      itemCount: items.length,
      itemNames: Array.from(items).map(i =>
        i.querySelector(".gi-expr-library-name")?.textContent ?? ""
      ),
      hasHelpBtn: !!helpBtn,
    };
  });

  console.log(`Library UI: header="${libraryInfo.headerText}", items=${libraryInfo.itemCount}`);
  console.log(`  names: ${JSON.stringify(libraryInfo.itemNames)}`);

  expect(libraryInfo.hasHeader).toBe(true);
  expect(libraryInfo.itemCount).toBeGreaterThan(5);
  expect(libraryInfo.itemNames).toContain("Grid");
  expect(libraryInfo.itemNames).toContain("Triangle");
  expect(libraryInfo.itemNames).toContain("Sunflower");
  expect(libraryInfo.hasHelpBtn).toBe(true);

  await page.screenshot({ path: "e2e/screenshot-library-01-ui.png", fullPage: false });
});

// =========================================================================
// Test 02: Click "Grid" entry → applies grid layout
// =========================================================================

test("02 — click Grid entry applies grid layout", async () => {
  test.setTimeout(40_000);

  // Open the library body first
  await page.evaluate(() => {
    const header = document.querySelector(".gi-expr-library-header") as HTMLElement;
    const body = document.querySelector(".gi-expr-library-body") as HTMLElement;
    if (body && body.style.display === "none") {
      header?.click();
    }
  });
  await page.waitForTimeout(300);

  // Click the "Grid" entry
  await page.evaluate(async () => {
    const items = document.querySelectorAll(".gi-expr-library-item");
    for (const item of items) {
      const name = item.querySelector(".gi-expr-library-name")?.textContent;
      if (name === "Grid") {
        (item as HTMLElement).click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 5000));

    // Fit view
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length) {
      const view = leaves[0].view as any;
      const wrap = view.canvasWrap;
      if (wrap && typeof view.autoFitView === "function") {
        view.autoFitView(wrap.clientWidth, wrap.clientHeight);
      }
      if (typeof view.markDirty === "function") view.markDirty();
      if (typeof view.doRender === "function") view.doRender();
    }
    await new Promise(r => setTimeout(r, 2000));
  });

  // Check positions
  const result = await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return { count: 0, positions: [], textareas: [] };
    const view = leaves[0].view as any;
    const positions: { x: number; y: number }[] = [];
    if (view.pixiNodes instanceof Map) {
      let i = 0;
      for (const [, pn] of view.pixiNodes) {
        if (i++ >= 80) break;
        positions.push({
          x: Math.round((pn as any).gfx?.x ?? (pn as any).x ?? 0),
          y: Math.round((pn as any).gfx?.y ?? (pn as any).y ?? 0),
        });
      }
    }
    // Read textareas
    const textareas: string[] = [];
    document.querySelectorAll(".gi-expr-textarea").forEach(ta => {
      textareas.push((ta as HTMLTextAreaElement).value);
    });
    return { count: positions.length, positions, textareas };
  });

  console.log(`Grid via library: ${result.count} nodes`);
  console.log(`  textareas: ${JSON.stringify(result.textareas)}`);

  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X: ${xs.size}, unique Y: ${ys.size}`);
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  }

  // Verify textarea shows the grid expression
  expect(result.textareas.length).toBeGreaterThanOrEqual(2);
  expect(result.textareas[0]).toContain("ceil(sqrt(n))");

  await page.screenshot({ path: "e2e/screenshot-library-02-grid.png", fullPage: false });
});

// =========================================================================
// Test 03: Click "Triangle" entry → applies triangle layout
// =========================================================================

test("03 — click Triangle entry applies triangle layout", async () => {
  test.setTimeout(40_000);

  // Ensure library is open
  await page.evaluate(() => {
    const body = document.querySelector(".gi-expr-library-body") as HTMLElement;
    if (body && body.style.display === "none") {
      const header = document.querySelector(".gi-expr-library-header") as HTMLElement;
      header?.click();
    }
  });
  await page.waitForTimeout(300);

  // Click "Triangle"
  await page.evaluate(async () => {
    const items = document.querySelectorAll(".gi-expr-library-item");
    for (const item of items) {
      if (item.querySelector(".gi-expr-library-name")?.textContent === "Triangle") {
        (item as HTMLElement).click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 5000));
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length) {
      const view = leaves[0].view as any;
      const wrap = view.canvasWrap;
      if (wrap && typeof view.autoFitView === "function") {
        view.autoFitView(wrap.clientWidth, wrap.clientHeight);
      }
      if (typeof view.markDirty === "function") view.markDirty();
      if (typeof view.doRender === "function") view.doRender();
    }
    await new Promise(r => setTimeout(r, 2000));
  });

  const result = await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (!leaves.length) return { count: 0, positions: [], textareas: [] };
    const view = leaves[0].view as any;
    const positions: { x: number; y: number }[] = [];
    if (view.pixiNodes instanceof Map) {
      let i = 0;
      for (const [, pn] of view.pixiNodes) {
        if (i++ >= 80) break;
        positions.push({
          x: Math.round((pn as any).gfx?.x ?? (pn as any).x ?? 0),
          y: Math.round((pn as any).gfx?.y ?? (pn as any).y ?? 0),
        });
      }
    }
    const textareas: string[] = [];
    document.querySelectorAll(".gi-expr-textarea").forEach(ta => {
      textareas.push((ta as HTMLTextAreaElement).value);
    });
    return { count: positions.length, positions, textareas };
  });

  console.log(`Triangle via library: ${result.count} nodes`);
  if (result.positions.length >= 4) {
    const xs = new Set(result.positions.map(p => p.x));
    const ys = new Set(result.positions.map(p => p.y));
    console.log(`  unique X: ${xs.size}, unique Y: ${ys.size}`);
    expect(ys.size).toBeGreaterThan(1);
  }

  expect(result.textareas.length).toBeGreaterThanOrEqual(2);

  await page.screenshot({ path: "e2e/screenshot-library-03-triangle.png", fullPage: false });
});

// =========================================================================
// Test 04: Help popup shows expression reference
// =========================================================================

test("04 — help popup shows expression reference", async () => {
  test.setTimeout(20_000);

  const helpInfo = await page.evaluate(() => {
    // Click help button
    const helpBtn = document.querySelector(".gi-expr-library .gi-help-btn") as HTMLElement;
    if (helpBtn) helpBtn.click();

    // Wait a tick
    return new Promise<{ hasPopup: boolean; text: string }>(resolve => {
      setTimeout(() => {
        const popup = document.querySelector(".gi-expr-library .gi-help-popup");
        resolve({
          hasPopup: !!popup,
          text: popup?.textContent?.substring(0, 200) ?? "",
        });
      }, 200);
    });
  });

  console.log(`Help popup: exists=${helpInfo.hasPopup}`);
  console.log(`  text preview: ${helpInfo.text}`);

  expect(helpInfo.hasPopup).toBe(true);
  expect(helpInfo.text).toContain("sin");
  expect(helpInfo.text).toContain("pi");

  await page.screenshot({ path: "e2e/screenshot-library-04-help.png", fullPage: false });
});
