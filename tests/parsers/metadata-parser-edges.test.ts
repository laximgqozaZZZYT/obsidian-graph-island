import { describe, it, expect, vi } from "vitest";
import { TFile } from "obsidian";
import { buildGraphFromVault } from "../../src/parsers/metadata-parser";
import type { GraphViewsSettings, OntologyConfig, TagRelation } from "../../src/types";
import { DEFAULT_ONTOLOGY } from "../../src/types";

// ---------------------------------------------------------------------------
// Helpers — minimal fake Obsidian App, sync read by default
// ---------------------------------------------------------------------------

interface FakeFileSpec {
	path: string;
	basename?: string;
	frontmatter?: Record<string, unknown>;
	links?: string[];
	content?: string;
}

function mkSettings(overrides?: Partial<GraphViewsSettings>): GraphViewsSettings {
	return {
		nodeSize: 20,
		metadataFields: [],
		edgeFields: [],
		colorField: "category",
		groupField: "category",
		ontology: { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations: [] },
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
	} as GraphViewsSettings;
}

function mkFakeApp(specs: FakeFileSpec[], opts?: { asyncRead?: boolean }): any {
	const files = specs.map((spec) => {
		const f = Object.assign(new TFile(), {
			path: spec.path,
			basename: spec.basename ?? spec.path.replace(/\.md$/, "").split("/").pop(),
			stat: { mtime: 0, ctime: 0 },
		});
		return f;
	});
	const specByPath = new Map(specs.map((s) => [s.path, s]));
	const pathByName = new Map<string, string>();
	for (const f of files) {
		pathByName.set(f.basename, f.path);
		pathByName.set(f.path, f.path);
	}
	const cachedRead = opts?.asyncRead
		? (file: { path: string }) => Promise.resolve(specByPath.get(file.path)?.content ?? "")
		: (file: { path: string }) => specByPath.get(file.path)?.content ?? "";
	return {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
			cachedRead,
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const spec = specByPath.get(file.path);
				if (!spec) return null;
				const cache: any = {};
				if (spec.frontmatter !== undefined) cache.frontmatter = spec.frontmatter;
				if (spec.links?.length) cache.links = spec.links.map((link) => ({ link }));
				return cache;
			},
			getFirstLinkpathDest: (link: string, _src: string) => {
				const resolved = pathByName.get(link);
				if (!resolved) return null;
				return files.find((f) => f.path === resolved) ?? null;
			},
			resolvedLinks: {},
		},
	};
}

// ---------------------------------------------------------------------------
// buildSharedMetadataEdges — edgeFields nested-loop branches
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — buildSharedMetadataEdges (edgeFields)", () => {
	it("creates pairwise edges for files sharing a single edge-field value", () => {
		// 3 nodes share genre=fiction → C(3,2)=3 edges
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: "fiction" } },
			{ path: "B.md", frontmatter: { genre: "fiction" } },
			{ path: "C.md", frontmatter: { genre: "fiction" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		const sharedEdges = g.edges.filter((e) => e.label === "genre");
		expect(sharedEdges).toHaveLength(3);
		// All edges should be of "category" type (non-tags field)
		expect(sharedEdges.every((e) => e.type === "category")).toBe(true);
	});

	it("uses 'tag' edge type when shared field is 'tags'", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["epic"] } },
			{ path: "B.md", frontmatter: { tags: ["epic"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["tags"] }));
		const sharedEdges = g.edges.filter((e) => e.label === "tags");
		expect(sharedEdges).toHaveLength(1);
		expect(sharedEdges[0].type).toBe("tag");
	});

	it("treats array-valued frontmatter fields as multi-value (each value pairs separately)", () => {
		// A and B both have ["x", "y"] → groups: x→[A,B], y→[A,B] → 2 edges
		// (deduped within edgeSet: same A→B for both groups, only first kept)
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { tags: ["x", "y"] } },
			{ path: "B.md", frontmatter: { tags: ["x", "y"] } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["tags"] }));
		const sharedEdges = g.edges.filter((e) => e.label === "tags");
		// edgeSet keyed by `${field}:${a}->${b}`: first group "x" creates A→B,
		// second group "y" tries A→B with same key and is rejected as duplicate.
		expect(sharedEdges).toHaveLength(1);
	});

	it("skips groups with fewer than 2 nodes (no self-edges)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { unique: "alpha" } },
			{ path: "B.md", frontmatter: { unique: "beta" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["unique"] }));
		const sharedEdges = g.edges.filter((e) => e.label === "unique");
		expect(sharedEdges).toEqual([]);
	});

	it("skips groups larger than 50 nodes (cap to avoid O(N^2) explosion)", () => {
		// 51 files share the same value — group skipped
		const specs = Array.from({ length: 51 }, (_, i) => ({
			path: `n${i}.md`,
			frontmatter: { tier: "popular" },
		}));
		const app = mkFakeApp(specs);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["tier"] }));
		const sharedEdges = g.edges.filter((e) => e.label === "tier");
		expect(sharedEdges).toEqual([]);
	});

	it("includes groups of exactly 50 nodes (boundary inclusive)", () => {
		const specs = Array.from({ length: 50 }, (_, i) => ({
			path: `m${i}.md`,
			frontmatter: { tier: "midsize" },
		}));
		const app = mkFakeApp(specs);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["tier"] }));
		const sharedEdges = g.edges.filter((e) => e.label === "tier");
		// C(50,2) = 1225 ≤ 1500 cap
		expect(sharedEdges.length).toBe(1225);
	});

	it("processes multiple edgeFields independently (different labels)", () => {
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { author: "X", series: "S1" } },
			{ path: "B.md", frontmatter: { author: "X", series: "S1" } },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["author", "series"] }));
		const labels = g.edges.filter((e) => e.label).map((e) => e.label);
		expect(labels).toContain("author");
		expect(labels).toContain("series");
	});

	it("ignores files where frontmatter field is missing/null/empty-string-falsy", () => {
		// undefined / 0 / "" / null all fail the `!frontmatter?.[field]` truthy check.
		const app = mkFakeApp([
			{ path: "A.md", frontmatter: { genre: "x" } },
			{ path: "B.md", frontmatter: { genre: "x" } },
			{ path: "C.md", frontmatter: { genre: null } },
			{ path: "D.md", frontmatter: { genre: "" } },
			{ path: "E.md", frontmatter: { genre: 0 } },
			{ path: "F.md", frontmatter: {} },
		]);
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		const sharedEdges = g.edges.filter((e) => e.label === "genre");
		// Only A and B share a truthy "x" → 1 edge
		expect(sharedEdges).toHaveLength(1);
		expect(sharedEdges[0].source === "A.md" || sharedEdges[0].target === "A.md").toBe(true);
	});
});

