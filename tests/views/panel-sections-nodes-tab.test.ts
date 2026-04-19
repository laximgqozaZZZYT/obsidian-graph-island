/**
 * Smoke tests for src/views/panel-sections-nodes-tab.ts
 *
 * Verifies that each extracted section builder produces the expected DOM
 * structure (stats bar / filter bar / tree container / legend) and that
 * the orchestrator wires them together in the right order.
 */
import { describe, it, expect, vi } from "vitest";
import type { PanelState, PanelCallbacks, PanelContext, NodeTreeEntry } from "../../src/views/PanelBuilder";

vi.mock("../../src/i18n", () => ({
	t: (key: string) => key,
	tHelp: (key: string) => key,
}));

vi.mock("../../src/obsidian-internals", () => ({
	asObsidianWindow: () => ({ app: { vault: {}, workspace: {} } }),
	asInternalApp: () => ({}),
}));

// PanelBuilder provides localStorage-backed dir-state helpers; stub them.
vi.mock("../../src/views/PanelBuilder", () => ({
	_getNodeDirStates: () => ({}),
	_saveNodeDirStates: vi.fn(),
}));

// MockEl captures createDiv/createEl calls and records attributes so we can
// assert structure without a real DOM.
type MockEl = {
	tagName: string;
	cls?: string;
	text?: string;
	children: MockEl[];
	attrs: Record<string, string>;
	style: { cssText: string } & Record<string, string>;
	dataset: Record<string, string>;
	classList: { toggle: (c: string) => void };
	createDiv: (opts?: { cls?: string }) => MockEl;
	createEl: (tag: string, opts?: { cls?: string; text?: string; type?: string; placeholder?: string; value?: string }) => MockEl;
	addEventListener: (ev: string, fn: (...a: any[]) => void) => void;
	querySelector: (sel: string) => MockEl | null;
	querySelectorAll: (sel: string) => MockEl[];
	setAttribute: (k: string, v: string) => void;
	appendChild: (child: MockEl) => void;
	prepend: (child: MockEl) => void;
	handlers: Record<string, Array<(...a: any[]) => void>>;
	checked?: boolean;
	value?: string;
	textContent?: string;
};

function makeMockEl(tagName = "div"): MockEl {
	const el: MockEl = {
		tagName,
		children: [],
		attrs: {},
		style: { cssText: "" } as any,
		dataset: {},
		classList: { toggle: vi.fn() },
		handlers: {},
		createDiv(opts) {
			const child = makeMockEl("div");
			if (opts?.cls) child.cls = opts.cls;
			this.children.push(child);
			return child;
		},
		createEl(tag, opts) {
			const child = makeMockEl(tag);
			if (opts?.cls) child.cls = opts.cls;
			if (opts?.text !== undefined) {
				child.text = opts.text;
				child.textContent = opts.text;
			}
			if (opts?.type) child.attrs.type = opts.type;
			if (opts?.placeholder) child.attrs.placeholder = opts.placeholder;
			if (opts?.value !== undefined) (child as any).value = opts.value;
			this.children.push(child);
			return child;
		},
		addEventListener(ev, fn) {
			this.handlers[ev] ||= [];
			this.handlers[ev].push(fn);
		},
		querySelector(_sel) {
			return null;
		},
		querySelectorAll(_sel) {
			return [];
		},
		setAttribute(k, v) {
			this.attrs[k] = v;
		},
		appendChild(_c) {},
		prepend(_c) {},
	};
	return el;
}

function makeEntries(): NodeTreeEntry[] {
	return [
		{ id: "a/foo.md", label: "foo", path: "a/foo.md", isVisible: true },
		{ id: "a/bar.md", label: "bar", path: "a/bar.md", isVisible: false },
		{ id: "b/baz.md", label: "baz", path: "b/baz.md", isVisible: true },
	];
}

function makePanel(): PanelState {
	return {
		excludeNodes: ["a/bar.md"],
		multiSelectNodeIds: [],
		bookmarkedNodes: [],
	} as any;
}

function makeCb(): PanelCallbacks {
	return {
		getNodeTreeData: () => makeEntries(),
		getHoveredNodeId: () => null,
		getForwardLinks: () => [],
		getBacklinks: () => [],
		toggleNodeVisibility: vi.fn(),
		jumpToNode: vi.fn(),
		invalidateDataKeepPanel: vi.fn(),
	} as any;
}

function makeCtx(): PanelContext {
	return {} as any;
}

// Import AFTER mocks so vi.mock is applied.
import {
	buildNodesStatsSection,
	buildNodesFilterSection,
	buildNodesTreeSection,
	buildNodesLegendSection,
	buildNodesTab,
} from "../../src/views/panel-sections-nodes-tab";

