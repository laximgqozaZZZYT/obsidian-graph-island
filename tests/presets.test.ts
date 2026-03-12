import { describe, it, expect } from "vitest";
import { exportPreset, importPreset, applyPreset } from "../src/utils/presets";

// We define a local DEFAULT_PANEL to avoid importing from PanelBuilder
// which pulls in the "obsidian" module (not available in test env).
// This matches the shape in src/views/PanelBuilder.ts.
const DEFAULT_PANEL = {
  showTags: true,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  showArrows: false,
  textFadeThreshold: 0.5,
  nodeSize: 8,
  scaleByDegree: true,
  centerForce: 0.03,
  repelForce: 200,
  linkForce: 0.01,
  linkDistance: 100,
  concentricMinRadius: 50,
  concentricRadiusStep: 60,
  showOrbitRings: true,
  orbitAutoRotate: true,
  groups: [],
  searchQuery: "",
  colorEdgesByRelation: true,
  colorNodesByCategory: true,
  showInheritance: true,
  showAggregation: true,
  showTagNodes: true,
  tagDisplay: "enclosure" as const,
  showSimilar: false,
  showLinks: true,
  showTagEdges: true,
  showCategoryEdges: true,
  showSemanticEdges: true,
  enclosureSpacing: 1.5,
  directionalGravityRules: [],
  hoverHops: 1,
  commonQueries: [],
  clusterGroupRules: [],
  clusterArrangement: "spiral" as const,
  clusterNodeSpacing: 3.0,
  clusterGroupScale: 3.0,
  clusterGroupSpacing: 2.0,
  fadeEdgesByDegree: false,
  edgeBundleStrength: 0.65,
  sortRules: [{ key: "degree" as const, order: "desc" as const }],
  nodeRules: [],
};

type PanelState = typeof DEFAULT_PANEL;

function makePanel(overrides: Partial<PanelState> = {}): PanelState {
  return { ...DEFAULT_PANEL, ...overrides };
}

describe("exportPreset", () => {
  it("produces valid JSON", () => {
    const json = exportPreset(makePanel() as any);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("includes all PanelState keys", () => {
    const panel = makePanel();
    const json = exportPreset(panel as any);
    const parsed = JSON.parse(json);
    for (const key of Object.keys(DEFAULT_PANEL)) {
      expect(parsed).toHaveProperty(key);
    }
  });

  it("converts Set values to arrays", () => {
    const panel = makePanel() as any;
    panel.collapsedGroups = new Set(["a", "b", "c"]);
    const json = exportPreset(panel);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.collapsedGroups)).toBe(true);
    expect(parsed.collapsedGroups).toEqual(["a", "b", "c"]);
  });

  it("preserves numeric values accurately", () => {
    const panel = makePanel({ centerForce: 0.03, repelForce: 200 });
    const json = exportPreset(panel as any);
    const parsed = JSON.parse(json);
    expect(parsed.centerForce).toBe(0.03);
    expect(parsed.repelForce).toBe(200);
  });
});

