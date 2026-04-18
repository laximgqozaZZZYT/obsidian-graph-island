import { describe, it, expect } from "vitest";
import {
	buildSvgExportArgs,
	buildPngExportArgs,
	buildPresetJson,
	safeExport,
} from "../../../src/views/export/ExportOrchestrator";
import type { GraphNode, GraphEdge } from "../../../src/types";

function node(id: string, x = 0, y = 0): GraphNode {
	return { id, label: id, x, y, vx: 0, vy: 0 };
}
function edge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target, type: "link" };
}

describe("buildSvgExportArgs", () => {
	it("merges graph + settings + viewState into exportGraphSVG-ready args", () => {
		const graph = {
			nodes: [node("a", 0, 0), node("b", 100, 100)],
			edges: [edge("a", "b")],
		};
		const settings = { nodeSize: 7, edgeAlpha: 0.5, background: "#111" };
		const viewState = { width: 640, height: 480, showLabels: false };

		const args = buildSvgExportArgs(graph, settings, viewState);

		expect(args.nodes).toBe(graph.nodes);
		expect(args.edges).toBe(graph.edges);
		expect(args.options).toEqual({
			width: 640,
			height: 480,
			background: "#111",
			nodeRadius: 7,
			showLabels: false,
			edgeAlpha: 0.5,
		});
	});

	it("viewState.background overrides settings.background, defaults fill the rest", () => {
		const args = buildSvgExportArgs(
			{ nodes: [], edges: [] },
			{ background: "#aaa" },
			{ background: "#zzz" },
		);

		expect(args.options.background).toBe("#zzz");
		expect(args.options.width).toBeGreaterThan(0);
		expect(args.options.height).toBeGreaterThan(0);
		expect(args.options.showLabels).toBe(true);
		expect(args.options.nodeRadius).toBeGreaterThan(0);
	});

	it("preserves falsy-but-valid values (empty string background, showLabels=false)", () => {
		const args = buildSvgExportArgs(
			{ nodes: [], edges: [] },
			{ showLabels: false },
			{ background: "" },
		);

		expect(args.options.background).toBe("");
		expect(args.options.showLabels).toBe(false);
	});
});

describe("buildPngExportArgs", () => {
	it("derives width/height/scale from canvas + settings", () => {
		const canvas = { width: 800, height: 600 };
		const args = buildPngExportArgs(canvas, { scale: 2, background: "#222" });

		expect(args).toEqual({
			width: 1600,
			height: 1200,
			background: "#222",
			scale: 2,
		});
	});

	it("falls back to scale=1 for non-positive or missing scale, and clamps 0-dim canvas", () => {
		const zeroCanvas = { width: 0, height: 0 };
		const noScale = buildPngExportArgs(zeroCanvas, {});
		const zeroScale = buildPngExportArgs({ width: 400, height: 300 }, { scale: 0 });
		const negScale = buildPngExportArgs({ width: 400, height: 300 }, { scale: -5 });

		expect(noScale.scale).toBe(1);
		expect(noScale.width).toBe(1);
		expect(noScale.height).toBe(1);
		expect(zeroScale.scale).toBe(1);
		expect(zeroScale.width).toBe(400);
		expect(negScale.scale).toBe(1);
		expect(negScale.background).toBe("");
	});
});

describe("buildPresetJson", () => {
	it("produces deterministic key order with 2-space indentation and metadata suffix", () => {
		const settings = { zoom: 1.5, nodeSize: 20 };
		const viewState = { searchQuery: "foo", showLabels: true };
		const metadata = { version: "0.5.6", exportedAt: "2026-04-19T00:00:00Z" };

		const json = buildPresetJson(settings, viewState, metadata);
		const parsed = JSON.parse(json);

		expect(Object.keys(parsed)).toEqual([
			"nodeSize",
			"zoom",
			"searchQuery",
			"showLabels",
			"_version",
			"_exportedAt",
		]);
		expect(parsed._version).toBe("0.5.6");
		expect(parsed._exportedAt).toBe("2026-04-19T00:00:00Z");
		expect(json).toContain("\n  ");
		expect(json).toContain('"nodeSize": 20');
	});

	it("converts Set values to sorted arrays and skips duplicate keys in viewState", () => {
		const settings = { tags: new Set(["b", "a", "c"]), shared: "from-settings" };
		const viewState = { shared: "from-viewState", extra: 42 };

		const json = buildPresetJson(settings, viewState);
		const parsed = JSON.parse(json);

		expect(parsed.tags).toEqual(["a", "b", "c"]);
		expect(parsed.shared).toBe("from-settings");
		expect(parsed.extra).toBe(42);
		expect("_version" in parsed).toBe(false);
		expect("_exportedAt" in parsed).toBe(false);
	});
});

describe("safeExport", () => {
	it("returns { ok: true, data } when the export function succeeds", () => {
		const result = safeExport(() => "<svg></svg>");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe("<svg></svg>");
		}
	});

	it("returns { ok: false, error } when the export function throws", () => {
		const boom = new Error("serialisation failed");
		const result = safeExport(() => {
			throw boom;
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe(boom);
			expect(result.error.message).toBe("serialisation failed");
		}
	});

	it("wraps non-Error throwables into an Error instance", () => {
		const result = safeExport(() => {
			throw "plain string failure";
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error.message).toBe("plain string failure");
		}
	});
});
