/**
 * Tests for src/views/panel-sections-layout-helpers.ts
 *
 * Covers:
 *   - addAutoFitToggle
 *   - addCustomGridControls
 *   - addAxisTitlesToggle
 *   - addClusterGravitySliders
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock i18n — return key as label
vi.mock("../../src/i18n", () => ({
	t: (key: string) => key,
}));

// Mock constants so ARRANGEMENT_TIMELINE is available
vi.mock("../../src/constants", () => ({
	ARRANGEMENT_TIMELINE: "timeline",
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

// Import after mocks
import {
	addAutoFitToggle,
	addCustomGridControls,
	addAxisTitlesToggle,
	addClusterGravitySliders,
} from "../../src/views/panel-sections-layout-helpers";
import type { ClusterSectionCtx } from "../../src/views/panel-sections-layout";
import type { PanelState, PanelCallbacks } from "../../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockEl(): any {
	const el = {
		createDiv: vi.fn(() => makeMockEl()),
		createEl: vi.fn(() => {
			const inner = makeMockEl();
			inner.addEventListener = vi.fn();
			return inner;
		}),
		style: {
			opacity: "",
			pointerEvents: "",
		},
		addEventListener: vi.fn(),
	};
	return el;
}

function makeSpacingSlider(): any {
	return {
		style: {
			opacity: "",
			pointerEvents: "",
		},
	};
}

function makePanel(overrides: Partial<PanelState> = {}): PanelState {
	return {
		autoFit: false,
		presetZoomLevel: 0,
		coordinateLayout: null,
		clusterArrangement: "grid",
		showAxisTitles: true,
		gridStyle: "lines",
		gridShowHeaders: true,
		gridLabelPlacement: "on-line",
		gridCellShading: false,
		groupBy: "tag",
		clusterGravity: {
			interGroupAttraction: 0.5,
			intraGroupDensity: 1.0,
		},
		...overrides,
	} as any;
}

function makeCb(): PanelCallbacks {
	return {
		markDirty: vi.fn(),
		rebuildPanel: vi.fn(),
		announceA11y: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		applyClusterForce: vi.fn(),
		restartSimulation: vi.fn(),
		recalcNodeRadii: vi.fn(),
	} as any;
}

function makeCtx(panel?: PanelState, spacingSliders?: any[]): ClusterSectionCtx {
	return {
		body: makeMockEl(),
		panel: panel ?? makePanel(),
		cb: makeCb(),
		ctx: {} as any,
		spacingSliders: spacingSliders ?? [],
	};
}

// ---------------------------------------------------------------------------
// addAutoFitToggle
// ---------------------------------------------------------------------------

describe("addAutoFitToggle", () => {
	beforeEach(() => {
		addToggleCalls.length = 0;
		addSliderCalls.length = 0;
		addSelectCalls.length = 0;
	});

	it("calls addToggle with autoFit key", () => {
		const s = makeCtx();
		addAutoFitToggle(s);

		expect(addToggleCalls.length).toBeGreaterThan(0);
		// label key should reference cluster.autoFit
		expect(addToggleCalls[0][1]).toBe("cluster.autoFit");
	});

	it("passes current autoFit value as initial state", () => {
		const panel = makePanel({ autoFit: true } as any);
		const s = makeCtx(panel);
		addAutoFitToggle(s);

		expect(addToggleCalls[0][2]).toBe(true);
	});

	it("onChange sets panel.autoFit and calls applyClusterForce", () => {
		const s = makeCtx();
		addAutoFitToggle(s);

		const onChange = addToggleCalls[0][3];
		onChange(true);

		expect(s.panel.autoFit).toBe(true);
		expect(s.cb.applyClusterForce).toHaveBeenCalled();
	});

	it("enabling autoFit resets presetZoomLevel to 0", () => {
		const panel = makePanel({ presetZoomLevel: 5 } as any);
		const s = makeCtx(panel);
		addAutoFitToggle(s);

		const onChange = addToggleCalls[0][3];
		onChange(true);

		expect(s.panel.presetZoomLevel).toBe(0);
	});

	it("disabling autoFit does not reset presetZoomLevel", () => {
		const panel = makePanel({ presetZoomLevel: 3, autoFit: true } as any);
		const s = makeCtx(panel);
		addAutoFitToggle(s);

		const onChange = addToggleCalls[0][3];
		onChange(false);

		expect(s.panel.presetZoomLevel).toBe(3);
	});

	it("enables autoFit and disables spacing sliders visually", () => {
		const slider = makeSpacingSlider();
		const s = makeCtx(makePanel(), [slider]);
		addAutoFitToggle(s);

		const onChange = addToggleCalls[0][3];
		onChange(true);

		expect(slider.style.opacity).toBe("0.5");
		expect(slider.style.pointerEvents).toBe("none");
	});

	it("disabling autoFit re-enables spacing sliders", () => {
		const slider = makeSpacingSlider();
		slider.style.opacity = "0.5";
		slider.style.pointerEvents = "none";
		const s = makeCtx(makePanel(), [slider]);
		addAutoFitToggle(s);

		const onChange = addToggleCalls[0][3];
		onChange(false);

		expect(slider.style.opacity).toBe("");
		expect(slider.style.pointerEvents).toBe("");
	});

	it("calls restartSimulation and doRenderKeepPanel", () => {
		const s = makeCtx();
		addAutoFitToggle(s);

		const onChange = addToggleCalls[0][3];
		onChange(true);

		expect(s.cb.restartSimulation).toHaveBeenCalled();
		expect(s.cb.doRenderKeepPanel).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// addCustomGridControls
// ---------------------------------------------------------------------------

describe("addCustomGridControls", () => {
	beforeEach(() => {
		addToggleCalls.length = 0;
		addSliderCalls.length = 0;
		addSelectCalls.length = 0;
	});

	it("is a no-op when coordinateLayout is null/undefined", () => {
		const panel = makePanel({ coordinateLayout: null } as any);
		const s = makeCtx(panel);
		addCustomGridControls(s);

		expect(addToggleCalls.length).toBe(0);
		expect(addSelectCalls.length).toBe(0);
	});

	it("adds grid table-mode toggle when coordinateLayout is set", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid" } as any,
			gridStyle: "lines",
			gridCellShading: false,
		} as any);
		const s = makeCtx(panel);
		addCustomGridControls(s);

		expect(addToggleCalls.length).toBeGreaterThan(0);
		expect(addToggleCalls[0][1]).toBe("guide.gridTableMode");
	});

	it("tableMode toggle onChange=true creates grid config", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid" } as any,
			gridStyle: "table",
			gridCellShading: true,
		} as any);
		const s = makeCtx(panel);
		addCustomGridControls(s);

		const onChange = addToggleCalls[0][3];
		onChange(true);

		expect(panel.coordinateLayout!.grid).toBeDefined();
		expect(panel.coordinateLayout!.grid!.style).toBe("table");
		expect(panel.coordinateLayout!.grid!.cellShading).toBe(true);
	});

	it("tableMode toggle onChange=false removes grid config", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid", grid: { style: "lines", cellShading: false } } as any,
		} as any);
		const s = makeCtx(panel);
		addCustomGridControls(s);

		const onChange = addToggleCalls[0][3];
		onChange(false);

		expect(panel.coordinateLayout!.grid).toBeUndefined();
	});

	it("adds grid style controls when grid is active", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid", grid: { style: "lines", cellShading: false } } as any,
			gridStyle: "lines",
			gridShowHeaders: true,
			gridLabelPlacement: "on-line",
			gridCellShading: false,
		} as any);
		const s = makeCtx(panel);
		addCustomGridControls(s);

		// Should have select for gridStyle, toggle for gridTableMode, more toggles, etc.
		expect(addSelectCalls.length).toBeGreaterThan(0);
		const gridStyleSelect = addSelectCalls.find((c) => c[1] === "guide.gridStyle");
		expect(gridStyleSelect).toBeDefined();
	});

	it("gridStyle select onChange updates panel and coordinateLayout", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid", grid: { style: "lines", cellShading: false } } as any,
			gridStyle: "lines",
			gridShowHeaders: true,
			gridLabelPlacement: "on-line",
			gridCellShading: false,
		} as any);
		const s = makeCtx(panel);
		addCustomGridControls(s);

		const gridStyleSelect = addSelectCalls.find((c) => c[1] === "guide.gridStyle");
		gridStyleSelect![4]("table");

		expect(panel.gridStyle).toBe("table");
		expect(panel.coordinateLayout!.grid!.style).toBe("table");
	});
});

// ---------------------------------------------------------------------------
// addAxisTitlesToggle
// ---------------------------------------------------------------------------

describe("addAxisTitlesToggle", () => {
	beforeEach(() => {
		addToggleCalls.length = 0;
		addSliderCalls.length = 0;
		addSelectCalls.length = 0;
	});

	it("is a no-op when coordinateLayout is null and arrangement is not timeline", () => {
		const panel = makePanel({
			coordinateLayout: null,
			clusterArrangement: "grid",
		} as any);
		const s = makeCtx(panel);
		addAxisTitlesToggle(s);

		expect(addToggleCalls.length).toBe(0);
	});

	it("adds toggle when coordinateLayout is set", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid" } as any,
			showAxisTitles: true,
		} as any);
		const s = makeCtx(panel);
		addAxisTitlesToggle(s);

		expect(addToggleCalls.length).toBeGreaterThan(0);
		expect(addToggleCalls[0][1]).toBe("guide.showAxisTitles");
	});

	it("adds toggle when arrangement is 'timeline'", () => {
		const panel = makePanel({
			coordinateLayout: null,
			clusterArrangement: "timeline",
			showAxisTitles: false,
		} as any);
		const s = makeCtx(panel);
		addAxisTitlesToggle(s);

		expect(addToggleCalls.length).toBeGreaterThan(0);
	});

	it("passes current showAxisTitles value", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid" } as any,
			showAxisTitles: false,
		} as any);
		const s = makeCtx(panel);
		addAxisTitlesToggle(s);

		expect(addToggleCalls[0][2]).toBe(false);
	});

	it("toggle onChange updates panel.showAxisTitles and calls markDirty", () => {
		const panel = makePanel({
			coordinateLayout: { type: "grid" } as any,
			showAxisTitles: true,
		} as any);
		const s = makeCtx(panel);
		addAxisTitlesToggle(s);

		const onChange = addToggleCalls[0][3];
		onChange(false);

		expect(panel.showAxisTitles).toBe(false);
		expect(s.cb.markDirty).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// addClusterGravitySliders
// ---------------------------------------------------------------------------

describe("addClusterGravitySliders", () => {
	beforeEach(() => {
		addSliderCalls.length = 0;
		addToggleCalls.length = 0;
		addSelectCalls.length = 0;
	});

	it("is a no-op when groupBy is undefined", () => {
		const panel = makePanel({ groupBy: undefined } as any);
		const s = makeCtx(panel);
		addClusterGravitySliders(s, vi.fn());

		expect(addSliderCalls.length).toBe(0);
	});

	it("is a no-op when groupBy is 'none'", () => {
		const panel = makePanel({ groupBy: "none" } as any);
		const s = makeCtx(panel);
		addClusterGravitySliders(s, vi.fn());

		expect(addSliderCalls.length).toBe(0);
	});

	it("adds interGroupAttraction slider when groupBy is active", () => {
		const panel = makePanel({
			groupBy: "tag",
			clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		} as any);
		const s = makeCtx(panel);
		addClusterGravitySliders(s, vi.fn());

		expect(addSliderCalls.length).toBeGreaterThanOrEqual(1);
		const attractionSlider = addSliderCalls.find((c) => c[5] === 0.5);
		expect(attractionSlider).toBeDefined();
	});

	it("adds intraGroupDensity slider when groupBy is active", () => {
		const panel = makePanel({
			groupBy: "folder",
			clusterGravity: { interGroupAttraction: 0.3, intraGroupDensity: 1.5 },
		} as any);
		const s = makeCtx(panel);
		addClusterGravitySliders(s, vi.fn());

		expect(addSliderCalls.length).toBeGreaterThanOrEqual(2);
		const densitySlider = addSliderCalls.find((c) => c[5] === 1.5);
		expect(densitySlider).toBeDefined();
	});

	it("initializes clusterGravity if undefined", () => {
		const panel = makePanel({
			groupBy: "tag",
			clusterGravity: undefined,
		} as any);
		const s = makeCtx(panel);
		addClusterGravitySliders(s, vi.fn());

		expect(panel.clusterGravity).toBeDefined();
		expect(panel.clusterGravity.interGroupAttraction).toBe(0.5);
		expect(panel.clusterGravity.intraGroupDensity).toBe(1.0);
	});

	it("interGroupAttraction slider onChange calls debouncedClusterForce", () => {
		const panel = makePanel({
			groupBy: "tag",
			clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		} as any);
		const s = makeCtx(panel);
		const debouncedForce = vi.fn();
		addClusterGravitySliders(s, debouncedForce);

		const onChange = addSliderCalls[0][6];
		onChange(0.8);

		expect(panel.clusterGravity.interGroupAttraction).toBe(0.8);
		expect(debouncedForce).toHaveBeenCalled();
	});

	it("intraGroupDensity slider onChange calls debouncedClusterForce", () => {
		const panel = makePanel({
			groupBy: "tag",
			clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
		} as any);
		const s = makeCtx(panel);
		const debouncedForce = vi.fn();
		addClusterGravitySliders(s, debouncedForce);

		const onChange = addSliderCalls[1][6];
		onChange(2.0);

		expect(panel.clusterGravity.intraGroupDensity).toBe(2.0);
		expect(debouncedForce).toHaveBeenCalled();
	});
});
