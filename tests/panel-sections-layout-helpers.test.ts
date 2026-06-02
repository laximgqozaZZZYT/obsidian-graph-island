/**
 * Tests for src/views/panel-sections-layout-helpers.ts
 *
 * Covers addAutoFitToggle, addCustomGridControls, addAxisTitlesToggle,
 * and addClusterGravitySliders.
 *
 * Uses vi.mock to stub panel-widgets and i18n so the tests are DOM-free
 * and focused on callback / state-mutation logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PanelState, PanelCallbacks } from "../src/views/PanelBuilder";
import type { ClusterSectionCtx } from "../src/views/panel-sections-layout";

// ---------------------------------------------------------------------------
// Mocks — declared before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock("../src/i18n", () => ({
	t: (key: string) => key,
}));

const addSliderCalls: any[] = [];
const addToggleCalls: any[] = [];
const addSelectCalls: any[] = [];

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
}));

// Constants is not mocked — we rely on its actual values.

// Import AFTER mocks
import {
	addAutoFitToggle,
	addCustomGridControls,
	addAxisTitlesToggle,
	addClusterGravitySliders,
} from "../src/views/panel-sections-layout-helpers";
import { ARRANGEMENT_TIMELINE } from "../src/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockEl(): any {
	return { style: {} };
}

function makePanel(overrides: Partial<PanelState> = {}): PanelState {
	return {
		autoFit: false,
		presetZoomLevel: 0,
		coordinateLayout: null,
		clusterArrangement: "inherit",
		showAxisTitles: true,
		groupBy: "none",
		clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		gridStyle: "lines",
		gridShowHeaders: false,
		gridLabelPlacement: "on-line",
		gridCellShading: false,
		...overrides,
	} as unknown as PanelState;
}

function makeCb(): PanelCallbacks {
	return {
		doRenderKeepPanel: vi.fn(),
		rebuildPanel: vi.fn(),
		markDirty: vi.fn(),
		applyClusterForce: vi.fn(),
		restartSimulation: vi.fn(),
	} as unknown as PanelCallbacks;
}

function makeCtx(body = makeMockEl(), panel?: Partial<PanelState>, spacingSliders: HTMLElement[] = []): ClusterSectionCtx {
	return {
		body,
		panel: makePanel(panel),
		cb: makeCb(),
		ctx: {} as any,
		spacingSliders,
	};
}

// ===========================================================================
// addAutoFitToggle
// ===========================================================================

describe("addAutoFitToggle", () => {
	beforeEach(() => {
		addToggleCalls.length = 0;
		addSliderCalls.length = 0;
		addSelectCalls.length = 0;
	});

	it("creates an autoFit toggle widget", () => {
		addAutoFitToggle(makeCtx());
		const toggle = addToggleCalls.find((c) => c[1] === "cluster.autoFit");
		expect(toggle).toBeDefined();
	});

	it("passes current panel.autoFit as initial value", () => {
		addAutoFitToggle(makeCtx(makeMockEl(), { autoFit: true }));
		const toggle = addToggleCalls.find((c) => c[1] === "cluster.autoFit");
		expect(toggle[2]).toBe(true);
	});

	it("toggle callback sets panel.autoFit to true", () => {
		const ctx = makeCtx();
		addAutoFitToggle(ctx);
		const onChange = addToggleCalls.find((c) => c[1] === "cluster.autoFit")[3];
		onChange(true);
		expect(ctx.panel.autoFit).toBe(true);
	});

	it("enabling autoFit resets presetZoomLevel to 0", () => {
		const ctx = makeCtx(makeMockEl(), { autoFit: false, presetZoomLevel: 3 });
		addAutoFitToggle(ctx);
		const onChange = addToggleCalls.find((c) => c[1] === "cluster.autoFit")[3];
		onChange(true);
		expect(ctx.panel.presetZoomLevel).toBe(0);
	});

	it("disabling autoFit does NOT reset presetZoomLevel", () => {
		const ctx = makeCtx(makeMockEl(), { autoFit: true, presetZoomLevel: 3 });
		addAutoFitToggle(ctx);
		const onChange = addToggleCalls.find((c) => c[1] === "cluster.autoFit")[3];
		onChange(false);
		expect(ctx.panel.presetZoomLevel).toBe(3);
	});

	it("toggle callback calls applyClusterForce and restartSimulation", () => {
		const ctx = makeCtx();
		addAutoFitToggle(ctx);
		const onChange = addToggleCalls.find((c) => c[1] === "cluster.autoFit")[3];
		onChange(true);
		expect(ctx.cb.applyClusterForce).toHaveBeenCalled();
		expect(ctx.cb.restartSimulation).toHaveBeenCalled();
	});

	it("toggle callback calls doRenderKeepPanel", () => {
		const ctx = makeCtx();
		addAutoFitToggle(ctx);
		const onChange = addToggleCalls.find((c) => c[1] === "cluster.autoFit")[3];
		onChange(false);
		expect(ctx.cb.doRenderKeepPanel).toHaveBeenCalled();
	});

	it("disabling autoFit greys-out spacing sliders (opacity 0.5)", () => {
		const slider1 = makeMockEl();
		const slider2 = makeMockEl();
		const ctx: ClusterSectionCtx = {
			body: makeMockEl(),
			panel: makePanel({ autoFit: false }),
			cb: makeCb(),
			ctx: {} as any,
			spacingSliders: [slider1 as HTMLElement, slider2 as HTMLElement],
		};
		addAutoFitToggle(ctx);
		const onChange = addToggleCalls.find((c) => c[1] === "cluster.autoFit")[3];
		// Enable autoFit → sliders should be disabled
		onChange(true);
		expect(slider1.style.opacity).toBe("0.5");
		expect(slider1.style.pointerEvents).toBe("none");
	});

	it("re-enabling sliders restores opacity and pointer-events", () => {
		const slider1 = makeMockEl();
		const ctx: ClusterSectionCtx = {
			body: makeMockEl(),
			panel: makePanel({ autoFit: true }),
			cb: makeCb(),
			ctx: {} as any,
			spacingSliders: [slider1 as HTMLElement],
		};
		addAutoFitToggle(ctx);
		const onChange = addToggleCalls.find((c) => c[1] === "cluster.autoFit")[3];
		// Disable autoFit → sliders should be re-enabled
		onChange(false);
		expect(slider1.style.opacity).toBe("");
		expect(slider1.style.pointerEvents).toBe("");
	});
});

// ===========================================================================
// addCustomGridControls
// ===========================================================================

describe("addCustomGridControls", () => {
	beforeEach(() => {
		addToggleCalls.length = 0;
		addSliderCalls.length = 0;
		addSelectCalls.length = 0;
	});

	it("is a no-op when coordinateLayout is null", () => {
		const ctx = makeCtx(makeMockEl(), { coordinateLayout: null });
		addCustomGridControls(ctx);
		expect(addToggleCalls.length).toBe(0);
		expect(addSelectCalls.length).toBe(0);
	});

	it("creates a table mode toggle when coordinateLayout is set", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date" } as any,
		});
		addCustomGridControls(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.gridTableMode");
		expect(toggle).toBeDefined();
	});

	it("table mode toggle initial value matches whether grid is defined", () => {
		// No grid
		const ctx1 = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date" } as any,
		});
		addCustomGridControls(ctx1);
		const t1 = addToggleCalls.find((c) => c[1] === "guide.gridTableMode");
		expect(t1[2]).toBe(false);

		addToggleCalls.length = 0;

		// With grid
		const ctx2 = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date", grid: { style: "lines", cellShading: false } } as any,
		});
		addCustomGridControls(ctx2);
		const t2 = addToggleCalls.find((c) => c[1] === "guide.gridTableMode");
		expect(t2[2]).toBe(true);
	});

	it("enabling grid table mode sets coordinateLayout.grid", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date" } as any,
			gridStyle: "table",
			gridCellShading: false,
		});
		addCustomGridControls(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.gridTableMode");
		toggle[3](true);
		expect(ctx.panel.coordinateLayout!.grid).toBeDefined();
		expect(ctx.panel.coordinateLayout!.grid!.style).toBe("table");
		expect(ctx.cb.rebuildPanel).toHaveBeenCalled();
	});

	it("disabling grid table mode unsets coordinateLayout.grid", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date", grid: { style: "lines", cellShading: false } } as any,
		});
		addCustomGridControls(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.gridTableMode");
		toggle[3](false);
		expect(ctx.panel.coordinateLayout!.grid).toBeUndefined();
	});

	it("shows extra controls (gridStyle, showHeaders, labelPlacement, cellShading) when grid is active", () => {
		addToggleCalls.length = 0;
		addSelectCalls.length = 0;
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date", grid: { style: "lines", cellShading: false } } as any,
		});
		addCustomGridControls(ctx);
		const gridStyleSel = addSelectCalls.find((c) => c[1] === "guide.gridStyle");
		const headersToggle = addToggleCalls.find((c) => c[1] === "guide.gridShowHeaders");
		const labelSel = addSelectCalls.find((c) => c[1] === "guide.labelPlacement");
		const cellShadingToggle = addToggleCalls.find((c) => c[1] === "guide.gridCellShading");
		expect(gridStyleSel).toBeDefined();
		expect(headersToggle).toBeDefined();
		expect(labelSel).toBeDefined();
		expect(cellShadingToggle).toBeDefined();
	});

	it("gridStyle callback updates panel and coordinateLayout.grid", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date", grid: { style: "lines", cellShading: false } } as any,
			gridStyle: "lines",
		});
		addCustomGridControls(ctx);
		const sel = addSelectCalls.find((c) => c[1] === "guide.gridStyle");
		sel[4]("table");
		expect(ctx.panel.gridStyle).toBe("table");
		expect(ctx.panel.coordinateLayout!.grid!.style).toBe("table");
	});

	it("cellShading callback updates panel and coordinateLayout.grid", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date", grid: { style: "lines", cellShading: false } } as any,
			gridCellShading: false,
		});
		addCustomGridControls(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.gridCellShading");
		toggle[3](true);
		expect(ctx.panel.gridCellShading).toBe(true);
		expect(ctx.panel.coordinateLayout!.grid!.cellShading).toBe(true);
	});

	it("showHeaders callback sets panel.gridShowHeaders", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date", grid: { style: "lines", cellShading: false } } as any,
		});
		addCustomGridControls(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.gridShowHeaders");
		toggle[3](true);
		expect(ctx.panel.gridShowHeaders).toBe(true);
		expect(ctx.cb.markDirty).toHaveBeenCalled();
	});

	it("labelPlacement callback sets panel.gridLabelPlacement", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date", grid: { style: "lines", cellShading: false } } as any,
			gridLabelPlacement: "on-line",
		});
		addCustomGridControls(ctx);
		const sel = addSelectCalls.find((c) => c[1] === "guide.labelPlacement");
		sel[4]("between");
		expect(ctx.panel.gridLabelPlacement).toBe("between");
		expect(ctx.cb.markDirty).toHaveBeenCalled();
	});
});

// ===========================================================================
// addAxisTitlesToggle
// ===========================================================================

describe("addAxisTitlesToggle", () => {
	beforeEach(() => {
		addToggleCalls.length = 0;
	});

	it("is a no-op when no coordinateLayout and arrangement is not timeline", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: null,
			clusterArrangement: "cluster",
		});
		addAxisTitlesToggle(ctx);
		expect(addToggleCalls.length).toBe(0);
	});

	it("creates toggle when coordinateLayout is set", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date" } as any,
			clusterArrangement: "grid",
		});
		addAxisTitlesToggle(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.showAxisTitles");
		expect(toggle).toBeDefined();
	});

	it("creates toggle when clusterArrangement is ARRANGEMENT_TIMELINE", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: null,
			clusterArrangement: ARRANGEMENT_TIMELINE,
		});
		addAxisTitlesToggle(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.showAxisTitles");
		expect(toggle).toBeDefined();
	});

	it("passes current showAxisTitles as initial value", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date" } as any,
			showAxisTitles: false,
		});
		addAxisTitlesToggle(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.showAxisTitles");
		expect(toggle[2]).toBe(false);
	});

	it("toggle callback updates panel.showAxisTitles and calls markDirty", () => {
		const ctx = makeCtx(makeMockEl(), {
			coordinateLayout: { xField: "date" } as any,
			showAxisTitles: true,
		});
		addAxisTitlesToggle(ctx);
		const toggle = addToggleCalls.find((c) => c[1] === "guide.showAxisTitles");
		toggle[3](false);
		expect(ctx.panel.showAxisTitles).toBe(false);
		expect(ctx.cb.markDirty).toHaveBeenCalled();
	});
});

// ===========================================================================
// addClusterGravitySliders
// ===========================================================================

describe("addClusterGravitySliders", () => {
	const debouncedClusterForce = vi.fn();

	beforeEach(() => {
		addSliderCalls.length = 0;
		debouncedClusterForce.mockClear();
	});

	it("is a no-op when groupBy is 'none'", () => {
		const ctx = makeCtx(makeMockEl(), { groupBy: "none" });
		addClusterGravitySliders(ctx, debouncedClusterForce);
		expect(addSliderCalls.length).toBe(0);
	});

	it("is a no-op when groupBy is empty string", () => {
		const ctx = makeCtx(makeMockEl(), { groupBy: "" as any });
		addClusterGravitySliders(ctx, debouncedClusterForce);
		expect(addSliderCalls.length).toBe(0);
	});

	it("creates interGroupAttraction slider when groupBy is set", () => {
		const ctx = makeCtx(makeMockEl(), { groupBy: "category" });
		addClusterGravitySliders(ctx, debouncedClusterForce);
		const slider = addSliderCalls.find((c) => c[1] === "gravity.interGroupAttraction");
		expect(slider).toBeDefined();
	});

	it("creates intraGroupDensity slider when groupBy is set", () => {
		const ctx = makeCtx(makeMockEl(), { groupBy: "category" });
		addClusterGravitySliders(ctx, debouncedClusterForce);
		const slider = addSliderCalls.find((c) => c[1] === "gravity.intraGroupDensity");
		expect(slider).toBeDefined();
	});

	it("initialises clusterGravity if undefined", () => {
		const ctx = makeCtx(makeMockEl(), { groupBy: "category", clusterGravity: undefined as any });
		addClusterGravitySliders(ctx, debouncedClusterForce);
		expect(ctx.panel.clusterGravity).toBeDefined();
		expect(ctx.panel.clusterGravity.interGroupAttraction).toBe(0.5);
		expect(ctx.panel.clusterGravity.intraGroupDensity).toBe(1.0);
	});

	it("interGroupAttraction slider callback updates panel and calls debounced fn", () => {
		const ctx = makeCtx(makeMockEl(), { groupBy: "category" });
		addClusterGravitySliders(ctx, debouncedClusterForce);
		const slider = addSliderCalls.find((c) => c[1] === "gravity.interGroupAttraction");
		slider[6](0.8);
		expect(ctx.panel.clusterGravity.interGroupAttraction).toBe(0.8);
		expect(debouncedClusterForce).toHaveBeenCalled();
	});

	it("intraGroupDensity slider callback updates panel and calls debounced fn", () => {
		const ctx = makeCtx(makeMockEl(), { groupBy: "category" });
		addClusterGravitySliders(ctx, debouncedClusterForce);
		const slider = addSliderCalls.find((c) => c[1] === "gravity.intraGroupDensity");
		slider[6](1.5);
		expect(ctx.panel.clusterGravity.intraGroupDensity).toBe(1.5);
		expect(debouncedClusterForce).toHaveBeenCalled();
	});

	it("passes initial interGroupAttraction value to slider", () => {
		const ctx = makeCtx(makeMockEl(), {
			groupBy: "category",
			clusterGravity: { interGroupAttraction: 1.2, intraGroupDensity: 0.8 },
		});
		addClusterGravitySliders(ctx, debouncedClusterForce);
		const slider = addSliderCalls.find((c) => c[1] === "gravity.interGroupAttraction");
		expect(slider[5]).toBe(1.2);
	});

	it("passes initial intraGroupDensity value to slider", () => {
		const ctx = makeCtx(makeMockEl(), {
			groupBy: "tags",
			clusterGravity: { interGroupAttraction: 0.3, intraGroupDensity: 2.0 },
		});
		addClusterGravitySliders(ctx, debouncedClusterForce);
		const slider = addSliderCalls.find((c) => c[1] === "gravity.intraGroupDensity");
		expect(slider[5]).toBe(2.0);
	});
});