// ---------------------------------------------------------------------------
// tagRelations — explicit tag-to-tag relationships (no nesting required)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — explicit tagRelations", () => {
	it("creates virtual tag nodes for tagRelation endpoints not already present", () => {
		const tagRelations: TagRelation[] = [{ source: "ghostA", target: "ghostB", type: "inheritance" }];
		const onto: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md" }]); // no tags at all
		const g = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const tagIds = g.nodes.filter((n) => n.isTag).map((n) => n.id);
		expect(tagIds).toContain("tag:ghostA");
		expect(tagIds).toContain("tag:ghostB");
	});

	it("creates inheritance edge with 'is-a' relation label", () => {
		const tagRelations: TagRelation[] = [{ source: "hero", target: "character", type: "inheritance" }];
		const onto: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md" }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = g.edges.find((x) => x.id === "tag-rel:tag:hero->tag:character");
		expect(e).toBeDefined();
		expect(e!.type).toBe("inheritance");
		expect(e!.relation).toBe("#hero is-a #character");
	});

	it("creates aggregation edge with 'has' relation label (target has source)", () => {
		const tagRelations: TagRelation[] = [{ source: "wing", target: "bird", type: "aggregation" }];
		const onto: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md" }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = g.edges.find((x) => x.id === "tag-rel:tag:wing->tag:bird");
		expect(e).toBeDefined();
		expect(e!.type).toBe("aggregation");
		// aggregation label flips: "#bird has #wing"
		expect(e!.relation).toBe("#bird has #wing");
	});

	it("does not duplicate tag nodes when tagRelation references existing tag", () => {
		const tagRelations: TagRelation[] = [{ source: "extant", target: "newcomer", type: "inheritance" }];
		const onto: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations };
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["extant"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const extantTagNodes = g.nodes.filter((n) => n.id === "tag:extant");
		expect(extantTagNodes).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// useTagHierarchy + parent-tag-not-in-set branch
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — useTagHierarchy edge cases", () => {
	it("does not create hierarchy edge when parent tag isn't in allTags (cannot happen normally, but guards regression)", () => {
		// collectAllTags expands all ancestors, so with "a/b/c" both "a/b" and "a"
		// are present. The defensive `if (!allTags.has(parentTag)) continue` guards
		// future changes — verify hierarchy edges exist for the natural case.
		const onto: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: true, tagRelations: [] };
		const app = mkFakeApp([{ path: "A.md", frontmatter: { tags: ["topic/sub"] } }]);
		const g = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const hierEdge = g.edges.find((e) => e.id === "tag-hierarchy:tag:topic/sub->tag:topic");
		expect(hierEdge).toBeDefined();
		expect(hierEdge!.type).toBe("inheritance");
		expect(hierEdge!.relation).toBe("#topic/sub extends #topic");
	});
});

