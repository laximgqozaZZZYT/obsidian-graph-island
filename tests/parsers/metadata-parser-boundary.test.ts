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
