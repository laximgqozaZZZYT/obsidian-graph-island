/**
 * Batch screenshot capture script for README.
 *
 * Usage: npx tsx scripts/capture-screenshots.ts [startIndex]
 *
 * Connects to Obsidian via CDP, loads each sample preset,
 * waits for stabilization, captures screenshot, and saves to docs/screenshots/.
 * Includes quality gates to reject anti-pattern screenshots.
 */
import { chromium, type Page, type Browser, type CDPSession } from "playwright";
import * as fs from "fs";
import * as path from "path";

const CDP_URL = "http://localhost:9222";
const OUT_DIR = path.resolve(__dirname, "../docs/screenshots");
const SAMPLES_DIR = path.resolve(__dirname, "../samples");

// Skip degenerate/low-quality presets (coordinateLayout produces curves-only,
// or presets that generate too few visible nodes for a meaningful screenshot)
const SKIP_PRESETS = new Set([
  "test-random-scatter", "test-bfs-tree", "test-density-concentric", "test-folder-degree",
  // Coordinate layout presets: render only curves/axes, no visible node content
  "21-filled-hexagon", "23-spiral-galaxy", "25-rose-curve", "27-filled-pentagon",
  // Tag-heavy presets with label clumping or sparse content
  "42-high-density-tags", "47-sunburst-with-tags", "52-mixed-nodesize-stress",
  // Too few nodes for meaningful screenshot
  "14-dialogue-theater",
  // Empty/near-empty renders (coordinate system or layout issues)
  "29-concentric-degree", "54-radial-dense",
]);

async function connect(): Promise<{ browser: Browser; page: Page; cdp: CDPSession }> {
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 60000 });
  const allPages = browser.contexts().flatMap(c => c.pages());
  // Prefer the "開発" vault page
  const page = allPages.find(p => p.url().includes("index.html") && !p.url().includes("blob:"))
    ?? allPages.find(p => p.url().includes("index.html"))
    ?? allPages[0];
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, cdp };
}

async function setupViewport(page: Page, cdp: CDPSession): Promise<void> {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false,
  });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    (window as any).app.workspace.leftSplit.collapse();
    (window as any).app.workspace.rightSplit.collapse();
    await new Promise(r => setTimeout(r, 300));
  });
  await page.waitForTimeout(500);
}

async function fullReload(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    for (const l of app.workspace.getLeavesOfType("graph-view")) l.detach();
    await new Promise(r => setTimeout(r, 300));
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 2000));
    await app.commands.executeCommandById("graph-island:open-graph-view");
    await new Promise(r => setTimeout(r, 3000));
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
    if (v) { v.onResize(); }
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(1000);
}

