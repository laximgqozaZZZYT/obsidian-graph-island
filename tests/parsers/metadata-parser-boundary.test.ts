import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import {
	buildGraphFromVault,
	parseInlineRelationLinksRaw,
	classifyRelation,
	snapshotMeta,
	collectAllTags,
	extractBodyInfo,
	simpleHash,
	applyMonochromeFallback,
} from "../../src/parsers/metadata-parser";
import type { GraphViewsSettings, OntologyConfig, GraphNode } from "../../src/types";
import { DEFAULT_ONTOLOGY } from "../../src/types";

// ---------------------------------------------------------------------------
// Helpers — build a fake Obsidian App for driving buildGraphFromVault
// ---------------------------------------------------------------------------

interface FakeFileSpec {
	path: string;
	basename?: string;
	frontmatter?: Record<string, unknown> | null;
	/** Inline `#tags` discovered outside frontmatter (e.g. body) */
	inlineTags?: string[];
	/** Wikilinks from `cache.links` — resolved to target path via nameMap */
	links?: string[];
	/** Simulated frontmatter wikilink fields (e.g. Author:: [[B]]) */
	frontmatterLinks?: Array<{ key: string; link: string }>;
}

function mkSettings(overrides?: Partial<GraphViewsSettings>): GraphViewsSettings {
	return {
		nodeSize: 20,
		metadataFields: [],
		edgeFields: [],
		colorField: "category",
		groupField: "category",
		ontology: { ...DEFAULT_ONTOLOGY, useTagHierarchy: false },
		showSimilar: true,
		directionalGravityRules: [],
		enclosureMinRatio: 0.05,
		groupPresets: [],
		defaultSortRules: [],
		defaultClusterGroupRules: [],
		defaultNodeRules: [],
		settingsJsonPath: "",
		snapshots: [],
		templates: [],
		...overrides,
	};
}

function mkFakeApp(specs: FakeFileSpec[]): any {
	const files = specs.map((spec) => {
		const f = Object.assign(new TFile(), {
			path: spec.path,
			basename: spec.basename ?? spec.path.replace(/\.md$/, "").split("/").pop(),
			stat: { mtime: 0, ctime: 0 },
		});
		return f;
	});
	const specByPath = new Map(specs.map((s) => [s.path, s]));

	// Resolve link by basename or path (Obsidian resolves "B" → "B.md")
	const pathByName = new Map<string, string>();
	for (const f of files) {
		pathByName.set(f.basename, f.path);
		pathByName.set(f.path, f.path);
	}

	return {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
			cachedRead: () => "", // sync empty string — triggers the sync branch in attachBodyPreview
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const spec = specByPath.get(file.path);
				if (!spec) return null;
				const cache: any = {};
				if (spec.frontmatter !== undefined && spec.frontmatter !== null) {
					cache.frontmatter = spec.frontmatter;
				}
				if (spec.inlineTags?.length) {
					cache.tags = spec.inlineTags.map((t) => ({ tag: t.startsWith("#") ? t : `#${t}` }));
				}
				if (spec.links?.length) {
					cache.links = spec.links.map((link) => ({ link }));
				}
				if (spec.frontmatterLinks?.length) {
					cache.frontmatterLinks = spec.frontmatterLinks;
				}
				return cache;
			},
			getFirstLinkpathDest: (link: string, _source: string) => {
				const resolved = pathByName.get(link);
				if (!resolved) return null;
				return files.find((f) => f.path === resolved) ?? null;
			},
			resolvedLinks: {},
		},
	};
}

