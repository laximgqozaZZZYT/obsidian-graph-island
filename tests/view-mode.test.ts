import { describe, it, expect } from "vitest";
import {
  VIEW_MODE_GRAPH,
  VIEW_MODE_SUNBURST,
  VIEW_MODE_TIMELINE,
  VIEW_MODE_TREE,
} from "../src/constants";
import { createDefaultPanel, validatePanelState } from "../src/views/PanelBuilder";

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
