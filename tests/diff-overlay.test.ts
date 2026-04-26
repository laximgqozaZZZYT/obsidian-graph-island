import { describe, it, expect, vi } from "vitest";
import {
	DiffOverlay,
	layoutGhostNodes,
	ghostLabel,
	formatDelta,
	formatSnapshotDate,
	buildTimelineEntries,
} from "../src/views/DiffOverlay";
import type { SnapshotDiff } from "../src/types";

// ---------------------------------------------------------------------------
// Helper: create a minimal SnapshotDiff
// ---------------------------------------------------------------------------
function makeDiff(
	opts: Partial<{
		addedNodeIds: string[];
		removedNodes: Array<{ id: string; metaHash: string }>;
		changedNodeIds: string[];
		addedEdgeKeys: string[];
		removedEdges: Array<{ source: string; target: string; type: string }>;
	}> = {},
): SnapshotDiff {
	return {
		addedNodeIds: new Set(opts.addedNodeIds ?? []),
		removedNodes: opts.removedNodes ?? [],
		changedNodeIds: new Set(opts.changedNodeIds ?? []),
		addedEdgeKeys: new Set(opts.addedEdgeKeys ?? []),
		removedEdges: opts.removedEdges ?? [],
	};
}

// ---------------------------------------------------------------------------
// DiffOverlay class — state management
// ---------------------------------------------------------------------------
describe("DiffOverlay", () => {
	it("starts inactive", () => {
		const overlay = new DiffOverlay();
		expect(overlay.isActive()).toBe(false);
		expect(overlay.getSummary()).toBeNull();
	});

	it("activate / deactivate lifecycle", () => {
		const overlay = new DiffOverlay();
		const diff = makeDiff({ addedNodeIds: ["a", "b"], removedNodes: [{ id: "c", metaHash: "" }] });
		overlay.activate(diff, "test-snap");

		expect(overlay.isActive()).toBe(true);

		const summary = overlay.getSummary();
		expect(summary).not.toBeNull();
		expect(summary!.name).toBe("test-snap");
		expect(summary!.added).toBe(2);
		expect(summary!.removed).toBe(1);
		expect(summary!.changed).toBe(0);

		overlay.deactivate();
		expect(overlay.isActive()).toBe(false);
		expect(overlay.getSummary()).toBeNull();
	});

	it("getSummary counts all diff categories", () => {
		const overlay = new DiffOverlay();
		const diff = makeDiff({
			addedNodeIds: ["a"],
			removedNodes: [
				{ id: "b", metaHash: "x" },
				{ id: "c", metaHash: "y" },
			],
			changedNodeIds: ["d", "e", "f"],
		});
		overlay.activate(diff, "snap-2");

		const s = overlay.getSummary()!;
		expect(s.added).toBe(1);
		expect(s.removed).toBe(2);
		expect(s.changed).toBe(3);
	});

	it("re-activate replaces previous diff", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "first");
		overlay.activate(makeDiff({ addedNodeIds: ["x", "y"] }), "second");

		expect(overlay.getSummary()!.name).toBe("second");
		expect(overlay.getSummary()!.added).toBe(2);
	});

	it("activate with empty diff", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff(), "empty");
		expect(overlay.isActive()).toBe(true);
		const s = overlay.getSummary()!;
		expect(s.added).toBe(0);
		expect(s.removed).toBe(0);
		expect(s.changed).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// layoutGhostNodes — grid layout pure function