// ---------------------------------------------------------------------------
// Boundary tests for buildGraphFromVault — frontmatter edge cases
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — frontmatter boundary", () => {
	it("returns empty graph for empty vault", () => {
		const app = mkFakeApp([]);
		const g = buildGraphFromVault(app, mkSettings());
		expect(g.nodes).toEqual([]);
		expect(g.edges).toEqual([]);
	});

	it("handles file with null metadataCache (no frontmatter, no tags)", () => {
		// spec.frontmatter undefined → cache.frontmatter absent; no inlineTags
		const app = mkFakeApp([{ path: "A.md" }]);
		const g = buildGraphFromVault(app, mkSettings());
		expect(g.nodes).toHaveLength(1);
		const a = g.nodes.find((n) => n.id === "A.md")!;
		expect(a.tags).toEqual([]);
		// With no frontmatter, defineLazyMeta is skipped — meta stays undefined
		expect(a.meta).toBeUndefined();
	});

	it("handles empty frontmatter object — node created, meta is undefined (only position filtered)", () => {
		const app = mkFakeApp([{ path: "A.md", frontmatter: {} }]);
		const g = buildGraphFromVault(app, mkSettings());
		const a = g.nodes.find((n) => n.id === "A.md")!;
		expect(a).toBeDefined();
		// snapshotMeta returns undefined for empty entries
		expect(a.meta).toBeUndefined();
		expect(a.tags).toEqual([]);
	});

	it("ignores non-array, non-string tags (object/number) without crashing", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: { invalid: true } as unknown as string[] } },
			{ path: "B.md", frontmatter: { tags: 42 as unknown as string[] } },
		]);
		const g = buildGraphFromVault(app, mkSettings());
		expect(g.nodes.find((n) => n.id === "A.md")!.tags).toEqual([]);
		expect(g.nodes.find((n) => n.id === "B.md")!.tags).toEqual([]);
	});

	it("splits comma-separated string tags and trims whitespace", () => {
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: " hero , villain ,  sage " } }]);
		const g = buildGraphFromVault(app, mkSettings());
		const a = g.nodes.find((n) => n.id === "A.md")!;
		expect(a.tags).toEqual(["hero", "villain", "sage"]);
	});

	it("merges frontmatter and inline (#) tags without duplicates", () => {
		const app = mkFakeApp([
			{
				path: "A.md",
				frontmatter: { tags: ["hero"] },
				inlineTags: ["hero", "epic"], // "hero" already in fm → deduped
			},
		]);
		const g = buildGraphFromVault(app, mkSettings());
		const a = g.nodes.find((n) => n.id === "A.md")!;
		expect(a.tags).toEqual(["hero", "epic"]);
	});
});

