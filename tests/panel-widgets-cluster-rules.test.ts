/**
 * Tests for renderClusterRuleList, renderGroupList, renderNodeRuleList.
 * Mocks document.createElement for attachFixedHint/attachQueryHint.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";

// Setup global document mock
beforeAll(() => {
	if (typeof globalThis.document === "undefined") {
		(globalThis as any).document = {};
	}
	(globalThis.document as any).createElement = (tag: string) => {
		const el = createMockEl(tag);
		Object.assign(el, {
			className: "",
			parentNode: el,
			parentElement: el,
			insertBefore: vi.fn((n: any) => n),
			appendChild: vi.fn((n: any) => {
				el.children.push(n);
				return n;
			}),
			closest: () => el,
			getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 }),
			focus: vi.fn(),
			dispatchEvent: vi.fn(),
			querySelectorAll: () => [],
		});
		return el;
	};
});

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));

import {
	renderClusterRuleList,
	renderGroupList,
	renderNodeRuleList,
	renderSortRuleList,
} from "../src/views/panel-widgets";
import { createDefaultPanel, type PanelState } from "../src/views/PanelBuilder";

function augmentEl(el: any): any {
	const augment = (node: any) => {
		if (!node) return;
		if (node.style && !node.style.setProperty)
			node.style.setProperty = (k: string, v: string) => {
				node.style[k] = v;
			};
		if (!node.hasClass) node.hasClass = (c: string) => (node.cls ?? "").includes(c);
		if (!node.toggleClass)
			node.toggleClass = (c: string, force: boolean) => {
				if (!node.classList?.items) return;
				if (force) node.classList.items.push(c);
				else {
					const idx = node.classList.items.indexOf(c);
					if (idx >= 0) node.classList.items.splice(idx, 1);
				}
			};
		if (!node.closest) node.closest = () => null;
		if (!node.parentElement) node.parentElement = node;
		if (!node.parentNode) node.parentNode = node;
		if (!node.getBoundingClientRect)
			node.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
		if (!node.insertBefore) node.insertBefore = vi.fn((n: any) => n);
		if (!node.appendChild)
			node.appendChild = vi.fn((c: any) => {
				node.children.push(c);
				return c;
			});
		if (!node.focus) node.focus = vi.fn();
		if (!node.dispatchEvent) node.dispatchEvent = vi.fn();
		if (!node.querySelectorAll) node.querySelectorAll = () => [];
		const origCreateEl = node.createEl?.bind(node);
		if (origCreateEl)
			node.createEl = (...a: any[]) => {
				const c = origCreateEl(...a);
				augment(c);
				return c;
			};
		const origCreateDiv = node.createDiv?.bind(node);
		if (origCreateDiv)
			node.createDiv = (...a: any[]) => {
				const c = origCreateDiv(...a);
				augment(c);
				return c;
			};
		const origCreateSpan = node.createSpan?.bind(node);
		if (origCreateSpan)
			node.createSpan = (...a: any[]) => {
				const c = origCreateSpan(...a);
				augment(c);
				return c;
			};
	};
	augment(el);
	return el;
}

function makeContainer(): any {
	return augmentEl(createMockEl());
}

function makeCtx(): any {
	return {
		frontmatterKeys: ["category", "node_type"],
		availableTags: [],
		settings: {} as any,
		saveSettings: vi.fn(),
	};
}

function makeCb(): any {
	return {
		applyClusterForce: vi.fn(),
		restartSimulation: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		rebuildPanel: vi.fn(),
		recolorNodes: vi.fn(),
		collectValueSuggestions: vi.fn(() => []),
		applyDirectionalGravityForce: vi.fn(),
		applyNodeRules: vi.fn(),
	};
}

// ===========================================================================
// renderClusterRuleList
// ===========================================================================
describe("renderClusterRuleList", () => {
	it("renders empty when no cluster rules", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.clusterGroupRules = [];
		renderClusterRuleList(container as any, panel, makeCtx(), makeCb());
		// No rows
		const rows = findAllEl(container, ".gi-expr-row");
		expect(rows.length).toBe(0);
	});

	it("renders rows for existing cluster rules", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.clusterGroupRules = [
			{ groupBy: "tag:?", recursive: false },
			{ groupBy: "category:?", recursive: true },
		];
		renderClusterRuleList(container as any, panel, makeCtx(), makeCb());

		const rows = findAllEl(container, ".gi-expr-row");
		expect(rows.length).toBe(2);
	});

	it("creates field input for each rule", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.clusterGroupRules = [{ groupBy: "folder:?", recursive: false }];
		renderClusterRuleList(container as any, panel, makeCtx(), makeCb());

		const input = findEl(container, ".gi-expr-field");
		expect(input).not.toBeNull();
	});

	it("creates recursive toggle", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.clusterGroupRules = [{ groupBy: "tag:?", recursive: true }];
		renderClusterRuleList(container as any, panel, makeCtx(), makeCb());

		const recWrap = findEl(container, ".gi-rec-wrap");
		expect(recWrap).not.toBeNull();
	});

	it("creates remove button", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.clusterGroupRules = [{ groupBy: "tag:?", recursive: false }];
		renderClusterRuleList(container as any, panel, makeCtx(), makeCb());

		const rm = findEl(container, ".gi-group-remove");
		expect(rm).not.toBeNull();
	});

	it("clicking remove splices rule and calls cluster force", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.clusterGroupRules = [
			{ groupBy: "tag:?", recursive: false },
			{ groupBy: "category:?", recursive: false },
		];
		const cb = makeCb();
		renderClusterRuleList(container as any, panel, makeCtx(), cb);

		const rmBtns = findAllEl(container, ".gi-group-remove");
		rmBtns[0].listeners["click"]?.[0]?.();
		expect(panel.clusterGroupRules.length).toBe(1);
		expect(cb.applyClusterForce).toHaveBeenCalled();
	});
});

// ===========================================================================
// renderNodeRuleList
// ===========================================================================
describe("renderNodeRuleList", () => {
	it("renders empty when no node rules", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.nodeRules = [];
		renderNodeRuleList(container as any, panel, makeCtx(), makeCb());
		const items = findAllEl(container, ".gi-noderule-item");
		expect(items.length).toBe(0);
	});

	it("renders items for existing node rules", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.nodeRules = [
			{ query: "tag:char", spacingMultiplier: 1.5, color: "#ff0000" },
			{ query: "*", spacingMultiplier: 1.0, color: "" },
		];
		renderNodeRuleList(container as any, panel, makeCtx(), makeCb());
		const items = findAllEl(container, ".gi-noderule-item");
		expect(items.length).toBe(2);
	});

	it("creates query input for each rule", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.nodeRules = [{ query: "tag:x", spacingMultiplier: 1.0, color: "" }];
		renderNodeRuleList(container as any, panel, makeCtx(), makeCb());
		const queryInput = findEl(container, ".gi-query-input");
		expect(queryInput).not.toBeNull();
	});

	it("creates spacing slider", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.nodeRules = [{ query: "*", spacingMultiplier: 2.0, color: "" }];
		renderNodeRuleList(container as any, panel, makeCtx(), makeCb());
		const spacingRow = findEl(container, ".gi-spacing-row");
		expect(spacingRow).not.toBeNull();
	});

	it("creates remove button", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.nodeRules = [{ query: "tag:x", spacingMultiplier: 1.0, color: "" }];
		renderNodeRuleList(container as any, panel, makeCtx(), makeCb());
		const rm = findEl(container, ".gi-remove-btn");
		expect(rm).not.toBeNull();
	});

	it("clicking remove splices rule", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.nodeRules = [
			{ query: "a", spacingMultiplier: 1, color: "" },
			{ query: "b", spacingMultiplier: 2, color: "" },
		];
		const cb = makeCb();
		renderNodeRuleList(container as any, panel, makeCtx(), cb);
		const rmBtns = findAllEl(container, ".gi-remove-btn");
		rmBtns[0].listeners["click"]?.[0]?.();
		expect(panel.nodeRules.length).toBe(1);
		expect(cb.applyNodeRules).toHaveBeenCalled();
	});

	it("creates color picker", () => {
		const container = makeContainer();
		const panel = createDefaultPanel();
		panel.nodeRules = [{ query: "*", spacingMultiplier: 1, color: "#ff0000" }];
		renderNodeRuleList(container as any, panel, makeCtx(), makeCb());
		const colorPicker = findEl(container, ".gi-color-picker");
		expect(colorPicker).not.toBeNull();
	});
});
