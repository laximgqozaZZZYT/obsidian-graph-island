import * as PIXI from "pixi.js";
import type { Pt } from "../utils/geometry";
import { convexHull } from "../utils/geometry";
import { cssColorToHex } from "../utils/graph-helpers";
import { DEFAULT_COLORS } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnclosureConfig {
  tagDisplay: "node" | "enclosure";
  tagMembership: Map<string, Set<string>>;
  nodeColorMap: Map<string, string>;
  tagRelPairsCache: Set<string>;
  resolvePos: (id: string) => (Pt & { radius?: number }) | undefined;
  /** Current world scale (zoom level). Used to adapt rendering style. */
  worldScale: number;
  /** Total number of nodes in the graph. Used with enclosureMinRatio. */
  totalNodeCount: number;
  /** Minimum fraction (0–1) of totalNodeCount a group must have to show an enclosure. */
  enclosureMinRatio: number;
}

/**
 * Mutable overlap cache — owned by GraphViewContainer, passed in by reference.
 * drawEnclosures reads/writes these fields to amortize overlap computation.
 */
export interface OverlapCache {
  frame: number;
  counts: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Internal data
// ---------------------------------------------------------------------------

interface EncData {
  tag: string;
  pts: (Pt & { radius: number })[];
  hex: number;
  expanded: Pt[];
  minX: number; minY: number; maxX: number; maxY: number;
}

/** Minimum extra padding beyond node radius for the outline */
const OUTLINE_PAD_MIN = 4;
/** Padding scales with node radius: pad = max(MIN, radius × factor) */
const OUTLINE_PAD_FACTOR = 0.5;
/** Number of sample points around each node circle for hull generation */
const HULL_SAMPLES = 12;

/** Compute dynamic padding for a given node radius */
function outlinePad(radius: number): number {
  return Math.max(OUTLINE_PAD_MIN, radius * OUTLINE_PAD_FACTOR);
}

/**
 * Zoom threshold: below this worldScale the view is considered "zoomed out".
 * In zoomed-out mode enclosures switch to filled regions with prominent labels.
 */
const ZOOM_OUT_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw tag enclosures around node groups.
 *
 * Rendering adapts to zoom level:
 *   - **Zoomed in** (worldScale ≥ threshold): Bold outline strokes hugging
 *     the outer boundary of member nodes. Labels are small.
 *   - **Zoomed out** (worldScale < threshold): Semi-transparent coloured fill
 *     with large, prominent labels so groups are identifiable at a glance.
 */
export function drawEnclosures(
  g: PIXI.Graphics,
  enclosureLabels: Map<string, PIXI.Text>,
  overlapCache: OverlapCache,
  cfg: EnclosureConfig,
): void {
  g.clear();

  if (cfg.tagDisplay !== "enclosure") {
    for (const lbl of enclosureLabels.values()) lbl.visible = false;
    return;
  }

  const ws = cfg.worldScale || 1;
  const zoomedOut = ws < ZOOM_OUT_THRESHOLD;
  // Smooth blend factor: 1 = fully zoomed-out style, 0 = fully zoomed-in style
  const blend = zoomedOut
    ? Math.min(1, (ZOOM_OUT_THRESHOLD - ws) / (ZOOM_OUT_THRESHOLD * 0.5))
    : 0;

  // Phase 1: Collect node positions + radii per tag, compute expanded hull
  const minCount = Math.max(1, Math.floor(cfg.totalNodeCount * cfg.enclosureMinRatio));
  const enclosures: EncData[] = [];

  for (const [tag, memberIds] of cfg.tagMembership) {
    if (memberIds.size < minCount) continue;

    const allPts: (Pt & { radius: number })[] = [];
    for (const id of memberIds) {
      const p = cfg.resolvePos(id);
      if (p) allPts.push({ x: p.x, y: p.y, radius: p.radius ?? 6 });
    }
    if (allPts.length < 1) continue;

    // Filter outliers: keep only nodes within 1.5× IQR of centroid distance.
    // This prevents scattered tag members from inflating the hull.
    const pts = filterOutliers(allPts);
    if (pts.length < 1) continue;

    const colorKey = `tag:${tag}`;
    const cssColor = cfg.nodeColorMap.get(colorKey) || DEFAULT_COLORS[0];
    const hex = cssColorToHex(cssColor);

    // Generate boundary sample points around each node's circle
    // so the convex hull fully contains every node regardless of radius.
    const hullInput: Pt[] = [];
    for (const p of pts) {
      const r = p.radius + outlinePad(p.radius);
      for (let k = 0; k < HULL_SAMPLES; k++) {
        const angle = (k / HULL_SAMPLES) * Math.PI * 2;
        hullInput.push({ x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r });
      }
    }

    let expanded: Pt[];
    if (pts.length === 1) {
      const p = pts[0];
      const r = p.radius + outlinePad(p.radius);
      expanded = [
        { x: p.x - r, y: p.y - r },
        { x: p.x + r, y: p.y - r },
        { x: p.x + r, y: p.y + r },
        { x: p.x - r, y: p.y + r },
      ];
    } else {
      expanded = convexHull(hullInput);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of expanded) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }

    enclosures.push({ tag, pts, hex, expanded, minX, minY, maxX, maxY });
  }

