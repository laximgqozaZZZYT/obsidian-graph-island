import { describe, it, expect } from "vitest";
import {
  VIEW_MODE_GRAPH,
  VIEW_MODE_SUNBURST,
  VIEW_MODE_TIMELINE,
  VIEW_MODE_TREE,
  VIEW_MODE_MATRIX,
  LAYOUT_FORCE,
  LAYOUT_SUNBURST,
  LAYOUT_TIMELINE,
  LAYOUT_TREE,
} from "../src/constants";
import { createDefaultPanel, validatePanelState } from "../src/views/PanelBuilder";
import { viewModeToLayout, viewModeSkipsNodeRendering, viewModeSkipsEdges, viewModeUsesDom } from "../src/utils/view-mode-map";
import { isSectionVisible } from "../src/utils/view-mode-sections";
import type { ViewMode } from "../src/types";

describe("ViewMode constants", () => {
  it("exports all 5 view mode constants", () => {
    expect(VIEW_MODE_GRAPH).toBe("graph");
    expect(VIEW_MODE_SUNBURST).toBe("sunburst");
    expect(VIEW_MODE_TIMELINE).toBe("timeline");
    expect(VIEW_MODE_TREE).toBe("tree");
    expect(VIEW_MODE_MATRIX).toBe("matrix");
  });
});

describe("PanelState viewMode", () => {
  it("createDefaultPanel returns viewMode = 'graph'", () => {
    const panel = createDefaultPanel();
    expect(panel.viewMode).toBe("graph");
  });

  it("validatePanelState preserves valid viewMode", () => {
    const panel = createDefaultPanel();
    panel.viewMode = "sunburst";
    validatePanelState(panel);
    expect(panel.viewMode).toBe("sunburst");
  });

  it("validatePanelState resets invalid viewMode to 'graph'", () => {
    const panel = createDefaultPanel();
    (panel as any).viewMode = "invalid";
    validatePanelState(panel);
    expect(panel.viewMode).toBe("graph");
  });
});

describe("viewModeToLayout", () => {
  it("maps graph → LAYOUT_FORCE", () => {
    expect(viewModeToLayout("graph")).toBe(LAYOUT_FORCE);
  });
  it("maps sunburst → LAYOUT_SUNBURST", () => {
    expect(viewModeToLayout("sunburst")).toBe(LAYOUT_SUNBURST);
  });
  it("maps timeline → LAYOUT_TIMELINE", () => {
    expect(viewModeToLayout("timeline")).toBe(LAYOUT_TIMELINE);
  });
  it("maps tree → LAYOUT_TREE", () => {
    expect(viewModeToLayout("tree")).toBe(LAYOUT_TREE);
  });
  it("maps matrix → LAYOUT_FORCE (DOM-based)", () => {
    expect(viewModeToLayout("matrix")).toBe(LAYOUT_FORCE);
  });
  it("returns LAYOUT_FORCE for unknown input", () => {
    expect(viewModeToLayout("unknown" as any)).toBe(LAYOUT_FORCE);
  });
});

