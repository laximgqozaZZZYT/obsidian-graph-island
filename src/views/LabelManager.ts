import type { PixiNode } from "./InteractionManager";
import type { RenderPipeline } from "./RenderPipeline";
import type { CanvasText } from "./canvas2d";
import { DEFAULT_RENDER_THRESHOLDS } from "../types";
import { rectsOverlap } from "../utils/geometry";

// ---------------------------------------------------------------------------
// LabelManagerHost — the interface the LabelManager needs from its parent
// ---------------------------------------------------------------------------
export interface LabelManagerHost {
  /** The PixiNode map (id → PixiNode) */
  getPixiNodes(): Map<string, PixiNode>;
  /** Node degree map */
  getDegrees(): Map<string, number>;
  /** Panel textFadeThreshold value */
  getTextFadeThreshold(): number;
  /** Panel renderThresholds (merged with defaults by caller) */
  getRenderThresholds(): Record<string, any> | undefined;
  /** Current world-container scale (zoom) */
  getWorldScale(): number;
  /** The render pipeline (for zone placement) */
  getRenderPipeline(): RenderPipeline | null;
  /** Sunburst layout labels map */
  getSunburstLabels(): Map<string, CanvasText>;
  /** Cluster sunburst labels map */
  getClusterSunburstLabels(): Map<string, CanvasText>;
  /** Previous highlight set (hovered node neighbourhood) */
  getPrevHighlightSet(): Set<string>;
  /** Mark the render loop as needing a redraw */
  markDirty(force?: boolean): void;
}

// ---------------------------------------------------------------------------
// LabelManager
// ---------------------------------------------------------------------------
/**
 * Manages label LOD (level-of-detail), truncation, priority scoring,
 * counter-scaling, diversity guarantee, and rotated-label culling.
 *
 * Extracted from GraphViewContainer to reduce God Object complexity.
 */
export class LabelManager {
  constructor(private host: LabelManagerHost) {}

  // =========================================================================
  // Public API
  // =========================================================================

  /** Main label update pipeline — called after panel changes and zoom. */
  applyTextFade(): void {
    const baseOpacity = 1 - this.host.getTextFadeThreshold();
    const zoom = this.host.getWorldScale();
    const degrees = this.host.getDegrees();
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.host.getRenderThresholds() };

    // Step 1: Compute priority scores and minShowZoom (once per rebuild)
    this._computePriorityScores(rt);

    // Step 2: Counter-scaling with minimum screen-size guarantee
    const LABEL_FONT = rt.nodeLabelFontSizeMin;
    const rawScale = 1 / Math.pow(zoom, rt.labelScalePower);
    const floorScale = rt.labelMinScreenPx / (LABEL_FONT * zoom);
    const counterScale = Math.min(rt.labelScaleMax, Math.max(rt.labelScaleMin, rawScale, floorScale));

    // Step 3-4: Per-node LOD evaluation (truncation, placement, hysteresis)
    const candidates = this._evaluateLOD(zoom, counterScale, rt, degrees, baseOpacity);

    // Step 5: Diversity guarantee and maxVisible cap
    this._applyDiversityAndCap(candidates, rt, degrees, baseOpacity);

    // Step 6: Group/sunburst/grid label scaling
    this._scaleGroupLabels(zoom, rt);

