/**
 * Pure formatting helpers for the graph view status bar.
 * Extracted from GraphViewContainer.buildRichStatus so the formatting logic
 * can be unit-tested without instantiating the view container.
 */

export interface RichStatusInputs {
	/** Visible node count after filtering */
	nodeCount: number;
	/** Visible edge count after filtering */
	edgeCount: number;
	/** Unfiltered total node count (used to render "X / Y nodes") */
	totalNodes: number;
	/** Path of the local-graph center node, or null when not in local mode */
	localGraphCenter: string | null;
	/** Whether focus layout is active (suppressed when localGraphCenter set) */
	focusLayout: boolean;
	/** Number of currently collapsed groups */
	groupCount: number;
	/** Active search query string ("" when no search) */
	searchQuery: string;
	/** Search mode flag — "highlight" renders as "HL", any other value as "F" */
	searchMode: string;
	/** Active view mode ("graph" is treated as default and skipped) */
	viewMode: string;
	/** Active groupBy field ("none" or "" is treated as inactive) */
	groupBy: string;
}

const SEARCH_QUERY_PREVIEW_LEN = 20;
const STATUS_SEPARATOR = " · ";

export function buildRichStatus(input: RichStatusInputs): string {
	const parts: string[] = [];

	if (input.localGraphCenter) parts.push("Local");
	else if (input.focusLayout) parts.push("Focus");

	if (input.totalNodes !== input.nodeCount) {
		parts.push(`${input.nodeCount} / ${input.totalNodes} nodes`);
	} else {
		parts.push(`${input.nodeCount} nodes`);
	}

	if (input.edgeCount > 0) parts.push(`${input.edgeCount} edges`);

	if (input.groupCount > 0) parts.push(`${input.groupCount} groups`);

	if (input.searchQuery) {
		const mode = input.searchMode === "highlight" ? "HL" : "F";
		parts.push(`[${mode}: ${input.searchQuery.slice(0, SEARCH_QUERY_PREVIEW_LEN)}]`);
	}

	if (input.viewMode && input.viewMode !== "graph") {
		parts.push(input.viewMode);
	}

	if (input.groupBy && input.groupBy !== "none") {
		parts.push(`by ${input.groupBy}`);
	}

	return parts.join(STATUS_SEPARATOR);
}
