// ---------------------------------------------------------------------------
// SearchOrchestrator.ts — Pure search/filter logic extracted from GVC
// ---------------------------------------------------------------------------
// Currently provides search-match classification used by GVC for hop/text
// filter visualization.  All functions are pure (no PixiJS / Obsidian
// dependencies) to enable unit testing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-node search match classification */
interface SearchMatchResult {
	isMatch: boolean;
	hopMatch: boolean;
	textMatch: boolean;
}

// ---------------------------------------------------------------------------
// Search match classification
// ---------------------------------------------------------------------------

/**
 * Classify whether a node matches the current search/hop filters.
 *
 * @param nodeId  The node ID to check
 * @param hopSet  Set of IDs within hop range (null = no hop filter active)
 * @param hlSet   Set of IDs matching text search (null = no text search active)
 */
export function classifySearchMatch(
	nodeId: string,
	hopSet: Set<string> | null,
	hlSet: Set<string> | null,
): SearchMatchResult {
	const hopMatch = hopSet === null || hopSet.has(nodeId);
	const textMatch = hlSet === null || hlSet.has(nodeId);
	return { isMatch: hopMatch && textMatch, hopMatch, textMatch };
}