    this.host.markDirty();
  }

  /** Called by InteractionManager after zoom changes to update label visibility. */
  updateLabelsForZoom(): void {
    this.applyTextFade();
    // Re-cull node labels with leader lines after counter-scale changes
    this.host.getRenderPipeline()?.cullOverlappingLabels();
    // Re-cull rotated labels after zoom change (screen-space overlap changes)
    this.cullOverlappingRotatedLabels(this.host.getClusterSunburstLabels());
    this.cullOverlappingRotatedLabels(this.host.getSunburstLabels());
  }

  /**
   * Hide rotated labels that overlap with higher-priority labels.
   * Uses rotated bounding-box AABB approximation with pre-render width estimation.
   */
  cullOverlappingRotatedLabels(labels: Map<string, CanvasText>): void {
    if (labels.size === 0) return;

    // Estimate text width before first render (measureText hasn't run yet)
    const estimateWidth = (txt: CanvasText): number => {
      if (txt.width > 0) return txt.width;
      const fontSize = txt.style.fontSize ?? 11;
      const isBold = txt.style.fontWeight === "bold" || txt.style.fontWeight === "600";
      return txt.text.length * fontSize * (isBold ? 0.65 : 0.58);
    };

    // Compute AABB for each rotated label in world coordinates
    const rotatedAABB = (txt: CanvasText) => {
      const w = estimateWidth(txt);
      const h = txt.height || (txt.style.fontSize ?? 11);
      const cos = Math.abs(Math.cos(txt.rotation));
      const sin = Math.abs(Math.sin(txt.rotation));
      const bw = w * cos + h * sin;
      const bh = w * sin + h * cos;
      return {
        x: txt.x - bw * txt.anchor.x,
        y: txt.y - bh * txt.anchor.y,
        w: bw,
        h: bh,
      };
    };

    // Collect visible labels with their AABBs, then sort by text length (priority: longer = more important)
    const candidates: { txt: CanvasText; rect: { x: number; y: number; w: number; h: number } }[] = [];
    for (const [, txt] of labels) {
      if (!txt.visible) continue;
      candidates.push({ txt, rect: rotatedAABB(txt) });
    }
    candidates.sort((a, b) => b.txt.text.length - a.txt.text.length);

    // Spatial hash grid for O(n×k) overlap detection
    const CELL = 120;
    const gridMap = new Map<number, { x: number; y: number; w: number; h: number }[]>();
    const key = (cx: number, cy: number) => cx * 100003 + cy;

    const insertGrid = (r: { x: number; y: number; w: number; h: number }) => {
      const x0 = Math.floor(r.x / CELL), y0 = Math.floor(r.y / CELL);
      const x1 = Math.floor((r.x + r.w) / CELL), y1 = Math.floor((r.y + r.h) / CELL);
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const k = key(cx, cy);
          const arr = gridMap.get(k);
          if (arr) arr.push(r); else gridMap.set(k, [r]);
        }
    };

    const checkGrid = (r: { x: number; y: number; w: number; h: number }): boolean => {
      const x0 = Math.floor(r.x / CELL), y0 = Math.floor(r.y / CELL);
      const x1 = Math.floor((r.x + r.w) / CELL), y1 = Math.floor((r.y + r.h) / CELL);
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const arr = gridMap.get(key(cx, cy));
          if (!arr) continue;
          for (const p of arr) {
            if (rectsOverlap(r, p)) return true;
          }
        }
      return false;
    };

    for (const { txt, rect } of candidates) {
      if (checkGrid(rect)) {
        txt.visible = false;
      } else {
        insertGrid(rect);
      }
    }
  }

  // =========================================================================
  // Private pipeline steps
  // =========================================================================

  /** Compute priority scores and minShowZoom for all PixiNodes (cached, recomputed only when needed). */
  private _computePriorityScores(rt: Record<string, any>): void {
    const degrees = this.host.getDegrees();
    const pixiArr = [...this.host.getPixiNodes().values()];
    // Recompute when scores are uninitialized. Use -1 sentinel instead of 0
    // to avoid false positives for nodes with genuinely zero degree.
    const needsScoreRecompute = pixiArr.length > 0 && pixiArr[0].priorityScore <= 0;
    if (!needsScoreRecompute) return;

    let maxDeg = 0;
    for (const d of degrees.values()) { if (d > maxDeg) maxDeg = d; }
    // Assign priority scores
    for (const pn of pixiArr) {
      const deg = degrees.get(pn.data.id) ?? 0;
      const degPct = maxDeg > 0 ? deg / maxDeg : 0;
      const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
      // Priority: super=150+degPct*50, regular=degPct*100
      pn.priorityScore = isSuper ? 150 + degPct * 50 : degPct * 100;
    }
    // Sort by priority and assign minShowZoom based on rank
    const sorted = [...pixiArr].filter(p => p.label).sort((a, b) => b.priorityScore - a.priorityScore);
    const n = sorted.length;
    // LOD tiers — all boundaries from RenderThresholds (no hardcoded values)
    const lodZoom1 = rt.labelZoomTier1;   // default 0.15
    const lodZoom2 = rt.labelZoomTier2;   // default 0.35
    const lodZoom3 = rt.labelZoomTier3;   // default 0.70
    const lodPct1 = rt.labelDegreePctTier1; // default 0.10 (top 10%)
    const lodPct2 = rt.labelDegreePctTier2; // default 0.30 (top 30%)
    const lodPct3 = rt.labelDegreePctTier3; // default 0.50 (top 50%)
    // Interpolation: rank percentile -> minShowZoom
    const lodZoomFloor = rt.nodeLabelZoomMin ?? 0.9;
    for (let i = 0; i < n; i++) {
      const pct = i / n; // 0 = highest priority, 1 = lowest
      let minZ: number;
      if (pct < lodPct1 * 0.1) minZ = lodZoom1 * 0.2; // top ~1%: near-always visible
      else if (pct < lodPct1)  minZ = lodZoom1;         // top tier1%
      else if (pct < lodPct2)  minZ = lodZoom2;         // top tier2%
      else if (pct < lodPct3)  minZ = lodZoom3;         // top tier3%
      else                     minZ = lodZoomFloor;     // rest
      sorted[i].minShowZoom = minZ;
    }
  }

  /** Evaluate per-node label visibility: apply counter-scaling, truncation, placement, and LOD hysteresis.
   *  Returns the list of eligible label candidates. */
  private _evaluateLOD(
    zoom: number, counterScale: number,
    rt: Record<string, any>, degrees: Map<string, number>,
    baseOpacity: number,
  ): { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[] {
    const hoverSet = this.host.getPrevHighlightSet();
    const renderPipeline = this.host.getRenderPipeline();

    // Zoom-aware 3-tier label truncation: initials → truncated → full
    const initialsZoom = rt.labelInitialsZoom ?? 0.2;
    const truncateZoom = rt.labelTruncateZoom ?? 0.35;
    const truncateMaxChars = rt.labelTruncateMaxChars ?? 12;
    const truncateMinChars = rt.labelTruncateMinChars ?? 5;
    const labelMode: "initials" | "truncated" | "full" =
      zoom < initialsZoom ? "initials" :
      zoom < truncateZoom ? "truncated" : "full";
    const shouldTruncate = labelMode !== "full";
    const effectiveMaxChars = labelMode === "initials" ? 2 :
      labelMode === "truncated"
        ? Math.max(truncateMinChars, Math.round(truncateMaxChars * ((zoom - initialsZoom) / (truncateZoom - initialsZoom))))
        : Infinity;

    // Tag label LOD threshold
    const tagLabelZoomMin = rt.tagLabelZoomMin ?? 1.2;

    // Hysteresis: once visible, keep visible until zoom drops 30% below threshold
    const hysteresisHideFactor = rt.labelHysteresisHideFactor ?? 0.7;

    const candidates: { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[] = [];

    // R6: Adaptive label font size — precompute max degree
    const _adaptiveMin = rt.adaptiveLabelMin ?? 0.7;
    const _adaptiveMax = rt.adaptiveLabelMax ?? 1.5;
    let _maxDegForAdaptive = 1;
    for (const d of degrees.values()) { if (d > _maxDegForAdaptive) _maxDegForAdaptive = d; }

    // A1: autoLOD level 4+ bypasses sub-label zoom threshold
    const rp = this.host.getRenderPipeline();
    const autoLodLevel = rp?.isAutoLODActive() ? rp.getLastLodLevel() : 0;
    const subLabelForceShow = autoLodLevel >= 4;

    for (const pn of this.host.getPixiNodes().values()) {
      // --- Tag label LOD (suppressed when tagLabelShow=false, e.g. enclosure mode) ---
      if (pn.tagLabel) {
        pn.tagLabel.visible = rt.tagLabelShow !== false && (zoom >= tagLabelZoomMin || subLabelForceShow);
        if (pn.tagLabel.visible) pn.tagLabel.scale.set(counterScale);
      }
      // --- Sub-label LOD (same threshold as tagLabel, bypassed at LOD 4+) ---
      if (pn.subLabels) {
        for (const sl of pn.subLabels) {
          sl.visible = zoom >= tagLabelZoomMin || subLabelForceShow;
          if (sl.visible) sl.scale.set(counterScale);
        }
      }

      if (!pn.label) continue;

      // Apply counter-scaling with R6 adaptive label sizing
      const nodeDeg = degrees.get(pn.data.id) ?? 0;
      const degRatio = _maxDegForAdaptive > 0 ? nodeDeg / _maxDegForAdaptive : 0;
      const adaptiveScale = _adaptiveMin + degRatio * (_adaptiveMax - _adaptiveMin);
      // Cap final label scale to prevent labels from becoming enormous at extreme zoom-out
      const finalScale = Math.min(counterScale * adaptiveScale, rt.labelScaleMax * 1.5);
      pn.label.scale.set(finalScale);

      // Smart truncation: preserve the distinguishing part of the label
      this._applyTruncation(pn, shouldTruncate, effectiveMaxChars, labelMode);

      // Reset label position (zone-based or fixed)
      const r = pn.radius ?? 12;
      if (rt.labelZonePlacement && renderPipeline) {
        const placement = renderPipeline.computeZonePlacement(
          pn.data, r, rt.labelZoneOffset ?? 6
        );
        pn.label.x = placement.x;
        pn.label.y = placement.y;
        pn.label.anchor.set(placement.anchorX, 0);
      } else {
        pn.label.x = r + 2;
        pn.label.y = -(r * 0.4 + 2);
      }

      const isSuper = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
      const isHovered = hoverSet.size > 0 && hoverSet.has(pn.data.id);
      const deg = degrees.get(pn.data.id) ?? 0;

      // --- Priority-based LOD with hysteresis ---
      const showThreshold = pn.minShowZoom;
      const hideThreshold = showThreshold * hysteresisHideFactor;
      let eligible: boolean;
      if (isSuper || isHovered) {
        eligible = true;
      } else if (pn.labelWasVisible) {
        // Was visible: keep until zoom drops below hide threshold
        eligible = zoom >= hideThreshold;
      } else {
        // Was hidden: only show when zoom reaches show threshold
        eligible = zoom >= showThreshold;
      }

      // AutoLOD level 2: only show labels for top-30% priority nodes
      if (eligible && !isSuper && !isHovered) {
        const rp = this.host.getRenderPipeline();
        if (rp?.isAutoLODActive() && rp.getLastLodLevel() === 2) {
          if (pn.priorityScore <= 70) eligible = false;
        }
      }

      if (!eligible) {
        pn.label.visible = false;
        pn.label.alpha = 0;
        pn.labelWasVisible = false;
        if (pn.tagLabel) pn.tagLabel.visible = false;
        if (pn.subLabels) for (const sl of pn.subLabels) sl.visible = false;
        continue;
      }

      candidates.push({ pn, deg, isSuper, isHovered });
    }

    return candidates;
  }

  /** Apply smart truncation to a node label based on zoom level.
   *  Supports 3 modes: "initials" (2-char), "truncated" (5-12 char), "full". */
  private _applyTruncation(
    pn: PixiNode, shouldTruncate: boolean, effectiveMaxChars: number,
    labelMode: "initials" | "truncated" | "full" = "full",
  ): void {
    if (!pn.label) return;
    if (shouldTruncate && pn.label.text) {
      const fullText = pn.data.label || pn.data.id;

      // Initials mode: extract first letters from path/hyphen segments
      if (labelMode === "initials") {
        pn.label.text = this._extractInitials(fullText);
        return;
      }

      if (fullText.length > effectiveMaxChars) {
        const slashIdx = fullText.lastIndexOf('/');
        const dashIdx = fullText.indexOf('-');
        if (slashIdx > 0 && slashIdx < fullText.length - 1) {
          const parent = fullText.slice(0, slashIdx);
          const distinctStart = dashIdx > 0 && dashIdx < slashIdx ? dashIdx + 1 : 0;
          const parentDistinct = parent.slice(distinctStart, distinctStart + Math.max(3, effectiveMaxChars - 2));
          const child = fullText.slice(slashIdx + 1);
          const childHint = child.length > 3 ? child.slice(0, 3) : child;
          pn.label.text = parentDistinct + '/' + childHint;
        } else if (dashIdx > 0 && dashIdx < effectiveMaxChars) {
          const afterDash = fullText.slice(dashIdx + 1);
          pn.label.text = afterDash.length > effectiveMaxChars
            ? afterDash.slice(0, effectiveMaxChars - 1) + '\u2026'
            : afterDash;
        } else {
          pn.label.text = fullText.slice(0, effectiveMaxChars - 1) + '\u2026';
        }
      } else {
        pn.label.text = fullText;
      }
    } else if (pn.label.text) {
      pn.label.text = pn.data.label || pn.data.id;
    }
  }

  /** Extract 2-character initials from a label string.
   *  Uses path separators (/) and hyphens (-) to find segment boundaries.
   *  E.g. "classic-othello/characters" → "OC", "mythology" → "MY" */
  private _extractInitials(text: string): string {
    // Remove group suffix like " (15)"
    const clean = text.replace(/\s*\(\d+\)$/, "");
    // Split by path separator and hyphens
    const segments = clean.split(/[/\-_\s]+/).filter(s => s.length > 0);
    if (segments.length >= 2) {
      // Take first letter of last two meaningful segments
      return (segments[segments.length - 2][0] + segments[segments.length - 1][0]).toUpperCase();
    }
    // Single word: take first two characters
    return clean.slice(0, 2).toUpperCase();
  }

  /** AP-5 diversity guarantee (promote non-super nodes) and apply maxVisible cap. */
  private _applyDiversityAndCap(
    candidates: { pn: PixiNode; deg: number; isSuper: boolean; isHovered: boolean }[],
    rt: Record<string, any>,
    degrees: Map<string, number>,
    baseOpacity: number,
  ): void {
    const staticMax = rt.labelMaxVisible ?? 0;
    // Zoom-based dynamic cap: at zoom-out, show fewer labels to prevent overlap
    const zoom = this.host.getWorldScale();
    const density = Math.max(0.2, Math.min(3.0, rt.labelDensity ?? 1.0));
    const zoomCap = zoom < 1.0
      ? Math.max(15, Math.round(100 * density * zoom))  // 15-N labels depending on zoom & density
      : 0; // no cap at zoom >= 1
    const maxVisible = staticMax > 0
      ? (zoomCap > 0 ? Math.min(staticMax, zoomCap) : staticMax)
      : zoomCap;

    // AP-5 diversity guarantee: promote top non-super nodes if too few
    const eligibleNonSuper = candidates.filter(c => !c.isSuper).length;
    const eligibleSuper = candidates.filter(c => c.isSuper).length;
    const targetRegulars = Math.max(rt.labelMinNonSuper ?? 5, Math.ceil(eligibleSuper * 0.50));
    if (eligibleNonSuper < targetRegulars) {
      const needed = targetRegulars - eligibleNonSuper;
      const hiddenNonSupers: { pn: PixiNode; deg: number }[] = [];
      for (const pn of this.host.getPixiNodes().values()) {
        if (!pn.label || !pn.label.text) continue;
        const isS = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
        if (isS) continue;
        if (candidates.some(c => c.pn === pn)) continue;
        const d = degrees.get(pn.data.id) ?? 0;
        hiddenNonSupers.push({ pn, deg: d });
      }
      hiddenNonSupers.sort((a, b) => b.deg - a.deg);
      for (let i = 0; i < Math.min(needed, hiddenNonSupers.length); i++) {
        const { pn: npn, deg: ndeg } = hiddenNonSupers[i];
        npn.label!.visible = true;
        npn.label!.alpha = Math.max(rt.labelAlphaMin, baseOpacity);
        candidates.push({ pn: npn, deg: ndeg, isSuper: false, isHovered: false });
      }
    }

    // Sort by priority score, apply maxVisible cap
    candidates.sort((a, b) => b.pn.priorityScore - a.pn.priorityScore);

    let visCount = 0;
    for (const c of candidates) {
      const { pn, isHovered } = c;
      if (isHovered) {
        pn.label!.visible = true;
        pn.label!.alpha = Math.max(rt.labelAlphaMin, baseOpacity);
        pn.labelWasVisible = true;
        continue;
      }
      if (maxVisible > 0 && visCount >= maxVisible) {
        pn.label!.visible = false;
        pn.label!.alpha = 0;
        pn.labelWasVisible = false;
        if (pn.tagLabel) pn.tagLabel.visible = false;
        if (pn.subLabels) for (const sl of pn.subLabels) sl.visible = false;
        continue;
      }
      pn.label!.visible = true;
      pn.label!.alpha = Math.max(rt.labelAlphaMin, baseOpacity);
      pn.labelWasVisible = true;
      visCount++;
    }

    // Zoom-out label emphasis: boost background opacity for surviving labels
    // so they stand out as "important nodes" at low zoom
    if (zoom < 0.5) {
      const emphasisBoost = Math.min(0.3, (0.5 - zoom) * 0.6); // up to 0.3 boost
      for (const c of candidates) {
        if (!c.pn.label?.visible) continue;
        const lbl = c.pn.label;
        if (lbl.bgAlpha != null) {
          lbl.bgAlpha = Math.min(1.0, lbl.bgAlpha + emphasisBoost);
        }
        // Slightly increase padding for better readability
        if (lbl.bgPadX != null) {
          lbl.bgPadX = Math.max(lbl.bgPadX, 4 + emphasisBoost * 10);
        }
      }
    }
  }

  /** Scale sunburst, cluster sunburst, and group grid labels based on zoom level. */
  private _scaleGroupLabels(zoom: number, rt: Record<string, any>): void {
    // Enclosure labels are managed by EnclosureRenderer (drawEnclosuresImpl)
    // which runs every frame with its own zoom-dependent scaling (1/ws).
    // We only handle sunburst/grid labels here.

    const groupLabelScale = Math.min(rt.groupLabelScaleMax,
      Math.max(rt.groupLabelScaleMin, 1 / Math.pow(zoom, rt.groupLabelScalePower)));

    // --- Cluster sunburst labels: hide at low zoom ---
    for (const [, lbl] of this.host.getClusterSunburstLabels()) {
      if (zoom < rt.labelZoomTier1) {
        lbl.visible = false;
      } else {
        lbl.scale.set(groupLabelScale);
      }
    }

    // --- Sunburst layout labels ---
    for (const [, lbl] of this.host.getSunburstLabels()) {
      if (zoom < rt.labelZoomTier1) {
        lbl.visible = false;
      } else {
        lbl.scale.set(groupLabelScale);
      }
    }
  }
}
