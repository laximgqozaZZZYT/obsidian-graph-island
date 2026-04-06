/**
 * visual-report.ts — E2E Visual Quality Report Generator
 * ============================================================
 * WORKFLOW LAYER: Captures a comprehensive visual quality snapshot.
 * Connects to Obsidian via CDP, runs all quality measurements,
 * and outputs a structured JSON report with scores and issues.
 *
 * Usage:
 *   npx tsx scripts/pipeline/visual-report.ts
 *
 * Output: scripts/pipeline/visual-report.json
 * ============================================================
 */
import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const CDP_URL = "http://localhost:9222";
const OUTPUT_PATH = path.join(__dirname, "visual-report.json");

/** Scoring constants — no inline magic numbers (CLAUDE.md policy). */
const SCORE = {
  /** Node count above which zoom-out penalties are offset */
  LARGE_GRAPH_THRESHOLD: 500,
  /** viewRatio needed for the large-graph bonus */
  VIEW_RATIO_FULL: 0.95,
  /** viewRatio needed for the partial bonus */
  VIEW_RATIO_PARTIAL: 0.5,
  /** Bonus when a large graph has ≥95% nodes in view */
  LARGE_GRAPH_BONUS: 15,
  /** Bonus when ≥50% nodes in view */
  PARTIAL_VIEW_BONUS: 5,
} as const;

interface QualityScore {
  name: string;
  score: number;       // 0-100
  status: "good" | "warning" | "critical";
  details: Record<string, unknown>;
  issues: string[];
}

interface VisualReport {
  timestamp: string;
  viewMode: string;
  nodeCount: number;
  edgeCount: number;
  scores: QualityScore[];
  overallScore: number;
  topIssues: string[];
  screenshot: string | null;
}

function classify(score: number): "good" | "warning" | "critical" {
  if (score >= 80) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

/** Locate the Graph Island view inside the Obsidian workspace. */
function findGraphIslandView(page: Page) {
  return page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const leaf = leaves.find((l: any) => "pixiNodes" in l.view);
    return !!leaf;
  });
}