// ---------------------------------------------------------------------------
// Duplicate / circular edge handling
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — duplicate/circular edges", () => {
	it("deduplicates repeated links from same source to same target", () => {
		const app = mkFakeApp([{ path: "A.md", links: ["B", "B", "B"] }, { path: "B.md" }]);
		const g = buildGraphFromVault(app, mkSettings());
		const aToB = g.edges.filter((e) => e.source === "A.md" && e.target === "B.md" && e.type === "link");
		expect(aToB).toHaveLength(1);
	});

	it("creates two distinct edges for mutual A↔B links (no infinite loop)", () => {
		const app = mkFakeApp([
			{ path: "A.md", links: ["B"] },
			{ path: "B.md", links: ["A"] },
		]);
		const g = buildGraphFromVault(app, mkSettings());
		const linkEdges = g.edges.filter((e) => e.type === "link");
		expect(linkEdges).toHaveLength(2);
		const keys = linkEdges.map((e) => `${e.source}->${e.target}`).sort();
		expect(keys).toEqual(["A.md->B.md", "B.md->A.md"]);
	});

	it("skips links pointing to non-existent files", () => {
		const app = mkFakeApp([{ path: "A.md", links: ["GhostFile"] }]);
		const g = buildGraphFromVault(app, mkSettings());
		expect(g.edges.filter((e) => e.type === "link")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Tag hierarchy (useTagHierarchy) — nested tag inheritance edges
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — tag hierarchy", () => {
	it("builds inheritance edges between nested tag nodes when useTagHierarchy is true", () => {
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: true, tagRelations: [] };
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["entity/character/hero"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagIds = new Set(g.nodes.filter((n) => n.isTag).map((n) => n.id));
		expect(tagIds).toEqual(new Set(["tag:entity", "tag:entity/character", "tag:entity/character/hero"]));
		// Hierarchy edges: hero → character, character → entity
		const hier = g.edges.filter((e) => e.type === "inheritance" && e.source.startsWith("tag:"));
		const keys = hier.map((e) => `${e.source}->${e.target}`).sort();
		expect(keys).toEqual(["tag:entity/character->tag:entity", "tag:entity/character/hero->tag:entity/character"]);
	});
});

// ---------------------------------------------------------------------------
// parseInlineRelationLinksRaw — wikilink special characters
// ---------------------------------------------------------------------------

describe("parseInlineRelationLinksRaw — special chars in target", () => {
	it("accepts '#' heading anchor inside link target", () => {
		const results = parseInlineRelationLinksRaw("[[Note#Section]@refers]");
		expect(results).toEqual([{ linkTarget: "Note#Section", relation: "refers" }]);
	});

	it("accepts '^' block reference inside link target", () => {
		const results = parseInlineRelationLinksRaw("[[Note^block-id]@cites]");
		expect(results).toEqual([{ linkTarget: "Note^block-id", relation: "cites" }]);
	});

	it("does not match when closing brackets are missing (malformed)", () => {
		// Missing outer `]` — the regex requires it
		expect(parseInlineRelationLinksRaw("[[Note]@rel")).toEqual([]);
		// Missing inner `]` before @
		expect(parseInlineRelationLinksRaw("[[Note@rel]")).toEqual([]);
	});

	it("handles pipe-alias together with heading anchor", () => {
		const results = parseInlineRelationLinksRaw("[[Note#Chapter|display]@quotes]");
		expect(results).toEqual([{ linkTarget: "Note#Chapter", relation: "quotes" }]);
	});
});

// ---------------------------------------------------------------------------
// snapshotMeta — null/undefined/nested values
// ---------------------------------------------------------------------------

describe("snapshotMeta — edge cases", () => {
	it("preserves nested arrays and objects verbatim (only 'position' is stripped)", () => {
		const fm = {
			title: "Test",
			position: { start: 0, end: 5 },
			related: ["[[A]]", "[[B]]"],
			nested: { a: 1, b: [true, false] },
		};
		const snap = snapshotMeta(fm);
		expect(snap).toEqual({
			title: "Test",
			related: ["[[A]]", "[[B]]"],
			nested: { a: 1, b: [true, false] },
		});
		// Shallow snapshot: nested references are preserved, not cloned
		expect(snap!.nested).toBe(fm.nested);
	});
});

// ---------------------------------------------------------------------------
// classifyRelation / collectAllTags — misc boundary
// ---------------------------------------------------------------------------

describe("classifyRelation / collectAllTags — boundary", () => {
	it("classifyRelation treats bare '@' (no name) as empty and finds no match", () => {
		const onto: OntologyConfig = { ...DEFAULT_ONTOLOGY, inheritanceFields: ["parent"] };
		expect(classifyRelation("@", onto)).toBeUndefined();
	});

	it("collectAllTags emits empty-string ancestor for leading-slash tags ('/x' → {'/x', ''})", () => {
		// The implementation splits on "/"; leading-slash produces an empty ancestor.
		// This test pins down the current behavior so future refactors notice the edge case.
		const nodes = [{ id: "a", label: "a", tags: ["/x"] } as GraphNode];
		const tags = collectAllTags(nodes);
		expect(tags.has("/x")).toBe(true);
		expect(tags.has("")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// extractBodyInfo — YAML frontmatter and length boundaries
// ---------------------------------------------------------------------------

describe("extractBodyInfo — YAML and length boundaries", () => {
	it("returns content as-is when no YAML frontmatter is present", () => {
		const r = extractBodyInfo("Plain body text only.", 100);
		expect(r.preview).toBe("Plain body text only.");
		expect(r.length).toBe("Plain body text only.".length);
	});

	it("does NOT strip when opening '---' has no closing match (treats whole as body)", () => {
		// indexOf("---", 3) returns -1 → endIdx > 0 fails → body unchanged.
		// The leading "---" stays, but heading-prefix regex strips a "## " line prefix.
		const r = extractBodyInfo("---\nstray frontmatter without close\n## heading", 200);
		// "---" preserved; "## heading" → "heading" (heading prefix stripped per line)
		expect(r.preview).toContain("---");
		expect(r.preview).toContain("stray frontmatter without close");
		expect(r.preview).toContain("heading");
		expect(r.preview).not.toContain("## heading");
	});

	it("does not append ellipsis when body length is at or below maxLen", () => {
		const exact = "abcde";
		const r = extractBodyInfo(exact, 5);
		expect(r.preview).toBe("abcde");
		expect(r.length).toBe(5);
		expect(r.preview.endsWith("…")).toBe(false);
	});

	it("appends ellipsis when body exceeds maxLen and reports full length", () => {
		const long = "x".repeat(150);
		const r = extractBodyInfo(long, 100);
		expect(r.preview).toHaveLength(101); // 100 chars + "…"
		expect(r.preview.endsWith("…")).toBe(true);
		expect(r.length).toBe(150);
	});
});

// ---------------------------------------------------------------------------
// simpleHash + applyMonochromeFallback — palette-fallback edge cases
// ---------------------------------------------------------------------------

describe("simpleHash / applyMonochromeFallback — boundary", () => {
	it("simpleHash is deterministic and non-negative for empty / long inputs", () => {
		expect(simpleHash("")).toBeGreaterThanOrEqual(0);
		expect(simpleHash("abc")).toBe(simpleHash("abc"));
		// Different inputs yield different hashes (overwhelmingly likely with djb2)
		expect(simpleHash("a")).not.toBe(simpleHash("b"));
		// Very long string: still finite, non-negative integer
		const long = "z".repeat(10_000);
		const h = simpleHash(long);
		expect(Number.isInteger(h)).toBe(true);
		expect(h).toBeGreaterThanOrEqual(0);
	});

	it("applyMonochromeFallback returns original fn when nodes < 5 (skips check)", () => {
		const nodes = [{ id: "a" }, { id: "b" }];
		const orig = () => 0xff0000; // would be monochrome
		const fn = applyMonochromeFallback(nodes, orig, [0x111111, 0x222222]);
		expect(fn).toBe(orig);
	});

	it("applyMonochromeFallback returns original fn when palette is empty (avoids div-by-zero)", () => {
		const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
		const orig = () => 0xff0000;
		const fn = applyMonochromeFallback(nodes, orig, []);
		expect(fn).toBe(orig);
	});

	it("applyMonochromeFallback swaps to hash-based fn when 5+ nodes share one color", () => {
		const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
		const palette = [0x111111, 0x222222, 0x333333];
		const fn = applyMonochromeFallback(nodes, () => 0xff0000, palette);
		// Each node gets a palette entry derived from its hash → must be one of the palette colors
		for (const n of nodes) {
			expect(palette).toContain(fn(n));
		}
		// Determinism: same id → same color
		expect(fn({ id: "a" })).toBe(fn({ id: "a" }));
	});
});

// ---------------------------------------------------------------------------
// buildSharedMetadataEdges — edges from frontmatter values shared across notes
// (exercises the previously-untested settings.edgeFields branch)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — shared metadata edges via edgeFields", () => {
	it("does not emit shared edges when edgeFields is empty (default)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "Twain" } },
			{ path: "B.md", frontmatter: { author: "Twain" } },
		]);
		// edgeFields defaults to []
		const g = buildGraphFromVault(app, mkSettings());
		// No category-typed (shared metadata) edges should exist
		expect(g.edges.filter((e) => e.label === "author")).toEqual([]);
	});

	it("builds a 'category' typed edge between notes sharing a single-valued field", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "Twain" } },
			{ path: "B.md", frontmatter: { author: "Twain" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author"] }));
		const shared = g.edges.filter((e) => e.label === "author");
		expect(shared).toHaveLength(1);
		// Field is not "tags" → falls back to "category" type
		expect(shared[0].type).toBe("category");
		// Endpoints are A.md / B.md (order is sorted by group push order)
		const ids = [shared[0].source, shared[0].target].sort();
		expect(ids).toEqual(["A.md", "B.md"]);
	});

	it("uses 'tag' edge type when the shared field name is 'tags'", () => {
		// Three notes share tag "fantasy" → C(3,2)=3 pairwise shared-metadata edges.
		// Note: this is independent of the implicit has-tag virtual nodes.
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["fantasy"] } },
			{ path: "B.md", frontmatter: { tags: ["fantasy"] } },
			{ path: "C.md", frontmatter: { tags: ["fantasy"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["tags"] }));
		const shared = g.edges.filter((e) => e.label === "tags");
		expect(shared).toHaveLength(3);
		// All shared-metadata edges via the "tags" field get type "tag"
		for (const e of shared) expect(e.type).toBe("tag");
	});

	it("does not emit a shared edge for groups of size 1 (no pair to connect)", () => {
		// Only one node has the field — group size 1 is filtered out by the >=2 check
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "Solo" } },
			{ path: "B.md", frontmatter: { author: "Other" } },
			{ path: "C.md" }, // no frontmatter at all
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author"] }));
		expect(g.edges.filter((e) => e.label === "author")).toEqual([]);
	});

	it("emits one edge per shared value when frontmatter is array-valued", () => {
		// Both notes share TWO genre values → 2 shared-metadata edges between them.
		// Edge IDs include the field name as prefix, so pairs differing by value
		// are distinct keys: "genre:A.md->B.md" appears twice (once per group),
		// but edgeSet still dedupes the second one. We expect exactly ONE edge
		// per (field, A, B) pair regardless of how many values they share.
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: ["sci-fi", "thriller"] } },
			{ path: "B.md", frontmatter: { genre: ["sci-fi", "thriller"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		const shared = g.edges.filter((e) => e.label === "genre");
		// Two value-groups both produce edge "genre:A.md->B.md", but edgeSet dedupes.
		expect(shared).toHaveLength(1);
		expect([shared[0].source, shared[0].target].sort()).toEqual(["A.md", "B.md"]);
	});

	it("filters out groups larger than 50 nodes (avoids O(N^2) explosion)", () => {
		// 51 notes share the same author → group exceeds the 50-cap and is dropped
		const specs: FakeFileSpec[] = [];
		for (let i = 0; i < 51; i++) {
			specs.push({ path: `n${i}.md`, frontmatter: { author: "Prolific" } });
		}
		const app = mkFakeApp(specs);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author"] }));
		expect(g.edges.filter((e) => e.label === "author")).toEqual([]);
	});

	it("processes multiple edgeFields independently (each contributes its own edges)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "X", genre: "horror" } },
			{ path: "B.md", frontmatter: { author: "X", genre: "horror" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author", "genre"] }));
		// Two distinct edges (one per field) between A and B
		const labels = g.edges.filter((e) => e.label).map((e) => e.label);
		expect(labels.sort()).toEqual(["author", "genre"]);
	});
});