// ---------------------------------------------------------------------------
describe("layoutGhostNodes", () => {
	const viewport = { width: 1000, height: 800 };

	it("returns empty array for 0 nodes", () => {
		expect(layoutGhostNodes(0, viewport)).toEqual([]);
	});

	it("returns empty array for negative count", () => {
		expect(layoutGhostNodes(-5, viewport)).toEqual([]);
	});

	it("positions single node at bottom-right corner", () => {
		const pos = layoutGhostNodes(1, viewport);
		expect(pos).toHaveLength(1);
		// startX = 1000 - 40 = 960, startY = 800 - 40 = 760
		expect(pos[0].x).toBe(960);
		expect(pos[0].y).toBe(760);
	});

	it("arranges multiple nodes in grid columns", () => {
		const pos = layoutGhostNodes(3, viewport);
		expect(pos).toHaveLength(3);
		// All in row 0, columns 0,1,2
		expect(pos[0].y).toBe(pos[1].y); // same row
		expect(pos[1].y).toBe(pos[2].y);
		// x decreases (right to left)
		expect(pos[0].x).toBeGreaterThan(pos[1].x);
		expect(pos[1].x).toBeGreaterThan(pos[2].x);
	});

	it("wraps to next row after filling columns", () => {
		// cols = floor(1000 * 0.3 / 24) = floor(12.5) = 12
		const cols = Math.floor((1000 * 0.3) / 24);
		const pos = layoutGhostNodes(cols + 1, viewport);
		expect(pos).toHaveLength(cols + 1);
		// First node of row 1 should have different y
		expect(pos[cols].y).toBeLessThan(pos[0].y); // higher up (smaller y = upward)
		// Same x as first column
		expect(pos[cols].x).toBe(pos[0].x);
	});

	it("limits visible nodes to fit within 70% viewport height", () => {
		// maxRows = floor(800 * 0.7 / 24) = floor(23.33) = 23
		// cols = 12
		// maxVisible = 23 * 12 = 276
		const maxRows = Math.floor((800 * 0.7) / 24);
		const cols = Math.floor((1000 * 0.3) / 24);
		const maxVisible = maxRows * cols;

		const pos = layoutGhostNodes(500, viewport);
		expect(pos).toHaveLength(maxVisible);
		expect(pos.length).toBeLessThan(500);
	});

	it("all positions are within viewport bounds", () => {
		const pos = layoutGhostNodes(100, viewport);
		for (const { x, y } of pos) {
			expect(x).toBeGreaterThan(0);
			expect(x).toBeLessThanOrEqual(viewport.width);
			expect(y).toBeGreaterThan(0);
			expect(y).toBeLessThanOrEqual(viewport.height);
		}
	});

	it("no two ghost positions overlap", () => {
		const pos = layoutGhostNodes(50, viewport);
		const set = new Set(pos.map((p) => `${p.x},${p.y}`));
		expect(set.size).toBe(pos.length);
	});

	it("handles tiny viewport gracefully", () => {
		const small = { width: 100, height: 100 };
		// cols = max(1, floor(30/24)) = 1
		// maxRows = max(1, floor(70/24)) = 2
		const pos = layoutGhostNodes(10, small);
		expect(pos.length).toBeLessThanOrEqual(2); // 1 col * 2 rows
		expect(pos.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// ghostLabel — label extraction pure function
// ---------------------------------------------------------------------------
describe("ghostLabel", () => {
	it("extracts filename from path", () => {
		expect(ghostLabel("folder/subfolder/note.md")).toBe("note");
	});

	it("removes .md extension", () => {
		expect(ghostLabel("test.md")).toBe("test");
	});

	it("truncates long names with ellipsis", () => {
		const result = ghostLabel("very-long-filename-here.md");
		expect(result.length).toBeLessThanOrEqual(12);
		expect(result).toMatch(/…$/);
	});

	it("preserves short names without truncation", () => {
		expect(ghostLabel("short.md")).toBe("short");
	});

	it("handles names exactly at max length", () => {
		// "123456789012" = 12 chars → no truncation
		expect(ghostLabel("123456789012.md")).toBe("123456789012");
	});

	it("handles names one char over max length", () => {
		// "1234567890123" = 13 chars → truncate to 11 + "…" = 12
		expect(ghostLabel("1234567890123.md")).toBe("12345678901…");
	});

	it("handles deeply nested path", () => {
		expect(ghostLabel("a/b/c/d/e/note.md")).toBe("note");
	});

	it("handles path without extension", () => {
		expect(ghostLabel("folder/tag-node")).toBe("tag-node");
	});

	it("handles bare ID (no slashes, no extension)", () => {
		expect(ghostLabel("mynode")).toBe("mynode");
	});

	it("respects custom maxLen", () => {
		expect(ghostLabel("abcdefghij.md", 5)).toBe("abcd…");
		expect(ghostLabel("abc.md", 5)).toBe("abc");
	});

	it("handles empty string", () => {
		expect(ghostLabel("")).toBe("");
	});
});

// DOM mock — shared helper
import { createMockEl, collectAll, type MockEl } from "./helpers/mock-dom";

// ---------------------------------------------------------------------------
// buildDiffList — DOM panel tests
// ---------------------------------------------------------------------------
describe("buildDiffList", () => {
	it("does nothing when inactive (no diff)", () => {
		const overlay = new DiffOverlay();
		const container = createMockEl();
		overlay.buildDiffList(
			container,
			() => "label",
			() => {},
			() => {},
		);
		expect(container.children).toHaveLength(0);
	});

	it("creates panel with gi-diff-list class", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "snap1");
		const container = createMockEl();
		overlay.buildDiffList(
			container,
			() => "label",
			() => {},
			() => {},
		);

		const panel = container.querySelector(".gi-diff-list");
		expect(panel).not.toBeNull();
		expect(panel!.cls).toBe("gi-diff-list");
	});

	it("shows snapshot name in header", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "my-snap");
		const container = createMockEl();
		overlay.buildDiffList(
			container,
			() => "label",
			() => {},
			() => {},
		);

		const all = collectAll(container);
		const nameEl = all.find((e) => e.textContent === "Diff: my-snap");
		expect(nameEl).toBeDefined();
	});

	it("renders close button that calls onClose", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "snap");
		const container = createMockEl();
		const onClose = vi.fn();
		overlay.buildDiffList(
			container,
			() => "label",
			() => {},
			onClose,
		);

		const all = collectAll(container);
		const closeBtn = all.find((e) => e.textContent === "\u00d7");
		expect(closeBtn).toBeDefined();
		expect(closeBtn!.attrs["aria-label"]).toBe("Close diff list");

		// Simulate click
		closeBtn!.listeners.click?.[0]?.();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("renders added/changed/removed sections with counts", () => {
		const overlay = new DiffOverlay();
		overlay.activate(
			makeDiff({
				addedNodeIds: ["a", "b"],
				changedNodeIds: ["c"],
				removedNodes: [{ id: "d", metaHash: "x" }],
			}),
			"snap",
		);
		const container = createMockEl();
		overlay.buildDiffList(
			container,
			(id) => id.toUpperCase(),
			() => {},
			() => {},
		);

		const all = collectAll(container);
		const texts = all.map((e) => e.textContent);
		expect(texts).toContain("Added (2)");
		expect(texts).toContain("Changed (1)");
		expect(texts).toContain("Removed (1)");
	});

	it("calls getLabel for each node ID", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a", "b"] }), "snap");
		const container = createMockEl();
		const getLabel = vi.fn((id: string) => `label-${id}`);
		overlay.buildDiffList(
			container,
			getLabel,
			() => {},
			() => {},
		);

		expect(getLabel).toHaveBeenCalledWith("a");
		expect(getLabel).toHaveBeenCalledWith("b");
	});

	it("added/changed rows call onNodeClick on click", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"], changedNodeIds: ["b"] }), "snap");
		const container = createMockEl();
		const onClick = vi.fn();
		overlay.buildDiffList(
			container,
			(id) => id,
			onClick,
			() => {},
		);

		const all = collectAll(container);
		const rows = all.filter((e) => e.cls === "gi-diff-list-item");
		// "a" and "b" items should have click listeners
		const clickableRows = rows.filter((r) => r.listeners.click?.length);
		expect(clickableRows.length).toBe(2);

		// Trigger all clickable rows and verify both IDs are called
		for (const r of clickableRows) r.listeners.click[0]();
		expect(onClick).toHaveBeenCalledWith("a");
		expect(onClick).toHaveBeenCalledWith("b");
	});

	it("added/changed rows support keyboard Enter and Space", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["node1"] }), "snap");
		const container = createMockEl();
		const onClick = vi.fn();
		overlay.buildDiffList(
			container,
			(id) => id,
			onClick,
			() => {},
		);

		const all = collectAll(container);
		const rows = all.filter((e) => e.cls === "gi-diff-list-item");
		const clickableRow = rows.find((r) => r.listeners.keydown?.length);
		expect(clickableRow).toBeDefined();
		expect(clickableRow!.attrs.role).toBe("button");
		expect(clickableRow!.attrs.tabindex).toBe("0");

		// Simulate keydown Enter
		clickableRow!.listeners.keydown[0]({ key: "Enter", preventDefault: vi.fn() });
		expect(onClick).toHaveBeenCalledWith("node1");

		// Simulate keydown Space
		clickableRow!.listeners.keydown[0]({ key: " ", preventDefault: vi.fn() });
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	it("removed rows do NOT call onNodeClick", () => {
		const overlay = new DiffOverlay();
		overlay.activate(
			makeDiff({
				removedNodes: [{ id: "gone", metaHash: "h" }],
			}),
			"snap",
		);
		const container = createMockEl();
		const onClick = vi.fn();
		overlay.buildDiffList(
			container,
			(id) => id,
			onClick,
			() => {},
		);

		const all = collectAll(container);
		const rows = all.filter((e) => e.cls === "gi-diff-list-item");
		expect(rows.length).toBe(1);
		// Removed rows should have no click listener
		expect(rows[0].listeners.click ?? []).toHaveLength(0);
	});

	it("truncates at 50 entries and shows overflow indicator", () => {
		const ids = Array.from({ length: 60 }, (_, i) => `node-${i}`);
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ids }), "snap");
		const container = createMockEl();
		overlay.buildDiffList(
			container,
			(id) => id,
			() => {},
			() => {},
		);

		const all = collectAll(container);
		const rows = all.filter((e) => e.cls === "gi-diff-list-item");
		expect(rows.length).toBe(50);

		// Overflow text
		const overflowEl = all.find((e) => (e.textContent ?? "").includes("+10 more"));
		expect(overflowEl).toBeDefined();
	});

	it("skips empty sections", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "snap");
		const container = createMockEl();
		overlay.buildDiffList(
			container,
			(id) => id,
			() => {},
			() => {},
		);

		const all = collectAll(container);
		const texts = all.map((e) => e.textContent ?? "");
		// Only Added section, no Changed or Removed headers
		expect(texts).toContain("Added (1)");
		expect(texts.filter((t) => t.includes("Changed"))).toHaveLength(0);
		expect(texts.filter((t) => t.includes("Removed"))).toHaveLength(0);
	});

	it("replaces existing panel on rebuild", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "snap");
		const container = createMockEl();

		overlay.buildDiffList(
			container,
			(id) => id,
			() => {},
			() => {},
		);
		const firstPanel = container.querySelector(".gi-diff-list");
		expect(firstPanel).not.toBeNull();

		// Build again — should remove old and create new
		overlay.buildDiffList(
			container,
			(id) => id,
			() => {},
			() => {},
		);
		expect(firstPanel!._removed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// removeDiffList — DOM cleanup
// ---------------------------------------------------------------------------
describe("removeDiffList", () => {
	it("removes existing diff list panel", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "snap");
		const container = createMockEl();
		overlay.buildDiffList(
			container,
			(id) => id,
			() => {},
			() => {},
		);

		const panel = container.querySelector(".gi-diff-list");
		expect(panel).not.toBeNull();

		overlay.removeDiffList(container as unknown as HTMLElement);
		expect(panel!._removed).toBe(true);
	});

	it("does nothing when no panel exists", () => {
		const overlay = new DiffOverlay();
		const container = createMockEl();
		// Should not throw
		overlay.removeDiffList(container as unknown as HTMLElement);
		expect(container.children).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Canvas2D mock for render() tests
// ---------------------------------------------------------------------------
function createMockCtx() {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const proxy = new Proxy({} as Record<string, unknown>, {
		get(target, prop: string) {
			if (prop === "_calls") return calls;
			if (prop === "measureText") return (text: string) => ({ width: text.length * 7 });
			if (typeof target[prop] === "function") return target[prop];
			// Return a spy function for any method call
			if (!target[prop]) {
				target[prop] = (...args: unknown[]) => {
					calls.push({ method: prop, args });
				};
			}
			return target[prop];
		},
		set(target, prop: string, value) {
			calls.push({ method: `set:${prop}`, args: [value] });
			target[prop] = value;
			return true;
		},
	});
	return proxy as unknown as CanvasRenderingContext2D & { _calls: typeof calls };
}

function makePixiNodes(entries: Array<{ id: string; x: number; y: number; radius: number }>) {
	const map = new Map<string, { data: { x: number; y: number }; radius: number }>();
	for (const e of entries) {
		map.set(e.id, { data: { x: e.x, y: e.y }, radius: e.radius });
	}
	return map as unknown as Map<string, import("../src/views/InteractionManager").PixiNode>;
}

// ---------------------------------------------------------------------------
// render() — Canvas2D drawing tests
// ---------------------------------------------------------------------------
describe("DiffOverlay render()", () => {
	const transform = { x: 100, y: 50, scale: 2 };
	const viewport = { width: 800, height: 600 };

	it("does nothing when inactive", () => {
		const overlay = new DiffOverlay();
		const ctx = createMockCtx();
		overlay.render(ctx, new Map() as any, transform, viewport);
		expect(ctx._calls).toHaveLength(0);
	});

	it("draws rings for added nodes at correct screen positions", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "snap");
		const nodes = makePixiNodes([{ id: "a", x: 50, y: 30, radius: 5 }]);
		const ctx = createMockCtx();

		overlay.render(ctx, nodes, transform, viewport);

		// toScreen: wx*scale+tx = 50*2+100=200, wy*scale+ty = 30*2+50=110
		const arcCalls = ctx._calls.filter((c) => c.method === "arc");
		expect(arcCalls.length).toBeGreaterThanOrEqual(1);
		const firstArc = arcCalls[0];
		expect(firstArc.args[0]).toBeCloseTo(200, 0); // sx
		expect(firstArc.args[1]).toBeCloseTo(110, 0); // sy
	});

	it("draws rings for changed nodes", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ changedNodeIds: ["b"] }), "snap");
		const nodes = makePixiNodes([{ id: "b", x: 10, y: 20, radius: 4 }]);
		const ctx = createMockCtx();

		overlay.render(ctx, nodes, transform, viewport);

		const arcCalls = ctx._calls.filter((c) => c.method === "arc");
		expect(arcCalls.length).toBeGreaterThanOrEqual(1);
		// toScreen: 10*2+100=120, 20*2+50=90
		expect(arcCalls[0].args[0]).toBeCloseTo(120, 0);
		expect(arcCalls[0].args[1]).toBeCloseTo(90, 0);
	});

	it("draws added edges between two existing nodes", () => {
		const overlay = new DiffOverlay();
		overlay.activate(
			makeDiff({
				addedEdgeKeys: ["a\0b"],
			}),
			"snap",
		);
		const nodes = makePixiNodes([
			{ id: "a", x: 0, y: 0, radius: 5 },
			{ id: "b", x: 100, y: 50, radius: 5 },
		]);
		const ctx = createMockCtx();
		overlay.render(ctx, nodes, transform, viewport);

		const moveToCalls = ctx._calls.filter((c) => c.method === "moveTo");
		const lineToCalls = ctx._calls.filter((c) => c.method === "lineTo");
		// At least one edge drawn
		expect(moveToCalls.length).toBeGreaterThanOrEqual(1);
		expect(lineToCalls.length).toBeGreaterThanOrEqual(1);
	});

	it("skips added edges when one node is missing", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedEdgeKeys: ["a\0missing"] }), "snap");
		const nodes = makePixiNodes([{ id: "a", x: 0, y: 0, radius: 5 }]);
		const ctx = createMockCtx();
		overlay.render(ctx, nodes, transform, viewport);

		// Edge moveTo should NOT include a\0missing edge line
		// Only ghost/ring arcs, no lineTo for edges
		const strokeCalls = ctx._calls.filter((c) => c.method === "stroke");
		// No edge stroke (may have ring strokes though)
		const lineToBeforeStroke = ctx._calls.filter((c) => c.method === "lineTo");
		// Added edge requires both nodes — should skip
		expect(lineToBeforeStroke.length).toBe(0);
	});

	it("renders ghost nodes for removed nodes", () => {
		const overlay = new DiffOverlay();
		overlay.activate(
			makeDiff({
				removedNodes: [
					{ id: "folder/gone.md", metaHash: "h1" },
					{ id: "folder/lost.md", metaHash: "h2" },
				],
			}),
			"snap",
		);
		const ctx = createMockCtx();
		overlay.render(ctx, new Map() as any, transform, viewport);

		// Ghost nodes should produce fill arcs
		const fillCalls = ctx._calls.filter((c) => c.method === "fill");
		expect(fillCalls.length).toBeGreaterThanOrEqual(2);

		// Ghost labels should be drawn via fillText
		const fillTextCalls = ctx._calls.filter((c) => c.method === "fillText");
		expect(fillTextCalls.length).toBeGreaterThanOrEqual(2);
		// Labels should be "gone" and "lost" (extracted from path)
		const labels = fillTextCalls.map((c) => c.args[0]);
		expect(labels).toContain("gone");
		expect(labels).toContain("lost");
	});

	it("renders status bar with summary text", () => {
		const overlay = new DiffOverlay();
		overlay.activate(
			makeDiff({
				addedNodeIds: ["a"],
				removedNodes: [{ id: "b", metaHash: "h" }],
				changedNodeIds: ["c"],
			}),
			"test-snap",
		);
		const ctx = createMockCtx();
		overlay.render(ctx, new Map() as any, transform, viewport);

		const fillTextCalls = ctx._calls.filter((c) => c.method === "fillText");
		const statusText = fillTextCalls.find(
			(c) => typeof c.args[0] === "string" && (c.args[0] as string).includes("test-snap"),
		);
		expect(statusText).toBeDefined();
		expect(statusText!.args[0]).toContain("1 added");
		expect(statusText!.args[0]).toContain("1 removed");
		expect(statusText!.args[0]).toContain("1 changed");
	});

	it("resets globalAlpha to 1 after rendering", () => {
		const overlay = new DiffOverlay();
		overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "snap");
		const ctx = createMockCtx();
		overlay.render(ctx, makePixiNodes([{ id: "a", x: 0, y: 0, radius: 5 }]), transform, viewport);

		// Last globalAlpha set should be 1
		const alphaOps = ctx._calls.filter((c) => c.method === "set:globalAlpha");
		expect(alphaOps[alphaOps.length - 1].args[0]).toBe(1);
	});

	it("resets lineDash after removed edges", () => {
		const overlay = new DiffOverlay();
		overlay.activate(
			makeDiff({
				removedEdges: [{ source: "a", target: "b", type: "link" }],
				removedNodes: [{ id: "b", metaHash: "h" }],
			}),
			"snap",
		);
		const nodes = makePixiNodes([{ id: "a", x: 0, y: 0, radius: 5 }]);
		const ctx = createMockCtx();
		overlay.render(ctx, nodes, transform, viewport);

		// setLineDash should be called with [] (reset) after dashed edges
		const dashCalls = ctx._calls.filter((c) => c.method === "setLineDash");
		const lastDash = dashCalls[dashCalls.length - 1];
		expect(lastDash.args[0]).toEqual([]);
	});
});

