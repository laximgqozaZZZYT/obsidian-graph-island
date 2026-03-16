const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SAMPLES_DIR = path.join(__dirname, '..', 'samples');
const OUTPUT_DIR = __dirname;

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  const page = pages[0]; // Main Obsidian page

  console.log('Connected to:', await page.title());

  // --- Preset 02: concentric/polar ---
  console.log('\n=== Loading preset 02-dense-cluster (concentric/polar) ===');
  const preset02 = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, '02-dense-cluster.json'), 'utf8'));

  await page.evaluate((config) => {
    const view = window.app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) throw new Error('No graph view found');
    Object.assign(view.panel, config);
    view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, preset02);

  console.log('Preset 02 loaded, waiting for simulation to settle...');
  await page.waitForTimeout(8000);

  // Force road network rebuild
  console.log('Forcing road network rebuild...');
  await page.evaluate(() => {
    const view = window.app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      view._roadNetworkFinalized = false;
      view.roadNetworkData = null;
      view.buildRoadNetwork?.(true);
    }
  });
  await page.waitForTimeout(3000);

  // Check road network status
  const status02 = await page.evaluate(() => {
    const view = window.app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return {
      hasRoadNetwork: !!view?.roadNetworkData,
      finalized: view?._roadNetworkFinalized,
      arrangement: view?.panel?.clusterArrangement,
      nodeCount: view?.graphData?.nodes?.length,
      edgeCount: view?.graphData?.edges?.length,
    };
  });
  console.log('Road network status (polar):', JSON.stringify(status02, null, 2));

  // Take screenshot
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'road-v4-polar.png'),
    fullPage: false
  });
  console.log('Screenshot saved: road-v4-polar.png');

  // --- Preset 01: grid ---
  console.log('\n=== Loading preset 01-panorama-overview (grid) ===');
  const preset01 = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, '01-panorama-overview.json'), 'utf8'));

  await page.evaluate((config) => {
    const view = window.app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (!view?.panel) throw new Error('No graph view found');
    Object.assign(view.panel, config);
    view.panel.collapsedGroups = new Set(config.collapsedGroups || []);
    view._roadNetworkFinalized = false;
    view.roadNetworkData = null;
    view.buildPanel?.();
    view.updateForces?.(true);
  }, preset01);

  console.log('Preset 01 loaded, waiting for simulation to settle...');
  await page.waitForTimeout(8000);

  // Force road network rebuild
  console.log('Forcing road network rebuild...');
  await page.evaluate(() => {
    const view = window.app.workspace.getLeavesOfType("graph-view")[0]?.view;
    if (view) {
      view._roadNetworkFinalized = false;
      view.roadNetworkData = null;
      view.buildRoadNetwork?.(true);
    }
  });
  await page.waitForTimeout(3000);

  // Check road network status
  const status01 = await page.evaluate(() => {
    const view = window.app.workspace.getLeavesOfType("graph-view")[0]?.view;
    return {
      hasRoadNetwork: !!view?.roadNetworkData,
      finalized: view?._roadNetworkFinalized,
      arrangement: view?.panel?.clusterArrangement,
      nodeCount: view?.graphData?.nodes?.length,
      edgeCount: view?.graphData?.edges?.length,
    };
  });
  console.log('Road network status (grid):', JSON.stringify(status01, null, 2));

  // Take screenshot
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'road-v4-grid.png'),
    fullPage: false
  });
  console.log('Screenshot saved: road-v4-grid.png');

  // Disconnect (don't close - it's a shared browser)
  browser.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
