/**
 * Tests for src/views/panel-sections-display.ts — buildEdgeDisplaySection
 */
import { describe, it, expect, vi } from "vitest";
import type { PanelState, PanelCallbacks, PanelContext } from "../../src/views/PanelBuilder";

// Mock i18n
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
	buildSection: vi.fn((_tabEl: any, _title: string, buildFn: Function) => {
		const body = makeMockEl();
		buildFn(body);
	}),
	addAdvancedGroup: vi.fn((body: any, buildFn: Function) => {
		const adv = makeMockEl();
		buildFn(adv);
	}),
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
import { buildEdgeDisplaySection } from "../../src/views/panel-sections-display";

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

function makeCtx(): PanelContext {
	return {
		edgeTypeCounts: {
			link: 100,
			tag: 50,
			similar: 0,
			inheritance: 10,
		},
	} as any;
}

describe("buildEdgeDisplaySection", () => {
	it("creates arrows toggle", () => {
		addToggleCalls.length = 0;
		buildEdgeDisplaySection(makeMockEl(), makePanel(), makeCtx(), makeCb());
		const arrowsToggle = addToggleCalls.find((c) => c[1] === "display.arrows");
		expect(arrowsToggle).toBeDefined();
		expect(arrowsToggle![2]).toBe(true); // panel.showArrows default
	});

	it("creates edge opacity slider", () => {
		addSliderCalls.length = 0;
		buildEdgeDisplaySection(makeMockEl(), makePanel(), makeCtx(), makeCb());
		const opacitySlider = addSliderCalls.find((c) => c[1]?.includes("edgeOpacity"));
		expect(opacitySlider).toBeDefined();
		expect(opacitySlider![5]).toBe(0.5); // default globalEdgeAlpha
	});

	it("creates fade-by-degree toggle", () => {
		addToggleCalls.length = 0;
		buildEdgeDisplaySection(makeMockEl(), makePanel(), makeCtx(), makeCb());
		const fadeToggle = addToggleCalls.find((c) => c[1] === "display.fadeEdges");
		expect(fadeToggle).toBeDefined();
		expect(fadeToggle![2]).toBe(true);
	});

	it("slider callback mutates renderThresholds via ensureRT", () => {
		addSliderCalls.length = 0;
		const panel = makePanel();
		const cb = makeCb();
		buildEdgeDisplaySection(makeMockEl(), panel, makeCtx(), cb);
		const opacitySlider = addSliderCalls.find((c) => c[1]?.includes("edgeOpacity"));
		// Invoke the slider callback with a new value
		opacitySlider![6](0.8);
		expect(panel.renderThresholds!.globalEdgeAlpha).toBe(0.8);
		expect(cb.markDirty).toHaveBeenCalled();
	});

	it("creates edge direction filter select in advanced group", () => {
		addSelectCalls.length = 0;
		buildEdgeDisplaySection(makeMockEl(), makePanel(), makeCtx(), makeCb());
		const dirFilter = addSelectCalls.find((c) => c[1] === "display.edgeDirectionFilter");
		expect(dirFilter).toBeDefined();
	});

	it("shows edge type toggles with counts in advanced group", () => {
		addToggleCalls.length = 0;
		buildEdgeDisplaySection(makeMockEl(), makePanel(), makeCtx(), makeCb());
		// "link" has count 100, so it should appear with count
		const linkToggle = addToggleCalls.find(
			(c) => typeof c[1] === "string" && c[1].includes("display.links") && c[1].includes("100"),
		);
		expect(linkToggle).toBeDefined();
	});

	it("always shows similar toggle even when count is 0", () => {
		addToggleCalls.length = 0;
		buildEdgeDisplaySection(makeMockEl(), makePanel(), makeCtx(), makeCb());
		const similarToggle = addToggleCalls.find((c) => typeof c[1] === "string" && c[1].includes("display.similar"));
		expect(similarToggle).toBeDefined();
	});
});
