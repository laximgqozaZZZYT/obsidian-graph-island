import { describe, it, expect, vi } from "vitest";
import { renderBreadcrumb, renderRelationMatrix, type BreadcrumbHost } from "../src/views/StatsRenderer";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";
import { t } from "../src/i18n";

// ---------------------------------------------------------------------------
// renderBreadcrumb
// ---------------------------------------------------------------------------
describe("renderBreadcrumb", () => {
	function makeHost(labels?: Record<string, string>): BreadcrumbHost {
		return {
			getNodeLabel: (id) => labels?.[id] ?? id,
			invalidateAndRebuild: vi.fn(),
		};
	}

	it("hides when showBreadcrumb is false", () => {
		const el = createMockEl();
		renderBreadcrumb(el as any, false, "node1", [], { localGraphCenter: "node1" }, makeHost());
		expect(el.style.display).toBe("none");
	});

	it("hides when localGraphCenter is null", () => {
		const el = createMockEl();
		renderBreadcrumb(el as any, true, null, [], { localGraphCenter: null }, makeHost());
		expect(el.style.display).toBe("none");
	});

	it("shows single node (leaf, no parent)", () => {
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "leaf", [], { localGraphCenter: "leaf" }, makeHost({ leaf: "Leaf Node" }));

		expect(el.style.display).toBe("");
		const current = findEl(el, ".gi-breadcrumb-current");
		expect(current?.text).toBe("Leaf Node");
		// No separator
		expect(findAllEl(el, ".gi-breadcrumb-sep")).toHaveLength(0);
	});

	it("walks inheritance chain upward: root › parent › current", () => {
		const edges = [
			{ source: "child", target: "parent", type: "inheritance" },
			{ source: "parent", target: "root", type: "inheritance" },
		];
		const el = createMockEl();
		renderBreadcrumb(
			el as any,
			true,
			"child",
			edges,
			{ localGraphCenter: "child" },
			makeHost({
				root: "Root",
				parent: "Parent",
				child: "Child",
			}),
		);

		const items = findAllEl(el, ".gi-breadcrumb-item");
		expect(items).toHaveLength(2); // root + parent (non-current)
		expect(items[0].text).toBe("Root");
		expect(items[1].text).toBe("Parent");

		const current = findEl(el, ".gi-breadcrumb-current");
		expect(current?.text).toBe("Child");

		// 2 separators
		expect(findAllEl(el, ".gi-breadcrumb-sep")).toHaveLength(2);
	});

	it("ignores non-inheritance edges", () => {
		const edges = [{ source: "child", target: "parent", type: "link" }];
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "child", edges, { localGraphCenter: "child" }, makeHost());

		// Only current node, no chain
		expect(findAllEl(el, ".gi-breadcrumb-item")).toHaveLength(0);
		expect(findEl(el, ".gi-breadcrumb-current")).not.toBeNull();
	});

	it("clicking ancestor sets localGraphCenter and rebuilds", () => {
		const edges = [{ source: "child", target: "parent", type: "inheritance" }];
		const host = makeHost();
		const panel = { localGraphCenter: "child" as string | null };
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "child", edges, panel, host);

		const ancestor = findAllEl(el, ".gi-breadcrumb-item")[0];
		ancestor.listeners["click"]?.[0]?.();
		expect(panel.localGraphCenter).toBe("parent");
		expect(host.invalidateAndRebuild).toHaveBeenCalled();
	});

	it("limits chain depth to 20", () => {
		// Create a chain of 25 nodes
		const edges: Array<{ source: string; target: string; type: string }> = [];
		for (let i = 0; i < 25; i++) {
			edges.push({ source: `n${i}`, target: `n${i + 1}`, type: "inheritance" });
		}
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "n0", edges, { localGraphCenter: "n0" }, makeHost());

		// Max depth = 20, so chain = 21 nodes total (current + 20 ancestors)
		const all = [...findAllEl(el, ".gi-breadcrumb-item"), ...findAllEl(el, ".gi-breadcrumb-current")];
		expect(all.length).toBeLessThanOrEqual(21);
	});

	it("walks is-a relation edges (alternative hierarchy)", () => {
		const edges = [{ source: "child", target: "parent", relation: "is-a" }];
		const el = createMockEl();
		renderBreadcrumb(
			el as any,
			true,
			"child",
			edges,
			{ localGraphCenter: "child" },
			makeHost({
				parent: "Parent",
				child: "Child",
			}),
		);

		const items = findAllEl(el, ".gi-breadcrumb-item");
		expect(items).toHaveLength(1);
		expect(items[0].text).toBe("Parent");
	});

	it("walks parent relation edges", () => {
		const edges = [{ source: "child", target: "ancestor", relation: "parent" }];
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "child", edges, { localGraphCenter: "child" }, makeHost());

		const items = findAllEl(el, ".gi-breadcrumb-item");
		expect(items).toHaveLength(1);
		expect(items[0].text).toBe("ancestor");
	});

	it("mixed edge types only follows hierarchy edges", () => {
		const edges = [
			{ source: "child", target: "link-neighbor", type: "link" },
			{ source: "child", target: "tag-peer", type: "tag" },
			{ source: "child", target: "real-parent", type: "inheritance" },
			{ source: "real-parent", target: "also-link", type: "link" },
		];
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "child", edges, { localGraphCenter: "child" }, makeHost());

		// Only real-parent in chain (link/tag ignored)
		const items = findAllEl(el, ".gi-breadcrumb-item");
		expect(items).toHaveLength(1);
		expect(items[0].text).toBe("real-parent");
	});

	it("reverse-direction inheritance edge is still followed", () => {
		// Edge stored as target→source instead of source→target
		const edges = [{ source: "parent", target: "child", type: "inheritance" }];
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "child", edges, { localGraphCenter: "child" }, makeHost());

		const items = findAllEl(el, ".gi-breadcrumb-item");
		expect(items).toHaveLength(1);
		expect(items[0].text).toBe("parent");
	});

	it("empty edges produces single-node breadcrumb", () => {
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "solo", [], { localGraphCenter: "solo" }, makeHost({ solo: "Solo" }));

		expect(findAllEl(el, ".gi-breadcrumb-item")).toHaveLength(0);
		expect(findEl(el, ".gi-breadcrumb-current")?.text).toBe("Solo");
		expect(findAllEl(el, ".gi-breadcrumb-sep")).toHaveLength(0);
	});

	it("handles cycle in inheritance (does not loop infinitely)", () => {
		const edges = [
			{ source: "a", target: "b", type: "inheritance" },
			{ source: "b", target: "a", type: "inheritance" }, // cycle
		];
		const el = createMockEl();
		renderBreadcrumb(el as any, true, "a", edges, { localGraphCenter: "a" }, makeHost());

		// Should stop due to visited set
		const all = [...findAllEl(el, ".gi-breadcrumb-item"), ...findAllEl(el, ".gi-breadcrumb-current")];
		expect(all.length).toBe(2); // a + b (cycle detected, stops)
	});
});

