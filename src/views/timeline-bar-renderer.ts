/**
 * timeline-bar-renderer.ts — Pure rendering logic for timeline duration bars.
 * Extracted from GraphViewContainer.drawTimelineBars to reduce complexity.
 */
import { CanvasText, type CanvasGraphics, type CanvasContainer } from "./canvas2d";
import type { ClusterMetadata, TimelineBarInfo } from "../layouts/cluster-force";
import type { PixiNode } from "./InteractionManager";
import { mergeRenderThresholds, type RenderThresholds } from "../types";
import type { App } from "obsidian";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal host interface — the GVC surface needed by bar rendering. */
export interface TimelineBarHost {
	barGraphics: CanvasGraphics | null;
	barLabelContainer: CanvasContainer | null;
	worldContainer: CanvasContainer | null;
	canvasWrap: HTMLElement | null;
	highlightedNodeId: string | null;
	pixiNodes: Map<string, PixiNode>;
	isDarkTheme(): boolean;
	panel: {
		showDurationBars: boolean;
		viewMode: string;
		renderThresholds: Partial<RenderThresholds>;
	};
	app: App;
	clusterMeta: ClusterMetadata | null;
}

interface Viewport {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

interface BarRenderConfig {
	fillAlpha: number;
	strokeAlpha: number;
	hoverAlpha: number;
	barCornerRBase: number;
	showBarLabel: boolean;
	barLabelMinW: number;
	barLabelFontSize: number;
	lineW: number;
	worldScale: number;
}

// ---------------------------------------------------------------------------
// Sub-functions
// ---------------------------------------------------------------------------

/** Build the set of sibling bar node IDs sharing the same parent_id as the hovered node. */
function buildSiblingSet(
	hoveredId: string,
	bars: TimelineBarInfo[],
	pixiNodes: Map<string, PixiNode>,
	app: App,
): Set<string> | null {
	const hoveredNode = pixiNodes.get(hoveredId);
	if (!hoveredNode) return null;
	const fp = hoveredNode.data.filePath ?? hoveredId;
	const tf = app.vault.getAbstractFileByPath(fp);
	const parentId = tf ? app.metadataCache.getFileCache(tf as import("obsidian").TFile)?.frontmatter?.parent_id : null;
	if (!parentId) return null;

	const siblings = new Set<string>();
	for (const bar of bars) {
		const bfp = pixiNodes.get(bar.nodeId)?.data?.filePath ?? bar.nodeId;
		const btf = app.vault.getAbstractFileByPath(bfp);
		const bpid = btf
			? app.metadataCache.getFileCache(btf as import("obsidian").TFile)?.frontmatter?.parent_id
			: null;
		if (bpid === parentId) siblings.add(bar.nodeId);
	}
	return siblings;
}

/** Compute viewport bounds in world-space coordinates. */
function computeViewport(host: TimelineBarHost, worldScale: number): Viewport {
	const world = host.worldContainer;
	const wx = world?.x ?? 0;
	const wy = world?.y ?? 0;
	const canvasW = host.canvasWrap?.clientWidth ?? 1200;
	const canvasH = host.canvasWrap?.clientHeight ?? 800;
	const left = -wx / worldScale;
	const top = -wy / worldScale;
	return {
		left,
		top,
		right: left + canvasW / worldScale,
		bottom: top + canvasH / worldScale,
	};
}

/** Resolve fill/stroke alpha for a single bar based on hover state. */
function resolveBarAlpha(
	isHovered: boolean,
	isSibling: boolean,
	hasHover: boolean,
	cfg: BarRenderConfig,
): { fill: number; stroke: number } {
	const fill = isHovered
		? cfg.hoverAlpha
		: isSibling
			? Math.min(cfg.hoverAlpha, cfg.fillAlpha * 1.5)
			: hasHover
				? cfg.fillAlpha * 0.3
				: cfg.fillAlpha;
	const stroke = isHovered
		? cfg.strokeAlpha * 1.5
		: isSibling
			? cfg.strokeAlpha
			: hasHover
				? cfg.strokeAlpha * 0.3
				: cfg.strokeAlpha;
	return { fill, stroke };
}

/** Draw individual bars + labels into the graphics context. */
function drawBars(
	g: CanvasGraphics,
	bars: TimelineBarInfo[],
	cfg: BarRenderConfig,
	vp: Viewport,
	hoveredId: string | null,
	siblingIds: Set<string> | null,
	pixiNodes: Map<string, PixiNode>,
	labelContainer: CanvasContainer | null,
	isDark: boolean,
): void {
	const placedLabels: { x: number; y: number; w: number; h: number }[] = [];
	const maxLabels = Math.min(200, Math.round(80 * cfg.worldScale));

	for (const bar of bars) {
		const w = bar.xEnd - bar.xStart;
		const h = bar.barHeight;
		const x = bar.xStart;
		const y = bar.yCenter - h / 2;

		if (x + w < vp.left || x > vp.right || y + h < vp.top || y > vp.bottom) continue;

		const pn = pixiNodes.get(bar.nodeId);
		const color = pn ? pn.color : 0x888888;
		const cornerR = Math.min(h / 2, cfg.barCornerRBase);
		const isHovered = hoveredId === bar.nodeId;
		const isSibling = siblingIds?.has(bar.nodeId) ?? false;
		const alpha = resolveBarAlpha(isHovered, isSibling, !!hoveredId, cfg);

		g.beginFill(color, alpha.fill);
		g.drawRoundedRect(x, y, w, h, cornerR);
		g.endFill();
		g.lineStyle(cfg.lineW, color, alpha.stroke);
		g.drawRoundedRect(x, y, w, h, cornerR);
		g.lineStyle(0);

		// Bar label with 2D collision avoidance
		if (
			cfg.showBarLabel &&
			labelContainer &&
			pn &&
			w * cfg.worldScale >= cfg.barLabelMinW &&
			placedLabels.length < maxLabels
		) {
			placeBarLabel(pn, x, y, w, cfg, placedLabels, labelContainer, color, isDark);
		}
	}
}

/** Try to place a bar label with collision avoidance. */
function placeBarLabel(
	pn: PixiNode,
	x: number,
	y: number,
	w: number,
	cfg: BarRenderConfig,
	placedLabels: { x: number; y: number; w: number; h: number }[],
	container: CanvasContainer,
	color: number,
	isDark: boolean,
): void {
	const fontSize = Math.max(7, cfg.barLabelFontSize / cfg.worldScale);
	const labelW = Math.min(pn.data.label.length * fontSize * 0.6, w);
	const labelH = fontSize * 1.3;
	const labelX = x;
	const labelY = y - labelH - 1 / cfg.worldScale;

	const overlaps = placedLabels.some(
		(p) => labelX < p.x + p.w && labelX + labelW > p.x && labelY < p.y + p.h && labelY + labelH > p.y,
	);
	if (overlaps) return;

	placedLabels.push({ x: labelX, y: labelY, w: labelW, h: labelH });
	const label = new CanvasText(pn.data.label, {
		fontSize,
		fontWeight: "bold",
		fill: isDark ? 0xffffff : 0x111111,
		fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
	});
	label.bgColor = color;
	label.bgAlpha = 0.7;
	label.bgPadX = 4 / cfg.worldScale;
	label.bgPadY = 2 / cfg.worldScale;
	label.x = labelX;
	label.y = labelY;
	label.maxWidth = Math.max(w, 40 / cfg.worldScale);
	container.addChild(label);
}

/** Draw work group separator lines and labels (timeline viewMode). */
function drawWorkGroupSeparators(
	g: CanvasGraphics,
	container: CanvasContainer,
	workGroups: { name: string; minY: number; maxY: number }[],
	bars: TimelineBarInfo[],
	worldScale: number,
	isDark: boolean,
): void {
	if (workGroups.length <= 1) return;
	const sepColor = isDark ? 0x555555 : 0xcccccc;
	const labelColor = isDark ? 0x999999 : 0x666666;
	const sepLineW = Math.max(0.5, 1 / worldScale);
	const xEnd = bars.length > 0 ? Math.max(...bars.map((b) => b.xEnd)) + 20 : 200;

	for (let i = 0; i < workGroups.length; i++) {
		const wg = workGroups[i];
		if (i > 0) {
			const sepY = wg.minY - 4 / worldScale;
			g.lineStyle(sepLineW, sepColor, 0.3);
			g.moveTo(20, sepY);
			g.lineTo(xEnd, sepY);
			g.lineStyle(0);
		}
		const shortName = wg.name.replace(/^(classic-|mythology-|bible-)/, "");
		const fontSize = Math.max(5, 8 / worldScale);
		const nameLabel = new CanvasText(shortName, {
			fontSize,
			fill: labelColor,
			fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
			fontWeight: "bold",
		});
		nameLabel.x = 5;
		nameLabel.y = wg.minY;
		nameLabel.alpha = 0.6;
		container.addChild(nameLabel);
	}
}

/** Draw time axis labels at the bottom of timeline (timeline viewMode). */
function drawTimeAxis(
	g: CanvasGraphics,
	container: CanvasContainer,
	steps: string[],
	stepW: number,
	bars: TimelineBarInfo[],
	worldScale: number,
	isDark: boolean,
): void {
	const axisFontSize = Math.max(6, 9 / worldScale);
	let maxBarY = 0;
	for (const b of bars) {
		const by = b.yCenter + b.barHeight / 2;
		if (by > maxBarY) maxBarY = by;
	}
	const axisY = maxBarY + 12 / worldScale;
	const maxLabels = Math.min(steps.length, Math.floor((800 * worldScale) / 40));
	const labelStep = Math.max(1, Math.ceil(steps.length / maxLabels));
	const axisColor = isDark ? 0xaaaaaa : 0x666666;

	g.lineStyle(Math.max(0.5, 1 / worldScale), axisColor, 0.4);
	g.moveTo(60, axisY - 4 / worldScale);
	g.lineTo(60 + (steps.length - 1) * stepW, axisY - 4 / worldScale);

	for (let i = 0; i < steps.length; i += labelStep) {
		const x = 60 + i * stepW;
		g.moveTo(x, axisY - 6 / worldScale);
		g.lineTo(x, axisY - 2 / worldScale);

		const axisLabel = new CanvasText(steps[i], {
			fontSize: axisFontSize,
			fill: axisColor,
		});
		axisLabel.anchor.set(0, 0);
		axisLabel.x = x;
		axisLabel.y = axisY;
		axisLabel.rotation = Math.PI / 4;
		container.addChild(axisLabel);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearBarLabels(container: CanvasContainer): void {
	for (const child of [...container.children]) {
		container.removeChild(child);
		child.destroy();
	}
}

function buildBarRenderConfig(rt: Required<RenderThresholds>, worldScale: number): BarRenderConfig {
	return {
		fillAlpha: rt.timelineBarFillAlpha,
		strokeAlpha: rt.timelineBarStrokeAlpha,
		hoverAlpha: rt.timelineBarHoverAlpha,
		barCornerRBase: rt.timelineBarCornerRadius,
		showBarLabel: rt.timelineBarShowLabel,
		barLabelMinW: rt.timelineBarLabelMinWidth,
		barLabelFontSize: rt.timelineBarLabelFontSize,
		lineW: Math.max(0.5, 1.0 / worldScale),
		worldScale,
	};
}

function drawTimelineOverlays(
	g: CanvasGraphics,
	container: CanvasContainer,
	host: TimelineBarHost,
	bars: TimelineBarInfo[],
	worldScale: number,
	isDark: boolean,
): void {
	const workGroups = host.clusterMeta?.timelineWorkGroups as
		| { name: string; minY: number; maxY: number }[]
		| undefined;
	if (workGroups) {
		drawWorkGroupSeparators(g, container, workGroups, bars, worldScale, isDark);
	}

	const steps = host.clusterMeta?.timelineSteps;
	const stepW = host.clusterMeta?.timelineStepWidth;
	if (steps && stepW && steps.length > 0) {
		drawTimeAxis(g, container, steps, stepW, bars, worldScale, isDark);
	}
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Draw timeline duration bars — called from GVC.drawTimelineBars(). */
export function renderTimelineBars(host: TimelineBarHost): void {
	const g = host.barGraphics;
	if (!g) return;
	g.clear();

	if (host.barLabelContainer) clearBarLabels(host.barLabelContainer);

	if (!host.panel.showDurationBars && host.panel.viewMode !== "timeline") return;
	const bars: TimelineBarInfo[] | undefined = host.clusterMeta?.timelineBars;
	if (!bars || bars.length === 0) return;

	const worldScale = host.worldContainer?.scale.x ?? 1;
	const cfg = buildBarRenderConfig(mergeRenderThresholds(host.panel.renderThresholds), worldScale);

	const hoveredId = host.highlightedNodeId;
	const siblingIds = hoveredId ? buildSiblingSet(hoveredId, bars, host.pixiNodes, host.app) : null;
	const vp = computeViewport(host, worldScale);
	const isDark = host.isDarkTheme();

	drawBars(g, bars, cfg, vp, hoveredId, siblingIds, host.pixiNodes, host.barLabelContainer, isDark);

	if (host.panel.viewMode === "timeline" && host.barLabelContainer) {
		drawTimelineOverlays(g, host.barLabelContainer, host, bars, worldScale, isDark);
	}
}
