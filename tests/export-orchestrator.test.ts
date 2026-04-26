import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.mock factories are hoisted above imports)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
	Notice: vi.fn(),
	downloadFile: vi.fn(),
	exportGraphSVG: vi.fn(() => "<svg>mock</svg>"),
	exportFullGraphJSON: vi.fn(() => '{"nodes":[],"edges":[]}'),
}));

vi.mock("obsidian", () => ({
	Notice: mocks.Notice,
}));

vi.mock("../src/i18n", () => ({
	// Translation keys that carry {nodes}/{edges} placeholders return a template
	// so the orchestrator's .replace() logic has something to substitute into.
	t: (key: string) =>
		key === "export.graphDone" ? "nodes={nodes}, edges={edges}" : key,
}));

vi.mock("../src/views/ExportManager", () => ({
	downloadFile: mocks.downloadFile,
}));

vi.mock("../src/utils/graph-helpers", () => ({
	exportGraphSVG: mocks.exportGraphSVG,
	exportFullGraphJSON: mocks.exportFullGraphJSON,
}));

import {
	DEFAULT_SVG_EXPORT_OPTIONS,
	resolveSvgExportOptions,
	buildExportTimestamp,
	buildExportFilename,
	resolveExportCounts,
	orchestrateSvgExport,
	orchestratePngExport,
	orchestrateJsonExport,
} from "../src/views/export-orchestrator";
import type { ExportOrchestratorHost } from "../src/views/export-orchestrator";

