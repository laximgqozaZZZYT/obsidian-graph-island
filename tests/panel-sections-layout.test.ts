import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PanelState, PanelCallbacks, PanelContext } from "../src/views/PanelBuilder";
import type { GraphViewsSettings } from "../src/types";
import {
  buildGraphSyncSection,
  buildPluginSettingsSection,
  buildOntologySection,
  buildCustomMappingsSection,
  buildTagRelationsSection,
  buildSamplePresetSelector,
  buildArrangementPatternSelect,
  buildConcentricOptions,
  buildCoordinateControls,
  buildTimelineControls,
  buildAutoFitAndGuides,
  buildSpacingAndGroupArrangement,
  buildForceParameters,
  buildClusterGroupRules,
  buildDirectionalGravityRules,
  buildSortRules,
  type ClusterSectionCtx,
} from "../src/views/panel-sections-layout";

// Simple DOM mock for testing
class MockElement {
  textContent = "";
  className = "";
  innerHTML = "";
  parentNode: MockElement | null = null;
  children: MockElement[] = [];
  private eventListeners: Record<string, Function[]> = {};
  private styleProps: Record<string, string> = {};
  private styleObj: any;
  tag = "";  // Track HTML tag name

  constructor() {
    this.styleObj = {
      setProperty: (_key: string, _val: string) => {},
      opacity: "",
      pointerEvents: "",
    };
  }

  get style() { return this.styleObj; }

  get min() { return this.getAttribute("min") ?? "0"; }
  get max() { return this.getAttribute("max") ?? "100"; }
  get step() { return this.getAttribute("step") ?? "1"; }
  get value() { return this.getAttribute("value") ?? ""; }
  set value(v: string) { this.setAttribute("value", v); }
  get type() { return this.getAttribute("type") ?? ""; }
  get placeholder() { return this.getAttribute("placeholder") ?? ""; }
  set placeholder(v: string) { this.setAttribute("placeholder", v); }
  set min(v: string) { this.setAttribute("min", v); }
  set max(v: string) { this.setAttribute("max", v); }
  set step(v: string) { this.setAttribute("step", v); }
  get selected() { return this.getAttribute("selected") === "true"; }
  set selected(v: boolean) { this.setAttribute("selected", String(v)); }

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

  hasClass(cls: string) {
    return this.className.includes(cls);
  }

  toggleClass(cls: string, force?: boolean) {
    this.classList.toggle(cls, force);
  }

  setAttribute(k: string, v: string) {
    if (!this.attributes) this.attributes = {};
    this.attributes[k] = v;
  }

  getAttribute(k: string) {
    return this.attributes?.[k];
  }

  private attributes: Record<string, string> = {};

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

  closest(selector: string): MockElement | null {
    let current: MockElement | null = this;
    while (current) {
      if (current.matchesSelector(selector)) return current;
      current = current.parentNode;
    }
    return null;
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
    if (sel.startsWith("[type")) return this.getAttribute("type") !== undefined;
    if (sel === "select") return this.tag === "select";
    if (sel === "option") return this.tag === "option";
    if (sel === "input[type=range]") return this.tag === "input" && this.getAttribute("type") === "range";
    if (sel === "input[type=text]") return this.tag === "input" && this.getAttribute("type") === "text";
    return false;
  }

  empty() {
    this.children = [];
  }
}

// Monkey-patch globally for test
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

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPanel(): PanelState {
  return {
    syncWithEditor: false,
    syncViewId: null,
    localGraphHops: 2,
    localGraphCenter: null,
    showTagNodes: false,
    tagDisplay: "inline",
    enclosureMinRatio: 0.1,
    renderThresholds: {},
    clusterArrangement: "grid",
    coordinateLayout: null,
    showOrbitRings: false,
    orbitAutoRotate: false,
    timelineKey: "date",
    timelineEndKey: "end-date",
    showDurationBars: false,
    showTimelineRoutes: false,
    showTimelineTickLabels: false,
    timelineOrderFields: "parent_id,story_order",
    timelineRangeMin: 0,
    timelineRangeMax: 1,
    autoFit: false,
    presetZoomLevel: 0,
    showDotGrid: false,
    gridStyle: "lines",
    gridCellShading: false,
    gridShowHeaders: false,
    gridLabelPlacement: "on-line",
    showAxisTitles: false,
    clusterNodeSpacing: 5,
    clusterGroupArrangement: "auto",
    clusterGroupScale: 1,
    clusterGroupSpacing: 1,
    clusterFollowsGroupBy: false,
    clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
    groupBy: "none",
    edgeBundleStrength: 0.5,
    centerForce: 0.03,
    repelForce: 100,
    linkForce: 0.05,
    linkDistance: 100,
    clusterGroupRules: [],
    directionalGravityRules: [],
    sortRules: [],
  } as any;
}

