import { describe, it, expect } from "vitest";
import {
	DEFAULT_SVG_EXPORT_OPTIONS,
	resolveSvgExportOptions,
	buildExportTimestamp,
	buildExportFilename,
	resolveExportCounts,
} from "../../../src/views/export-orchestrator";

describe("resolveSvgExportOptions", () => {
	it("returns a fresh copy of defaults when overrides are undefined", () => {
		const resolved = resolveSvgExportOptions(undefined);
		expect(resolved).toEqual(DEFAULT_SVG_EXPORT_OPTIONS);
		expect(resolved).not.toBe(DEFAULT_SVG_EXPORT_OPTIONS);
	});

	it("returns a fresh copy of defaults when overrides are omitted", () => {
		const resolved = resolveSvgExportOptions();
		expect(resolved).toEqual(DEFAULT_SVG_EXPORT_OPTIONS);
		expect(resolved).not.toBe(DEFAULT_SVG_EXPORT_OPTIONS);
	});

	it("merges partial overrides on top of defaults", () => {
		const resolved = resolveSvgExportOptions({ width: 100, height: 200 });
		expect(resolved.width).toBe(100);
		expect(resolved.height).toBe(200);
		expect(resolved.background).toBe(DEFAULT_SVG_EXPORT_OPTIONS.background);
		expect(resolved.nodeRadius).toBe(DEFAULT_SVG_EXPORT_OPTIONS.nodeRadius);
		expect(resolved.showLabels).toBe(DEFAULT_SVG_EXPORT_OPTIONS.showLabels);
		expect(resolved.edgeAlpha).toBe(DEFAULT_SVG_EXPORT_OPTIONS.edgeAlpha);
	});

	it("preserves showLabels=false (falsy-but-valid)", () => {
		const resolved = resolveSvgExportOptions({ showLabels: false });
		expect(resolved.showLabels).toBe(false);
	});

	it("preserves background='' (empty string — transparent background)", () => {
		const resolved = resolveSvgExportOptions({ background: "" });
		expect(resolved.background).toBe("");
	});

	it("preserves edgeAlpha=0 (fully transparent)", () => {
		const resolved = resolveSvgExportOptions({ edgeAlpha: 0 });
		expect(resolved.edgeAlpha).toBe(0);
	});

	it("preserves width=0 and height=0 (degenerate canvas)", () => {
		const resolved = resolveSvgExportOptions({ width: 0, height: 0 });
		expect(resolved.width).toBe(0);
		expect(resolved.height).toBe(0);
	});

	it("applies all six overrides at once", () => {
		const resolved = resolveSvgExportOptions({
			width: 512,
			height: 384,
			background: "#fff",
			nodeRadius: 10,
			showLabels: false,
			edgeAlpha: 0.9,
		});
		expect(resolved).toEqual({
			width: 512,
			height: 384,
			background: "#fff",
			nodeRadius: 10,
			showLabels: false,
			edgeAlpha: 0.9,
		});
	});

	it("does not mutate the DEFAULT_SVG_EXPORT_OPTIONS constant", () => {
		const before = { ...DEFAULT_SVG_EXPORT_OPTIONS };
		resolveSvgExportOptions({ width: 9999, height: 8888 });
		expect(DEFAULT_SVG_EXPORT_OPTIONS).toEqual(before);
	});
});

