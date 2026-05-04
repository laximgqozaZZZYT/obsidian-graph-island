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
	/** Raw markdown body returned by `vault.cachedRead` (sync). Drives inline-relation parsing. */
	fileContent?: string;
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
			// Sync return — triggers the sync branch in attachBodyPreview and feeds collectInlineRelations.
			cachedRead: (file: { path: string }) => specByPath.get(file.path)?.fileContent ?? "",
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
// buildSharedMetadataEdges — shared metadata edges via settings.edgeFields
// (untested integration path: branch coverage in metadata-parser is ~55%)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — shared metadata edges (edgeFields)", () => {
	it("creates pairwise edges between nodes sharing a single string-valued field", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "Tolkien" } },
			{ path: "B.md", frontmatter: { author: "Tolkien" } },
			{ path: "C.md", frontmatter: { author: "Tolkien" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author"] }));
		const shared = g.edges.filter((e) => e.label === "author");
		// 3 nodes share one value → C(3,2) = 3 undirected pairs
		expect(shared).toHaveLength(3);
		expect(shared.every((e) => e.type === "category")).toBe(true);
	});

	it("array-valued fields fan out: each value contributes to its own group", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { themes: ["adventure", "magic"] } },
			{ path: "B.md", frontmatter: { themes: ["adventure"] } },
			{ path: "C.md", frontmatter: { themes: ["magic"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["themes"] }));
		const shared = g.edges.filter((e) => e.label === "themes");
		// "adventure" → {A,B}, "magic" → {A,C}: 2 edges total
		expect(shared).toHaveLength(2);
		const pairs = shared.map((e) => `${e.source}|${e.target}`).sort();
		expect(pairs).toEqual(["A.md|B.md", "A.md|C.md"]);
	});

	it("uses EDGE_TYPE_TAG when the shared field is literally 'tags'", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["fiction"] } },
			{ path: "B.md", frontmatter: { tags: ["fiction"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["tags"] }));
		const shared = g.edges.filter((e) => e.label === "tags");
		expect(shared).toHaveLength(1);
		expect(shared[0].type).toBe("tag");
	});

	it("skips singleton groups (a value present on only one node yields no edge)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "Solo" } },
			{ path: "B.md", frontmatter: { author: "Other" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author"] }));
		expect(g.edges.filter((e) => e.label === "author")).toEqual([]);
	});

	it("skips files missing the field entirely (does not crash on undefined)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "X" } },
			{ path: "B.md", frontmatter: { author: "X" } },
			{ path: "C.md" /* no frontmatter */ },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author"] }));
		const shared = g.edges.filter((e) => e.label === "author");
		expect(shared).toHaveLength(1);
		const ids = new Set([shared[0].source, shared[0].target]);
		expect(ids.has("C.md")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Explicit tag-to-tag relationships (ontology.tagRelations)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — explicit tagRelations", () => {
	it("emits an inheritance edge between two existing tag nodes", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [{ source: "warrior", target: "character", type: "inheritance" }],
		};
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["warrior"] } },
			{ path: "B.md", frontmatter: { tags: ["character"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagEdge = g.edges.find(
			(e) => e.source === "tag:warrior" && e.target === "tag:character" && e.type === "inheritance",
		);
		expect(tagEdge).toBeDefined();
		expect(tagEdge!.relation).toBe("#warrior is-a #character");
	});

	it("emits an aggregation edge with 'has' wording in the relation label", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [{ source: "spell", target: "spellbook", type: "aggregation" }],
		};
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["spell"] } },
			{ path: "B.md", frontmatter: { tags: ["spellbook"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagEdge = g.edges.find((e) => e.source === "tag:spell" && e.target === "tag:spellbook");
		expect(tagEdge).toBeDefined();
		expect(tagEdge!.type).toBe("aggregation");
		// aggregation phrasing reverses the order: "#target has #source"
		expect(tagEdge!.relation).toBe("#spellbook has #spell");
	});

	it("creates virtual tag nodes for tagRelations endpoints not used by any file", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [{ source: "ghost-tag", target: "another-ghost", type: "inheritance" }],
		};
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["unrelated"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagIds = new Set(g.nodes.filter((n) => n.isTag).map((n) => n.id));
		expect(tagIds.has("tag:ghost-tag")).toBe(true);
		expect(tagIds.has("tag:another-ghost")).toBe(true);
		// The edge between the synthesized tag nodes must exist
		expect(g.edges.some((e) => e.source === "tag:ghost-tag" && e.target === "tag:another-ghost")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Reverse ontology classification — direction is inverted at edge creation
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — reverse ontology direction", () => {
	it("frontmatter link with reverseInheritance field swaps source/target", () => {
		// A's frontmatter says "child: B" — Breadcrumbs idiom meaning B's parent is A.
		// The graph stores inheritance as child → parent, so the edge should be A → B reversed to B → A?
		// Per the impl: reverse=true makes src=target, tgt=file. So edge is B.md → A.md.
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			reverseInheritanceFields: ["child"],
		};
		const app = mkFakeApp([{ path: "A.md", frontmatterLinks: [{ key: "child", link: "B" }] }, { path: "B.md" }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const inh = g.edges.filter((e) => e.type === "inheritance" && !e.source.startsWith("tag:"));
		expect(inh).toHaveLength(1);
		expect(inh[0].source).toBe("B.md");
		expect(inh[0].target).toBe("A.md");
		expect(inh[0].relation).toBe("child");
	});

	it("regular wiki-link annotated by frontmatter reverseAggregation field swaps direction", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			reverseAggregationFields: ["part-of"],
		};
		// Regular link A → B exists, *and* frontmatter records "part-of: [[B]]" on A.
		const app = mkFakeApp([
			{ path: "A.md", links: ["B"], frontmatterLinks: [{ key: "part-of", link: "B" }] },
			{ path: "B.md" },
		]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const agg = g.edges.filter((e) => e.type === "aggregation");
		expect(agg).toHaveLength(1);
		// reverse=true: source=B, target=A
		expect(agg[0].source).toBe("B.md");
		expect(agg[0].target).toBe("A.md");
	});
});

// ---------------------------------------------------------------------------
// Inline relation resolution — file content drives parseInlineRelationLinks
// (covers EDGE_TYPE_INLINE_RELATION fallback and ontology classification)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — inline relation links via file content", () => {
	it("classifies [[X]@field] as inheritance when field is in inheritanceFields", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			inheritanceFields: ["parent"],
		};
		const app = mkFakeApp([
			{ path: "A.md", fileContent: "Some prose [[B]@parent] referencing B." },
			{ path: "B.md" },
		]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const inh = g.edges.filter((e) => e.type === "inheritance" && !e.source.startsWith("tag:"));
		expect(inh).toHaveLength(1);
		// "parent" is forward-classified — no reversal: A → B
		expect(inh[0].source).toBe("A.md");
		expect(inh[0].target).toBe("B.md");
		expect(inh[0].relation).toBe("parent");
	});

	it("falls back to inline-relation type when an inline relation matches no ontology field", () => {
		const app = mkFakeApp([{ path: "A.md", fileContent: "Free-form note [[B]@invented-rel]." }, { path: "B.md" }]);
		const g = buildGraphFromVault(app, mkSettings());
		const ir = g.edges.filter((e) => e.type === "inline-relation");
		expect(ir).toHaveLength(1);
		expect(ir[0].source).toBe("A.md");
		expect(ir[0].target).toBe("B.md");
		expect(ir[0].relation).toBe("invented-rel");
	});

	it("inline Dataview field (Author::[[B]]) on its own line creates an inline-relation edge", () => {
		// `Author::[[B]]` is an inline Dataview field. With no `Author` in any ontology field
		// list, it ends up as an inline-relation type when there is no plain wiki-link.
		// The field-line regex uses `^...::` per-line — so the field name is "Author" only
		// when it's flush at the start of a line.
		const app = mkFakeApp([{ path: "A.md", fileContent: "Author::[[B]]" }, { path: "B.md" }]);
		const g = buildGraphFromVault(app, mkSettings());
		const edge = g.edges.find((e) => e.source === "A.md" && e.target === "B.md");
		expect(edge).toBeDefined();
		// Without an ontology mapping for "Author", the inline-only path falls through to inline-relation.
		expect(edge!.type).toBe("inline-relation");
		expect(edge!.relation).toBe("Author");
	});

	it("inline classification yields the configured edge type even when a regular wiki-link covers it", () => {
		// Regular link A → B is present AND inline `[[B]@similar]` annotates it as a similarity edge.
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			similarFields: ["similar"],
		};
		const app = mkFakeApp([
			{ path: "A.md", links: ["B"], fileContent: "see also [[B]@similar]" },
			{ path: "B.md" },
		]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const aToB = g.edges.filter((e) => e.source === "A.md" && e.target === "B.md");
		expect(aToB).toHaveLength(1);
		// The inline annotation upgrades the regular link to a similar edge.
		expect(aToB[0].type).toBe("similar");
	});
});
