/**
 * E2E display-quality assertion helpers.
 *
 * Each function runs a single page.evaluate() to collect metrics
 * from the live Graph Island view (pixiNodes, labels, colors).
 *
 * Usage:
 *   import { measureNodeOverlap, measureSpread } from "./helpers/quality-checks";
 *   const overlap = await measureNodeOverlap(page);
 *   expect(overlap.overlapRatio).toBeLessThan(0.05);
 */
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Result interfaces
// ---------------------------------------------------------------------------

export interface OverlapReport {
  totalNodes: number;
  overlapCount: number;
  overlapRatio: number;
  worstOverlapPx: number;
  samplePairs: Array<{ idA: string; idB: string; overlapPx: number }>;
}

export interface SpreadReport {
  bboxWidth: number;
  bboxHeight: number;
  bboxArea: number;
  convexHullArea: number;
  spreadRatio: number;
  nanCount: number;
  infCount: number;
}

export interface LabelReport {
  totalNodes: number;
  visibleLabels: number;
  labelOverlaps: number;
  avgFontScale: number;
}

export interface ContrastReport {
  checkedCount: number;
  failCount: number;
  minRatio: number;
  avgRatio: number;
}

export interface CardTextReport {
  checkedCount: number;
  withText: number;
  withBody: number;
  textRatio: number;
}

// ---------------------------------------------------------------------------
// 1. Node overlap
// ---------------------------------------------------------------------------

export async function measureNodeOverlap(page: Page): Promise<OverlapReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes) {
      return { totalNodes: 0, overlapCount: 0, overlapRatio: 0, worstOverlapPx: 0, samplePairs: [] };
    }

    const nodes: Array<{ id: string; x: number; y: number; r: number }> = [];
    for (const [id, n] of v.pixiNodes.entries()) {
      const x = n.data?.x ?? 0;
      const y = n.data?.y ?? 0;
      const r = n.radius ?? 5;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        nodes.push({ id: String(id), x, y, r });
      }
    }

    const totalNodes = nodes.length;
    const totalPairs = totalNodes > 1 ? (totalNodes * (totalNodes - 1)) / 2 : 1;
    let overlapCount = 0;
    let worstOverlapPx = 0;
    const samplePairs: Array<{ idA: string; idB: string; overlapPx: number }> = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const threshold = (a.r + b.r) * 0.9;
        if (dist < threshold) {
          const overlapPx = Math.round(threshold - dist);
          overlapCount++;
          if (overlapPx > worstOverlapPx) worstOverlapPx = overlapPx;
          if (samplePairs.length < 5) {
            samplePairs.push({ idA: a.id, idB: b.id, overlapPx });
          }
        }
      }
    }

    return {
      totalNodes,
      overlapCount,
      overlapRatio: Math.round((overlapCount / totalPairs) * 10000) / 10000,
      worstOverlapPx,
      samplePairs,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Spread
// ---------------------------------------------------------------------------

export async function measureSpread(page: Page): Promise<SpreadReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes) {
      return { bboxWidth: 0, bboxHeight: 0, bboxArea: 0, convexHullArea: 0, spreadRatio: 0, nanCount: 0, infCount: 0 };
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let nanCount = 0, infCount = 0;
    const xs: number[] = [];
    const ys: number[] = [];

    for (const [, n] of v.pixiNodes.entries()) {
      const x = n.data?.x ?? NaN;
      const y = n.data?.y ?? NaN;
      if (Number.isNaN(x) || Number.isNaN(y)) { nanCount++; continue; }
      if (!Number.isFinite(x) || !Number.isFinite(y)) { infCount++; continue; }
      xs.push(x);
      ys.push(y);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const bboxWidth = xs.length > 0 ? Math.round(maxX - minX) : 0;
    const bboxHeight = xs.length > 0 ? Math.round(maxY - minY) : 0;
    const bboxArea = bboxWidth * bboxHeight;

    let convexHullArea = 0;
    let spreadRatio = 0;
    if (xs.length > 1) {
      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
      const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
      const sdX = Math.sqrt(xs.reduce((s, x) => s + (x - meanX) ** 2, 0) / xs.length);
      const sdY = Math.sqrt(ys.reduce((s, y) => s + (y - meanY) ** 2, 0) / ys.length);
      convexHullArea = Math.round(Math.PI * sdX * sdY);
      spreadRatio = bboxArea > 0 ? Math.round((convexHullArea / bboxArea) * 10000) / 10000 : 0;
    }

    return { bboxWidth, bboxHeight, bboxArea, convexHullArea, spreadRatio, nanCount, infCount };
  });
}

