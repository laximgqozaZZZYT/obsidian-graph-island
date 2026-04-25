import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://localhost:9222");
const ctx = b.contexts()[0];
const pages = ctx.pages();
const page = pages.find(p => p.url().includes("index.html")) ?? pages[0];

const out = await page.evaluate(async () => {
  const app = window.app;
  const v = app.workspace.getLeavesOfType("graph-view")
    .find(l => "pixiNodes" in l.view)?.view;
  if (!v) return { ok: false, reason: "no graph view" };

  v.panel.searchQuery = "";
  v.panel.showOrphans = true;
  v.panel.existingOnly = false;
  v.panel.groupBy = "none";
  v.panel.viewMode = "graph";
  v.rawData = null;
  await v.doRender();
  await new Promise(r => setTimeout(r, 2000));
  const baseGd = v.getGraphData();
  const baseline = baseGd.nodes.length;

  const sample = baseGd.nodes.slice(0, 5).map(n => ({
    id: n.id,
    label: n.label,
    isTag: n.isTag,
    metaKeys: n.meta ? Object.keys(n.meta).slice(0, 8) : null,
    node_type: n.meta ? n.meta.node_type : null,
    category: n.category,
  }));

  let charsByMeta = 0;
  let withMeta = 0;
  let withNodeType = 0;
  for (const n of baseGd.nodes) {
    if (n.meta) withMeta++;
    if (n.meta && n.meta.node_type !== undefined) withNodeType++;
    const nt = n.meta?.node_type;
    const ntStr = String(nt ?? "").toLowerCase();
    if (ntStr.includes("character")) charsByMeta++;
  }

  v.panel.searchQuery = "node_type:character";
  v.rawData = null;
  await v.doRender();
  await new Promise(r => setTimeout(r, 2000));
  const filteredGd = v.getGraphData();
  const filtered = filteredGd.nodes.length;
  const filteredSample = filteredGd.nodes.slice(0, 5).map(n => ({
    id: n.id, node_type: n.meta?.node_type, category: n.category, isTag: n.isTag,
  }));

  v.panel.searchQuery = "";
  v.rawData = null;
  await v.doRender();
  await new Promise(r => setTimeout(r, 1000));

  return { ok: true, baseline, withMeta, withNodeType, charsByMeta, filtered, sample, filteredSample };
});
console.log(JSON.stringify(out, null, 2));
await b.close();
