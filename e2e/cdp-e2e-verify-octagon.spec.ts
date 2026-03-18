/**
 * CDP E2E: Verify octagon node shape rendering.
 * Tests that nodeShapeRules with octagon produce correct visual output.
 */
import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";
let browser: Browser;
let page: Page;
test.setTimeout(120_000);

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 2000));
    const leaves = app.workspace.getLeavesOfType("graph-view");
    if (leaves.length === 0) {
      await app.commands.executeCommandById("graph-island:open-graph-view");
      await new Promise(r => setTimeout(r, 4000));
    }
  });
});

function ev(code: string): string {
  return `(async () => {
    const app = window.app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find(l => l.view?.panel) || leaves[0];
    if (!leaf) throw new Error("no leaf");
    const view = leaf.view;
    if (!(view.panel.collapsedGroups instanceof Set)) {
      view.panel.collapsedGroups = new Set(
        Array.isArray(view.panel.collapsedGroups) ? view.panel.collapsedGroups : []
      );
    }
    ${code}
  })()`;
}

function pixelDiff(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) { if (a[i] !== b[i]) diff++; }
  return diff + Math.abs(a.length - b.length);
}

test("nodeShapeRules with octagon renders different from default circle", async () => {
  await page.evaluate(ev(`
    view.panel.searchQuery = "folder:characters";
    view.panel.showOrphans = true;
    view.panel.showTags = false;
    view.panel.showTagNodes = false;
    view.panel.nodeDisplayMode = "node";
    view.panel.nodeShapeRules = [];
    view.panel.collapsedGroups = new Set(["__no_auto_collapse__"]);
    await view.doRender();
  `));
  await page.waitForTimeout(4000);
  const circle = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeShapeRules = [{ match: "*", shape: "octagon" }];
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const octagon = await page.screenshot();

  const diff = pixelDiff(circle, octagon);
  console.log(`Circle vs octagon pixel diff: ${diff}`);
  expect(diff).toBeGreaterThan(100);
});

test("different shape rules produce different visuals", async () => {
  await page.evaluate(ev(`
    view.panel.nodeShapeRules = [{ match: "*", shape: "square" }];
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const square = await page.screenshot();

  await page.evaluate(ev(`
    view.panel.nodeShapeRules = [{ match: "*", shape: "diamond" }];
    await view.doRender();
  `));
  await page.waitForTimeout(3000);
  const diamond = await page.screenshot();

  expect(pixelDiff(square, diamond)).toBeGreaterThan(100);
});

test("nodeShapeRules value persists in panel", async () => {
  await page.evaluate(ev(`
    view.panel.nodeShapeRules = [{ match: "*", shape: "octagon" }];
  `));
  const result: any = await page.evaluate(ev(`
    const rules = view.panel.nodeShapeRules;
    return {
      ruleCount: rules?.length ?? 0,
      firstShape: rules?.[0]?.shape ?? "none",
    };
  `));

  expect(result.ruleCount).toBe(1);
  expect(result.firstShape).toBe("octagon");
});
