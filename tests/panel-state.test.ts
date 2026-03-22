import { describe, it, expect } from "vitest";
import { createDefaultPanel, validatePanelState, type PanelState } from "../src/views/PanelBuilder";

describe("createDefaultPanel", () => {
  it("returns a valid PanelState with all required fields", () => {
    const panel = createDefaultPanel();
    // Spot-check essential fields exist and have correct types
    expect(typeof panel.nodeSize).toBe("number");
    expect(typeof panel.showLinks).toBe("boolean");
    expect(typeof panel.searchQuery).toBe("string");
    expect(panel.collapsedGroups instanceof Set).toBe(true);
  });

  it("has no undefined values in required fields", () => {
    const panel = createDefaultPanel();
    const criticalFields: (keyof PanelState)[] = [
      "nodeSize", "showLinks", "showTagEdges", "showCategoryEdges",
      "showSemanticEdges", "showInheritance", "showAggregation",
      "showSibling", "showSequence", "showSimilar", "showOrphans",
      "searchQuery", "activeTab",
    ];
    for (const key of criticalFields) {
      expect(panel[key]).not.toBeUndefined();
    }
  });

  it("returns independent instances (no shared references)", () => {
    const a = createDefaultPanel();
    const b = createDefaultPanel();
    a.nodeSize = 999;
    expect(b.nodeSize).not.toBe(999);
    a.bookmarkedNodes.push("test-node");
    expect(b.bookmarkedNodes).toHaveLength(0);
  });

  it("has correct default values for key settings", () => {
    const panel = createDefaultPanel();
    expect(panel.nodeSize).toBe(15);
    expect(panel.showLinks).toBe(true);
    expect(panel.showOrphans).toBe(true);
    expect(panel.hoverHops).toBe(2);
    expect(panel.edgeDirectionFilter).toBe("all");
    expect(panel.showBidirectionalIndicator).toBe(false);
    expect(panel.degreeEdgeWidth).toBe(0);
    expect(panel.showOntologyBackbone).toBe(false);
  });
});

describe("validatePanelState", () => {
  it("fixes NaN numeric values to defaults", () => {
    const panel = createDefaultPanel();
    (panel as any).nodeSize = NaN;
    (panel as any).centerForce = Infinity;
    validatePanelState(panel);
    expect(panel.nodeSize).toBe(15); // default
    expect(isFinite(panel.centerForce)).toBe(true);
  });

  it("clamps hoverHops to 0-10", () => {
    const panel = createDefaultPanel();
    panel.hoverHops = -5;
    validatePanelState(panel);
    expect(panel.hoverHops).toBe(0);

    panel.hoverHops = 99;
    validatePanelState(panel);
    expect(panel.hoverHops).toBe(10);
  });

  it("clamps nodeSize to 1-100", () => {
    const panel = createDefaultPanel();
    panel.nodeSize = 0;
    validatePanelState(panel);
    expect(panel.nodeSize).toBe(1);

    panel.nodeSize = 500;
    validatePanelState(panel);
    expect(panel.nodeSize).toBe(100);
  });

  it("ensures arrays are arrays", () => {
    const panel = createDefaultPanel();
    (panel as any).multiSelectNodeIds = null;
    (panel as any).presentationWaypoints = "not-an-array";
    validatePanelState(panel);
    expect(Array.isArray(panel.multiSelectNodeIds)).toBe(true);
    expect(Array.isArray(panel.presentationWaypoints)).toBe(true);
  });

  it("converts collapsedGroups to Set if needed", () => {
    const panel = createDefaultPanel();
    (panel as any).collapsedGroups = ["a", "b"];
    validatePanelState(panel);
    expect(panel.collapsedGroups instanceof Set).toBe(true);
    expect(panel.collapsedGroups.has("a")).toBe(true);
  });

  it("does not modify valid panel state", () => {
    const panel = createDefaultPanel();
    const origSize = panel.nodeSize;
    const origHops = panel.hoverHops;
    validatePanelState(panel);
    expect(panel.nodeSize).toBe(origSize);
    expect(panel.hoverHops).toBe(origHops);
  });
});