// ---------------------------------------------------------------------------
// 3. Labels
// ---------------------------------------------------------------------------

export async function measureLabels(page: Page): Promise<LabelReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes) {
      return { totalNodes: 0, visibleLabels: 0, labelOverlaps: 0, avgFontScale: 0 };
    }

    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    let totalNodes = 0;
    let visibleLabels = 0;
    let fontScaleSum = 0;

    for (const [, n] of v.pixiNodes.entries()) {
      totalNodes++;
      const lbl = n.label;
      if (!lbl || !lbl.visible || (lbl.alpha ?? 0) <= 0.1) continue;
      visibleLabels++;
      const scale = lbl.scale?.x ?? 1;
      fontScaleSum += scale;
      const bounds = lbl.getBounds?.();
      if (bounds) {
        rects.push({ x: bounds.x ?? 0, y: bounds.y ?? 0, w: bounds.width ?? 0, h: bounds.height ?? 0 });
      }
    }

    let labelOverlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          labelOverlaps++;
        }
      }
    }

    return {
      totalNodes,
      visibleLabels,
      labelOverlaps,
      avgFontScale: visibleLabels > 0 ? Math.round((fontScaleSum / visibleLabels) * 1000) / 1000 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Contrast
// ---------------------------------------------------------------------------

export async function measureContrast(page: Page, sampleSize = 100): Promise<ContrastReport> {
  return page.evaluate((maxSample) => {
    function srgbLum(c: number): number {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }
    function luminance(r: number, g: number, b: number): number {
      return 0.2126 * srgbLum(r) + 0.7152 * srgbLum(g) + 0.0722 * srgbLum(b);
    }
    function contrastRatio(l1: number, l2: number): number {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    const wrap = document.querySelector(".graph-svg-wrap") as HTMLElement | null;
    const bgEl = wrap ?? document.body;
    const bgStyle = getComputedStyle(bgEl).backgroundColor || "rgb(0,0,0)";
    const bgMatch = bgStyle.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    const bgR = bgMatch ? parseInt(bgMatch[1]) : 0;
    const bgG = bgMatch ? parseInt(bgMatch[2]) : 0;
    const bgB = bgMatch ? parseInt(bgMatch[3]) : 0;
    const bgLum = luminance(bgR, bgG, bgB);

    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes) {
      return { checkedCount: 0, failCount: 0, minRatio: 0, avgRatio: 0 };
    }

    let checkedCount = 0, failCount = 0, minRatio = Infinity, ratioSum = 0;
    for (const [, n] of v.pixiNodes.entries()) {
      if (checkedCount >= maxSample) break;
      const hex: number | undefined = n.color;
      if (hex === undefined || hex === null) continue;
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8) & 0xff;
      const b = hex & 0xff;
      const nodeLum = luminance(r, g, b);
      const ratio = contrastRatio(nodeLum, bgLum);
      checkedCount++;
      ratioSum += ratio;
      if (ratio < minRatio) minRatio = ratio;
      if (ratio < 3) failCount++;
    }

    return {
      checkedCount,
      failCount,
      minRatio: checkedCount > 0 ? Math.round(minRatio * 100) / 100 : 0,
      avgRatio: checkedCount > 0 ? Math.round((ratioSum / checkedCount) * 100) / 100 : 0,
    };
  }, sampleSize);
}

// ---------------------------------------------------------------------------
// 5. Screen-space density (what the user actually sees)
// ---------------------------------------------------------------------------

export interface ScreenDensityReport {
  totalNodes: number;
  worstCellCount: number;
  worstCellX: number;
  worstCellY: number;
  viewportUtilization: number; // 0-100%
  rightHalfRatio: number; // 0-100%
}

