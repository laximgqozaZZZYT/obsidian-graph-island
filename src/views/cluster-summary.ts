import { incCounter } from "../utils/graph-helpers";

export type ClusterLabelDetail = "minimal" | "standard" | "detailed" | "rich" | string;

export interface ClusterEdgeRef {
	source: string;
	target: string;
}

/** Top-N tags appearing across `members`, excluding the cluster's own tag. */
export function computeClusterTopTags(
	members: Iterable<string> | undefined,
	getNodeTags: (id: string) => readonly string[] | undefined,
	excludeTag: string,
	limit = 3,
): string[] {
	if (!members) return [];
	const tagCounts = new Map<string, number>();
	for (const id of members) {
		const tags = getNodeTags(id);
		if (!tags) continue;
		for (const tg of tags) {
			if (tg !== excludeTag) incCounter(tagCounts, tg);
		}
	}
	return [...tagCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([tg]) => tg);
}

/** Internal-edge density (0-100). 0 if size < 2 or edges missing. */
export function computeClusterDensityPercent(
	memberSet: ReadonlySet<string>,
	graphEdges: readonly ClusterEdgeRef[] | null | undefined,
): number {
	if (memberSet.size < 2 || !graphEdges) return 0;
	let internalEdges = 0;
	for (const e of graphEdges) {
		if (memberSet.has(e.source) && memberSet.has(e.target)) internalEdges++;
	}
	const maxEdges = (memberSet.size * (memberSet.size - 1)) / 2;
	return maxEdges > 0 ? (internalEdges / maxEdges) * 100 : 0;
}

/**
 * Cluster summary label text shown on enclosure hulls.
 * - no members → bare `#tag (count)`
 * - "detailed" → `#tag (count) · top1, top2, top3`
 * - other (incl. "rich") → `#tag (count) [density%] · top1, top2, top3`
 *   (health badge only when memberSet.size >= 3)
 */
export function buildClusterSummaryLabel(
	tag: string,
	count: number,
	members: ReadonlySet<string> | undefined,
	getNodeTags: (id: string) => readonly string[] | undefined,
	graphEdges: readonly ClusterEdgeRef[] | null | undefined,
	detail: ClusterLabelDetail,
): string {
	if (!members) return `#${tag} (${count})`;

	const topTags = computeClusterTopTags(members, getNodeTags, tag);
	const tagSuffix = topTags.length > 0 ? ` · ${topTags.join(", ")}` : "";

	if (detail === "detailed") {
		return `#${tag} (${count})${tagSuffix}`;
	}

	const density = computeClusterDensityPercent(members, graphEdges);
	const healthSuffix = members.size >= 3 ? ` [${density.toFixed(0)}%]` : "";
	return `#${tag} (${count})${healthSuffix}${tagSuffix}`;
}
