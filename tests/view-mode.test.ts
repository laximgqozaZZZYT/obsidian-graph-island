import { describe, it, expect } from "vitest";
import {
  VIEW_MODE_GRAPH,
  VIEW_MODE_SUNBURST,
  VIEW_MODE_TIMELINE,
  VIEW_MODE_TREE,
  LAYOUT_FORCE,
  LAYOUT_SUNBURST,
  LAYOUT_TIMELINE,
  LAYOUT_TREE,
} from "../src/constants";
import { createDefaultPanel, validatePanelState } from "../src/views/PanelBuilder";
import { viewModeToLayout } from "../src/utils/view-mode-map";
import { isSectionVisible } from "../src/utils/view-mode-sections";
import type { ViewMode } from "../src/types";

describe("ViewMode constants", () => {
  it("exports all 4 view mode constants", () => {
    expect(VIEW_MODE_GRAPH).toBe("graph");
    expect(VIEW_MODE_SUNBURST).toBe("sunburst");
    expect(VIEW_MODE_TIMELINE).toBe("timeline");
    expect(VIEW_MODE_TREE).toBe("tree");
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

  it("unknown section defaults to visible", () => {
    expect(isSectionVisible("graph", "unknownSection" as any)).toBe(true);
    expect(isSectionVisible("sunburst", "unknownSection" as any)).toBe(true);
  });
});

describe("viewMode integration", () => {
  it("createDefaultPanel → viewModeToLayout → LAYOUT_FORCE", () => {
    const panel = createDefaultPanel();
    expect(viewModeToLayout(panel.viewMode)).toBe(LAYOUT_FORCE);
  });

  it("all view modes map to valid LayoutType values", () => {
    const validLayouts = new Set(["force", "concentric", "tree", "arc", "sunburst", "timeline"]);
    for (const mode of ["graph", "sunburst", "timeline", "tree"] as ViewMode[]) {
      expect(validLayouts.has(viewModeToLayout(mode))).toBe(true);
    }
  });

  it("graph shows all, others hide clusterArrangement", () => {
    const sections = ["filter", "clusterArrangement", "edgeDisplay", "forceParameters"] as const;
    for (const s of sections) {
      expect(isSectionVisible("graph", s)).toBe(true);
    }
    for (const mode of ["sunburst", "timeline", "tree"] as ViewMode[]) {
      expect(isSectionVisible(mode, "clusterArrangement")).toBe(false);
    }
  });
});
