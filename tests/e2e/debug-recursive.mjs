import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.log('No page'); process.exit(1); }

  const info = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no graph-view leaf' };
    const view = leaves[0].view;
    const panel = view.panel;
    const data = view.rawData;
    if (!data) return { error: 'no rawData' };

    const nodes = data.nodes || [];
    const edges = view.graphEdges || data.edges || [];

    // Count tags
    const tagCounts = {};
    for (const n of nodes) {
      if (n.tags) for (const t of n.tags) { tagCounts[t] = (tagCounts[t] || 0) + 1; }
    }

    // Count edges by type
    const edgeTypes = {};
    for (const e of edges) {
      edgeTypes[e.type || 'link'] = (edgeTypes[e.type || 'link'] || 0) + 1;
    }

    // Group by first tag (same as partitionNodes "tag" mode)
    const tagGroupNodes = {};
    for (const n of nodes) {
      const key = (n.tags && n.tags.length > 0) ? n.tags[0] : '__untagged__';
      if (!tagGroupNodes[key]) tagGroupNodes[key] = new Set();
      tagGroupNodes[key].add(n.id);
    }

    // For each tag group, count internal edges (proxy for connected components)
    const ccEstimate = {};
    for (const [tag, ids] of Object.entries(tagGroupNodes)) {
      let internalEdges = 0;
      for (const e of edges) {
        const sid = typeof e.source === 'string' ? e.source : e.source.id;
        const tid = typeof e.target === 'string' ? e.target : e.target.id;
        if (ids.has(sid) && ids.has(tid)) internalEdges++;
      }
      ccEstimate[tag] = { nodes: ids.size, internalEdges };
    }

    return {
      nodes: nodes.length,
      edges: edges.length,
      tagDisplay: panel?.tagDisplay,
      commonQueries: panel?.commonQueries,
      clusterGroupRules: panel?.clusterGroupRules,
      clusterArrangement: panel?.clusterArrangement,
      totalTags: Object.keys(tagCounts).length,
      edgeTypes,
      tagGroups: Object.entries(tagGroupNodes)
        .map(([k, v]) => [k, v.size])
        .sort((a, b) => b[1] - a[1]),
      ccEstimate: Object.entries(ccEstimate)
        .sort((a, b) => b[1].nodes - a[1].nodes)
        .slice(0, 15)
        .map(([k, v]) => ({ tag: k, ...v })),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