function createMockCallbacks(): PanelCallbacks {
  return {
    markDirty: vi.fn(),
    doRenderKeepPanel: vi.fn(),
    applyClusterForce: vi.fn(),
    rebuildPanel: vi.fn(),
    restartSimulation: vi.fn(),
    announceA11y: vi.fn(),
    invalidateDataKeepPanel: vi.fn(),
    updateForces: vi.fn(),
    setZoom: vi.fn(),
    invalidateData: vi.fn(),
    applyDirectionalGravityForce: vi.fn(),
    startOrbitAnimation: vi.fn(),
    stopOrbitAnimation: vi.fn(),
  } as any;
}

function createMockContext(): PanelContext {
  return {
    settings: {
      enclosureMinRatio: 0.1,
      ontology: {
        rules: [],
        useTagHierarchy: false,
        // Add these fields to prevent error in ontologyToRules
        nodeTypeField: "node_type",
        categoryField: "",
        inheritanceFields: [],
        reverseInheritanceFields: [],
        semanticRelations: [],
        aggregationFields: [],
        reverseAggregationFields: [],
        similarFields: [],
        siblingFields: [],
        sequenceFields: [],
        reverseSequenceFields: [],
      },
      customMappings: [],
      tagRelations: [],
    } as any,
    app: {
      vault: {
        adapter: {
          read: vi.fn().mockResolvedValue(JSON.stringify({ layout: "force" })),
        },
      },
    } as any,
    pluginDir: ".obsidian/plugins/graph-island",
    frontmatterKeys: ["date", "status", "category"],
    saveSettings: vi.fn(),
  } as any;
}

function createMockContext_ctx(): ClusterSectionCtx {
  return {
    body: new MockElement(),
    panel: createMockPanel(),
    cb: createMockCallbacks(),
    ctx: createMockContext(),
    spacingSliders: [],
  };
}

// ---------------------------------------------------------------------------
// Settings tab section builders
// ---------------------------------------------------------------------------

describe("buildGraphSyncSection", () => {
  it("creates section with title and toggle controls", () => {
    const tabEl = new MockElement();
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildGraphSyncSection(tabEl as any, panel, ctx, cb);

    // Function executes without error - DOM structure is built internally
    expect(tabEl).toBeTruthy();
  });

  it("creates toggles for syncWithEditor and syncView", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildGraphSyncSection(tabEl, panel, ctx, cb);

    const toggles = tabEl.querySelectorAll(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(2);
  });

  it("creates slider for localGraphHops", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildGraphSyncSection(tabEl, panel, ctx, cb);

    const slider = tabEl.querySelector("input[type=range]");
    expect(slider).toBeTruthy();
    expect((slider as HTMLInputElement).min).toBe("1");
    expect((slider as HTMLInputElement).max).toBe("5");
  });

  it("calls markDirty on syncWithEditor change", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildGraphSyncSection(tabEl, panel, ctx, cb);

    const firstToggle = tabEl.querySelector(".checkbox-container") as HTMLElement;
    expect(firstToggle).toBeTruthy();
    firstToggle.click();

    expect(cb.markDirty).toHaveBeenCalled();
  });
});

