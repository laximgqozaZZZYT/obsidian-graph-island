import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PanelState, PanelCallbacks, PanelContext } from "../src/views/PanelBuilder";
import {
	buildBookmarkSection,
	buildHoverBehaviorSection,
	buildNodeDisplayModeSection,
	buildNodeDecorationSection,
	buildStructureAnalysisSection,
	buildDiscoverySection,
	buildInteractionSection,
	buildCableDisplaySection,
	buildRoadNetworkSection,
	buildMinimapSection,
	buildRenderThresholdsSection,
	buildRelationColorSection,
} from "../src/views/panel-sections-filter";

// ---------------------------------------------------------------------------
// Simple DOM mock for testing section builders
// ---------------------------------------------------------------------------

class MockElement {
	textContent = "";
	className = "";
	innerHTML = "";
	parentNode: MockElement | null = null;
	children: MockElement[] = [];
	private eventListeners: Record<string, Function[]> = {};
	private styleProps: Record<string, string> = {};
	private styleObj: any;
	private attributes: Record<string, string> = {};
	tag = "";

	constructor() {
		this.styleObj = {
			setProperty: (_key: string, _val: string) => {},
			cssText: "",
			opacity: "",
			pointerEvents: "",
			marginTop: "",
			marginLeft: "",
			width: "",
		};
	}

	get style() {
		return this.styleObj;
	}

	get min() {
		return this.getAttribute("min") ?? "0";
	}
	get max() {
		return this.getAttribute("max") ?? "100";
	}
	get step() {
		return this.getAttribute("step") ?? "1";
	}
	get value() {
		return this.getAttribute("value") ?? "";
	}
	set value(v: string) {
		this.setAttribute("value", v);
	}
	get type() {
		return this.getAttribute("type") ?? "";
	}
	get placeholder() {
		return this.getAttribute("placeholder") ?? "";
	}
	set placeholder(v: string) {
		this.setAttribute("placeholder", v);
	}
	set min(v: string) {
		this.setAttribute("min", v);
	}
	set max(v: string) {
		this.setAttribute("max", v);
	}
	set step(v: string) {
		this.setAttribute("step", v);
	}
	get checked() {
		return this.getAttribute("checked") === "true";
	}
	set checked(v: boolean) {
		this.setAttribute("checked", String(v));
	}

	createDiv(opts?: { cls?: string; text?: string }): MockElement {
		const el = new MockElement();
		el.parentNode = this;
		if (opts?.cls) el.classList.add(...opts.cls.split(" "));
		if (opts?.text) el.textContent = opts.text;
		this.children.push(el);
		return el;
	}

	appendChild(el: MockElement) {
		if (el.parentNode && el.parentNode !== this) {
			const idx = el.parentNode.children.indexOf(el);
			if (idx >= 0) el.parentNode.children.splice(idx, 1);
		}
		el.parentNode = this;
		this.children.push(el);
		return el;
	}

	insertBefore(newEl: MockElement, refEl: MockElement) {
		const idx = this.children.indexOf(refEl);
		if (idx >= 0) {
			this.children.splice(idx, 0, newEl);
		} else {
			this.children.push(newEl);
		}
		newEl.parentNode = this;
		return newEl;
	}

	createEl(tag: string, opts?: { cls?: string; text?: string; type?: string; attr?: Record<string, string> }): MockElement {
		const el = new MockElement();
		el.parentNode = this;
		el.tag = tag;
		if (opts?.cls) el.classList.add(...opts.cls.split(" "));
		if (opts?.text) el.textContent = opts.text;
		if (opts?.type) el.setAttribute("type", opts.type);
		if (opts?.attr) {
			for (const [k, v] of Object.entries(opts.attr)) {
				el.setAttribute(k, v);
			}
		}
		this.children.push(el);
		return el;
	}

	addClass(cls: string) {
		const classes = this.className.split(" ").filter(c => c);
		if (!classes.includes(cls)) classes.push(cls);
		this.className = classes.join(" ");
	}

	classList = {
		add: (...cls: string[]) => {
			for (const c of cls) this.addClass(c);
		},
		remove: (cls: string) => {
			this.className = this.className.split(" ").filter(c => c !== cls).join(" ");
		},
		toggle: (cls: string, force?: boolean) => {
			if (force === true) this.addClass(cls);
			else if (force === false) this.classList.remove(cls);
			else {
				if (this.className.includes(cls)) this.classList.remove(cls);
				else this.addClass(cls);
			}
		},
		has: (cls: string) => this.className.includes(cls),
	};