// ---------------------------------------------------------------------------
// renderRelationMatrix
// ---------------------------------------------------------------------------
describe("renderRelationMatrix", () => {
	function makeHost(degrees: [string, number][], labels?: Record<string, string>) {
		return {
			getDegrees: () => new Map(degrees),
			getNodeLabel: (id: string) => labels?.[id] ?? id,
		};
	}

	it("hides when showMatrix is false", () => {
		const el = createMockEl();
		renderRelationMatrix(el as any, false, [], makeHost([]), vi.fn());
		expect(el.style.display).toBe("none");
	});

	it("shows title when visible", () => {
		const el = createMockEl();
		renderRelationMatrix(el as any, true, [], makeHost([["a", 1]]), vi.fn());
		const title = findEl(el, ".gi-matrix-title");
		expect(title?.text).toBe(t("stats.relationMatrix"));
	});

	it("builds matrix from edges", () => {
		const edges = [
			{ source: "a", target: "b" },
			{ source: "a", target: "b" }, // duplicate
			{ source: "b", target: "c" },
		];
		const el = createMockEl();
		renderRelationMatrix(
			el as any,
			true,
			edges,
			makeHost([
				["a", 3],
				["b", 2],
				["c", 1],
			]),
			vi.fn(),
		);

		const table = findEl(el, ".gi-matrix-table");
		expect(table).not.toBeNull();
		// 3 nodes + 1 header row = 4 rows
		const rows = findAllEl(table!, "tr");
		expect(rows).toHaveLength(4);
	});

	it("handles object-form edge source/target", () => {
		const edges = [{ source: { id: "a" } as any, target: { id: "b" } as any }];
		const el = createMockEl();
		renderRelationMatrix(
			el as any,
			true,
			edges,
			makeHost([
				["a", 2],
				["b", 1],
			]),
			vi.fn(),
		);

		// Should not throw, table should exist
		expect(findEl(el, ".gi-matrix-table")).not.toBeNull();
	});

	it("cell click calls onCellClick with node pair", () => {
		const edges = [{ source: "a", target: "b" }];
		const onClick = vi.fn();
		const el = createMockEl();
		renderRelationMatrix(
			el as any,
			true,
			edges,
			makeHost([
				["a", 2],
				["b", 1],
			]),
			onClick,
		);

		const cells = findAllEl(el, ".gi-matrix-cell");
		expect(cells.length).toBeGreaterThan(0);
		cells[0].listeners["click"]?.[0]?.();
		expect(onClick).toHaveBeenCalledWith(expect.any(Set));
	});

	it("limits to top 20 nodes by degree", () => {
		const degrees: [string, number][] = [];
		for (let i = 0; i < 30; i++) degrees.push([`n${i}`, 30 - i]);
		const el = createMockEl();
		renderRelationMatrix(el as any, true, [], makeHost(degrees), vi.fn());

		// Header row has 20 th elements + 1 empty th
		const ths = findAllEl(el, "th");
		expect(ths.length).toBe(21); // 20 + 1 empty corner
	});

	it("empty degrees produces no table rows beyond header", () => {
		const el = createMockEl();
		renderRelationMatrix(el as any, true, [], makeHost([]), vi.fn());
		// With no nodes, getDegrees returns empty → function returns early
		const table = findEl(el, ".gi-matrix-table");
		expect(table).toBeNull();
	});

	it("single node produces 1×1 matrix", () => {
		const el = createMockEl();
		renderRelationMatrix(el as any, true, [], makeHost([["a", 5]]), vi.fn());
		const rows = findAllEl(el, "tr");
		// 1 header row + 1 data row
		expect(rows).toHaveLength(2);
		const cells = findAllEl(el, ".gi-matrix-cell");
		expect(cells).toHaveLength(1);
	});

	it("self-loop edge counted in diagonal cell", () => {
		const edges = [{ source: "a", target: "a" }];
		const el = createMockEl();
		renderRelationMatrix(el as any, true, edges, makeHost([["a", 2]]), vi.fn());
		const cells = findAllEl(el, ".gi-matrix-cell");
		expect(cells).toHaveLength(1);
		// Diagonal cell should show count=1 (set via textContent)
		expect(cells[0].textContent).toBe("1");
	});

	it("exactly 20 nodes produces 20×20 matrix", () => {
		const degrees: [string, number][] = [];
		for (let i = 0; i < 20; i++) degrees.push([`n${i}`, 20 - i]);
		const el = createMockEl();
		renderRelationMatrix(el as any, true, [], makeHost(degrees), vi.fn());
		const rows = findAllEl(el, "tr");
		expect(rows).toHaveLength(21); // header + 20 data
		const cells = findAllEl(el, ".gi-matrix-cell");
		expect(cells).toHaveLength(400); // 20×20
	});

	it("duplicate edges accumulate count", () => {
		const edges = [
			{ source: "a", target: "b" },
			{ source: "a", target: "b" },
			{ source: "a", target: "b" },
		];
		const el = createMockEl();
		renderRelationMatrix(
			el as any,
			true,
			edges,
			makeHost([
				["a", 3],
				["b", 1],
			]),
			vi.fn(),
		);
		const cells = findAllEl(el, ".gi-matrix-cell");
		const withText = cells.filter((c) => c.textContent === "3");
		expect(withText).toHaveLength(1);
	});

	it("edges referencing nodes outside top-20 are ignored", () => {
		const edges = [{ source: "a", target: "outside" }];
		const el = createMockEl();
		renderRelationMatrix(el as any, true, edges, makeHost([["a", 5]]), vi.fn());
		// "outside" not in degrees → edge ignored, no count in cells
		const cells = findAllEl(el, ".gi-matrix-cell");
		const withText = cells.filter((c) => c.textContent != null && c.textContent !== "");
		expect(withText).toHaveLength(0);
	});
});
