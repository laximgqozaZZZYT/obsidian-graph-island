import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.error('No Obsidian page'); process.exit(1); }

  // Check current state
  const state = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return { error: 'no graph view' };
    const view = leaves[0].view;
    return {
      pixiNodes: view.pixiNodes?.size ?? 0,
      edges: view.graphEdges?.length ?? 0,
      hasMeta: !!view.clusterMeta,
      hasRadii: !!view.clusterMeta?.clusterRadii,
      clusters: view.clusterMeta ? [...view.clusterMeta.nodeClusterMap.values()].filter((v,i,a) => a.indexOf(v) === i).length : 0,
      bundleStrength: view.panel?.edgeBundleStrength ?? 'N/A',
    };
  });
  console.log('State:', JSON.stringify(state, null, 2));

  // Set bundle strength to 0.8 for visible cable effect
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    if (view.panel) view.panel.edgeBundleStrength = 0.8;
    // Trigger redraw
    if (view.simulation) view.simulation.alpha(0.3).restart();
  });
  console.log('Set bundleStrength=0.8, waiting for simulation...');
  await page.waitForTimeout(5000);

  // Fit to screen
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const btns = leaves[0].view.containerEl?.querySelectorAll('.graph-toolbar-btn') || [];
    for (const btn of btns) {
      if (btn.getAttribute('aria-label') === '全体俯瞰') { btn.click(); break; }
    }
  });
  await page.waitForTimeout(1000);

  // Canvas clip
  const clip = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return null;
    const el = leaves[0].view.containerEl?.querySelector('.view-content');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  const dir = 'tests/e2e/screenshots';
  if (clip && clip.width > 0) {
    await page.screenshot({ path: `${dir}/cable-bundle.png`, clip });
    console.log('Saved: cable-bundle.png');
  }
  await page.screenshot({ path: `${dir}/cable-bundle-full.png` });
  console.log('Saved: cable-bundle-full.png');

  // Check cable bundling data
  const cableInfo = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return null;
    const view = leaves[0].view;
    const meta = view.clusterMeta;
    if (!meta) return { error: 'no cluster metadata' };

    // Count inter-cluster edges
    const edges = view.graphEdges || [];
    let interCluster = 0;
    let intraCluster = 0;
    for (const e of edges) {
      const sid = typeof e.source === 'string' ? e.source : e.source.id;
      const tid = typeof e.target === 'string' ? e.target : e.target.id;
      const sc = meta.nodeClusterMap.get(sid);
      const tc = meta.nodeClusterMap.get(tid);
      if (sc && tc) {
        if (sc === tc) intraCluster++;
        else interCluster++;
      }
    }

    const radiiEntries = meta.clusterRadii ? [...meta.clusterRadii.entries()].map(([k,v]) => `${k}: ${v.toFixed(1)}`) : [];

    return {
      interCluster,
      intraCluster,
      totalEdges: edges.length,
      clusterCount: new Set(meta.nodeClusterMap.values()).size,
      radii: radiiEntries.slice(0, 10),
    };
  });
  console.log('Cable info:', JSON.stringify(cableInfo, null, 2));

  console.log('Done');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
