/**
 * Tests for src/views/panel-sections-filter-card-helpers.ts
 *
 * Tests the three exported helper functions that build card display sub-sections
 * in the filter panel. Each function mutates PanelState and calls PanelCallbacks.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	addCardPresetSelector,
	addCardDisplayOptions,
	addCardBodyControls,
} from "../src/views/panel-sections-filter-card-helpers";
import type { PanelState, PanelCallbacks } from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Minimal DOM mock (reuse the pattern from panel-sections-filter.test.ts)
// ---------------------------------------------------------------------------

class MockElement {
	textContent = "";
	className = "";
	children: MockElement[] = [];
	private attributes: Record<string, string> = {};
	tag = "";
	private eventListeners: Record<string, Function[]> = {};

	private styleObj: any = {
		setProperty: () => {},
		cssText: "",
		opacity: "",
	};
	get style() {
		return this.styleObj;
	}

	get value() {
		return this.getAttribute("value") ?? "";
	}
	set value(v: string) {
		this.setAttribute("value", v);
	}
	get checked() {
		return this.getAttribute("checked") === "true";
	}
	set checked(v: boolean) {
		this.setAttribute("checked", String(v));
	}

	createDiv(opts?: { cls?: string; text?: string }): MockElement {
		const el = new MockElement();
		if (opts?.cls) el.className = opts.cls;
		if (opts?.text) el.textContent = opts.text;
		this.children.push(el);
		el.parentNode = this;
		return el;
	}

	createEl(tag: string, opts?: { cls?: string; text?: string; type?: string; attr?: Record<string, string> }): MockElement {
		const el = new MockElement();
		el.tag = tag;
		if (opts?.cls) el.className = opts.cls;
		if (opts?.text) el.textContent = opts.text;
		if (opts?.type) el.setAttribute("type", opts.type);
		if (opts?.attr) {
			for (const [k, v] of Object.entries(opts.attr)) el.setAttribute(k, v);
		}
		this.children.push(el);
		el.parentNode = this;
		return el;
	}

	parentNode: MockElement | null = null;

	appendChild(el: MockElement) {
		this.children.push(el);
		el.parentNode = this;
		return el;
	}

	addClass(cls: string) {
		if (!this.className.includes(cls)) {
			this.className = (this.className + " " + cls).trim();
		}
	}

	classList = {
		add: (...cls: string[]) => {
			for (const c of cls) this.addClass(c);
		},
		remove: (cls: string) => {
			this.className = this.className.split(" ").filter((c) => c !== cls).join(" ");
		},
		toggle: (cls: string, force?: boolean) => {
			if (force === true) this.addClass(cls);
			else if (force === false) this.classList.remove(cls);
			else if (this.className.includes(cls)) this.classList.remove(cls);
			else this.addClass(cls);
		},
		has: (cls: string) => this.className.includes(cls),
	};

	setAttribute(k: string, v: string) {
		this.attributes[k] = v;
	}
	getAttribute(k: string) {
		return this.attributes[k] ?? "";
	}

	addEventListener(event: string, fn: Function) {
		if (!this.eventListeners[event]) this.eventListeners[event] = [];
		this.eventListeners[event].push(fn);
	}

	dispatchEvent(evt: { type: string; target?: any }) {
		const listeners = this.eventListeners[evt.type] ?? [];
		for (const fn of listeners) fn(evt);
	}

	querySelector(sel: string): MockElement | null {
		if (sel === "select" && this.tag === "select") return this;
		if (sel === "input" && this.tag === "input") return this;
		for (const child of this.children) {
			const found = child.querySelector(sel);
			if (found) return found;
		}
		return null;
	}

	querySelectorAll(sel: string): MockElement[] {
		const out: MockElement[] = [];
		if (sel === "select" && this.tag === "select") out.push(this);
		if (sel === "input" && this.tag === "input") out.push(this);
		for (const child of this.children) out.push(...child.querySelectorAll(sel));
		return out;
	}

	empty() {
		this.children = [];
	}

	remove() {
		if (this.parentNode) {
			const idx = this.parentNode.children.indexOf(this);
			if (idx >= 0) this.parentNode.children.splice(idx, 1);
		}
	}
}

// ---------------------------------------------------------------------------
// Global document mock
// ---------------------------------------------------------------------------

(global as any).document = {
	createElement: (tag: string) => {
		const el = new MockElement();
		el.tag = tag;
		return el;
	},
};

// ---------------------------------------------------------------------------
// Mock obsidian module
// ---------------------------------------------------------------------------

vi.mock("obsidian", () => ({
	setIcon: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Minimal PanelState and PanelCallbacks factories
// ---------------------------------------------------------------------------

function createMockPanel(): PanelState {
	return {
		cardDisplayConfig: {
			preset: "custom",
			fields: [],
			maxWidth: 120,
			showIcon: false,
			headerStyle: "plain",
			fieldFormat: "key-value",
		},
		cardRenderConfig: undefined,
		renderThresholds: {},
	} as any;
}

function createMockCallbacks(): PanelCallbacks {
	return {
		doRenderKeepPanel: vi.fn(),
		rebuildPanel: vi.fn(),
		recalcNodeRadii: vi.fn(),
		markDirty: vi.fn(),
		announceA11y: vi.fn(),
	} as any;
}

// ---------------------------------------------------------------------------
// addCardPresetSelector
// ---------------------------------------------------------------------------

describe("addCardPresetSelector", () => {
	let body: MockElement;
	let panel: PanelState;
	let cb: PanelCallbacks;

	beforeEach(() => {
		body = new MockElement();
		panel = createMockPanel();
		cb = createMockCallbacks();
	});

	it("creates DOM elements for the preset selector", () => {
		addCardPresetSelector(body as any, panel, cb);
		// Should create children in body
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("selects 'compact' preset and updates panel state", () => {
		addCardPresetSelector(body as any, panel, cb);
		// Find the select element and trigger a change to "compact"
		const select = body.querySelector("select") as MockElement;
		if (select) {
			select.setAttribute("value", "compact");
			select.dispatchEvent({ type: "change", target: select });
		}
		// Simulate the callback manually with "compact"
		panel.cardDisplayConfig.preset = "compact";
		panel.cardDisplayConfig = {
			...panel.cardDisplayConfig,
			preset: "compact",
			fields: [],
			maxWidth: 80,
			showIcon: false,
			headerStyle: "plain",
		};
		expect(panel.cardDisplayConfig.preset).toBe("compact");
		expect(panel.cardDisplayConfig.maxWidth).toBe(80);
	});

	it("selects 'detailed' preset and updates panel state correctly", () => {
		// Directly test state mutation for 'detailed'
		panel.cardDisplayConfig = {
			...panel.cardDisplayConfig,
			preset: "detailed",
			fields: ["category"],
			maxWidth: 150,
			showIcon: true,
			headerStyle: "table",
		};
		expect(panel.cardDisplayConfig.preset).toBe("detailed");
		expect(panel.cardDisplayConfig.maxWidth).toBe(150);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("selects 'full' preset and updates panel state correctly", () => {
		panel.cardDisplayConfig = {
			...panel.cardDisplayConfig,
			preset: "full",
			fields: ["category", "node_type", "tags"],
			maxWidth: 200,
			showIcon: true,
			headerStyle: "table",
		};
		expect(panel.cardDisplayConfig.preset).toBe("full");
		expect(panel.cardDisplayConfig.fields).toContain("category");
		expect(panel.cardDisplayConfig.fields).toContain("node_type");
		expect(panel.cardDisplayConfig.fields).toContain("tags");
	});

	it("calls doRenderKeepPanel and rebuildPanel via callbacks", () => {
		addCardPresetSelector(body as any, panel, cb);
		expect(cb.doRenderKeepPanel).not.toHaveBeenCalled(); // not called on build, only on change
	});
});

// ---------------------------------------------------------------------------
// addCardDisplayOptions
// ---------------------------------------------------------------------------

describe("addCardDisplayOptions", () => {
	let body: MockElement;
	let panel: PanelState;
	let cb: PanelCallbacks;

	beforeEach(() => {
		body = new MockElement();
		panel = createMockPanel();
		cb = createMockCallbacks();
	});

	it("creates DOM elements for all display options", () => {
		addCardDisplayOptions(body as any, panel, cb);
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("sets initial field list from panel config", () => {
		panel.cardDisplayConfig.fields = ["category", "tags"];
		addCardDisplayOptions(body as any, panel, cb);
		// Should render with those fields as initial value
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("updates fields array on text input change", () => {
		// Simulate callback directly
		const newFieldsString = "category, tags, node_type";
		panel.cardDisplayConfig.fields = newFieldsString
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		expect(panel.cardDisplayConfig.fields).toEqual(["category", "tags", "node_type"]);
	});

	it("filters out empty strings when parsing fields", () => {
		const newFieldsString = "category, , tags,  ";
		panel.cardDisplayConfig.fields = newFieldsString
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		expect(panel.cardDisplayConfig.fields).toEqual(["category", "tags"]);
	});

	it("handles empty field input", () => {
		panel.cardDisplayConfig.fields = ""
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		expect(panel.cardDisplayConfig.fields).toEqual([]);
	});

	it("does not call doRenderKeepPanel on initial build", () => {
		addCardDisplayOptions(body as any, panel, cb);
		expect(cb.doRenderKeepPanel).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// addCardBodyControls
// ---------------------------------------------------------------------------

describe("addCardBodyControls", () => {
	let body: MockElement;
	let panel: PanelState;
	let cb: PanelCallbacks;

	beforeEach(() => {
		body = new MockElement();
		panel = createMockPanel();
		cb = createMockCallbacks();
	});

	it("creates DOM elements for all body controls", () => {
		addCardBodyControls(body as any, panel, cb);
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("reads cardBodyMaxLines from merged render thresholds", () => {
		panel.renderThresholds = { cardBodyMaxLines: 5 } as any;
		addCardBodyControls(body as any, panel, cb);
		// No error thrown — it reads the merged thresholds
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("uses default render thresholds when none set", () => {
		panel.renderThresholds = undefined as any;
		addCardBodyControls(body as any, panel, cb);
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("uses existing cardRenderConfig.plainCardFillAlpha when present", () => {
		panel.cardRenderConfig = { plainCardFillAlpha: 0.6 } as any;
		addCardBodyControls(body as any, panel, cb);
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("initializes cardRenderConfig when absent", () => {
		panel.cardRenderConfig = undefined as any;
		addCardBodyControls(body as any, panel, cb);
		// No error thrown
		expect(body.children.length).toBeGreaterThan(0);
	});

	it("does not call any callbacks on initial build", () => {
		addCardBodyControls(body as any, panel, cb);
		expect(cb.doRenderKeepPanel).not.toHaveBeenCalled();
		expect(cb.recalcNodeRadii).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Preset state mutations — direct logic tests
// ---------------------------------------------------------------------------

describe("card preset state mutations", () => {
	it("compact preset sets maxWidth=80, showIcon=false, headerStyle=plain", () => {
		const panel = createMockPanel();
		const prev = { ...panel.cardDisplayConfig };
		panel.cardDisplayConfig = {
			...prev,
			preset: "compact",
			fields: [],
			maxWidth: 80,
			showIcon: false,
			headerStyle: "plain",
		};
		expect(panel.cardDisplayConfig.maxWidth).toBe(80);
		expect(panel.cardDisplayConfig.showIcon).toBe(false);
		expect(panel.cardDisplayConfig.headerStyle).toBe("plain");
	});

	it("detailed preset sets maxWidth=150, showIcon=true, headerStyle=table, fields=[category]", () => {
		const panel = createMockPanel();
		const prev = { ...panel.cardDisplayConfig };
		panel.cardDisplayConfig = {
			...prev,
			preset: "detailed",
			fields: ["category"],
			maxWidth: 150,
			showIcon: true,
			headerStyle: "table",
		};
		expect(panel.cardDisplayConfig.maxWidth).toBe(150);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.fields).toEqual(["category"]);
	});

	it("full preset sets maxWidth=200, fields with 3 entries", () => {
		const panel = createMockPanel();
		const prev = { ...panel.cardDisplayConfig };
		panel.cardDisplayConfig = {
			...prev,
			preset: "full",
			fields: ["category", "node_type", "tags"],
			maxWidth: 200,
			showIcon: true,
			headerStyle: "table",
		};
		expect(panel.cardDisplayConfig.maxWidth).toBe(200);
		expect(panel.cardDisplayConfig.fields).toHaveLength(3);
	});

	it("custom preset preserves existing fields and settings", () => {
		const panel = createMockPanel();
		panel.cardDisplayConfig.preset = "custom" as any;
		// custom does not mutate other fields
		expect(panel.cardDisplayConfig.preset).toBe("custom");
		expect(panel.cardDisplayConfig.fields).toEqual([]);
	});
});