async function waitStable(page: Page, waitMs = 5000): Promise<number> {
  await page.waitForTimeout(waitMs);
  let last = -1, stable = 0;
  for (let i = 0; i < 12; i++) {
    const count = await page.evaluate(() => {
      const v = (window as any).app.workspace
        .getLeavesOfType("graph-view")
        .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    if (count === last && count > 0) { stable++; if (stable >= 2) return count; }
    else { last = count; stable = 0; }
    await page.waitForTimeout(500);
  }
  return last;
}

/**
 * Apply a preset with anti-pattern mitigations:
 * - Prevent groupBy auto-collapse (expand all groups for showcase)
 * - Ensure edges are visible
 */
async function applyPresetSafe(page: Page, preset: Record<string, any>): Promise<{ nodes: number; settings?: Record<string, any> }> {
  const success = await page.evaluate(async function(args: { preset: Record<string, any> }) {
    var p = args.preset;
    var v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
    if (!v) return false;

    try {
      // Get defaults
      var defaults: Record<string, any> = {};
      if (typeof v.createDefaultPanel === "function") {
        var dp = v.createDefaultPanel();
        for (var k in dp) { defaults[k] = dp[k]; }
      }

      // Reset panel to defaults
      for (var k2 in defaults) {
        if (k2.startsWith("_")) continue;
        var val = defaults[k2];
        if (val instanceof Set) { v.panel[k2] = new Set(); }
        else if (Array.isArray(val)) { v.panel[k2] = val.slice(); }
        else { v.panel[k2] = val; }
      }

      // Apply preset overrides
      for (var k3 in p) {
        if (k3 === "collapsedGroups") {
          // ANTI-PATTERN FIX: Always prevent auto-collapse for screenshots.
          // Empty collapsedGroups triggers ALL groups to collapse → 2-3 giant circles.
          // Add dummy key so the Set is non-empty, preventing auto-collapse.
          if (Array.isArray(p[k3]) && p[k3].length === 0) {
            v.panel[k3] = new Set(["__screenshot_no_autoCollapse__"]);
          } else if (Array.isArray(p[k3])) {
            v.panel[k3] = new Set(p[k3]);
          }
        } else {
          v.panel[k3] = p[k3];
        }
      }

      // Ensure basic visibility settings
      if (v.panel.showLinks === false && v.panel.showTagEdges === false &&
          v.panel.showSemanticEdges === false) {
        v.panel.showLinks = true;
      }

      // ANTI-PATTERN FIX: Hide coordinate system artifacts for clean screenshots
      v.panel.showGuideLines = false;
      v.panel.showAxisTitles = false;
      v.panel.showDotGrid = false;

      // Clear all graphics to prevent ghost artifacts from previous presets
      if (v.worldContainer) {
        for (var ci = 0; ci < v.worldContainer.children.length; ci++) {
          var child = v.worldContainer.children[ci];
          if (child && typeof child.clear === 'function') child.clear();
        }
      }
      // Also clear specific graphics containers
      if (v.enclosureGraphics && typeof v.enclosureGraphics.clear === 'function') v.enclosureGraphics.clear();
      if (v.sunburstGraphics && typeof v.sunburstGraphics.clear === 'function') v.sunburstGraphics.clear();
      if (v.clusterBoundaryGraphics && typeof v.clusterBoundaryGraphics.clear === 'function') v.clusterBoundaryGraphics.clear();
      // Clear groupBy labels
      if (v.groupByLabels) {
        v.groupByLabels.forEach(function(lbl: any) { lbl.visible = false; });
      }
      // Clear sunburst labels
      if (v._clearSunburstLabels) v._clearSunburstLabels();

      // Vault prefix fix: when vault is parent "obsidian-plugins", content paths
      // start with "開発/". Rewrite "path:classic-" → "path:開発/classic-" etc.
      var vaultName2 = (window as any).app?.vault?.getName?.() ?? "";
      var needsPrefix = vaultName2 === "obsidian-plugins" || vaultName2 === "obsidian plugins";
      if (needsPrefix && v.panel.searchQuery) {
        v.panel.searchQuery = v.panel.searchQuery.replace(/path:(?!開発\/)/g, "path:開発/");
      }

      // ANTI-PATTERN FIX: Ensure multi-folder diversity for color variety.
      // For no-query presets, add a folder filter.
      // For single-folder presets, append an additional folder via OR.
      // ANTI-PATTERN FIX: Only add searchQuery for presets with NO query at all
      // (full-vault). Don't modify presets that have their own query.
      if (!v.panel.searchQuery) {
        // Detect vault prefix: if vault is parent ("obsidian-plugins"), content is under "開発/"
        var vaultName = (window as any).app?.vault?.getName?.() ?? "";
        var pfx = (vaultName === "obsidian-plugins" || vaultName === "obsidian plugins") ? "開発/" : "";
        // Single-folder filters (100-130 nodes each) to avoid BBox spread
        var folders = [
          "path:" + pfx + "mythology-greek*",
          "path:" + pfx + "mythology-norse*",
          "path:" + pfx + "classic-hamlet*",
          "path:" + pfx + "classic-arabian-nights*",
          "path:" + pfx + "bible-old-testament*",
          "path:" + pfx + "classic-gilgamesh*",
          "path:" + pfx + "mythology-japanese*",
          "path:" + pfx + "mythology-egyptian*",
          "path:" + pfx + "classic-saiyuki*",
          "path:" + pfx + "classic-king-lear*",
          "path:" + pfx + "classic-arthurian*",
          "path:" + pfx + "classic-divine-comedy*",
          "path:" + pfx + "classic-macbeth*",
          "path:" + pfx + "classic-othello*",
          "path:" + pfx + "classic-genji*",
          "path:" + pfx + "classic-sangokushi*",
          "path:" + pfx + "bible-new-testament*",
          "path:" + pfx + "classic-iliad*",
        ];
        var idx = (window as any).__screenshotIdx ?? 0;
        v.panel.searchQuery = folders[idx % folders.length];
        (window as any).__screenshotIdx = idx + 1;
      }

      // Let presets' collapsedGroups work as designed — don't override

      // ANTI-PATTERN FIX: Ensure color diversity
      if (!p["nodeColorMode"] || p["nodeColorMode"] === "folder") {
        v.panel.nodeColorMode = "category";
      }
      // Ensure edges are colored by relation type for visual diversity
      if (p["colorEdgesByRelation"] === undefined) {
        v.panel.colorEdgesByRelation = true;
      }

      v.rawData = null;
      await v.doRender();

      // Serialize the effective panel state for saving
      var snapshot: Record<string, any> = {};
      for (var sk in v.panel) {
        if (sk.startsWith("_")) continue;
        var sv = v.panel[sk];
        if (sv instanceof Set) { snapshot[sk] = Array.from(sv); }
        else if (typeof sv === "function") { /* skip */ }
        else { snapshot[sk] = sv; }
      }
      return snapshot;
    } catch (e) {
      return false;
    }
  }, { preset });

  if (!success) return { nodes: -1 };
  const effectiveSettings = typeof success === "object" ? success as Record<string, any> : undefined;

  const nodes = await waitStable(page, 7000);

  // Force simulation to completion + manual fit-to-view
  await page.evaluate(async function() {
    var v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
    if (!v) return;

    // Stop force simulation so nodes are at final positions
    if (v.simulation) { v.simulation.alpha(0); v.simulation.stop(); }
    if (v.layoutController && v.layoutController.simulation) {
      v.layoutController.simulation.alpha(0);
      v.layoutController.simulation.stop();
    }

    v.markDirty();
    await new Promise(function(r) { setTimeout(r, 500); });

    // Try autoFitView first
    if (v.autoFitView) {
      v.autoFitView();
      await new Promise(function(r) { setTimeout(r, 1000); });
    }

    // Manual bounding-box fit as fallback: compute from pn.data.x/y
    var wc = v.worldContainer;
    if (!wc) return;
    var nodes = v.pixiNodes;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var count = 0;
    nodes.forEach(function(pn: any) {
      if (!pn.data) return;
      var x = pn.data.x, y = pn.data.y;
      if (x === undefined || y === undefined) return;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      count++;
    });

    if (count < 2) return;

    var canvas = v.app?.view;
    var cw = canvas?.width ?? 1446;
    var ch = canvas?.height ?? 706;
    var padding = 80;
    var bw = maxX - minX;
    var bh = maxY - minY;
    if (bw < 1) bw = 1;
    if (bh < 1) bh = 1;
    var scaleX = (cw - padding * 2) / bw;
    var scaleY = (ch - padding * 2) / bh;
    var naturalScale = Math.min(scaleX, scaleY, 2.0);

    // For extreme aspect ratios (tall/narrow or wide/flat layouts),
    // zoom in more so content fills at least 50% of the shorter dimension.
    // This prevents layouts like timeline columns from leaving 60% of screen empty.
    var aspectRatio = Math.max(bw / bh, bh / bw);
    var scale = naturalScale;
    if (aspectRatio > 1.8) {
      // Blend toward the larger scale to fill more of the screen.
      // More extreme ratio → stronger blend (up to 0.5).
      var blendFactor = Math.min((aspectRatio - 1.8) / 3, 0.5);
      var largerScale = Math.max(scaleX, scaleY);
      scale = Math.min(naturalScale + (largerScale - naturalScale) * blendFactor, 2.0);
    }
    if (scale < 0.01) scale = 0.01;

    // Ensure nodes are at least 4px on screen (prevents "texture grid" appearance)
    // Use median node radius (from pn.radius, set by effectiveRadius)
    var radii: number[] = [];
    nodes.forEach(function(pn: any) { radii.push(pn.radius || 15); });
    radii.sort(function(a: number, b: number) { return a - b; });
    var medianR = radii[Math.floor(radii.length / 2)] || 15;
    var screenNodePx = medianR * scale * 2; // diameter in screen pixels
    if (screenNodePx < 4 && count > 20) {
      // Zoom in just enough for nodes to be 4px — but cap at 0.5 to avoid clipping
      var minNodeScale = 4 / (medianR * 2);
      scale = Math.min(Math.max(scale, minNodeScale), 0.5);
    }

    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;

    wc.scale.set(scale, scale);
    wc.x = cw / 2 - cx * scale;
    wc.y = ch / 2 - cy * scale;

    // Enable screenshot mode: disables zoomFade + aggregateMode in RenderPipeline
    if (v.renderPipeline) {
      v.renderPipeline.screenshotMode = true;
      v.renderPipeline.aggregateMode = false;
    }

    v.markDirty();
    await new Promise(function(r) { setTimeout(r, 500); });

    // Force label update at final zoom
    if (v.updateLabelsForZoom) v.updateLabelsForZoom();
    if (v.renderPipeline && v.renderPipeline.cullOverlappingLabels) {
      v.renderPipeline.cullOverlappingLabels();
    }

    // Force all node graphics visible (counter zoomFade at low zoom)
    // BUT only in graph viewMode — sunburst/timeline/matrix hide nodes intentionally
    var viewMode = v.panel?.viewMode ?? "graph";
    if (viewMode === "graph") {
      nodes.forEach(function(pn: any) {
        if (pn.gfx) pn.gfx.visible = true;
        if (pn.gfx) pn.gfx.alpha = 1;
        if (pn.label) pn.label.visible = true;
      });
    }

    v.markDirty();
    await new Promise(function(r) { setTimeout(r, 500); });
  });
  await page.waitForTimeout(500);

  return { nodes, settings: effectiveSettings };
}

/** Quality gate: check for anti-patterns */
async function qualityCheck(page: Page): Promise<{ pass: boolean; issues: string[] }> {
  return page.evaluate(function() {
    var v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
    if (!v) return { pass: false, issues: ["No view"] };

    var issues: string[] = [];
    var nodes = v.pixiNodes;
    if (!nodes || nodes.size < 5) {
      issues.push("Too few nodes: " + (nodes?.size ?? 0));
      return { pass: false, issues: issues };
    }

    // Check 1: Centering — use worldContainer transform to compute screen positions
    var cw = 1920;
    var ch = 1080;
    var wc = v.worldContainer;
    var sx = wc ? wc.scale.x : 1;
    var sy = wc ? wc.scale.y : 1;
    var tx = wc ? wc.x : 0;
    var ty = wc ? wc.y : 0;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var visCount = 0;

    nodes.forEach(function(pn: any) {
      // Node coordinates are in pn.data.x/y (d3-force world coords)
      if (!pn.data) return;
      var wx = pn.data.x;
      var wy = pn.data.y;
      if (wx === undefined || wy === undefined) return;
      // Transform world coords to screen coords
      var screenX = wx * sx + tx;
      var screenY = wy * sy + ty;
      if (screenX >= -100 && screenX <= cw + 100 && screenY >= -100 && screenY <= ch + 100) {
        visCount++;
        if (screenX < minX) minX = screenX;
        if (screenX > maxX) maxX = screenX;
        if (screenY < minY) minY = screenY;
        if (screenY > maxY) maxY = screenY;
      }
    });

    if (visCount < 5 && nodes.size >= 5) {
      issues.push("Too few visible nodes in viewport: " + visCount + "/" + nodes.size);
    }

    // Check spread — nodes should use at least 15% of canvas in each dimension
    if (visCount > 10) {
      var spreadX = (maxX - minX) / cw;
      var spreadY = (maxY - minY) / ch;
      if (spreadX < 0.15 && spreadY < 0.15) {
        issues.push("Nodes clustered too tightly: " + Math.round(spreadX * 100) + "% x " + Math.round(spreadY * 100) + "%");
      }
    }

    // Check 2: Color diversity — color is on pn.color, not pn.data.color
    var colors = new Set();
    nodes.forEach(function(pn: any) {
      if (pn.color !== undefined) colors.add(pn.color);
    });
    if (colors.size < 2 && nodes.size > 10) {
      issues.push("Low color diversity: " + colors.size + " colors");
    }

    // Check 3: Phantom labels — should not see "°0"
    var phantomCount = 0;
    nodes.forEach(function(pn: any) {
      if (pn.data?.id?.startsWith("__phantom")) phantomCount++;
    });
    if (phantomCount > 0) {
      issues.push("Phantom nodes still rendered: " + phantomCount);
    }

    return { pass: issues.length === 0, issues: issues };
  });
}

async function captureScreenshot(cdp: CDPSession, outPath: string): Promise<boolean> {
  try {
    var result = await cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
    });
    if (result.data) {
      var buf = Buffer.from(result.data, "base64");
      fs.writeFileSync(outPath, buf);
      return buf.length > 5000;
    }
    return false;
  } catch { return false; }
}

