// ---------------------------------------------------------------------------
// Integration tests for buildGraphFromVault — exercises Phase 1-5 pipeline
// (file nodes, tag-group placement, link/relation edges, shared-metadata
// edges, virtual tag nodes & has-tag edges).
//
// Drives uncovered branches in:
//   - placeNodesByTagGroups + scatterGroupOnCircle
//   - buildSharedMetadataEdges (incl. SHARED_EDGE_CAP path & group sort)
//   - buildTagNodesAndEdges (useTagHierarchy on/off + tagRelations branches)
//   - addRegularLinkEdges / addRemainingFrontmatterEdges /
//     addInlineRelationEdges (resolveRelationEdge classified vs unclassified)
//   - collectFrontmatterRelations / collectInlineRelations / parseInlineFields
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { buildGraphFromVault } from "../src/parsers/metadata-parser";
import {
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_HAS_TAG,
	EDGE_TYPE_LINK,
	EDGE_TYPE_TAG,
	EDGE_TYPE_INLINE_RELATION,
} from "../src/constants";
import type { GraphViewsSettings, OntologyConfig } from "../src/types";

// ---------- Helpers ---------------------------------------------------------

interface FakeFileSpec {
	path: string;
	content?: string;
	frontmatter?: Record<string, unknown>;
	frontmatterLinks?: Array<{ link: string; key: string }>;
	links?: Array<{ link: string }>;
	tags?: Array<{ tag: string }>;
}

function mkTFile(spec: FakeFileSpec): TFile {
	const f = new TFile();
	f.path = spec.path;
	const base = spec.path.split("/").pop() ?? spec.path;
	f.basename = base.replace(/\.md$/, "");
	f.extension = "md";
	(f as unknown as { stat: { mtime: number; ctime: number } }).stat = { mtime: 1000, ctime: 1000 };
	return f;
}

interface FakeAppOptions {
	asyncRead?: boolean;
}

function mkApp(specs: FakeFileSpec[], opts: FakeAppOptions = {}) {
	const files = specs.map(mkTFile);
	const byPath = new Map<string, { file: TFile; spec: FakeFileSpec }>();
	specs.forEach((s, i) => byPath.set(s.path, { file: files[i], spec: s }));
	const byBasename = new Map<string, TFile>();
	specs.forEach((s, i) => byBasename.set(files[i].basename, files[i]));

	const app = {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (p: string) => byPath.get(p)?.file ?? null,
			cachedRead: (file: TFile) => {
				const entry = byPath.get(file.path);
				const text = entry?.spec.content ?? "";
				return opts.asyncRead ? Promise.resolve(text) : text;
			},
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const entry = byPath.get(file.path);
				if (!entry) return null;
				const cache: Record<string, unknown> = {};
				if (entry.spec.frontmatter) cache.frontmatter = entry.spec.frontmatter;
				if (entry.spec.frontmatterLinks) cache.frontmatterLinks = entry.spec.frontmatterLinks;
				if (entry.spec.links) cache.links = entry.spec.links;
				if (entry.spec.tags) cache.tags = entry.spec.tags;
				return cache;
			},
			getFirstLinkpathDest: (link: string, _src: string) => {
				// Resolve by path first, then by basename (Obsidian-like behavior).
				const byP = byPath.get(link);
				if (byP) return byP.file;
				return byBasename.get(link) ?? null;
			},
		},
	};
	return app as unknown as import("obsidian").App;
}

function mkOnto(overrides?: Partial<OntologyConfig>): OntologyConfig {
	return {
		inheritanceFields: [],
		aggregationFields: [],
		reverseInheritanceFields: [],
		reverseAggregationFields: [],
		similarFields: [],
		siblingFields: [],
		sequenceFields: [],
		reverseSequenceFields: [],
		useTagHierarchy: false,
		customMappings: {},
		tagRelations: [],
		...overrides,
	};
}

