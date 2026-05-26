/**
 * Tests for src/views/panel-sections-filter-card-helpers.ts
 *
 * Covers: addCardPresetSelector, addCardDisplayOptions, addCardBodyControls
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock i18n — return key as label
vi.mock("../../src/i18n", () => ({
	t: (key: string) => key,
	tHelp: (key: string) => key,
}));

// Track widget calls so we can inspect them
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
		cardBodyMaxLines: 3,
		cardContentScale: 0.5,
		cardBodyFontSize: 8,
		...rt,
	}),
}));

// Import after all mocks are set up
import {
	addCardPresetSelector,
	addCardDisplayOptions,
	addCardBodyControls,
} from "../../src/views/panel-sections-filter-card-helpers";
import type { PanelState, PanelCallbacks } from "../../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockEl(): any {
	return {
		createDiv: vi.fn(() => makeMockEl()),
		createEl: vi.fn(() => {
			const el = makeMockEl();
			el.addEventListener = vi.fn();
			return el;
		}),
		style: {},
	};
}

function makePanel(): PanelState {
	return {
		cardDisplayConfig: {
			preset: "custom",
			fields: ["category"],
			maxWidth: 120,
			showIcon: false,
			headerStyle: "plain",
			fieldFormat: "key-value",
		},
		renderThresholds: {
			cardBodyMaxLines: 3,
			cardContentScale: 0.5,
			cardBodyFontSize: 8,
		},
		cardRenderConfig: {
			plainCardFillAlpha: 0.8,
		},
	} as any;
}

function makeCb(): PanelCallbacks {
	return {
		markDirty: vi.fn(),
		rebuildPanel: vi.fn(),
		announceA11y: vi.fn(),
		invalidateDataKeepPanel: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		recalcNodeRadii: vi.fn(),
	} as any;
}

// ---------------------------------------------------------------------------
// addCardPresetSelector
// ---------------------------------------------------------------------------

describe("addCardPresetSelector", () => {
	beforeEach(() => {
		addSelectCalls.length = 0;
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addTextInputCalls.length = 0;
	});

	it("calls addSelect with card preset options", () => {
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardPresetSelector(body, panel, cb);

		expect(addSelectCalls.length).toBeGreaterThan(0);
		const call = addSelectCalls[0];
		expect(call[0]).toBe(body);
		expect(typeof call[1]).toBe("string"); // label
	});

	it("passes current preset value to addSelect", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		panel.cardDisplayConfig.preset = "compact";
		const cb = makeCb();

		addCardPresetSelector(body, panel, cb);

		const call = addSelectCalls[0];
		expect(call[3]).toBe("compact");
	});

	it("selecting 'compact' preset sets compact defaults", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardPresetSelector(body, panel, cb);

		// Invoke the onChange callback with "compact"
		const onChange = addSelectCalls[0][4];
		onChange("compact");

		expect(panel.cardDisplayConfig.preset).toBe("compact");
		expect(panel.cardDisplayConfig.fields).toEqual([]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(80);
		expect(panel.cardDisplayConfig.showIcon).toBe(false);
		expect(panel.cardDisplayConfig.headerStyle).toBe("plain");
	});

	it("selecting 'detailed' preset sets detailed defaults", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardPresetSelector(body, panel, cb);

		const onChange = addSelectCalls[0][4];
		onChange("detailed");

		expect(panel.cardDisplayConfig.preset).toBe("detailed");
		expect(panel.cardDisplayConfig.fields).toEqual(["category"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(150);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("selecting 'full' preset sets full defaults", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardPresetSelector(body, panel, cb);

		const onChange = addSelectCalls[0][4];
		onChange("full");

		expect(panel.cardDisplayConfig.preset).toBe("full");
		expect(panel.cardDisplayConfig.fields).toEqual(["category", "node_type", "tags"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(200);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("selecting 'custom' only updates preset field", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		panel.cardDisplayConfig.maxWidth = 999;
		const cb = makeCb();

		addCardPresetSelector(body, panel, cb);

		const onChange = addSelectCalls[0][4];
		onChange("custom");

		expect(panel.cardDisplayConfig.preset).toBe("custom");
		// maxWidth should remain unchanged for custom
		expect(panel.cardDisplayConfig.maxWidth).toBe(999);
	});

	it("calls doRenderKeepPanel and rebuildPanel on change", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardPresetSelector(body, panel, cb);

		const onChange = addSelectCalls[0][4];
		onChange("compact");

		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// addCardDisplayOptions
// ---------------------------------------------------------------------------

describe("addCardDisplayOptions", () => {
	beforeEach(() => {
		addSelectCalls.length = 0;
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addTextInputCalls.length = 0;
	});

	it("calls addTextInput for card fields", () => {
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		expect(addTextInputCalls.length).toBeGreaterThan(0);
	});

	it("passes current fields joined as value to addTextInput", () => {
		addTextInputCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		panel.cardDisplayConfig.fields = ["category", "tags"];
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		// addTextInput(container, label, initial, placeholder, onChange) — index 2 is initial
		const call = addTextInputCalls[0];
		expect(call[2]).toBe("category, tags"); // initial value is arg index 2
	});

	it("onChange for fields splits, trims, and filters empty values", () => {
		addTextInputCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		// addTextInput(container, label, initial, placeholder, onChange) — onChange is index 4
		const call = addTextInputCalls[0];
		const onChange = call[4];
		onChange("  tag1 , tag2 ,  , tag3 ");

		expect(panel.cardDisplayConfig.fields).toEqual(["tag1", "tag2", "tag3"]);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("calls addSlider for maxWidth with correct range and value", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		panel.cardDisplayConfig.maxWidth = 150;
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		const maxWidthSlider = addSliderCalls.find((c) => c[5] === 150);
		expect(maxWidthSlider).toBeDefined();
	});

	it("maxWidth slider onChange updates panel config", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		// First slider should be maxWidth
		const onChange = addSliderCalls[0][6];
		onChange(180);

		expect(panel.cardDisplayConfig.maxWidth).toBe(180);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("calls addToggle for showIcon with current value", () => {
		addToggleCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		panel.cardDisplayConfig.showIcon = true;
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		expect(addToggleCalls.length).toBeGreaterThan(0);
		const iconToggle = addToggleCalls.find((c) => c[2] === true);
		expect(iconToggle).toBeDefined();
	});

	it("showIcon toggle onChange updates panel config", () => {
		addToggleCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		const onChange = addToggleCalls[0][3];
		onChange(true);

		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("calls addSelect for headerStyle with correct options", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		panel.cardDisplayConfig.headerStyle = "table";
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		expect(addSelectCalls.length).toBeGreaterThan(0);
		// There should be a select call for headerStyle
		const headerStyleSelect = addSelectCalls.find((c) => c[3] === "table");
		expect(headerStyleSelect).toBeDefined();
	});

	it("headerStyle select onChange updates panel config", () => {
		addSelectCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardDisplayOptions(body, panel, cb);

		// First select should be headerStyle
		const onChange = addSelectCalls[0][4];
		onChange("table");

		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// addCardBodyControls
// ---------------------------------------------------------------------------

describe("addCardBodyControls", () => {
	beforeEach(() => {
		addSelectCalls.length = 0;
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addTextInputCalls.length = 0;
	});

	it("calls addSlider for cardBodyMaxLines", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		expect(addSliderCalls.length).toBeGreaterThan(0);
	});

	it("cardBodyMaxLines slider onChange updates renderThresholds", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		// First slider should be cardBodyMaxLines
		const onChange = addSliderCalls[0][6];
		onChange(5);

		expect(panel.renderThresholds!.cardBodyMaxLines).toBe(5);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("calls addSlider for cardContentScale", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		// Should have multiple slider calls
		expect(addSliderCalls.length).toBeGreaterThanOrEqual(2);
	});

	it("cardContentScale slider onChange updates renderThresholds", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		// Second slider should be cardContentScale
		const onChange = addSliderCalls[1][6];
		onChange(1.5);

		expect(panel.renderThresholds!.cardContentScale).toBe(1.5);
	});

	it("calls addSlider for cardBgOpacity", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		// Should have at least 3 slider calls
		expect(addSliderCalls.length).toBeGreaterThanOrEqual(3);
	});

	it("cardBgOpacity slider onChange updates cardRenderConfig", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		// Third slider should be bgOpacity
		const onChange = addSliderCalls[2][6];
		onChange(0.6);

		expect(panel.cardRenderConfig?.plainCardFillAlpha).toBe(0.6);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("initializes cardRenderConfig if undefined", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		panel.cardRenderConfig = undefined;
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		// Trigger bgOpacity onChange
		const onChange = addSliderCalls[2][6];
		onChange(0.5);

		expect(panel.cardRenderConfig).toBeDefined();
		expect(panel.cardRenderConfig!.plainCardFillAlpha).toBe(0.5);
	});

	it("calls addSlider for cardBodyFontSize", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		expect(addSliderCalls.length).toBeGreaterThanOrEqual(4);
	});

	it("cardBodyFontSize slider onChange updates renderThresholds", () => {
		addSliderCalls.length = 0;
		const body = makeMockEl();
		const panel = makePanel();
		const cb = makeCb();

		addCardBodyControls(body, panel, cb);

		// Fourth slider should be fontsize
		const onChange = addSliderCalls[3][6];
		onChange(10);

		expect(panel.renderThresholds!.cardBodyFontSize).toBe(10);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});
});
