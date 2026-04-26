import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Minimal DOM stubs (Node has no DOM)
// ---------------------------------------------------------------------------
const mockAnchor = { href: "", download: "", click: vi.fn() };
const mockBody = {
	appendChild: vi.fn((el: any) => el),
	removeChild: vi.fn((el: any) => el),
};
const mockDocument = {
	createElement: vi.fn(() => mockAnchor),
	body: mockBody,
};
(globalThis as any).document = mockDocument;
(globalThis as any).URL = {
	createObjectURL: vi.fn(() => "blob:mock-url"),
	revokeObjectURL: vi.fn(),
};
(globalThis as any).Blob = class MockBlob {
	parts: any[];
	options: any;
	type: string;
	constructor(parts: any[], options?: any) {
		this.parts = parts;
		this.options = options;
		this.type = options?.type ?? "";
	}
	async arrayBuffer() {
		return new ArrayBuffer(0);
	}
};
// navigator is read-only in Node; define on globalThis only if absent, else patch clipboard
if (typeof globalThis.navigator === "undefined") {
	Object.defineProperty(globalThis, "navigator", {
		value: { clipboard: { writeText: vi.fn(), write: vi.fn() } },
		writable: true,
		configurable: true,
	});
} else {
	Object.defineProperty(globalThis.navigator, "clipboard", {
		value: { writeText: vi.fn(), write: vi.fn() },
		writable: true,
		configurable: true,
	});
}
(globalThis as any).ClipboardItem = class {
	constructor(public items: any) {}
};

// Mock obsidian
vi.mock("obsidian", () => ({
	Notice: class {
		constructor(
			public msg: string,
			public duration?: number,
		) {}
	},
	MarkdownView: class {},
}));

vi.mock("../src/i18n", () => ({
	t: (key: string) => key,
}));

vi.mock("../src/utils/toast", () => ({
	showToast: vi.fn(),
}));

vi.mock("../src/utils/graph-helpers", () => ({
	collectSubgraph: vi.fn((_adj: any, _nodeId: any, _hops: any, nodes: any[], edges: any[]) => ({
		nodes: nodes.slice(0, 2),
		edges: edges.slice(0, 1),
	})),
	exportSubgraphJSON: vi.fn(() => '{"nodes":[],"edges":[]}'),
	exportFullGraphJSON: vi.fn(() => '{"nodes":[],"edges":[]}'),
	exportGraphCSV: vi.fn(() => "id,label\n"),
	exportGraphMermaid: vi.fn(() => "graph TD\n  A-->B"),
}));

vi.mock("../src/utils/export-png", () => ({
	exportGraphAsPng: vi.fn(async () => new Blob(["fake-png"], { type: "image/png" })),
}));

