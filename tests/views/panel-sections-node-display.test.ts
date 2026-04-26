/**
 * Tests for src/views/panel-sections-node-display.ts
 *
 * Locks behavior of the four extracted helpers:
 *   - buildNodeSizeControls
 *   - buildNodeLabelControls
 *   - buildNodeShapeControls
 *   - buildNodeThumbnailControls
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
const addTextInputCalls: any[] = [];

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
	addTextInput: vi.fn((...args: any[]) => {
		addTextInputCalls.push(args);
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
		labelDensity: 1.0,
		labelModeOverride: "auto",
		labelMaxChars: 12,
		nodeSizeByDegree: false,
		maxHoverNeighborLabels: 20,
		...rt,
	}),
}));

vi.mock("../../src/utils/node-shapes", () => ({
	ALL_SHAPES: ["circle", "triangle", "square", "diamond", "pentagon", "hexagon", "star", "cross"],
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
	buildNodeSizeControls,
	buildNodeLabelControls,
	buildNodeShapeControls,
	buildNodeThumbnailControls,
} from "../../src/views/panel-sections-node-display";

function makePanel(): PanelState {
	return {
		nodeColorMode: "category",
		nodeSize: 40,
		textFadeThreshold: 0.5,
		renderThresholds: {},
		showTagNodes: false,
		nodeShapeRules: [{ match: "default", shape: "circle" }],
		hoverShowTitle: true,
		hoverShowMeta: false,
		hoverShowBody: false,
		hoverHops: 1,
		focusMode: false,
		focusConeEnabled: true,
		focusNodeId: null,
	} as any;
}

function makeCb(): PanelCallbacks {
	return {
		markDirty: vi.fn(),
		rebuildPanel: vi.fn(),
		announceA11y: vi.fn(),
		recolorNodes: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		resetZoomBaseNodeSize: vi.fn(),
		recalcNodeRadii: vi.fn(),
		applyTextFade: vi.fn(),
		rebuildNodesInPlace: vi.fn(),
		clearHoverTooltips: vi.fn(),
		applyHover: vi.fn(),
		rebuildHoverAdj: vi.fn(),
		collectFieldSuggestions: vi.fn(() => ["category", "date", "story_order"]),
	} as any;
}

beforeEach(() => {
	addSliderCalls.length = 0;
	addToggleCalls.length = 0;
	addSelectCalls.length = 0;
	addTextInputCalls.length = 0;
});

describe("buildNodeSizeControls", () => {
	it("adds the node color-mode select initialized from panel.nodeColorMode", () => {
		buildNodeSizeControls(makeMockEl(), makePanel(), makeCb());
		const mode = addSelectCalls.find((c) => c[1] === "display.nodeColorMode");
		expect(mode).toBeDefined();
		expect(mode![3]).toBe("category");
	});

	it("color-mode change invokes recolorNodes and rebuildPanel", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeSizeControls(makeMockEl(), panel, cb);
		const mode = addSelectCalls.find((c) => c[1] === "display.nodeColorMode");
		mode![4]("heatmap");
		expect(panel.nodeColorMode).toBe("heatmap");
		expect(cb.recolorNodes).toHaveBeenCalled();
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});

	it("does NOT add field selector or palette when mode is not 'field'", () => {
		buildNodeSizeControls(makeMockEl(), makePanel(), makeCb());
		const field = addSelectCalls.find((c) => c[1]?.includes("nodeColorField"));
		expect(field).toBeUndefined();
		expect(addTextInputCalls.find((c) => c[1]?.includes("customPalette"))).toBeUndefined();
	});

	it("adds field selector + custom palette when nodeColorMode === 'field'", () => {
		const panel = makePanel();
		(panel as any).nodeColorMode = "field";
		buildNodeSizeControls(makeMockEl(), panel, makeCb());
		const field = addSelectCalls.find((c) => c[1] === "display.nodeColorField");
		expect(field).toBeDefined();
		// options include empty placeholder + suggestions
		const options = field![2] as Array<{ value: string; label: string }>;
		expect(options[0].value).toBe("");
		expect(options.some((o) => o.value === "category")).toBe(true);

		const palette = addTextInputCalls.find((c) => c[1] === "display.customPalette");
		expect(palette).toBeDefined();
	});

	it("palette callback writes to panel and triggers doRenderKeepPanel", () => {
		const panel = makePanel();
		(panel as any).nodeColorMode = "field";
		const cb = makeCb();
		buildNodeSizeControls(makeMockEl(), panel, cb);
		const palette = addTextInputCalls.find((c) => c[1] === "display.customPalette");
		palette![4]("#abcdef, #123456");
		expect(panel.customColorPalette).toBe("#abcdef, #123456");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("adds node-size slider initialized from panel.nodeSize with range 5..300", () => {
		buildNodeSizeControls(makeMockEl(), makePanel(), makeCb());
		const size = addSliderCalls.find((c) => c[1] === "display.nodeSize");
		expect(size).toBeDefined();
		expect(size![2]).toBe(5);
		expect(size![3]).toBe(300);
		expect(size![5]).toBe(40);
	});

	it("node-size slider callback resets zoom-base and recalcs radii", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeSizeControls(makeMockEl(), panel, cb);
		const size = addSliderCalls.find((c) => c[1] === "display.nodeSize");
		size![6](80);
		expect(panel.nodeSize).toBe(80);
		expect(cb.resetZoomBaseNodeSize).toHaveBeenCalled();
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.markDirty).toHaveBeenCalled();
	});
});

describe("buildNodeLabelControls", () => {
	it("adds the four label sliders/select (textFade, density, mode, maxChars)", () => {
		buildNodeLabelControls(makeMockEl(), makePanel(), makeCb());
		const sliderLabels = addSliderCalls.map((c) => c[1]);
		expect(sliderLabels).toContain("display.textFade");
		expect(sliderLabels).toContain("display.labelDensity");
		expect(sliderLabels).toContain("display.labelMaxChars");
		const selectLabels = addSelectCalls.map((c) => c[1]);
		expect(selectLabels).toContain("display.labelMode");
	});

	it("label-density callback writes to renderThresholds via ensureRT", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeLabelControls(makeMockEl(), panel, cb);
		const density = addSliderCalls.find((c) => c[1] === "display.labelDensity");
		density![6](2.0);
		expect(panel.renderThresholds!.labelDensity).toBe(2.0);
		expect(cb.applyTextFade).toHaveBeenCalled();
		expect(cb.announceA11y).toHaveBeenCalled();
	});

	it("label-mode select stores override and triggers applyTextFade", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeLabelControls(makeMockEl(), panel, cb);
		const mode = addSelectCalls.find((c) => c[1] === "display.labelMode");
		mode![4]("initials");
		expect(panel.renderThresholds!.labelModeOverride).toBe("initials");
		expect(cb.applyTextFade).toHaveBeenCalled();
	});

	it("label-max-chars slider triggers rebuildNodesInPlace", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeLabelControls(makeMockEl(), panel, cb);
		const max = addSliderCalls.find((c) => c[1] === "display.labelMaxChars");
		max![6](20);
		expect(panel.renderThresholds!.labelMaxChars).toBe(20);
		expect(cb.rebuildNodesInPlace).toHaveBeenCalled();
	});

	it("does not add color-mode select or shape selects", () => {
		buildNodeLabelControls(makeMockEl(), makePanel(), makeCb());
		const labels = addSelectCalls.map((c) => c[1]);
		expect(labels).not.toContain("display.nodeColorMode");
		expect(labels).not.toContain("display.defaultNodeShape");
	});
});

describe("buildNodeShapeControls", () => {
	it("adds only the default-shape select when showTagNodes is false", () => {
		buildNodeShapeControls(makeMockEl(), makePanel(), makeCb());
		const labels = addSelectCalls.map((c) => c[1]);
		expect(labels).toContain("display.defaultNodeShape");
		expect(labels).not.toContain("display.tagNodeShape");
	});

	it("adds tag-shape select as well when showTagNodes is true", () => {
		const panel = makePanel();
		(panel as any).showTagNodes = true;
		buildNodeShapeControls(makeMockEl(), panel, makeCb());
		const labels = addSelectCalls.map((c) => c[1]);
		expect(labels).toContain("display.tagNodeShape");
		expect(labels).toContain("display.defaultNodeShape");
	});

	it("default-shape callback updates the existing 'default' rule in-place", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeShapeControls(makeMockEl(), panel, cb);
		const def = addSelectCalls.find((c) => c[1] === "display.defaultNodeShape");
		def![4]("square");
		expect(panel.nodeShapeRules.find((r) => r.match === "default")!.shape).toBe("square");
		expect(cb.rebuildNodesInPlace).toHaveBeenCalled();
	});

	it("default-shape callback pushes a new rule when 'default' absent", () => {
		const panel = makePanel();
		panel.nodeShapeRules = [];
		const cb = makeCb();
		buildNodeShapeControls(makeMockEl(), panel, cb);
		const def = addSelectCalls.find((c) => c[1] === "display.defaultNodeShape");
		def![4]("diamond");
		expect(panel.nodeShapeRules).toHaveLength(1);
		expect(panel.nodeShapeRules[0]).toEqual({ match: "default", shape: "diamond" });
	});

	it("tag-shape callback unshifts a new 'isTag' rule when absent", () => {
		const panel = makePanel();
		(panel as any).showTagNodes = true;
		const cb = makeCb();
		buildNodeShapeControls(makeMockEl(), panel, cb);
		const tag = addSelectCalls.find((c) => c[1] === "display.tagNodeShape");
		tag![4]("star");
		// New rule inserted at front
		expect(panel.nodeShapeRules[0]).toEqual({ match: "isTag", shape: "star" });
		expect(cb.rebuildNodesInPlace).toHaveBeenCalled();
	});
});

describe("buildNodeThumbnailControls", () => {
	it("adds node-size-by-degree toggle from rt value", () => {
		buildNodeThumbnailControls(makeMockEl(), makePanel(), makeCb());
		const deg = addToggleCalls.find((c) => c[1] === "display.nodeSizeByDegree");
		expect(deg).toBeDefined();
		expect(deg![2]).toBe(false);
	});

	it("node-size-by-degree callback writes to rt and recalcs", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeThumbnailControls(makeMockEl(), panel, cb);
		const deg = addToggleCalls.find((c) => c[1] === "display.nodeSizeByDegree");
		deg![3](true);
		expect(panel.renderThresholds!.nodeSizeByDegree).toBe(true);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
	});

	it("adds the three hover-card content toggles (title/meta/body)", () => {
		buildNodeThumbnailControls(makeMockEl(), makePanel(), makeCb());
		const labels = addToggleCalls.map((c) => c[1]);
		expect(labels).toContain("display.hoverShowTitle");
		expect(labels).toContain("display.hoverShowMeta");
		expect(labels).toContain("display.hoverShowBody");
	});

	it("adds node-icon-field and node-icon-map text inputs", () => {
		buildNodeThumbnailControls(makeMockEl(), makePanel(), makeCb());
		const inputs = addTextInputCalls.map((c) => c[1]);
		expect(inputs).toContain("display.nodeIconField");
		expect(inputs).toContain("display.nodeIconMap");
	});

	it("nodeIconMap callback parses JSON and ignores invalid input silently", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeThumbnailControls(makeMockEl(), panel, cb);
		const map = addTextInputCalls.find((c) => c[1] === "display.nodeIconMap");
		map![4]('{"character":"👤"}');
		expect(panel.nodeIconMap).toEqual({ character: "👤" });

		const before = { ...(panel.nodeIconMap as any) };
		map![4]("not-json");
		// unchanged from previous (parse threw, silently ignored)
		expect(panel.nodeIconMap).toEqual(before);
		expect(cb.rebuildNodesInPlace).toHaveBeenCalled();
	});

	it("adds the hover-hops slider with range 1..5", () => {
		buildNodeThumbnailControls(makeMockEl(), makePanel(), makeCb());
		const hops = addSliderCalls.find((c) => c[1] === "display.hoverHops");
		expect(hops).toBeDefined();
		expect(hops![2]).toBe(1);
		expect(hops![3]).toBe(5);
	});

	it("adds the nine hover-edge-type toggles plus maxHoverLabels slider", () => {
		buildNodeThumbnailControls(makeMockEl(), makePanel(), makeCb());
		const toggleLabels = addToggleCalls.map((c) => c[1]);
		for (const key of [
			"hover.link",
			"hover.semantic",
			"hover.tag",
			"hover.hasTag",
			"hover.similar",
			"hover.inheritance",
			"hover.aggregation",
			"hover.sibling",
			"hover.sequence",
		]) {
			expect(toggleLabels).toContain(key);
		}
		expect(addSliderCalls.find((c) => c[1] === "display.maxHoverLabels")).toBeDefined();
	});

	it("hover-edge-type toggle creates hoverEdgeTypes lazily and mutates the key", () => {
		const panel = makePanel();
		const cb = makeCb();
		buildNodeThumbnailControls(makeMockEl(), panel, cb);
		const tag = addToggleCalls.find((c) => c[1] === "hover.tag");
		tag![3](true);
		expect(panel.hoverEdgeTypes).toBeDefined();
		expect(panel.hoverEdgeTypes!.tag).toBe(true);
		expect(cb.rebuildHoverAdj).toHaveBeenCalled();
	});

	it("focusMode toggle clears focusNodeId when turned off", () => {
		const panel = makePanel();
		(panel as any).focusMode = true;
		(panel as any).focusNodeId = "some-id";
		const cb = makeCb();
		buildNodeThumbnailControls(makeMockEl(), panel, cb);
		const focus = addToggleCalls.find((c) => c[1] === "display.focusMode");
		focus![3](false);
		expect(panel.focusMode).toBe(false);
		expect(panel.focusNodeId).toBe(null);
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});

	it("focusCone toggle only appears when focusMode is true (progressive disclosure)", () => {
		buildNodeThumbnailControls(makeMockEl(), makePanel(), makeCb());
		expect(addToggleCalls.find((c) => c[1] === "display.focusCone")).toBeUndefined();

		addToggleCalls.length = 0;
		const panel = makePanel();
		(panel as any).focusMode = true;
		buildNodeThumbnailControls(makeMockEl(), panel, makeCb());
		expect(addToggleCalls.find((c) => c[1] === "display.focusCone")).toBeDefined();
	});

	it("does NOT add any shape selects", () => {
		buildNodeThumbnailControls(makeMockEl(), makePanel(), makeCb());
		const labels = addSelectCalls.map((c) => c[1]);
		expect(labels).not.toContain("display.defaultNodeShape");
		expect(labels).not.toContain("display.tagNodeShape");
	});
});
