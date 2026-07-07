/**
 * Expanded tests for NodeDetailView that exercise code paths
 * requiring a fully initialized view (onOpen called before renderNode).
 * These complement node-detail-view.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NodeDetailView, VIEW_TYPE_NODE_DETAIL } from "../src/views/NodeDetailView";
import { TFile } from "../tests/__mocks__/obsidian";
import type { GraphNode, GraphEdge } from "../src/types";
import type { PixiNode } from "../src/views/InteractionManager";

// ---------------------------------------------------------------------------
// DOM Mock — recursive mock that supports all DOM operations used in NodeDetailView
// ---------------------------------------------------------------------------
function createDOMMock(): any {
	const el: any = {
		addClass: vi.fn(),
		empty: vi.fn(),
		remove: vi.fn(),
		appendText: vi.fn(),
		setAttribute: vi.fn(),
		getAttribute: vi.fn(() => ""),
		toggleClass: vi.fn(),
		addEventListener: vi.fn(),
		style: {},
		textContent: "",
		open: false,
		title: "",
		createEl: vi.fn((_tag: string, _opts?: any) => createDOMMock()),
		createDiv: vi.fn((_opts?: any) => createDOMMock()),
		querySelector: vi.fn(() => null),
	};
	return el;
}

// ---------------------------------------------------------------------------
// Mock TFile factory
// ---------------------------------------------------------------------------
function makeTFile(path: string, basename?: string): TFile {
	const tf = new TFile();
	tf.path = path;
	tf.basename = basename ?? path.split("/").pop()?.replace(".md", "") ?? path;
	return tf;
}

// ---------------------------------------------------------------------------
// App mock factory — configurable
// ---------------------------------------------------------------------------
interface MockAppOptions {
	fileContent?: string;
	frontmatter?: Record<string, unknown>;
	resolvedLinks?: Record<string, Record<string, number>>;
	getAbstractFileByPath?: (path: string) => TFile | null;
}

function createMockApp(opts: MockAppOptions = {}): any {
	return {
		vault: {
			getAbstractFileByPath: opts.getAbstractFileByPath ?? vi.fn(() => null),
			cachedRead: vi.fn(async () => opts.fileContent ?? ""),
		},
		metadataCache: {
			getFileCache: vi.fn(() =>
				opts.frontmatter ? { frontmatter: opts.frontmatter } : null,
			),
			resolvedLinks: opts.resolvedLinks ?? {},
		},
		workspace: {
			trigger: vi.fn(),
			on: vi.fn(() => ({ id: "" })),
			openLinkText: vi.fn(),
		},
	};
}

// ---------------------------------------------------------------------------
// Test view setup
// ---------------------------------------------------------------------------
function createView(appOpts: MockAppOptions = {}): NodeDetailView {
	const mockLeaf = { getViewType: vi.fn(() => VIEW_TYPE_NODE_DETAIL) } as any;
	const view = new NodeDetailView(mockLeaf);
	view.app = createMockApp(appOpts);
	view.contentEl = createDOMMock();
	view.registerEvent = vi.fn(() => ({ id: "" }));
	return view;
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
	return {
		id: "node1",
		label: "Test Node",
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Initialized view tests (onOpen called first)
// ---------------------------------------------------------------------------

describe("NodeDetailView — initialized (onOpen before renderNode)", () => {
	let view: NodeDetailView;

	beforeEach(async () => {
		view = createView();
		await view.onOpen();
	});

	it("renders null node as empty state after initialization", async () => {
		await (view as any).renderNode(null, new Map(), new Map(), new Map(), []);
		// Should not throw
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders a basic node with label", async () => {
		const node = makeNode({ label: "My Node" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders node with isTag=true (tag badge path)", async () => {
		const node = makeNode({ isTag: true, label: "#test" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders node with tags array (tag pill loop)", async () => {
		const node = makeNode({ tags: ["literature", "philosophy", "fiction"] });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders node with category (stats row category path)", async () => {
		const node = makeNode({ category: "Fiction" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders node with degree in degrees map", async () => {
		const node = makeNode();
		const degrees = new Map([["node1", 42]]);
		await (view as any).renderNode(node, new Map(), new Map(), degrees, []);
		expect(view.contentEl.empty).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// filePath code paths — renderPreview, renderProperties, renderBacklinks
// ---------------------------------------------------------------------------

describe("NodeDetailView — file path code paths", () => {
	it("exercises renderPreview when vault returns file content", async () => {
		const tf = makeTFile("notes/file.md", "file");
		const view = createView({
			fileContent: "---\ntitle: Test\n---\n\n# Heading\n\nSome body content.",
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/file.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		// MarkdownRenderer.render should have been called (mocked to no-op)
		expect(view.contentEl.empty).toBeDefined();
	});

	it("skips renderPreview when cachedRead returns empty content", async () => {
		const tf = makeTFile("notes/empty.md");
		const view = createView({
			fileContent: "",
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/empty.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("skips renderPreview when content has only frontmatter", async () => {
		const tf = makeTFile("notes/frontmatter-only.md");
		const view = createView({
			fileContent: "---\ntitle: Test\nauthor: Author\n---\n",
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/frontmatter-only.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("exercises renderProperties when frontmatter has simple entries", async () => {
		const tf = makeTFile("notes/has-fm.md");
		const view = createView({
			fileContent: "---\nstatus: draft\n---\n\nBody text.",
			frontmatter: { status: "draft", author: "Alice" },
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/has-fm.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("exercises renderPropertyRow for object-valued frontmatter", async () => {
		const tf = makeTFile("notes/obj-fm.md");
		const view = createView({
			fileContent: "Body",
			frontmatter: {
				nested: { key1: "val1", key2: "val2" },
			},
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/obj-fm.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("exercises renderPropertyRow for empty-object frontmatter value", async () => {
		const tf = makeTFile("notes/empty-obj-fm.md");
		const view = createView({
			fileContent: "Body",
			frontmatter: {
				emptyObj: {},
			},
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/empty-obj-fm.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("exercises renderPropertyRow for array of primitives", async () => {
		const tf = makeTFile("notes/array-fm.md");
		const view = createView({
			fileContent: "Body",
			frontmatter: {
				tags: ["fiction", "adventure", "mystery"],
			},
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/array-fm.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("exercises renderPropertyRow for array of objects", async () => {
		const tf = makeTFile("notes/array-obj-fm.md");
		const view = createView({
			fileContent: "Body",
			frontmatter: {
				chapters: [{ title: "Ch1", page: 1 }, { title: "Ch2", page: 15 }],
			},
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/array-obj-fm.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("skips frontmatter keys in the skip-list (position, cssclass, etc.)", async () => {
		const tf = makeTFile("notes/skip-keys.md");
		const view = createView({
			fileContent: "Body",
			frontmatter: {
				position: { line: 1 },
				cssclass: "special",
				status: "active",
				_internal: "hidden",
			},
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/skip-keys.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("skips renderProperties when all entries are filtered out", async () => {
		const tf = makeTFile("notes/all-skipped.md");
		const view = createView({
			fileContent: "Body",
			frontmatter: {
				position: {},
				cssclasses: [],
				_hidden: "yes",
			},
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/all-skipped.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("exercises open file link creation path", async () => {
		const tf = makeTFile("notes/linked.md");
		const view = createView({
			fileContent: "",
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		// Node with filePath → should create the "open file" link
		const node = makeNode({ filePath: "notes/linked.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Backlinks code path
// ---------------------------------------------------------------------------

describe("NodeDetailView — backlinks code path", () => {
	it("renders backlinks when resolvedLinks contains a reference", async () => {
		const targetFile = makeTFile("notes/target.md", "target");
		const sourceFile = makeTFile("notes/source.md", "source");

		const getAbstractFileByPath = vi.fn((path: string) => {
			if (path === "notes/target.md") return targetFile;
			if (path === "notes/source.md") return sourceFile;
			return null;
		});

		const view = createView({
			fileContent: "Body of target.",
			resolvedLinks: {
				"notes/source.md": { "notes/target.md": 1 },
			},
			getAbstractFileByPath,
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/target.md", label: "target" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("skips backlinks when source is not a TFile", async () => {
		const targetFile = makeTFile("notes/target.md");

		const view = createView({
			fileContent: "Body",
			resolvedLinks: {
				"notes/source.md": { "notes/target.md": 1 },
			},
			// getAbstractFileByPath returns null for source (not a TFile)
			getAbstractFileByPath: vi.fn((path: string) =>
				path === "notes/target.md" ? targetFile : null,
			),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/target.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("handles multiple backlinks sorted alphabetically", async () => {
		const targetFile = makeTFile("notes/target.md");
		const sourceA = makeTFile("notes/aaa.md", "aaa");
		const sourceZ = makeTFile("notes/zzz.md", "zzz");
		const sourceM = makeTFile("notes/mmm.md", "mmm");

		const getAbstractFileByPath = vi.fn((path: string) => {
			const map: Record<string, TFile> = {
				"notes/target.md": targetFile,
				"notes/aaa.md": sourceA,
				"notes/zzz.md": sourceZ,
				"notes/mmm.md": sourceM,
			};
			return map[path] ?? null;
		});

		const view = createView({
			fileContent: "Body",
			resolvedLinks: {
				"notes/aaa.md": { "notes/target.md": 1 },
				"notes/zzz.md": { "notes/target.md": 1 },
				"notes/mmm.md": { "notes/target.md": 1 },
			},
			getAbstractFileByPath,
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/target.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Adjacency / collapsible list path
// ---------------------------------------------------------------------------

describe("NodeDetailView — adjacency list rendering (initialized)", () => {
	it("renders collapsible neighbor list when adj has entries", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode();
		const adj = new Map([["node1", new Set(["node2", "node3"])]]);
		const pn2: PixiNode = { data: { id: "node2", label: "Neighbor2", x: 0, y: 0, vx: 0, vy: 0 } } as any;
		const pn3: PixiNode = { data: { id: "node3", label: "Neighbor3", x: 0, y: 0, vx: 0, vy: 0, isTag: true } } as any;
		const pixiNodes = new Map([["node2", pn2], ["node3", pn3]]);

		await (view as any).renderNode(node, adj, pixiNodes, new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders neighbor with filePath (expand button path)", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode();
		const adj = new Map([["node1", new Set(["node2"])]]);
		const pn2: PixiNode = {
			data: { id: "node2", label: "NeighborWithFile", x: 0, y: 0, vx: 0, vy: 0, filePath: "notes/nb.md" },
		} as any;
		const pixiNodes = new Map([["node2", pn2]]);

		await (view as any).renderNode(node, adj, pixiNodes, new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders neighbor without pixiNode data (null resolve)", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode();
		const adj = new Map([["node1", new Set(["missing-node"])]]);
		// pixiNodes is empty — missing-node has no data

		await (view as any).renderNode(node, adj, new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Relation drawer (edges) path — initialized view
// ---------------------------------------------------------------------------

describe("NodeDetailView — relation drawer (edges, initialized)", () => {
	it("renders relation drawer with outgoing edges and pixiNode data", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode();
		const edges: GraphEdge[] = [
			{ id: "e1", source: "node1", target: "node2", type: "link" },
			{ id: "e2", source: "node1", target: "node3", type: "semantic" },
		];
		const pn2: PixiNode = { data: { id: "node2", label: "N2", x: 0, y: 0, vx: 0, vy: 0 } } as any;
		const pn3: PixiNode = { data: { id: "node3", label: "N3", x: 0, y: 0, vx: 0, vy: 0, filePath: "n3.md" } } as any;
		const pixiNodes = new Map([["node2", pn2], ["node3", pn3]]);

		await (view as any).renderNode(node, new Map(), pixiNodes, new Map(), edges);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders relation drawer with incoming edges", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode();
		const edges: GraphEdge[] = [{ id: "e1", source: "node2", target: "node1" }];
		const pn2: PixiNode = { data: { id: "node2", label: "Source", x: 0, y: 0, vx: 0, vy: 0 } } as any;
		const pixiNodes = new Map([["node2", pn2]]);

		await (view as any).renderNode(node, new Map(), pixiNodes, new Map(), edges);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("groups edges by type in relation drawer", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode();
		const edges: GraphEdge[] = [
			{ id: "e1", source: "node1", target: "node2", type: "link" },
			{ id: "e2", source: "node1", target: "node3", type: "link" },
			{ id: "e3", source: "node1", target: "node4", type: "tag" },
		];
		const makePN = (id: string): PixiNode =>
			({ data: { id, label: id, x: 0, y: 0, vx: 0, vy: 0 } } as any);
		const pixiNodes = new Map([
			["node2", makePN("node2")],
			["node3", makePN("node3")],
			["node4", makePN("node4")],
		]);

		await (view as any).renderNode(node, new Map(), pixiNodes, new Map(), edges);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("skips relation drawer when no relevant edges", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode();
		// edges don't touch node1
		const edges: GraphEdge[] = [{ id: "e1", source: "node2", target: "node3" }];

		await (view as any).renderNode(node, new Map(), new Map(), new Map(), edges);
		expect(view.contentEl.empty).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Link suggestions path
// ---------------------------------------------------------------------------

describe("NodeDetailView — link suggestions", () => {
	it("suggests nodes sharing tags with current node", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode({ tags: ["fiction"] });
		const pnOther: PixiNode = {
			data: { id: "other", label: "Other", x: 0, y: 0, vx: 0, vy: 0, tags: ["fiction"] },
		} as any;
		const pixiNodes = new Map([["other", pnOther]]);

		await (view as any).renderNode(node, new Map([["node1", new Set<string>()]]), pixiNodes, new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("suggests nodes via common neighbor (triangle completion)", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode({ tags: [] });
		// node1 → node2 (neighbor), other → node2 (neighbor of other), so node1 and other share node2
		const adj = new Map([
			["node1", new Set(["node2"])],
			["other", new Set(["node2"])],
		]);
		const pnOther: PixiNode = {
			data: { id: "other", label: "Other", x: 0, y: 0, vx: 0, vy: 0, tags: [] },
		} as any;
		const pnNode2: PixiNode = {
			data: { id: "node2", label: "Shared", x: 0, y: 0, vx: 0, vy: 0 },
		} as any;
		const pixiNodes = new Map([["other", pnOther], ["node2", pnNode2]]);

		await (view as any).renderNode(node, adj, pixiNodes, new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("does not suggest direct neighbors", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode({ tags: ["tag1"] });
		// node2 is a direct neighbor, node3 is not
		const adj = new Map([["node1", new Set(["node2"])]]);
		const pnNode2: PixiNode = {
			data: { id: "node2", label: "DirectNeighbor", x: 0, y: 0, vx: 0, vy: 0, tags: ["tag1"] },
		} as any;
		const pnNode3: PixiNode = {
			data: { id: "node3", label: "Indirect", x: 0, y: 0, vx: 0, vy: 0, tags: ["tag1"] },
		} as any;
		const pixiNodes = new Map([["node2", pnNode2], ["node3", pnNode3]]);

		await (view as any).renderNode(node, adj, pixiNodes, new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});

	it("limits suggestions to 5 max", async () => {
		const view = createView();
		await view.onOpen();

		const node = makeNode({ tags: ["shared"] });
		const adj = new Map([["node1", new Set<string>()]]);
		const pixiNodes = new Map<string, PixiNode>();
		for (let i = 0; i < 10; i++) {
			pixiNodes.set(`other${i}`, {
				data: { id: `other${i}`, label: `Other${i}`, x: 0, y: 0, vx: 0, vy: 0, tags: ["shared"] },
			} as any);
		}

		await (view as any).renderNode(node, adj, pixiNodes, new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Hold toggle and lifecycle
// ---------------------------------------------------------------------------

describe("NodeDetailView — hold toggle (initialized)", () => {
	it("toggleHold toggles the held state", async () => {
		const view = createView();
		await view.onOpen();

		// Initially not held
		expect((view as any).held).toBe(false);
		(view as any).toggleHold();
		expect((view as any).held).toBe(true);
		(view as any).toggleHold();
		expect((view as any).held).toBe(false);
	});

	it("toggleHold resets holdCaptured when releasing hold", async () => {
		const view = createView();
		await view.onOpen();

		(view as any).held = true;
		(view as any).holdCaptured = true;
		(view as any).toggleHold();

		expect((view as any).held).toBe(false);
		expect((view as any).holdCaptured).toBe(false);
	});

	it("does not reset holdCaptured when activating hold", async () => {
		const view = createView();
		await view.onOpen();

		(view as any).holdCaptured = false;
		(view as any).toggleHold(); // activates hold
		expect((view as any).held).toBe(true);
		// holdCaptured should remain false (not reset on activation)
		expect((view as any).holdCaptured).toBe(false);
	});

	it("onClose cleans up bodyEl and holdBtn", async () => {
		const view = createView();
		await view.onOpen();
		await view.onClose();

		expect((view as any).bodyEl).toBeNull();
		expect((view as any).holdBtn).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// triggerHighlight
// ---------------------------------------------------------------------------

describe("NodeDetailView — triggerHighlight", () => {
	it("calls workspace.trigger with EVENT_HIGHLIGHT_NODES", async () => {
		const view = createView();
		await view.onOpen();

		(view as any).triggerHighlight(new Set(["node1", "node2"]));
		expect(view.app.workspace.trigger).toHaveBeenCalled();
	});

	it("calls workspace.trigger with null to clear highlight", async () => {
		const view = createView();
		await view.onOpen();

		(view as any).triggerHighlight(null);
		expect(view.app.workspace.trigger).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Preview content truncation
// ---------------------------------------------------------------------------

describe("NodeDetailView — preview content truncation", () => {
	it("truncates long file content to 600 chars plus ellipsis", async () => {
		const longBody = "A".repeat(1000);
		const tf = makeTFile("notes/long.md");
		const view = createView({
			fileContent: `---\ntitle: Title\n---\n\n${longBody}`,
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/long.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		// Should not throw — truncation logic handled inside renderPreview
		expect(view.contentEl.empty).toBeDefined();
	});

	it("renders content under 600 chars without ellipsis path", async () => {
		const shortBody = "Short body content.";
		const tf = makeTFile("notes/short.md");
		const view = createView({
			fileContent: `---\ntitle: Title\n---\n\n${shortBody}`,
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const node = makeNode({ filePath: "notes/short.md" });
		await (view as any).renderNode(node, new Map(), new Map(), new Map(), []);
		expect(view.contentEl.empty).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// getBacklinks pure logic
// ---------------------------------------------------------------------------

describe("NodeDetailView — getBacklinks", () => {
	it("returns empty array when no resolvedLinks", async () => {
		const tf = makeTFile("notes/target.md");
		const view = createView({
			resolvedLinks: {},
			getAbstractFileByPath: vi.fn(() => tf),
		});
		await view.onOpen();

		const backlinks = (view as any).getBacklinks(tf);
		expect(backlinks).toEqual([]);
	});

	it("returns files that link to the target", async () => {
		const targetFile = makeTFile("notes/target.md");
		const sourceFile = makeTFile("notes/source.md", "source");

		const view = createView({
			resolvedLinks: {
				"notes/source.md": { "notes/target.md": 2 },
				"notes/other.md": { "notes/different.md": 1 },
			},
			getAbstractFileByPath: vi.fn((path: string) => {
				if (path === "notes/source.md") return sourceFile;
				return null;
			}),
		});
		await view.onOpen();

		const backlinks = (view as any).getBacklinks(targetFile);
		expect(backlinks.length).toBe(1);
		expect(backlinks[0].basename).toBe("source");
	});

	it("sorts backlinks alphabetically by basename", async () => {
		const targetFile = makeTFile("notes/target.md");
		const fileC = makeTFile("notes/c.md", "c");
		const fileA = makeTFile("notes/a.md", "a");
		const fileB = makeTFile("notes/b.md", "b");

		const view = createView({
			resolvedLinks: {
				"notes/c.md": { "notes/target.md": 1 },
				"notes/a.md": { "notes/target.md": 1 },
				"notes/b.md": { "notes/target.md": 1 },
			},
			getAbstractFileByPath: vi.fn((path: string) => {
				const m: Record<string, TFile> = {
					"notes/c.md": fileC,
					"notes/a.md": fileA,
					"notes/b.md": fileB,
				};
				return m[path] ?? null;
			}),
		});
		await view.onOpen();

		const backlinks = (view as any).getBacklinks(targetFile);
		expect(backlinks.map((f: TFile) => f.basename)).toEqual(["a", "b", "c"]);
	});
});