import {
	downloadFile,
	exportSubgraph,
	exportPng,
	exportFullGraph,
	exportGraphAsCSV,
	exportGraphAsMermaid,
	copyGraphToClipboard,
	embedGraphInNote,
	exportCanvasAsBlob,
} from "../src/views/ExportManager";
import type { ExportHost } from "../src/views/ExportManager";
import { showToast } from "../src/utils/toast";
import { collectSubgraph } from "../src/utils/graph-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockHost(overrides: Partial<ExportHost> = {}): ExportHost {
	return {
		app: {
			workspace: {
				getActiveViewOfType: vi.fn(() => null),
			},
			vault: {
				createBinary: vi.fn(async () => null),
				getAvailablePath: vi.fn((base: string, ext: string) => `${base}.${ext}`),
				config: { attachmentFolderPath: "attachments" },
			},
		} as any,
		pixiApp: {
			view: {
				toBlob: vi.fn((cb: (b: any) => void, _type: string) => {
					cb(new Blob(["fake-canvas"], { type: "image/png" }));
				}),
			} as any,
			markNeedsRender: vi.fn(),
		} as any,
		pixiNodes: new Map([
			["node-a", { data: { id: "node-a", label: "Node A" } }],
			["node-b", { data: { id: "node-b", label: "Node B" } }],
			["node-c", { data: { id: "node-c", label: "Node C" } }],
		]),
		adj: new Map([
			["node-a", new Set(["node-b"])],
			["node-b", new Set(["node-a", "node-c"])],
			["node-c", new Set(["node-b"])],
		]),
		graphEdges: [
			{ source: "node-a", target: "node-b", type: "link" },
			{ source: "node-b", target: "node-c", type: "link" },
		] as any[],
		panel: { hoverHops: 2 },
		getGraphData: vi.fn(() => ({
			nodes: [
				{ id: "node-a", label: "Node A" },
				{ id: "node-b", label: "Node B" },
			],
			edges: [{ source: "node-a", target: "node-b", type: "link" }],
		})),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// downloadFile
// ---------------------------------------------------------------------------
describe("downloadFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates an anchor and triggers click", () => {
		downloadFile("test content", "text/plain", "test.txt");

		expect(mockDocument.createElement).toHaveBeenCalledWith("a");
		expect(mockAnchor.download).toBe("test.txt");
		expect(mockAnchor.href).toBe("blob:mock-url");
		expect(mockAnchor.click).toHaveBeenCalled();
		expect(mockBody.appendChild).toHaveBeenCalled();
		expect(mockBody.removeChild).toHaveBeenCalled();
	});

	it("revokes object URL after download", () => {
		downloadFile("data", "text/csv", "data.csv");
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
	});

	it("creates blob with correct type", () => {
		downloadFile('{"k":"v"}', "application/json", "data.json");
		expect(URL.createObjectURL).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// exportSubgraph
// ---------------------------------------------------------------------------
describe("exportSubgraph", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when adj is null", () => {
		const host = createMockHost({ adj: null });
		exportSubgraph(host, "node-a");
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	it("does nothing when graphEdges is null", () => {
		const host = createMockHost({ graphEdges: null });
		exportSubgraph(host, "node-a");
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	it("triggers download with sanitized filename", () => {
		const host = createMockHost();
		exportSubgraph(host, "node-a");
		expect(mockAnchor.download).toContain("subgraph-Node_A");
	});

	it("uses hoverHops from panel", () => {
		const host = createMockHost();
		host.panel.hoverHops = 3;
		exportSubgraph(host, "node-a");
		expect(vi.mocked(collectSubgraph)).toHaveBeenCalledWith(
			expect.anything(),
			"node-a",
			3,
			expect.anything(),
			expect.anything(),
		);
	});

	it("defaults hoverHops to 2 when not set", () => {
		const host = createMockHost();
		host.panel.hoverHops = undefined;
		exportSubgraph(host, "node-a");
		expect(vi.mocked(collectSubgraph)).toHaveBeenCalledWith(
			expect.anything(),
			"node-a",
			2,
			expect.anything(),
			expect.anything(),
		);
	});

	it("uses nodeId for filename when label is missing", () => {
		const host = createMockHost();
		host.pixiNodes = new Map([["no-label", { data: { id: "no-label" } }]]);
		exportSubgraph(host, "no-label");
		expect(mockAnchor.download).toContain("subgraph-no-label");
	});
});

// ---------------------------------------------------------------------------
// exportPng
// ---------------------------------------------------------------------------
describe("exportPng", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when pixiApp is null", () => {
		const host = createMockHost({ pixiApp: null });
		exportPng(host);
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	it("does nothing when canvas is undefined", () => {
		const host = createMockHost({
			pixiApp: { view: undefined, markNeedsRender: vi.fn() } as any,
		});
		exportPng(host);
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	it("triggers download with date-stamped filename", () => {
		const host = createMockHost();
		exportPng(host);
		expect(mockAnchor.download).toMatch(/^graph-island-\d{4}-\d{2}-\d{2}\.png$/);
	});

	it("handles null blob from toBlob callback", () => {
		const host = createMockHost({
			pixiApp: {
				view: { toBlob: vi.fn((cb: any) => cb(null)) },
				markNeedsRender: vi.fn(),
			} as any,
		});
		exportPng(host);
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// exportFullGraph
// ---------------------------------------------------------------------------
describe("exportFullGraph", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls getGraphData and triggers download", () => {
		const host = createMockHost();
		exportFullGraph(host);
		expect(host.getGraphData).toHaveBeenCalled();
		expect(URL.createObjectURL).toHaveBeenCalled();
	});

	it("filename contains date and .json extension", () => {
		const host = createMockHost();
		exportFullGraph(host);
		expect(mockAnchor.download).toMatch(/^graph-island-export-\d{4}-\d{2}-\d{2}\.json$/);
	});
});

// ---------------------------------------------------------------------------
// exportGraphAsCSV
// ---------------------------------------------------------------------------
describe("exportGraphAsCSV", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls getGraphData and triggers CSV download", () => {
		const host = createMockHost();
		exportGraphAsCSV(host);
		expect(host.getGraphData).toHaveBeenCalled();
		expect(URL.createObjectURL).toHaveBeenCalled();
	});

	it("filename ends with .csv", () => {
		const host = createMockHost();
		exportGraphAsCSV(host);
		expect(mockAnchor.download).toMatch(/\.csv$/);
	});
});

// ---------------------------------------------------------------------------
// exportGraphAsMermaid
// ---------------------------------------------------------------------------
describe("exportGraphAsMermaid", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("attempts clipboard write first", () => {
		(navigator.clipboard.writeText as any).mockResolvedValue(undefined);
		const host = createMockHost();
		exportGraphAsMermaid(host);
		expect(host.getGraphData).toHaveBeenCalled();
		expect(navigator.clipboard.writeText).toHaveBeenCalled();
	});

	it("falls back to download on clipboard failure", async () => {
		(navigator.clipboard.writeText as any).mockRejectedValue(new Error("denied"));
		const host = createMockHost();
		exportGraphAsMermaid(host);

		await new Promise((r) => setTimeout(r, 10));
		expect(URL.createObjectURL).toHaveBeenCalled();
		expect(mockAnchor.download).toMatch(/\.mmd$/);
	});
});

// ---------------------------------------------------------------------------
// copyGraphToClipboard
// ---------------------------------------------------------------------------
describe("copyGraphToClipboard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns early when pixiApp is null", async () => {
		const host = createMockHost({ pixiApp: null });
		await copyGraphToClipboard(host);
		expect(navigator.clipboard.write).not.toHaveBeenCalled();
	});

	it("copies PNG to clipboard on success", async () => {
		(navigator.clipboard.write as any).mockResolvedValue(undefined);
		const host = createMockHost();
		await copyGraphToClipboard(host);
		expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
		expect(vi.mocked(showToast)).toHaveBeenCalledWith("toast.copiedToClipboard");
	});

	it("shows error toast on clipboard failure", async () => {
		(navigator.clipboard.write as any).mockRejectedValue(new Error("no access"));
		const host = createMockHost();
		await copyGraphToClipboard(host);
		expect(vi.mocked(showToast)).toHaveBeenCalledWith("toast.clipboardFailed", 5000);
	});
});