// ===========================================================================
// formatDelta — signed string with color hint
// ===========================================================================
describe("formatDelta", () => {
	it("positive delta returns green +N", () => {
		expect(formatDelta(5)).toEqual({ text: "+5", color: "green" });
	});
	it("negative delta returns red -N", () => {
		expect(formatDelta(-3)).toEqual({ text: "-3", color: "red" });
	});
	it("zero returns muted dash", () => {
		expect(formatDelta(0)).toEqual({ text: "—", color: "muted" });
	});
	it("undefined returns muted dash", () => {
		expect(formatDelta(undefined)).toEqual({ text: "—", color: "muted" });
	});
});

// ===========================================================================
// formatSnapshotDate — locale-aware date formatting
// ===========================================================================
describe("formatSnapshotDate", () => {
	it("formats valid ISO date", () => {
		const result = formatSnapshotDate("2026-03-23T09:06:47", "en-US");
		expect(result).toContain("3");
		expect(result).toContain("23");
	});
	it("returns input for invalid date", () => {
		expect(formatSnapshotDate("not-a-date")).toBe("not-a-date");
	});
	it("returns input for empty string", () => {
		expect(formatSnapshotDate("")).toBe("");
	});
});

// ===========================================================================
// buildTimelineEntries — snapshot list → timeline with deltas
// ===========================================================================
describe("buildTimelineEntries", () => {
	it("returns empty for no snapshots", () => {
		expect(buildTimelineEntries([])).toEqual([]);
	});

	it("single snapshot has no delta", () => {
		const entries = buildTimelineEntries([
			{ name: "snap1", createdAt: "2026-03-01", context: { nodeCount: 10, edgeCount: 5 } },
		]);
		expect(entries.length).toBe(1);
		expect(entries[0].nodeDelta).toBeUndefined();
	});

	it("computes deltas between consecutive snapshots", () => {
		const entries = buildTimelineEntries([
			{ name: "a", createdAt: "2026-03-01", context: { nodeCount: 10, edgeCount: 5 } },
			{ name: "b", createdAt: "2026-03-02", context: { nodeCount: 15, edgeCount: 8 } },
		]);
		expect(entries[1].nodeDelta).toBe(5);
		expect(entries[1].edgeDelta).toBe(3);
	});

	it("sorts by createdAt ascending", () => {
		const entries = buildTimelineEntries([
			{ name: "later", createdAt: "2026-03-10", context: { nodeCount: 20, edgeCount: 10 } },
			{ name: "earlier", createdAt: "2026-03-01", context: { nodeCount: 10, edgeCount: 5 } },
		]);
		expect(entries[0].name).toBe("earlier");
		expect(entries[1].name).toBe("later");
		expect(entries[1].nodeDelta).toBe(10);
	});

	it("handles negative deltas", () => {
		const entries = buildTimelineEntries([
			{ name: "a", createdAt: "2026-03-01", context: { nodeCount: 20, edgeCount: 10 } },
			{ name: "b", createdAt: "2026-03-02", context: { nodeCount: 15, edgeCount: 7 } },
		]);
		expect(entries[1].nodeDelta).toBe(-5);
		expect(entries[1].edgeDelta).toBe(-3);
	});
});
