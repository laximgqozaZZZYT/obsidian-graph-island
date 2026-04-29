/**
 * graph-exporter — single facade for graph export pure logic + side-effecting
 * orchestrators. Lets `GraphViewContainer` import everything it needs from one
 * place instead of reaching into `ExportManager` and `export-orchestrator`
 * separately.
 *
 * This module owns the small pure helpers that the rest of the export pipeline
 * needs (filename sanitisation, embed timestamp formatting, …) and re-exports
 * the existing pure converters and orchestrators. Side-effecting download/
 * clipboard functions stay in `ExportManager` — this file is a facade, not a
 * second implementation.
 */

// ---------------------------------------------------------------------------
// Pure helpers (own here so they can be unit-tested without a DOM)
// ---------------------------------------------------------------------------

const FILENAME_UNSAFE = /[^a-zA-Z0-9_-]/g;

/** Strip characters that are unsafe for cross-platform filenames, returning
 *  only `[A-Za-z0-9_-]`. Empty input yields an empty string — callers decide
 *  whether to fall back to a default. */
export function sanitizeFilenameSegment(segment: string): string {
	return segment.replace(FILENAME_UNSAFE, "_");
}

/** Build the download filename for an N-hop subgraph export, given a node
 *  label (or id, if no label). Format: `subgraph-<sanitized>.json`.
 *  All unsafe characters become `_` so the filename is always portable. */
export function buildSubgraphFilename(label: string): string {
	return `subgraph-${sanitizeFilenameSegment(label)}.json`;
}

/** Format a Date as `YYYYMMDDHHmmss` in local time, with zero-padded fields.
 *  Used by the "embed graph in note" flow where the filename needs second-
 *  level uniqueness within a single user session. Defaults to "now". */
export function buildEmbedTimestamp(date: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds()),
	].join("");
}

/** Build the full embed-export filename, e.g. `graph-island-20260424123456.png`. */
export function buildEmbedFilename(date: Date = new Date()): string {
	return `graph-island-${buildEmbedTimestamp(date)}.png`;
}

// ---------------------------------------------------------------------------
// Re-exports — keep the rest of the codebase importing from one place.
// ---------------------------------------------------------------------------

// Pure graph→string converters live in utils/graph-helpers.
export {
	exportGraphSVG,
	exportFullGraphJSON,
	exportSubgraphJSON,
	exportGraphCSV,
	exportGraphMermaid,
} from "../../utils/graph-helpers";

// Side-effecting download/clipboard/embed orchestration lives in ExportManager.
export {
	downloadFile,
	exportSubgraph,
	exportPng,
	exportFullGraph,
	exportGraphAsCSV,
	exportGraphAsMermaid,
	copyGraphToClipboard,
	embedGraphInNote,
	exportCanvasAsBlob,
	type ExportHost,
} from "../ExportManager";

// SVG / PNG / JSON orchestration entry points + pure option/filename helpers.
export {
	orchestratePngExport,
	orchestrateJsonExport,
	orchestrateSvgExport,
	resolveSvgExportOptions,
	resolveExportCounts,
	buildExportFilename,
	buildExportTimestamp,
	DEFAULT_SVG_EXPORT_OPTIONS,
	type SvgExportOverrides,
	type ResolvedSvgExportOptions,
	type ExportCounts,
	type ExportOrchestratorHost,
} from "../export-orchestrator";