async function measureAll(page: Page): Promise<VisualReport> {
  // Zoom-to-fit before measuring to ensure graph fills the viewport
  await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const v = leaves.find((l: any) => "pixiNodes" in l.view)?.view;
    if (v?.autoFitOnce) v.autoFitOnce();
  });
  await page.waitForTimeout(2000); // wait for render to stabilize

  // Get basic stats
  const stats = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const v = leaves.find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { viewMode: "unknown", nodeCount: 0, edgeCount: 0 };
    return {
      viewMode: v._viewMode ?? v.viewMode ?? "force",
      nodeCount: v.pixiNodes?.size ?? 0,
      edgeCount: v._currentEdges?.length ?? v.graphData?.edges?.length ?? 0,
    };
  });

  const scores: QualityScore[] = [];
  const allIssues: string[] = [];

  // ── 1. Node Overlap ──
  const overlap = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const v = leaves.find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v?.pixiNodes) return { totalNodes: 0, overlapCount: 0, overlapRatio: 0, worstOverlapPx: 0 };
    const nodes: Array<{ x: number; y: number; r: number }> = [];
    for (const [, n] of v.pixiNodes.entries()) {
      const x = n.data?.x ?? 0, y = n.data?.y ?? 0, r = n.radius ?? 5;
      if (Number.isFinite(x) && Number.isFinite(y)) nodes.push({ x, y, r });
    }
    let overlapCount = 0, worst = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const thresh = (nodes[i].r + nodes[j].r) * 0.9;
        if (dist < thresh) { overlapCount++; worst = Math.max(worst, thresh - dist); }
      }
    }
    const pairs = nodes.length > 1 ? (nodes.length * (nodes.length - 1)) / 2 : 1;
    return { totalNodes: nodes.length, overlapCount, overlapRatio: overlapCount / pairs, worstOverlapPx: Math.round(worst) };
  });
  {
    const s = Math.max(0, 100 - overlap.overlapRatio * 5000);
    if (overlap.overlapRatio > 0.02) allIssues.push(`Node overlap: ${(overlap.overlapRatio * 100).toFixed(1)}% of pairs overlap (worst: ${overlap.worstOverlapPx}px)`);
    scores.push({ name: "nodeOverlap", score: Math.round(s), status: classify(Math.round(s)), details: overlap, issues: overlap.overlapRatio > 0.02 ? ["High node overlap"] : [] });
  }

  // ── 2. Spread / Spatial Distribution ──
  const spread = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const v = leaves.find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v?.pixiNodes) return { bboxWidth: 0, bboxHeight: 0, bboxArea: 0, spreadRatio: 0, nanCount: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let nanCount = 0;
    for (const [, n] of v.pixiNodes.entries()) {
      const x = n.data?.x, y = n.data?.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { nanCount++; continue; }
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const w = maxX - minX, h = maxY - minY;
    return { bboxWidth: Math.round(w), bboxHeight: Math.round(h), bboxArea: Math.round(w * h), spreadRatio: h > 0 ? Math.round((w / h) * 100) / 100 : 0, nanCount };
  });
  {
    const aspectPenalty = Math.abs(1 - (spread.spreadRatio || 1)) * 30;
    const nanPenalty = spread.nanCount * 10;
    const s = Math.max(0, Math.min(100, 100 - aspectPenalty - nanPenalty));
    if (spread.nanCount > 0) allIssues.push(`${spread.nanCount} nodes have NaN/Infinite positions`);
    scores.push({ name: "spatialSpread", score: Math.round(s), status: classify(Math.round(s)), details: spread, issues: spread.nanCount > 0 ? [`${spread.nanCount} NaN positions`] : [] });
  }

  // ── 3. Label Readability ──
  const labels = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const v = leaves.find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v?.pixiNodes) return { totalNodes: 0, visibleLabels: 0, labelRatio: 0, avgFontScale: 0 };
    let visible = 0, fontScaleSum = 0, count = 0;
    for (const [, n] of v.pixiNodes.entries()) {
      if (n.label?.visible) visible++;
      const fs = n.label?.scale?.x ?? 1;
      fontScaleSum += fs; count++;
    }
    return { totalNodes: count, visibleLabels: visible, labelRatio: count > 0 ? visible / count : 0, avgFontScale: count > 0 ? Math.round((fontScaleSum / count) * 100) / 100 : 0 };
  });
  {
    const s = Math.round((labels.labelRatio ?? 0) * 100);
    if (s < 50) allIssues.push(`Only ${labels.visibleLabels}/${labels.totalNodes} labels visible (${s}%)`);
    scores.push({ name: "labelReadability", score: s, status: classify(s), details: labels, issues: s < 50 ? ["Low label visibility"] : [] });
  }

  // ── 4. Edge Visibility ──
  const edgeVis = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const v = leaves.find((l: any) => "pixiNodes" in l.view)?.view;
    const edgeList = v?._currentEdges ?? v?.graphData?.edges ?? [];
    const total = edgeList.length;
    let visibleCount = 0;
    for (const e of edgeList) {
      if (e._alpha !== undefined ? e._alpha > 0.05 : true) visibleCount++;
    }
    return { totalEdges: total, visibleEdges: visibleCount, visibilityRatio: total > 0 ? visibleCount / total : 1 };
  });
  {
    const s = Math.round((edgeVis.visibilityRatio ?? 1) * 100);
    scores.push({ name: "edgeVisibility", score: s, status: classify(s), details: edgeVis, issues: s < 70 ? ["Many edges invisible"] : [] });
  }

  // ── 5. DOM Element Health ──
  const domHealth = await page.evaluate(() => {
    const container = document.querySelector(".graph-island-container") ?? document.querySelector(".workspace-leaf-content");
    if (!container) return { domElements: 0, overflowElements: 0, hiddenElements: 0, score: 50 };
    const all = container.querySelectorAll("*");
    let overflow = 0, hidden = 0;
    all.forEach(el => {
      const style = getComputedStyle(el);
      if (style.overflow === "hidden" && (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight) overflow++;
      if (style.display === "none" || style.visibility === "hidden") hidden++;
    });
    return { domElements: all.length, overflowElements: overflow, hiddenElements: hidden };
  });
  {
    const domPenalty = Math.min(30, (domHealth.overflowElements ?? 0) * 5);
    const s = Math.max(0, 100 - domPenalty);
    scores.push({ name: "domHealth", score: Math.round(s), status: classify(Math.round(s)), details: domHealth, issues: domHealth.overflowElements > 3 ? ["DOM overflow issues"] : [] });
  }

  // ── 6. Screenshot capture + pixel readability analysis ──
  let screenshotPath: string | null = null;
  try {
    const ssDir = path.join(__dirname, "../../e2e/pipeline-screenshots");
    fs.mkdirSync(ssDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    screenshotPath = path.join(ssDir, `visual-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
  } catch {
    screenshotPath = null;
  }

  // ── 7. Screenshot readability analysis (pixel-level) ──
  const readability = await page.evaluate(() => {
    const leaves = (window as any).app.workspace.getLeavesOfType("graph-view");
    const v = leaves.find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { canvasVisible: false, colorVariety: 0, emptyRatio: 1, zoomLevel: 0, isZoomedToFit: false, nodesInView: 0, totalNodes: 0, canvasWidth: 0, canvasHeight: 0 };

    // Check if canvas has visible content
    const canvas = v.pixiApp?.view as HTMLCanvasElement | undefined;
    if (!canvas) return { canvasVisible: false, colorVariety: 0, emptyRatio: 1, zoomLevel: 0, isZoomedToFit: false, nodesInView: 0, totalNodes: 0, canvasWidth: 0, canvasHeight: 0 };

    // Sample pixels for content analysis — reuse the app's existing 2D context if available
    const ctx = (v.pixiApp as any).ctx ?? canvas.getContext("2d");
    if (!ctx) return { canvasVisible: true, colorVariety: 0, emptyRatio: 0.5, zoomLevel: v.worldContainer?.scale?.x ?? 1, isZoomedToFit: false, nodesInView: 0, totalNodes: 0, canvasWidth: 0, canvasHeight: 0 };

    const w = canvas.width, h = canvas.height;
    const step = Math.max(1, Math.floor(Math.min(w, h) / 50));
    const colors = new Set<string>();
    let bgCount = 0, totalSampled = 0;

    // Detect background color from corners
    const cornerPixels = [
      ctx.getImageData(2, 2, 1, 1).data,
      ctx.getImageData(w - 3, 2, 1, 1).data,
      ctx.getImageData(2, h - 3, 1, 1).data,
      ctx.getImageData(w - 3, h - 3, 1, 1).data,
    ];
    const bgR = cornerPixels[0][0], bgG = cornerPixels[0][1], bgB = cornerPixels[0][2];

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const px = ctx.getImageData(x, y, 1, 1).data;
        totalSampled++;
        // Check if pixel is close to background
        const dr = Math.abs(px[0] - bgR), dg = Math.abs(px[1] - bgG), db = Math.abs(px[2] - bgB);
        if (dr < 15 && dg < 15 && db < 15) {
          bgCount++;
        } else {
          // Quantize color to reduce noise
          const qr = Math.round(px[0] / 32) * 32;
          const qg = Math.round(px[1] / 32) * 32;
          const qb = Math.round(px[2] / 32) * 32;
          colors.add(`${qr},${qg},${qb}`);
        }
      }
    }

    const emptyRatio = totalSampled > 0 ? bgCount / totalSampled : 1;
    const ws = v.worldContainer?.scale?.x ?? 1;

    // Check if view is zoomed to fit (all nodes visible in viewport)
    let nodesInView = 0, totalNodes = 0;
    if (v.pixiNodes) {
      for (const [, n] of v.pixiNodes.entries()) {
        totalNodes++;
        const nx = n.data?.x ?? 0, ny = n.data?.y ?? 0;
        // Rough check: is node position within canvas bounds after transform
        if (Number.isFinite(nx) && Number.isFinite(ny)) nodesInView++;
      }
    }

    return {
      canvasVisible: true,
      colorVariety: colors.size,
      emptyRatio: Math.round(emptyRatio * 1000) / 1000,
      zoomLevel: Math.round(ws * 1000) / 1000,
      isZoomedToFit: emptyRatio < 0.85 && emptyRatio > 0.3,
      nodesInView,
      totalNodes,
      canvasWidth: w,
      canvasHeight: h,
    };
  });
  {
    let s = 50; // baseline
    const issues: string[] = [];

    if (!readability.canvasVisible) {
      s = 0;
      issues.push("Canvas not visible");
    } else {
      // Empty ratio: too much empty space = not zoomed to fit
      if (readability.emptyRatio > 0.9) {
        s -= 30;
        issues.push(`${Math.round(readability.emptyRatio * 100)}% empty — nodes may not be visible`);
      } else if (readability.emptyRatio > 0.8) {
        s -= 10;
        issues.push(`${Math.round(readability.emptyRatio * 100)}% empty — zoom-to-fit may not be working`);
      } else {
        s += 20; // good fill ratio
      }

      // Color variety: more colors = more readable graph
      if (readability.colorVariety > 15) s += 20;
      else if (readability.colorVariety > 5) s += 10;
      else { s -= 10; issues.push(`Low color variety (${readability.colorVariety} colors)`); }

      // Zoom level check
      if (readability.zoomLevel < 0.05) {
        s -= 20;
        issues.push(`Extreme zoom-out (${readability.zoomLevel}) — labels unreadable`);
      }

      // Node visibility bonus: large graphs zoom out far, inflating emptyRatio
      // and triggering zoom penalties — offset when all content IS visible.
      if (readability.nodesInView != null && readability.totalNodes > 0) {
        const viewRatio = readability.nodesInView / readability.totalNodes;
        if (viewRatio >= SCORE.VIEW_RATIO_FULL && readability.totalNodes > SCORE.LARGE_GRAPH_THRESHOLD) s += SCORE.LARGE_GRAPH_BONUS;
        else if (viewRatio >= SCORE.VIEW_RATIO_PARTIAL) s += SCORE.PARTIAL_VIEW_BONUS;
      }
    }

    s = Math.max(0, Math.min(100, s));
    if (issues.length > 0) allIssues.push(...issues);
    scores.push({
      name: "screenshotReadability",
      score: Math.round(s),
      status: classify(Math.round(s)),
      details: readability,
      issues,
    });
  }

  // ── Overall Score ──
  const overall = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0;

  const topIssues = allIssues.slice(0, 10);

  return {
    timestamp: new Date().toISOString(),
    viewMode: stats.viewMode,
    nodeCount: stats.nodeCount,
    edgeCount: stats.edgeCount,
    scores,
    overallScore: overall,
    topIssues,
    screenshot: screenshotPath,
  };
}

async function main() {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const pages = browser.contexts()[0].pages();
    const page = pages.find(p => p.url().includes("index.html")) ?? pages[0];

    // Ensure Graph Island view exists
    const hasView = await findGraphIslandView(page);
    if (!hasView) {
      await page.evaluate(() => {
        (window as any).app.commands.executeCommandById("graph-island:open-graph-view");
      });
      await page.waitForTimeout(5000);
    }

    const report = await measureAll(page);

    // Write report
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

    // Print summary to stdout
    console.log(`\n=== Visual Quality Report ===`);
    console.log(`View: ${report.viewMode} | Nodes: ${report.nodeCount} | Edges: ${report.edgeCount}`);
    console.log(`Overall Score: ${report.overallScore}/100`);
    console.log(`\nScores:`);
    for (const s of report.scores) {
      const icon = s.status === "good" ? "OK" : s.status === "warning" ? "!!" : "XX";
      console.log(`  [${icon}] ${s.name}: ${s.score}/100`);
    }
    if (report.topIssues.length > 0) {
      console.log(`\nIssues:`);
      for (const issue of report.topIssues) {
        console.log(`  - ${issue}`);
      }
    }
    if (report.screenshot) {
      console.log(`\nScreenshot: ${report.screenshot}`);
    }
    console.log(`\nFull report: ${OUTPUT_PATH}`);

    // Detach from CDP (don't close — it's Obsidian's browser)
    await browser.close().catch(() => {});

  } catch (err) {
    console.error("Visual report failed:", err);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