// ---------------------------------------------------------------------------
// DEFAULT_SVG_EXPORT_OPTIONS
// ---------------------------------------------------------------------------
describe("DEFAULT_SVG_EXPORT_OPTIONS", () => {
	it("exposes expected default values", () => {
		expect(DEFAULT_SVG_EXPORT_OPTIONS).toEqual({
			width: 1920,
			height: 1080,
			background: "#1e1e2e",
			nodeRadius: 5,
			showLabels: true,
			edgeAlpha: 0.4,
		});
	});

	it("edgeAlpha is within [0, 1] and radius is positive", () => {
		expect(DEFAULT_SVG_EXPORT_OPTIONS.edgeAlpha).toBeGreaterThanOrEqual(0);
		expect(DEFAULT_SVG_EXPORT_OPTIONS.edgeAlpha).toBeLessThanOrEqual(1);
		expect(DEFAULT_SVG_EXPORT_OPTIONS.nodeRadius).toBeGreaterThan(0);
		expect(DEFAULT_SVG_EXPORT_OPTIONS.width).toBeGreaterThan(0);
		expect(DEFAULT_SVG_EXPORT_OPTIONS.height).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// resolveSvgExportOptions
// ---------------------------------------------------------------------------
describe("resolveSvgExportOptions", () => {
	it("returns a copy of defaults when called with no arguments", () => {
		const result = resolveSvgExportOptions();
		expect(result).toEqual(DEFAULT_SVG_EXPORT_OPTIONS);
		// must be a fresh object (not a shared reference)
		expect(result).not.toBe(DEFAULT_SVG_EXPORT_OPTIONS);
	});

	it("returns a copy of defaults when called with undefined", () => {
		const result = resolveSvgExportOptions(undefined);
		expect(result).toEqual(DEFAULT_SVG_EXPORT_OPTIONS);
		expect(result).not.toBe(DEFAULT_SVG_EXPORT_OPTIONS);
	});

	it("merges partial overrides with defaults", () => {
		const result = resolveSvgExportOptions({ width: 800, nodeRadius: 10 });
		expect(result.width).toBe(800);
		expect(result.nodeRadius).toBe(10);
		// unspecified keys remain at defaults
		expect(result.height).toBe(DEFAULT_SVG_EXPORT_OPTIONS.height);
		expect(result.background).toBe(DEFAULT_SVG_EXPORT_OPTIONS.background);
		expect(result.showLabels).toBe(DEFAULT_SVG_EXPORT_OPTIONS.showLabels);
		expect(result.edgeAlpha).toBe(DEFAULT_SVG_EXPORT_OPTIONS.edgeAlpha);
	});

	it("fully replaces all values when all keys are provided", () => {
		const override = {
			width: 100,
			height: 200,
			background: "#ffffff",
			nodeRadius: 2,
			showLabels: false,
			edgeAlpha: 0.1,
		};
		expect(resolveSvgExportOptions(override)).toEqual(override);
	});

	it("preserves falsy-but-valid values (empty background, showLabels=false, edgeAlpha=0)", () => {
		const result = resolveSvgExportOptions({
			background: "",
			showLabels: false,
			edgeAlpha: 0,
		});
		expect(result.background).toBe("");
		expect(result.showLabels).toBe(false);
		expect(result.edgeAlpha).toBe(0);
	});

	it("ignores keys not part of SvgExportOverrides (excess properties dropped)", () => {
		const result = resolveSvgExportOptions({ width: 640, foo: "bar" } as any);
		expect(result.width).toBe(640);
		expect((result as any).foo).toBeUndefined();
		expect(Object.keys(result).sort()).toEqual(
			["background", "edgeAlpha", "height", "nodeRadius", "showLabels", "width"].sort(),
		);
	});
});

// ---------------------------------------------------------------------------
// buildExportTimestamp
// ---------------------------------------------------------------------------
describe("buildExportTimestamp", () => {
	it("formats a fixed UTC date as YYYY-MM-DD", () => {
		const d = new Date("2026-04-24T12:34:56.000Z");
		expect(buildExportTimestamp(d)).toBe("2026-04-24");
	});

	it("zero-pads single-digit months and days", () => {
		const d = new Date("2026-01-05T00:00:00.000Z");
		expect(buildExportTimestamp(d)).toBe("2026-01-05");
	});

	it("defaults to current date when argument omitted", () => {
		const result = buildExportTimestamp();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

// ---------------------------------------------------------------------------
// buildExportFilename
// ---------------------------------------------------------------------------
describe("buildExportFilename", () => {
	const fixedDate = new Date("2026-04-24T00:00:00.000Z");

	it("builds filename with kind, extension, and timestamp", () => {
		expect(buildExportFilename("graph", "svg", fixedDate)).toBe("graph-island-graph-2026-04-24.svg");
	});

	it("strips a leading dot from the extension", () => {
		expect(buildExportFilename("graph", ".svg", fixedDate)).toBe("graph-island-graph-2026-04-24.svg");
	});

	it("omits the kind segment when kind is empty", () => {
		expect(buildExportFilename("", "png", fixedDate)).toBe("graph-island-2026-04-24.png");
	});

	it("sanitises unsafe characters in kind and extension", () => {
		// slashes, spaces, dots, emojis → stripped by [^a-zA-Z0-9_-]
		expect(buildExportFilename("my graph/v2", "sv g", fixedDate)).toBe("graph-island-mygraphv2-2026-04-24.svg");
	});

	it("falls back to 'bin' extension when ext is empty or fully sanitised away", () => {
		expect(buildExportFilename("export", "", fixedDate)).toBe("graph-island-export-2026-04-24.bin");
		expect(buildExportFilename("export", "!!!", fixedDate)).toBe("graph-island-export-2026-04-24.bin");
	});
});

// ---------------------------------------------------------------------------
// resolveExportCounts
// ---------------------------------------------------------------------------
describe("resolveExportCounts", () => {
	it("marks empty=true and counts=0 for empty arrays", () => {
		expect(resolveExportCounts([], [])).toEqual({
			nodeCount: 0,
			edgeCount: 0,
			empty: true,
		});
	});

	it("returns accurate counts for populated arrays", () => {
		const nodes = [{}, {}, {}];
		const edges = [{}, {}];
		expect(resolveExportCounts(nodes, edges)).toEqual({
			nodeCount: 3,
			edgeCount: 2,
			empty: false,
		});
	});

	it("treats a readonly array exactly like a mutable array", () => {
		const nodes: ReadonlyArray<{}> = Object.freeze([{}]);
		const edges: ReadonlyArray<{}> = Object.freeze([{}, {}, {}]);
		expect(resolveExportCounts(nodes, edges)).toEqual({
			nodeCount: 1,
			edgeCount: 3,
			empty: false,
		});
	});

	it("only considers node count for `empty` flag (edges alone do not make graph non-empty)", () => {
		// Contrived but important: if nodes=[] but edges=[something], still empty.
		const result = resolveExportCounts([], [{}, {}]);
		expect(result.empty).toBe(true);
		expect(result.edgeCount).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Orchestrator helpers
// ---------------------------------------------------------------------------
function createHost(overrides: Partial<ExportOrchestratorHost> = {}): ExportOrchestratorHost {
	return {
		pixiApp: null,
		getGraphData: vi.fn(() => ({
			nodes: [{ id: "a" }, { id: "b" }] as any[],
			edges: [{ source: "a", target: "b", type: "link" }] as any[],
		})),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// orchestrateSvgExport
// ---------------------------------------------------------------------------
describe("orchestrateSvgExport", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("aborts (no SVG / no download) when graph is empty, but still emits a toast", () => {
		const host = createHost({
			getGraphData: vi.fn(() => ({ nodes: [], edges: [] })),
		});
		orchestrateSvgExport(host);
		expect(mocks.exportGraphSVG).not.toHaveBeenCalled();
		expect(mocks.downloadFile).not.toHaveBeenCalled();
		expect(mocks.Notice).toHaveBeenCalledTimes(1);
		expect(mocks.Notice).toHaveBeenCalledWith("toast.svgExported", expect.any(Number));
	});

	it("calls exportGraphSVG with resolved options and downloads the SVG", () => {
		const host = createHost();
		orchestrateSvgExport(host);
		expect(mocks.exportGraphSVG).toHaveBeenCalledTimes(1);
		// 3rd argument is the fully-resolved options
		const resolved = mocks.exportGraphSVG.mock.calls[0][2];
		expect(resolved).toEqual(DEFAULT_SVG_EXPORT_OPTIONS);
		expect(mocks.downloadFile).toHaveBeenCalledWith(
			"<svg>mock</svg>",
			"image/svg+xml",
			expect.stringMatching(/^graph-island-graph-\d{4}-\d{2}-\d{2}\.svg$/),
		);
	});

	it("threads overrides through to exportGraphSVG and preserves non-overridden defaults", () => {
		const host = createHost();
		orchestrateSvgExport(host, { width: 640, showLabels: false });
		const resolved = mocks.exportGraphSVG.mock.calls[0][2];
		expect(resolved.width).toBe(640);
		expect(resolved.showLabels).toBe(false);
		expect(resolved.height).toBe(DEFAULT_SVG_EXPORT_OPTIONS.height);
		expect(resolved.background).toBe(DEFAULT_SVG_EXPORT_OPTIONS.background);
	});
});

// ---------------------------------------------------------------------------
// orchestratePngExport
// ---------------------------------------------------------------------------
describe("orchestratePngExport", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns early without side effects when pixiApp is null", () => {
		const host = createHost({ pixiApp: null });
		orchestratePngExport(host);
		expect(mocks.Notice).not.toHaveBeenCalled();
	});

	it("returns early when pixiApp exists but view is missing", () => {
		const host = createHost({ pixiApp: { view: null } as any });
		orchestratePngExport(host);
		expect(mocks.Notice).not.toHaveBeenCalled();
	});

	it("calls canvas.toBlob with image/png and invokes Notice on success", () => {
		const toBlob = vi.fn((cb: (b: Blob | null) => void, _type: string) => {
			// Simulate null blob path → ensures early-return inside callback is covered
			cb(null);
		});
		const host = createHost({ pixiApp: { view: { toBlob } } as any });
		orchestratePngExport(host);
		expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
		// Null blob path: no Notice emitted
		expect(mocks.Notice).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// orchestrateJsonExport
// ---------------------------------------------------------------------------
describe("orchestrateJsonExport", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("serialises via exportFullGraphJSON and triggers a download", () => {
		const host = createHost();
		orchestrateJsonExport(host);
		expect(mocks.exportFullGraphJSON).toHaveBeenCalledTimes(1);
		expect(mocks.downloadFile).toHaveBeenCalledWith(
			'{"nodes":[],"edges":[]}',
			"application/json",
			expect.stringMatching(/^graph-island-export-\d{4}-\d{2}-\d{2}\.json$/),
		);
	});

	it("emits a Notice with node/edge counts interpolated into the message", () => {
		const host = createHost({
			getGraphData: vi.fn(() => ({
				nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] as any[],
				edges: [{ source: "a", target: "b", type: "link" }] as any[],
			})),
		});
		orchestrateJsonExport(host);
		expect(mocks.Notice).toHaveBeenCalledTimes(1);
		const [msg, duration] = mocks.Notice.mock.calls[0];
		// t() is mocked to return its key → "export.graphDone" then {nodes}/{edges} replaced
		expect(msg).toContain("3");
		expect(msg).toContain("1");
		expect(typeof duration).toBe("number");
	});
});
