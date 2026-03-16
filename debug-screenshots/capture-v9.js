const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/home/ubuntu/obsidian-plugins/obsidian-graph-island/debug-screenshots';

// Read preset files
const preset01 = JSON.parse(fs.readFileSync('/home/ubuntu/obsidian-plugins/obsidian-graph-island/samples/01-panorama-overview.json', 'utf8'));
const preset02 = JSON.parse(fs.readFileSync('/home/ubuntu/obsidian-plugins/obsidian-graph-island/samples/02-dense-cluster.json', 'utf8'));

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getView(Runtime) {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const leaves = app.workspace.getLeavesOfType('graph-island');
      if (!leaves.length) return 'NO_LEAF';
      const view = leaves[0].view;
      return view ? 'FOUND' : 'NO_VIEW';
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function applyPreset(Runtime, config) {
  const configStr = JSON.stringify(config);
  const result = await Runtime.evaluate({
    expression: `(() => {
      const leaves = app.workspace.getLeavesOfType('graph-island');
      if (!leaves.length) return 'NO_LEAF';
      const view = leaves[0].view;
      if (!view) return 'NO_VIEW';
      const config = ${configStr};
      Object.assign(view.panel, config);
      view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
      if (view.buildPanel) view.buildPanel();
      if (view.updateForces) view.updateForces(true);
      return 'OK: arrangement=' + view.panel.clusterArrangement;
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function setArrangement(Runtime, arrangement) {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const leaves = app.workspace.getLeavesOfType('graph-island');
      if (!leaves.length) return 'NO_LEAF';
      const view = leaves[0].view;
      if (!view) return 'NO_VIEW';
      view.panel.clusterArrangement = "${arrangement}";
      if (view.buildPanel) view.buildPanel();
      if (view.updateForces) view.updateForces(true);
      return 'OK: arrangement=' + view.panel.clusterArrangement;
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function rebuildCableTray(Runtime) {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const leaves = app.workspace.getLeavesOfType('graph-island');
      if (!leaves.length) return 'NO_LEAF';
      const view = leaves[0].view;
      if (!view) return 'NO_VIEW';
      view._cableTrayFinalized = false;
      view.cableTrayData = null;
      if (view.buildCableTray) view.buildCableTray(true);
      return 'REBUILD_DONE';
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function getStats(Runtime) {
  const result = await Runtime.evaluate({
    expression: `(() => {
      const leaves = app.workspace.getLeavesOfType('graph-island');
      if (!leaves.length) return { error: 'NO_LEAF' };
      const view = leaves[0].view;
      if (!view) return { error: 'NO_VIEW' };
      const ct = view.cableTrayData;
      if (!ct) return { error: 'NO_CABLE_TRAY_DATA' };
      return {
        system: ct.system || 'unknown',
        intersections: ct.intersections ? ct.intersections.length : 0,
        segments: ct.segments ? ct.segments.length : 0
      };
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function takeScreenshot(Page, filename) {
  const { data } = await Page.captureScreenshot({ format: 'png' });
  const filepath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
  console.log(`  Screenshot saved: ${filepath}`);
}

async function main() {
  // Find the Obsidian target
  const targets = await CDP.List();
  const obsTarget = targets.find(t => t.title && t.title.includes('Graph Island'));
  if (!obsTarget) {
    console.error('No Graph Island target found');
    process.exit(1);
  }
  console.log('Connecting to:', obsTarget.title);

  const client = await CDP({ target: obsTarget });
  const { Runtime, Page } = client;
  await Runtime.enable();
  await Page.enable();

  // Verify view exists
  const viewStatus = await getView(Runtime);
  console.log('View status:', viewStatus);
  if (viewStatus !== 'FOUND') {
    console.error('Graph Island view not found');
    await client.close();
    process.exit(1);
  }

  // === 1. Grid (preset 01) ===
  console.log('\n=== 1. Grid (preset 01) ===');
  let applyResult = await applyPreset(Runtime, preset01);
  console.log('  Apply:', applyResult);
  console.log('  Waiting 15s for simulation...');
  await sleep(15000);
  let rebuildResult = await rebuildCableTray(Runtime);
  console.log('  Rebuild:', rebuildResult);
  await sleep(2000);
  let stats = await getStats(Runtime);
  console.log('  Stats:', JSON.stringify(stats));
  await takeScreenshot(Page, 'v9-grid.png');

  // === 2. Concentric (preset 02) ===
  console.log('\n=== 2. Concentric (preset 02) ===');
  applyResult = await applyPreset(Runtime, preset02);
  console.log('  Apply:', applyResult);
  console.log('  Waiting 15s for simulation...');
  await sleep(15000);
  rebuildResult = await rebuildCableTray(Runtime);
  console.log('  Rebuild:', rebuildResult);
  await sleep(2000);
  stats = await getStats(Runtime);
  console.log('  Stats:', JSON.stringify(stats));
  await takeScreenshot(Page, 'v9-concentric.png');

  // === 3. Radial ===
  console.log('\n=== 3. Radial ===');
  applyResult = await setArrangement(Runtime, 'radial');
  console.log('  Apply:', applyResult);
  console.log('  Waiting 15s for simulation...');
  await sleep(15000);
  rebuildResult = await rebuildCableTray(Runtime);
  console.log('  Rebuild:', rebuildResult);
  await sleep(2000);
  stats = await getStats(Runtime);
  console.log('  Stats:', JSON.stringify(stats));
  await takeScreenshot(Page, 'v9-radial.png');

  // === 4. Triangle ===
  console.log('\n=== 4. Triangle ===');
  applyResult = await setArrangement(Runtime, 'triangle');
  console.log('  Apply:', applyResult);
  console.log('  Waiting 15s for simulation...');
  await sleep(15000);
  rebuildResult = await rebuildCableTray(Runtime);
  console.log('  Rebuild:', rebuildResult);
  await sleep(2000);
  stats = await getStats(Runtime);
  console.log('  Stats:', JSON.stringify(stats));
  await takeScreenshot(Page, 'v9-triangle.png');

  console.log('\n=== All screenshots captured ===');
  await client.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
