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

// Skip degenerate test presets
const SKIP_PRESETS = new Set(["test-random-scatter", "test-bfs-tree",
  "test-density-concentric", "test-folder-degree"]);

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
          // ANTI-PATTERN FIX: Prevent auto-collapse ONLY for small/medium graphs
          // For large presets (searchQuery empty = full vault), allow collapse to avoid hanging
          var hasSearchFilter = !!p["searchQuery"];
          if (Array.isArray(p[k3]) && p[k3].length === 0 && hasSearchFilter) {
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

      // ANTI-PATTERN FIX: Ensure multi-folder diversity for color variety.
      // For no-query presets, add a folder filter.
      // For single-folder presets, append an additional folder via OR.
      // ANTI-PATTERN FIX: Only add searchQuery for presets with NO query at all
      // (full-vault). Don't modify presets that have their own query.
      if (!v.panel.searchQuery) {
        var folders = [
          "path:mythology-greek* OR path:classic-hamlet*",
          "path:mythology-norse* OR path:classic-arabian-nights*",
          "path:classic-hamlet* OR path:bible-old-testament*",
          "path:classic-arabian-nights* OR path:mythology-egyptian*",
          "path:bible-old-testament* OR path:classic-gilgamesh*",
          "path:classic-gilgamesh* OR path:mythology-japanese*",
          "path:mythology-egyptian* OR path:classic-saiyuki*",
          "path:classic-saiyuki* OR path:classic-king-lear*",
          "path:mythology-japanese* OR path:classic-arthurian*",
          "path:classic-king-lear* OR path:classic-divine-comedy*",
          "path:classic-arthurian* OR path:mythology-greek*",
          "path:classic-divine-comedy* OR path:mythology-norse*",
          "path:mythology-greek* OR path:bible* OR path:classic-saiyuki*",
          "path:classic-hamlet* OR path:mythology-norse* OR path:mythology-egyptian*",
          "path:classic-arabian-nights* OR path:classic-gilgamesh* OR path:classic-arthurian*",
          "path:bible* OR path:mythology-japanese* OR path:classic-king-lear*",
          "path:classic-divine-comedy* OR path:classic-saiyuki* OR path:mythology-greek*",
          "path:mythology-norse* OR path:classic-hamlet* OR path:classic-gilgamesh*",
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

  // AutoFitView with extra stabilization
  await page.evaluate(async function() {
    var v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
    if (v && v.autoFitView) {
      v.autoFitView();
      await new Promise(function(r) { setTimeout(r, 2000); });
      v.autoFitView();
      await new Promise(function(r) { setTimeout(r, 1000); });
    }
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

    // Check 1: Centering — are nodes spread across the canvas?
    var canvas = v.pixiApp?.view ?? v.app?.view;
    var cw = canvas?.width ?? 1920;
    var ch = canvas?.height ?? 1080;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var visCount = 0;

    nodes.forEach(function(pn: any) {
      if (!pn.visible) return;
      var gp = pn.toGlobal ? pn.toGlobal({ x: 0, y: 0 }) : { x: pn.x, y: pn.y };
      if (gp.x >= 0 && gp.x <= cw && gp.y >= 0 && gp.y <= ch) {
        visCount++;
        if (gp.x < minX) minX = gp.x;
        if (gp.x > maxX) maxX = gp.x;
        if (gp.y < minY) minY = gp.y;
        if (gp.y > maxY) maxY = gp.y;
      }
    });

    if (visCount < 5) {
      issues.push("Too few visible nodes in viewport: " + visCount);
    }

    // Check spread — nodes should use at least 20% of canvas in each dimension
    var spreadX = (maxX - minX) / cw;
    var spreadY = (maxY - minY) / ch;
    if (spreadX < 0.15 && spreadY < 0.15 && visCount > 10) {
      issues.push("Nodes clustered too tightly: " + Math.round(spreadX * 100) + "% x " + Math.round(spreadY * 100) + "%");
    }

    // Check 2: Color diversity
    var colors = new Set();
    nodes.forEach(function(pn: any) {
      if (pn.data && pn.data.color !== undefined) colors.add(pn.data.color);
    });

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

      // --- Zoomed-in (2.5x) variant centered on node centroid ---
      const zoomedPath = path.join(OUT_DIR, `${presetName}-zoomed.png`);
      await page.evaluate(async function() {
        var v = (window as any).app.workspace
          .getLeavesOfType("graph-view")
          .find(function(l: any) { return "pixiNodes" in l.view; })?.view;
        if (!v || !v.worldContainer) return;
        var w = v.worldContainer;
        var canvas = v.pixiApp?.view ?? v.app?.view;
        var cw = canvas?.width ?? 1920;
        var ch = canvas?.height ?? 1080;

        // Compute centroid of visible nodes
        var sumX = 0, sumY = 0, count = 0;
        v.pixiNodes.forEach(function(pn) {
          if (pn.data && isFinite(pn.data.x) && isFinite(pn.data.y)) {
            sumX += pn.data.x; sumY += pn.data.y; count++;
          }
        });
        if (count === 0) return;
        var cx = sumX / count;
        var cy = sumY / count;

        // Zoom 2.5x centered on centroid
        var factor = 2.5;
        var newScale = w.scale.x * factor;
        w.scale.set(newScale, newScale);
        // Recenter: world.x = canvas_center - centroid * scale
        w.x = cw / 2 - cx * newScale;
        w.y = ch / 2 - cy * newScale;
        v.markDirty();
        await new Promise(function(r) { setTimeout(r, 1500); });
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
          const zoomSettings = { ...applyResult.settings, _zoomMultiplier: 2.5 };
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
          w.scale.set(w.scale.x / 2.5, w.scale.y / 2.5);
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