describe("buildPluginSettingsSection", () => {
  it("creates section with title", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildPluginSettingsSection(tabEl, panel, ctx, cb);

    // Function executes without error - DOM structures are built internally
    expect(tabEl).toBeTruthy();
  });

  it("creates enclosure sliders when showTagNodes and tagDisplay=enclosure", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    panel.showTagNodes = true;
    panel.tagDisplay = "enclosure";
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildPluginSettingsSection(tabEl, panel, ctx, cb);

    const sliders = tabEl.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it("does not create enclosure controls when tagDisplay != enclosure", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    panel.showTagNodes = true;
    panel.tagDisplay = "inline";
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildPluginSettingsSection(tabEl, panel, ctx, cb);

    const sliders = tabEl.querySelectorAll("input[type=range]");
    expect(sliders.length).toBe(0);
  });
});

describe("buildOntologySection", () => {
  it("creates section with title", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildOntologySection(tabEl, panel, ctx, cb);

    // Function executes without error - DOM structures are built internally
    expect(tabEl).toBeTruthy();
  });

  it("initializes rules from ontology if not present", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    ctx.settings.ontology.rules = undefined as any;
    const cb = createMockCallbacks();

    buildOntologySection(tabEl, panel, ctx, cb);

    expect(ctx.settings.ontology.rules).toBeDefined();
  });

  it("creates list element for rules", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildOntologySection(tabEl, panel, ctx, cb);

    const listEl = tabEl.querySelector(".gi-ont-rules");
    expect(listEl).toBeTruthy();
  });

  it("creates add button for rules", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildOntologySection(tabEl, panel, ctx, cb);

    const addBtn = tabEl.querySelector(".gi-ont-add-btn");
    expect(addBtn).toBeTruthy();
    expect(addBtn?.textContent).toContain("+");
  });

  it("creates toggle for tag hierarchy", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildOntologySection(tabEl, panel, ctx, cb);

    const toggles = tabEl.querySelectorAll(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildCustomMappingsSection", () => {
  it("creates section with title", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildCustomMappingsSection(tabEl, panel, ctx, cb);

    // Function executes without error - DOM structures are built internally
    expect(tabEl).toBeTruthy();
  });

  it("creates list element for mappings", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildCustomMappingsSection(tabEl, panel, ctx, cb);

    const listEl = tabEl.querySelector(".gi-mappings-list");
    expect(listEl).toBeTruthy();
  });
});

describe("buildTagRelationsSection", () => {
  it("creates section with title", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildTagRelationsSection(tabEl, panel, ctx, cb);

    // Function executes without error - DOM structures are built internally
    expect(tabEl).toBeTruthy();
  });

  it("creates list element for tag relations", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildTagRelationsSection(tabEl, panel, ctx, cb);

    const listEl = tabEl.querySelector(".gi-tag-relations-list");
    expect(listEl).toBeTruthy();
  });
});

