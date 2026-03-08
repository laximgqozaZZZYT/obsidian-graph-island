import * as PIXI from "pixi.js";
import type { Pt } from "../utils/geometry";
import { convexHull, expandHull } from "../utils/geometry";
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
  resolvePos: (id: string) => Pt | undefined;
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
  pts: Pt[];
  hex: number;
  expanded: Pt[];
  area: number;
  minX: number; minY: number; maxX: number; maxY: number;
}

const BASE_PADDING = 24;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw tag enclosures (convex hulls) into the given PIXI.Graphics.
 *
 * @param g              - The PIXI.Graphics to draw shapes into (will be cleared)
 * @param enclosureLabels - Persistent label cache (owned by caller, mutated here)
 * @param overlapCache    - Persistent overlap cache (owned by caller, mutated here)
 * @param cfg             - Configuration for this frame
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

  // Phase 1: Compute hull + AABB for each tag
  const enclosures: EncData[] = [];

  for (const [tag, memberIds] of cfg.tagMembership) {
    const pts: Pt[] = [];
    for (const id of memberIds) {
      const p = cfg.resolvePos(id);
      if (p) pts.push({ x: p.x, y: p.y });
    }
    if (pts.length < 1) continue;

    const colorKey = `tag:${tag}`;
    const cssColor = cfg.nodeColorMap.get(colorKey) || DEFAULT_COLORS[0];
    const hex = cssColorToHex(cssColor);

    let expanded: Pt[];
    if (pts.length === 1) {
      const p = pts[0];
      expanded = [
        { x: p.x - BASE_PADDING, y: p.y - BASE_PADDING },
        { x: p.x + BASE_PADDING, y: p.y - BASE_PADDING },
        { x: p.x + BASE_PADDING, y: p.y + BASE_PADDING },
        { x: p.x - BASE_PADDING, y: p.y + BASE_PADDING },
      ];
    } else if (pts.length === 2) {
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      expanded = [
        { x: pts[0].x + px * BASE_PADDING - ux * BASE_PADDING, y: pts[0].y + py * BASE_PADDING - uy * BASE_PADDING },
        { x: pts[1].x + px * BASE_PADDING + ux * BASE_PADDING, y: pts[1].y + py * BASE_PADDING + uy * BASE_PADDING },
        { x: pts[1].x - px * BASE_PADDING + ux * BASE_PADDING, y: pts[1].y - py * BASE_PADDING + uy * BASE_PADDING },
        { x: pts[0].x - px * BASE_PADDING - ux * BASE_PADDING, y: pts[0].y - py * BASE_PADDING - uy * BASE_PADDING },
      ];
    } else {
      expanded = expandHull(convexHull(pts), BASE_PADDING);
    }

    // AABB
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of expanded) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const area = (maxX - minX) * (maxY - minY);

    enclosures.push({ tag, pts, hex, expanded, area, minX, minY, maxX, maxY });
  }

  // Phase 2: Sort large-first for z-order
  enclosures.sort((a, b) => b.area - a.area);

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

    const fillAlpha = overlaps === 0 ? 0.07 : Math.max(0.01, 0.06 / (1 + overlaps * 0.5));
    const lineAlpha = overlaps === 0 ? 0.6 : Math.max(0.25, 0.5 / (1 + overlaps * 0.15));
    const lineWidth = overlaps > 3 ? 1 : 1.5;

    let labelX = 0, labelY = 0;

    if (pts.length === 1) {
      g.lineStyle(lineWidth, hex, lineAlpha);
      g.beginFill(hex, fillAlpha);
      g.drawCircle(pts[0].x, pts[0].y, BASE_PADDING);
      g.endFill();
      labelX = pts[0].x; labelY = pts[0].y - BASE_PADDING - 10;
    } else if (pts.length === 2) {
      g.lineStyle(lineWidth, hex, lineAlpha);
      g.beginFill(hex, fillAlpha);
      drawCapsule(g, pts[0], pts[1], BASE_PADDING);
      g.endFill();
      labelX = (pts[0].x + pts[1].x) / 2;
      labelY = Math.min(pts[0].y, pts[1].y) - BASE_PADDING - 10;
    } else {
      g.lineStyle(lineWidth, hex, lineAlpha);
      g.beginFill(hex, fillAlpha);
      drawSmoothHull(g, expanded);
      g.endFill();

      let topY = Infinity;
      for (const p of expanded) {
        if (p.y < topY) { topY = p.y; labelX = p.x; }
      }
      labelY = topY - 10;
    }

    // Reuse or create text label
    usedLabels.add(tag);
    let txt = enclosureLabels.get(tag);
    if (!txt) {
      const hexStr = "#" + hex.toString(16).padStart(6, "0");
      txt = new PIXI.Text(`#${tag}`, {
        fontSize: 11,
        fill: hexStr,
        fontFamily: "sans-serif",
      });
      txt.anchor.set(0.5, 1);
      g.parent?.addChild(txt);
      enclosureLabels.set(tag, txt);
    }
    txt.x = labelX;
    txt.y = labelY;
    txt.alpha = Math.max(0.4, 0.7 - overlaps * 0.05);
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
