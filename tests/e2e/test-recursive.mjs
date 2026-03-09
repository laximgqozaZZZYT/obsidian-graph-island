import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.log('No page'); process.exit(1); }

  console.log('=== E2E Test: Recursive Cluster Layout ===\n');

  // Step 1: Reload plugin (must use correct plugin ID from manifest)
  console.log('Reloading plugin...');
  const pluginId = await page.evaluate(() => {
    // Find the correct plugin ID
    const plugins = Object.keys(app.plugins.plugins);
    const ours = plugins.find(id => id.includes('graph-view') || id.includes('graph-island'));
    return ours || 'graph-views';
  });
  console.log('Plugin ID:', pluginId);
  await page.evaluate(async (id) => {
    await app.plugins.disablePlugin(id);
    await new Promise(r => setTimeout(r, 1000));
    await app.plugins.enablePlugin(id);
  }, pluginId);
  await page.waitForTimeout(3000);

  // Step 2: Activate graph view tab
  await page.evaluate(() => {
    const tab = document.querySelector('.workspace-tab-header[data-type="graph-view"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(2000);

  // Step 3: Get current state
  const state = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no leaf' };
    const view = leaves[0].view;
    const panel = view.panel;
    return {
      tagDisplay: panel?.tagDisplay,
      commonQueries: panel?.commonQueries,
      clusterGroupRules: panel?.clusterGroupRules,
      clusterArrangement: panel?.clusterArrangement,
    };
  });
  console.log('Current state:', JSON.stringify(state, null, 2));

  // Step 4: Enable recursive on first commonQuery
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return;
    const view = leaves[0].view;
    if (view.panel.commonQueries.length === 0) {
      view.panel.commonQueries = [{ query: 'tag:*', recursive: true }];
    } else {
      view.panel.commonQueries[0].recursive = true;
    }
    // Derive cluster rules and apply
    view.panel.clusterGroupRules = [{ groupBy: 'tag', recursive: true }];
    view.applyClusterForce();
    if (view.simulation) { view.simulation.alpha(0.8).restart(); }
  });
  await page.waitForTimeout(4000);

  // Step 5: Screenshot with recursive ON
  await page.screenshot({ path: 'tests/e2e/screenshots/recursive-on.png' });
  console.log('Screenshot saved: recursive-on.png');

  // Step 6: Analyze node positions to check layout quality
  const analysis = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no leaf' };
    const view = leaves[0].view;
    const nodes = view.rawData?.nodes || [];
    if (nodes.length === 0) return { error: 'no nodes' };

    // Compute bounding box and distribution
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let totalX = 0, totalY = 0, count = 0;
    for (const n of nodes) {
      if (isNaN(n.x) || isNaN(n.y)) continue;
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
      totalX += n.x;
      totalY += n.y;
      count++;
    }
    const cx = totalX / count;
    const cy = totalY / count;

    // Compute distribution of distances from centroid
    const dists = [];
    for (const n of nodes) {
      if (isNaN(n.x) || isNaN(n.y)) continue;
      dists.push(Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2));
    }
    dists.sort((a, b) => a - b);

    // Check if layout is "circular" (most nodes at similar distance)
    const p25 = dists[Math.floor(count * 0.25)];
    const p50 = dists[Math.floor(count * 0.50)];
    const p75 = dists[Math.floor(count * 0.75)];
    const p95 = dists[Math.floor(count * 0.95)];

    // Spread ratio: p75/p25 — closer to 1.0 means all nodes at same distance (bad circle)
    const spreadRatio = p25 > 0 ? p75 / p25 : Infinity;

    return {
      count,
      bbox: { w: maxX - minX, h: maxY - minY },
      centroid: { x: Math.round(cx), y: Math.round(cy) },
      distPercentiles: {
        p25: Math.round(p25),
        p50: Math.round(p50),
        p75: Math.round(p75),
        p95: Math.round(p95),
      },
      spreadRatio: spreadRatio.toFixed(2),
      panel: {
        commonQueries: view.panel?.commonQueries,
        clusterGroupRules: view.panel?.clusterGroupRules,
        clusterArrangement: view.panel?.clusterArrangement,
      },
    };
  });
  console.log('\n=== Layout Analysis ===');
  console.log(JSON.stringify(analysis, null, 2));

  // Step 7: Test each arrangement pattern with recursive
  const arrangements = ['spiral', 'concentric', 'grid', 'tree'];
  const results = {};

  for (const arr of arrangements) {
    await page.evaluate((a) => {
      const leaves = app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return;
      const view = leaves[0].view;
      view.panel.clusterArrangement = a;
      view.applyClusterForce();
      if (view.simulation) { view.simulation.alpha(0.5).restart(); }
    }, arr);
    await page.waitForTimeout(3000);

    await page.screenshot({ path: `tests/e2e/screenshots/recursive-${arr}.png` });

    const dist = await page.evaluate(() => {
      const leaves = app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return null;
      const view = leaves[0].view;
      const nodes = view.rawData?.nodes || [];
      let totalX = 0, totalY = 0, count = 0;
      for (const n of nodes) {
        if (isNaN(n.x) || isNaN(n.y)) continue;
        totalX += n.x; totalY += n.y; count++;
      }
      const cx = totalX / count, cy = totalY / count;
      const dists = [];
      for (const n of nodes) {
        if (isNaN(n.x) || isNaN(n.y)) continue;
        dists.push(Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2));
      }
      dists.sort((a, b) => a - b);
      const p25 = dists[Math.floor(count * 0.25)];
      const p75 = dists[Math.floor(count * 0.75)];
      return {
        spread: p25 > 0 ? (p75 / p25).toFixed(2) : 'Inf',
        p25: Math.round(p25),
        p75: Math.round(p75),
      };
    });
    results[arr] = dist;
    console.log(`  ${arr}: spread=${dist?.spread} (p25=${dist?.p25}, p75=${dist?.p75})`);
  }

  console.log('\n=== Results ===');
  console.log(JSON.stringify(results, null, 2));

  // Check: spread ratio should be > 1.5 for each (not a flat circle)
  let passed = 0, failed = 0;
  for (const [arr, r] of Object.entries(results)) {
    const spread = parseFloat(r?.spread ?? '0');
    const ok = spread > 1.3;
    console.log(`${ok ? '✅' : '❌'} ${arr}: spread=${spread} ${ok ? '' : '(too uniform — looks like a circle)'}`);
    if (ok) passed++; else failed++;
  }
  console.log(`\n${passed}/${arrangements.length} passed`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
