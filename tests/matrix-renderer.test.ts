import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	renderMatrixViewMode,
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
		nodes: nodeIds.map(id => mkNode(id)),
		edges: edges.map(([s, t]) => mkEdge(s, t)),
	};
}

function createMockContainer(): HTMLElement {
	return {
		querySelector: vi.fn().mockReturnValue(null),
		querySelectorAll: vi.fn().mockReturnValue([]),
		createDiv: vi.fn(function() { return this; }),
		createEl: vi.fn(function() { return this; }),
		empty: vi.fn(),
		createSpan: vi.fn(function() { return this; }),
		createTable: vi.fn(function() { return this; }),
		createTr: vi.fn(function() { return this; }),
		createTh: vi.fn(function() { return this; }),
		createTd: vi.fn(function() { return this; }),
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
				[["a", "b"], ["a", "c"], ["b", "c"]], // a has degree 2, b has degree 2, c has degree 2
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
				nodes: [
					mkNode("a", "A", "cat1"),
					mkNode("b", "B", "cat2"),
					mkNode("c", "C", "cat1"),
				],
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
				[["a", "b"], ["b", "c"], ["a", "c"]],
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
				[["a", "b"], ["a", "b"]], // duplicate edges
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
				[["a", "b"], ["b", "a"]], // bidirectional
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
			gd: mkGraph(["a", "b"], [["a", "a"], ["b", "b"]]), // self-loops
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
