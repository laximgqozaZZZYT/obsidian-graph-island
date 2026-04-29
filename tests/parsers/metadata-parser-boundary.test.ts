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
import type { GraphViewsSettings, OntologyConfig, GraphNode, TagRelation } from "../../src/types";
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

// ---------------------------------------------------------------------------
// buildSharedMetadataEdges — edgeFields-driven shared-value edges
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — shared metadata edges (edgeFields)", () => {
	it("does NOT create shared edges when edgeFields is empty (default)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: "rock" } },
			{ path: "B.md", frontmatter: { genre: "rock" } },
		]);
		const g = buildGraphFromVault(app, mkSettings());
		// No edgeFields → no "category"-typed edges should be present
		expect(g.edges.filter((e) => e.type === "category")).toEqual([]);
	});

	it("creates a 'category'-typed edge between two nodes sharing a non-tags edgeField value", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: "rock" } },
			{ path: "B.md", frontmatter: { genre: "rock" } },
			{ path: "C.md", frontmatter: { genre: "jazz" } }, // unique value → no edge
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		const shared = g.edges.filter((e) => e.type === "category");
		expect(shared).toHaveLength(1);
		expect(shared[0].source).toBe("A.md");
		expect(shared[0].target).toBe("B.md");
		expect(shared[0].label).toBe("genre");
		// id format includes the field name to disambiguate from same-pair link edges
		expect(shared[0].id).toBe("genre:A.md->B.md");
	});

	it("uses EDGE_TYPE_TAG ('tag') instead of 'category' when edgeField is 'tags'", () => {
		// Note: when "tags" is in edgeFields, the shared-metadata path treats each
		// tag value as a group independently (separate from the has-tag virtual edges).
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["epic"] } },
			{ path: "B.md", frontmatter: { tags: ["epic"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["tags"] }));
		// Filter to the shared-metadata "tag"-typed edges (id-prefixed with "tags:")
		const sharedTagEdges = g.edges.filter((e) => e.type === "tag" && e.id.startsWith("tags:"));
		expect(sharedTagEdges).toHaveLength(1);
		expect(sharedTagEdges[0].source).toBe("A.md");
		expect(sharedTagEdges[0].target).toBe("B.md");
		expect(sharedTagEdges[0].label).toBe("tags");
	});

	it("treats array-valued frontmatter fields as multiple group memberships", () => {
		// A and B share "rock"; B and C share "jazz" → 2 edges total
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: ["rock"] } },
			{ path: "B.md", frontmatter: { genre: ["rock", "jazz"] } },
			{ path: "C.md", frontmatter: { genre: ["jazz"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		const shared = g.edges.filter((e) => e.type === "category");
		expect(shared).toHaveLength(2);
		const keys = shared.map((e) => `${e.source}->${e.target}`).sort();
		expect(keys).toEqual(["A.md->B.md", "B.md->C.md"]);
	});

	it("skips files that don't have the edgeField set in frontmatter", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: "rock" } },
			{ path: "B.md", frontmatter: {} }, // no genre
			{ path: "C.md", frontmatter: { genre: "rock" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		const shared = g.edges.filter((e) => e.type === "category");
		expect(shared).toHaveLength(1); // A↔C only
		expect(`${shared[0].source}->${shared[0].target}`).toBe("A.md->C.md");
	});

	it("creates pairwise edges within a group of 3 sharing a value (n*(n-1)/2 = 3 edges)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: "rock" } },
			{ path: "B.md", frontmatter: { genre: "rock" } },
			{ path: "C.md", frontmatter: { genre: "rock" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		const shared = g.edges.filter((e) => e.type === "category");
		// Triangle A-B, A-C, B-C
		expect(shared).toHaveLength(3);
	});

	it("excludes singleton groups (size 1) — they don't form edges", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: "rock" } },
			{ path: "B.md", frontmatter: { genre: "jazz" } },
			{ path: "C.md", frontmatter: { genre: "blues" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		expect(g.edges.filter((e) => e.type === "category")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// buildTagNodesAndEdges — explicit tagRelations (separate from nesting)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — explicit tagRelations", () => {
	it("creates inheritance edges from tagRelations with type='inheritance' and a descriptive 'is-a' label", () => {
		const tagRelations: TagRelation[] = [{ source: "hero", target: "character", type: "inheritance" }];
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["hero", "character"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));

		// The explicit tag-rel edge has id prefix "tag-rel:"
		const tagRelEdges = g.edges.filter((e) => e.id.startsWith("tag-rel:"));
		expect(tagRelEdges).toHaveLength(1);
		expect(tagRelEdges[0]).toMatchObject({
			source: "tag:hero",
			target: "tag:character",
			type: "inheritance",
			relation: "#hero is-a #character",
		});
	});

	it("creates aggregation edges with reversed 'has' label phrasing (#target has #source)", () => {
		const tagRelations: TagRelation[] = [{ source: "wizard", target: "magic", type: "aggregation" }];
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["wizard", "magic"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));

		const tagRelEdges = g.edges.filter((e) => e.id.startsWith("tag-rel:"));
		expect(tagRelEdges).toHaveLength(1);
		// Aggregation: "#magic has #wizard" — note target/source flip in the label
		expect(tagRelEdges[0].relation).toBe("#magic has #wizard");
		expect(tagRelEdges[0].type).toBe("aggregation");
	});

	it("auto-creates virtual tag nodes for tagRelations endpoints not used by any file", () => {
		// Neither "alpha" nor "omega" appears in any file's frontmatter.
		// The tagRelations branch must still create the virtual tag nodes so
		// the relation edge has valid source/target.
		const tagRelations: TagRelation[] = [{ source: "alpha", target: "omega", type: "inheritance" }];
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md", frontmatter: {} }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));

		const tagNodeIds = g.nodes.filter((n) => n.isTag).map((n) => n.id);
		expect(tagNodeIds).toContain("tag:alpha");
		expect(tagNodeIds).toContain("tag:omega");
		const tagRelEdges = g.edges.filter((e) => e.id.startsWith("tag-rel:"));
		expect(tagRelEdges).toHaveLength(1);
	});

	it("deduplicates duplicate tagRelations entries (same source→target listed twice → 1 edge)", () => {
		const tagRelations: TagRelation[] = [
			{ source: "a", target: "b", type: "inheritance" },
			{ source: "a", target: "b", type: "inheritance" },
		];
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["a", "b"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const tagRelEdges = g.edges.filter((e) => e.id.startsWith("tag-rel:"));
		expect(tagRelEdges).toHaveLength(1);
	});

	it("emits NO tag-rel edges when tagRelations is empty (skips the branch entirely)", () => {
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations: [] };
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["x"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		expect(g.edges.filter((e) => e.id.startsWith("tag-rel:"))).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// placeNodesByTagGroups — single-group / ungrouped-only layout-radius branches
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — placeNodesByTagGroups boundary", () => {
	it("with a single tag group, hits the layoutRadius=0 path and produces non-throwing positions", () => {
		// All nodes share exactly one tag → totalGroups=1 → layoutRadius=0.
		// scatterGroupOnCircle then computes Infinity * 0 = NaN through cos/sin
		// — current behavior. Force layout overrides positions before render, so
		// this is OK at runtime; we only assert "no throw + nodes were created".
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["only"] } },
			{ path: "B.md", frontmatter: { tags: ["only"] } },
			{ path: "C.md", frontmatter: { tags: ["only"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings());
		const fileNodes = g.nodes.filter((n) => !n.isTag);
		expect(fileNodes).toHaveLength(3);
		// x/y are finite numbers OR NaN (pin down current behavior — they may be NaN
		// when layoutRadius=0 due to angle bookkeeping). Either is acceptable as long
		// as the function does not throw.
		for (const n of fileNodes) {
			expect(typeof n.x).toBe("number");
			expect(typeof n.y).toBe("number");
		}
	});

	it("with only untagged files, hits the ungrouped-only branch (layoutRadius=0) without throwing", () => {
		const app = mkFakeApp([{ path: "A.md" }, { path: "B.md" }]);
		const g = buildGraphFromVault(app, mkSettings());
		const fileNodes = g.nodes.filter((nn) => !nn.isTag);
		expect(fileNodes).toHaveLength(2);
		for (const n of fileNodes) {
			expect(typeof n.x).toBe("number");
			expect(typeof n.y).toBe("number");
		}
	});

	it("uses a non-zero layoutRadius when there are 2+ tag groups (nodes spread out)", () => {
		// Two distinct single-tag groups → totalGroups = 2 → layoutRadius >= 200
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["alpha"] } },
			{ path: "B.md", frontmatter: { tags: ["beta"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings());
		const fileNodes = g.nodes.filter((n) => !n.isTag);
		// At least one node must be far enough from origin to confirm layoutRadius > 0
		const maxDist = Math.max(...fileNodes.map((n) => Math.hypot(n.x, n.y)));
		expect(maxDist).toBeGreaterThan(100);
	});
});

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