  // Phase 2: Sort large-first for z-order (matters for fill overlap)
  enclosures.sort((a, b) => {
    const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
    const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
    return areaB - areaA;
  });

  // Phase 3: Overlap count (recompute every 30 frames for perf)
  overlapCache.frame++;
  if (overlapCache.frame >= 30) {
    overlapCache.frame = 0;
    overlapCache.counts.clear();
    const relPairs = cfg.tagRelPairsCache;
    for (let i = 0; i < enclosures.length; i++) {
      for (let j = i + 1; j < enclosures.length; j++) {
        const a = enclosures[i], b = enclosures[j];
        if (relPairs.has(`${a.tag}\0${b.tag}`)) continue;
        if (a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY) continue;
        overlapCache.counts.set(a.tag, (overlapCache.counts.get(a.tag) || 0) + 1);
        overlapCache.counts.set(b.tag, (overlapCache.counts.get(b.tag) || 0) + 1);
      }
    }
  }

  // Phase 4: Draw
  const usedLabels = new Set<string>();
  for (const enc of enclosures) {
    const { tag, pts, hex, expanded } = enc;
    const overlaps = overlapCache.counts.get(tag) || 0;

    // --- Stroke style ---
    const baseLineAlpha = overlaps === 0 ? 0.7 : Math.max(0.45, 0.65 / (1 + overlaps * 0.1));
    const lineWidth = overlaps === 0 ? 2 : Math.max(2.5, 3 - overlaps * 0.3);

    // --- Fill style (zoomed-out: always show fill; overlapping: reduced alpha) ---
    const fillAlpha = blend > 0
      ? (overlaps > 0 ? blend * 0.08 : blend * 0.25)
      : 0;

    let labelX = 0, labelY = 0;
    let labelCenterX = 0, labelCenterY = 0;

    // Draw filled shape first (behind stroke) when zoomed out
    if (fillAlpha > 0.005) {
      g.lineStyle(0);
      g.beginFill(hex, fillAlpha);
      if (pts.length === 1) {
        const p0 = pts[0];
        g.drawCircle(p0.x, p0.y, p0.radius + outlinePad(p0.radius));
      } else if (pts.length === 2) {
        const maxR = Math.max(pts[0].radius, pts[1].radius);
        drawCapsule(g, pts[0], pts[1], maxR + outlinePad(maxR));
      } else {
        drawSmoothHull(g, expanded);
      }
      g.endFill();
    }

    // Draw stroke
    g.lineStyle(lineWidth, hex, baseLineAlpha);
    if (pts.length === 1) {
      const p = pts[0];
      const r = p.radius + outlinePad(p.radius);
      g.drawCircle(p.x, p.y, r);
      labelX = p.x; labelY = p.y - r - 8;
      labelCenterX = p.x; labelCenterY = p.y;
    } else if (pts.length === 2) {
      const maxR = Math.max(pts[0].radius, pts[1].radius);
      const r = maxR + outlinePad(maxR);
      drawCapsule(g, pts[0], pts[1], r);
      labelX = (pts[0].x + pts[1].x) / 2;
      labelY = Math.min(pts[0].y, pts[1].y) - r - 8;
      labelCenterX = labelX;
      labelCenterY = (pts[0].y + pts[1].y) / 2;
    } else {
      drawSmoothHull(g, expanded);
      let topY = Infinity;
      let sumX = 0, sumY = 0;
      for (const p of expanded) {
        sumX += p.x; sumY += p.y;
        if (p.y < topY) { topY = p.y; labelX = p.x; }
      }
      labelY = topY - 8;
      labelCenterX = sumX / expanded.length;
      labelCenterY = sumY / expanded.length;
    }

    // --- Label ---
    usedLabels.add(tag);
    let txt = enclosureLabels.get(tag);
    if (!txt) {
      const hexStr = "#" + hex.toString(16).padStart(6, "0");
      txt = new PIXI.Text(`#${tag}`, {
        fontSize: 14,
        fill: hexStr,
        fontFamily: "sans-serif",
        fontWeight: "bold",
      });
      txt.anchor.set(0.5, 0.5);
      txt.resolution = 2;
      g.parent?.addChild(txt);
      enclosureLabels.set(tag, txt);
    }

    // When zoomed out: label centred inside the region, large and prominent
    // When zoomed in:  label above the top edge, smaller
    if (zoomedOut) {
      txt.x = labelCenterX;
      txt.y = labelCenterY;
      txt.alpha = Math.max(0.7, 0.95 - overlaps * 0.04);
      const labelScale = Math.min(8, Math.max(1.5, 1.8 / ws));
      txt.scale.set(labelScale);
    } else {
      txt.x = labelX;
      txt.y = labelY;
      txt.alpha = Math.max(0.6, 0.85 - overlaps * 0.04);
      txt.anchor.set(0.5, 1);
      const labelScale = Math.min(4, Math.max(1, 1 / ws));
      txt.scale.set(labelScale);
    }
    txt.visible = true;
  }

