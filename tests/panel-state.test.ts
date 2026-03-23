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

describe("validatePanelState — boundary values", () => {
  it("Infinity in all numeric fields replaced by defaults", () => {
    const panel = createDefaultPanel();
    const defaults = createDefaultPanel();
    const numericKeys = [
      "nodeSize", "centerForce", "repelForce", "linkForce", "linkDistance",
      "textFadeThreshold", "concentricMinRadius", "concentricRadiusStep",
      "hoverHops", "enclosureSpacing", "edgeBundleStrength",
      "clusterNodeSpacing", "clusterGroupScale", "clusterGroupSpacing",
    ] as const;
    for (const key of numericKeys) {
      (panel as any)[key] = Infinity;
    }
    validatePanelState(panel);
    for (const key of numericKeys) {
      expect(isFinite(panel[key] as number), `${key} should be finite`).toBe(true);
    }
  });

  it("-Infinity in numeric fields replaced by defaults", () => {
    const panel = createDefaultPanel();
    (panel as any).nodeSize = -Infinity;
    (panel as any).centerForce = -Infinity;
    validatePanelState(panel);
    expect(isFinite(panel.nodeSize)).toBe(true);
    expect(isFinite(panel.centerForce)).toBe(true);
  });

  it("negative nodeSize clamped to 1", () => {
    const panel = createDefaultPanel();
    panel.nodeSize = -50;
    validatePanelState(panel);
    expect(panel.nodeSize).toBe(1);
  });

  it("huge nodeSize clamped to 100", () => {
    const panel = createDefaultPanel();
    panel.nodeSize = 99999;
    validatePanelState(panel);
    expect(panel.nodeSize).toBe(100);
  });

  it("string coerced numeric fields get reset to default", () => {
    const panel = createDefaultPanel();
    (panel as any).nodeSize = "not a number";
    (panel as any).hoverHops = "abc";
    validatePanelState(panel);
    expect(typeof panel.nodeSize).toBe("number");
    expect(isFinite(panel.nodeSize)).toBe(true);
    expect(typeof panel.hoverHops).toBe("number");
  });

  it("null multiSelectNodeIds becomes empty array", () => {
    const panel = createDefaultPanel();
    (panel as any).multiSelectNodeIds = null;
    validatePanelState(panel);
    expect(Array.isArray(panel.multiSelectNodeIds)).toBe(true);
    expect(panel.multiSelectNodeIds.length).toBe(0);
  });

  it("plain object collapsedGroups becomes Set", () => {
    const panel = createDefaultPanel();
    (panel as any).collapsedGroups = { not: "a set" };
    validatePanelState(panel);
    expect(panel.collapsedGroups instanceof Set).toBe(true);
  });

  it("renderThresholds migration: nodeSizeByDegree defaults to true", () => {
    const panel = createDefaultPanel();
    panel.renderThresholds = { nodeSizeByDegree: false };
    validatePanelState(panel);
    expect(panel.renderThresholds.nodeSizeByDegree).toBe(true);
  });

  it("renderThresholds migration: autoLOD defaults to true", () => {
    const panel = createDefaultPanel();
    panel.renderThresholds = {};
    validatePanelState(panel);
    expect(panel.renderThresholds!.autoLOD).toBe(true);
  });

  it("idempotent: double validation produces same result", () => {
    const panel = createDefaultPanel();
    (panel as any).nodeSize = NaN;
    (panel as any).hoverHops = -100;
    (panel as any).multiSelectNodeIds = null;
    validatePanelState(panel);
    const snapshot = JSON.stringify(panel, (_, v) => v instanceof Set ? [...v] : v);
    validatePanelState(panel);
    const snapshot2 = JSON.stringify(panel, (_, v) => v instanceof Set ? [...v] : v);
    expect(snapshot2).toBe(snapshot);
  });

  it("cableTrunkAlpha 0 migrated to 0.25", () => {
    const panel = createDefaultPanel();
    panel.cableTrunkAlpha = 0;
    validatePanelState(panel);
    expect(panel.cableTrunkAlpha).toBe(0.25);
  });

  it("cableTrunkAlpha non-zero preserved", () => {
    const panel = createDefaultPanel();
    panel.cableTrunkAlpha = 0.5;
    validatePanelState(panel);
    expect(panel.cableTrunkAlpha).toBe(0.5);
  });

  it("collapsedGroups array→Set preserves values", () => {
    const panel = createDefaultPanel();
    (panel as any).collapsedGroups = ["group-A", "group-B", "group-C"];
    validatePanelState(panel);
    expect(panel.collapsedGroups.size).toBe(3);
    expect(panel.collapsedGroups.has("group-A")).toBe(true);
    expect(panel.collapsedGroups.has("group-C")).toBe(true);
  });

  it("presentationWaypoints null→empty array", () => {
    const panel = createDefaultPanel();
    (panel as any).presentationWaypoints = null;
    validatePanelState(panel);
    expect(Array.isArray(panel.presentationWaypoints)).toBe(true);
    expect(panel.presentationWaypoints).toHaveLength(0);
  });

  it("nodeSize at exact boundary values", () => {
    const panel1 = createDefaultPanel();
    panel1.nodeSize = 1;
    validatePanelState(panel1);
    expect(panel1.nodeSize).toBe(1);

    const panel2 = createDefaultPanel();
    panel2.nodeSize = 100;
    validatePanelState(panel2);
    expect(panel2.nodeSize).toBe(100);
  });

  it("hoverHops at exact boundary values", () => {
    const panel1 = createDefaultPanel();
    panel1.hoverHops = 0;
    validatePanelState(panel1);
    expect(panel1.hoverHops).toBe(0);

    const panel2 = createDefaultPanel();
    panel2.hoverHops = 10;
    validatePanelState(panel2);
    expect(panel2.hoverHops).toBe(10);
  });
});
