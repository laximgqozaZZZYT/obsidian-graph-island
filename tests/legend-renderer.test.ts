import { describe, it, expect, vi } from "vitest";
import { renderLegend, type LegendHost, type LegendPanel } from "../src/views/LegendRenderer";

// ---------------------------------------------------------------------------
// Minimal DOM mock — simulates Obsidian's HTMLElement extensions
// ---------------------------------------------------------------------------
interface MockEl {
  tag: string;
  cls?: string;
  text?: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  children: MockEl[];
  listeners: Record<string, Function[]>;
  classList: { add: (cls: string) => void; items: string[] };
  // Obsidian-style helpers
  createDiv: (opts?: { cls?: string; text?: string; attr?: Record<string, string> }) => MockEl;
  createEl: (tag: string, opts?: { cls?: string; text?: string; attr?: Record<string, string> }) => MockEl;
  empty: () => void;
  addEventListener: (ev: string, fn: Function) => void;
  addClass: (cls: string) => void;
  querySelector: (sel: string) => MockEl | null;
  querySelectorAll: (sel: string) => MockEl[];
  textContent?: string;
  dataset: Record<string, string>;
}

function createMockEl(tag = "div"): MockEl {
  const el: MockEl = {
    tag,
    attrs: {},
    style: {} as Record<string, string>,
    children: [],
    listeners: {},
    classList: { add: (c: string) => { el.classList.items.push(c); }, items: [] },
    dataset: {},
    createDiv(opts) {
      const child = createMockEl("div");
      if (opts?.cls) { child.cls = opts.cls; child.classList.items.push(...opts.cls.split(" ")); }
      if (opts?.text) child.text = opts.text;
      if (opts?.attr) Object.assign(child.attrs, opts.attr);
      el.children.push(child);
      return child;
    },
    createEl(etag, opts) {
      const child = createMockEl(etag);
      if (opts?.cls) { child.cls = opts.cls; child.classList.items.push(...opts.cls.split(" ")); }
      if (opts?.text) { child.text = opts.text; child.textContent = opts.text; }
      if (opts?.attr) {
        Object.assign(child.attrs, opts.attr);
        if (opts.attr.style) {
          for (const pair of opts.attr.style.split(";").filter(Boolean)) {
            const [k, v] = pair.split(":").map(s => s.trim());
            if (k && v) child.style[k] = v;
          }
        }
      }
      el.children.push(child);
      return child;
    },
    empty() { el.children = []; },
    addEventListener(ev, fn) {
      (el.listeners[ev] ??= []).push(fn);
    },
    addClass(c) { el.classList.items.push(c); },
    querySelector(sel) {
      return findEl(el, sel);
    },
    querySelectorAll(sel) {
      return findAllEl(el, sel);
    },
  };
  return el;
}

function findEl(el: MockEl, sel: string): MockEl | null {
  if (matchesSel(el, sel)) return el;
  for (const c of el.children) {
    const found = findEl(c, sel);
    if (found) return found;
  }
  return null;
}

function findAllEl(el: MockEl, sel: string): MockEl[] {
  const results: MockEl[] = [];
  if (matchesSel(el, sel)) results.push(el);
  for (const c of el.children) results.push(...findAllEl(c, sel));
  return results;
}

function matchesSel(el: MockEl, sel: string): boolean {
  if (sel.startsWith(".")) return el.classList.items.includes(sel.slice(1)) || el.cls === sel.slice(1);
  return el.tag === sel;
}

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------
function makeHost(overrides: Partial<LegendHost> = {}): LegendHost {
  return {
    getNodeColorMap: () => new Map(),
    getRelationColors: () => new Map(),
    getCategoryCounts: () => new Map(),
    getMaxDegree: () => 10,
    getCommunityMap: () => new Map(),
    invalidateAndRebuild: vi.fn(),
    markDirtyAndRebuildLegend: vi.fn(),
    requestSave: vi.fn(),
    ...overrides,
  };
}

