import { describe, it, expect } from "vitest";
import { exportPreset, exportPresetDiff, importPreset, applyPreset } from "../src/utils/presets";

// We define a local DEFAULT_PANEL to avoid importing from PanelBuilder
// which pulls in the "obsidian" module (not available in test env).
// This matches the shape in src/views/PanelBuilder.ts.
const DEFAULT_PANEL = {
  includeTagsInData: true,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  showArrows: false,
  textFadeThreshold: 0.5,
  nodeSize: 10,
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
  nodeColorMode: "category" as const,
  showInheritance: true,
  showAggregation: true,
  showTagNodes: true,
  tagDisplay: "enclosure" as const,
  showSimilar: false,
  showSibling: true,
  showSequence: true,
  showLinks: true,
  showTagEdges: true,
  showCategoryEdges: true,
  showSemanticEdges: true,
  enclosureSpacing: 1.5,
  directionalGravityRules: [],
  hoverHops: 1,
  commonQueries: [],
  clusterGroupRules: [],
  clusterArrangement: "grid" as const,
  clusterNodeSpacing: 3.0,
  clusterGroupScale: 3.0,
  clusterGroupSpacing: 2.0,
  fadeEdgesByDegree: false,
  edgeBundleStrength: 0.65,
  sortRules: [{ key: "degree" as const, order: "desc" as const }],
  nodeRules: [],
  nodeShapeRules: [
    { match: "isTag", shape: "triangle" },
    { match: "default", shape: "circle" },
  ],
  dataviewQuery: "",
  timelineKey: "date",
  showEdgeLabels: false,
  showMinimap: true,
  groupBy: "none" as const,
  groupByRules: null,
  groupMinSize: 2,
  groupFilter: "",
  collapsedGroups: new Set<string>(),
  activeTab: "filter" as const,
  autoFit: false,
  showDurationBars: true,
  timelineEndKey: "end-date",
  timelineOrderFields: "",
  coordinateLayout: null,
  showDotGrid: true,
  timelineRangeMin: 0,
  timelineRangeMax: 1,
  ringChartMode: false,
  gridShowHeaders: true,
  showAxisTitles: true,
  showTimelineTickLabels: true,
  gridCellShading: false,
  gridStyle: "lines" as const,
  gridLabelPlacement: "on-line" as const,
  clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
  clusterFollowsGroupBy: true,
  nodeDisplayMode: "node" as const,
  cardDisplayConfig: { fields: [], maxWidth: 120, showIcon: false },
  donutDisplayConfig: { innerRadius: 0.6 },
  edgeCardinalityMode: "none" as const,
  cardinalityRules: [],
  cableBundleMode: "auto" as const,
  cableTrunkWidth: 2,
  cableTrunkAlpha: 0.85,
  cableSpacing: 4,
  cableFanWidth: 1,
  cableFanAlpha: 0.45,
  syncWithEditor: true,
  localGraphCenter: null,
  localGraphHops: 2,
  edgeWeightThickness: true,
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
    const preset = importPreset(JSON.stringify({ includeTagsInData: true, unknownField: 42 }));
    expect(preset).toHaveProperty("includeTagsInData", true);
    expect(preset).not.toHaveProperty("unknownField");
  });

  it("validates boolean fields — drops wrong type", () => {
    const preset = importPreset(JSON.stringify({
      includeTagsInData: true,
      showArrows: "yes",  // wrong type — should be dropped
    }));
    expect(preset.includeTagsInData).toBe(true);
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
    for (const v of ["concentric", "radial", "phyllotaxis", "grid", "triangle", "random", "timeline", "custom"]) {
      const preset = importPreset(JSON.stringify({ clusterArrangement: v }));
      expect(preset.clusterArrangement).toBe(v);
    }
  });

  it("migrates removed arrangement patterns to grid", () => {
    for (const v of ["spiral", "mountain", "sunburst", "tree"]) {
      const preset = importPreset(JSON.stringify({ clusterArrangement: v }));
      expect(preset.clusterArrangement).toBe("grid");
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
    const current = makePanel({ includeTagsInData: true, nodeSize: 8 });
    const preset = { includeTagsInData: false, nodeSize: 16 } as any;
    const result = applyPreset(current as any, preset);
    expect(result.includeTagsInData).toBe(false);
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

describe("importPreset — field classification fixes", () => {
  it("accepts viewMode enum (was missing from ENUM_VALUES)", () => {
    for (const v of ["graph", "sunburst", "timeline", "tree", "matrix"]) {
      const preset = importPreset(JSON.stringify({ viewMode: v }));
      expect(preset.viewMode).toBe(v);
    }
  });

  it("rejects invalid viewMode", () => {
    const preset = importPreset(JSON.stringify({ viewMode: "invalid" }));
    expect(preset).not.toHaveProperty("viewMode");
  });

  it("accepts nodeIconMap as object (was misclassified as string)", () => {
    const map = { character: "👤", episode: "📖" };
    const preset = importPreset(JSON.stringify({ nodeIconMap: map }));
    expect(preset).toHaveProperty("nodeIconMap");
    expect((preset as any).nodeIconMap).toEqual(map);
  });

  it("accepts nodeIconMap as null", () => {
    const preset = importPreset(JSON.stringify({ nodeIconMap: null }));
    expect(preset).toHaveProperty("nodeIconMap");
    expect((preset as any).nodeIconMap).toBeNull();
  });

  it("drops nodeIconMap if it is a string", () => {
    const preset = importPreset(JSON.stringify({ nodeIconMap: "bad" }));
    expect(preset).not.toHaveProperty("nodeIconMap");
  });

  it("accepts activeTab nodes (was missing from enum)", () => {
    const preset = importPreset(JSON.stringify({ activeTab: "nodes" }));
    expect(preset.activeTab).toBe("nodes");
  });
});

describe("roundtrip: export -> import -> apply", () => {
  it("roundtrips a customized panel state", () => {
    const original = makePanel({
      includeTagsInData: false,
      nodeSize: 20,
      tagDisplay: "node",
      clusterArrangement: "grid",
      searchQuery: "hop:alice:3",
      groups: [{ expression: null, color: "#00ff00" }],
    });
    const json = exportPreset(original as any);
    const preset = importPreset(json);
    const result = applyPreset(makePanel() as any, preset);

    expect(result.includeTagsInData).toBe(false);
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

// GX: Verify all DEFAULT_PANEL keys survive export→import roundtrip
describe("GX: preset field completeness", () => {
  it("all DEFAULT_PANEL scalar keys survive export→import", () => {
    const panel = makePanel() as any;
    const json = exportPreset(panel);
    const imported = importPreset(json);
    const missing: string[] = [];
    for (const [key, value] of Object.entries(panel)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "function") continue;
      if (value instanceof Set) continue;
      // Arrays and objects are handled separately
      if (Array.isArray(value) || typeof value === "object") {
        if (!(key in imported)) missing.push(key + " (object/array)");
        continue;
      }
      if (!(key in imported)) missing.push(key + " (" + typeof value + ")");
    }
    expect(missing).toEqual([]);
  });
});

describe("exportPresetDiff", () => {
  it("returns only metadata when panel equals defaults", () => {
    const panel = { ...DEFAULT_PANEL };
    const diff = exportPresetDiff(panel as any, DEFAULT_PANEL as any);
    const parsed = JSON.parse(diff);
    // Only _exportedAt should be present (no version when not provided)
    const nonMetaKeys = Object.keys(parsed).filter(k => !k.startsWith("_"));
    expect(nonMetaKeys.length).toBe(0);
  });

  it("includes only changed scalar fields", () => {
    const panel = { ...DEFAULT_PANEL, nodeSize: 42 };
    const diff = exportPresetDiff(panel as any, DEFAULT_PANEL as any);
    const parsed = JSON.parse(diff);
    expect(parsed.nodeSize).toBe(42);
    expect(parsed.showLinks).toBeUndefined(); // unchanged
  });

  it("detects boolean changes", () => {
    const panel = { ...DEFAULT_PANEL, showArrows: true };
    const diff = exportPresetDiff(panel as any, DEFAULT_PANEL as any);
    const parsed = JSON.parse(diff);
    expect(parsed.showArrows).toBe(true);
  });

  it("detects string changes", () => {
    const panel = { ...DEFAULT_PANEL, searchQuery: "tag:hero" };
    const diff = exportPresetDiff(panel as any, DEFAULT_PANEL as any);
    const parsed = JSON.parse(diff);
    expect(parsed.searchQuery).toBe("tag:hero");
  });

  it("skips Set and Array fields", () => {
    const panel = { ...DEFAULT_PANEL, collapsedGroups: new Set(["a"]) };
    const diff = exportPresetDiff(panel as any, DEFAULT_PANEL as any);
    const parsed = JSON.parse(diff);
    expect(parsed.collapsedGroups).toBeUndefined();
  });

  it("produces valid JSON", () => {
    const panel = { ...DEFAULT_PANEL, nodeSize: 99, showArrows: true };
    const diff = exportPresetDiff(panel as any, DEFAULT_PANEL as any);
    expect(() => JSON.parse(diff)).not.toThrow();
  });
});

describe("importPreset — migration", () => {
  it("migrates removed arrangement to grid", () => {
    const json = JSON.stringify({ clusterArrangement: "spiral" });
    const migrationInfo = { migratedFields: [] as string[], removedFields: [] as string[] };
    const result = importPreset(json, migrationInfo);
    expect(result.clusterArrangement).toBe("grid");
    expect(migrationInfo.migratedFields.some(f => f.includes("clusterArrangement"))).toBe(true);
  });

  it("strips deprecated scaleByDegree field", () => {
    const json = JSON.stringify({ scaleByDegree: true, nodeSize: 20 });
    const migrationInfo = { migratedFields: [] as string[], removedFields: [] as string[] };
    const result = importPreset(json, migrationInfo);
    expect((result as any).scaleByDegree).toBeUndefined();
    expect(result.nodeSize).toBe(20);
    expect(migrationInfo.removedFields).toContain("scaleByDegree");
  });

  it("handles empty object gracefully", () => {
    const result = importPreset("{}");
    expect(result).toBeDefined();
    expect(Object.keys(result).length).toBe(0);
  });

  it("handles preset with only unknown fields", () => {
    const result = importPreset(JSON.stringify({ foo: "bar", baz: 123 }));
    expect(Object.keys(result).length).toBe(0);
  });

  // --- Compound migration tests (cycle113) ---

  it("compound: deprecated + removed arrangement + valid fields together", () => {
    const json = JSON.stringify({
      scaleByDegree: true,           // deprecated → removed
      clusterArrangement: "spiral",  // removed arrangement → grid
      nodeSize: 30,                  // valid number
      showLinks: false,              // valid boolean
      unknownField: "xyz",           // unknown → dropped
    });
    const info = { migratedFields: [] as string[], removedFields: [] as string[] };
    const result = importPreset(json, info);

    expect((result as any).scaleByDegree).toBeUndefined();
    expect(result.clusterArrangement).toBe("grid");
    expect(result.nodeSize).toBe(30);
    expect(result.showLinks).toBe(false);
    expect((result as any).unknownField).toBeUndefined();
    expect(info.removedFields).toContain("scaleByDegree");
    expect(info.migratedFields.length).toBeGreaterThan(0);
  });

  it("legacy showTags → includeTagsInData migration", () => {
    const json = JSON.stringify({ showTags: true });
    const info = { migratedFields: [] as string[], removedFields: [] as string[] };
    const result = importPreset(json, info);
    expect((result as any).showTags).toBeUndefined();
    expect(result.includeTagsInData).toBe(true);
    expect(info.migratedFields.some(f => f.includes("showTags"))).toBe(true);
  });

  it("legacy colorNodesByCategory → nodeColorMode migration", () => {
    const json = JSON.stringify({ colorNodesByCategory: true });
    const info = { migratedFields: [] as string[], removedFields: [] as string[] };
    const result = importPreset(json, info);
    expect((result as any).colorNodesByCategory).toBeUndefined();
    expect(result.nodeColorMode).toBe("category");
    expect(info.migratedFields.some(f => f.includes("nodeColorMode"))).toBe(true);
  });

  it("legacy heatmapMode → nodeColorMode: heatmap", () => {
    const json = JSON.stringify({ heatmapMode: true });
    const info = { migratedFields: [] as string[], removedFields: [] as string[] };
    const result = importPreset(json, info);
    expect(result.nodeColorMode).toBe("heatmap");
  });

  it("migration info is optional (no crash when omitted)", () => {
    const json = JSON.stringify({
      scaleByDegree: true,
      clusterArrangement: "spiral",
      showTags: true,
    });
    // No migrationInfo parameter
    const result = importPreset(json);
    expect(result.clusterArrangement).toBe("grid");
    expect(result.includeTagsInData).toBe(true);
  });
});

// =========================================================================
// Edge cases: Set handling, unknown fields, empty input
// =========================================================================
describe("importPreset edge cases", () => {
  it("empty JSON object returns empty partial", () => {
    const r = importPreset("{}");
    expect(typeof r).toBe("object");
  });

  it("unknown fields are silently ignored", () => {
    const r = importPreset(JSON.stringify({ __unknownField__: 42, nodeSize: 20 }));
    expect((r as any).__unknownField__).toBeUndefined();
    expect(r.nodeSize).toBe(20);
  });

  it("invalid JSON throws or returns empty", () => {
    expect(() => importPreset("{bad json!}")).toThrow();
  });

  it("null values don't crash", () => {
    const r = importPreset(JSON.stringify({ nodeSize: null, showArrows: null }));
    expect(typeof r).toBe("object");
  });

  it("array for collapsedGroups is accepted", () => {
    const r = importPreset(JSON.stringify({ collapsedGroups: ["a", "b"] }));
    // Should convert array to Set or keep as-is
    expect(r.collapsedGroups).toBeDefined();
  });
});

describe("exportPresetDiff edge cases", () => {
  it("identical panels produce minimal diff", () => {
    const panel = { nodeSize: 15, showArrows: false } as any;
    const json = exportPresetDiff(panel, panel);
    const parsed = JSON.parse(json);
    // Diff of identical should have very few keys (+ _exportedAt metadata)
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Export metadata (_version, _exportedAt)
// ---------------------------------------------------------------------------

describe("export metadata", () => {
  it("exportPreset includes _version when provided", () => {
    const panel = { ...DEFAULT_PANEL } as any;
    const json = exportPreset(panel, "0.6.0");
    const parsed = JSON.parse(json);
    expect(parsed._version).toBe("0.6.0");
    expect(parsed._exportedAt).toBeDefined();
    expect(typeof parsed._exportedAt).toBe("string");
  });

  it("exportPreset omits _version when not provided", () => {
    const panel = { ...DEFAULT_PANEL } as any;
    const json = exportPreset(panel);
    const parsed = JSON.parse(json);
    expect(parsed._version).toBeUndefined();
    expect(parsed._exportedAt).toBeDefined();
  });

  it("exportPresetDiff includes metadata", () => {
    const panel = { ...DEFAULT_PANEL, nodeSize: 99 } as any;
    const json = exportPresetDiff(panel, DEFAULT_PANEL as any, "0.6.0");
    const parsed = JSON.parse(json);
    expect(parsed._version).toBe("0.6.0");
    expect(parsed._exportedAt).toBeDefined();
    expect(parsed.nodeSize).toBe(99);
  });

  it("importPreset strips metadata and populates migrationInfo", () => {
    const json = JSON.stringify({
      _version: "0.5.6",
      _exportedAt: "2026-03-24T12:00:00Z",
      nodeSize: 20,
    });
    const info = { migratedFields: [], removedFields: [] } as any;
    const result = importPreset(json, info);
    expect(result.nodeSize).toBe(20);
    expect((result as any)._version).toBeUndefined();
    expect((result as any)._exportedAt).toBeUndefined();
    expect(info.sourceVersion).toBe("0.5.6");
    expect(info.exportedAt).toBe("2026-03-24T12:00:00Z");
  });

  it("importPreset works without metadata", () => {
    const json = JSON.stringify({ nodeSize: 15 });
    const info = { migratedFields: [], removedFields: [] } as any;
    const result = importPreset(json, info);
    expect(result.nodeSize).toBe(15);
    expect(info.sourceVersion).toBeUndefined();
  });

  it("_exportedAt is valid ISO date string", () => {
    const panel = { ...DEFAULT_PANEL } as any;
    const json = exportPreset(panel, "0.6.0");
    const parsed = JSON.parse(json);
    const date = new Date(parsed._exportedAt);
    expect(date.getTime()).not.toBeNaN();
  });
});

