// ---------------------------------------------------------------------------
// Node shape drawing utilities
// ---------------------------------------------------------------------------
import type { GraphNode } from "../types";

export type NodeShape = "circle" | "triangle" | "diamond" | "hexagon" | "square";

export const ALL_SHAPES: NodeShape[] = ["circle", "triangle", "diamond", "hexagon", "square"];

export interface ShapeRule {
  match: "isTag" | "category" | "default";
  category?: string;  // only used when match === "category"
  shape: NodeShape;
}

// Pre-computed constants for triangle and hexagon vertices
const SQRT3_HALF = Math.sqrt(3) / 2; // ~0.866
const HEX_ANGLES: number[] = [];
for (let i = 0; i < 6; i++) {
  HEX_ANGLES.push((Math.PI / 3) * i - Math.PI / 2); // start from top
}

/**
 * Draw a shape centered at (0, 0) on a PIXI.Graphics object.
 * Calls beginFill/endFill internally.
 */
export function drawShape(
  g: any, // PIXI.Graphics
  shape: NodeShape,
  radius: number,
  fillColor: number,
  fillAlpha: number,
): void {
  g.beginFill(fillColor, fillAlpha);
  drawShapePath(g, shape, 0, 0, radius);
  g.endFill();
}

/**
 * Draw a shape outline (path only, no fill/endFill) at (cx, cy).
 * Used within batch drawing where beginFill is called externally.
 */
export function drawShapeAt(
  g: any, // PIXI.Graphics
  shape: NodeShape,
  cx: number,
  cy: number,
  radius: number,
): void {
  drawShapePath(g, shape, cx, cy, radius);
}

/**
 * Internal: draw the shape path at given center coordinates.
 */
function drawShapePath(
  g: any,
  shape: NodeShape,
  cx: number,
  cy: number,
  r: number,
): void {
  switch (shape) {
    case "circle":
      g.drawCircle(cx, cy, r);
      break;

    case "triangle":
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * SQRT3_HALF, cy + r * 0.5);
      g.lineTo(cx - r * SQRT3_HALF, cy + r * 0.5);
      g.closePath();
      break;

    case "diamond":
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r, cy);
      g.closePath();
      break;

    case "hexagon": {
      for (let i = 0; i < 6; i++) {
        const px = cx + r * Math.cos(HEX_ANGLES[i]);
        const py = cy + r * Math.sin(HEX_ANGLES[i]);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    }

    case "square": {
      const half = r * 0.7;
      g.drawRect(cx - half, cy - half, half * 2, half * 2);
      break;
    }
  }
}

/**
 * Determine the shape for a given node based on an ordered list of shape rules.
 * Rules are evaluated top-to-bottom; the first match wins.
 * If no rule matches, returns "circle".
 */
export function getNodeShape(
  node: GraphNode,
  shapeRules: ShapeRule[],
): NodeShape {
  for (const rule of shapeRules) {
    switch (rule.match) {
      case "isTag":
        if (node.isTag) return rule.shape;
        break;
      case "category":
        if (rule.category && node.category === rule.category) return rule.shape;
        break;
      case "default":
        return rule.shape;
    }
  }
  return "circle";
}