function makePanel(overrides: Partial<LegendPanel> = {}): LegendPanel {
  return {
    showLegend: true,
    nodeColorMode: "category",
    nodeColorField: "",
    colorEdgesByRelation: false,
    searchQuery: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("renderLegend", () => {
  it("hides when showLegend is false", () => {
    const el = createMockEl();
    renderLegend(el as any, makePanel({ showLegend: false }), makeHost());
    expect(el.style.display).toBe("none");
  });

  it("hides when both color maps are empty", () => {
    const el = createMockEl();
    renderLegend(el as any, makePanel(), makeHost());
    expect(el.style.display).toBe("none");
  });

  it("renders category legend items with counts", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["fiction", "#ff0000"], ["non-fiction", "#00ff00"]]),
      getCategoryCounts: () => new Map([["fiction", 42], ["non-fiction", 8]]),
    });
    renderLegend(el as any, makePanel(), host);

    expect(el.style.display).toBe("");
    const items = findAllEl(el, ".gi-legend-item");
    expect(items.length).toBe(2);
    // First item should contain "fiction (42)"
    const labels = findAllEl(el, ".gi-legend-label");
    expect(labels.some(l => l.text?.includes("fiction") && l.text?.includes("42"))).toBe(true);
  });

  it("renders tag entries with # prefix", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["tag:important", "#f00"]]),
      getCategoryCounts: () => new Map([["tag:important", 5]]),
    });
    renderLegend(el as any, makePanel(), host);

    const labels = findAllEl(el, ".gi-legend-label");
    expect(labels.some(l => l.text?.includes("#important"))).toBe(true);
  });

  it("category click toggles search query", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["drama", "#f00"]]),
    });
    const panel = makePanel();
    renderLegend(el as any, panel, host);

    const clickable = findAllEl(el, ".gi-legend-item-clickable");
    expect(clickable.length).toBeGreaterThan(0);
    // Simulate click
    clickable[0].listeners["click"]?.[0]?.();
    expect(panel.searchQuery).toBe("category:drama");
    expect(host.invalidateAndRebuild).toHaveBeenCalled();

    // Click again to deselect
    renderLegend(el as any, panel, host);
    const clickable2 = findAllEl(el, ".gi-legend-item-clickable");
    clickable2[0].listeners["click"]?.[0]?.();
    expect(panel.searchQuery).toBe("");
  });

  it("renders heatmap gradient bar", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["x", "#fff"]]), // need at least one to not hide
      getMaxDegree: () => 25,
    });
    renderLegend(el as any, makePanel({ nodeColorMode: "heatmap" }), host);

    const labels = findAllEl(el, ".gi-legend-label");
    expect(labels.some(l => l.text === "0")).toBe(true);
    expect(labels.some(l => l.text === "25")).toBe(true);
  });

  it("renders community legend sorted by count", () => {
    const el = createMockEl();
    const communityMap = new Map([["a", 0], ["b", 0], ["c", 1], ["d", 1], ["e", 1]]);
    const host = makeHost({
      getNodeColorMap: () => new Map([["x", "#fff"]]),
      getCommunityMap: () => communityMap,
    });
    renderLegend(el as any, makePanel({ nodeColorMode: "community" }), host);

    const labels = findAllEl(el, ".gi-legend-label");
    // Community 1 (3 members) should come before Community 0 (2 members)
    const commLabels = labels.filter(l => l.text?.startsWith("Community"));
    expect(commLabels.length).toBe(2);
    expect(commLabels[0].text).toContain("(3)");
    expect(commLabels[1].text).toContain("(2)");
  });

  it("renders field color legend", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["value-A", "#aaa"], ["value-B", "#bbb"]]),
    });
    renderLegend(el as any, makePanel({ nodeColorMode: "field", nodeColorField: "status" }), host);

    const titles = findAllEl(el, ".gi-legend-section-title");
    expect(titles.some(t => t.text?.includes("status"))).toBe(true);
    const labels = findAllEl(el, ".gi-legend-label");
    expect(labels.some(l => l.text === "value-A")).toBe(true);
  });

  it("renders edge relation section with dash styles", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["x", "#fff"]]),
      getRelationColors: () => new Map([["Link", "#4af"], ["Semantic", "#f4a"]]),
    });
    renderLegend(el as any, makePanel({ colorEdgesByRelation: true }), host);

    const edgeLines = findAllEl(el, ".gi-legend-edge-line");
    expect(edgeLines.length).toBe(2);
    // Semantic should have dotted dash
    const semanticLine = edgeLines.find(l => l.style.borderTopColor === "#f4a");
    expect(semanticLine?.dataset.dash).toBe("dotted");
  });

  it("shows disabled state for hidden edge types", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["x", "#fff"]]),
      getRelationColors: () => new Map([["Link", "#4af"]]),
    });
    const panel = makePanel({ colorEdgesByRelation: true, showLinks: false });
    renderLegend(el as any, panel, host);

    const disabled = findAllEl(el, ".gi-legend-item-disabled");
    expect(disabled.length).toBe(1);
  });

  it("renders node shape rules", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["x", "#fff"]]),
    });
    const panel = makePanel({
      nodeShapeRules: [
        { shape: "triangle", match: "isTag" },
        { shape: "square", match: "default" },
      ],
    });
    renderLegend(el as any, panel, host);

    const shapeIcons = findAllEl(el, ".gi-legend-shape-icon");
    expect(shapeIcons.length).toBe(2);
    expect(shapeIcons[0].text).toBe("▲");
    expect(shapeIcons[1].text).toBe("■");
  });

  it("close button hides legend and saves", () => {
    const el = createMockEl();
    const host = makeHost({
      getNodeColorMap: () => new Map([["x", "#fff"]]),
    });
    const panel = makePanel();
    renderLegend(el as any, panel, host);

    const closeBtn = findEl(el, ".gi-legend-close");
    expect(closeBtn).not.toBeNull();
    closeBtn!.listeners["click"]?.[0]?.({ stopPropagation: vi.fn() });
    expect(panel.showLegend).toBe(false);
    expect(host.requestSave).toHaveBeenCalled();
  });

  it("header click collapses body for large legends (>10 items)", () => {
    const el = createMockEl();
    const colorMap = new Map<string, string>();
    for (let i = 0; i < 12; i++) colorMap.set(`cat-${i}`, `#${i.toString().padStart(6, "0")}`);
    const host = makeHost({ getNodeColorMap: () => colorMap });
    renderLegend(el as any, makePanel(), host);

    const body = findEl(el, ".gi-legend-body");
    // Body should start collapsed for >10 items
    expect(body?.style.display).toBe("none");

    // Click header to expand
    const header = findEl(el, ".gi-legend-header");
    header?.listeners["click"]?.[0]?.();
    expect(body?.style.display).toBe("");
  });
});