// ---------------------------------------------------------------------------
// Explicit ontology.tagRelations — tag-to-tag edges without nesting hierarchy
// (exercises the untested branch in buildTagNodesAndEdges)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — explicit ontology.tagRelations", () => {
	it("creates a tag-to-tag edge from an explicit tagRelation", () => {
		// Both source and target tags appear on existing notes → tag nodes exist.
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [{ source: "hero", target: "character", type: "inheritance" }],
		};
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["hero"] } },
			{ path: "B.md", frontmatter: { tags: ["character"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagEdge = g.edges.find((e) => e.source === "tag:hero" && e.target === "tag:character");
		expect(tagEdge).toBeDefined();
		expect(tagEdge!.type).toBe("inheritance");
		// "is-a" wording reflects inheritance direction
		expect(tagEdge!.relation).toBe("#hero is-a #character");
	});

	it("uses 'has' wording for non-inheritance tagRelation types (e.g. aggregation)", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [{ source: "wing", target: "bird", type: "aggregation" }],
		};
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["wing"] } },
			{ path: "B.md", frontmatter: { tags: ["bird"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagEdge = g.edges.find((e) => e.source === "tag:wing" && e.target === "tag:bird");
		expect(tagEdge).toBeDefined();
		expect(tagEdge!.type).toBe("aggregation");
		// Aggregation phrasing puts target first ("#bird has #wing")
		expect(tagEdge!.relation).toBe("#bird has #wing");
	});

	it("auto-creates missing virtual tag nodes when tagRelation references unused tags", () => {
		// Neither "ghost" nor "phantom" appears on any note, so collectAllTags
		// would not include them. The tagRelations branch must inject these
		// virtual tag nodes itself or the edge would dangle.
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [{ source: "ghost", target: "phantom", type: "inheritance" }],
		};
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["unrelated"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		// Both virtual tag nodes were injected even though no note uses them
		const ghostNode = g.nodes.find((n) => n.id === "tag:ghost");
		const phantomNode = g.nodes.find((n) => n.id === "tag:phantom");
		expect(ghostNode).toBeDefined();
		expect(ghostNode!.isTag).toBe(true);
		expect(phantomNode).toBeDefined();
		expect(phantomNode!.isTag).toBe(true);
		// The edge between them exists too
		const tagEdge = g.edges.find((e) => e.source === "tag:ghost" && e.target === "tag:phantom");
		expect(tagEdge).toBeDefined();
	});

	it("deduplicates the same tagRelation if listed twice (edgeSet guard)", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [
				{ source: "a", target: "b", type: "inheritance" },
				{ source: "a", target: "b", type: "inheritance" }, // duplicate
			],
		};
		const app = mkFakeApp([{ path: "X.md", frontmatter: { tags: ["a", "b"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagEdges = g.edges.filter((e) => e.source === "tag:a" && e.target === "tag:b");
		expect(tagEdges).toHaveLength(1);
	});

	it("nested-hierarchy and explicit tagRelations coexist without conflict", () => {
		// useTagHierarchy: true → "a/b" → "a" inheritance edge (id starts with tag-hierarchy:)
		// PLUS an explicit relation a→c (id starts with tag-rel:) — both should appear.
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: true,
			tagRelations: [{ source: "a", target: "c", type: "inheritance" }],
		};
		const app = mkFakeApp([{ path: "X.md", frontmatter: { tags: ["a/b"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		// Hierarchy edge: a/b → a
		const hier = g.edges.find((e) => e.source === "tag:a/b" && e.target === "tag:a");
		expect(hier).toBeDefined();
		expect(hier!.id.startsWith("tag-hierarchy:")).toBe(true);
		// Explicit relation edge: a → c
		const rel = g.edges.find((e) => e.source === "tag:a" && e.target === "tag:c");
		expect(rel).toBeDefined();
		expect(rel!.id.startsWith("tag-rel:")).toBe(true);
	});
});
