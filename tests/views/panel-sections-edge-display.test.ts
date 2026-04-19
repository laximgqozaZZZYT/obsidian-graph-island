/**
 * Tests for src/views/panel-sections-edge-display.ts
 *
 * Locks the existing behavior of the four extracted helpers:
 *   - buildEdgeStyleControls
 *   - buildEdgeLabelControls
 *   - buildEdgeColorControls
 *   - buildEdgeVisibilityControls
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PanelState, PanelCallbacks } from "../../src/views/PanelBuilder";

// Mock i18n — return key as label so tests can match by key string
vi.mock("../../src/i18n", () => ({
	t: (key: string) => key,
	tHelp: (key: string) => key,
}));

// Track widget calls
const addSliderCalls: any[] = [];
const addToggleCalls: any[] = [];
const addSelectCalls: any[] = [];

vi.mock("../../src/views/panel-widgets", () => ({
	addSlider: vi.fn((...args: any[]) => {
		addSliderCalls.push(args);
	}),
	addToggle: vi.fn((...args: any[]) => {
		addToggleCalls.push(args);
	}),
	addSelect: vi.fn((...args: any[]) => {
		addSelectCalls.push(args);
	}),
}));

vi.mock("../../src/views/PanelBuilder", () => ({
	ensureRT: (panel: any) => {
		if (!panel.renderThresholds) panel.renderThresholds = {};
		return panel.renderThresholds;
	},
}));

vi.mock("../../src/types", () => ({
	mergeRenderThresholds: (rt: any) => ({
		globalEdgeAlpha: 0.5,
		edgeMinZoom: 0.05,
		edgeZoomFadeThreshold: 0.5,
		edgeLabelZoomHide: 0.2,
		edgeLabelZoomFade: 0.5,
		edgeLabelFontSize: 12,
		edgeDensityFloor: 0.1,
		hoverEdgeFalloff: 0.7,
		edgeFadeMinAlpha: 0.1,
		...rt,
	}),
}));

function makeMockEl(): any {
	return {
		createDiv: vi.fn(() => makeMockEl()),
		createEl: vi.fn(() => {
			const el = makeMockEl();
			el.addEventListener = vi.fn();
			el.title = "";
			return el;
		}),
	};
}

// Import after mocks
import {
	buildEdgeStyleControls,
	buildEdgeLabelControls,
	buildEdgeColorControls,
	buildEdgeVisibilityControls,
} from "../../src/views/panel-sections-edge-display";

function makePanel(): PanelState {
	return {
		showArrows: true,
		fadeEdgesByDegree: true,
		colorEdgesByRelation: false,
		showEdgeLabels: false,
		edgeLayerMode: false,
		edgeDirectionFilter: "all",
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: true,
		showSemanticEdges: true,
		showInheritance: true,
		showAggregation: true,
		showSimilar: true,
		showSibling: true,
		showSequence: true,
		showInlineRelation: true,
		renderThresholds: {},
	} as any;
}

function makeCb(): PanelCallbacks {
	return {
		markDirty: vi.fn(),
		rebuildPanel: vi.fn(),
		announceA11y: vi.fn(),
		invalidateDataKeepPanel: vi.fn(),
	} as any;
}

beforeEach(() => {
	addSliderCalls.length = 0;
	addToggleCalls.length = 0;
	addSelectCalls.length = 0;
});

describe("buildEdgeStyleControls", () => {
	it("adds arrows toggle initialized from panel.showArrows", () => {
		buildEdgeStyleControls(makeMockEl(), makePanel(), makeCb());
		const arrows = addToggleCalls.find((c) => c[1] === "display.arrows");
		expect(arrows).toBeDefined();
		expect(arrows![2]).toBe(true);
	});

	it("adds fade-by-degree toggle", () => {
		buildEdgeStyleControls(makeMockEl(), makePanel(), makeCb());
		const fade = addToggleCalls.find((c) => c[1] === "display.fadeEdges");
		expect(fade).toBeDefined();
		expect(fade![2]).toBe(true);
	});

	it("adds edge opacity slider initialized from rt.globalEdgeAlpha", () => {
		buildEdgeStyleControls(makeMockEl(), makePanel(), makeCb());
		const opacity = addSliderCalls.find((c) => c[1]?.includes("edgeOpacity"));
		expect(opacity).toBeDefined();
		expect(opacity![5]).toBe(0.5);
	});

	it("opacity slider callback writes to renderThresholds via ensureRT", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildEdgeStyleControls(makeMockEl(), panel, cb);
		const opacity = addSliderCalls.find((c) => c[1]?.includes("edgeOpacity"));
		opacity![6](0.8);
		expect(panel.renderThresholds!.globalEdgeAlpha).toBe(0.8);
		expect(cb.markDirty).toHaveBeenCalled();
	});

	it("adds edge zoom thresholds and density/hover floor sliders", () => {
		buildEdgeStyleControls(makeMockEl(), makePanel(), makeCb());
		const labels = addSliderCalls.map((c) => c[1]);
		expect(labels).toContain("display.edgeMinZoom");
		expect(labels).toContain("display.edgeZoomFadeThreshold");
		expect(labels).toContain("display.edgeFadeMinAlpha");
		expect(labels).toContain("display.edgeDensityFloor");
		expect(labels).toContain("display.hoverEdgeFalloff");
	});

	it("does not add label sliders, color or visibility controls", () => {
		buildEdgeStyleControls(makeMockEl(), makePanel(), makeCb());
		const labels = addSliderCalls.map((c) => c[1]);
		expect(labels).not.toContain("display.edgeLabelZoomHide");
		expect(labels).not.toContain("display.edgeLabelFontSize");
		expect(addSelectCalls.length).toBe(0);
	});
});

describe("buildEdgeLabelControls", () => {
	it("adds three label sliders (hide zoom, fade zoom, font size)", () => {
		buildEdgeLabelControls(makeMockEl(), makePanel(), makeCb());
		const labels = addSliderCalls.map((c) => c[1]);
		expect(labels).toContain("display.edgeLabelZoomHide");
		expect(labels).toContain("display.edgeLabelZoomFade");
		expect(labels).toContain("display.edgeLabelFontSize");
	});

	it("font size slider mutates rt.edgeLabelFontSize", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildEdgeLabelControls(makeMockEl(), panel, cb);
		const font = addSliderCalls.find((c) => c[1] === "display.edgeLabelFontSize");
		font![6](14);
		expect(panel.renderThresholds!.edgeLabelFontSize).toBe(14);
		expect(cb.markDirty).toHaveBeenCalled();
	});

	it("does not add toggles or selects", () => {
		buildEdgeLabelControls(makeMockEl(), makePanel(), makeCb());
		expect(addToggleCalls.length).toBe(0);
		expect(addSelectCalls.length).toBe(0);
	});
});

describe("buildEdgeColorControls", () => {
	it("adds color-edges-by-relation toggle", () => {
		buildEdgeColorControls(makeMockEl(), makePanel(), makeCb());
		const color = addToggleCalls.find((c) => c[1] === "display.edgeColor");
		expect(color).toBeDefined();
		expect(color![2]).toBe(false);
	});

	it("color toggle callback flips panel field and rebuilds panel", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildEdgeColorControls(makeMockEl(), panel, cb);
		const color = addToggleCalls.find((c) => c[1] === "display.edgeColor");
		color![3](true);
		expect(panel.colorEdgesByRelation).toBe(true);
		expect(cb.markDirty).toHaveBeenCalled();
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});

	it("adds show-edge-labels toggle", () => {
		buildEdgeColorControls(makeMockEl(), makePanel(), makeCb());
		const labelToggle = addToggleCalls.find((c) => c[1] === "display.edgeLabelMode.relation");
		expect(labelToggle).toBeDefined();
	});

	it("show-edge-labels toggle announces a11y", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildEdgeColorControls(makeMockEl(), panel, cb);
		const labelToggle = addToggleCalls.find((c) => c[1] === "display.edgeLabelMode.relation");
		labelToggle![3](true);
		expect(panel.showEdgeLabels).toBe(true);
		expect(cb.announceA11y).toHaveBeenCalledWith("Edge labels: on");
	});
});

describe("buildEdgeVisibilityControls", () => {
	it("adds edge-layer-mode toggle and direction-filter select", () => {
		buildEdgeVisibilityControls(makeMockEl(), makePanel(), makeCb(), {});
		const layer = addToggleCalls.find((c) => c[1] === "display.edgeLayerMode");
		expect(layer).toBeDefined();
		const dir = addSelectCalls.find((c) => c[1] === "display.edgeDirectionFilter");
		expect(dir).toBeDefined();
	});

	it("shows edge-type toggles only for types with non-zero counts (plus similar)", () => {
		const counts = { link: 100, tag: 50, similar: 0, inheritance: 10 };
		buildEdgeVisibilityControls(makeMockEl(), makePanel(), makeCb(), counts);
		const labels = addToggleCalls.map((c) => c[1]).filter((l) => typeof l === "string");
		expect(labels.some((l) => l.includes("display.links") && l.includes("100"))).toBe(true);
		expect(labels.some((l) => l.includes("display.sharedTags") && l.includes("50"))).toBe(true);
		expect(labels.some((l) => l.includes("display.inheritance") && l.includes("10"))).toBe(true);
		// "similar" is always shown even when count is 0
		expect(labels.some((l) => l.includes("display.similar"))).toBe(true);
		// types not in counts (count=0) are hidden
		expect(labels.some((l) => l.includes("display.semantic"))).toBe(false);
		expect(labels.some((l) => l.includes("display.sequence"))).toBe(false);
	});

	it("edge-type toggle mutates panel field and announces a11y", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildEdgeVisibilityControls(makeMockEl(), panel, cb, { link: 100 });
		const linkToggle = addToggleCalls.find((c) => typeof c[1] === "string" && c[1].includes("display.links"));
		expect(linkToggle).toBeDefined();
		linkToggle![3](false);
		expect(panel.showLinks).toBe(false);
		expect(cb.markDirty).toHaveBeenCalled();
		expect(cb.announceA11y).toHaveBeenCalledWith("display.links: off");
	});

	it("similar toggle uses invalidateDataKeepPanel instead of markDirty", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildEdgeVisibilityControls(makeMockEl(), panel, cb, {});
		const sim = addToggleCalls.find((c) => typeof c[1] === "string" && c[1].includes("display.similar"));
		sim![3](false);
		expect(panel.showSimilar).toBe(false);
		expect(cb.invalidateDataKeepPanel).toHaveBeenCalled();
	});

	it("creates solo button row that wires a click handler", () => {
		const parent = makeMockEl();
		buildEdgeVisibilityControls(parent, makePanel(), makeCb(), {});
		expect(parent.createDiv).toHaveBeenCalledWith({ cls: "gi-setting-row" });
		const soloRow = parent.createDiv.mock.results[0].value;
		expect(soloRow.createEl).toHaveBeenCalled();
	});

	it("solo button initial click leaves only the first edge type ON", () => {
		const panel = makePanel();
		const cb = makeCb();
		const parent = makeMockEl();
		// capture the soloRow.createEl result so we can grab its addEventListener
		let soloBtn: any;
		parent.createDiv = vi.fn(() => {
			const row = makeMockEl();
			row.createEl = vi.fn(() => {
				soloBtn = makeMockEl();
				soloBtn.addEventListener = vi.fn();
				soloBtn.title = "";
				return soloBtn;
			});
			return row;
		});

		buildEdgeVisibilityControls(parent, panel, cb, {});
		// Trigger the click handler
		const handler = soloBtn.addEventListener.mock.calls[0][1];
		handler();
		// Only showLinks (first key) should be ON
		expect(panel.showLinks).toBe(true);
		expect(panel.showTagEdges).toBe(false);
		expect(panel.showSemanticEdges).toBe(false);
		expect(cb.markDirty).toHaveBeenCalled();
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});

	it("solo button wraps around to ALL ON when at last type", () => {
		const panel = makePanel();
		// Start with only the LAST type ON (showInlineRelation)
		panel.showLinks = false;
		panel.showTagEdges = false;
		panel.showCategoryEdges = false;
		panel.showSemanticEdges = false;
		panel.showInheritance = false;
		panel.showAggregation = false;
		panel.showSimilar = false;
		panel.showSibling = false;
		panel.showSequence = false;
		panel.showInlineRelation = true;

		const cb = makeCb();
		const parent = makeMockEl();
		let soloBtn: any;
		parent.createDiv = vi.fn(() => {
			const row = makeMockEl();
			row.createEl = vi.fn(() => {
				soloBtn = makeMockEl();
				soloBtn.addEventListener = vi.fn();
				soloBtn.title = "";
				return soloBtn;
			});
			return row;
		});

		buildEdgeVisibilityControls(parent, panel, cb, {});
		const handler = soloBtn.addEventListener.mock.calls[0][1];
		handler();
		// Wrap-around: all ON restored
		expect(panel.showLinks).toBe(true);
		expect(panel.showInlineRelation).toBe(true);
		expect(panel.showSemanticEdges).toBe(true);
	});

	it("default edgeTypeCounts (omitted) hides all types except similar", () => {
		buildEdgeVisibilityControls(makeMockEl(), makePanel(), makeCb());
		const labels = addToggleCalls.map((c) => c[1]).filter((l) => typeof l === "string");
		const typeOnly = labels.filter((l) => l !== "display.edgeLayerMode");
		// only similar passes the count===0 gate
		expect(typeOnly.some((l) => l.includes("display.similar"))).toBe(true);
		expect(typeOnly.some((l) => l.includes("display.links"))).toBe(false);
	});
});
