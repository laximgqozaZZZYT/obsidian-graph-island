// Quick investigation script - connect to running Obsidian and dump view info
import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const contexts = browser.contexts();
  const pages = contexts[0].pages();

  console.log("=== Pages ===");
  for (const p of pages) {
    console.log(`  ${p.url()} | ${await p.title()}`);
  }

  // Find the main Obsidian page
  const obsPage = pages.find(p => p.url().includes("index.html"));
  if (!obsPage) {
    console.log("ERROR: No Obsidian main page found");
    process.exit(1);
  }

  console.log("\n=== Investigating Graph Island ===");

  const info = await obsPage.evaluate(() => {
    const app = (window as any).app;
    if (!app) return { error: "no app object" };

    // 1. Commands
    const cmds = Object.keys(app.commands.commands).filter((c: string) => c.includes("graph"));

    // 2. View types
    const viewTypes = ["graph-island-view", "graph-island", "graph-view", "graph-island-node-detail"];
    const leafCounts: Record<string, number> = {};
    for (const vt of viewTypes) {
      leafCounts[vt] = app.workspace.getLeavesOfType(vt).length;
    }

    // 3. All leaves
    const leafTypes: any[] = [];
    app.workspace.iterateAllLeaves((leaf: any) => {
      leafTypes.push({
        type: leaf.view?.getViewType?.() ?? "unknown",
        displayText: leaf.view?.getDisplayText?.() ?? "",
      });
    });

    // 4. Plugin instance info
    const plugin = app.plugins.plugins["graph-island"];
    const pluginKeys = plugin ? Object.keys(plugin).slice(0, 30) : [];

    return { cmds, leafCounts, leafTypes, pluginKeys };
  });

  console.log(JSON.stringify(info, null, 2));

  // Now try to open graph island
  console.log("\n=== Opening Graph Island ===");
  const openResult = await obsPage.evaluate(() => {
    const app = (window as any).app;
    const cmds = Object.keys(app.commands.commands).filter((c: string) => c.includes("graph"));
    if (cmds.length > 0) {
      const result = app.commands.executeCommandById(cmds[0]);
      return { executed: cmds[0], result };
    }
    return { error: "no graph commands found" };
  });
  console.log(JSON.stringify(openResult));

  await obsPage.waitForTimeout(3000);

  // Check what leaves exist now
  const afterOpen = await obsPage.evaluate(() => {
    const app = (window as any).app;
    const allLeaves: any[] = [];
    app.workspace.iterateAllLeaves((leaf: any) => {
      const vtype = leaf.view?.getViewType?.() ?? "unknown";
      if (vtype.includes("graph")) {
        const view = leaf.view;
        allLeaves.push({
          type: vtype,
          viewKeys: Object.keys(view).slice(0, 40),
          viewMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(view))
            .filter((k: string) => typeof view[k] === "function").slice(0, 30),
          hasSettings: !!view.settings,
          settingsKeys: view.settings ? Object.keys(view.settings).slice(0, 30) : [],
          hasGraphData: !!view.graphData,
          containerKeys: view.container ? Object.keys(view.container).slice(0, 30) : [],
        });
      }
    });
    return allLeaves;
  });
  console.log("\n=== Graph Leaves ===");
  console.log(JSON.stringify(afterOpen, null, 2));

  // Check DOM
  const domInfo = await obsPage.evaluate(() => {
    const containers = document.querySelectorAll("[class*='graph']");
    return Array.from(containers).map(el => ({
      tag: el.tagName,
      class: el.className.toString().slice(0, 100),
      childCount: el.children.length,
    }));
  });
  console.log("\n=== DOM elements with 'graph' ===");
  console.log(JSON.stringify(domInfo, null, 2));

  // Check graphData access
  const graphDataCheck = await obsPage.evaluate(() => {
    const app = (window as any).app;
    const results: any[] = [];
    app.workspace.iterateAllLeaves((leaf: any) => {
      const vtype = leaf.view?.getViewType?.() ?? "";
      if (vtype.includes("graph")) {
        const view = leaf.view;
        // Deep search for graphData-like properties
        const check: Record<string, any> = {};
        for (const key of Object.keys(view)) {
          const val = view[key];
          if (val && typeof val === "object" && !Array.isArray(val)) {
            if (val.nodes || val.edges) {
              check[key] = { nodes: val.nodes?.length, edges: val.edges?.length };
            }
          }
        }
        // Also check view.container
        if (view.container) {
          for (const key of Object.keys(view.container)) {
            const val = view.container[key];
            if (val && typeof val === "object" && !Array.isArray(val)) {
              if (val.nodes || val.edges) {
                check[`container.${key}`] = { nodes: val.nodes?.length, edges: val.edges?.length };
              }
            }
          }
        }
        results.push({ type: vtype, graphDataPaths: check });
      }
    });
    return results;
  });
  console.log("\n=== Graph Data Paths ===");
  console.log(JSON.stringify(graphDataCheck, null, 2));

  await browser.close();
}

main().catch(console.error);
