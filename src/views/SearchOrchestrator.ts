// ---------------------------------------------------------------------------
// SearchOrchestrator.ts — Pure search/filter logic extracted from GVC
// ---------------------------------------------------------------------------
// Currently only retains the search-match classifier; other helpers were
// removed when GVC stopped delegating to them (ts-prune dead exports).
// ---------------------------------------------------------------------------

/** Per-node search match classification */
interface SearchMatchResult {
	isMatch: boolean;
	hopMatch: boolean;
	textMatch: boolean;
}

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
