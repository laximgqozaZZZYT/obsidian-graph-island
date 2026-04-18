/**
 * ExportOrchestrator — pure helpers for SVG / PNG / preset export argument
 * preparation. Intended to be called from GraphViewContainer in a subsequent
 * subtask; this file only provides the pure building blocks.
 *
 * The underlying pure converter `exportGraphSVG` lives in
 * `src/utils/graph-helpers.ts` and is re-exported here for convenience. Its
 * implementation is intentionally untouched.
 */

import type { GraphNode, GraphEdge } from "../../types";
import { exportGraphSVG } from "../../utils/graph-helpers";

// ---------------------------------------------------------------------------
// Named constants (CLAUDE.md: no hardcoded magic numbers)
// ---------------------------------------------------------------------------

const DEFAULT_SVG_WIDTH = 1920;
const DEFAULT_SVG_HEIGHT = 1080;
const DEFAULT_SVG_BACKGROUND = "#1e1e2e";
const DEFAULT_SVG_NODE_RADIUS = 5;
const DEFAULT_SVG_EDGE_ALPHA = 0.4;

const DEFAULT_PNG_SCALE = 1;
const DEFAULT_PNG_BACKGROUND = "";
const MIN_CANVAS_DIMENSION = 1;

const JSON_INDENT_SPACES = 2;

// Shared: re-export the underlying pure SVG converter so callers importing
// from this module get everything in one place without reaching into utils.
export { exportGraphSVG };

// ---------------------------------------------------------------------------
// Input shapes (kept minimal + structural so tests can pass plain objects)
// ---------------------------------------------------------------------------

export interface SvgExportGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface SvgExportSettings {
	nodeSize?: number;
	showLabels?: boolean;
	edgeAlpha?: number;
	background?: string;
}

export interface SvgExportViewState {
	width?: number;
	height?: number;
	/** If provided, overrides settings.background. Empty string = transparent. */
	background?: string;
	showLabels?: boolean;
}

export interface SvgExportArgs {
	nodes: GraphNode[];
	edges: GraphEdge[];
	options: {
		width: number;
		height: number;
		background: string;
		nodeRadius: number;
		showLabels: boolean;
		edgeAlpha: number;
	};
}

export interface PngExportCanvasLike {
	width: number;
	height: number;
}

export interface PngExportSettings {
	background?: string;
	scale?: number;
}

export interface PngExportArgs {
	width: number;
	height: number;
	background: string;
	scale: number;
}

export interface PresetMetadata {
	version?: string;
	exportedAt?: string;
}

// ---------------------------------------------------------------------------
// buildSvgExportArgs
// ---------------------------------------------------------------------------

/**
 * Build a ready-to-spread argument bag for `exportGraphSVG`.
 *
 * Precedence for each option: viewState > settings > default.
 * Preserves falsy-but-valid values (e.g. `background: ""` for transparent,
 * `showLabels: false`).
 */
export function buildSvgExportArgs(
	graph: SvgExportGraph,
	settings: SvgExportSettings = {},
	viewState: SvgExportViewState = {},
): SvgExportArgs {
	const width = viewState.width ?? DEFAULT_SVG_WIDTH;
	const height = viewState.height ?? DEFAULT_SVG_HEIGHT;
	const background =
		viewState.background ?? settings.background ?? DEFAULT_SVG_BACKGROUND;
	const nodeRadius = settings.nodeSize ?? DEFAULT_SVG_NODE_RADIUS;
	const showLabels = viewState.showLabels ?? settings.showLabels ?? true;
	const edgeAlpha = settings.edgeAlpha ?? DEFAULT_SVG_EDGE_ALPHA;

	return {
		nodes: graph.nodes,
		edges: graph.edges,
		options: {
			width,
			height,
			background,
			nodeRadius,
			showLabels,
			edgeAlpha,
		},
	};
}

// ---------------------------------------------------------------------------
// buildPngExportArgs
// ---------------------------------------------------------------------------

/**
 * Derive PNG export dimensions and options from the live canvas + settings.
 *
 * `canvas.width`/`canvas.height` come straight from the HTMLCanvasElement (or
 * a lightweight stand-in during tests). `scale` multiplies those dimensions
 * for hi-DPI exports; a non-positive scale falls back to {@link DEFAULT_PNG_SCALE}.
 * `width`/`height` are clamped to {@link MIN_CANVAS_DIMENSION} so a 0x0 offscreen
 * canvas cannot produce an invalid export.
 */
export function buildPngExportArgs(
	canvas: PngExportCanvasLike,
	settings: PngExportSettings = {},
): PngExportArgs {
	const rawScale = settings.scale;
	const scale =
		typeof rawScale === "number" && rawScale > 0 ? rawScale : DEFAULT_PNG_SCALE;

	const baseW = Math.max(MIN_CANVAS_DIMENSION, Math.floor(canvas.width));
	const baseH = Math.max(MIN_CANVAS_DIMENSION, Math.floor(canvas.height));

	return {
		width: Math.round(baseW * scale),
		height: Math.round(baseH * scale),
		background: settings.background ?? DEFAULT_PNG_BACKGROUND,
		scale,
	};
}

// ---------------------------------------------------------------------------
// buildPresetJson
// ---------------------------------------------------------------------------

/**
 * Serialize settings + viewState + metadata into a stable preset JSON string.
 *
 * Key order is deterministic: all settings keys (sorted), followed by all
 * viewState keys (sorted), with metadata fields (`_version`, `_exportedAt`)
 * appended last. Sets are converted to sorted arrays so round-trips are
 * deterministic. Uses 2-space indentation for human-readable diffs.
 */
export function buildPresetJson(
	settings: Record<string, unknown> = {},
	viewState: Record<string, unknown> = {},
	metadata: PresetMetadata = {},
): string {
	const ordered: Record<string, unknown> = {};

	for (const key of Object.keys(settings).sort()) {
		ordered[key] = normalisePresetValue(settings[key]);
	}
	for (const key of Object.keys(viewState).sort()) {
		if (key in ordered) continue;
		ordered[key] = normalisePresetValue(viewState[key]);
	}

	if (metadata.version !== undefined) ordered._version = metadata.version;
	if (metadata.exportedAt !== undefined) ordered._exportedAt = metadata.exportedAt;

	return JSON.stringify(ordered, null, JSON_INDENT_SPACES);
}

function normalisePresetValue(value: unknown): unknown {
	if (value instanceof Set) {
		return Array.from(value).sort();
	}
	return value;
}

// ---------------------------------------------------------------------------
// safeExport
// ---------------------------------------------------------------------------

export type SafeExportResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: Error };

/**
 * Run an export-producing function and wrap the outcome in a discriminated
 * union so callers can surface user-friendly error toasts without littering
 * every call site with try/catch.
 */
export function safeExport<T>(fn: () => T): SafeExportResult<T> {
	try {
		return { ok: true, data: fn() };
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		return { ok: false, error };
	}
}