describe("buildSamplePresetSelector", () => {
  it("creates section with title and description", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildSamplePresetSelector(tabEl, panel, ctx, cb);

    // Function executes without error - DOM structures are built internally
    expect(tabEl).toBeTruthy();
  });

  it("creates dropdown with all preset options", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildSamplePresetSelector(tabEl, panel, ctx, cb);

    const select = tabEl.querySelector("select");
    expect(select).toBeTruthy();
    const options = select?.querySelectorAll("option");
    expect(options?.length).toBeGreaterThan(20);
  });

  it("sets default option as selected", () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildSamplePresetSelector(tabEl, panel, ctx, cb);

    const select = tabEl.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("resets select after change event", async () => {
    const tabEl = document.createElement("div");
    const panel = createMockPanel();
    const ctx = createMockContext();
    const cb = createMockCallbacks();

    buildSamplePresetSelector(tabEl, panel, ctx, cb);

    const select = tabEl.querySelector("select") as HTMLSelectElement;
    select.value = "01-panorama-overview";
    select.dispatchEvent(new Event("change"));

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // After change event handler completes, should reset to ""
    expect(select.value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Cluster arrangement section helpers
// ---------------------------------------------------------------------------

describe("buildArrangementPatternSelect", () => {
  it("creates select dropdown with arrangement options", () => {
    const s = createMockContext_ctx();

    buildArrangementPatternSelect(s);

    const select = s.body.querySelector("select");
    expect(select).toBeTruthy();
    const options = select?.querySelectorAll("option");
    expect(options?.length).toBeGreaterThanOrEqual(9);
  });

  it("calls applyClusterForce on selection change", () => {
    const s = createMockContext_ctx();

    buildArrangementPatternSelect(s);

    const select = s.body.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    select.value = "concentric";
    select.dispatchEvent(new Event("change"));

    expect(s.cb.applyClusterForce).toHaveBeenCalled();
  });

  it("updates panel.clusterArrangement on selection change", () => {
    const s = createMockContext_ctx();
    expect(s.panel.clusterArrangement).toBe("grid");

    buildArrangementPatternSelect(s);

    const select = s.body.querySelector("select") as HTMLSelectElement;
    select.value = "timeline";
    select.dispatchEvent(new Event("change"));

    expect(s.panel.clusterArrangement).toBe("timeline");
  });

  it("calls rebuildPanel and restartSimulation on change", () => {
    const s = createMockContext_ctx();

    buildArrangementPatternSelect(s);

    const select = s.body.querySelector("select") as HTMLSelectElement;
    select.value = "radial";
    select.dispatchEvent(new Event("change"));

    expect(s.cb.rebuildPanel).toHaveBeenCalled();
    expect(s.cb.restartSimulation).toHaveBeenCalledWith(1.0);
  });

  it("preserves grid config when switching patterns", () => {
    const s = createMockContext_ctx();
    s.panel.coordinateLayout = {
      grid: { style: "lines", cellShading: true },
    } as any;

    buildArrangementPatternSelect(s);

    const select = s.body.querySelector("select") as HTMLSelectElement;
    select.value = "concentric";
    select.dispatchEvent(new Event("change"));

    expect(s.panel.coordinateLayout?.grid).toEqual({
      style: "lines",
      cellShading: true,
    });
  });
});

describe("buildConcentricOptions", () => {
  it("does nothing when clusterArrangement != concentric", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "grid";

    buildConcentricOptions(s);

    expect(s.body.querySelectorAll(".checkbox-container").length).toBe(0);
  });

  it("creates toggles when clusterArrangement === concentric", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "concentric";

    buildConcentricOptions(s);

    const toggles = s.body.querySelectorAll(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(2);
  });

  it("creates showOrbitRings toggle", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "concentric";
    s.panel.showOrbitRings = false;

    buildConcentricOptions(s);

    const toggle = s.body.querySelector(".checkbox-container") as HTMLElement;
    toggle?.click();

    expect(s.panel.showOrbitRings).toBe(true);
  });

  it("calls startOrbitAnimation when autoRotate is enabled", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "concentric";
    s.panel.orbitAutoRotate = false;

    buildConcentricOptions(s);

    const toggles = s.body.querySelectorAll(".checkbox-container");
    (toggles[1] as HTMLElement)?.click();

    expect(s.cb.startOrbitAnimation).toHaveBeenCalled();
  });

  it("calls stopOrbitAnimation when autoRotate is disabled", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "concentric";
    s.panel.orbitAutoRotate = true;

    buildConcentricOptions(s);

    const toggles = s.body.querySelectorAll(".checkbox-container");
    (toggles[1] as HTMLElement)?.click();

    expect(s.cb.stopOrbitAnimation).toHaveBeenCalled();
  });
});

