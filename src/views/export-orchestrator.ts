/**
 * ExportOrchestrator — centralises SVG / PNG / JSON export orchestration.
 *
 * Responsibilities:
 *   - Resolve export options (partial overrides → fully resolved options)
 *   - Generate deterministic filenames for downloaded artefacts
 *   - Drive the download + toast side effects via a host interface
 *
 * The underlying pure converters (exportGraphSVG, exportFullGraphJSON) live in
 * `utils/graph-helpers.ts` and are intentionally untouched here — this module
 * is the *orchestration* layer, not the rendering layer.
 */

import { Notice } from "obsidian";
import type { GraphNode, GraphEdge } from "../types";
import { exportGraphSVG, exportFullGraphJSON } from "../utils/graph-helpers";
import { downloadFile } from "./ExportManager";
import { t } from "../i18n";
import type { IApp } from "./canvas2d/interfaces";
import { TOAST_SHORT_MS } from "../constants";

// ---------------------------------------------------------------------------
// Named constants (CLAUDE.md: no hardcoded magic numbers)
// ---------------------------------------------------------------------------
const TOAST_MEDIUM_MS = 3000;
const FILENAME_PREFIX = "graph-island";

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export interface SvgExportOverrides {
	width?: number;
	height?: number;
	background?: string;
	nodeRadius?: number;
	showLabels?: boolean;
	edgeAlpha?: number;
}

export interface ResolvedSvgExportOptions {
	width: number;
	height: number;
	background: string;
	nodeRadius: number;
	showLabels: boolean;
	edgeAlpha: number;
}

export const DEFAULT_SVG_EXPORT_OPTIONS: ResolvedSvgExportOptions = {
	width: 1920,
	height: 1080,
	background: "#1e1e2e",
	nodeRadius: 5,
	showLabels: true,
	edgeAlpha: 0.4,
};

/** Merge partial overrides with defaults, preserving falsy-but-valid values
 *  like `background: ""` (transparent) and `showLabels: false`. */
export function resolveSvgExportOptions(
	overrides?: SvgExportOverrides,
): ResolvedSvgExportOptions {
	if (!overrides) return { ...DEFAULT_SVG_EXPORT_OPTIONS };
	return {
		width: overrides.width ?? DEFAULT_SVG_EXPORT_OPTIONS.width,
		height: overrides.height ?? DEFAULT_SVG_EXPORT_OPTIONS.height,
		background: overrides.background ?? DEFAULT_SVG_EXPORT_OPTIONS.background,
		nodeRadius: overrides.nodeRadius ?? DEFAULT_SVG_EXPORT_OPTIONS.nodeRadius,
		showLabels: overrides.showLabels ?? DEFAULT_SVG_EXPORT_OPTIONS.showLabels,
		edgeAlpha: overrides.edgeAlpha ?? DEFAULT_SVG_EXPORT_OPTIONS.edgeAlpha,
	};
}

// ---------------------------------------------------------------------------
// Filename generation
// ---------------------------------------------------------------------------

/** Convert a Date to `YYYY-MM-DD`. Defaults to "now". */
export function buildExportTimestamp(date: Date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

/** Build a filename of shape `graph-island-<kind>-<YYYY-MM-DD>.<ext>`.
 *  `kind` and `ext` are sanitised to safe filename characters. */
export function buildExportFilename(
	kind: string,
	ext: string,
	date: Date = new Date(),
): string {
	const safeKind = sanitiseFilenameSegment(kind) || "export";
	const safeExt = sanitiseFilenameSegment(ext.replace(/^\./, "")) || "bin";
	return `${FILENAME_PREFIX}-${safeKind}-${buildExportTimestamp(date)}.${safeExt}`;
}

function sanitiseFilenameSegment(segment: string): string {
	return segment.replace(/[^a-zA-Z0-9_-]/g, "");
}

// ---------------------------------------------------------------------------
// Empty-graph guard
// ---------------------------------------------------------------------------

export interface ExportCounts {
	nodeCount: number;
	edgeCount: number;
	empty: boolean;
}

/** Lightweight summary used by orchestrators to decide whether to abort on
 *  empty graphs and to render user-facing toast counts. */
export function resolveExportCounts(
	nodes: ReadonlyArray<unknown>,
	edges: ReadonlyArray<unknown>,
): ExportCounts {
	return {
		nodeCount: nodes.length,
		edgeCount: edges.length,
		empty: nodes.length === 0,
	};
}

// ---------------------------------------------------------------------------
// Host interface — minimal surface required from GVC
// ---------------------------------------------------------------------------

export interface ExportOrchestratorHost {
	readonly pixiApp: IApp | null;
	getGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] };
}

// ---------------------------------------------------------------------------
// Orchestration entry points
// ---------------------------------------------------------------------------

/** Orchestrate SVG export: resolves options, generates SVG, triggers download. */
export function orchestrateSvgExport(
	host: ExportOrchestratorHost,
	overrides?: SvgExportOverrides,
): void {
	const gd = host.getGraphData();
	const counts = resolveExportCounts(gd.nodes, gd.edges);
	if (counts.empty) {
		new Notice(t("toast.svgExported"), TOAST_SHORT_MS);
		return;
	}
	const options = resolveSvgExportOptions(overrides);
	const svg = exportGraphSVG(gd.nodes, gd.edges, options);
	const filename = buildExportFilename("graph", "svg");
	downloadFile(svg, "image/svg+xml", filename);
	new Notice(t("toast.svgExported"), TOAST_MEDIUM_MS);
}

/** Orchestrate PNG export from the live Pixi canvas. */
export function orchestratePngExport(host: ExportOrchestratorHost): void {
	const canvas = host.pixiApp?.view;
	if (!canvas) return;
	const filename = buildExportFilename("graph", "png");
	canvas.toBlob((blob: Blob | null) => {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		new Notice(t("export.pngDone"), TOAST_SHORT_MS);
	}, "image/png");
}

/** Orchestrate JSON export of the full graph. */
export function orchestrateJsonExport(host: ExportOrchestratorHost): void {
	const gd = host.getGraphData();
	const counts = resolveExportCounts(gd.nodes, gd.edges);
	const json = exportFullGraphJSON(gd.nodes, gd.edges);
	const filename = buildExportFilename("export", "json");
	downloadFile(json, "application/json", filename);
	new Notice(
		t("export.graphDone")
			.replace(/{nodes}/g, String(counts.nodeCount))
			.replace(/{edges}/g, String(counts.edgeCount)),
		TOAST_MEDIUM_MS,
	);
}
