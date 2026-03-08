import * as PIXI from "pixi.js";
import type { GraphEdge } from "../types";
import { cssColorToHex } from "../utils/graph-helpers";

// ---------------------------------------------------------------------------
// Edge drawing configuration
// ---------------------------------------------------------------------------
export interface EdgeDrawConfig {
  linkThickness: number;
  showInheritance: boolean;
  showAggregation: boolean;
  showTagNodes: boolean;
  showSimilar: boolean;
  colorEdgesByRelation: boolean;
  isArcLayout: boolean;
  highlightedNodeId: string | null;
  bgColor: number;
  relationColors: Map<string, string>;
}

// Minimal position data needed for source/target
interface Pos {
  x: number;
  y: number;
  id?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_COLOR = 0x555555;
const HIGHLIGHT_COLOR = 0x888888;
const INHERITANCE_COLOR = 0x9ca3af;
const AGGREGATION_COLOR = 0x60a5fa;
const SIMILAR_COLOR = 0xfbbf24;
const HAS_TAG_COLOR = 0xa78bfa;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw all edges into a single PIXI.Graphics batch.
 *
 * @param g          - The PIXI.Graphics to draw into (will be cleared first)
 * @param edges      - The graph edges to draw
 * @param resolvePos - Resolves a source/target reference to a position
 * @param cfg        - Drawing configuration
 */
export function drawEdges(
  g: PIXI.Graphics,
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): void {
  g.clear();

  const { highlightedNodeId: hId, linkThickness: thickness, colorEdgesByRelation: useRelColor } = cfg;
  // Disable arc curves when edge count is high to avoid vertex buffer explosion.
  // quadraticCurveTo generates ~20 vertices per edge vs 4 for lineTo.
  const isArcLayout = cfg.isArcLayout && edges.length < 500;

  for (const e of edges) {
    if (e.type === "inheritance" && !cfg.showInheritance) continue;
    if (e.type === "aggregation" && !cfg.showAggregation) continue;
    if (e.type === "has-tag" && !cfg.showTagNodes) continue;
    if (e.type === "similar" && !cfg.showSimilar) continue;

    const src = resolvePos(e.source);
    const tgt = resolvePos(e.target);
    if (!src || !tgt) continue;

    // Determine color
    let lineColor = DEFAULT_COLOR;
    if (e.type === "inheritance") {
      lineColor = INHERITANCE_COLOR;
    } else if (e.type === "aggregation") {
      lineColor = AGGREGATION_COLOR;
    } else if (e.type === "similar") {
      lineColor = SIMILAR_COLOR;
    } else if (e.type === "has-tag") {
      lineColor = HAS_TAG_COLOR;
    } else if (useRelColor && e.relation) {
      const css = cfg.relationColors.get(e.relation);
      if (css) lineColor = cssColorToHex(css);
    }

    // Determine alpha & thickness
    const isSimilar = e.type === "similar";
    const isOnto = e.type === "inheritance" || e.type === "aggregation";
    const isStructural = isOnto || e.type === "has-tag" || isSimilar;
    let alpha = isStructural ? 0.5 : 0.4;
    let lineThick = thickness;

    if (!isOnto && e.relation && useRelColor) alpha = 0.7;

    if (hId) {
      const sid = src.id ?? (e.source as string);
      const tid = tgt.id ?? (e.target as string);
      if (sid === hId || tid === hId) {
        lineThick = 2;
        alpha = 1;
        if (!isOnto && !e.relation) lineColor = HIGHLIGHT_COLOR;
      } else {
        alpha = 0.04;
      }
    }

    g.lineStyle(lineThick, lineColor, alpha);

    // Draw the line
    if (isSimilar) {
      drawDottedLine(g, src.x, src.y, tgt.x, tgt.y, lineThick, lineColor, alpha, 6, 4);
    } else if (isArcLayout) {
      const mx = (src.x + tgt.x) / 2;
      const minY = Math.min(src.y, tgt.y);
      const dist = Math.abs(tgt.x - src.x);
      const cpY = minY - dist * 0.3 - 20;
      g.moveTo(src.x, src.y);
      g.quadraticCurveTo(mx, cpY, tgt.x, tgt.y);
    } else {
      g.moveTo(src.x, src.y);
      g.lineTo(tgt.x, tgt.y);
    }

    // Draw markers for ontology edges
    if (isOnto) {
      drawEdgeMarker(g, src, tgt, e.type as "inheritance" | "aggregation", lineColor, alpha, cfg.bgColor);
    }
  }
}

// ---------------------------------------------------------------------------
// Marker drawing
// ---------------------------------------------------------------------------

/**
 * Draw a marker at the end of an ontology edge.
 * - inheritance: hollow triangle at target (UML generalization)
 * - aggregation: hollow diamond at source (UML aggregation)
 */
function drawEdgeMarker(
  g: PIXI.Graphics,
  src: Pos,
  tgt: Pos,
  type: "inheritance" | "aggregation",
  color: number,
  alpha: number,
  bgColor: number,
) {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const sz = 8;

  if (type === "inheritance") {
    const bx = tgt.x - ux * sz;
    const by = tgt.y - uy * sz;
    g.lineStyle(1.5, color, alpha);
    g.beginFill(bgColor, alpha * 0.9);
    g.moveTo(tgt.x, tgt.y);
    g.lineTo(bx + px * sz * 0.5, by + py * sz * 0.5);
    g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
    g.closePath();
    g.endFill();
  } else {
    const mx = src.x + ux * sz;
    const my = src.y + uy * sz;
    const fx = src.x + ux * sz * 2;
    const fy = src.y + uy * sz * 2;
    g.lineStyle(1.5, color, alpha);
    g.beginFill(bgColor, alpha * 0.9);
    g.moveTo(src.x, src.y);
    g.lineTo(mx + px * sz * 0.4, my + py * sz * 0.4);
    g.lineTo(fx, fy);
    g.lineTo(mx - px * sz * 0.4, my - py * sz * 0.4);
    g.closePath();
    g.endFill();
  }
}

// ---------------------------------------------------------------------------
// Dotted line
// ---------------------------------------------------------------------------

function drawDottedLine(
  g: PIXI.Graphics,
  x1: number, y1: number,
  x2: number, y2: number,
  lineWidth: number, color: number, alpha: number,
  dashLen = 6, gapLen = 4,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const ux = dx / len;
  const uy = dy / len;
  let drawn = 0;
  let drawing = true;

  while (drawn < len) {
    const segLen = drawing ? dashLen : gapLen;
    const end = Math.min(drawn + segLen, len);
    if (drawing) {
      g.lineStyle(lineWidth, color, alpha);
      g.moveTo(x1 + ux * drawn, y1 + uy * drawn);
      g.lineTo(x1 + ux * end, y1 + uy * end);
    }
    drawn = end;
    drawing = !drawing;
  }
}