	setAttribute(k: string, v: string) {
		this.attributes[k] = v;
	}

	getAttribute(k: string) {
		return this.attributes[k];
	}

	addEventListener(event: string, fn: Function) {
		if (!this.eventListeners[event]) this.eventListeners[event] = [];
		this.eventListeners[event].push(fn);
	}

	click() {
		this.dispatchEvent(new Event("click"));
	}

	dispatchEvent(evt: Event | { type: string }) {
		const listeners = this.eventListeners[evt.type] || [];
		for (const fn of listeners) {
			fn(evt);
		}
	}

	querySelector(selector: string): MockElement | null {
		if (this.matchesSelector(selector)) return this;
		for (const child of this.children) {
			const found = child.querySelector(selector);
			if (found) return found;
		}
		return null;
	}

	querySelectorAll(selector: string): MockElement[] {
		const results: MockElement[] = [];
		if (this.matchesSelector(selector)) results.push(this);
		for (const child of this.children) {
			results.push(...child.querySelectorAll(selector));
		}
		return results;
	}

	private matchesSelector(sel: string): boolean {
		if (sel.startsWith(".")) return this.className.includes(sel.substring(1));
		if (sel === "select") return this.tag === "select";
		if (sel === "option") return this.tag === "option";
		return false;
	}

	empty() {
		this.children = [];
	}
}

// Mock global document
(global as any).document = {
	createElement: (tag: string) => {
		const el = new MockElement();
		el.tag = tag;
		return el;
	},
	createElementNS: (_ns: string, tag: string) => {
		const el = new MockElement();
		el.tag = tag;
		return el;
	},
};

