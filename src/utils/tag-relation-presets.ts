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

    const tagSet = new Set(tags.map(t => t.replace(/^#/, "").toLowerCase()));
    tagSets.push(tagSet);

    for (const tag of tagSet) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  // Step 2: Compute co-occurrence matrix for candidate hub tags
  // Hub tags = tags with high count that serve as category labels
  const hubCandidates = [...tagCounts.entries()]
    .filter(([, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // For each non-hub tag, find which hub tag it co-occurs with most consistently
  const cooccurrence = new Map<string, Map<string, number>>();

  for (const tagSet of tagSets) {
    for (const tag of tagSet) {
      if (!cooccurrence.has(tag)) cooccurrence.set(tag, new Map());
      const tagCooc = cooccurrence.get(tag)!;
      for (const other of tagSet) {
        if (other === tag) continue;
        tagCooc.set(other, (tagCooc.get(other) ?? 0) + 1);
      }
    }
  }

  // Step 3: Generate relationships
  const relations: TagRelation[] = [];
  const assigned = new Set<string>(); // tags already assigned a parent

  // Structural hierarchies are detected via co-occurrence (no hardcoded pairs).
  // Previously this had hardcoded beat→scene→sequence→act→timeline which violated
  // the no-hardcoding policy. These relationships are now discovered automatically
  // through the co-occurrence analysis below (hub detection + transitive chains).

  // For remaining tags: find the best hub parent based on co-occurrence
  const allTags = [...tagCounts.entries()]
    .filter(([, count]) => count >= MIN_TAG_COUNT)
    .map(([tag]) => tag);

  for (const tag of allTags) {
    if (assigned.has(tag)) continue;
    if (hubCandidates.includes(tag)) continue; // hubs don't get parents from this pass

    const tagTotal = tagCounts.get(tag) ?? 0;
    const tagCooc = cooccurrence.get(tag);
    if (!tagCooc) continue;

    // Find the most specific hub with sufficient co-occurrence.
    // Among hubs with similar ratio (within 0.1), prefer the smallest
    // (most specific) one — e.g., "deity"(17) over "character"(238).
    let bestHub = "";
    let bestRatio = 0;
    let bestHubCount = Infinity;

    for (const hub of hubCandidates) {
      if (hub === tag) continue;
      const coocCount = tagCooc.get(hub) ?? 0;
      const ratio = coocCount / tagTotal;

      if (ratio < MIN_COOCCURRENCE_RATIO) continue;

      const hubCount = tagCounts.get(hub) ?? 0;

      if (!bestHub) {
        bestHub = hub; bestRatio = ratio; bestHubCount = hubCount;
      } else if (ratio > bestRatio + 0.1) {
        // Substantially better ratio wins regardless of specificity
        bestHub = hub; bestRatio = ratio; bestHubCount = hubCount;
      } else if (ratio >= bestRatio - 0.1 && hubCount < bestHubCount) {
        // Similar ratio — prefer more specific (smaller count) hub
        bestHub = hub; bestRatio = ratio; bestHubCount = hubCount;
      }
    }

    if (bestHub) {
      relations.push({ source: tag, target: bestHub, type: EDGE_TYPE_INHERITANCE });
      assigned.add(tag);
    }
  }

  // Step 4: Check for transitive chains among hubs
  // e.g., if "deity" always co-occurs with "character", add deity → character
  for (let i = 0; i < hubCandidates.length; i++) {
    const hub = hubCandidates[i];
    if (assigned.has(hub)) continue;

    const hubTotal = tagCounts.get(hub) ?? 0;
    const hubCooc = cooccurrence.get(hub);
    if (!hubCooc) continue;

    // Find a broader hub this one belongs to
    for (const broaderHub of hubCandidates) {
      if (broaderHub === hub) continue;
      const broaderCount = tagCounts.get(broaderHub) ?? 0;
      if (broaderCount <= hubTotal) continue; // broader hub should be more common

      const coocCount = hubCooc.get(broaderHub) ?? 0;
      const ratio = coocCount / hubTotal;

      if (ratio >= MIN_COOCCURRENCE_RATIO) {
        relations.push({ source: hub, target: broaderHub, type: EDGE_TYPE_INHERITANCE });
        assigned.add(hub);
        break;
      }
    }
  }

  // Step 5: Deduplicate and remove cycles
  return deduplicateAndValidate(relations);
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
      if (ancestor === rel.source) { hasCycle = true; break; }
      ancestor = parentOf.get(ancestor) ?? "";
    }

    if (hasCycle) continue;

    seen.add(key);
    parentOf.set(rel.source, rel.target);
    result.push(rel);
  }

  return result;
}