describe("buildExportTimestamp", () => {
	it("formats a specific Date as YYYY-MM-DD (UTC)", () => {
		const d = new Date("2026-04-24T12:34:56.789Z");
		expect(buildExportTimestamp(d)).toBe("2026-04-24");
	});

	it("uses UTC, so late-UTC-night inputs do not roll back a day", () => {
		const d = new Date("2026-01-01T23:59:59.999Z");
		expect(buildExportTimestamp(d)).toBe("2026-01-01");
	});

	it("pads single-digit month and day with zeros", () => {
		const d = new Date(Date.UTC(2026, 0, 3, 0, 0, 0));
		expect(buildExportTimestamp(d)).toBe("2026-01-03");
	});

	it("defaults to the current date when no argument is provided", () => {
		const stamp = buildExportTimestamp();
		expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("returns exactly 10 characters", () => {
		expect(buildExportTimestamp(new Date("2026-04-24T00:00:00Z"))).toHaveLength(10);
	});
});

describe("buildExportFilename", () => {
	const FIXED_DATE = new Date("2026-04-24T00:00:00Z");

	it("builds `graph-island-<kind>-<date>.<ext>` for typical inputs", () => {
		expect(buildExportFilename("graph", "svg", FIXED_DATE)).toBe("graph-island-graph-2026-04-24.svg");
	});

	it("drops the kind segment when kind is empty", () => {
		expect(buildExportFilename("", "png", FIXED_DATE)).toBe("graph-island-2026-04-24.png");
	});

	it("strips a leading dot from the extension", () => {
		expect(buildExportFilename("export", ".json", FIXED_DATE)).toBe("graph-island-export-2026-04-24.json");
	});

	it("sanitises unsafe characters from kind", () => {
		expect(buildExportFilename("my graph/preset?", "json", FIXED_DATE)).toBe(
			"graph-island-mygraphpreset-2026-04-24.json",
		);
	});

	it("sanitises unsafe characters from ext", () => {
		expect(buildExportFilename("x", "sv g!", FIXED_DATE)).toBe("graph-island-x-2026-04-24.svg");
	});

	it("falls back to 'bin' when the extension sanitises away to empty", () => {
		expect(buildExportFilename("x", "!!!", FIXED_DATE)).toBe("graph-island-x-2026-04-24.bin");
	});

	it("drops the kind segment when kind sanitises away to empty", () => {
		expect(buildExportFilename("???", "svg", FIXED_DATE)).toBe("graph-island-2026-04-24.svg");
	});

	it("preserves underscores and hyphens in kind/ext", () => {
		expect(buildExportFilename("snap_shot-v2", "tar_gz", FIXED_DATE)).toBe(
			"graph-island-snap_shot-v2-2026-04-24.tar_gz",
		);
	});

	it("is deterministic for the same (kind, ext, date) triple", () => {
		const a = buildExportFilename("graph", "svg", FIXED_DATE);
		const b = buildExportFilename("graph", "svg", FIXED_DATE);
		expect(a).toBe(b);
	});

	it("includes the UTC date derived from the supplied Date", () => {
		const d = new Date("2027-12-31T23:59:59Z");
		expect(buildExportFilename("graph", "svg", d)).toContain("2027-12-31");
	});

	it("defaults the date argument to 'now' (produces a YYYY-MM-DD segment)", () => {
		const name = buildExportFilename("graph", "svg");
		expect(name).toMatch(/^graph-island-graph-\d{4}-\d{2}-\d{2}\.svg$/);
	});
});

describe("resolveExportCounts", () => {
	it("returns empty=true when there are no nodes", () => {
		const counts = resolveExportCounts([], []);
		expect(counts).toEqual({ nodeCount: 0, edgeCount: 0, empty: true });
	});

	it("returns empty=true even when edges exist but nodes are empty", () => {
		const counts = resolveExportCounts([], [{ id: "e1" }]);
		expect(counts.empty).toBe(true);
		expect(counts.nodeCount).toBe(0);
		expect(counts.edgeCount).toBe(1);
	});

	it("returns empty=false when at least one node exists", () => {
		const counts = resolveExportCounts([{ id: "n1" }], []);
		expect(counts).toEqual({ nodeCount: 1, edgeCount: 0, empty: false });
	});

	it("counts both arrays accurately for larger inputs", () => {
		const nodes = new Array(100).fill({ id: "n" });
		const edges = new Array(42).fill({ id: "e" });
		const counts = resolveExportCounts(nodes, edges);
		expect(counts).toEqual({ nodeCount: 100, edgeCount: 42, empty: false });
	});

	it("treats any node as making empty=false (even if it's shaped oddly)", () => {
		const counts = resolveExportCounts([null as unknown], []);
		expect(counts.empty).toBe(false);
	});
});
