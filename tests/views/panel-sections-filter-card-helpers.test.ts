/**
 * Tests for panel-sections-filter-card-helpers.ts
 * Tests the three exported section builders, focusing on callback state mutations.
 * Follows the pattern from panel-sections-display.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PanelState, PanelCallbacks } from "../../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/i18n", () => ({
	t: (key: string) => key,
}));

const addSliderCalls: any[] = [];
const addToggleCalls: any[] = [];
const addSelectCalls: any[] = [];
const addTextInputCalls: any[] = [];

vi.mock("../../src/views/panel-widgets", () => ({
	addSlider: vi.fn((...args: any[]) => addSliderCalls.push(args)),
	addToggle: vi.fn((...args: any[]) => addToggleCalls.push(args)),
	addSelect: vi.fn((...args: any[]) => addSelectCalls.push(args)),
	addTextInput: vi.fn((...args: any[]) => addTextInputCalls.push(args)),
}));

vi.mock("../../src/views/PanelBuilder", () => ({
	ensureRT: vi.fn((panel: any) => {
		if (!panel.renderThresholds) panel.renderThresholds = {};
		return panel.renderThresholds;
	}),
}));

vi.mock("../../src/types", () => ({
	mergeRenderThresholds: (_rt: any) => ({
		cardBodyMaxLines: 3,
		cardContentScale: 0.5,
		cardBodyFontSize: 12,
		...(_rt ?? {}),
	}),
}));

// Import after mocks
import {
	addCardPresetSelector,
	addCardDisplayOptions,
	addCardBodyControls,
} from "../../src/views/panel-sections-filter-card-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockEl(): HTMLElement {
	return {} as any;
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
		cardRenderConfig: {
			plainCardFillAlpha: 0.8,
		},
		renderThresholds: {
			cardBodyMaxLines: 3,
			cardContentScale: 0.5,
			cardBodyFontSize: 12,
		},
	} as any;
}

function makeCb(): PanelCallbacks {
	return {
		doRenderKeepPanel: vi.fn(),
		rebuildPanel: vi.fn(),
		markDirty: vi.fn(),
		recalcNodeRadii: vi.fn(),
		announceA11y: vi.fn(),
	} as any;
}

// ---------------------------------------------------------------------------
// addCardPresetSelector
// ---------------------------------------------------------------------------

describe("addCardPresetSelector", () => {
	beforeEach(() => {
		addSelectCalls.length = 0;
		vi.clearAllMocks();
	});

	it("calls addSelect with the four preset options", () => {
		addCardPresetSelector(makeMockEl(), makePanel(), makeCb());
		expect(addSelectCalls.length).toBe(1);
		const options = addSelectCalls[0][2];
		const values = options.map((o: any) => o.value);
		expect(values).toContain("custom");
		expect(values).toContain("compact");
		expect(values).toContain("detailed");
		expect(values).toContain("full");
	});

	it("uses panel.cardDisplayConfig.preset as the current value", () => {
		const panel = makePanel();
		panel.cardDisplayConfig.preset = "compact";
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		expect(addSelectCalls[0][3]).toBe("compact");
	});

	it("defaults to 'custom' when preset is undefined", () => {
		const panel = makePanel();
		(panel.cardDisplayConfig as any).preset = undefined;
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		expect(addSelectCalls[0][3]).toBe("custom");
	});

	it("compact preset callback sets compact defaults", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardPresetSelector(makeMockEl(), panel, cb);
		const onChange = addSelectCalls[0][4];
		onChange("compact");
		expect(panel.cardDisplayConfig.preset).toBe("compact");
		expect(panel.cardDisplayConfig.fields).toEqual([]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(80);
		expect(panel.cardDisplayConfig.showIcon).toBe(false);
		expect(panel.cardDisplayConfig.headerStyle).toBe("plain");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});

	it("detailed preset callback sets detailed defaults", () => {
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
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("full preset callback sets full defaults", () => {
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

	it("custom preset callback only updates preset without resetting other fields", () => {
		const panel = makePanel();
		panel.cardDisplayConfig.fields = ["custom_field"];
		panel.cardDisplayConfig.maxWidth = 250;
		const cb = makeCb();
		addCardPresetSelector(makeMockEl(), panel, cb);
		const onChange = addSelectCalls[0][4];
		onChange("custom");
		// 'custom' branch only sets preset, no field resets
		expect(panel.cardDisplayConfig.preset).toBe("custom");
		expect(panel.cardDisplayConfig.fields).toEqual(["custom_field"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(250);
	});
});

// ---------------------------------------------------------------------------
// addCardDisplayOptions
// ---------------------------------------------------------------------------

describe("addCardDisplayOptions", () => {
	beforeEach(() => {
		addTextInputCalls.length = 0;
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addSelectCalls.length = 0;
		vi.clearAllMocks();
	});

	it("creates one text input, two sliders, one toggle, two selects", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		expect(addTextInputCalls.length).toBe(1);
		expect(addSliderCalls.length).toBe(1);
		expect(addToggleCalls.length).toBe(1);
		expect(addSelectCalls.length).toBe(2);
	});

	it("text input shows joined fields as initial value", () => {
		const panel = makePanel();
		panel.cardDisplayConfig.fields = ["category", "tags"];
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		expect(addTextInputCalls[0][2]).toBe("category, tags");
	});

	it("text input callback parses comma-separated fields", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const onTextChange = addTextInputCalls[0][4];
		onTextChange("alpha, beta, gamma");
		expect(panel.cardDisplayConfig.fields).toEqual(["alpha", "beta", "gamma"]);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("text input callback filters empty entries", () => {
		const panel = makePanel();
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		const onTextChange = addTextInputCalls[0][4];
		onTextChange("a,,b, ,c");
		expect(panel.cardDisplayConfig.fields).toEqual(["a", "b", "c"]);
	});

	it("maxWidth slider callback sets maxWidth on panel", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const onSliderChange = addSliderCalls[0][6];
		onSliderChange(180);
		expect(panel.cardDisplayConfig.maxWidth).toBe(180);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("showIcon toggle callback sets showIcon on panel", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const onToggle = addToggleCalls[0][3];
		onToggle(true);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("headerStyle select callback sets headerStyle", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const onHeaderStyleChange = addSelectCalls[0][4];
		onHeaderStyleChange("table");
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("fieldFormat select callback sets fieldFormat", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const onFieldFormatChange = addSelectCalls[1][4];
		onFieldFormatChange("value-only");
		expect(panel.cardDisplayConfig.fieldFormat).toBe("value-only");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("headerStyle select has 'plain' and 'table' options", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		const options = addSelectCalls[0][2];
		const values = options.map((o: any) => o.value);
		expect(values).toContain("plain");
		expect(values).toContain("table");
	});

	it("fieldFormat select has 'key-value' and 'value-only' options", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		const options = addSelectCalls[1][2];
		const values = options.map((o: any) => o.value);
		expect(values).toContain("key-value");
		expect(values).toContain("value-only");
	});
});

// ---------------------------------------------------------------------------
// addCardBodyControls
// ---------------------------------------------------------------------------

describe("addCardBodyControls", () => {
	beforeEach(() => {
		addSliderCalls.length = 0;
		vi.clearAllMocks();
	});

	it("creates four sliders", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		expect(addSliderCalls.length).toBe(4);
	});

	it("cardBodyMaxLines slider callback mutates renderThresholds", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const onBodyLines = addSliderCalls[0][6];
		onBodyLines(5);
		expect(panel.renderThresholds!.cardBodyMaxLines).toBe(5);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("cardContentScale slider callback mutates renderThresholds", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const onContentScale = addSliderCalls[1][6];
		onContentScale(1.5);
		expect(panel.renderThresholds!.cardContentScale).toBe(1.5);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.markDirty).toHaveBeenCalled();
	});

	it("cardContentScale slider callback calls announceA11y", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const onContentScale = addSliderCalls[1][6];
		onContentScale(1.0);
		expect(cb.announceA11y).toHaveBeenCalled();
	});

	it("cardBgOpacity slider callback sets plainCardFillAlpha on cardRenderConfig", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const onBgOpacity = addSliderCalls[2][6];
		onBgOpacity(0.6);
		expect(panel.cardRenderConfig!.plainCardFillAlpha).toBe(0.6);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("cardBgOpacity slider initializes cardRenderConfig if undefined", () => {
		const panel = makePanel();
		(panel as any).cardRenderConfig = undefined;
		addCardBodyControls(makeMockEl(), panel, makeCb());
		const onBgOpacity = addSliderCalls[2][6];
		onBgOpacity(0.9);
		expect(panel.cardRenderConfig).toBeDefined();
		expect(panel.cardRenderConfig!.plainCardFillAlpha).toBe(0.9);
	});

	it("cardBodyFontSize slider callback mutates renderThresholds", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const onFontSize = addSliderCalls[3][6];
		onFontSize(14);
		expect(panel.renderThresholds!.cardBodyFontSize).toBe(14);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("cardBodyMaxLines slider uses mergedRT for initial value", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		// Initial value comes from mergeRenderThresholds → cardBodyMaxLines: 3
		expect(addSliderCalls[0][5]).toBe(3);
	});

	it("cardContentScale slider uses mergedRT for initial value", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		expect(addSliderCalls[1][5]).toBe(0.5);
	});

	it("cardBodyFontSize slider uses mergedRT for initial value", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		expect(addSliderCalls[3][5]).toBe(12);
	});
});
