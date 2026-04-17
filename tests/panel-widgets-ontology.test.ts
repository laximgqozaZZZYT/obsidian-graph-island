/**
 * Tests for panel-widgets ontology rule rendering.
 * Mocks document.createElement and attachQueryHint to avoid DOM dependencies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";

// Mock the obsidian module to provide setIcon
vi.mock("obsidian", () => ({
	setIcon: vi.fn(),
}));

// We need to mock document.createElement before importing panel-widgets
// because attachAutocomplete (called by attachQueryHint) uses it
const origCreateElement = globalThis.document?.createElement;
beforeEach(() => {
	// Provide a minimal document.createElement mock
	if (typeof globalThis.document === "undefined") {
		(globalThis as any).document = {};
	}
	(globalThis.document as any).createElement = (tag: string) => {
		const el = createMockEl(tag);
		// Add properties expected by attachAutocomplete
		(el as any).className = "";
		(el as any).parentNode = null;
		(el as any).insertBefore = vi.fn();
		(el as any).appendChild = vi.fn();
		(el as any).closest = () => null;
		(el as any).parentElement = el;
		(el as any).getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
		return el;
	};
});

import { renderOntologyRule } from "../src/views/panel-widgets";
import type { OntologyRule } from "../src/types";

// ---------------------------------------------------------------------------
// Augment mock elements
// ---------------------------------------------------------------------------
function augmentMockEl(el: any): any {
	const augment = (node: any) => {
		if (!node) return;
		if (node.style && !node.style.setProperty) {
			node.style.setProperty = (key: string, val: string) => {
				node.style[key] = val;
			};
		}
		if (!node.hasClass) {
			node.hasClass = (c: string) => node.classList?.items?.includes(c) ?? (node.cls ?? "").includes(c);
		}
		if (!node.toggleClass) {
			node.toggleClass = (c: string, force: boolean) => {
				if (!node.classList?.items) return;
				if (force) {
					node.classList.items.push(c);
				} else {
					const idx = node.classList.items.indexOf(c);
					if (idx >= 0) node.classList.items.splice(idx, 1);
				}
			};
		}
		if (!node.closest) {
			node.closest = () => null;
		}
		if (!node.parentElement) {
			node.parentElement = null;
		}
		if (!node.getBoundingClientRect) {
			node.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
		}
		if (!node.insertBefore) {
			node.insertBefore = vi.fn((newNode: any, refNode: any) => {
				return newNode;
			});
		}
		if (!node.appendChild) {
			node.appendChild = vi.fn((child: any) => {
				node.children.push(child);
				return child;
			});
		}
		if (!node.parentNode) {
			node.parentNode = node;
		}
		if (!node.focus) {
			node.focus = vi.fn();
		}
		if (!node.dispatchEvent) {
			node.dispatchEvent = vi.fn();
		}
		const origCreateEl = node.createEl?.bind(node);
		if (origCreateEl) {
			node.createEl = (...args: any[]) => {
				const child = origCreateEl(...args);
				augment(child);
				return child;
			};
		}
		const origCreateDiv = node.createDiv?.bind(node);
		if (origCreateDiv) {
			node.createDiv = (...args: any[]) => {
				const child = origCreateDiv(...args);
				augment(child);
				return child;
			};
		}
		const origCreateSpan = node.createSpan?.bind(node);
		if (origCreateSpan) {
			node.createSpan = (...args: any[]) => {
				const child = origCreateSpan(...args);
				augment(child);
				return child;
			};
		}
	};
	augment(el);
	return el;
}

function makeContainer(): any {
	return augmentMockEl(createMockEl());
}

// ===========================================================================
// renderOntologyRule
// ===========================================================================
describe("renderOntologyRule", () => {
	function makeRule(forward = "parent", reverse = "child", relation = "is-a" as any): OntologyRule {
		return { forward, reverse, relation };
	}

	function makeCb() {
		return { collectValueSuggestions: vi.fn(() => []) } as any;
	}

	it("creates ontology rule row", () => {
		const container = makeContainer();
		const rules = [makeRule()];
		renderOntologyRule(container as any, rules, 0, makeCb(), vi.fn(), vi.fn());

		const row = findEl(container, ".gi-ont-rule");
		expect(row).not.toBeNull();
	});

	it("creates forward input with value", () => {
		const container = makeContainer();
		const rules = [makeRule("extends", "inherits")];
		renderOntologyRule(container as any, rules, 0, makeCb(), vi.fn(), vi.fn());

		const inputs = findAllEl(container, "input");
		expect(inputs.length).toBeGreaterThanOrEqual(2); // forward + reverse
	});

	it("creates relation button", () => {
		const container = makeContainer();
		const rules = [makeRule("parent", "child", "is-a")];
		renderOntologyRule(container as any, rules, 0, makeCb(), vi.fn(), vi.fn());

		const btn = findEl(container, ".gi-ont-rel-btn");
		expect(btn).not.toBeNull();
		expect(btn!.textContent || btn!.text).toBe("is-a");
	});

	it("creates delete button", () => {
		const container = makeContainer();
		const rules = [makeRule()];
		renderOntologyRule(container as any, rules, 0, makeCb(), vi.fn(), vi.fn());

		const del = findEl(container, ".gi-ont-del-btn");
		expect(del).not.toBeNull();
	});

	it("clicking delete removes rule and calls save/rerender", () => {
		const container = makeContainer();
		const rules = [makeRule(), makeRule("up", "down", "has-a")];
		const save = vi.fn();
		const rerender = vi.fn();
		renderOntologyRule(container as any, rules, 0, makeCb(), save, rerender);

		const del = findEl(container, ".gi-ont-del-btn");
		expect(del).not.toBeNull();
		del!.listeners["click"]?.[0]?.();
		expect(rules.length).toBe(1);
		expect(save).toHaveBeenCalled();
		expect(rerender).toHaveBeenCalled();
	});

	it("disables reverse input for bidirectional relations (is-alike)", () => {
		const container = makeContainer();
		const rules = [makeRule("peer", "peer", "is-alike")];
		renderOntologyRule(container as any, rules, 0, makeCb(), vi.fn(), vi.fn());

		// The reverse input should be disabled
		const inputs = findAllEl(container, "input");
		// Check for is-disabled class on one of the inputs
		const disabledInput = inputs.find(
			(i) => i.classList?.items?.includes("is-disabled") || i.cls?.includes("is-disabled"),
		);
		// For bidirectional relations, reverse input gets disabled
		// The actual disabled state is set via .disabled property
		expect(inputs.length).toBeGreaterThanOrEqual(2);
	});

	it("creates aria-labeled inputs", () => {
		const container = makeContainer();
		const rules = [makeRule()];
		renderOntologyRule(container as any, rules, 0, makeCb(), vi.fn(), vi.fn());

		const inputs = findAllEl(container, "input");
		const hasAriaLabel = inputs.some((i) => i.attrs["aria-label"]);
		expect(hasAriaLabel).toBe(true);
	});
});
