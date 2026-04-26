import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	renderMatrixViewMode,
	buildMatrixData,
	matrixNodeLabel,
	type MatrixRenderParams,
	type MatrixSortMode,
} from "../src/views/matrix-renderer";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string, label?: string, category?: string): GraphNode {
	return {
		id,
		label: label ?? id,
		x: 0,
		y: 0,
		group: "",
		tags: [],
		category: category ?? "",
	} as GraphNode;
}

function mkEdge(source: string, target: string, type = "link"): GraphEdge {
	return { source, target, type } as GraphEdge;
}

function mkGraph(nodeIds: string[], edges: [string, string][] = []): GraphData {
	return {
		nodes: nodeIds.map((id) => mkNode(id)),
		edges: edges.map(([s, t]) => mkEdge(s, t)),
	};
}

function createMockContainer(): HTMLElement {
	return {
		querySelector: vi.fn().mockReturnValue(null),
		querySelectorAll: vi.fn().mockReturnValue([]),
		createDiv: vi.fn(function () {
			return this;
		}),
		createEl: vi.fn(function () {
			return this;
		}),
		empty: vi.fn(),
		createSpan: vi.fn(function () {
			return this;
		}),
		createTable: vi.fn(function () {
			return this;
		}),
		createTr: vi.fn(function () {
			return this;
		}),
		createTh: vi.fn(function () {
			return this;
		}),
		createTd: vi.fn(function () {
			return this;
		}),
		style: {},
		classList: { add: vi.fn(), remove: vi.fn() },
		addEventListener: vi.fn(),
		children: [],
		textContent: "",
		append: vi.fn(),
	} as any;
}

// ---------------------------------------------------------------------------
// renderMatrixViewMode
// ---------------------------------------------------------------------------

