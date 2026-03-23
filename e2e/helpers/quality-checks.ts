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
// 5. Card text
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
