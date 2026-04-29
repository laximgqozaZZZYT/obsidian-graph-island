/**
 * Tests for src/views/panel-sections-filter-card-helpers.ts
 *
 * Locks the existing behavior of the three extracted helpers used to
 * build the Card display sub-settings panel:
 *   - addCardPresetSelector (preset → field defaults switching)
 *   - addCardDisplayOptions (fields CSV / maxWidth / showIcon / headerStyle / fieldFormat)
 *   - addCardBodyControls (body lines / content scale / bg opacity / body font size)
 *
 * Strategy mirrors panel-sections-edge-display.test.ts: mock the widget
 * factory functions, capture call args, then drive the registered
 * callbacks directly. No DOM is required — we only verify that helpers
 * register the right widgets and that their callbacks mutate panel
 * state and invoke the expected PanelCallbacks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PanelState, PanelCallbacks } from "../../src/views/PanelBuilder";

vi.mock("../../src/i18n", () => ({
	t: (key: string) => key,
	tHelp: (key: string) => key,
}));

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
		cardContentScale: 1.0,
		cardBodyFontSize: 10,
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

import {
	addCardPresetSelector,
	addCardDisplayOptions,
	addCardBodyControls,
} from "../../src/views/panel-sections-filter-card-helpers";

function makePanel(overrides: Partial<PanelState> = {}): PanelState {
	return {
		cardDisplayConfig: {
			preset: "custom",
			fields: ["category"],
			maxWidth: 120,
			showIcon: false,
			headerStyle: "plain",
			fieldFormat: "key-value",
		},
		renderThresholds: {},
		...overrides,
	} as any;
}

function makeCb(): PanelCallbacks {
	return {
		doRenderKeepPanel: vi.fn(),
		rebuildPanel: vi.fn(),
		recalcNodeRadii: vi.fn(),
		markDirty: vi.fn(),
		announceA11y: vi.fn(),
	} as any;
}

beforeEach(() => {
	addSliderCalls.length = 0;
	addToggleCalls.length = 0;
	addSelectCalls.length = 0;
	addTextInputCalls.length = 0;
});

describe("addCardPresetSelector", () => {
	it("registers exactly one select widget initialized from panel.cardDisplayConfig.preset", () => {
		const panel = makePanel();
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		expect(addSelectCalls.length).toBe(1);
		const select = addSelectCalls[0];
		// args: container, label, options, currentValue, onChange
		expect(select[1]).toBe("display.cardPreset");
		expect(select[3]).toBe("custom");
	});

	it("offers the four preset options (custom/compact/detailed/full)", () => {
		addCardPresetSelector(makeMockEl(), makePanel(), makeCb());
		const opts = addSelectCalls[0][2] as Array<{ value: string }>;
		const values = opts.map((o) => o.value).sort();
		expect(values).toEqual(["compact", "custom", "detailed", "full"]);
	});

	it("falls back to 'custom' when panel.cardDisplayConfig.preset is undefined", () => {
		const panel = makePanel({
			cardDisplayConfig: {
				fields: [],
				maxWidth: 120,
				showIcon: false,
				headerStyle: "plain",
			} as any,
		});
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		expect(addSelectCalls[0][3]).toBe("custom");
	});

	it("'compact' preset zeroes fields, narrows maxWidth, and uses plain header", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardPresetSelector(makeMockEl(), panel, cb);
		const setter = addSelectCalls[0][4];
		setter("compact");
		expect(panel.cardDisplayConfig.preset).toBe("compact");
		expect(panel.cardDisplayConfig.fields).toEqual([]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(80);
		expect(panel.cardDisplayConfig.showIcon).toBe(false);
		expect(panel.cardDisplayConfig.headerStyle).toBe("plain");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
		expect(cb.rebuildPanel).toHaveBeenCalled();
	});

	it("'detailed' preset shows category, enables icon, uses table header", () => {
		const panel = makePanel();
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		addSelectCalls[0][4]("detailed");
		expect(panel.cardDisplayConfig.preset).toBe("detailed");
		expect(panel.cardDisplayConfig.fields).toEqual(["category"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(150);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("'full' preset shows three fields, widest maxWidth, table header + icon", () => {
		const panel = makePanel();
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		addSelectCalls[0][4]("full");
		expect(panel.cardDisplayConfig.preset).toBe("full");
		expect(panel.cardDisplayConfig.fields).toEqual(["category", "node_type", "tags"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(200);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});

	it("'custom' preset only stamps the preset key, leaves other fields untouched", () => {
		const panel = makePanel({
			cardDisplayConfig: {
				preset: "compact",
				fields: ["x", "y"],
				maxWidth: 222,
				showIcon: true,
				headerStyle: "table",
				fieldFormat: "value-only",
			} as any,
		});
		addCardPresetSelector(makeMockEl(), panel, makeCb());
		addSelectCalls[0][4]("custom");
		expect(panel.cardDisplayConfig.preset).toBe("custom");
		// All other fields preserved (no branch in source overwrites them)
		expect(panel.cardDisplayConfig.fields).toEqual(["x", "y"]);
		expect(panel.cardDisplayConfig.maxWidth).toBe(222);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
	});
});

describe("addCardDisplayOptions", () => {
	it("registers fields text input, two selects (header/format), one slider, one toggle", () => {
		addCardDisplayOptions(makeMockEl(), makePanel(), makeCb());
		expect(addTextInputCalls.length).toBe(1);
		expect(addSliderCalls.length).toBe(1);
		expect(addToggleCalls.length).toBe(1);
		expect(addSelectCalls.length).toBe(2);
	});

	it("fields text input is initialised from panel.cardDisplayConfig.fields joined by comma+space", () => {
		const panel = makePanel({
			cardDisplayConfig: {
				preset: "custom",
				fields: ["category", "tags", "node_type"],
				maxWidth: 120,
				showIcon: false,
				headerStyle: "plain",
			} as any,
		});
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		// args: container, label, initial, placeholder, onChange
		expect(addTextInputCalls[0][2]).toBe("category, tags, node_type");
	});

	it("fields text input parses CSV, trims whitespace, drops empty entries", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const setter = addTextInputCalls[0][4];
		setter("  alpha , beta,, ,gamma  ");
		expect(panel.cardDisplayConfig.fields).toEqual(["alpha", "beta", "gamma"]);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("empty CSV input clears the fields list", () => {
		const panel = makePanel({
			cardDisplayConfig: {
				preset: "custom",
				fields: ["a"],
				maxWidth: 120,
				showIcon: false,
				headerStyle: "plain",
			} as any,
		});
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		addTextInputCalls[0][4]("");
		expect(panel.cardDisplayConfig.fields).toEqual([]);
	});

	it("maxWidth slider has range 60-300 step 10 and writes via callback", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		// args: container, label, min, max, step, initial, onChange
		const slider = addSliderCalls[0];
		expect(slider[1]).toBe("display.cardMaxWidth");
		expect(slider[2]).toBe(60);
		expect(slider[3]).toBe(300);
		expect(slider[4]).toBe(10);
		expect(slider[5]).toBe(120);
		slider[6](200);
		expect(panel.cardDisplayConfig.maxWidth).toBe(200);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("maxWidth slider falls back to 120 when panel value is missing", () => {
		const panel = makePanel({
			cardDisplayConfig: {
				preset: "custom",
				fields: [],
				showIcon: false,
				headerStyle: "plain",
			} as any,
		});
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		expect(addSliderCalls[0][5]).toBe(120);
	});

	it("showIcon toggle mutates panel field and calls doRenderKeepPanel", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const toggle = addToggleCalls[0];
		expect(toggle[1]).toBe("display.cardShowIcon");
		expect(toggle[2]).toBe(false);
		toggle[3](true);
		expect(panel.cardDisplayConfig.showIcon).toBe(true);
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("headerStyle select offers plain/table and writes the chosen value", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardDisplayOptions(makeMockEl(), panel, cb);
		const headerSelect = addSelectCalls.find((c) => c[1] === "display.cardHeaderStyle");
		expect(headerSelect).toBeDefined();
		const opts = (headerSelect![2] as Array<{ value: string }>).map((o) => o.value).sort();
		expect(opts).toEqual(["plain", "table"]);
		headerSelect![4]("table");
		expect(panel.cardDisplayConfig.headerStyle).toBe("table");
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("fieldFormat select offers key-value/value-only and writes the chosen value", () => {
		const panel = makePanel();
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		const formatSelect = addSelectCalls.find((c) => c[1] === "display.cardFieldFormat");
		expect(formatSelect).toBeDefined();
		const opts = (formatSelect![2] as Array<{ value: string }>).map((o) => o.value).sort();
		expect(opts).toEqual(["key-value", "value-only"]);
		formatSelect![4]("value-only");
		expect(panel.cardDisplayConfig.fieldFormat).toBe("value-only");
	});

	it("fieldFormat select defaults to 'key-value' when panel value is missing", () => {
		const panel = makePanel({
			cardDisplayConfig: {
				preset: "custom",
				fields: [],
				maxWidth: 120,
				showIcon: false,
				headerStyle: "plain",
			} as any,
		});
		addCardDisplayOptions(makeMockEl(), panel, makeCb());
		const formatSelect = addSelectCalls.find((c) => c[1] === "display.cardFieldFormat");
		expect(formatSelect![3]).toBe("key-value");
	});
});

describe("addCardBodyControls", () => {
	it("registers exactly four sliders (body lines / content scale / bg opacity / body font size)", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		expect(addSliderCalls.length).toBe(4);
		const labels = addSliderCalls.map((c) => c[1]);
		expect(labels).toContain("display.cardBodyLines");
		expect(labels).toContain("display.cardContentScale");
		expect(labels).toContain("display.cardBgOpacity");
		expect(labels).toContain("display.cardBodyFontSize");
	});

	it("body lines slider has range 0-10 step 1 and writes through ensureRT", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBodyLines");
		expect(slider![2]).toBe(0);
		expect(slider![3]).toBe(10);
		expect(slider![4]).toBe(1);
		expect(slider![5]).toBe(3); // initial from mocked mergeRenderThresholds
		slider![6](5);
		expect(panel.renderThresholds!.cardBodyMaxLines).toBe(5);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("body lines slider accepts the lower bound (0)", () => {
		const panel = makePanel();
		addCardBodyControls(makeMockEl(), panel, makeCb());
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBodyLines");
		slider![6](0);
		expect(panel.renderThresholds!.cardBodyMaxLines).toBe(0);
	});

	it("content scale slider announces percentage to a11y and calls markDirty (not doRenderKeepPanel)", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardContentScale");
		expect(slider![2]).toBe(0);
		expect(slider![3]).toBe(2.0);
		slider![6](1.5);
		expect(panel.renderThresholds!.cardContentScale).toBe(1.5);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.markDirty).toHaveBeenCalled();
		// announceA11y reports 150%
		expect(cb.announceA11y).toHaveBeenCalledWith(expect.stringContaining("150%"));
	});

	it("content scale a11y announcement formats fractional values as integer percent", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardContentScale");
		slider![6](0.3);
		// 0.3 * 100 = 30.000000000000004 — toFixed(0) rounds to "30"
		expect(cb.announceA11y).toHaveBeenCalledWith(expect.stringContaining("30%"));
	});

	it("bg opacity slider initialises from cardRenderConfig.plainCardFillAlpha or default 0.8", () => {
		const panel1 = makePanel();
		addCardBodyControls(makeMockEl(), panel1, makeCb());
		expect(addSliderCalls.find((c) => c[1] === "display.cardBgOpacity")![5]).toBe(0.8);

		addSliderCalls.length = 0;
		const panel2 = makePanel({ cardRenderConfig: { plainCardFillAlpha: 0.4 } as any });
		addCardBodyControls(makeMockEl(), panel2, makeCb());
		expect(addSliderCalls.find((c) => c[1] === "display.cardBgOpacity")![5]).toBe(0.4);
	});

	it("bg opacity slider lazily creates cardRenderConfig and writes plainCardFillAlpha", () => {
		const panel = makePanel();
		expect(panel.cardRenderConfig).toBeUndefined();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBgOpacity");
		slider![6](0.5);
		expect(panel.cardRenderConfig).toEqual({ plainCardFillAlpha: 0.5 });
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("bg opacity slider preserves existing cardRenderConfig keys", () => {
		const panel = makePanel({
			cardRenderConfig: {
				plainCardFillAlpha: 0.3,
				someOtherKey: "preserved",
			} as any,
		});
		addCardBodyControls(makeMockEl(), panel, makeCb());
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBgOpacity");
		slider![6](0.7);
		expect(panel.cardRenderConfig!.plainCardFillAlpha).toBe(0.7);
		expect((panel.cardRenderConfig as any).someOtherKey).toBe("preserved");
	});

	it("body font size slider has range 4-16 step 1 and writes through ensureRT", () => {
		const panel = makePanel();
		const cb = makeCb();
		addCardBodyControls(makeMockEl(), panel, cb);
		const slider = addSliderCalls.find((c) => c[1] === "display.cardBodyFontSize");
		expect(slider![2]).toBe(4);
		expect(slider![3]).toBe(16);
		expect(slider![4]).toBe(1);
		expect(slider![5]).toBe(10); // initial from mocked mergeRenderThresholds
		slider![6](14);
		expect(panel.renderThresholds!.cardBodyFontSize).toBe(14);
		expect(cb.recalcNodeRadii).toHaveBeenCalled();
		expect(cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("registers no toggles or selects (sliders only)", () => {
		addCardBodyControls(makeMockEl(), makePanel(), makeCb());
		expect(addToggleCalls.length).toBe(0);
		expect(addSelectCalls.length).toBe(0);
	});
});