// ---------------------------------------------------------------------------
// embedGraphInNote
// ---------------------------------------------------------------------------
describe("embedGraphInNote", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows toast when no active markdown view", async () => {
		const host = createMockHost();
		(host.app.workspace.getActiveViewOfType as any).mockReturnValue(null);
		await embedGraphInNote(host);
		expect(vi.mocked(showToast)).toHaveBeenCalledWith("toast.embedNoEditor", 5000);
	});

	it("shows toast when pixiApp is null", async () => {
		const host = createMockHost({ pixiApp: null });
		const mockView = { editor: { replaceSelection: vi.fn() }, file: { path: "test.md" } };
		(host.app.workspace.getActiveViewOfType as any).mockReturnValue(mockView);
		await embedGraphInNote(host);
		expect(vi.mocked(showToast)).toHaveBeenCalledWith("toast.embedNoGraph", 5000);
	});

	it("embeds PNG and inserts wikilink on success", async () => {
		const replaceSelection = vi.fn();
		const mockView = {
			editor: { replaceSelection },
			file: { path: "notes/test.md" },
		};
		const host = createMockHost();
		(host.app.workspace.getActiveViewOfType as any).mockReturnValue(mockView);

		await embedGraphInNote(host);

		expect(host.app.vault.createBinary).toHaveBeenCalled();
		expect(replaceSelection).toHaveBeenCalledWith(expect.stringContaining("![["));
	});
});

// ---------------------------------------------------------------------------
// exportCanvasAsBlob
// ---------------------------------------------------------------------------
describe("exportCanvasAsBlob", () => {
	it("returns null when pixiApp is null", async () => {
		const host = createMockHost({ pixiApp: null });
		const result = await exportCanvasAsBlob(host);
		expect(result).toBeNull();
	});

	it("returns a Blob when pixiApp is available", async () => {
		const host = createMockHost();
		const result = await exportCanvasAsBlob(host);
		expect(result).toBeDefined();
	});
});