describe("isSectionVisible", () => {
  it("graph mode shows all sections", () => {
    expect(isSectionVisible("graph", "clusterArrangement")).toBe(true);
    expect(isSectionVisible("graph", "edgeDisplay")).toBe(true);
    expect(isSectionVisible("graph", "forceParameters")).toBe(true);
    expect(isSectionVisible("graph", "cableDisplay")).toBe(true);
  });

  it("sunburst hides graph-specific sections", () => {
    expect(isSectionVisible("sunburst", "clusterArrangement")).toBe(false);
    expect(isSectionVisible("sunburst", "forceParameters")).toBe(false);
    expect(isSectionVisible("sunburst", "cableDisplay")).toBe(false);
    expect(isSectionVisible("sunburst", "edgeDisplay")).toBe(false);
  });
  it("sunburst shows filter, hides node-related", () => {
    expect(isSectionVisible("sunburst", "filter")).toBe(true);
    expect(isSectionVisible("sunburst", "nodeDisplay")).toBe(false);
    expect(isSectionVisible("sunburst", "nodeDecorations")).toBe(false);
    expect(isSectionVisible("sunburst", "minimap")).toBe(false);
  });

  it("timeline hides irrelevant sections", () => {
    expect(isSectionVisible("timeline", "clusterArrangement")).toBe(false);
    expect(isSectionVisible("timeline", "forceParameters")).toBe(false);
  });
  it("timeline shows timeline controls and edges", () => {
    expect(isSectionVisible("timeline", "timelineControls")).toBe(true);
    expect(isSectionVisible("timeline", "edgeDisplay")).toBe(true);
  });

  it("tree hides graph-specific sections", () => {
    expect(isSectionVisible("tree", "clusterArrangement")).toBe(false);
    expect(isSectionVisible("tree", "forceParameters")).toBe(false);
    expect(isSectionVisible("tree", "timelineControls")).toBe(false);
  });
  it("tree shows edges", () => {
    expect(isSectionVisible("tree", "edgeDisplay")).toBe(true);
  });

  it("matrix hides most sections (DOM-based)", () => {
    expect(isSectionVisible("matrix", "clusterArrangement")).toBe(false);
    expect(isSectionVisible("matrix", "forceParameters")).toBe(false);
    expect(isSectionVisible("matrix", "edgeDisplay")).toBe(false);
    expect(isSectionVisible("matrix", "nodeDisplay")).toBe(false);
    expect(isSectionVisible("matrix", "minimap")).toBe(false);
  });
  it("matrix shows filter and grouping", () => {
    expect(isSectionVisible("matrix", "filter")).toBe(true);
    expect(isSectionVisible("matrix", "grouping")).toBe(true);
  });

  it("unknown section defaults to visible", () => {
    expect(isSectionVisible("graph", "unknownSection" as any)).toBe(true);
    expect(isSectionVisible("sunburst", "unknownSection" as any)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// viewModeSkipsNodeRendering — sunburst/timeline skip per-node gfx
// ---------------------------------------------------------------------------
describe("viewModeSkipsNodeRendering", () => {
  it("graph does NOT skip node rendering", () => {
    expect(viewModeSkipsNodeRendering("graph")).toBe(false);
  });
  it("sunburst skips node rendering", () => {
    expect(viewModeSkipsNodeRendering("sunburst")).toBe(true);
  });
  it("timeline skips node rendering", () => {
    expect(viewModeSkipsNodeRendering("timeline")).toBe(true);
  });
  it("tree does NOT skip node rendering", () => {
    expect(viewModeSkipsNodeRendering("tree")).toBe(false);
  });
  it("matrix skips node rendering (DOM-based)", () => {
    expect(viewModeSkipsNodeRendering("matrix")).toBe(true);
  });
  it("unknown mode does NOT skip", () => {
    expect(viewModeSkipsNodeRendering("unknown" as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// viewModeSkipsEdges — sunburst/timeline skip edge drawing
// ---------------------------------------------------------------------------
describe("viewModeSkipsEdges", () => {
  it("graph does NOT skip edges", () => {
    expect(viewModeSkipsEdges("graph")).toBe(false);
  });
  it("sunburst skips edges", () => {
    expect(viewModeSkipsEdges("sunburst")).toBe(true);
  });
  it("timeline skips edges", () => {
    expect(viewModeSkipsEdges("timeline")).toBe(true);
  });
  it("tree does NOT skip edges", () => {
    expect(viewModeSkipsEdges("tree")).toBe(false);
  });
  it("matrix skips edges (DOM-based)", () => {
    expect(viewModeSkipsEdges("matrix")).toBe(true);
  });
  it("unknown mode does NOT skip", () => {
    expect(viewModeSkipsEdges("unknown" as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// viewModeUsesDom — matrix uses DOM rendering
// ---------------------------------------------------------------------------
describe("viewModeUsesDom", () => {
  it("matrix uses DOM", () => {
    expect(viewModeUsesDom("matrix")).toBe(true);
  });
  it("graph does NOT use DOM", () => {
    expect(viewModeUsesDom("graph")).toBe(false);
  });
  it("sunburst does NOT use DOM", () => {
    expect(viewModeUsesDom("sunburst")).toBe(false);
  });
  it("timeline does NOT use DOM", () => {
    expect(viewModeUsesDom("timeline")).toBe(false);
  });
  it("tree does NOT use DOM", () => {
    expect(viewModeUsesDom("tree")).toBe(false);
  });
});

describe("viewMode integration", () => {
  it("createDefaultPanel → viewModeToLayout → LAYOUT_FORCE", () => {
    const panel = createDefaultPanel();
    expect(viewModeToLayout(panel.viewMode)).toBe(LAYOUT_FORCE);
  });

  it("all view modes map to valid LayoutType values", () => {
    const validLayouts = new Set(["force", "concentric", "tree", "arc", "sunburst", "timeline"]);
    for (const mode of ["graph", "sunburst", "timeline", "tree", "matrix"] as ViewMode[]) {
      expect(validLayouts.has(viewModeToLayout(mode))).toBe(true);
    }
  });

  it("graph shows all, others hide clusterArrangement", () => {
    const sections = ["filter", "clusterArrangement", "edgeDisplay", "forceParameters"] as const;
    for (const s of sections) {
      expect(isSectionVisible("graph", s)).toBe(true);
    }
    for (const mode of ["sunburst", "timeline", "tree", "matrix"] as ViewMode[]) {
      expect(isSectionVisible(mode, "clusterArrangement")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// viewModeUsesDom — only matrix uses DOM rendering
// ---------------------------------------------------------------------------
describe("viewModeUsesDom", () => {
  it("matrix uses DOM", () => {
    expect(viewModeUsesDom("matrix")).toBe(true);
  });
  it.each(["graph", "sunburst", "timeline", "tree"] as ViewMode[])("%s does NOT use DOM", (mode) => {
    expect(viewModeUsesDom(mode)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSectionVisible — matrix mode exhaustive
// ---------------------------------------------------------------------------
describe("isSectionVisible matrix", () => {
  it("matrix hides all graph-specific sections", () => {
    const hidden = [
      "nodeDisplay", "nodeDisplayMode", "nodeDecorations",
      "structureAnalysis", "discovery", "interaction",
      "edgeDisplay", "cableDisplay", "roadNetwork", "minimap",
      "relationColors", "clusterArrangement", "coordinateControls",
      "timelineControls", "forceParameters", "nodeRules",
    ] as const;
    for (const s of hidden) {
      expect(isSectionVisible("matrix", s)).toBe(false);
    }
  });
  it("matrix shows filter and grouping", () => {
    expect(isSectionVisible("matrix", "filter")).toBe(true);
    expect(isSectionVisible("matrix", "grouping")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: viewMode → layout → back
// ---------------------------------------------------------------------------
describe("viewMode round-trip consistency", () => {
  const ALL_MODES: ViewMode[] = ["graph", "sunburst", "timeline", "tree", "matrix"];

  it("every viewMode has a valid layout mapping", () => {
    for (const m of ALL_MODES) {
      const layout = viewModeToLayout(m);
      expect(typeof layout).toBe("string");
      expect(layout.length).toBeGreaterThan(0);
    }
  });

  it("skipNodeRendering and skipEdges are consistent (skip edges implies skip nodes)", () => {
    for (const m of ALL_MODES) {
      if (viewModeSkipsEdges(m)) {
        expect(viewModeSkipsNodeRendering(m)).toBe(true);
      }
    }
  });

  it("DOM modes always skip node rendering", () => {
    for (const m of ALL_MODES) {
      if (viewModeUsesDom(m)) {
        expect(viewModeSkipsNodeRendering(m)).toBe(true);
      }
    }
  });

  it("validatePanelState accepts all valid viewModes", () => {
    for (const m of ALL_MODES) {
      const panel = createDefaultPanel();
      panel.viewMode = m;
      validatePanelState(panel);
      expect(panel.viewMode).toBe(m);
    }
  });
});
