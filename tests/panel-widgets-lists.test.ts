/**
 * Tests for panel-widgets list rendering functions:
 * renderSortRuleList, addSelect with callback behavior.
 */
import { describe, it, expect, vi } from "vitest";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";
import { renderSortRuleList, getSortKeyOptions, getGravityDirOptions, addSelect } from "../src/views/panel-widgets";
import { createDefaultPanel, type PanelCallbacks, type PanelState } from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Augment mock elements with additional DOM APIs
// ---------------------------------------------------------------------------
function augmentMockEl(el: any): any {
	const augment = (node: any) => {
		if (node.style && !node.style.setProperty) {
			node.style.setProperty = (key: string, val: string) => {
				node.style[key] = val;
			};
		}
		if (!node.hasClass) {
			node.hasClass = (c: string) => node.classList?.items?.includes(c) ?? false;
		}
		if (!node.toggleClass) {
			node.toggleClass = (c: string, force: boolean) => {
				if (force) {
					node.classList?.items?.push(c);
				} else {
					const idx = node.classList?.items?.indexOf(c);
					if (idx >= 0) node.classList?.items?.splice(idx, 1);
				}
			};
		}
		const origCreateEl = node.createEl.bind(node);
		node.createEl = (...args: any[]) => {
			const child = origCreateEl(...args);
			augment(child);
			return child;
		};
		const origCreateDiv = node.createDiv.bind(node);
		node.createDiv = (...args: any[]) => {
			const child = origCreateDiv(...args);
			augment(child);
			return child;
		};
		const origCreateSpan = node.createSpan.bind(node);
		node.createSpan = (...args: any[]) => {
			const child = origCreateSpan(...args);
			augment(child);
			return child;
		};
	};
	augment(el);
	return el;
}

function makeContainer(): any {
	return augmentMockEl(createMockEl());
}

function makeCb(overrides: Partial<PanelCallbacks> = {}): PanelCallbacks {
	return {
		recolorNodes: vi.fn(),
		applyClusterForce: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		collectValueSuggestions: vi.fn(() => []),
		...overrides,
	} as any;
}

// ===========================================================================
// getSortKeyOptions
// ===========================================================================
describe("getSortKeyOptions", () => {
	it("returns array of sort key options", () => {
		const opts = getSortKeyOptions();
		expect(Array.isArray(opts)).toBe(true);
		expect(opts.length).toBeGreaterThan(0);
	});

	it("includes degree option", () => {
		const opts = getSortKeyOptions();
		expect(opts.some((o) => o.value === "degree")).toBe(true);
	});

	it("includes label option", () => {
		const opts = getSortKeyOptions();
		expect(opts.some((o) => o.value === "label")).toBe(true);
	});

	it("includes importance option", () => {
		const opts = getSortKeyOptions();
		expect(opts.some((o) => o.value === "importance")).toBe(true);
	});

	it("all options have value and label", () => {
		const opts = getSortKeyOptions();
		for (const opt of opts) {
			expect(typeof opt.value).toBe("string");
			expect(typeof opt.label).toBe("string");
			expect(opt.value.length).toBeGreaterThan(0);
			expect(opt.label.length).toBeGreaterThan(0);
		}
	});
});

// ===========================================================================
// getGravityDirOptions
// ===========================================================================
describe("getGravityDirOptions", () => {
	it("returns array of direction options", () => {
		const opts = getGravityDirOptions();
		expect(Array.isArray(opts)).toBe(true);
		expect(opts.length).toBeGreaterThan(0);
	});

	it("includes cardinal directions", () => {
		const opts = getGravityDirOptions();
		const values = opts.map((o) => o.value);
		// Should include N/S/E/W or similar
		expect(values.length).toBeGreaterThanOrEqual(4);
	});
});

// ===========================================================================
// renderSortRuleList
// ===========================================================================
describe("renderSortRuleList", () => {
	it("renders empty when no sort rules", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.sortRules = [];
		renderSortRuleList(container as any, panel, makeCb());

		expect(container.children.length).toBe(0);
	});

	it("renders one row per sort rule", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.sortRules = [
			{ key: "degree", order: "desc" },
			{ key: "label", order: "asc" },
		];
		renderSortRuleList(container as any, panel, makeCb());

		const rows = findAllEl(container, ".gi-group-item");
		expect(rows.length).toBe(2);
	});

	it("renders sort key dropdown with options", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.sortRules = [{ key: "degree", order: "desc" }];
		renderSortRuleList(container as any, panel, makeCb());

		const select = findEl(container, "select");
		expect(select).not.toBeNull();
		const options = findAllEl(container, "option");
		expect(options.length).toBeGreaterThan(0);
	});

	it("renders order toggle button", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.sortRules = [{ key: "degree", order: "asc" }];
		renderSortRuleList(container as any, panel, makeCb());

		const btn = findEl(container, ".gi-direction-btn");
		expect(btn).not.toBeNull();
	});

	it("renders remove button", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.sortRules = [{ key: "degree", order: "desc" }];
		renderSortRuleList(container as any, panel, makeCb());

		const rm = findEl(container, ".gi-group-remove");
		expect(rm).not.toBeNull();
	});

	it("clicking remove button removes rule", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.sortRules = [
			{ key: "degree", order: "desc" },
			{ key: "label", order: "asc" },
		];
		const cb = makeCb();
		renderSortRuleList(container as any, panel, cb);

		const rmBtns = findAllEl(container, ".gi-group-remove");
		expect(rmBtns.length).toBe(2);

		// Click first remove button
		rmBtns[0].listeners["click"]?.[0]?.();
		expect(panel.sortRules.length).toBe(1);
		expect(cb.applyClusterForce).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("clicking order button toggles between asc and desc", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.sortRules = [{ key: "degree", order: "asc" }];
		const cb = makeCb();
		renderSortRuleList(container as any, panel, cb);

		const orderBtn = findEl(container, ".gi-direction-btn");
		expect(orderBtn).not.toBeNull();
		orderBtn!.listeners["click"]?.[0]?.();
		expect(panel.sortRules[0].order).toBe("desc");
		expect(cb.applyClusterForce).toHaveBeenCalled();
	});
});