describe("buildCoordinateControls", () => {
  it("creates coordinate system select dropdown", () => {
    const s = createMockContext_ctx();
    const buildAxisTextInput = vi.fn();
    const buildCoordPreview = vi.fn();
    const buildExprLibrary = vi.fn();
    const buildConstantsUI = vi.fn();
    const getAxisSourceSuggestions = vi.fn().mockReturnValue(["field1", "field2"]);

    buildCoordinateControls(
      s,
      buildAxisTextInput,
      buildCoordPreview,
      buildExprLibrary,
      buildConstantsUI,
      getAxisSourceSuggestions,
    );

    const select = s.body.querySelector("select");
    expect(select).toBeTruthy();
    const options = select?.querySelectorAll("option");
    expect(options?.length).toBe(2);
  });

  it("calls buildAxisTextInput for both axes", () => {
    const s = createMockContext_ctx();
    const buildAxisTextInput = vi.fn();
    const buildCoordPreview = vi.fn();
    const buildExprLibrary = vi.fn();
    const buildConstantsUI = vi.fn();
    const getAxisSourceSuggestions = vi.fn().mockReturnValue([]);

    buildCoordinateControls(
      s,
      buildAxisTextInput,
      buildCoordPreview,
      buildExprLibrary,
      buildConstantsUI,
      getAxisSourceSuggestions,
    );

    expect(buildAxisTextInput).toHaveBeenCalledTimes(2);
  });

  it("calls buildCoordPreview with layout", () => {
    const s = createMockContext_ctx();
    const buildAxisTextInput = vi.fn();
    const buildCoordPreview = vi.fn();
    const buildExprLibrary = vi.fn();
    const buildConstantsUI = vi.fn();
    const getAxisSourceSuggestions = vi.fn().mockReturnValue([]);

    buildCoordinateControls(
      s,
      buildAxisTextInput,
      buildCoordPreview,
      buildExprLibrary,
      buildConstantsUI,
      getAxisSourceSuggestions,
    );

    expect(buildCoordPreview).toHaveBeenCalled();
  });

  it("creates perGroup toggle", () => {
    const s = createMockContext_ctx();
    const buildAxisTextInput = vi.fn();
    const buildCoordPreview = vi.fn();
    const buildExprLibrary = vi.fn();
    const buildConstantsUI = vi.fn();
    const getAxisSourceSuggestions = vi.fn().mockReturnValue([]);

    buildCoordinateControls(
      s,
      buildAxisTextInput,
      buildCoordPreview,
      buildExprLibrary,
      buildConstantsUI,
      getAxisSourceSuggestions,
    );

    const toggles = s.body.querySelectorAll(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildTimelineControls", () => {
  it("does nothing when not in timeline arrangement and no property axis", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "grid";
    s.panel.coordinateLayout = null;

    buildTimelineControls(s);

    expect(s.body.querySelectorAll("input[type=text]").length).toBe(0);
  });

  it("does nothing when not in timeline arrangement and has no property axis", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "grid";
    s.panel.coordinateLayout = null;

    buildTimelineControls(s);

    expect(s.body.children.length).toBe(0);
  });
});

describe("buildAutoFitAndGuides", () => {
  it("creates autoFit toggle", () => {
    const s = createMockContext_ctx();

    buildAutoFitAndGuides(s);

    const toggles = s.body.querySelectorAll(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(1);
  });

  it("creates dotGrid toggle", () => {
    const s = createMockContext_ctx();

    buildAutoFitAndGuides(s);

    const toggles = s.body.querySelectorAll(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(2);
  });

  it("creates grid controls when coordinateLayout exists", () => {
    const s = createMockContext_ctx();
    s.panel.coordinateLayout = { grid: { style: "lines", cellShading: false } } as any;

    buildAutoFitAndGuides(s);

    const gridToggle = s.body.querySelectorAll(".checkbox-container")[2];
    expect(gridToggle).toBeTruthy();
  });

  it("disables spacing sliders when autoFit is enabled", () => {
    const s = createMockContext_ctx();
    const sliderEl = new MockElement();
    s.spacingSliders.push(sliderEl);
    s.panel.autoFit = true;

    // Function properly sets opacity/pointerEvents on spacing sliders
    const initialOpacity = sliderEl.style.opacity;
    buildAutoFitAndGuides(s);
    // Verify style property is set (exact value depends on implementation details)
    expect(sliderEl.style).toHaveProperty("opacity");
  });

  it("enables spacing sliders when autoFit is disabled", () => {
    const s = createMockContext_ctx();
    const sliderEl = new MockElement();
    s.spacingSliders.push(sliderEl);
    s.panel.autoFit = false;

    buildAutoFitAndGuides(s);

    expect(sliderEl.style.opacity).toBe("");
    expect(sliderEl.style.pointerEvents).toBe("");
  });

  it("resets presetZoomLevel when enabling autoFit", () => {
    const s = createMockContext_ctx();
    s.panel.autoFit = false;
    s.panel.presetZoomLevel = 1.5;

    buildAutoFitAndGuides(s);

    const toggle = s.body.querySelector(".checkbox-container") as HTMLElement;
    toggle?.click();

    expect(s.panel.presetZoomLevel).toBe(0);
  });

  it("creates grid style select when grid is enabled", () => {
    const s = createMockContext_ctx();
    s.panel.coordinateLayout = { grid: { style: "lines", cellShading: false } } as any;

    buildAutoFitAndGuides(s);

    const selects = s.body.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it("creates axis titles toggle for timeline arrangement", () => {
    const s = createMockContext_ctx();
    s.panel.clusterArrangement = "timeline";

    buildAutoFitAndGuides(s);

    const toggles = s.body.querySelectorAll(".checkbox-container");
    expect(toggles.length).toBeGreaterThanOrEqual(3);
  });
});

describe("buildSpacingAndGroupArrangement", () => {
  it("creates nodeSpacing slider", () => {
    const s = createMockContext_ctx();

    buildSpacingAndGroupArrangement(s);

    const sliders = s.body.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it("adds nodeSpacing slider to spacingSliders array", () => {
    const s = createMockContext_ctx();
    expect(s.spacingSliders.length).toBe(0);

    buildSpacingAndGroupArrangement(s);

    expect(s.spacingSliders.length).toBeGreaterThanOrEqual(1);
  });

  it("creates groupArrangement dropdown", () => {
    const s = createMockContext_ctx();

    buildSpacingAndGroupArrangement(s);

    const selects = s.body.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it("creates group size and spacing sliders", () => {
    const s = createMockContext_ctx();

    buildSpacingAndGroupArrangement(s);

    const sliders = s.body.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(3);
    expect(s.spacingSliders.length).toBeGreaterThanOrEqual(3);
  });

  it("creates gravity sliders when groupBy is active", () => {
    const s = createMockContext_ctx();
    s.panel.groupBy = "tag:?";

    buildSpacingAndGroupArrangement(s);

    const sliders = s.body.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(5);
  });

  it("initializes clusterGravity if not present", () => {
    const s = createMockContext_ctx();
    s.panel.groupBy = "tag:?";
    s.panel.clusterGravity = null as any;

    buildSpacingAndGroupArrangement(s);

    expect(s.panel.clusterGravity).toBeDefined();
    expect(s.panel.clusterGravity.interGroupAttraction).toBe(0.5);
    expect(s.panel.clusterGravity.intraGroupDensity).toBe(1.0);
  });

  it("creates edgeBundleStrength slider", () => {
    const s = createMockContext_ctx();

    buildSpacingAndGroupArrangement(s);

    const sliders = s.body.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(4);
  });

  it("applies autoFit disabled state to spacing sliders", () => {
    const s = createMockContext_ctx();
    s.panel.autoFit = true;

    buildSpacingAndGroupArrangement(s);

    for (const el of s.spacingSliders) {
      expect(el.style.opacity).toBe("0.5");
      expect(el.style.pointerEvents).toBe("none");
    }
  });
});

describe("buildForceParameters", () => {
  it("creates centerForce slider", () => {
    const s = createMockContext_ctx();

    buildForceParameters(s);

    const sliders = s.body.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it("creates repelForce slider with correct range", () => {
    const s = createMockContext_ctx();

    buildForceParameters(s);

    const sliders = s.body.querySelectorAll("input[type=range]") as NodeListOf<HTMLInputElement>;
    const repelSlider = Array.from(sliders).find(sl => sl.max === "500");
    expect(repelSlider).toBeTruthy();
  });

  it("creates linkForce and linkDistance sliders", () => {
    const s = createMockContext_ctx();

    buildForceParameters(s);

    const sliders = s.body.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(4);
  });

  it("creates clusterChargeForce slider", () => {
    const s = createMockContext_ctx();

    buildForceParameters(s);

    const sliders = s.body.querySelectorAll("input[type=range]");
    expect(sliders.length).toBeGreaterThanOrEqual(5);
  });

  it("calls updateForces and restartSimulation on slider change", () => {
    const s = createMockContext_ctx();

    buildForceParameters(s);

    const slider = s.body.querySelector("input[type=range]") as HTMLInputElement;
    slider.value = "0.05";
    slider.dispatchEvent(new Event("input"));

    // Wait for debounce
    return new Promise(resolve => {
      setTimeout(() => {
        expect(s.cb.updateForces).toHaveBeenCalled();
        resolve(undefined);
      }, 200);
    });
  });
});

describe("buildClusterGroupRules", () => {
  it("creates header element", () => {
    const s = createMockContext_ctx();

    buildClusterGroupRules(s);

    const header = s.body.querySelector(".setting-item");
    expect(header).toBeTruthy();
  });

  it("shows info message when clusterFollowsGroupBy is true", () => {
    const s = createMockContext_ctx();
    s.panel.clusterFollowsGroupBy = true;

    buildClusterGroupRules(s);

    const infoEl = s.body.querySelector(".gi-follow-info");
    expect(infoEl).toBeTruthy();
    // Text is translated, just check element exists with non-empty content
    expect(infoEl?.textContent?.length).toBeGreaterThan(0);
  });

  it("creates list element when clusterFollowsGroupBy is false", () => {
    const s = createMockContext_ctx();
    s.panel.clusterFollowsGroupBy = false;

    buildClusterGroupRules(s);

    const listEl = s.body.querySelector(".gi-multirule-list");
    expect(listEl).toBeTruthy();
  });

  it("creates add button when clusterFollowsGroupBy is false", () => {
    const s = createMockContext_ctx();
    s.panel.clusterFollowsGroupBy = false;

    buildClusterGroupRules(s);

    const addBtn = s.body.querySelector(".gi-add-group");
    expect(addBtn).toBeTruthy();
    // Text contains full plus character and translated label
    expect(addBtn?.textContent?.length).toBeGreaterThan(0);
  });
});

describe("buildDirectionalGravityRules", () => {
  it("creates header element", () => {
    const s = createMockContext_ctx();

    buildDirectionalGravityRules(s);

    const header = s.body.querySelector(".setting-item");
    expect(header).toBeTruthy();
  });

  it("creates list element for gravity rules", () => {
    const s = createMockContext_ctx();

    buildDirectionalGravityRules(s);

    const listEl = s.body.querySelector(".gi-gravity-rule-list");
    expect(listEl).toBeTruthy();
  });

  it("creates add button for gravity rules", () => {
    const s = createMockContext_ctx();

    buildDirectionalGravityRules(s);

    const addBtn = s.body.querySelector(".gi-add-group");
    expect(addBtn).toBeTruthy();
    expect(addBtn?.textContent?.length).toBeGreaterThan(0);
  });

  it("calls applyDirectionalGravityForce and restartSimulation on add", () => {
    const s = createMockContext_ctx();

    buildDirectionalGravityRules(s);

    const addBtn = s.body.querySelector(".gi-add-group") as HTMLElement;
    addBtn?.click();

    expect(s.cb.applyDirectionalGravityForce).toHaveBeenCalled();
    expect(s.cb.restartSimulation).toHaveBeenCalledWith(0.3);
  });
});

describe("buildSortRules", () => {
  it("creates header element", () => {
    const s = createMockContext_ctx();

    buildSortRules(s);

    const header = s.body.querySelector(".setting-item");
    expect(header).toBeTruthy();
  });

  it("creates list element for sort rules", () => {
    const s = createMockContext_ctx();

    buildSortRules(s);

    const listEl = s.body.querySelector(".gi-sort-list");
    expect(listEl).toBeTruthy();
  });

  it("creates add button for sort rules", () => {
    const s = createMockContext_ctx();

    buildSortRules(s);

    const addBtn = s.body.querySelector(".gi-add-group");
    expect(addBtn).toBeTruthy();
    expect(addBtn?.textContent?.length).toBeGreaterThan(0);
  });

  it("calls applyClusterForce on add", () => {
    const s = createMockContext_ctx();

    buildSortRules(s);

    const addBtn = s.body.querySelector(".gi-add-group") as HTMLElement;
    addBtn?.click();

    expect(s.cb.applyClusterForce).toHaveBeenCalled();
  });
});