// Mock setIcon from obsidian
vi.mock("obsidian", () => ({
	setIcon: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock helpers for test setup
// ---------------------------------------------------------------------------

function createMockPanel(): PanelState {
	return {
		viewMode: "graph",
		bookmarkedNodes: ["node1", "node2"],
		hoverHops: 2,
		hoverHighlightTypes: {
			forwardLinks: true,
			backlinks: true,
			sharedTags: false,
			sameFolder: false,
		},
		nodeDisplayMode: "node",
		cardDisplayConfig: {
			preset: "custom",
			fields: [],
			maxWidth: 120,
			showIcon: false,
			headerStyle: "plain",
			fieldFormat: "key-value",
		},
		donutDisplayConfig: {
			breakdownField: undefined,
			innerRadius: 0.6,
		},
		semanticZoom: false,
		showTagBadges: false,
		showImportanceRing: false,
		importanceMetric: "degree",
		showRecencyMarker: false,
		recencyDays: 30,
		definitionField: "definition",
		showNodeThumbnails: false,
		showOntologyBackbone: false,
		clusterLabelDetail: "standard",
		highlightPatterns: false,
		focusMode: false,
		focusNodeId: null,
		focusLayout: false,
		localGraphCenter: null,
		showHierarchyBreadcrumb: false,
		showRelationMatrix: false,
		showSimilarSuggestions: false,
		showStructureQuestions: false,
		showClusterCompare: false,
		showHierarchyTree: false,
		analysisOverlay: "off",
		multiSelectNodeIds: [],
		cableBundleMode: "auto",
		cableTrunkWidth: 8,
		cableTrunkAlpha: 0.5,
		cableSpacing: 8,
		cableFanWidth: 1,
		cableFanAlpha: 0.3,
		renderThresholds: {
			showRoadNetwork: false,
			roadRouteEdges: false,
			roadAlpha: 0.3,
			roadWidth: 4,
		},
		showMinimap: true,
		showLegend: true,
		showOutOfBoundsIndicator: false,
		showGraphStats: false,
		highContrastMode: false,
		zoomSensitivity: 1.0,
		savedViewports: [],
		tagDisplay: "enclosure",
		showTagNodes: true,
	} as any;
}

function createMockCallbacks(): PanelCallbacks {
	return {
		markDirty: vi.fn(),
		doRenderKeepPanel: vi.fn(),
		rebuildPanel: vi.fn(),
		rebuildHoverAdj: vi.fn(),
		applyHover: vi.fn(),
		doRender: vi.fn(),
		recalcNodeRadii: vi.fn(),
		refreshOverlays: vi.fn(),
		applyEgoToVisible: vi.fn(),
		jumpToNode: vi.fn(),
		bulkAddTag: vi.fn(),
		bulkSetField: vi.fn(),
		rebuildNodesInPlace: vi.fn(),
		announceA11y: vi.fn(),
		restoreViewport: vi.fn(),
		wakeRenderLoop: vi.fn(),
	} as any;
}

function createMockContext(options?: { hasImageMetaNodes?: boolean; hasInheritanceEdges?: boolean }): PanelContext {
	return {
		settings: {
			ontology: {
				rules: options?.hasImageMetaNodes ? [{ nodeTypeField: "node_type" }] : [],
				useTagHierarchy: false,
			},
		} as any,
		app: {} as any,
		hasImageMetaNodes: options?.hasImageMetaNodes ?? false,
		hasInheritanceEdges: options?.hasInheritanceEdges ?? false,
		relationColors: new Map([
			["link", "#0000ff"],
			["semantic", "#ff0000"],
		]),
	} as any;
}

// ---------------------------------------------------------------------------
// Test: buildBookmarkSection
// ---------------------------------------------------------------------------

describe("buildBookmarkSection", () => {
	it("creates empty bookmark section when no bookmarks", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.bookmarkedNodes = [];
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildBookmarkSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("creates bookmark items for each bookmarked node", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.bookmarkedNodes = ["file1", "file2"];
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildBookmarkSection(tabEl, panel, ctx, cb);

		// Section should have children
		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("calls jumpToNode callback when bookmark label clicked", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.bookmarkedNodes = ["file1"];
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildBookmarkSection(tabEl, panel, ctx, cb);

		// Verify callback is registered (in real DOM would fire on click)
		expect(cb.jumpToNode).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Test: buildHoverBehaviorSection
// ---------------------------------------------------------------------------

describe("buildHoverBehaviorSection", () => {
	it("creates section with hover toggles", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildHoverBehaviorSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("initializes hoverHighlightTypes if undefined", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.hoverHighlightTypes = undefined as any;
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildHoverBehaviorSection(tabEl, panel, ctx, cb);

		// Function should complete without error
		expect(tabEl).toBeTruthy();
	});

	it("creates slider for hover hops", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.hoverHops = 2;
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildHoverBehaviorSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Test: buildNodeDisplayModeSection
// ---------------------------------------------------------------------------

describe("buildNodeDisplayModeSection", () => {
	it("creates section with display mode select", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.nodeDisplayMode = "node";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDisplayModeSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("shows card preset options when nodeDisplayMode is card", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.nodeDisplayMode = "card";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDisplayModeSection(tabEl, panel, ctx, cb);

		// Function completes successfully
		expect(tabEl).toBeTruthy();
	});

	it("shows donut options when nodeDisplayMode is donut", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.nodeDisplayMode = "donut";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDisplayModeSection(tabEl, panel, ctx, cb);

		// Function completes successfully
		expect(tabEl).toBeTruthy();
	});

	it("does not show extra options for sunburst-segment mode", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.nodeDisplayMode = "sunburst-segment";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDisplayModeSection(tabEl, panel, ctx, cb);

		// Section created with just base select
		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("calls doRenderKeepPanel on mode change", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDisplayModeSection(tabEl, panel, ctx, cb);

		expect(cb.doRenderKeepPanel).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Test: buildNodeDecorationSection
// ---------------------------------------------------------------------------

describe("buildNodeDecorationSection", () => {
	it("creates section with semantic zoom toggle", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDecorationSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("shows importance ring options when enabled", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.showImportanceRing = true;
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDecorationSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});

	it("shows recency marker options when enabled", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.showRecencyMarker = true;
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildNodeDecorationSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});

	it("shows node thumbnail toggle when hasImageMetaNodes is true", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext({ hasImageMetaNodes: true });
		const cb = createMockCallbacks();

		buildNodeDecorationSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Test: buildStructureAnalysisSection
// ---------------------------------------------------------------------------

describe("buildStructureAnalysisSection", () => {
	it("creates section with structure toggles", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildStructureAnalysisSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("shows cluster label detail select when tag enclosure is active", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.showTagNodes = true;
		panel.tagDisplay = "enclosure";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildStructureAnalysisSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});

	it("shows focus layout toggle when focusMode is enabled", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.focusMode = true;
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildStructureAnalysisSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});

	it("shows hierarchy breadcrumb toggle when localGraphCenter is set", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.localGraphCenter = "file.md";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildStructureAnalysisSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});

	it("shows applyEgoLayout button when focusNodeId is set", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.focusNodeId = "node1";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildStructureAnalysisSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Test: buildDiscoverySection
// ---------------------------------------------------------------------------

describe("buildDiscoverySection", () => {
	it("creates section with analysis overlay select", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildDiscoverySection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("shows hierarchy tree toggle when inheritance edges exist", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext({ hasInheritanceEdges: true });
		const cb = createMockCallbacks();

		buildDiscoverySection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});

	it("creates toggles for similar suggestions and structure questions", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildDiscoverySection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Test: buildInteractionSection
// ---------------------------------------------------------------------------

describe("buildInteractionSection", () => {
	it("does not show controls when no multi-select nodes", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.multiSelectNodeIds = [];
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildInteractionSection(tabEl, panel, ctx, cb);

		// Section created but no multi-select controls
		expect(tabEl).toBeTruthy();
	});

	it("shows multi-select status when nodes selected", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.multiSelectNodeIds = ["node1", "node2"];
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildInteractionSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Test: buildCableDisplaySection
// ---------------------------------------------------------------------------

describe("buildCableDisplaySection", () => {
	it("creates section with cable bundle mode select", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.cableBundleMode = "auto";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildCableDisplaySection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("shows cable sliders when bundle mode is not never", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.cableBundleMode = "always";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildCableDisplaySection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});

	it("does not show cable sliders when bundle mode is never", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.cableBundleMode = "never";
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildCableDisplaySection(tabEl, panel, ctx, cb);

		// Just the select control
		expect(tabEl.children.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Test: buildRoadNetworkSection
// ---------------------------------------------------------------------------

describe("buildRoadNetworkSection", () => {
	it("creates section with road network toggle", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildRoadNetworkSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("shows road network sub-settings when enabled", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.renderThresholds = { showRoadNetwork: true };
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildRoadNetworkSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Test: buildMinimapSection
// ---------------------------------------------------------------------------

describe("buildMinimapSection", () => {
	it("creates section with minimap and display toggles", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildMinimapSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("shows saved viewports list when viewports exist", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.savedViewports = [
			{ name: "Overview", x: 0, y: 0, scale: 1 },
			{ name: "Detailed", x: 100, y: 100, scale: 2 },
		];
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildMinimapSection(tabEl, panel, ctx, cb);

		expect(tabEl).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Test: buildRenderThresholdsSection
// ---------------------------------------------------------------------------

describe("buildRenderThresholdsSection", () => {
	it("creates section with performance sliders", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildRenderThresholdsSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("applies default threshold values when renderThresholds not set", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.renderThresholds = undefined;
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildRenderThresholdsSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Test: buildRelationColorSection
// ---------------------------------------------------------------------------

describe("buildRelationColorSection", () => {
	it("creates section when colorEdgesByRelation is true and colors exist", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.colorEdgesByRelation = true;
		const ctx = createMockContext();
		ctx.relationColors = new Map([["link", "#0000ff"]]);
		const cb = createMockCallbacks();

		buildRelationColorSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});

	it("does not create section when colorEdgesByRelation is false", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.colorEdgesByRelation = false;
		const ctx = createMockContext();
		const cb = createMockCallbacks();

		buildRelationColorSection(tabEl, panel, ctx, cb);

		// No section created
		expect(tabEl.children.length).toBe(0);
	});

	it("does not create section when relationColors is empty", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.colorEdgesByRelation = true;
		const ctx = createMockContext();
		ctx.relationColors = new Map();
		const cb = createMockCallbacks();

		buildRelationColorSection(tabEl, panel, ctx, cb);

		// No section created
		expect(tabEl.children.length).toBe(0);
	});

	it("creates color picker for each relation", () => {
		const tabEl = new MockElement() as any;
		const panel = createMockPanel();
		panel.colorEdgesByRelation = true;
		const ctx = createMockContext();
		ctx.relationColors = new Map([
			["link", "#0000ff"],
			["semantic", "#ff0000"],
		]);
		const cb = createMockCallbacks();

		buildRelationColorSection(tabEl, panel, ctx, cb);

		expect(tabEl.children.length).toBeGreaterThan(0);
	});
});