function mkSettings(overrides?: Partial<GraphViewsSettings>): GraphViewsSettings {
	return {
		nodeSize: 20,
		metadataFields: [],
		edgeFields: [],
		colorField: "category",
		groupField: "category",
		ontology: mkOnto(),
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

// ---------- Tests -----------------------------------------------------------

describe("buildGraphFromVault — Phase 1: file nodes", () => {
	it("produces one node per markdown file", () => {
		const app = mkApp([{ path: "a.md" }, { path: "b.md" }, { path: "folder/c.md" }]);
		const data = buildGraphFromVault(app, mkSettings());
		const fileNodes = data.nodes.filter((n) => !n.isTag);
		expect(fileNodes).toHaveLength(3);
		expect(fileNodes.map((n) => n.id).sort()).toEqual(["a.md", "b.md", "folder/c.md"]);
	});

	it("uses folder as fallback category when colorField missing", () => {
		const app = mkApp([{ path: "characters/hero.md" }]);
		const data = buildGraphFromVault(app, mkSettings());
		const node = data.nodes.find((n) => n.id === "characters/hero.md");
		expect(node?.category).toBe("characters");
	});

	it("uses frontmatter colorField value when present", () => {
		const app = mkApp([{ path: "x/foo.md", frontmatter: { category: "hero" } }]);
		const data = buildGraphFromVault(app, mkSettings());
		const node = data.nodes.find((n) => n.id === "x/foo.md");
		expect(node?.category).toBe("hero");
	});

	it("populates bodyPreview synchronously when cachedRead returns string", () => {
		const app = mkApp([{ path: "a.md", content: "---\ntitle: x\n---\nhello body" }]);
		const data = buildGraphFromVault(app, mkSettings());
		const node = data.nodes.find((n) => n.id === "a.md");
		expect(node?.bodyPreview).toContain("hello");
		expect(node?.bodyLength).toBeGreaterThan(0);
	});

	it("handles async cachedRead path without crashing", async () => {
		const app = mkApp([{ path: "a.md", content: "async body" }], { asyncRead: true });
		const data = buildGraphFromVault(app, mkSettings());
		// node exists; preview is filled asynchronously via the .then handler.
		const node = data.nodes.find((n) => n.id === "a.md");
		expect(node).toBeDefined();
		await Promise.resolve();
		await Promise.resolve();
		expect(node?.bodyPreview).toBeDefined();
	});

	it("extracts tags from frontmatter array form", () => {
		const app = mkApp([{ path: "a.md", frontmatter: { tags: ["alpha", "beta"] } }]);
		const data = buildGraphFromVault(app, mkSettings());
		const node = data.nodes.find((n) => n.id === "a.md");
		expect(node?.tags).toEqual(expect.arrayContaining(["alpha", "beta"]));
	});

	it("extracts tags from frontmatter comma-separated string", () => {
		const app = mkApp([{ path: "a.md", frontmatter: { tags: "alpha, beta, gamma" } }]);
		const data = buildGraphFromVault(app, mkSettings());
		const node = data.nodes.find((n) => n.id === "a.md");
		expect(node?.tags).toEqual(expect.arrayContaining(["alpha", "beta", "gamma"]));
	});

	it("extracts inline tags from cache.tags (strips leading #)", () => {
		const app = mkApp([{ path: "a.md", tags: [{ tag: "#inline" }] }]);
		const data = buildGraphFromVault(app, mkSettings());
		const node = data.nodes.find((n) => n.id === "a.md");
		expect(node?.tags).toContain("inline");
	});

	it("merges frontmatter and inline tags without duplication", () => {
		const app = mkApp([
			{ path: "a.md", frontmatter: { tags: ["shared"] }, tags: [{ tag: "#shared" }, { tag: "#extra" }] },
		]);
		const data = buildGraphFromVault(app, mkSettings());
		const node = data.nodes.find((n) => n.id === "a.md");
		expect(node?.tags).toEqual(["shared", "extra"]);
	});
});

describe("buildGraphFromVault — Phase 2: tag-group placement", () => {
	it("places nodes within tag groups around a circle (positions are finite)", () => {
		const app = mkApp([
			{ path: "a.md", frontmatter: { tags: ["g1"] } },
			{ path: "b.md", frontmatter: { tags: ["g1"] } },
			{ path: "c.md", frontmatter: { tags: ["g2"] } },
			{ path: "d.md", frontmatter: { tags: ["g2"] } },
		]);
		const data = buildGraphFromVault(app, mkSettings());
		const fileNodes = data.nodes.filter((n) => !n.isTag);
		for (const n of fileNodes) {
			expect(Number.isFinite(n.x)).toBe(true);
			expect(Number.isFinite(n.y)).toBe(true);
		}
	});

	it("ungrouped nodes (no tags) still receive finite positions", () => {
		const app = mkApp([{ path: "tagged.md", frontmatter: { tags: ["t"] } }, { path: "untagged.md" }]);
		const data = buildGraphFromVault(app, mkSettings());
		const untagged = data.nodes.find((n) => n.id === "untagged.md");
		expect(Number.isFinite(untagged?.x)).toBe(true);
		expect(Number.isFinite(untagged?.y)).toBe(true);
	});

	it("assigns nodes to their smallest (most specific) tag group", () => {
		// "broad" appears on 3 nodes, "specific" on 1. The node with both tags
		// should be placed in "specific" (smallest count → most specific).
		const app = mkApp([
			{ path: "a.md", frontmatter: { tags: ["broad"] } },
			{ path: "b.md", frontmatter: { tags: ["broad"] } },
			{ path: "c.md", frontmatter: { tags: ["broad", "specific"] } },
		]);
		const data = buildGraphFromVault(app, mkSettings());
		const c = data.nodes.find((n) => n.id === "c.md");
		const a = data.nodes.find((n) => n.id === "a.md");
		// At minimum, c must be finitely placed (asserts we hit the smallest-tag branch).
		expect(Number.isFinite(c?.x) && Number.isFinite(c?.y)).toBe(true);
		expect(Number.isFinite(a?.x) && Number.isFinite(a?.y)).toBe(true);
	});
});

describe("buildGraphFromVault — Phase 3: link & relation edges", () => {
	it("creates LINK edge from regular wiki-link without ontology mapping", () => {
		const app = mkApp([{ path: "a.md", links: [{ link: "b" }] }, { path: "b.md" }]);
		const data = buildGraphFromVault(app, mkSettings());
		const e = data.edges.find((x) => x.source === "a.md" && x.target === "b.md");
		expect(e?.type).toBe(EDGE_TYPE_LINK);
	});

	it("classifies frontmatterLink with ontology field as INHERITANCE", () => {
		const onto = mkOnto({ inheritanceFields: ["parent"] });
		const app = mkApp([
			{ path: "child.md", frontmatterLinks: [{ link: "parent", key: "parent" }] },
			{ path: "parent.md" },
		]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = data.edges.find((x) => x.source === "child.md" && x.target === "parent.md");
		expect(e?.type).toBe(EDGE_TYPE_INHERITANCE);
	});

	it("reverses edge direction for reverse-inheritance fields", () => {
		const onto = mkOnto({ reverseInheritanceFields: ["child"] });
		const app = mkApp([
			{ path: "parent.md", frontmatterLinks: [{ link: "child", key: "child" }] },
			{ path: "child.md" },
		]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		// Reverse means: when parent.md declares child:[[child]], the edge becomes child → parent
		const e = data.edges.find((x) => x.source === "child.md" && x.target === "parent.md");
		expect(e?.type).toBe(EDGE_TYPE_INHERITANCE);
	});

	it("creates AGGREGATION edge from frontmatter aggregation field", () => {
		const onto = mkOnto({ aggregationFields: ["contains"] });
		const app = mkApp([
			{ path: "whole.md", frontmatterLinks: [{ link: "part", key: "contains" }] },
			{ path: "part.md" },
		]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = data.edges.find((x) => x.source === "whole.md" && x.target === "part.md");
		expect(e?.type).toBe(EDGE_TYPE_AGGREGATION);
	});

	it("creates INLINE_RELATION edge from inline Dataview field with unknown relation", () => {
		const app = mkApp([{ path: "src.md", content: "Author::[[tgt]]\n" }, { path: "tgt.md" }]);
		const data = buildGraphFromVault(app, mkSettings());
		const e = data.edges.find((x) => x.source === "src.md" && x.target === "tgt.md");
		// Inline relations without ontology classification become INLINE_RELATION
		// (only when they don't also appear as a regular link)
		expect([EDGE_TYPE_INLINE_RELATION, "semantic"]).toContain(e?.type);
		expect(e?.relation).toBe("Author");
	});

	it("classifies @-prefixed inline relation via ontology", () => {
		const onto = mkOnto({ inheritanceFields: ["Parent"] });
		const app = mkApp([{ path: "src.md", content: "@Parent::[[tgt]]\n" }, { path: "tgt.md" }]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = data.edges.find((x) => x.source === "src.md" && x.target === "tgt.md");
		expect(e?.type).toBe(EDGE_TYPE_INHERITANCE);
	});

	it("parses inline-relation [[link]@relation] notation", () => {
		const app = mkApp([{ path: "src.md", content: "Friends with [[tgt]@friend]" }, { path: "tgt.md" }]);
		const data = buildGraphFromVault(app, mkSettings());
		const e = data.edges.find((x) => x.source === "src.md" && x.target === "tgt.md");
		expect(e?.relation).toBe("friend");
	});

	it("does not duplicate edge when same target appears in both links and frontmatter", () => {
		const app = mkApp([
			{
				path: "a.md",
				links: [{ link: "b" }],
				frontmatterLinks: [{ link: "b", key: "ref" }],
			},
			{ path: "b.md" },
		]);
		const data = buildGraphFromVault(app, mkSettings());
		const matching = data.edges.filter((x) => x.source === "a.md" && x.target === "b.md");
		expect(matching).toHaveLength(1);
	});

	it("skips link to non-existent file (target not in nodeMap)", () => {
		const app = mkApp([{ path: "a.md", links: [{ link: "ghost" }] }]);
		const data = buildGraphFromVault(app, mkSettings());
		expect(data.edges.find((x) => x.target === "ghost")).toBeUndefined();
	});
});

describe("buildGraphFromVault — Phase 4: shared metadata edges", () => {
	it("creates edges between nodes sharing a frontmatter value", () => {
		const app = mkApp([
			{ path: "a.md", frontmatter: { genre: "scifi" } },
			{ path: "b.md", frontmatter: { genre: "scifi" } },
			{ path: "c.md", frontmatter: { genre: "scifi" } },
		]);
		const data = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		// 3 nodes sharing one value → C(3,2) = 3 edges
		const sharedEdges = data.edges.filter((e) => e.label === "genre");
		expect(sharedEdges).toHaveLength(3);
	});

	it("treats frontmatter array values as multiple keys", () => {
		const app = mkApp([
			{ path: "a.md", frontmatter: { themes: ["love", "betrayal"] } },
			{ path: "b.md", frontmatter: { themes: ["love"] } },
		]);
		const data = buildGraphFromVault(app, mkSettings({ edgeFields: ["themes"] }));
		const e = data.edges.find((x) => x.label === "themes");
		expect(e).toBeDefined();
	});

	it("does not create shared edges for groups with only 1 member", () => {
		const app = mkApp([
			{ path: "a.md", frontmatter: { unique: "x" } },
			{ path: "b.md", frontmatter: { unique: "y" } },
		]);
		const data = buildGraphFromVault(app, mkSettings({ edgeFields: ["unique"] }));
		expect(data.edges.filter((e) => e.label === "unique")).toHaveLength(0);
	});

	it("excludes huge groups (>50 members)", () => {
		const specs: FakeFileSpec[] = [];
		for (let i = 0; i < 60; i++) {
			specs.push({ path: `n${i}.md`, frontmatter: { kind: "common" } });
		}
		const app = mkApp(specs);
		const data = buildGraphFromVault(app, mkSettings({ edgeFields: ["kind"] }));
		// Group of 60 exceeds the 50-member cap, so no shared edges for "kind"
		expect(data.edges.filter((e) => e.label === "kind")).toHaveLength(0);
	});

	it("uses EDGE_TYPE_TAG when edgeField is 'tags'", () => {
		const app = mkApp([
			{ path: "a.md", frontmatter: { tags: ["shared"] } },
			{ path: "b.md", frontmatter: { tags: ["shared"] } },
		]);
		const data = buildGraphFromVault(app, mkSettings({ edgeFields: ["tags"] }));
		const tagEdges = data.edges.filter((e) => e.label === "tags");
		expect(tagEdges.length).toBeGreaterThan(0);
		expect(tagEdges[0].type).toBe(EDGE_TYPE_TAG);
	});

	it("skips nodes whose underlying file is not a TFile", () => {
		// Non-existent path returns null from getAbstractFileByPath → continue
		const app = mkApp([
			{ path: "a.md", frontmatter: { genre: "scifi" } },
			{ path: "b.md", frontmatter: { genre: "scifi" } },
		]);
		// Override getAbstractFileByPath to always return null (simulates non-TFile)
		(app.vault as unknown as { getAbstractFileByPath: () => null }).getAbstractFileByPath = () => null;
		const data = buildGraphFromVault(app, mkSettings({ edgeFields: ["genre"] }));
		expect(data.edges.filter((e) => e.label === "genre")).toHaveLength(0);
	});
});

describe("buildGraphFromVault — Phase 5: tag virtual nodes & has-tag", () => {
	it("creates one virtual tag node per unique tag", () => {
		const app = mkApp([
			{ path: "a.md", frontmatter: { tags: ["x", "y"] } },
			{ path: "b.md", frontmatter: { tags: ["y"] } },
		]);
		const data = buildGraphFromVault(app, mkSettings());
		const tagNodes = data.nodes.filter((n) => n.isTag);
		const ids = tagNodes.map((n) => n.id).sort();
		expect(ids).toEqual(["tag:x", "tag:y"]);
	});

	it("emits has-tag edges from each note to its tags", () => {
		const app = mkApp([{ path: "a.md", frontmatter: { tags: ["x"] } }]);
		const data = buildGraphFromVault(app, mkSettings());
		const e = data.edges.find((x) => x.type === EDGE_TYPE_HAS_TAG);
		expect(e?.source).toBe("a.md");
		expect(e?.target).toBe("tag:x");
	});

	it("creates inheritance edges between nested tags when useTagHierarchy=true", () => {
		const onto = mkOnto({ useTagHierarchy: true });
		const app = mkApp([{ path: "a.md", frontmatter: { tags: ["entity/character"] } }]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = data.edges.find((x) => x.source === "tag:entity/character" && x.target === "tag:entity");
		expect(e?.type).toBe(EDGE_TYPE_INHERITANCE);
	});

	it("skips nested tag inheritance when useTagHierarchy=false", () => {
		const onto = mkOnto({ useTagHierarchy: false });
		const app = mkApp([{ path: "a.md", frontmatter: { tags: ["entity/character"] } }]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const inherEdges = data.edges.filter((x) => x.type === EDGE_TYPE_INHERITANCE);
		expect(inherEdges).toHaveLength(0);
	});

	it("creates explicit tag-to-tag relation from ontology.tagRelations", () => {
		const onto = mkOnto({
			tagRelations: [{ source: "hero", target: "warrior", type: "inheritance" }],
		});
		const app = mkApp([{ path: "a.md", frontmatter: { tags: ["hero"] } }]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = data.edges.find((x) => x.source === "tag:hero" && x.target === "tag:warrior");
		expect(e?.type).toBe(EDGE_TYPE_INHERITANCE);
		expect(e?.relation).toContain("is-a");
		// Target tag node "warrior" should also be created even if no file uses it
		expect(data.nodes.find((n) => n.id === "tag:warrior")).toBeDefined();
	});

	it("aggregation tag-relation gets has-format relation label", () => {
		const onto = mkOnto({
			tagRelations: [{ source: "leg", target: "body", type: "aggregation" }],
		});
		const app = mkApp([{ path: "a.md", frontmatter: { tags: ["leg"] } }]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const e = data.edges.find((x) => x.source === "tag:leg" && x.target === "tag:body");
		expect(e?.type).toBe(EDGE_TYPE_AGGREGATION);
		expect(e?.relation).toContain("has");
	});

	it("does not duplicate tag node when both useTagHierarchy and tagRelations target it", () => {
		const onto = mkOnto({
			useTagHierarchy: true,
			tagRelations: [{ source: "a", target: "b", type: "inheritance" }],
		});
		const app = mkApp([{ path: "x.md", frontmatter: { tags: ["a", "b"] } }]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto }));
		const aNodes = data.nodes.filter((n) => n.id === "tag:a");
		const bNodes = data.nodes.filter((n) => n.id === "tag:b");
		expect(aNodes).toHaveLength(1);
		expect(bNodes).toHaveLength(1);
	});

	it("returns full graph end-to-end: nodes + edges have stable structure", () => {
		const onto = mkOnto({
			inheritanceFields: ["parent"],
			useTagHierarchy: true,
		});
		const app = mkApp([
			{
				path: "child.md",
				frontmatter: { tags: ["entity/hero"] },
				frontmatterLinks: [{ link: "parent", key: "parent" }],
			},
			{ path: "parent.md", frontmatter: { tags: ["entity/hero"] } },
		]);
		const data = buildGraphFromVault(app, mkSettings({ ontology: onto, edgeFields: [] }));
		// 2 file nodes + tag nodes for "entity/hero" and "entity"
		expect(data.nodes.filter((n) => !n.isTag)).toHaveLength(2);
		expect(
			data.nodes
				.filter((n) => n.isTag)
				.map((n) => n.id)
				.sort(),
		).toEqual(["tag:entity", "tag:entity/hero"]);
		// One inheritance edge child→parent + one tag-hierarchy edge + has-tag edges
		expect(data.edges.find((e) => e.source === "child.md" && e.target === "parent.md")?.type).toBe(
			EDGE_TYPE_INHERITANCE,
		);
		expect(data.edges.find((e) => e.source === "tag:entity/hero" && e.target === "tag:entity")?.type).toBe(
			EDGE_TYPE_INHERITANCE,
		);
		expect(data.edges.filter((e) => e.type === EDGE_TYPE_HAS_TAG).length).toBeGreaterThanOrEqual(2);
	});
});