async function hideChrome(page: Page): Promise<void> {
  await page.evaluate(function() {
    var selectors = ".notice, .graph-island-notification, .mod-warning, .graph-status, .status-bar, .titlebar, .workspace-tab-header-container, .workspace-ribbon";
    document.querySelectorAll(selectors).forEach(function(el) {
      (el as HTMLElement).style.display = "none";
    });
  });
  await page.waitForTimeout(500);
  await page.evaluate(function() {
    document.querySelectorAll(".notice, .graph-status, .status-bar").forEach(function(el) {
      (el as HTMLElement).style.display = "none";
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const startIndex = parseInt(process.argv[2] ?? "0", 10);

  const presetFiles = fs.readdirSync(SAMPLES_DIR)
    .filter(f => f.endsWith(".json"))
    .filter(f => !SKIP_PRESETS.has(f.replace(".json", "")))
    .sort();

  console.log(`Found ${presetFiles.length} presets (starting from ${startIndex})`);

  const { browser, page, cdp } = await connect();
  console.log("Connected to Obsidian via CDP");

  await setupViewport(page, cdp);

  // Reload plugin once (not full reload) to apply latest build
  await page.evaluate(async function() {
    var app = (window as any).app;
    for (var l of app.workspace.getLeavesOfType("graph-view")) l.detach();
    await app.plugins.disablePlugin("graph-island");
    await new Promise(function(r) { setTimeout(r, 500); });
    await app.plugins.enablePlugin("graph-island");
    await new Promise(function(r) { setTimeout(r, 2000); });
    await app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(5000);
  await page.evaluate(function() {
    var v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
    if (v) v.onResize();
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(1000);

  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  console.log(`Viewport: ${vp.w}x${vp.h}`);

  const results: { name: string; nodes: number; pass: boolean; issues: string[] }[] = [];
  let lastHash = "";

  for (let i = startIndex; i < presetFiles.length; i++) {
    const presetFile = presetFiles[i];
    const presetName = presetFile.replace(".json", "");
    const presetPath = path.join(SAMPLES_DIR, presetFile);
    const outPath = path.join(OUT_DIR, `${presetName}.png`);

    console.log(`\n[${i + 1}/${presetFiles.length}] ${presetName}`);

    try {
      const preset = JSON.parse(fs.readFileSync(presetPath, "utf-8"));
      const applyResult = await applyPresetSafe(page, preset);

      if (applyResult.nodes < 0) {
        console.log("  ✗ Preset failed, reloading...");
        await fullReload(page);
        continue;
      }
      const nodeCount = applyResult.nodes;
      console.log(`  Nodes: ${nodeCount}`);

      // Save effective settings JSON
      if (applyResult.settings) {
        const settingsOutPath = path.join(OUT_DIR, `${presetName}.json`);
        fs.writeFileSync(settingsOutPath, JSON.stringify(applyResult.settings, null, 2));
      }

      // Quality check
      const qc = await qualityCheck(page);
      if (!qc.pass) {
        console.log(`  ⚠ Quality issues: ${qc.issues.join(", ")}`);
      }

      await hideChrome(page);
      await page.waitForTimeout(300);

      // Ensure screenshotMode is still active before capture
      await page.evaluate(function() {
        var v = (window as any).app.workspace.getLeavesOfType("graph-view")
          .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
        if (v && v.renderPipeline) {
          v.renderPipeline.screenshotMode = true;
          v.renderPipeline.aggregateMode = false;
        }
        // Trigger one more render with screenshotMode active
        if (v) { v.markDirty(); }
      });
      await page.waitForTimeout(300);

      const captured = await captureScreenshot(cdp, outPath);
      if (!captured) { console.log("  ✗ Screenshot failed"); continue; }

      const fileSize = fs.statSync(outPath).size;

      // Duplicate check
      const crypto = await import("crypto");
      const hash = crypto.createHash("md5").update(fs.readFileSync(outPath)).digest("hex");
      if (hash === lastHash) {
        console.log("  ⚠ Duplicate! Reloading...");
        await fullReload(page);
        const retryResult = await applyPresetSafe(page, preset);
        if (retryResult.nodes > 0) {
          await hideChrome(page);
          await page.waitForTimeout(300);
          await captureScreenshot(cdp, outPath);
          const retryHash = crypto.createHash("md5").update(fs.readFileSync(outPath)).digest("hex");
          if (retryHash !== lastHash) { lastHash = retryHash; console.log("  ✓ Retry OK"); }
          else { console.log("  ✗ Still duplicate"); continue; }
        }
      } else {
        lastHash = hash;
      }

      console.log(`  Saved: ${(fileSize / 1024).toFixed(0)}KB${qc.pass ? " ✓" : ""}`);
      results.push({ name: presetName, nodes: nodeCount, pass: qc.pass, issues: qc.issues });

      // --- Zoomed-in (3x) variant centered on node centroid ---
      const zoomedPath = path.join(OUT_DIR, `${presetName}-zoomed.png`);
      await page.evaluate(async function() {
        var v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
        if (!v || !v.worldContainer) return;
        var w = v.worldContainer;

        // Zoom in 3x from current level, centered on canvas center
        var canvas = v.app?.view;
        var cw = canvas?.width ?? 1446;
        var ch = canvas?.height ?? 706;
        var curScale = w.scale.x;
        var newScale = curScale * 3;
        var pivotX = cw / 2;
        var pivotY = ch / 2;
        w.x = pivotX - (pivotX - w.x) * (newScale / curScale);
        w.y = pivotY - (pivotY - w.y) * (newScale / curScale);
        w.scale.set(newScale, newScale);
        if (v.renderPipeline) v.renderPipeline.aggregateMode = false;
        v.markDirty();
        if (v.updateLabelsForZoom) v.updateLabelsForZoom();
        if (v.renderPipeline && v.renderPipeline.cullOverlappingLabels) {
          v.renderPipeline.cullOverlappingLabels();
        }
        await new Promise(function(r) { setTimeout(r, 2000); });
      });
      await hideChrome(page);
      await page.waitForTimeout(300);
      await captureScreenshot(cdp, zoomedPath);
      const zoomSize = fs.existsSync(zoomedPath) ? fs.statSync(zoomedPath).size : 0;
      if (zoomSize > 5000) {
        console.log(`  Zoomed: ${(zoomSize / 1024).toFixed(0)}KB`);
        // Save zoomed settings too
        if (applyResult.settings) {
          const zoomSettingsPath = path.join(OUT_DIR, `${presetName}-zoomed.json`);
          const zoomSettings = { ...applyResult.settings, _absoluteZoom: 0.8 };
          fs.writeFileSync(zoomSettingsPath, JSON.stringify(zoomSettings, null, 2));
        }
      }

      // Restore zoom for next preset
      await page.evaluate(async function() {
        var v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
        if (v && v.worldContainer) {
          var w = v.worldContainer;
          w.scale.set(w.scale.x / 6, w.scale.y / 6);
          v.markDirty();
        }
      });
      await page.waitForTimeout(300);

    } catch (e) {
      console.error(`  ✗ Error: ${(e as Error).message.substring(0, 150)}`);
      try { await fullReload(page); } catch {}
    }
  }

  // Summary
  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);
  console.log("\n========================================");
  console.log(`Captured: ${results.length}/${presetFiles.length}`);
  console.log(`Quality PASS: ${passed.length}, FAIL: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\nFailed presets:");
    for (const f of failed) console.log(`  ${f.name}: ${f.issues.join(", ")}`);
  }
  console.log("========================================");

  fs.writeFileSync(path.join(OUT_DIR, "_results.json"), JSON.stringify(results, null, 2));
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await browser.close();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
