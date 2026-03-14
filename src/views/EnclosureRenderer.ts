import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { Pt } from "../utils/geometry";
import { convexHull } from "../utils/geometry";
import { cssColorToHex, shiftHue, hslToHex, stringHash } from "../utils/graph-helpers";
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
  /** Called when a tag label is hovered (tag) or unhovered (null). */
  onTagHover?: (tag: string | null) => void;
  /** Currently hovered tag (used to boost label alpha). */
  hoveredTag?: string | null;
  /** Dedicated container for labels (ensures z-order above nodes). */
  labelContainer?: CanvasContainer;
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
function outlinePad(radius: number, memberCount?: number): number {
  const base = Math.max(OUTLINE_PAD_MIN, radius * OUTLINE_PAD_FACTOR);
  // DQ-10: Shrink padding for very small groups (1-3 members)
  return memberCount != null && memberCount <= 3 ? base * 0.6 : base;
}

/**
 * Zoom threshold: below this worldScale the view is considered "zoomed out".
 * In zoomed-out mode enclosures switch to filled regions with prominent labels.
 */
const ZOOM_OUT_THRESHOLD = 0.45;

// Module-level reusable buffers — reduce per-frame allocations
const _hullInputBuf: Pt[] = [];
const _enclosuresBuf: EncData[] = [];

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
  g: CanvasGraphics,
  enclosureLabels: Map<string, CanvasText>,
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
  // Reuse enclosures array across frames
  _enclosuresBuf.length = 0;
  const enclosures = _enclosuresBuf;

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

    // Deterministic enclosure color from tag name hash (DQ-06)
    // Using tag name hash ensures color stays consistent regardless of filter order.
    const hue = stringHash(tag, 360);
    const hex = hslToHex(hue, 0.55, 0.55);

    // Generate boundary sample points around each node's circle
    // so the convex hull fully contains every node regardless of radius.
    // Reuse module-level buffer to reduce per-tag array allocation
    _hullInputBuf.length = 0;
    const mc = pts.length; // member count for padding calculation
    for (const p of pts) {
      const r = p.radius + outlinePad(p.radius, mc);
      for (let k = 0; k < HULL_SAMPLES; k++) {
        const angle = (k / HULL_SAMPLES) * Math.PI * 2;
        _hullInputBuf.push({ x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r });
      }
    }

    let expanded: Pt[];
    if (pts.length === 1) {
      const p = pts[0];
      const r = p.radius + outlinePad(p.radius, mc);
      expanded = [
        { x: p.x - r, y: p.y - r },
        { x: p.x + r, y: p.y - r },
        { x: p.x + r, y: p.y + r },
        { x: p.x - r, y: p.y + r },
      ];
    } else {
      expanded = convexHull(_hullInputBuf);
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
    const baseLineAlpha = overlaps === 0 ? 0.6 : Math.max(0.35, 0.55 / (1 + overlaps * 0.1));
    const lineWidth = overlaps === 0 ? 1.5 : Math.max(2, 2.5 - overlaps * 0.3);

    // --- Fill style (zoomed-out: light tint; large groups get lighter to avoid obscuring nodes) ---
    const memberCount = pts.length;
    const sizeFade = Math.max(0.3, 1 - memberCount / 200); // large groups → lower alpha
    const baseFill = overlaps > 0 ? 0.04 : 0.10;
    const fillAlpha = blend > 0 ? blend * baseFill * sizeFade : 0;

    let labelX = 0, labelY = 0;
    let labelCenterX = 0, labelCenterY = 0;

    // Draw filled shape first (behind stroke) when zoomed out
    // Use radial gradient for a soft glow effect
    if (fillAlpha > 0.005) {
      g.lineStyle(0);
      if (pts.length === 1) {
        const p0 = pts[0];
        const r = p0.radius + outlinePad(p0.radius, memberCount);
        g.beginRadialFill(p0.x, p0.y, r, hex, hex, fillAlpha, fillAlpha * 0.15);
        g.drawCircle(p0.x, p0.y, r);
      } else if (pts.length === 2) {
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const maxR = Math.max(pts[0].radius, pts[1].radius);
        const r = maxR + outlinePad(maxR, memberCount);
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) / 2 + r;
        g.beginRadialFill(cx, cy, dist, hex, hex, fillAlpha, fillAlpha * 0.15);
        drawCapsule(g, pts[0], pts[1], r);
      } else {
        const cx = (enc.minX + enc.maxX) / 2;
        const cy = (enc.minY + enc.maxY) / 2;
        const radius = Math.hypot(enc.maxX - enc.minX, enc.maxY - enc.minY) / 2;
        g.beginRadialFill(cx, cy, radius, hex, hex, fillAlpha, fillAlpha * 0.1);
        drawSmoothHull(g, expanded);
      }
      g.endFill();
    }

    // Draw stroke
    g.lineStyle(lineWidth, hex, baseLineAlpha);
    if (pts.length === 1) {
      const p = pts[0];
      const r = p.radius + outlinePad(p.radius, memberCount);
      g.drawCircle(p.x, p.y, r);
      labelX = p.x; labelY = p.y - r - 8;
      labelCenterX = p.x; labelCenterY = p.y;
    } else if (pts.length === 2) {
      const maxR = Math.max(pts[0].radius, pts[1].radius);
      const r = maxR + outlinePad(maxR, memberCount);
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
      txt = new CanvasText(`#${tag}`, {
        fontSize: 16,
        fill: hexStr,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        fontWeight: "bold",
      });
      txt.anchor.set(0.5, 0.5);
      txt.resolution = 2;
      txt.strokeColor = 0x000000;
      txt.strokeWidth = 3;
      enclosureLabels.set(tag, txt);
    }
    // Pill background: darken the enclosure hue for the background
    txt.bgColor = darkenHex(hex, 0.25);
    txt.bgAlpha = 0.7;
    txt.bgPadX = 10;
    txt.bgPadY = 4;

    // Ensure label is in the correct parent (idempotent).
    // Interactive events (eventMode/on) are not supported by CanvasText;
    // hover callbacks are handled at the container level instead.
    const targetParent = cfg.labelContainer ?? (g.parent as CanvasContainer | null);
    if (txt.parent !== targetParent && targetParent) {
      targetParent.addChild(txt);
    }

    // Always place label above the hull top edge (never inside the node cluster).
    // Label scale adapts to zoom: larger when zoomed out, smaller when zoomed in.
    const labelScale = zoomedOut
      ? Math.min(8, Math.max(1.5, 1.8 / ws))
      : Math.min(4, Math.max(1, 1 / ws));
    // Label height in world coords (fontSize 14 × scale)
    const labelWorldH = 14 * labelScale;
    const gap = labelWorldH * 0.3;

    txt.anchor.set(0.5, 1); // bottom-center anchor: label hangs above the point
    txt.x = labelCenterX;
    txt.y = enc.minY - gap;
    txt.scale.set(labelScale);
    const isHovered = cfg.hoveredTag === tag;
    const baseAlpha = zoomedOut
      ? Math.max(0.7, 0.95 - overlaps * 0.04)
      : Math.max(0.6, 0.85 - overlaps * 0.04);
    txt.alpha = isHovered ? Math.min(1, baseAlpha + 0.25) : baseAlpha;
    // Brighten pill background on hover
    txt.bgAlpha = isHovered ? 0.85 : 0.7;
    txt.visible = true;
  }

  // --- Label collision avoidance ---
  // Collect visible label bounding rects, then nudge overlapping labels apart.
  // If nudging can't resolve the overlap, hide the smaller group's label.
  const visibleLabels: { tag: string; txt: CanvasText; memberCount: number }[] = [];
  for (const tag of usedLabels) {
    const txt = enclosureLabels.get(tag);
    if (txt && txt.visible) {
      const members = cfg.tagMembership.get(tag);
      visibleLabels.push({ tag, txt, memberCount: members?.size ?? 0 });
    }
  }
  // Sort by member count descending — larger groups get priority placement
  visibleLabels.sort((a, b) => b.memberCount - a.memberCount);

  // Get approximate bounding box for a label (in world coords).
  // CanvasText.width/height include scale.
  const labelRect = (txt: CanvasText) => {
    const w = txt.width;
    const h = txt.height;
    const ax = txt.anchor.x;
    const ay = txt.anchor.y;
    return {
      x: txt.x - w * ax,
      y: txt.y - h * ay,
      w,
      h,
    };
  };

  const rectsOverlap = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // Greedy nudge: for each label (priority-sorted), push away from collisions.
  const placedRects: { x: number; y: number; w: number; h: number }[] = [];
  for (const { txt } of visibleLabels) {
    let rect = labelRect(txt);
    let resolved = false;

    for (let attempt = 0; attempt < 6; attempt++) {
      // Find first overlapping rect
      const blocker = placedRects.find(pr => rectsOverlap(rect, pr));
      if (!blocker) { resolved = true; break; }

      // Nudge away from the blocker — choose the shortest escape direction
      const overlapX = Math.min(rect.x + rect.w - blocker.x, blocker.x + blocker.w - rect.x);
      const overlapY = Math.min(rect.y + rect.h - blocker.y, blocker.y + blocker.h - rect.y);

      if (overlapY <= overlapX) {
        // Escape vertically (down from blocker center)
        const dy = (rect.y + rect.h / 2) > (blocker.y + blocker.h / 2) ? 1 : -1;
        txt.y += dy * (overlapY + rect.h * 0.15);
      } else {
        // Escape horizontally (away from blocker center)
        const dx = (rect.x + rect.w / 2) > (blocker.x + blocker.w / 2) ? 1 : -1;
        txt.x += dx * (overlapX + rect.w * 0.15);
      }
      rect = labelRect(txt);
    }

    if (!resolved) {
      txt.visible = false;
    } else {
      placedRects.push(rect);
    }
  }

  // Hide unused labels
  for (const [tag, lbl] of enclosureLabels) {
    if (!usedLabels.has(tag)) lbl.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

export function drawSmoothHull(g: CanvasGraphics, points: Pt[]) {
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

export function drawCapsule(g: CanvasGraphics, p0: Pt, p1: Pt, radius: number) {
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
 * Darken a hex colour value by a given factor (0–1).
 * factor=0 → unchanged, factor=1 → black.
 */
function darkenHex(hex: number, factor: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * (1 - factor));
  const g = Math.round(((hex >> 8) & 0xff) * (1 - factor));
  const b = Math.round((hex & 0xff) * (1 - factor));
  return (r << 16) | (g << 8) | b;
}

// Reusable buffers for filterOutliers — eliminates per-call array allocations
const _distBuf: number[] = [];
const _sortBuf: number[] = [];

/**
 * Filter outlier points using IQR on distance from centroid.
 * Keeps only points within Q3 + 1.5×IQR of the centroid, preventing
 * spatially scattered tag members from inflating the convex hull.
 *
 * Uses module-level buffers for distance/sort arrays to reduce GC pressure
 * (~40 tags × 2 arrays = 80 array allocations saved per 3 frames).
 */
function filterOutliers<T extends Pt>(pts: T[]): T[] {
  if (pts.length <= 3) return pts;

  const n = pts.length;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
  cx /= n; cy /= n;

  _distBuf.length = n;
  _sortBuf.length = n;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(pts[i].x - cx, pts[i].y - cy);
    _distBuf[i] = d;
    _sortBuf[i] = d;
  }
  _sortBuf.sort((a, b) => a - b);
  const q1 = _sortBuf[Math.floor(n * 0.25)];
  const q3 = _sortBuf[Math.floor(n * 0.75)];
  const cutoff = q3 + 1.5 * (q3 - q1);

  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    if (_distBuf[i] <= cutoff) result.push(pts[i]);
  }
  return result.length >= 1 ? result : pts;
}