describe("importPreset", () => {
  it("rejects invalid JSON", () => {
    expect(() => importPreset("not json")).toThrow();
  });

  it("rejects non-object JSON (array)", () => {
    expect(() => importPreset("[1,2,3]")).toThrow("Preset must be a JSON object");
  });

  it("rejects null JSON", () => {
    expect(() => importPreset("null")).toThrow("Preset must be a JSON object");
  });

  it("drops unknown keys", () => {
    const preset = importPreset(JSON.stringify({ showTags: true, unknownField: 42 }));
    expect(preset).toHaveProperty("showTags", true);
    expect(preset).not.toHaveProperty("unknownField");
  });

  it("validates boolean fields — drops wrong type", () => {
    const preset = importPreset(JSON.stringify({
      showTags: true,
      showArrows: "yes",  // wrong type — should be dropped
    }));
    expect(preset.showTags).toBe(true);
    expect(preset).not.toHaveProperty("showArrows");
  });

  it("validates number fields — drops NaN and Infinity", () => {
    const preset = importPreset(JSON.stringify({
      nodeSize: 12,
      centerForce: "not a number",
      repelForce: null,
    }));
    expect(preset.nodeSize).toBe(12);
    expect(preset).not.toHaveProperty("centerForce");
    expect(preset).not.toHaveProperty("repelForce");
  });

  it("validates enum fields — drops invalid values", () => {
    const preset = importPreset(JSON.stringify({
      tagDisplay: "enclosure",
      clusterArrangement: "invalid_value",
    }));
    expect(preset.tagDisplay).toBe("enclosure");
    expect(preset).not.toHaveProperty("clusterArrangement");
  });

  it("validates array fields — drops non-arrays", () => {
    const preset = importPreset(JSON.stringify({
      groups: [{ expression: null, color: "#ff0000" }],
      sortRules: "not an array",
    }));
    expect(preset.groups).toEqual([{ expression: null, color: "#ff0000" }]);
    expect(preset).not.toHaveProperty("sortRules");
  });

  it("validates string fields", () => {
    const preset = importPreset(JSON.stringify({
      searchQuery: "tag:character",
    }));
    expect(preset.searchQuery).toBe("tag:character");
  });

  it("accepts all valid clusterArrangement values", () => {
    for (const v of ["spiral", "concentric", "tree", "grid", "triangle", "random", "mountain", "sunburst", "timeline"]) {
      const preset = importPreset(JSON.stringify({ clusterArrangement: v }));
      expect(preset.clusterArrangement).toBe(v);
    }
  });

  it("accepts coordinateLayout as object", () => {
    const layout = {
      system: "polar",
      axis1: { source: { kind: "index" }, transform: { kind: "golden-angle" } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    const preset = importPreset(JSON.stringify({ coordinateLayout: layout }));
    expect(preset).toHaveProperty("coordinateLayout");
    expect((preset as any).coordinateLayout).toEqual(layout);
  });

  it("accepts coordinateLayout as null", () => {
    const preset = importPreset(JSON.stringify({ coordinateLayout: null }));
    expect(preset).toHaveProperty("coordinateLayout");
    expect((preset as any).coordinateLayout).toBeNull();
  });

  it("drops coordinateLayout if it is an array", () => {
    const preset = importPreset(JSON.stringify({ coordinateLayout: [1, 2, 3] }));
    expect(preset).not.toHaveProperty("coordinateLayout");
  });

  it("drops coordinateLayout if it is a string", () => {
    const preset = importPreset(JSON.stringify({ coordinateLayout: "invalid" }));
    expect(preset).not.toHaveProperty("coordinateLayout");
  });
});

describe("applyPreset", () => {
  it("merges preset fields into current panel", () => {
    const current = makePanel({ showTags: true, nodeSize: 8 });
    const preset = { showTags: false, nodeSize: 16 } as any;
    const result = applyPreset(current as any, preset);
    expect(result.showTags).toBe(false);
    expect(result.nodeSize).toBe(16);
  });

  it("preserves fields not in the preset", () => {
    const current = makePanel({ showArrows: true, scaleByDegree: false });
    const preset = { showArrows: false } as any;
    const result = applyPreset(current as any, preset);
    expect(result.showArrows).toBe(false);
    expect(result.scaleByDegree).toBe(false);
  });

  it("does not mutate the original panel", () => {
    const current = makePanel({ nodeSize: 8 });
    const preset = { nodeSize: 20 } as any;
    const result = applyPreset(current as any, preset);
    expect(current.nodeSize).toBe(8);
    expect(result.nodeSize).toBe(20);
  });

  it("converts array back to Set when current field is a Set", () => {
    const current = makePanel() as any;
    current.collapsedGroups = new Set(["x"]);
    const preset = { collapsedGroups: ["a", "b"] } as any;
    const result = applyPreset(current, preset);
    expect((result as any).collapsedGroups).toBeInstanceOf(Set);
    expect(Array.from((result as any).collapsedGroups)).toEqual(["a", "b"]);
  });
});

describe("roundtrip: export -> import -> apply", () => {
  it("roundtrips a customized panel state", () => {
    const original = makePanel({
      showTags: false,
      nodeSize: 20,
      tagDisplay: "node",
      clusterArrangement: "grid",
      searchQuery: "hop:alice:3",
      groups: [{ expression: null, color: "#00ff00" }],
    });
    const json = exportPreset(original as any);
    const preset = importPreset(json);
    const result = applyPreset(makePanel() as any, preset);

    expect(result.showTags).toBe(false);
    expect(result.nodeSize).toBe(20);
    expect(result.tagDisplay).toBe("node");
    expect(result.clusterArrangement).toBe("grid");
    expect(result.searchQuery).toBe("hop:alice:3");
    expect(result.groups).toEqual([{ expression: null, color: "#00ff00" }]);
  });

  it("roundtrips default panel without data loss", () => {
    const json = exportPreset(DEFAULT_PANEL as any);
    const preset = importPreset(json);
    const result = applyPreset(DEFAULT_PANEL as any, preset);

    for (const key of Object.keys(DEFAULT_PANEL) as (keyof PanelState)[]) {
      expect(result[key]).toEqual(DEFAULT_PANEL[key]);
    }
  });

  it("roundtrips a panel with Set field through array conversion", () => {
    const original = makePanel() as any;
    original.collapsedGroups = new Set(["section-a", "section-b"]);
    const json = exportPreset(original);
    const parsed = JSON.parse(json);
    // In JSON, the Set becomes an array
    expect(parsed.collapsedGroups).toEqual(["section-a", "section-b"]);
  });

  it("roundtrips coordinateLayout through export/import/apply", () => {
    const layout = {
      system: "cartesian",
      axis1: { source: { kind: "property", key: "date" }, transform: { kind: "date-to-index" } },
      axis2: { source: { kind: "index" }, transform: { kind: "stack-avoid" } },
      perGroup: true,
    };
    const original = makePanel() as any;
    original.coordinateLayout = layout;
    const json = exportPreset(original);
    const preset = importPreset(json);
    const result = applyPreset(makePanel() as any, preset);
    expect((result as any).coordinateLayout).toEqual(layout);
  });

  it("roundtrips coordinateLayout=null through export/import/apply", () => {
    const original = makePanel() as any;
    original.coordinateLayout = null;
    const json = exportPreset(original);
    const preset = importPreset(json);
    const result = applyPreset(makePanel() as any, preset);
    expect((result as any).coordinateLayout).toBeNull();
  });
});

