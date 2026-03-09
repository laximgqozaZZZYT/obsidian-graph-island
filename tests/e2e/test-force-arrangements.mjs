/**
 * E2E test: Force layout × 4 arrangement patterns
 * JSONインポートだけで配置パターンが反映されることを確認
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SAMPLES = [
  {
    name: 'concentric-orbits',
    file: 'examples/force-concentric-orbits.json',
    desc: '同心円状: 各タグが同一軌道に並ぶ',
    expectArrangement: 'concentric',
  },
  {
    name: 'spiral-hierarchy',
    file: 'examples/force-spiral-hierarchy.json',
    desc: '螺旋: 特定タグが上部、継承タグが下部',
    expectArrangement: 'spiral',
  },
  {
    name: 'tree-sparse-center',
    file: 'examples/force-tree-sparse-center.json',
    desc: 'Tree: 中心が疎となる',
    expectArrangement: 'tree',
  },
  {
    name: 'grid-density',
    file: 'examples/force-grid-density.json',
    desc: '正方形: 粗密がはっきり現れる',
    expectArrangement: 'grid',
  },
];

async function waitForSimulation(page, maxWaitMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await page.evaluate(() => {
      const leaf = app.workspace.activeLeaf;
      const allText = leaf?.view?.containerEl?.textContent || '';
      return { simulating: allText.includes('simulating') };
    });
    if (!status.simulating) {
      console.log('  Simulation settled');
      return true;
    }
    await page.waitForTimeout(2000);
  }
  console.log('  WARNING: Simulation did not settle');
  return false;
}

async function importAndScreenshot(page, sample) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${sample.name}: ${sample.desc}`);
  console.log(`${'='.repeat(60)}`);

  const jsonContent = readFileSync(resolve(sample.file), 'utf-8');
  const vaultPath = `_test-arr-${sample.name}.json`;

  // Step 1: Write JSON to vault and apply settings
  await page.evaluate(async ({ path, content }) => {
    await app.vault.adapter.write(path, content);
  }, { path: vaultPath, content: jsonContent });

  await page.evaluate(async ({ path, content }) => {
    const plugin = app.plugins.plugins['graph-views'];
    if (!plugin) return;
    const parsed = JSON.parse(content);
    const defaults = {
      defaultLayout: "force", nodeSize: 8, showLabels: true,
      metadataFields: [], edgeFields: [], colorField: "category",
      groupField: "category", showSimilar: false,
      directionalGravityRules: [], enclosureMinRatio: 0.05,
      groupPresets: [], defaultSortRules: [], defaultClusterGroupRules: [],
      defaultNodeRules: [], settingsJsonPath: "",
      ontology: { inheritanceFields: [], aggregationFields: [],
        similarFields: [], useTagHierarchy: true, customMappings: {} }
    };
    plugin.settings = Object.assign({}, defaults, parsed);
    plugin.settings.settingsJsonPath = path;
    await plugin.saveSettings();
  }, { path: vaultPath, content: jsonContent });
  await page.waitForTimeout(300);

  // Step 2: Reload plugin completely and create fresh graph view
  await page.evaluate(async () => {
    const oldLeaves = app.workspace.getLeavesOfType('graph-view');
    for (const l of oldLeaves) l.detach();
    await new Promise(r => setTimeout(r, 200));
    await app.plugins.disablePlugin('graph-views');
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin('graph-views');
    await new Promise(r => setTimeout(r, 500));
    const newLeaf = app.workspace.getLeaf('tab');
    await newLeaf.setViewState({ type: 'graph-view', active: true });
  });

  // Step 3: Wait for simulation to run and settle
  await page.waitForTimeout(5000);
  await waitForSimulation(page, 90000);
  await page.waitForTimeout(5000);

  // Step 4: Verify that arrangement was applied from JSON
  const state = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    const view = leaves[0]?.view;
    const plugin = app.plugins.plugins['graph-views'];
    const s = plugin?.settings;
    return {
      arrangement: view?.panel?.clusterArrangement,
      nodeSpacing: view?.panel?.clusterNodeSpacing,
      groupScale: view?.panel?.clusterGroupScale,
      groupSpacing: view?.panel?.clusterGroupSpacing,
      nodeCount: view?.pixiNodes?.size ?? 0,
      settingsArrangement: s?.defaultClusterArrangement,
      gravityRules: s?.directionalGravityRules?.length ?? 0,
      nodeRules: s?.defaultNodeRules?.length ?? 0,
      clusterRules: s?.defaultClusterGroupRules?.length ?? 0,
    };
  });

  const arrOk = state.arrangement === sample.expectArrangement;
  console.log(`  Arrangement: ${state.arrangement} (expected: ${sample.expectArrangement}) ${arrOk ? 'OK' : 'FAIL'}`);
  console.log(`  Spacing: node=${state.nodeSpacing}, groupScale=${state.groupScale}, groupSpacing=${state.groupSpacing}`);
  console.log(`  Nodes: ${state.nodeCount}, Gravity: ${state.gravityRules}, NodeRules: ${state.nodeRules}, Cluster: ${state.clusterRules}`);

  // Step 5: Close left sidebar & hide panel for maximum canvas area
  await page.evaluate(() => {
    // Collapse the left sidebar to maximize graph canvas
    if (app.workspace.leftSplit && !app.workspace.leftSplit.collapsed) {
      app.workspace.leftSplit.collapse();
    }
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    app.workspace.setActiveLeaf(leaves[0]);
    const panel = leaves[0].view?.containerEl?.querySelector('.graph-panel');
    if (panel && !panel.classList.contains('is-hidden')) {
      panel.classList.add('is-hidden');
    }
  });
  await page.waitForTimeout(500);

  // Step 6: Fit to view — compute bounding box from simulation data directly
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const leaves = app.workspace.getLeavesOfType('graph-view');
      if (leaves.length === 0) return;
      const view = leaves[0].view;
      const wrap = view?.canvasWrap;
      if (!wrap) return;

      const W = wrap.clientWidth;
      const H = wrap.clientHeight;

      if (view.pixiApp?.renderer) {
        view.pixiApp.renderer.resize(W, H);
      }

      // Compute bounding box from simulation node positions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const nodes = view.pixiNodes;
      if (!nodes || nodes.size === 0) return;
      for (const pn of nodes.values()) {
        const x = pn.data.x;
        const y = pn.data.y;
        const r = pn.radius || 8;
        if (x - r < minX) minX = x - r;
        if (y - r < minY) minY = y - r;
        if (x + r > maxX) maxX = x + r;
        if (y + r > maxY) maxY = y + r;
      }

      const padding = 60;
      const bw = maxX - minX + padding * 2;
      const bh = maxY - minY + padding * 2;
      const sc = Math.min(W / bw, H / bh, 2.0);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const world = view.worldContainer;
      if (world) {
        world.scale.set(sc);
        world.x = W / 2 - cx * sc;
        world.y = H / 2 - cy * sc;
      }
      if (typeof view.markDirty === 'function') view.markDirty();
    });
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(500);

  const dir = 'tests/e2e/screenshots';

  // Hide edges for clean node-only screenshot
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    // Hide edge graphics to reveal node arrangement pattern
    if (view.edgeGraphics) view.edgeGraphics.visible = false;
    // Also hide enclosure/orbit overlays
    if (view.enclosureGraphics) view.enclosureGraphics.visible = false;
    if (view.orbitGraphics) view.orbitGraphics.visible = false;
    if (typeof view.markDirty === 'function') view.markDirty();
  });
  await page.waitForTimeout(300);

  // Screenshot: nodes only (no edges, no panel)
  await page.screenshot({ path: `${dir}/arr-${sample.name}-nodes.png` });
  console.log(`  Screenshot: ${dir}/arr-${sample.name}-nodes.png`);

  // Restore edges for full screenshot
  await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const view = leaves[0].view;
    if (view.edgeGraphics) view.edgeGraphics.visible = true;
    if (view.enclosureGraphics) view.enclosureGraphics.visible = true;
    if (view.orbitGraphics) view.orbitGraphics.visible = true;
    if (typeof view.markDirty === 'function') view.markDirty();
  });
  await page.waitForTimeout(300);

  // Screenshot: graph with edges (no panel)
  await page.screenshot({ path: `${dir}/arr-${sample.name}-graph.png` });
  console.log(`  Screenshot: ${dir}/arr-${sample.name}-graph.png`);

  // Show panel and take full screenshot (restore sidebar)
  await page.evaluate(() => {
    // Restore left sidebar
    if (app.workspace.leftSplit && app.workspace.leftSplit.collapsed) {
      app.workspace.leftSplit.expand();
    }
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (leaves.length === 0) return;
    const panel = leaves[0].view?.containerEl?.querySelector('.graph-panel');
    if (panel && panel.classList.contains('is-hidden')) {
      panel.classList.remove('is-hidden');
    }
    const sections = panel?.querySelectorAll('.graph-control-section') || [];
    for (const s of sections) {
      const name = s.querySelector('.tree-item-inner')?.textContent?.trim();
      const shouldExpand = ['グラフの種類', 'クラスター配置'].includes(name);
      if (shouldExpand && s.classList.contains('is-collapsed')) {
        s.querySelector('.graph-control-section-header')?.click();
      } else if (!shouldExpand && !s.classList.contains('is-collapsed')) {
        s.querySelector('.graph-control-section-header')?.click();
      }
    }
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${dir}/arr-${sample.name}-full.png` });
  console.log(`  Screenshot: ${dir}/arr-${sample.name}-full.png`);

  // Cleanup temp file
  await page.evaluate(async ({ path }) => {
    try { await app.vault.adapter.remove(path); } catch {}
  }, { path: vaultPath });

  return arrOk;
}

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.log('No Obsidian page'); process.exit(1); }

  console.log('=== E2E Test: Force Arrangement Patterns (generic JSON, no project-specific tags) ===\n');

  let allOk = true;
  for (const sample of SAMPLES) {
    const ok = await importAndScreenshot(page, sample);
    if (!ok) allOk = false;
  }

  // Restore defaults
  await page.evaluate(async () => {
    const plugin = app.plugins.plugins['graph-views'];
    if (!plugin) return;
    plugin.settings = {
      defaultLayout: "force", nodeSize: 8, showLabels: true,
      metadataFields: ["tags", "category", "characters", "locations"],
      edgeFields: ["tags", "category"], colorField: "category", groupField: "category",
      ontology: { inheritanceFields: ["parent", "extends", "up"], aggregationFields: ["contains", "parts", "has"],
        similarFields: ["similar", "related"], useTagHierarchy: true, customMappings: {} },
      showSimilar: false, directionalGravityRules: [], enclosureMinRatio: 0.05,
      groupPresets: [{ condition: { tagDisplay: "enclosure" }, groups: [], commonQueries: [{ query: "tag:*", recursive: false }] }],
      defaultSortRules: [{ key: "degree", order: "desc" }],
      defaultClusterGroupRules: [{ groupBy: "tag", recursive: false }],
      defaultNodeRules: [], settingsJsonPath: ""
    };
    await plugin.saveSettings();
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(allOk ? '  ALL ARRANGEMENT PATTERNS VERIFIED' : '  SOME PATTERNS FAILED');
  console.log(`${'='.repeat(60)}`);

  await browser.close();
  process.exit(allOk ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