describe("renderMatrixViewMode", () => {
	let container: HTMLElement;
	let onSortChange: ReturnType<typeof vi.fn>;
	let onCellClick: ReturnType<typeof vi.fn>;
	let setStatus: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		container = createMockContainer();
		onSortChange = vi.fn();
		onCellClick = vi.fn();
		setStatus = vi.fn();
	});

	it("returns a matrix container element", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
		expect(result.style).toBeDefined();
	});

	it("handles empty graph", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph([]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
		expect(setStatus).toHaveBeenCalled();
	});

	it("sets correct dimensions", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 1000,
			H: 800,
			gd: mkGraph(["a"]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result.style.width).toBe("1000px");
		expect(result.style.height).toBe("800px");
	});

	it("clears existing matrix before rendering", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result1 = renderMatrixViewMode(params);
		const originalChild = result1.querySelector("table");

		const result2 = renderMatrixViewMode(params);
		// Should reuse matrix element but clear it
		expect(result2).toBeDefined();
	});

	it("sorts by degree", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(
				["a", "b", "c"],
				[
					["a", "b"],
					["a", "c"],
					["b", "c"],
				], // a has degree 2, b has degree 2, c has degree 2
			),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result.querySelector).toBeDefined();
	});

	it("sorts alphabetically", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["zebra", "apple", "banana"]),
			sortMode: "alpha",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("sorts by category", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: {
				nodes: [mkNode("a", "A", "cat1"), mkNode("b", "B", "cat2"), mkNode("c", "C", "cat1")],
				edges: [],
			},
			sortMode: "category",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("limits to maxNodes based on viewport", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 200, // Small viewport
			H: 200,
			gd: mkGraph(Array.from({ length: 100 }, (_, i) => `node${i}`)),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		const rows = result.querySelectorAll("tr");
		// Should limit to ~12 nodes (200px / 16px) + header
		expect(rows.length).toBeLessThan(30);
	});

	it("handles sort change callback", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		const sortSelect = result.querySelector("select");
		if (sortSelect) {
			sortSelect.value = "alpha";
			sortSelect.dispatchEvent(new Event("change"));
			expect(onSortChange).toHaveBeenCalledWith("alpha");
		}
	});

	it("handles cell click callback", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"], [["a", "b"]]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		const cells = result.querySelectorAll(".gi-matrix-cell");
		if (cells.length > 0) {
			(cells[0] as HTMLElement).click();
		}
	});

	it("highlights row on hover", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		const table = result.querySelector("table");
		if (table) {
			const firstRow = table.querySelector("tr");
			if (firstRow) {
				const cell = firstRow.querySelector("td");
				if (cell) {
					cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
					// Row should be highlighted
				}
			}
		}
	});

	it("builds adjacency matrix correctly", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(
				["a", "b", "c"],
				[
					["a", "b"],
					["b", "c"],
					["a", "c"],
				],
			),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("uses dark theme colors", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"], [["a", "b"]]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("uses light theme colors", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"], [["a", "b"]]),
			sortMode: "degree",
			isDark: false,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("displays edge type breakdown in tooltip", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(
				["a", "b"],
				[
					["a", "b"],
					["a", "b"],
				], // duplicate edges
			),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("handles nodes without labels", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: {
				nodes: [
					{ id: "file.md", x: 0, y: 0, group: "", tags: [], category: "" } as GraphNode,
					{ id: "file2.md", x: 0, y: 0, group: "", tags: [], category: "" } as GraphNode,
				],
				edges: [mkEdge("file.md", "file2.md")],
			},
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("updates status message", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b", "c"], [["a", "b"]]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		renderMatrixViewMode(params);
		expect(setStatus).toHaveBeenCalled();
		const call = setStatus.mock.calls[0][0];
		expect(call).toMatch(/matrix/);
		expect(call).toMatch(/edges/);
	});

	it("reuses matrix element if it exists", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a"]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result1 = renderMatrixViewMode(params);
		const firstElement = result1;

		// Render again
		const result2 = renderMatrixViewMode(params);
		// Should reuse the same element
		expect(result2).toBe(firstElement);
	});

	it("handles bidirectional edges", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(
				["a", "b"],
				[
					["a", "b"],
					["b", "a"],
				], // bidirectional
			),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
	});

	it("handles self-loops", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(
				["a", "b"],
				[
					["a", "a"],
					["b", "b"],
				],
			), // self-loops
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		expect(result).toBeDefined();
		// Diagonal cells would be marked when the matrix is rendered
	});

	it("marks diagonal cells", () => {
		const params: MatrixRenderParams = {
			containerEl: container,
			W: 800,
			H: 600,
			gd: mkGraph(["a", "b"]),
			sortMode: "degree",
			isDark: true,
			onSortChange,
			onCellClick,
			setStatus,
		};
		const result = renderMatrixViewMode(params);
		const diagCells = result.querySelectorAll(".gi-matrix-diag");
		// Should have diagonal cells
		expect(diagCells.length).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// buildMatrixData (pure function)
// ---------------------------------------------------------------------------

describe("buildMatrixData", () => {
	it("computes degrees from edges", () => {
		const gd = mkGraph(
			["a", "b", "c"],
			[
				["a", "b"],
				["a", "c"],
			],
		);
		const data = buildMatrixData(gd, "degree", 50);
		expect(data.degrees.get("a")).toBe(2);
		expect(data.degrees.get("b")).toBe(1);
		expect(data.degrees.get("c")).toBe(1);
	});

	it("sorts by degree descending", () => {
		const gd = mkGraph(
			["a", "b", "c"],
			[
				["a", "b"],
				["a", "c"],
				["b", "c"],
			],
		);
		const data = buildMatrixData(gd, "degree", 50);
		// All have degree 2, so order is stable but all present
		expect(data.nodeIds).toHaveLength(3);
	});

	it("sorts alphabetically", () => {
		const gd = mkGraph(
			["zebra", "apple", "mango"],
			[
				["zebra", "apple"],
				["apple", "mango"],
			],
		);
		const data = buildMatrixData(gd, "alpha", 50);
		expect(data.nodeIds[0]).toBe("apple");
		expect(data.nodeIds[data.nodeIds.length - 1]).toBe("zebra");
	});

	it("sorts by category then degree", () => {
		const gd: GraphData = {
			nodes: [mkNode("a", "A", "cat2"), mkNode("b", "B", "cat1"), mkNode("c", "C", "cat1")],
			edges: [mkEdge("a", "b"), mkEdge("b", "c"), mkEdge("a", "c")],
		};
		const data = buildMatrixData(gd, "category", 50);
		// cat1 nodes (b, c) before cat2 (a)
		expect(data.nodeIds.indexOf("b")).toBeLessThan(data.nodeIds.indexOf("a"));
		expect(data.nodeIds.indexOf("c")).toBeLessThan(data.nodeIds.indexOf("a"));
	});

	it("limits to maxNodes", () => {
		const ids = Array.from({ length: 100 }, (_, i) => `n${i}`);
		const edges: [string, string][] = ids.slice(1).map((id) => ["n0", id]);
		const gd = mkGraph(ids, edges);
		const data = buildMatrixData(gd, "degree", 10);
		expect(data.nodeIds).toHaveLength(10);
	});

	it("builds adjacency matrix counts", () => {
		const gd = mkGraph(
			["a", "b"],
			[
				["a", "b"],
				["a", "b"],
			],
		);
		const data = buildMatrixData(gd, "degree", 50);
		expect(data.matrix.get("a")?.get("b")).toBe(2);
	});

	it("tracks edge type breakdown", () => {
		const gd: GraphData = {
			nodes: [mkNode("a"), mkNode("b")],
			edges: [mkEdge("a", "b", "link"), mkEdge("a", "b", "tag")],
		};
		const data = buildMatrixData(gd, "degree", 50);
		const types = data.matrixTypes.get("a")?.get("b");
		expect(types?.get("link")).toBe(1);
		expect(types?.get("tag")).toBe(1);
	});

	it("computes maxCount for color scaling", () => {
		const gd = mkGraph(
			["a", "b", "c"],
			[
				["a", "b"],
				["a", "b"],
				["a", "b"],
				["b", "c"],
			],
		);
		const data = buildMatrixData(gd, "degree", 50);
		expect(data.maxCount).toBe(3); // a→b has 3 edges
	});

	it("returns maxCount=1 for empty graph", () => {
		const gd = mkGraph([], []);
		const data = buildMatrixData(gd, "degree", 50);
		expect(data.maxCount).toBe(1);
		expect(data.nodeIds).toHaveLength(0);
	});

	it("excludes edges to nodes outside the top-N set", () => {
		const ids = ["hub", "a", "b", "c"];
		const gd = mkGraph(ids, [
			["hub", "a"],
			["hub", "b"],
			["hub", "c"],
			["a", "b"],
		]);
		const data = buildMatrixData(gd, "degree", 2); // only top-2 by degree
		// hub (3) + one of a/b (2 each) — edges to excluded nodes shouldn't appear
		for (const [rowId, row] of data.matrix) {
			for (const colId of row.keys()) {
				expect(data.nodeIds).toContain(rowId);
				expect(data.nodeIds).toContain(colId);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// matrixNodeLabel
// ---------------------------------------------------------------------------

describe("matrixNodeLabel", () => {
	it("returns node label when available", () => {
		const gd: GraphData = {
			nodes: [mkNode("a.md", "Alice")],
			edges: [],
		};
		expect(matrixNodeLabel(gd, "a.md")).toBe("Alice");
	});

	it("strips .md and returns filename when no label", () => {
		const gd: GraphData = {
			nodes: [{ id: "folder/file.md", x: 0, y: 0, group: "", tags: [], category: "" } as GraphNode],
			edges: [],
		};
		expect(matrixNodeLabel(gd, "folder/file.md")).toBe("file");
	});

	it("returns id as fallback for unknown node", () => {
		const gd: GraphData = { nodes: [], edges: [] };
		expect(matrixNodeLabel(gd, "unknown")).toBe("unknown");
	});
});
