/**
 * Tests for src/views/panel-sections-filter-card-helpers.ts
 *
 * Covers addCardPresetSelector, addCardDisplayOptions, and addCardBodyControls.
 * Uses vi.mock to stub panel-widgets, PanelBuilder, and i18n so the tests
 * remain DOM-free and focused on the callback logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PanelState, PanelCallbacks } from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock("../src/i18n", () => ({
	t: (key: string) => key,
	tHelp: (key: string) => key,
}));

// Capture widget calls so we can inspect labels and invoke callbacks
const addSliderCalls: any[] = [];
const addToggleCalls: any[] = [];
const addSelectCalls: any[] = [];
const addTextInputCalls: any[] = [];

vi.mock("../src/views/panel-widgets", () => ({
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

vi.mock("../src/views/PanelBuilder", () => ({
	ensureRT: (panel: any) => {
		if (!panel.renderThresholds) panel.renderThresholds = {};
		return panel.renderThresholds;
	},
}));

vi.mock("../src/types", () => ({
	mergeRenderThresholds: (_rt: any) => ({
		cardBodyMaxLines: 3,
		cardContentScale: 1.0,
		cardBodyFontSize: 10,
	}),
}));

// Import AFTER mocks
import {
	addCardPresetSelector,
	addCardDisplayOptions,
	addCardBodyControls,
} from "../src/views/panel-sections-filter-card-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePanel(): PanelState {
	return {
		cardDisplayConfig: {
			fields: ["category", "tags"],
			maxWidth: 120,
			showIcon: false,
			headerStyle: "plain",
			fieldFormat: "key-value",
			preset: "custom",
		},
		cardRenderConfig: {
			plainCardFillAlpha: 0.8,
		},
		renderThresholds: {
			cardBodyMaxLines: 3,
			cardContentScale: 1.0,
			cardBodyFontSize: 10,
		},
	} as unknown as PanelState;
}

function makeCb(): PanelCallbacks {
	return {
		doRenderKeepPanel: vi.fn(),
		rebuildPanel: vi.fn(),
		markDirty: vi.fn(),
		recalcNodeRadii: vi.fn(),
		announceA11y: vi.fn(),
		applyClusterForce: vi.fn(),
		restartSimulation: vi.fn(),
	} as unknown as PanelCallbacks;
}

function makeMockEl(): any {
	return {};
}

// ===========================================================================
// addCardPresetSelector
// ===========================================================================

describe("addCardPresetSelector", () => {
	beforeEach(() => {
		addSelectCalls.length = 0;
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addTextInputCalls.length = 0;
	});

	it("creates a select widget for card preset", () => {
		addCardPresetSelector(makeMockEl(), makePanel(), makeCb());
		expect(addSelectCalls.length).toBeGreaterThan(0);
		const selectCall = addSelectCalls[0];
		// Second arg is the label key
		expect(selectCall[1]).toBe("display.cardPreset");
	});

	it("passes current preset as initial value", () => {
		const panel = makePanel();
		panel.cardDisplayConfig.preset = "detailed";
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		// 4th arg is the current value
		expect(addSelectCalls[0][3]).toBe("detailed");
	});

	it("defaults to 'custom' when preset is undefined", () => {
		const panel = makePanel();
		panel.cardDisplayConfig.preset = undefined;
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		expect(addSelectCalls[0][3]).toBe("custom");
	});

	it("includes all four preset options", () => {
		addCardPresetSelector(makeMockEl(), makePanel(), makeCb());
		const options: any[] = addSelectCalls[0][2];
		const values = options.map((o: any) => o.value);
		expect(values).toContain("custom");
		expect(values).toContain("compact");
		expect(values).toContain("detailed");
		expect(values).toContain("full");
	});

	it("applying 'compact' preset sets expected config values", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardPresetSelector(makeMockEl(), panel, cb);
		// The callback is the 5th argument (index 4)
		const onChange = addSelectCalls[0][4];
		onChange("compact");
		expect(panel.cardDisplayConfig.preset).toBe("compact");
		expect(panel.cardDisplayConfig.fields).toEqual([]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(80);
		expect(panel.cardDisplayConfig.showIcon).toBe(false);
		expect(panel.cardDisplayConfig.headerStyle).toBe("plain");
	});

	it("applying 'detailed' preset sets expected config values", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardPresetSelector(makeMockEl(), panel, cb);
		const onChange = addSelectCalls[0][4];
		onChange("detailed");
		expect(panel.cardDisplayConfig.preset).toBe("detailed");
		expect(panel.cardDisplayConfig.fields).toEqual(["category"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(150);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("applying 'full' preset sets expected config values", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardPresetSelector(makeMockEl(), panel, cb);
		const onChange = addSelectCalls[0][4];
		onChange("full");
		expect(panel.cardDisplayConfig.preset).toBe("full");
		expect(panel.cardDisplayConfig.fields).toEqual(["category", "node_type", "tags"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(200);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("applying 'custom' preset keeps existing config (no field overwrite)", () => {
		const panel = makePanel();
		const cb = makeCb();
		const originalFields = [...panel.cardDisplayConfig.fields];
		addCardPresetSelector(makeMockEl(), panel, cb);
		const onChange = addSelectCalls[0][4];
		onChange("custom");
		// custom only sets the preset key — fields untouched
		expect(panel.cardDisplayConfig.preset).toBe("custom");
		expect(panel.cardDisplayConfig.fields).toEqual(originalFields);
	});

	it("calls doRenderKeepPanel and rebuildPanel after preset change", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardPresetSelector(makeMockEl(), panel, cb);
		const onChange = addSelectCalls[0][4];
		onChange("compact");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});
});

// ===========================================================================
// addCardDisplayOptions
// ===========================================================================

describe("addCardDisplayOptions", () => {
	beforeEach(() => {
		addSelectCalls.length = 0;
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addTextInputCalls.length = 0;
	});

	it("creates a text input for card fields", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		const textInput = addTextInputCalls.find((c) => c[1] === "display.cardFields");
		expect(textInput).toBeDefined();
	});

	it("initialises text input value with comma-joined fields", () => {
		const panel = makePanel();
		panel.cardDisplayConfig.fields = ["category", "tags"];
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		const textInput = addTextInputCalls.find((c) => c[1] === "display.cardFields");
		expect(textInput[2]).toBe("category, tags");
	});

	it("text input callback splits and trims field names", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const textInput = addTextInputCalls.find((c) => c[1] === "display.cardFields");
		textInput[4]("status ,  node_type , tags");
		expect(panel.cardDisplayConfig.fields).toEqual(["status", "node_type", "tags"]);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("text input callback filters out empty strings", () => {
		const panel = makePanel();
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		const textInput = addTextInputCalls.find((c) => c[1] === "display.cardFields");
		textInput[4]("a,,b,  ,c");
		expect(panel.cardDisplayConfig.fields).toEqual(["a", "b", "c"]);
	});

	it("creates a maxWidth slider", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		const slider = addSliderCalls.find((c) => c[1] === "display.cardMaxWidth");
		expect(slider).toBeDefined();
		expect(slider[5]).toBe(120); // initial value from panel
	});

	it("maxWidth slider callback updates panel", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardMaxWidth");
		slider[6](160);
		expect(panel.cardDisplayConfig.maxWidth).toBe(160);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("creates a showIcon toggle", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		const toggle = addToggleCalls.find((c) => c[1] === "display.cardShowIcon");
		expect(toggle).toBeDefined();
		expect(toggle[2]).toBe(false); // default
	});

	it("showIcon toggle callback updates panel", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const toggle = addToggleCalls.find((c) => c[1] === "display.cardShowIcon");
		toggle[3](true);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("creates a headerStyle select with plain/table options", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		const sel = addSelectCalls.find((c) => c[1] === "display.cardHeaderStyle");
		expect(sel).toBeDefined();
		const values = sel[2].map((o: any) => o.value);
		expect(values).toContain("plain");
		expect(values).toContain("table");
	});

	it("headerStyle select callback updates panel", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const sel = addSelectCalls.find((c) => c[1] === "display.cardHeaderStyle");
		sel[4]("table");
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("creates a fieldFormat select with key-value/value-only options", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		const sel = addSelectCalls.find((c) => c[1] === "display.cardFieldFormat");
		expect(sel).toBeDefined();
		const values = sel[2].map((o: any) => o.value);
		expect(values).toContain("key-value");
		expect(values).toContain("value-only");
	});

	it("fieldFormat select callback updates panel", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const sel = addSelectCalls.find((c) => c[1] === "display.cardFieldFormat");
		sel[4]("value-only");
		expect(panel.cardDisplayConfig.fieldFormat).toBe("value-only");
	});
});

// ===========================================================================
// addCardBodyControls
// ===========================================================================

describe("addCardBodyControls", () => {
	beforeEach(() => {
		addSelectCalls.length = 0;
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addTextInputCalls.length = 0;
	});

	it("creates a cardBodyMaxLines slider", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBodyLines");
		expect(slider).toBeDefined();
	});

	it("cardBodyMaxLines slider callback updates renderThresholds", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBodyLines");
		slider[6](5);
		expect(panel.renderThresholds!.cardBodyMaxLines).toBe(5);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("creates a cardContentScale slider", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		const slider = addSliderCalls.find((c) => c[1] === "display.cardContentScale");
		expect(slider).toBeDefined();
	});

	it("cardContentScale slider callback updates renderThresholds and announces", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardContentScale");
		slider[6](1.5);
		expect(panel.renderThresholds!.cardContentScale).toBe(1.5);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.markDirty).toHaveBeenCalled();
	});

	it("creates a cardBgOpacity slider", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBgOpacity");
		expect(slider).toBeDefined();
	});

	it("cardBgOpacity slider callback updates cardRenderConfig", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBgOpacity");
		slider[6](0.5);
		expect(panel.cardRenderConfig!.plainCardFillAlpha).toBe(0.5);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("initialises cardRenderConfig if undefined before opacity write", () => {
		const panel = makePanel();
		(panel as any).cardRenderConfig = undefined;
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBgOpacity");
		slider[6](0.6);
		expect(panel.cardRenderConfig).toBeDefined();
		expect(panel.cardRenderConfig!.plainCardFillAlpha).toBe(0.6);
	});

	it("creates a cardBodyFontSize slider", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBodyFontSize");
		expect(slider).toBeDefined();
	});

	it("cardBodyFontSize slider callback updates renderThresholds", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBodyFontSize");
		slider[6](12);
		expect(panel.renderThresholds!.cardBodyFontSize).toBe(12);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
	});
});
