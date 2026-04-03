/**
 * GuideRenderer — coordinate guides, grids, triangles, concentric rings,
 * timeline axes, axis titles, grid labels, cell shading, and tick marks.
 *
 * Extracted from GraphViewContainer to reduce God Object size.
 */
import { CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { IApp } from "./canvas2d/interfaces";
import { DEFAULT_RENDER_THRESHOLDS } from "../types";
import type { GraphNode } from "../types";
import { parseExpr, evalExpr } from "../utils/expr-eval";
import type { ResolvedGridInfo, ResolvedGridLine } from "../layouts/coordinate-engine";
import type { ArrangementGuide } from "../layouts/cluster-force";

// ---------------------------------------------------------------------------
// Host interface — minimal surface required from GVC
// ---------------------------------------------------------------------------

export interface GuideRendererHost {
  readonly worldContainer: CanvasContainer | null;
  isDarkTheme(): boolean;
  getPanel(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose render threshold config
    renderThresholds?: Record<string, any>;
    gridShowHeaders?: boolean;
    gridLabelPlacement?: string;
    showAxisTitles?: boolean;
    showTimelineTickLabels?: boolean;
  };
  /** Nodes for cell-shading density heatmap (may return undefined). */
  getCurrentNodes(): GraphNode[] | undefined;
  /** App instance for factory method access. */
  getPixiApp?(): IApp | null;
}

// ---------------------------------------------------------------------------
// Utility (module-private, copied from GVC)
// ---------------------------------------------------------------------------

/** Find the cell index for a value given sorted boundary positions */
export function findCellIndex(value: number, positions: number[]): number {
  for (let i = 0; i < positions.length - 1; i++) {
    if (value >= positions[i] && value < positions[i + 1]) return i;
  }
  if (positions.length >= 2 && value >= positions[positions.length - 2]) {
    return positions.length - 2;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// GuideRenderer
// ---------------------------------------------------------------------------

export class GuideRenderer {
  private host: GuideRendererHost;

  // Instance state (previously on GVC)
  private customGridLabelContainer: CanvasContainer | null = null;
  private customGridLabels: CanvasText[] = [];
  private timelineAxisLabels: CanvasText[] = [];
  private axisTitleLabels: CanvasText[] = [];

  constructor(host: GuideRendererHost) {
    this.host = host;
  }

  // =========================================================================
  // Public entry points (same signatures as old GVC methods)
  // =========================================================================

  drawGridLines(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "grid" }>,
    lineW: number, color: number,
  ) {
    const { verticals, horizontals, bounds } = guide;
    const yMin = cy + bounds.yMin - 10;
    const yMax = cy + bounds.yMax + 10;
    const xMin = cx + bounds.xMin - 10;
    const xMax = cx + bounds.xMax + 10;

    g.lineStyle(lineW, color, 0.2);
    for (const vx of verticals) {
      const x = cx + vx;
      g.moveTo(x, yMin);
      g.lineTo(x, yMax);
    }
    for (const hy of horizontals) {
      const y = cy + hy;
      g.moveTo(xMin, y);
      g.lineTo(xMax, y);
    }
  }

  drawTriangleOutline(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "triangle" }>,
    lineW: number, color: number,
  ) {
    const verts = guide.vertices;
    g.lineStyle(lineW, color, 0.3);
    g.moveTo(cx + verts[0].x, cy + verts[0].y);
    g.lineTo(cx + verts[1].x, cy + verts[1].y);
    g.lineTo(cx + verts[2].x, cy + verts[2].y);
    g.lineTo(cx + verts[0].x, cy + verts[0].y);
  }

  drawCoordinateGuide(
    g: CanvasGraphics, cx: number, cy: number,
    guide: { type: "coordinate"; system: string; axis1Label?: string; axis2Label?: string; bounds?: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number }; gridInfo?: ResolvedGridInfo },
    lineW: number, color: number,
  ) {
    const bounds = guide.bounds;
    if (!bounds) return;

    const worldScale = this.host.worldContainer?.scale.x ?? 1;
    const isDark = this.host.isDarkTheme();

    // Draw grid lines and tick labels when gridInfo is available.
    if (guide.gridInfo) {
      this.drawCustomGrid(g, cx, cy, guide.gridInfo, bounds, lineW, color, guide.axis1Label, guide.axis2Label);
      this.drawAxisTitles(cx, cy, guide.gridInfo.axis1Shape, guide.gridInfo.axis2Shape, bounds, worldScale, isDark, guide.axis1Label, guide.axis2Label);
      return;
    }

    // Determine shapes for axis title placement
    const defaultAxis1Shape = guide.system === "polar" ? { kind: "radial" } : { kind: "linear" };
    const defaultAxis2Shape = guide.system === "polar" ? { kind: "circle" } : { kind: "linear" };

    if (guide.system === "polar" && bounds.maxR) {
      // Polar: concentric reference circles + radial lines
      const maxR = bounds.maxR;
      const ringCount = 3;
      g.lineStyle(lineW * 0.8, color, 0.15);
      for (let i = 1; i <= ringCount; i++) {
        const r = (maxR / ringCount) * i;
        g.drawCircle(cx, cy, r);
      }
      // 6 radial lines (every 60 degrees)
      g.lineStyle(lineW * 0.5, color, 0.1);
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2;
        g.moveTo(cx, cy);
        g.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      }
    } else {
      // Cartesian: grid lines
      const { xMin, yMin, xMax, yMax } = bounds;
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      if (xRange < 1 || yRange < 1) return;

      const divisions = 4;
      g.lineStyle(lineW * 0.8, color, 0.15);
      for (let i = 0; i <= divisions; i++) {
        const x = cx + xMin + (xRange / divisions) * i;
        g.moveTo(x, cy + yMin);
        g.lineTo(x, cy + yMax);
      }
      for (let i = 0; i <= divisions; i++) {
        const y = cy + yMin + (yRange / divisions) * i;
        g.moveTo(cx + xMin, y);
        g.lineTo(cx + xMax, y);
      }
      // Origin cross (stronger)
      g.lineStyle(lineW, color, 0.25);
      g.moveTo(cx + xMin, cy);
      g.lineTo(cx + xMax, cy);
      g.moveTo(cx, cy + yMin);
      g.lineTo(cx, cy + yMax);
    }

    // Draw axis titles for fallback grid too
    this.drawAxisTitles(cx, cy, defaultAxis1Shape, defaultAxis2Shape, bounds, worldScale, isDark, guide.axis1Label, guide.axis2Label);
  }

  drawConcentricGuide(
    g: CanvasGraphics, cx: number, cy: number,
    guide: { type: "concentric"; rings: number[] },
    lineW: number, color: number,
  ) {
    if (guide.rings.length === 0) return;

    // Draw concentric ring circles
    g.lineStyle(lineW * 0.8, color, 0.3);
    for (const r of guide.rings) {
      g.drawCircle(cx, cy, r);
    }

    // Light cross at center spanning to max ring
    const maxR = guide.rings[guide.rings.length - 1];
    g.lineStyle(lineW * 0.5, color, 0.15);
    g.moveTo(cx - maxR, cy);
    g.lineTo(cx + maxR, cy);
    g.moveTo(cx, cy - maxR);
    g.lineTo(cx, cy + maxR);
  }

  drawTimelineAxis(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "timeline" }>,
    lineW: number, color: number, worldScale: number,
  ) {
    // Clear previous frame's labels to prevent accumulation leak
    this.clearTimelineAxisLabels();
    const y = cy + guide.axisY;
    if (guide.ticks.length === 0) return;
    const xs = guide.ticks.map(t => cx + t.x);
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.host.getPanel().renderThresholds ?? {}) };
    const margin = rt.gridLineMargin;
    const xMin = Math.min(...xs) - margin;
    const xMax = Math.max(...xs) + margin;
    const wFactor = rt.gridLineWidthFactor;
    const alpha = rt.gridLineAlpha;

    // Main axis line
    g.lineStyle(lineW * 1.5 * wFactor, color, alpha);
    g.moveTo(xMin, y);
    g.lineTo(xMax, y);

    // Tick marks
    const tickH = 6 / worldScale;
    g.lineStyle(lineW * wFactor, color, alpha);
    for (const tick of guide.ticks) {
      const tx = cx + tick.x;
      g.moveTo(tx, y - tickH);
      g.lineTo(tx, y + tickH);
    }

    // Axis tick labels (reuse `rt` from above)
    if (rt.timelineAxisShowLabels && this.host.getPanel().showTimelineTickLabels !== false && guide.ticks.length > 0) {
      const maxLabels = rt.timelineAxisLabelMaxCount!;
      let labelTicks = guide.ticks;
      if (labelTicks.length > maxLabels) {
        const step = Math.ceil(labelTicks.length / maxLabels);
        labelTicks = labelTicks.filter((_: unknown, i: number) => i % step === 0);
      }
      const fontSize = rt.timelineAxisLabelFontSize! / worldScale;
      const labelOffset = rt.timelineAxisLabelOffset! / worldScale;
      const labelAlpha = rt.timelineAxisLabelAlpha!;
      const labelColor = color;
      for (const tick of labelTicks) {
        const tx = cx + tick.x;
        const text = new CanvasText(tick.label, {
          fontSize,
          fill: labelColor,
          fontWeight: "400",
        });
        text.anchor.set(0.5, 0);
        text.x = tx;
        text.y = y + tickH + labelOffset;
        text.alpha = labelAlpha;
        text.rotation = Math.PI / 4;
        g.parent?.addChild(text);
        this.timelineAxisLabels.push(text);
      }
    }
  }

  // =========================================================================
  // Clear helpers (public — called from GVC cleanup paths)
  // =========================================================================

  clearCustomGridLabels() {
    for (const lbl of this.customGridLabels) {
      lbl.parent?.removeChild(lbl);
      lbl.destroy();
    }
    this.customGridLabels = [];
  }

  clearTimelineAxisLabels() {
    for (const label of this.timelineAxisLabels) {
      label.parent?.removeChild(label);
      label.destroy();
    }
    this.timelineAxisLabels = [];
  }

  clearAxisTitles() {
    for (const lbl of this.axisTitleLabels) {
      lbl.parent?.removeChild(lbl);
      lbl.destroy();
    }
    this.axisTitleLabels = [];
  }

  /** Clear all label state and release the container reference. */
  clearAll() {
    this.clearCustomGridLabels();
    this.clearTimelineAxisLabels();
    this.clearAxisTitles();
    this.customGridLabelContainer = null;
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private drawCustomGrid(
    g: CanvasGraphics, cx: number, cy: number,
    gridInfo: ResolvedGridInfo,
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    lineW: number, color: number,
    axis1Title?: string, axis2Title?: string,
  ) {
    const { axis1Lines, axis2Lines, axis1Shape, axis2Shape, style, cellShading } = gridInfo;
    const isDark = this.host.isDarkTheme();
    const worldScale = this.host.worldContainer?.scale.x ?? 1;

    // Cell shading (table mode)
    if (cellShading && style === "table" && axis1Lines.length > 1 && axis2Lines.length > 1) {
      this.drawCellShading(g, cx, cy, axis1Lines, axis2Lines, bounds, color);
    }

    // Draw axis1 grid lines
    const thresholds = this.host.getPanel().renderThresholds ?? {};
    const lineAlpha = style === "table"
      ? (thresholds.gridTableLineAlpha ?? DEFAULT_RENDER_THRESHOLDS.gridTableLineAlpha)
      : (thresholds.gridLineAlpha ?? DEFAULT_RENDER_THRESHOLDS.gridLineAlpha);
    for (const line of axis1Lines) {
      this.drawGridLine(g, cx, cy, line, axis1Shape, bounds, 1, lineW, color, lineAlpha);
    }

    // Draw axis2 grid lines
    for (const line of axis2Lines) {
      this.drawGridLine(g, cx, cy, line, axis2Shape, bounds, 2, lineW, color, lineAlpha);
    }

    // Draw tick marks at each grid line position
    this.drawGridTicks(g, cx, cy, axis1Lines, axis2Lines, axis1Shape, axis2Shape, bounds, lineW, color, worldScale);

    // Draw labels
    const panel = this.host.getPanel();
    if (panel.gridShowHeaders) {
      this.drawGridLabels(cx, cy, axis1Lines, axis2Lines, axis1Shape, axis2Shape, bounds, worldScale, isDark);
    } else {
      this.clearCustomGridLabels();
    }
  }

  private drawGridLine(
    g: CanvasGraphics, cx: number, cy: number,
    line: ResolvedGridLine,
    shape: { kind: string; expr?: string },
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    axis: 1 | 2,
    lineW: number, color: number, alpha: number,
  ) {
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.host.getPanel().renderThresholds ?? {}) };
    g.lineStyle(lineW * rt.gridLineWidthFactor, color, alpha);
    const pos = line.position;
    const margin = rt.gridLineMargin;

    switch (shape.kind) {
      case "line":
        if (axis === 1) {
          g.moveTo(cx + pos, cy + bounds.yMin - margin);
          g.lineTo(cx + pos, cy + bounds.yMax + margin);
        } else {
          g.moveTo(cx + bounds.xMin - margin, cy + pos);
          g.lineTo(cx + bounds.xMax + margin, cy + pos);
        }
        break;

      case "circle":
        if (pos > 0) {
          g.drawCircle(cx, cy, Math.abs(pos));
        }
        break;

      case "radial":
        {
          const maxR = bounds.maxR ?? Math.max(
            Math.abs(bounds.xMax), Math.abs(bounds.xMin),
            Math.abs(bounds.yMax), Math.abs(bounds.yMin),
          );
          g.moveTo(cx, cy);
          g.lineTo(cx + maxR * Math.cos(pos), cy + maxR * Math.sin(pos));
        }
        break;

      case "curve":
        if ("expr" in shape && shape.expr) {
          this.drawCurveGridLine(g, cx, cy, shape.expr, pos, bounds);
        }
        break;
    }
  }

  private drawCurveGridLine(
    g: CanvasGraphics, cx: number, cy: number,
    expr: string, offset: number,
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
  ) {
    try {
      // parseExpr/evalExpr imported at top level
      const ast = parseExpr(expr);
      const segments = 60;
      const range = bounds.xMax - bounds.xMin || 1;
      let started = false;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = bounds.xMin + t * range;
        const y = evalExpr(ast, { t, x, v: offset, i, n: segments + 1 });
        const px = cx + x;
        const py = cy + y;
        if (!started) { g.moveTo(px, py); started = true; }
        else { g.lineTo(px, py); }
      }
    } catch {
      // Invalid expression -- skip
    }
  }

  private drawCellShading(
    g: CanvasGraphics, cx: number, cy: number,
    axis1Lines: ResolvedGridLine[], axis2Lines: ResolvedGridLine[],
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
    color: number,
  ) {
    // Count nodes per cell
    const cellCounts = new Map<string, number>();
    let maxCount = 0;

    // Build cell boundaries from line positions
    const xPositions = axis1Lines.map(l => l.position).sort((a, b) => a - b);
    const yPositions = axis2Lines.map(l => l.position).sort((a, b) => a - b);
    if (xPositions.length < 2 || yPositions.length < 2) return;

    // Count nodes in each cell
    const nodes = this.host.getCurrentNodes();
    if (!nodes) return;

    const xExtentMin = xPositions[0];
    const xExtentMax = xPositions[xPositions.length - 1];
    const yExtentMin = yPositions[0];
    const yExtentMax = yPositions[yPositions.length - 1];
    for (const node of nodes) {
      const nodeX = node.x - cx;
      const nodeY = node.y - cy;

      if (nodeX < xExtentMin - 1 || nodeX > xExtentMax + 1) continue;
      if (nodeY < yExtentMin - 1 || nodeY > yExtentMax + 1) continue;

      const xi = findCellIndex(nodeX, xPositions);
      const yi = findCellIndex(nodeY, yPositions);
      if (xi >= 0 && yi >= 0) {
        const key = `${xi}-${yi}`;
        const count = (cellCounts.get(key) ?? 0) + 1;
        cellCounts.set(key, count);
        if (count > maxCount) maxCount = count;
      }
    }

    if (maxCount === 0) return;

    // Draw shaded rectangles
    const rt = this.host.getPanel().renderThresholds ?? {};
    const shadingMin = rt.gridCellShadingMin ?? DEFAULT_RENDER_THRESHOLDS.gridCellShadingMin;
    const shadingRange = rt.gridCellShadingRange ?? DEFAULT_RENDER_THRESHOLDS.gridCellShadingRange;
    for (let xi = 0; xi < xPositions.length - 1; xi++) {
      for (let yi = 0; yi < yPositions.length - 1; yi++) {
        const count = cellCounts.get(`${xi}-${yi}`) ?? 0;
        if (count === 0) continue;
        const alpha = shadingMin + (count / maxCount) * shadingRange;
        g.beginFill(color, alpha);
        const x = cx + xPositions[xi];
        const y = cy + yPositions[yi];
        const w = xPositions[xi + 1] - xPositions[xi];
        const h = yPositions[yi + 1] - yPositions[yi];
        g.drawRect(x, y, w, h);
        g.endFill();
      }
    }
  }

  private drawGridTicks(
    g: CanvasGraphics, cx: number, cy: number,
    axis1Lines: ResolvedGridLine[], axis2Lines: ResolvedGridLine[],
    axis1Shape: { kind: string }, axis2Shape: { kind: string },
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    lineW: number, color: number, worldScale: number,
  ) {
    const tickLen = 6 / worldScale;
    g.lineStyle(lineW, color, 0.4);

    for (const line of axis1Lines) {
      if (!line.label) continue;
      if (axis1Shape.kind === "line") {
        const x = cx + line.position;
        const y = cy + bounds.yMin;
        g.moveTo(x, y - tickLen);
        g.lineTo(x, y);
      }
    }

    for (const line of axis2Lines) {
      if (!line.label) continue;
      if (axis2Shape.kind === "line") {
        const x = cx + bounds.xMin;
        const y = cy + line.position;
        g.moveTo(x - tickLen, y);
        g.lineTo(x, y);
      }
    }
  }

  private drawGridLabels(
    cx: number, cy: number,
    axis1Lines: ResolvedGridLine[], axis2Lines: ResolvedGridLine[],
    axis1Shape: { kind: string }, axis2Shape: { kind: string },
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    worldScale: number, isDark: boolean,
  ) {
    this.clearCustomGridLabels();

    if (!this.customGridLabelContainer && this.host.worldContainer) {
      // Grid label container holds CanvasText — must be CanvasContainer
      this.customGridLabelContainer = new CanvasContainer();
      this.host.worldContainer.addChild(this.customGridLabelContainer);
    }
    const container = this.customGridLabelContainer;
    if (!container) return;

    const panel = this.host.getPanel();
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(panel.renderThresholds ?? {}) };
    const fontSize = Math.max(rt.gridLabelFontSizeMin, Math.min(rt.gridLabelFontSizeMax, rt.gridLabelFontSizeBase / worldScale));
    const textColor = isDark ? 0xbbbbbb : 0x555555;
    const bgColor = isDark ? 0x1e1e1e : 0xf5f5f5;
    const labelOffset = rt.gridLabelOffset / worldScale;

    const placement = panel.gridLabelPlacement ?? "on-line";
    const useBetween = placement === "between";

    const addLabel = (label: string, x: number, y: number, anchorX: number, anchorY: number) => {
      const text = new CanvasText(label, {
        fontSize,
        fill: textColor,
        fontWeight: "600",
      });
      text.bgColor = bgColor;
      text.bgAlpha = 0.75;
      text.bgPadX = 8;
      text.bgPadY = 3;
      text.strokeColor = 0x000000;
      text.strokeWidth = 2;
      text.anchor.set(anchorX, anchorY);
      text.x = x;
      text.y = y;
      container.addChild(text);
      this.customGridLabels.push(text);
    };

    // Axis1 labels -- placed above the grid
    if (useBetween && axis1Lines.length >= 2) {
      for (let i = 0; i + 1 < axis1Lines.length; i++) {
        const label = axis1Lines[i].label;
        if (!label) continue;
        const midPos = (axis1Lines[i].position + axis1Lines[i + 1].position) / 2;

        if (axis1Shape.kind === "radial") {
          const maxR = bounds.maxR ?? Math.max(Math.abs(bounds.xMax), Math.abs(bounds.yMax));
          const angle = midPos;
          addLabel(label, cx + (maxR + labelOffset * 2) * Math.cos(angle),
            cy + (maxR + labelOffset * 2) * Math.sin(angle), 0.5, 0.5);
        } else {
          addLabel(label, cx + midPos, cy + bounds.yMin - labelOffset, 0.5, 1);
        }
      }
    } else {
      for (const line of axis1Lines) {
        if (!line.label) continue;
        if (axis1Shape.kind === "radial") {
          const maxR = bounds.maxR ?? Math.max(Math.abs(bounds.xMax), Math.abs(bounds.yMax));
          const angle = line.position;
          addLabel(line.label, cx + (maxR + labelOffset * 2) * Math.cos(angle),
            cy + (maxR + labelOffset * 2) * Math.sin(angle), 0.5, 0.5);
        } else {
          addLabel(line.label, cx + line.position, cy + bounds.yMin - labelOffset, 0.5, 1);
        }
      }
    }

    // Axis2 labels -- placed to the left of the grid
    if (useBetween && axis2Lines.length >= 2) {
      for (let i = 0; i + 1 < axis2Lines.length; i++) {
        const label = axis2Lines[i].label;
        if (!label) continue;
        const midPos = (axis2Lines[i].position + axis2Lines[i + 1].position) / 2;

        if (axis2Shape.kind === "circle") {
          addLabel(label, cx + Math.abs(midPos) + labelOffset * 0.5,
            cy - labelOffset * 0.5, 0, 0.5);
        } else {
          addLabel(label, cx + bounds.xMin - labelOffset, cy + midPos, 1, 0.5);
        }
      }
    } else {
      for (const line of axis2Lines) {
        if (!line.label) continue;
        if (axis2Shape.kind === "circle") {
          addLabel(line.label, cx + Math.abs(line.position) + labelOffset * 0.5,
            cy - labelOffset * 0.5, 0, 0.5);
        } else {
          addLabel(line.label, cx + bounds.xMin - labelOffset, cy + line.position, 1, 0.5);
        }
      }
    }
  }

  drawAxisTitles(
    cx: number, cy: number,
    axis1Shape: { kind: string }, axis2Shape: { kind: string },
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    worldScale: number, isDark: boolean,
    axis1Title?: string, axis2Title?: string,
  ) {
    this.clearAxisTitles();

    const panel = this.host.getPanel();
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(panel.renderThresholds ?? {}) };
    if (!rt.axisTitleShow || panel.showAxisTitles === false) return;
    if (!axis1Title && !axis2Title) return;

    const container = this.customGridLabelContainer ?? this.host.worldContainer;
    if (!container) return;

    const fontSize = Math.max(8, Math.min(16, rt.axisTitleFontSize / worldScale));
    const offset = rt.axisTitleOffset / worldScale;
    const gridLabelH = Math.max(8, Math.min(13, (rt.gridLabelFontSizeBase ?? 11) / worldScale)) * 1.5;
    const textColor = isDark ? 0xcccccc : 0x444444;
    const alpha = rt.axisTitleAlpha;

    // Axis1 title
    if (axis1Title) {
      const text = new CanvasText(axis1Title, {
        fontSize,
        fill: textColor,
        fontWeight: "700",
      });
      text.alpha = alpha;

      if (axis1Shape.kind === "radial") {
        const maxR = bounds.maxR ?? Math.max(Math.abs(bounds.xMax), Math.abs(bounds.yMax));
        text.anchor.set(0.5, 1);
        text.x = cx;
        text.y = cy - maxR - offset - gridLabelH;
      } else {
        const midX = (bounds.xMin + bounds.xMax) / 2;
        text.anchor.set(0.5, 1);
        text.x = cx + midX;
        text.y = cy + bounds.yMin - offset - gridLabelH;
      }
      container.addChild(text);
      this.axisTitleLabels.push(text);
    }

    // Axis2 title
    if (axis2Title) {
      const text = new CanvasText(axis2Title, {
        fontSize,
        fill: textColor,
        fontWeight: "700",
      });
      text.alpha = alpha;

      if (axis2Shape.kind === "circle") {
        text.anchor.set(0, 0.5);
        text.x = cx + (bounds.maxR ?? Math.abs(bounds.xMax)) + offset + gridLabelH;
        text.y = cy;
      } else {
        const midY = (bounds.yMin + bounds.yMax) / 2;
        text.anchor.set(0.5, 1);
        text.x = cx + bounds.xMin - offset - gridLabelH;
        text.y = cy + midY;
        text.rotation = -Math.PI / 2;
      }
      container.addChild(text);
      this.axisTitleLabels.push(text);
    }
  }
}