  // Hide unused labels
  for (const [tag, lbl] of enclosureLabels) {
    if (!usedLabels.has(tag)) lbl.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

export function drawSmoothHull(g: PIXI.Graphics, points: Pt[]) {
  if (points.length < 3) return;
  const n = points.length;
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = mid(points[n - 1], points[0]);
  g.moveTo(first.x, first.y);
  for (let i = 0; i < n; i++) {
    const cp = points[i];
    const next = points[(i + 1) % n];
    const ep = mid(cp, next);
    g.quadraticCurveTo(cp.x, cp.y, ep.x, ep.y);
  }
}

export function drawCapsule(g: PIXI.Graphics, p0: Pt, p1: Pt, radius: number) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;

  const r = radius;
  const a = { x: p0.x + px * r, y: p0.y + py * r };
  const b = { x: p1.x + px * r, y: p1.y + py * r };
  const c = { x: p1.x - px * r, y: p1.y - py * r };
  const d = { x: p0.x - px * r, y: p0.y - py * r };

  const k = 1.1;
  const p1out = { x: p1.x + ux * r * k, y: p1.y + uy * r * k };
  const p0out = { x: p0.x - ux * r * k, y: p0.y - uy * r * k };

  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  const mid1r = { x: (b.x + c.x) / 2 + ux * r, y: (b.y + c.y) / 2 + uy * r };
  g.quadraticCurveTo(p1out.x, p1out.y, mid1r.x, mid1r.y);
  g.quadraticCurveTo(p1out.x, p1out.y, c.x, c.y);
  g.lineTo(d.x, d.y);
  const mid0l = { x: (d.x + a.x) / 2 - ux * r, y: (d.y + a.y) / 2 - uy * r };
  g.quadraticCurveTo(p0out.x, p0out.y, mid0l.x, mid0l.y);
  g.quadraticCurveTo(p0out.x, p0out.y, a.x, a.y);
}

/**
 * Filter outlier points using IQR on distance from centroid.
 * Keeps only points within Q3 + 1.5×IQR of the centroid, preventing
 * spatially scattered tag members from inflating the convex hull.
 */
function filterOutliers<T extends Pt>(pts: T[]): T[] {
  if (pts.length <= 3) return pts;

  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

  const dists = pts.map(p => Math.hypot(p.x - cx, p.y - cy));
  const sorted = [...dists].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const cutoff = q3 + 1.5 * iqr;

  const result: T[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (dists[i] <= cutoff) result.push(pts[i]);
  }
  return result.length >= 1 ? result : pts;
}
