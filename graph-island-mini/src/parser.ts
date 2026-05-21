import type { App, CachedMetadata, TFile } from "obsidian";
import { GraphData, GraphEdge, GraphNode, GroupBySpec, NONE_BUCKET } from "./types";

export function resolveGroupKey(
	file: TFile,
	cache: CachedMetadata | null,
	spec: GroupBySpec,
): string {
	if (spec.kind === "none") return NONE_BUCKET;
	if (spec.kind === "folder") {
		const parent = file.parent?.path ?? "";
		return parent === "" || parent === "/" ? NONE_BUCKET : parent;
	}
	if (spec.kind === "tag") {
		const tags = collectTags(cache);
		return tags.length > 0 ? tags[0] : NONE_BUCKET;
	}
	const v = cache?.frontmatter?.[spec.field];
	if (v == null || v === "") return NONE_BUCKET;
	return String(Array.isArray(v) ? v[0] : v);
}

function collectTags(cache: CachedMetadata | null): string[] {
	if (!cache) return [];
	const out: string[] = [];
	if (cache.tags) for (const t of cache.tags) out.push(stripHash(t.tag));
	const fm = cache.frontmatter?.tags;
	if (Array.isArray(fm)) for (const t of fm) out.push(stripHash(String(t)));
	else if (typeof fm === "string") out.push(stripHash(fm));
	return out;
}

function stripHash(t: string): string {
	return t.startsWith("#") ? t.slice(1) : t;
}

export function buildGraph(app: App, spec: GroupBySpec): GraphData {
	const files = app.vault.getMarkdownFiles();
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const idSet = new Set<string>();

	for (const f of files) {
		const cache = app.metadataCache.getFileCache(f);
		nodes.push({
			id: f.path,
			label: f.basename,
			groupKey: resolveGroupKey(f, cache, spec),
		});
		idSet.add(f.path);
	}

	for (const f of files) {
		const cache = app.metadataCache.getFileCache(f);
		const links = cache?.links ?? [];
		for (const l of links) {
			const dest = app.metadataCache.getFirstLinkpathDest(l.link, f.path);
			if (!dest) continue;
			if (!idSet.has(dest.path)) continue;
			if (dest.path === f.path) continue;
			edges.push({ source: f.path, target: dest.path });
		}
	}

	return { nodes, edges };
}
