/**
 * Auto-detect tag relationships from vault content.
 *
 * On first load (when tagRelations is empty), this scans all markdown files
 * to discover tag co-occurrence patterns and generates a hierarchical
 * tag-relationship preset.
 *
 * Strategy:
 *   1. Collect all tags and their co-occurrence with "hub" tags
 *      (character, timeline, concept, etc.)
 *   2. Build is-a relationships where a specific tag almost always
 *      co-occurs with a broader hub tag
 *   3. Detect sub-hierarchies (e.g. olympian → deity → character)
 */
import type { App } from "obsidian";
import type { TagRelation } from "../types";
import { EDGE_TYPE_INHERITANCE } from "../constants";
import { incCounter } from "./graph-helpers";

/** Minimum co-occurrence ratio for a tag to be considered a child of a hub */
const MIN_COOCCURRENCE_RATIO = 0.6;
/** Minimum absolute count for a tag to be considered for relationships */
const MIN_TAG_COUNT = 2;

/**
 * Scan the vault and generate tag-to-tag relationships.
 * Returns an array of TagRelation objects ready to be stored in settings.
 */
export function detectTagRelations(app: App): TagRelation[] {
	const files = app.vault.getMarkdownFiles();

	// Step 1: Collect tag sets per file
	const { tagSets, tagCounts } = _collectTagSets(files, app);

	// Step 2: Compute co-occurrence matrix and identify hub candidates
	const hubCandidates = [...tagCounts.entries()]
		.filter(([, count]) => count >= 10)
		.sort((a, b) => b[1] - a[1])
		.map(([tag]) => tag);

	const cooccurrence = _buildCooccurrenceMatrix(tagSets);

	// Step 3: Generate relationships — assign non-hub tags to their best hub parent
	const relations: TagRelation[] = [];
	const assigned = new Set<string>();
	const allTags = [...tagCounts.entries()].filter(([, count]) => count >= MIN_TAG_COUNT).map(([tag]) => tag);

	for (const tag of allTags) {
		if (assigned.has(tag) || hubCandidates.includes(tag)) continue;
		const bestHub = _findBestHub(tag, tagCounts, cooccurrence, hubCandidates);
		if (bestHub) {
			relations.push({ source: tag, target: bestHub, type: EDGE_TYPE_INHERITANCE });
			assigned.add(tag);
		}
	}

	// Step 4: Check for transitive chains among hubs
	_buildHubTransitiveChains(hubCandidates, assigned, tagCounts, cooccurrence, relations);

	// Step 5: Deduplicate and remove cycles
	return deduplicateAndValidate(relations);
}

/** Collect normalized tag sets and per-tag counts from vault files */
function _collectTagSets(
	files: ReturnType<App["vault"]["getMarkdownFiles"]>,
	app: App,
): { tagSets: Set<string>[]; tagCounts: Map<string, number> } {
	const tagSets: Set<string>[] = [];
	const tagCounts = new Map<string, number>();

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter?.tags) continue;

		const rawTags = cache.frontmatter.tags;
		const tags: string[] = Array.isArray(rawTags)
			? rawTags.filter((t: unknown): t is string => typeof t === "string")
			: typeof rawTags === "string"
				? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean)
				: [];

		if (tags.length === 0) continue;

		const tagSet = new Set(tags.map((t) => t.replace(/^#/, "").toLowerCase()));
		tagSets.push(tagSet);

		for (const tag of tagSet) {
			incCounter(tagCounts, tag);
		}
	}

	return { tagSets, tagCounts };
}

/** Build pairwise co-occurrence counts from tag sets */
function _buildCooccurrenceMatrix(tagSets: Set<string>[]): Map<string, Map<string, number>> {
	const cooccurrence = new Map<string, Map<string, number>>();
	for (const tagSet of tagSets) {
		for (const tag of tagSet) {
			if (!cooccurrence.has(tag)) cooccurrence.set(tag, new Map());
			const tagCooc = cooccurrence.get(tag)!;
			for (const other of tagSet) {
				if (other !== tag) incCounter(tagCooc, other);
			}
		}
	}
	return cooccurrence;
}

/** Find the best (most specific) hub for a tag based on co-occurrence ratio */
function _findBestHub(
	tag: string,
	tagCounts: Map<string, number>,
	cooccurrence: Map<string, Map<string, number>>,
	hubCandidates: string[],
): string {
	const tagTotal = tagCounts.get(tag) ?? 0;
	const tagCooc = cooccurrence.get(tag);
	if (!tagCooc) return "";

	let bestHub = "";
	let bestRatio = 0;
	let bestHubCount = Infinity;

	for (const hub of hubCandidates) {
		if (hub === tag) continue;
		const ratio = (tagCooc.get(hub) ?? 0) / tagTotal;
		if (ratio < MIN_COOCCURRENCE_RATIO) continue;

		const hubCount = tagCounts.get(hub) ?? 0;

		if (!bestHub) {
			bestHub = hub;
			bestRatio = ratio;
			bestHubCount = hubCount;
		} else if (ratio > bestRatio + 0.1) {
			bestHub = hub;
			bestRatio = ratio;
			bestHubCount = hubCount;
		} else if (ratio >= bestRatio - 0.1 && hubCount < bestHubCount) {
			bestHub = hub;
			bestRatio = ratio;
			bestHubCount = hubCount;
		}
	}

	return bestHub;
}

/** Discover transitive hub-to-hub chains (e.g. deity -> character) */
function _buildHubTransitiveChains(
	hubCandidates: string[],
	assigned: Set<string>,
	tagCounts: Map<string, number>,
	cooccurrence: Map<string, Map<string, number>>,
	relations: TagRelation[],
) {
	for (const hub of hubCandidates) {
		if (assigned.has(hub)) continue;

		const hubTotal = tagCounts.get(hub) ?? 0;
		const hubCooc = cooccurrence.get(hub);
		if (!hubCooc) continue;

		for (const broaderHub of hubCandidates) {
			if (broaderHub === hub) continue;
			const broaderCount = tagCounts.get(broaderHub) ?? 0;
			if (broaderCount <= hubTotal) continue;

			const ratio = (hubCooc.get(broaderHub) ?? 0) / hubTotal;
			if (ratio >= MIN_COOCCURRENCE_RATIO) {
				relations.push({ source: hub, target: broaderHub, type: EDGE_TYPE_INHERITANCE });
				assigned.add(hub);
				break;
			}
		}
	}
}

/** Remove duplicate relations and simple cycles */
function deduplicateAndValidate(relations: TagRelation[]): TagRelation[] {
	const seen = new Set<string>();
	const result: TagRelation[] = [];

	// Build parent map for cycle detection
	const parentOf = new Map<string, string>();

	for (const rel of relations) {
		const key = `${rel.source}|${rel.target}|${rel.type}`;
		if (seen.has(key)) continue;
		if (rel.source === rel.target) continue;

		// Simple cycle check: would this create a loop?
		let ancestor = rel.target;
		let hasCycle = false;
		const visited = new Set<string>();
		while (ancestor && !visited.has(ancestor)) {
			visited.add(ancestor);
			if (ancestor === rel.source) {
				hasCycle = true;
				break;
			}
			ancestor = parentOf.get(ancestor) ?? "";
		}

		if (hasCycle) continue;

		seen.add(key);
		parentOf.set(rel.source, rel.target);
		result.push(rel);
	}

	return result;
}