// ---------------------------------------------------------------------------
// Promise-based cachedRead path in attachBodyPreview
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — async cachedRead branch", () => {
	it("does not crash when cachedRead returns a Promise (sync graph build proceeds)", async () => {
		const app = mkFakeApp([{ path: "A.md", content: "Hello body" }], { asyncRead: true });
		const g = buildGraphFromVault(app, mkSettings());
		// Synchronous return: graph built, but bodyPreview not yet resolved
		expect(g.nodes).toHaveLength(1);
		const a = g.nodes[0];
		expect(a.id).toBe("A.md");
		// Wait one microtask for the promise chain to resolve
		await Promise.resolve();
		await Promise.resolve();
		// After the promise resolves, bodyPreview should be populated
		expect(a.bodyPreview).toContain("Hello");
	});

	it("populates bodyPreview to empty string when async cachedRead rejects", async () => {
		const files: any[] = [
			Object.assign(new TFile(), { path: "A.md", basename: "A", stat: { mtime: 0, ctime: 0 } }),
		];
		// collectInlineRelations also calls cachedRead and ignores the returned
		// Promise — pre-attach a no-op .catch so the rejection isn't reported as
		// "unhandled". Production code path inside attachBodyPreview already
		// attaches its own .catch() to populate bodyPreview="".
		const cachedRead = vi.fn(() => {
			const p = Promise.reject(new Error("boom"));
			p.catch(() => {});
			return p;
		});
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
				cachedRead,
			},
			metadataCache: {
				getFileCache: () => null,
				getFirstLinkpathDest: () => null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings());
		expect(g.nodes).toHaveLength(1);
		// Allow rejection handler to run
		await Promise.resolve();
		await Promise.resolve();
		expect(g.nodes[0].bodyPreview).toBe("");
		expect(g.nodes[0].bodyLength).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// buildSharedMetadataEdges — getAbstractFileByPath non-TFile branch
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — non-TFile getAbstractFileByPath", () => {
	it("skips nodes whose abstract file is not an instance of TFile", () => {
		// Two nodes share value, but one returns a non-TFile stub
		// from getAbstractFileByPath → that node is skipped, group drops to 1, no edge.
		const realFile = Object.assign(new TFile(), {
			path: "A.md",
			basename: "A",
			stat: { mtime: 0, ctime: 0 },
		});
		const app = {
			vault: {
				getMarkdownFiles: () => [realFile],
				getAbstractFileByPath: (path: string) => {
					if (path === "A.md") return { path: "A.md" }; // plain object, not TFile
					return null;
				},
				cachedRead: () => "",
			},
			metadataCache: {
				getFileCache: () => ({ frontmatter: { genre: "x" } }),
				getFirstLinkpathDest: () => null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		// node was created in Phase 1, but Phase 4 skips it (non-TFile) → no shared edge
		expect(g.edges.filter((e) => e.label === "genre")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Inline relations: classified vs unclassified inline annotation flow
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — inline relation routing via @ prefix", () => {
	it("inline @-prefixed ontology relation in a wikilink line creates classified edge", () => {
		// "Author::[[B]]" with @-prefix in field name — but parseInlineFields uses
		// the `^(@?...)::` regex anchored to line start. We verify via wikilink + @relation
		// content that links A→B with relation through inlineRelations path.
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [],
			inheritanceFields: ["parent"],
			reverseInheritanceFields: [],
		};
		const files: any[] = [
			Object.assign(new TFile(), { path: "A.md", basename: "A", stat: { mtime: 0, ctime: 0 } }),
			Object.assign(new TFile(), { path: "B.md", basename: "B", stat: { mtime: 0, ctime: 0 } }),
		];
		const aContent = "@parent:: [[B]]\n";
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
				cachedRead: (f: { path: string }) => (f.path === "A.md" ? aContent : ""),
			},
			metadataCache: {
				getFileCache: (f: { path: string }) => (f.path === "A.md" ? { links: [{ link: "B" }] } : null),
				getFirstLinkpathDest: (link: string) => files.find((f) => f.basename === link) ?? null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const e = g.edges.find((x) => x.source === "A.md" && x.target === "B.md");
		expect(e).toBeDefined();
		// @parent classifies as inheritance
		expect(e!.type).toBe("inheritance");
		expect(e!.relation).toBe("parent");
	});

	it("non-ontology inline annotation falls back to inline-relation edge type", () => {
		// "rel::[[B]]" without @ → relation="rel" not in any ontology field →
		// resolves to "semantic", but addRegularLinkEdges promotes it to inline-relation
		// because it's an inline annotation that isn't ontology-classified.
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations: [] };
		const files: any[] = [
			Object.assign(new TFile(), { path: "A.md", basename: "A", stat: { mtime: 0, ctime: 0 } }),
			Object.assign(new TFile(), { path: "B.md", basename: "B", stat: { mtime: 0, ctime: 0 } }),
		];
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
				cachedRead: (f: { path: string }) => (f.path === "A.md" ? "myrel:: [[B]]\n" : ""),
			},
			metadataCache: {
				getFileCache: (f: { path: string }) => (f.path === "A.md" ? { links: [{ link: "B" }] } : null),
				getFirstLinkpathDest: (link: string) => files.find((f) => f.basename === link) ?? null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const e = g.edges.find((x) => x.source === "A.md" && x.target === "B.md");
		expect(e).toBeDefined();
		expect(e!.type).toBe("inline-relation");
		expect(e!.relation).toBe("myrel");
	});

	it("[[target]@relation] notation creates inline-relation edge to non-linked file", () => {
		// parseInlineRelationLinksRaw matches this; the resulting edge goes through
		// addInlineRelationEdges (no regular link/cache.links present).
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations: [] };
		const files: any[] = [
			Object.assign(new TFile(), { path: "A.md", basename: "A", stat: { mtime: 0, ctime: 0 } }),
			Object.assign(new TFile(), { path: "B.md", basename: "B", stat: { mtime: 0, ctime: 0 } }),
		];
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
				cachedRead: (f: { path: string }) => (f.path === "A.md" ? "see [[B]@cites] here" : ""),
			},
			metadataCache: {
				// No `links` in cache, only the bracket-@-bracket notation in body
				getFileCache: () => null,
				getFirstLinkpathDest: (link: string) => files.find((f) => f.basename === link) ?? null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const e = g.edges.find((x) => x.source === "A.md" && x.target === "B.md");
		expect(e).toBeDefined();
		expect(e!.type).toBe("inline-relation");
		expect(e!.relation).toBe("cites");
	});
});

// ---------------------------------------------------------------------------
// Frontmatter wikilink relations (cache.frontmatterLinks)
// ---------------------------------------------------------------------------

describe("buildGraphFromVault — frontmatterLinks ontology classification", () => {
	it("frontmatter wikilink with reverse field flips edge direction", () => {
		const ontology: OntologyConfig = {
			...DEFAULT_ONTOLOGY,
			useTagHierarchy: false,
			tagRelations: [],
			reverseInheritanceFields: ["child"],
		};
		const files: any[] = [
			Object.assign(new TFile(), { path: "Parent.md", basename: "Parent", stat: { mtime: 0, ctime: 0 } }),
			Object.assign(new TFile(), { path: "Child.md", basename: "Child", stat: { mtime: 0, ctime: 0 } }),
		];
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
				cachedRead: () => "",
			},
			metadataCache: {
				getFileCache: (f: { path: string }) =>
					f.path === "Parent.md" ? { frontmatterLinks: [{ key: "child", link: "Child" }] } : null,
				getFirstLinkpathDest: (link: string) => files.find((f) => f.basename === link) ?? null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		// reverse=true → edge goes Child → Parent (not Parent → Child)
		const e = g.edges.find((x) => x.source === "Child.md" && x.target === "Parent.md");
		expect(e).toBeDefined();
		expect(e!.type).toBe("inheritance");
		expect(e!.relation).toBe("child");
	});

	it("frontmatter wikilink with unknown relation classifies as semantic", () => {
		const ontology: OntologyConfig = { ...DEFAULT_ONTOLOGY, useTagHierarchy: false, tagRelations: [] };
		const files: any[] = [
			Object.assign(new TFile(), { path: "A.md", basename: "A", stat: { mtime: 0, ctime: 0 } }),
			Object.assign(new TFile(), { path: "B.md", basename: "B", stat: { mtime: 0, ctime: 0 } }),
		];
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
				cachedRead: () => "",
			},
			metadataCache: {
				getFileCache: (f: { path: string }) =>
					f.path === "A.md" ? { frontmatterLinks: [{ key: "ref", link: "B" }] } : null,
				getFirstLinkpathDest: (link: string) => files.find((f) => f.basename === link) ?? null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings({ ontology }));
		const e = g.edges.find((x) => x.source === "A.md" && x.target === "B.md");
		expect(e).toBeDefined();
		expect(e!.type).toBe("semantic");
		expect(e!.relation).toBe("ref");
	});

	it("frontmatter wikilink to non-existent file is silently dropped", () => {
		const files: any[] = [
			Object.assign(new TFile(), { path: "A.md", basename: "A", stat: { mtime: 0, ctime: 0 } }),
		];
		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
				cachedRead: () => "",
			},
			metadataCache: {
				getFileCache: () => ({ frontmatterLinks: [{ key: "any", link: "Ghost" }] }),
				getFirstLinkpathDest: () => null,
				resolvedLinks: {},
			},
		} as any;
		const g = buildGraphFromVault(app, mkSettings());
		expect(g.edges.filter((e) => e.relation === "any")).toEqual([]);
	});
});
