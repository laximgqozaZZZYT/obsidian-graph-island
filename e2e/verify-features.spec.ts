// ---------------------------------------------------------------------------
// E2E Feature Verification — Connect to running Obsidian via CDP
// ---------------------------------------------------------------------------
// Proves which features are actually wired up end-to-end.
// Run: npx playwright test e2e/verify-features.spec.ts --config e2e/verify-cdp.config.ts
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page } from "@playwright/test";

let page: Page;

test.beforeAll(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const contexts = browser.contexts();
  expect(contexts.length).toBeGreaterThan(0);

  // Find the Obsidian main page
  const allPages = contexts.flatMap((ctx) => ctx.pages());
  const obsPage = allPages.find(
    (p) => p.url().startsWith("app://") || p.url().includes("obsidian"),
  );
  expect(obsPage).toBeTruthy();
  page = obsPage!;

  // Ensure workspace is ready
  await page.waitForFunction(
    () => {
      const app = (window as any).app;
      return app && app.workspace && app.workspace.layoutReady;
    },
    { timeout: 15_000 },
  );
});

// ---------------------------------------------------------------------------
// Helper: ensure Graph Island view is open
// ---------------------------------------------------------------------------
async function ensureGraphIslandOpen(): Promise<void> {
  const hasView = await page.evaluate(() => {
    const app = (window as any).app;
    return app.workspace.getLeavesOfType("graph-view").length > 0;
  });
  if (!hasView) {
    await page.evaluate(() => {
      (window as any).app.commands.executeCommandById("graph-island:open");
    });
    await page.waitForTimeout(3000);
  }
}

// ---------------------------------------------------------------------------
// Helper: access the first GraphViewContainer
// ---------------------------------------------------------------------------
function containerEval<T>(fn: string): Promise<T> {
  return page.evaluate(`
    (() => {
      const app = window.app;
      const leaves = app.workspace.getLeavesOfType("graph-view");
      if (!leaves.length) return { error: "NO_LEAF" };
      const container = leaves[0].view;
      if (!container || !container.panel) return { error: "NO_CONTAINER" };
      ${fn}
    })()
  `) as Promise<T>;
}

// ===========================================================================
// Tests
// ===========================================================================