describe("panel-sections-nodes-tab", () => {
	describe("buildNodesStatsSection", () => {
		it("creates stats bar with total/visible/hidden counts", () => {
			const tab = makeMockEl();
			buildNodesStatsSection(tab, 10, 7, 3);
			const statsBar = tab.children.find((c) => c.cls === "gi-node-stats");
			expect(statsBar).toBeDefined();
			const texts = statsBar!.children.map((c) => c.text);
			expect(texts).toContain("10 total");
			expect(texts).toContain("7 visible");
			expect(texts).toContain("3 hidden");
		});

		it("omits hidden span when hidden=0", () => {
			const tab = makeMockEl();
			buildNodesStatsSection(tab, 5, 5, 0);
			const statsBar = tab.children.find((c) => c.cls === "gi-node-stats");
			const texts = statsBar!.children.map((c) => c.text);
			expect(texts).toContain("5 total");
			expect(texts).toContain("5 visible");
			expect(texts.find((t) => t?.includes("hidden"))).toBeUndefined();
		});
	});

	describe("buildNodesFilterSection", () => {
		it("creates filter input + sort select with 4 sort options", () => {
			const tab = makeMockEl();
			const { filterInput, sortSelect } = buildNodesFilterSection(tab, new Map(), new Set());
			expect(filterInput.tagName).toBe("input");
			expect(sortSelect.tagName).toBe("select");
			expect(sortSelect.children.length).toBe(4);
			expect(sortSelect.children.map((c) => c.text)).toEqual(["A-Z", "Path", "Visible", "Degree"]);
		});

		it("passes through degreeLookup and excludeSet for later wiring", () => {
			const tab = makeMockEl();
			const dl = new Map([["n1", 5]]);
			const es = new Set(["n2"]);
			const result = buildNodesFilterSection(tab, dl, es);
			expect(result.degreeLookup).toBe(dl);
			expect(result.excludeSet).toBe(es);
		});
	});

	describe("buildNodesTreeSection", () => {
		it("creates tree container and wires filter/sort handlers", () => {
			const tab = makeMockEl();
			const filterInput = makeMockEl("input");
			filterInput.value = "";
			const sortSelect = makeMockEl("select");
			sortSelect.value = "name";
			const tree = buildNodesTreeSection(
				tab,
				makeEntries(),
				makePanel(),
				makeCb(),
				filterInput as any,
				sortSelect as any,
				new Map(),
				new Set(),
			);
			expect(tree.cls).toBe("gi-node-tree");
			expect(filterInput.handlers["input"]).toBeDefined();
			expect(sortSelect.handlers["change"]).toBeDefined();
		});
	});

	describe("buildNodesLegendSection", () => {
		it("creates legend with 3 color swatches + CSV export button", () => {
			const tab = makeMockEl();
			buildNodesLegendSection(tab, makeEntries());
			const legend = tab.children.find((c) => c.cls === "gi-node-legend");
			expect(legend).toBeDefined();
			// 3 legend items + 1 CSV button
			const btn = legend!.children.find((c) => c.cls === "gi-node-export-btn");
			expect(btn).toBeDefined();
			expect(btn!.text).toBe("export.csvBtn");
		});
	});

	describe("buildNodesTab (orchestrator)", () => {
		it("invokes each section builder exactly once in order", () => {
			const tab = makeMockEl();
			buildNodesTab(tab, makePanel(), makeCtx(), makeCb());
			const classes = tab.children.map((c) => c.cls);
			// Expected section classes in DOM order
			expect(classes).toEqual(
				expect.arrayContaining([
					"gi-node-stats",
					"gi-node-tree-filter",
					"gi-node-tree",
					"gi-node-legend",
				]),
			);
			expect(classes.indexOf("gi-node-stats")).toBeLessThan(classes.indexOf("gi-node-tree-filter"));
			expect(classes.indexOf("gi-node-tree-filter")).toBeLessThan(classes.indexOf("gi-node-tree"));
			expect(classes.indexOf("gi-node-tree")).toBeLessThan(classes.indexOf("gi-node-legend"));
		});

		it("calls getForwardLinks/getBacklinks for each entry to build degree lookup", () => {
			const cb = makeCb();
			const fwdSpy = vi.spyOn(cb, "getForwardLinks");
			const bkSpy = vi.spyOn(cb, "getBacklinks");
			buildNodesTab(makeMockEl(), makePanel(), makeCtx(), cb);
			// 3 entries → called 3 times each
			expect(fwdSpy).toHaveBeenCalledTimes(3);
			expect(bkSpy).toHaveBeenCalledTimes(3);
		});
	});
});
