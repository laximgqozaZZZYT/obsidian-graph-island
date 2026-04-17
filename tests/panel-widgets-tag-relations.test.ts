/**
 * Tests for renderTagRelations and renderCustomMappings from panel-widgets.
 * We mock document.createElement to avoid DOM issues with attachDatalist.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";

// Setup global document mock before any imports
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
		});
		return el;
	};
});

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));

import { renderTagRelations, renderCustomMappings, addMultiValueInput } from "../src/views/panel-widgets";
import type { GraphViewsSettings, OntologySettings } from "../src/types";
import { EDGE_TYPE_INHERITANCE } from "../src/constants";

// ---------------------------------------------------------------------------
// Augment mock elements
// ---------------------------------------------------------------------------
function augmentEl(el: any): any {
	const augment = (node: any) => {
		if (!node) return;
		if (node.style && !node.style.setProperty) {
			node.style.setProperty = (k: string, v: string) => {
				node.style[k] = v;
			};
		}
		if (!node.hasClass) node.hasClass = (c: string) => (node.cls ?? "").includes(c);
		if (!node.toggleClass) node.toggleClass = () => {};
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

function makeSettings(ontology: Partial<OntologySettings> = {}): GraphViewsSettings {
	return {
		ontology: {
			rules: [],
			tagRelations: [],
			customMappings: {},
			...ontology,
		},
	} as any;
}

function makeCtx(overrides: any = {}): any {
	return {
		frontmatterKeys: [],
		availableTags: ["tag1", "tag2", "tag3"],
		settings: makeSettings(),
		saveSettings: vi.fn(),
		...overrides,
	};
}

function makeCb(): any {
	return {
		invalidateDataKeepPanel: vi.fn(),
		recolorNodes: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		collectValueSuggestions: vi.fn(() => []),
	};
}

// ===========================================================================
// renderTagRelations
// ===========================================================================
describe("renderTagRelations", () => {
	it("renders empty state with add button", () => {
		const container = makeContainer();
		const s = makeSettings({ tagRelations: [] });
		renderTagRelations(container as any, s, makeCtx(), makeCb());

		const addBtn = findEl(container, ".gi-add-group");
		expect(addBtn).not.toBeNull();
	});

	it("renders rows for existing tag relations", () => {
		const container = makeContainer();
		const s = makeSettings({
			tagRelations: [
				{ source: "character", target: "entity", type: "inheritance" },
				{ source: "location", target: "place", type: "aggregation" },
			],
		});
		renderTagRelations(container as any, s, makeCtx(), makeCb());

		const rows = findAllEl(container, ".gi-tag-rel-row");
		expect(rows.length).toBe(2);
	});

	it("creates source and target inputs", () => {
		const container = makeContainer();
		const s = makeSettings({
			tagRelations: [{ source: "src", target: "tgt", type: "inheritance" }],
		});
		renderTagRelations(container as any, s, makeCtx(), makeCb());

		const srcInput = findEl(container, ".gi-tag-rel-src");
		const tgtInput = findEl(container, ".gi-tag-rel-tgt");
		expect(srcInput).not.toBeNull();
		expect(tgtInput).not.toBeNull();
	});

	it("creates type select dropdown", () => {
		const container = makeContainer();
		const s = makeSettings({
			tagRelations: [{ source: "a", target: "b", type: "inheritance" }],
		});
		renderTagRelations(container as any, s, makeCtx(), makeCb());

		const select = findEl(container, "select");
		expect(select).not.toBeNull();
		const options = findAllEl(container, "option");
		expect(options.length).toBe(2); // inheritance, aggregation
	});

	it("creates remove button", () => {
		const container = makeContainer();
		const s = makeSettings({
			tagRelations: [{ source: "a", target: "b", type: "inheritance" }],
		});
		renderTagRelations(container as any, s, makeCtx(), makeCb());

		const removeBtn = findEl(container, ".gi-tag-rel-remove");
		expect(removeBtn).not.toBeNull();
	});

	it("clicking remove removes the relation", () => {
		const container = makeContainer();
		const s = makeSettings({
			tagRelations: [
				{ source: "a", target: "b", type: "inheritance" },
				{ source: "c", target: "d", type: "aggregation" },
			],
		});
		const ctx = makeCtx();
		const cb = makeCb();
		renderTagRelations(container as any, s, ctx, cb);

		const removeBtns = findAllEl(container, ".gi-tag-rel-remove");
		expect(removeBtns.length).toBe(2);
		removeBtns[0].listeners["click"]?.[0]?.();
		expect(s.ontology.tagRelations.length).toBe(1);
		expect(cb.invalidateDataKeepPanel).toHaveBeenCalled();
	});

	it("clicking add button adds new relation", () => {
		const container = makeContainer();
		const s = makeSettings({ tagRelations: [] });
		renderTagRelations(container as any, s, makeCtx(), makeCb());

		const addBtn = findEl(container, ".gi-add-group");
		addBtn!.listeners["click"]?.[0]?.();
		expect(s.ontology.tagRelations.length).toBe(1);
		expect(s.ontology.tagRelations[0].source).toBe("");
		expect(s.ontology.tagRelations[0].type).toBe(EDGE_TYPE_INHERITANCE);
	});

	it("initializes tagRelations if undefined", () => {
		const container = makeContainer();
		const s = { ontology: {} } as any;
		renderTagRelations(container as any, s, makeCtx(), makeCb());
		expect(Array.isArray(s.ontology.tagRelations)).toBe(true);
	});
});

// ===========================================================================
// renderCustomMappings
// ===========================================================================
describe("renderCustomMappings", () => {
	it("renders with empty custom mappings", () => {
		const container = makeContainer();
		const s = makeSettings();
		renderCustomMappings(container as any, s, makeCtx(), makeCb());

		// Should render add button
		const addBtn = findEl(container, ".gi-add-group");
		expect(addBtn).not.toBeNull();
	});

	it("initializes customMappings if undefined", () => {
		const container = makeContainer();
		const s = { ontology: {} } as any;
		renderCustomMappings(container as any, s, makeCtx(), makeCb());
		expect(typeof s.ontology.customMappings).toBe("object");
	});

	it("renders rows for existing mappings", () => {
		const container = makeContainer();
		const s = makeSettings();
		s.ontology.customMappings = { Author: "is-a", Location: "has-a" };
		renderCustomMappings(container as any, s, makeCtx(), makeCb());

		const rows = findAllEl(container, ".gi-mapping-row");
		expect(rows.length).toBe(2);
	});
});

// ===========================================================================
// addMultiValueInput
// ===========================================================================
describe("addMultiValueInput", () => {
	it("creates the multi-value input container", () => {
		const container = makeContainer();
		addMultiValueInput(container as any, "Tags", ["a", "b"], "add...", ["x", "y"], vi.fn());

		const text = allText(container);
		expect(text).toContain("Tags");
	});

	it("renders a row per existing value", () => {
		const container = makeContainer();
		addMultiValueInput(container as any, "Items", ["one", "two", "three"], "", [], vi.fn());

		const rows = findAllEl(container, ".gi-multivalue-row");
		expect(rows.length).toBe(3);
	});

	it("renders add button", () => {
		const container = makeContainer();
		addMultiValueInput(container as any, "Vals", [], "...", [], vi.fn());

		const addBtn = findEl(container, ".gi-multivalue-add");
		expect(addBtn).not.toBeNull();
	});

	it("renders remove buttons for each value", () => {
		const container = makeContainer();
		addMultiValueInput(container as any, "V", ["a", "b"], "", [], vi.fn());

		const removeBtns = findAllEl(container, ".gi-remove-btn");
		expect(removeBtns.length).toBe(2);
	});
});