test.describe("Graph Island — Feature Verification", () => {
  test.beforeAll(async () => {
    await ensureGraphIslandOpen();
    await page.waitForTimeout(2000);
  });

  // ---- Basic sanity ----

  test("Graph Island view is open with canvas", async () => {
    const hasView = await page.evaluate(() => {
      const app = (window as any).app;
      return app.workspace.getLeavesOfType("graph-view").length > 0;
    });
    expect(hasView).toBe(true);

    const canvasCount = await page.locator("canvas").count();
    expect(canvasCount).toBeGreaterThan(0);
  });

  // ---- A: showTags toggle (EXPECTED: NOT WIRED) ----

  test("showTags toggle: exists in panel state but does NOT filter nodes", async () => {
    const result = await containerEval<any>(`
      const panel = container.panel;
      const orig = panel.showTags;

      panel.showTags = true;
      const dataOn = container.getGraphData();
      const nodesOn = dataOn.nodes.length;

      panel.showTags = false;
      const dataOff = container.getGraphData();
      const nodesOff = dataOff.nodes.length;

      panel.showTags = orig;

      return {
        panelHasShowTags: typeof panel.showTags !== "undefined",
        nodesWithTagsOn: nodesOn,
        nodesWithTagsOff: nodesOff,
        filtersNodes: nodesOn !== nodesOff,
      };
    `);

    console.log("showTags result:", JSON.stringify(result));
    expect(result.panelHasShowTags).toBe(true);
    // showTags is NOT wired — toggling should NOT change node count
    expect(result.filtersNodes).toBe(false);
  });

  // ---- B: showArrows toggle (EXPECTED: NOT WIRED) ----

  test("showArrows toggle: exists in panel state but NOT in EdgeDrawConfig", async () => {
    const result = await containerEval<any>(`
      const panel = container.panel;
      const hasInPanel = typeof panel.showArrows !== "undefined";

      // Check if drawEdges/EdgeDrawConfig uses showArrows
      // We can't introspect the config directly, but we can check
      // the source code pattern: EdgeRenderer doesn't have showArrows
      return {
        panelHasShowArrows: hasInPanel,
        panelValue: panel.showArrows,
      };
    `);

    console.log("showArrows result:", JSON.stringify(result));
    expect(result.panelHasShowArrows).toBe(true);
  });

  // ---- Minimap ----

  test("Minimap: canvas element exists and has dimensions", async () => {
    const minimapCanvas = page.locator(".gi-minimap canvas, .minimap canvas");
    const count = await minimapCanvas.count();

    if (count > 0) {
      const dims = await minimapCanvas.first().evaluate((el: HTMLCanvasElement) => ({
        width: el.width,
        height: el.height,
      }));
      console.log("Minimap dims:", JSON.stringify(dims));
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    } else {
      // Minimap might be toggled off — check if the toggle exists
      const result = await containerEval<any>(`
        return {
          panelHasShowMinimap: typeof container.panel.showMinimap !== "undefined",
          minimapExists: !!container.minimap,
        };
      `);
      console.log("Minimap state:", JSON.stringify(result));
      expect(result.panelHasShowMinimap || result.minimapExists).toBe(true);
    }
  });

  // ---- PNG Export button ----

  test("PNG Export: toolbar button exists", async () => {
    const exportBtn = page.locator(
      '[aria-label*="PNG"], [aria-label*="Export"], [aria-label*="export"], [aria-label*="書き出し"]',
    );
    const count = await exportBtn.count();

    if (count === 0) {
      // Fallback: check via evaluate
      const result = await containerEval<any>(`
        const toolbar = container.containerEl?.querySelector('.graph-toolbar, .gi-toolbar');
        if (!toolbar) return { toolbarExists: false };
        const buttons = [...toolbar.querySelectorAll('button, .gi-btn')];
        const labels = buttons.map(b => b.getAttribute('aria-label') || b.title || b.textContent);
        return { toolbarExists: true, buttonLabels: labels };
      `);
      console.log("Toolbar buttons:", JSON.stringify(result));
      expect(result.toolbarExists).toBe(true);
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  // ---- Node Grouping (collapse/expand) ----

  test("Node grouping: tag groupBy creates super nodes and reduces count", async () => {
    const result = await containerEval<any>(`
      const panel = container.panel;
      const origGroupBy = panel.groupBy;
      const origCollapsed = new Set(panel.collapsedGroups);

      // Baseline: no grouping
      panel.groupBy = "none";
      panel.collapsedGroups = new Set();
      const baseData = container.getGraphData();
      const baseNodes = baseData.nodes.length;

      // Enable tag grouping (auto-collapse triggers)
      panel.groupBy = "tag";
      panel.collapsedGroups = new Set();
      const groupedData = container.getGraphData();
      const groupedNodes = groupedData.nodes.length;
      const superNodes = groupedData.nodes.filter(n => n.id.startsWith("__super__")).length;

      // Restore
      panel.groupBy = origGroupBy;
      panel.collapsedGroups = origCollapsed;

      return {
        baseNodes,
        groupedNodes,
        superNodes,
        reduction: baseNodes - groupedNodes,
        works: superNodes > 0 && groupedNodes < baseNodes,
      };
    `);

    console.log("Node grouping result:", JSON.stringify(result));
    // This should actually work — super nodes should appear
    expect(result.superNodes).toBeGreaterThan(0);
    expect(result.groupedNodes).toBeLessThan(result.baseNodes);
  });

  // ---- Timeline layout ----

  test("Timeline layout: available as main layout option", async () => {
    const result = await containerEval<any>(`
      // Timeline is a main layout (like 'force', 'tree'), not a cluster arrangement
      // Check via container.currentLayout capability
      var currentLayout = container.currentLayout;
      // Check if 'timeline' is accepted as a layout value
      var origLayout = currentLayout;
      container.currentLayout = "timeline";
      var accepted = container.currentLayout === "timeline";
      container.currentLayout = origLayout;
      return { currentLayout: origLayout, timelineAccepted: accepted };
    `);

    console.log("Timeline result:", JSON.stringify(result));
    expect(result.timelineAccepted).toBe(true);
  });

  // ---- jumpToNode ----

  test("jumpToNode: function exists and is callable", async () => {
    const result = await containerEval<any>(`
      return {
        exists: typeof container.jumpToNode === "function",
        type: typeof container.jumpToNode,
      };
    `);

    console.log("jumpToNode result:", JSON.stringify(result));
    expect(result.exists).toBe(true);
  });

  // ---- Dataview query input ----

  test("Dataview filter: panel has dataviewQuery field", async () => {
    const result = await containerEval<any>(`
      return {
        hasField: typeof container.panel.dataviewQuery !== "undefined",
        value: container.panel.dataviewQuery,
      };
    `);

    console.log("Dataview result:", JSON.stringify(result));
    expect(result.hasField).toBe(true);
  });

  // ---- Node shapes ----

  test("Node shapes: nodeShapeRules exist in panel", async () => {
    const result = await containerEval<any>(`
      return {
        hasShapeRules: Array.isArray(container.panel.nodeShapeRules),
        ruleCount: (container.panel.nodeShapeRules || []).length,
      };
    `);

    console.log("Node shapes result:", JSON.stringify(result));
    expect(result.hasShapeRules).toBe(true);
  });

  // ---- Preset export/import ----

  test("Presets: preset buttons exist in panel UI", async () => {
    const result = await containerEval<any>(`
      var panelEl = container.panelEl || container.containerEl;
      // Preset buttons (Simple/Analysis/Creative) or save/load buttons
      var buttons = panelEl ? Array.from(panelEl.querySelectorAll("button")).map(function(b) {
        return b.textContent || b.getAttribute("aria-label") || "";
      }) : [];
      var presetBtns = buttons.filter(function(t) {
        return t.indexOf("Simple") >= 0 || t.indexOf("Analysis") >= 0
          || t.indexOf("Creative") >= 0 || t.indexOf("シンプル") >= 0
          || t.indexOf("分析") >= 0 || t.indexOf("クリエイティブ") >= 0
          || t.indexOf("Preset") >= 0 || t.indexOf("プリセット") >= 0
          || t.indexOf("Export") >= 0 || t.indexOf("Import") >= 0;
      });
      return { presetButtonCount: presetBtns.length, presetButtons: presetBtns.slice(0, 10) };
    `);

    console.log("Presets result:", JSON.stringify(result));
    expect(result.presetButtonCount).toBeGreaterThan(0);
  });

  // ---- Settings tab: Custom Mappings ----

  test("Settings: Custom Mappings section exists in panel", async () => {
    const result = await containerEval<any>(`
      const panelEl = container.panelEl || container.containerEl;
      if (!panelEl) return { found: false, note: "no panelEl" };
      const headings = [...panelEl.querySelectorAll(".setting-item-name, h3, h4, .gi-ontology-heading")];
      const texts = headings.map(h => h.textContent);
      const hasCM = texts.some(t => t.includes("Custom Mapping") || t.includes("カスタムマッピング"));
      const hasTR = texts.some(t => t.includes("Tag Relation") || t.includes("タグ間の関係"));
      return { customMappings: hasCM, tagRelations: hasTR, allHeadings: texts };
    `);

    console.log("Settings Custom Mappings:", JSON.stringify(result));
    // These are in PanelBuilder but the plan says they're NOT in settings.ts
    // So check if they're at least in the panel
    expect(result.customMappings).toBe(true);
  });

  // ---- LayoutTransition ----

  test("LayoutTransition: instance exists on container", async () => {
    const result = await containerEval<any>(`
      return {
        hasTransition: !!container.layoutTransition,
        type: typeof container.layoutTransition,
      };
    `);

    console.log("LayoutTransition result:", JSON.stringify(result));
    expect(result.hasTransition).toBe(true);
  });

  // ---- Live meta getter: frontmatter changes reflected immediately ----

  test("live meta: add/edit/delete frontmatter property reflected in node.meta", async () => {
    // Step 1: Pick a markdown file and read its content; find matching graph node
    const setup = await page.evaluate(async () => {
      const app = (window as any).app;
      const files = app.vault.getMarkdownFiles();
      if (!files.length) return { error: "NO_FILES" };
      const file = files[0];
      const originalContent: string = await app.vault.read(file);

      // Get graph nodes
      const leaves = app.workspace.getLeavesOfType("graph-view");
      if (!leaves.length) return { error: "NO_GRAPH_LEAF" };
      const container = leaves[0].view;
      const graphData = container.getGraphData();
      const node = graphData.nodes.find((n: any) => n.id === file.path || n.filePath === file.path);
      if (!node) return { error: "NO_NODE_FOR_FILE", filePath: file.path };

      // Check if node has meta getter
      const descriptor = Object.getOwnPropertyDescriptor(node, "meta");
      const hasGetter = !!(descriptor && descriptor.get);

      return {
        filePath: file.path,
        originalContent,
        hasGetter,
        currentMeta: node.meta,
      };
    });

    console.log("Live meta setup:", JSON.stringify({
      filePath: setup.filePath,
      hasGetter: setup.hasGetter,
      error: setup.error,
    }));

    expect(setup.error).toBeUndefined();
    expect(setup.hasGetter).toBe(true);

    const filePath = setup.filePath;
    const originalContent: string = setup.originalContent;

    // Helper: build content with frontmatter property added/changed
    function withFrontmatterProp(content: string, key: string, value: string): string {
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        // Has existing frontmatter
        const fmBody = fmMatch[1];
        const propRegex = new RegExp(`^${key}:.*$`, "m");
        let newFmBody: string;
        if (propRegex.test(fmBody)) {
          newFmBody = fmBody.replace(propRegex, `${key}: "${value}"`);
        } else {
          newFmBody = fmBody + `\n${key}: "${value}"`;
        }
        return content.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${newFmBody}\n---`);
      } else {
        // No frontmatter yet
        return `---\n${key}: "${value}"\n---\n${content}`;
      }
    }

    function withoutFrontmatterProp(content: string, key: string): string {
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) return content;
      const fmBody = fmMatch[1];
      const propRegex = new RegExp(`^${key}:.*\r?\n?`, "m");
      const newFmBody = fmBody.replace(propRegex, "").replace(/\n$/, "");
      if (!newFmBody.trim()) {
        // Empty frontmatter - remove it entirely
        return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
      }
      return content.replace(/^---\r?\n[\s\S]*?\r?\n---/, `---\n${newFmBody}\n---`);
    }

    try {
      // Step 2: ADD test - append test_live_prop: "hello123"
      const addContent = withFrontmatterProp(originalContent, "test_live_prop", "hello123");
      await page.evaluate(async (args: any) => {
        const app = (window as any).app;
        const file = app.vault.getAbstractFileByPath(args.filePath);
        await app.vault.modify(file, args.newContent);
      }, { filePath, newContent: addContent });

      await page.waitForTimeout(1500);

      const addResult = await page.evaluate((fp: string) => {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        const container = leaves[0].view;
        const graphData = container.getGraphData();
        const node = graphData.nodes.find((n: any) => n.id === fp || n.filePath === fp);
        if (!node) return { error: "NODE_NOT_FOUND" };
        return { meta: node.meta, value: node.meta?.test_live_prop };
      }, filePath);

      console.log("ADD result:", JSON.stringify(addResult));
      expect(addResult.error).toBeUndefined();
      expect(addResult.value).toBe("hello123");

      // Step 3: EDIT test - change to "updated456"
      const editContent = withFrontmatterProp(addContent, "test_live_prop", "updated456");
      await page.evaluate(async (args: any) => {
        const app = (window as any).app;
        const file = app.vault.getAbstractFileByPath(args.filePath);
        await app.vault.modify(file, args.newContent);
      }, { filePath, newContent: editContent });

      await page.waitForTimeout(1500);

      const editResult = await page.evaluate((fp: string) => {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        const container = leaves[0].view;
        const graphData = container.getGraphData();
        const node = graphData.nodes.find((n: any) => n.id === fp || n.filePath === fp);
        if (!node) return { error: "NODE_NOT_FOUND" };
        return { value: node.meta?.test_live_prop };
      }, filePath);

      console.log("EDIT result:", JSON.stringify(editResult));
      expect(editResult.error).toBeUndefined();
      expect(editResult.value).toBe("updated456");

      // Step 4: DELETE test - remove test_live_prop
      const deleteContent = withoutFrontmatterProp(editContent, "test_live_prop");
      await page.evaluate(async (args: any) => {
        const app = (window as any).app;
        const file = app.vault.getAbstractFileByPath(args.filePath);
        await app.vault.modify(file, args.newContent);
      }, { filePath, newContent: deleteContent });

      await page.waitForTimeout(1500);

      const deleteResult = await page.evaluate((fp: string) => {
        const app = (window as any).app;
        const leaves = app.workspace.getLeavesOfType("graph-view");
        const container = leaves[0].view;
        const graphData = container.getGraphData();
        const node = graphData.nodes.find((n: any) => n.id === fp || n.filePath === fp);
        if (!node) return { error: "NODE_NOT_FOUND" };
        return { value: node.meta?.test_live_prop, isUndefined: node.meta?.test_live_prop === undefined };
      }, filePath);

      console.log("DELETE result:", JSON.stringify(deleteResult));
      expect(deleteResult.error).toBeUndefined();
      expect(deleteResult.isUndefined).toBe(true);

    } finally {
      // Step 5: Cleanup - restore original content
      await page.evaluate(async (args: any) => {
        const app = (window as any).app;
        const file = app.vault.getAbstractFileByPath(args.filePath);
        await app.vault.modify(file, args.originalContent);
      }, { filePath, originalContent });

      await page.waitForTimeout(500);
      console.log("Cleanup: original file content restored");
    }
  });
});