export async function measureScreenDensity(page: Page, cellSize = 100): Promise<ScreenDensityReport> {
  return page.evaluate((cs) => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes || !v.worldContainer) {
      return { totalNodes: 0, worstCellCount: 0, worstCellX: 0, worstCellY: 0, viewportUtilization: 0, rightHalfRatio: 50 };
    }

    const ws = v.worldContainer.scale.x;
    const wx = v.worldContainer.x;
    const wy = v.worldContainer.y;
    const canvas = v.containerEl?.querySelector("canvas");
    const canvasW = canvas?.clientWidth ?? 800;
    const canvasH = canvas?.clientHeight ?? 600;
    const midX = canvasW / 2;

    let minSX = Infinity, maxSX = -Infinity;
    let leftCount = 0, rightCount = 0;
    const grid = new Map<string, number>();

    for (const [, pn] of v.pixiNodes) {
      const sx = pn.data.x * ws + wx;
      const sy = pn.data.y * ws + wy;
      if (sx < midX) leftCount++; else rightCount++;
      if (sx < minSX) minSX = sx;
      if (sx > maxSX) maxSX = sx;
      const key = `${Math.floor(sx / cs)},${Math.floor(sy / cs)}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }

    let worstCount = 0, worstKey = "0,0";
    for (const [key, count] of grid) {
      if (count > worstCount) { worstCount = count; worstKey = key; }
    }
    const [gx, gy] = worstKey.split(",").map(Number);
    const total = leftCount + rightCount;
    const usedWidth = maxSX - minSX;

    return {
      totalNodes: total,
      worstCellCount: worstCount,
      worstCellX: gx * cs,
      worstCellY: gy * cs,
      viewportUtilization: canvasW > 0 ? Math.round((usedWidth / canvasW) * 100) : 0,
      rightHalfRatio: total > 0 ? Math.round((rightCount / total) * 100) : 50,
    };
  }, cellSize);
}

// ---------------------------------------------------------------------------
// 6. Screen-space label readability (are labels readable after render?)
// ---------------------------------------------------------------------------

export interface LabelReadabilityReport {
  totalVisible: number;
  overlappingPairs: number;
  overlapRate: number;
  tooSmallCount: number;
  avgScreenFontSize: number;
}

export async function measureLabelReadability(page: Page): Promise<LabelReadabilityReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes || !v.worldContainer) {
      return { totalVisible: 0, overlappingPairs: 0, overlapRate: 0, tooSmallCount: 0, avgScreenFontSize: 0 };
    }

    const ws = v.worldContainer.scale.x;
    const wx = v.worldContainer.x;
    const wy = v.worldContainer.y;
    const rects: { sx: number; sy: number; sw: number; sh: number }[] = [];
    let fontSizeSum = 0;
    let tooSmallCount = 0;

    for (const [, pn] of v.pixiNodes) {
      const label = pn.label;
      if (!label || !label.visible || (label.alpha ?? 0) <= 0.05) continue;
      const text = label.text ?? pn.data.label ?? "";
      if (!text) continue;

      const sx = pn.data.x * ws + wx + (label.x ?? 0) * ws;
      const sy = pn.data.y * ws + wy + (label.y ?? 0) * ws;
      const fontSize = (label.style?.fontSize ?? 12) * (label.scale?.x ?? 1) * ws;
      fontSizeSum += fontSize;
      if (fontSize < 6) tooSmallCount++; // < 6px is unreadable

      const charWidth = fontSize * 0.6;
      const lw = Math.min(text.length * charWidth, 300);
      const lh = fontSize * 1.3;
      rects.push({ sx, sy, sw: lw, sh: lh });
    }

    let overlappingPairs = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.sx < b.sx + b.sw && a.sx + a.sw > b.sx &&
            a.sy < b.sy + b.sh && a.sy + a.sh > b.sy) {
          overlappingPairs++;
        }
      }
    }

    const totalPairs = rects.length > 1 ? (rects.length * (rects.length - 1)) / 2 : 1;
    return {
      totalVisible: rects.length,
      overlappingPairs,
      overlapRate: Math.round((overlappingPairs / totalPairs) * 1000) / 1000,
      tooSmallCount,
      avgScreenFontSize: rects.length > 0 ? Math.round(fontSizeSum / rects.length * 10) / 10 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 7. Card text
// ---------------------------------------------------------------------------

export async function measureCardText(page: Page, sampleSize = 30): Promise<CardTextReport> {
  return page.evaluate((maxSample) => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes) {
      return { checkedCount: 0, withText: 0, withBody: 0, textRatio: 0 };
    }

    let checkedCount = 0, withText = 0, withBody = 0;
    for (const [, n] of v.pixiNodes.entries()) {
      if (checkedCount >= maxSample) break;
      if (!n.gfx) continue;
      checkedCount++;
      const children: any[] = n.gfx.children ?? [];
      if (children.some((c: any) => typeof c.text === "string" && c.text.length > 0)) withText++;
      if (n.data?.bodyPreview && n.data.bodyPreview.length > 0) withBody++;
    }

    return {
      checkedCount,
      withText,
      withBody,
      textRatio: checkedCount > 0 ? Math.round((withText / checkedCount) * 1000) / 1000 : 0,
    };
  }, sampleSize);
}

// ---------------------------------------------------------------------------
// 8. Edge visibility (are edges visible, distinguishable from background?)
// ---------------------------------------------------------------------------

export interface EdgeVisibilityReport {
  totalEdges: number;
  visibleEdges: number;
  tooThinCount: number;
  lowAlphaCount: number;
  avgScreenThickness: number;
  colorVariety: number;
}

export async function measureEdgeVisibility(page: Page, sampleSize = 200): Promise<EdgeVisibilityReport> {
  return page.evaluate((maxSample) => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.graphEdges) {
      return { totalEdges: 0, visibleEdges: 0, tooThinCount: 0, lowAlphaCount: 0, avgScreenThickness: 0, colorVariety: 0 };
    }

    // Edge rendering: edgeGraphics is a single Graphics object (not children).
    // Edge data is in graphEdges array. Check edgeGraphics visibility + edge data colors.
    const eg = v.edgeGraphics;
    const edgeAlpha = eg?.alpha ?? 1;
    const egVisible = eg?.visible !== false;
    const ws = v.worldContainer?.scale?.x ?? 1;
    const edges = v.graphEdges;
    const total = edges.length;
    const colors = new Set<number>();
    const limit = Math.min(total, maxSample);
    let visible = 0, lowAlpha = 0;

    // If edgeGraphics is invisible or very transparent, all edges are invisible
    if (!egVisible || edgeAlpha < 0.05) {
      return { totalEdges: total, visibleEdges: 0, tooThinCount: 0, lowAlphaCount: total, avgScreenThickness: 0, colorVariety: 0 };
    }

    // Count edges by type/relation color
    for (let i = 0; i < limit; i++) {
      const e = edges[i];
      if (!e) continue;
      visible++;
      // Edge color from edgeCache or relation type
      const ec = v.edgeCache?.get?.(e.id);
      const color = ec?.color ?? e.color ?? 0;
      colors.add(color);
      if (edgeAlpha < 0.1) lowAlpha++;
    }

    return {
      totalEdges: total,
      visibleEdges: visible,
      tooThinCount: tooThin,
      lowAlphaCount: lowAlpha,
      avgScreenThickness: visible > 0 ? Math.round(thicknessSum / visible * 100) / 100 : 0,
      colorVariety: colors.size,
    };
  }, sampleSize);
}

// ---------------------------------------------------------------------------
// 9. Enclosure overlap (groupBy boundaries shouldn't overlap heavily)
// ---------------------------------------------------------------------------

export interface EnclosureReport {
  totalEnclosures: number;
  overlappingPairs: number;
  overlapRate: number;
  avgArea: number;
  tooSmallCount: number;
}

export async function measureEnclosureOverlap(page: Page): Promise<EnclosureReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) {
      return { totalEnclosures: 0, overlappingPairs: 0, overlapRate: 0, avgArea: 0, tooSmallCount: 0 };
    }

    // Enclosure labels are in enclosureLabelContainer (enclosureGraphics is a single Graphics)
    const elc = v.enclosureLabelContainer;
    if (!elc || !elc.children || elc.children.length === 0) {
      return { totalEnclosures: 0, overlappingPairs: 0, overlapRate: 0, avgArea: 0, tooSmallCount: 0 };
    }

    const rects: { x: number; y: number; w: number; h: number }[] = [];
    let areaSum = 0, tooSmall = 0;

    for (const child of elc.children) {
      // Count all enclosure labels (visible or not) to detect groupBy effect
      const b = child.getBounds?.();
      if (b && b.width > 0 && b.height > 0) {
        rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
        areaSum += b.width * b.height;
        if (b.width < 20 || b.height < 20) tooSmall++;
      } else {
        // Label exists but bounds not computed (hidden) — still count
        rects.push({ x: child.x ?? 0, y: child.y ?? 0, w: 50, h: 20 });
      }
    }

    let overlappingPairs = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const oArea = ox * oy;
        const smaller = Math.min(a.w * a.h, b.w * b.h);
        if (smaller > 0 && oArea / smaller > 0.3) overlappingPairs++;
      }
    }

    const totalPairs = rects.length > 1 ? (rects.length * (rects.length - 1)) / 2 : 1;
    return {
      totalEnclosures: rects.length,
      overlappingPairs,
      overlapRate: Math.round((overlappingPairs / totalPairs) * 1000) / 1000,
      avgArea: rects.length > 0 ? Math.round(areaSum / rects.length) : 0,
      tooSmallCount: tooSmall,
    };
  });
}

// ---------------------------------------------------------------------------
// 10. Timeline axis quality (tick spacing, label overlap)
// ---------------------------------------------------------------------------

export interface TimelineAxisReport {
  tickCount: number;
  overlappingTickLabels: number;
  minTickSpacing: number;
  axisVisible: boolean;
  labelsFit: boolean;
}

export async function measureTimelineAxis(page: Page): Promise<TimelineAxisReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) {
      return { tickCount: 0, overlappingTickLabels: 0, minTickSpacing: 0, axisVisible: false, labelsFit: true };
    }

    const guideContainer = v.guideContainer ?? v._guideContainer ?? v.axisContainer;
    if (!guideContainer) {
      return { tickCount: 0, overlappingTickLabels: 0, minTickSpacing: 0, axisVisible: false, labelsFit: true };
    }

    const canvas = v.containerEl?.querySelector("canvas");
    const cW = canvas?.clientWidth ?? 800;
    const cH = canvas?.clientHeight ?? 600;
    const labels: { x: number; y: number; w: number; h: number }[] = [];

    function collect(c: any) {
      if (!c?.children) return;
      for (const ch of c.children) {
        if (ch.text && ch.visible && (ch.alpha ?? 1) > 0.05) {
          const b = ch.getBounds?.();
          if (b) labels.push({ x: b.x, y: b.y, w: b.width, h: b.height });
        }
        if (ch.children) collect(ch);
      }
    }
    collect(guideContainer);
    labels.sort((a, b) => a.x - b.x);

    let minSpacing = Infinity;
    for (let i = 1; i < labels.length; i++) {
      const gap = labels[i].x - (labels[i-1].x + labels[i-1].w);
      if (gap < minSpacing) minSpacing = gap;
    }

    let overlapping = 0;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x &&
            a.y < b.y + b.h && a.y + a.h > b.y) overlapping++;
      }
    }

    const labelsFit = labels.every(l =>
      l.x >= -50 && l.x + l.w <= cW + 50 && l.y >= -50 && l.y + l.h <= cH + 50);

    return {
      tickCount: labels.length,
      overlappingTickLabels: overlapping,
      minTickSpacing: labels.length > 1 ? Math.round(minSpacing) : 0,
      axisVisible: labels.length > 0,
      labelsFit,
    };
  });
}

// ---------------------------------------------------------------------------
// 11. Card mode readability
// ---------------------------------------------------------------------------

export interface CardReadabilityReport {
  totalCards: number;
  withVisibleHeader: number;
  withVisibleBody: number;
  overlappingCards: number;
  avgCardWidth: number;
  avgCardHeight: number;
  tooSmallCards: number;
}

export async function measureCardReadability(page: Page, sampleSize = 50): Promise<CardReadabilityReport> {
  return page.evaluate((maxSample) => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v || !v.pixiNodes) {
      return { totalCards: 0, withVisibleHeader: 0, withVisibleBody: 0, overlappingCards: 0, avgCardWidth: 0, avgCardHeight: 0, tooSmallCards: 0 };
    }

    const rects: { x: number; y: number; w: number; h: number }[] = [];
    let total = 0, withHeader = 0, withBody = 0, tooSmall = 0, wSum = 0, hSum = 0;

    for (const [, pn] of v.pixiNodes) {
      if (total >= maxSample) break;
      const gfx = pn.gfx;
      if (!gfx || !gfx.visible) continue;
      const b = gfx.getBounds?.();
      if (!b || b.width < 1 || b.height < 1) continue;
      total++;
      wSum += b.width;
      hSum += b.height;
      rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      if (b.width < 30 || b.height < 30) tooSmall++;
      const ch = gfx.children ?? [];
      for (const c of ch) {
        if (typeof c.text === "string" && c.text.length > 0 && c.visible) { withHeader++; break; }
      }
      if (pn.data?.bodyPreview?.length > 0) withBody++;
    }

    let overlapping = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const oArea = ox * oy;
        const smaller = Math.min(a.w * a.h, b.w * b.h);
        if (smaller > 0 && oArea / smaller > 0.5) overlapping++;
      }
    }

    return {
      totalCards: total, withVisibleHeader: withHeader, withVisibleBody: withBody,
      overlappingCards: overlapping,
      avgCardWidth: total > 0 ? Math.round(wSum / total) : 0,
      avgCardHeight: total > 0 ? Math.round(hSum / total) : 0,
      tooSmallCards: tooSmall,
    };
  }, sampleSize);
}

// ---------------------------------------------------------------------------
// 12. Minimap quality
// ---------------------------------------------------------------------------

export interface MinimapReport {
  exists: boolean;
  visible: boolean;
  width: number;
  height: number;
}

export async function measureMinimap(page: Page): Promise<MinimapReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { exists: false, visible: false, width: 0, height: 0 };
    const mm = v.minimap;
    if (!mm) return { exists: false, visible: false, width: 0, height: 0 };
    // Minimap has visible, bounds properties directly
    const visible = mm.visible !== false;
    const b = mm.bounds;
    const w = b?.width ?? 0;
    const h = b?.height ?? 0;
    return { exists: true, visible, width: w, height: h };
  });
}

// ---------------------------------------------------------------------------
// 13. Legend quality
// ---------------------------------------------------------------------------

export interface LegendReport {
  exists: boolean;
  itemCount: number;
  fitsViewport: boolean;
}

export async function measureLegend(page: Page): Promise<LegendReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { exists: false, itemCount: 0, fitsViewport: true };
    const el = v.containerEl?.querySelector(".gi-legend, .legend-container");
    if (!el) return { exists: false, itemCount: 0, fitsViewport: true };
    const items = el.querySelectorAll(".legend-item, .gi-legend-item, li, span");
    const rect = el.getBoundingClientRect();
    const cW = v.containerEl?.clientWidth ?? 800;
    const cH = v.containerEl?.clientHeight ?? 600;
    return {
      exists: true,
      itemCount: items.length,
      fitsViewport: rect.right <= cW + 20 && rect.bottom <= cH + 20,
    };
  });
}

// ---------------------------------------------------------------------------
// 14. Guide/grid line quality
// ---------------------------------------------------------------------------

export interface GuideReport {
  exists: boolean;
  lineCount: number;
  labelCount: number;
  overlappingLabels: number;
}

export async function measureGuides(page: Page): Promise<GuideReport> {
  return page.evaluate(() => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return { exists: false, lineCount: 0, labelCount: 0, overlappingLabels: 0 };
    // guideGraphics is a single Graphics (no children). Check guideRenderer or barLabelContainer for labels.
    const gc = v.barLabelContainer ?? v.edgeLabelContainer ?? v.guideGraphics;
    const hasGuide = !!(v.guideGraphics || v.guideRenderer);
    if (!gc && !hasGuide) return { exists: false, lineCount: 0, labelCount: 0, overlappingLabels: 0 };
    let lineCount = 0;
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    function walk(c: any) {
      if (!c?.children) return;
      for (const ch of c.children) {
        if (!ch.visible) continue;
        if (ch.geometry || ch._geometry) lineCount++;
        if (ch.text) { const b = ch.getBounds?.(); if (b) rects.push({ x: b.x, y: b.y, w: b.width, h: b.height }); }
        if (ch.children) walk(ch);
      }
    }
    walk(gc);
    let overlapping = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlapping++;
      }
    }
    return { exists: true, lineCount, labelCount: rects.length, overlappingLabels: overlapping };
  });
}
