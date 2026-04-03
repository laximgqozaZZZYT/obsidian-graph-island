import { describe, it, expect, vi } from "vitest";
import type { GraphNode, GraphEdge, SortRule, NodeRule } from "../src/types";
import { LayoutController, type LayoutHost } from "../src/views/LayoutController";
import type { ClusterMetadata } from "../src/layouts/cluster-force";
import type { PanelState } from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mkNode(id: string, extra?: Partial<GraphNode>): GraphNode {
  return {
    id,
    label: id,
    x: 0,
    y: 0,
    isTag: false,
    ...extra,
  } as GraphNode;
}

function mkEdge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type } as GraphEdge;
}

function createMockHost(overrides?: Partial<LayoutHost>): LayoutHost {
  return {
    getPanel: () => ({
      nodeSize: 10,
      repelForce: 200,
      linkDistance: 50,
      linkForce: 0.5,
      centerForce: 0.1,
      sortRules: [],
      nodeRules: [],
      directionalGravityRules: [],
      renderThresholds: {},
      nodeDisplayMode: "dot",
      tagDisplay: "none",
      enclosureSpacing: 1.5,
      clusterArrangement: "spiral",
      clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
      clusterGroupRules: [],
      clusterFollowsGroupBy: false,
      groupBy: "none",
      autoFit: false,
      timelineKey: "date",
      timelineEndKey: "end-date",
      timelineOrderFields: "",
      coordinateLayout: null,
      clusterNodeSpacing: 3,
      clusterGroupScale: 3,
      clusterGroupSpacing: 2,
      clusterGroupArrangement: "auto",
      localGraphCenter: null,
      orphanClusterField: "",
      minDegreeFilter: 0,
      maxDegreeFilter: 0,
      showGraphStats: false,
      showStructureQuestions: false,
      focusMode: false,
      showBreadcrumb: false,
      analysisOverlay: "off",
      ...overrides?.getPanel?.(),
    } as any),
    getSimulation: () => null,
    setSimulation: vi.fn(),
    getGraphEdges: () => [],
    getDegrees: () => new Map(),
    getTagMembership: () => new Map(),
    getTagRelPairsCache: () => new Set(),
    getPixiNodes: () => new Map(),
    getCanvasSize: () => ({ width: 800, height: 600 }),
    getSettingsDirectionalGravityRules: () => [],
    setClusterMeta: vi.fn(),
    wakeRenderLoop: vi.fn(),
    getNodeProperty: () => undefined,
    getSequenceFields: () => [],
    getReverseSequenceFields: () => [],
    getWorldScale: () => 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeLiveCentroids
// ---------------------------------------------------------------------------
describe("LayoutController.computeLiveCentroids", () => {
  it("returns null when clusterMeta is null", () => {
    const host = createMockHost();
    const ctrl = new LayoutController(host);
    expect(ctrl.computeLiveCentroids(null)).toBeNull();
  });

  it("computes centroid for single-node cluster", () => {
    const pixiNodes = new Map<string, any>([
      ["a", { data: { x: 100, y: 200 } }],
    ]);
    const host = createMockHost({ getPixiNodes: () => pixiNodes });
    const ctrl = new LayoutController(host);
    const meta: ClusterMetadata = {
      nodeClusterMap: new Map([["a", "cluster1"]]),
      clusterCenters: new Map(),
      clusterBBoxes: new Map(),
    };
    const result = ctrl.computeLiveCentroids(meta);
    expect(result).not.toBeNull();
    expect(result!.get("cluster1")).toEqual({ x: 100, y: 200 });
  });

  it("averages positions for multi-node cluster", () => {
    const pixiNodes = new Map<string, any>([
      ["a", { data: { x: 0, y: 0 } }],
      ["b", { data: { x: 100, y: 200 } }],
    ]);
    const host = createMockHost({ getPixiNodes: () => pixiNodes });
    const ctrl = new LayoutController(host);
    const meta: ClusterMetadata = {
      nodeClusterMap: new Map([["a", "c1"], ["b", "c1"]]),
      clusterCenters: new Map(),
      clusterBBoxes: new Map(),
    };
    const result = ctrl.computeLiveCentroids(meta);
    expect(result!.get("c1")).toEqual({ x: 50, y: 100 });
  });

  it("handles multiple clusters independently", () => {
    const pixiNodes = new Map<string, any>([
      ["a", { data: { x: 10, y: 20 } }],
      ["b", { data: { x: 30, y: 40 } }],
      ["c", { data: { x: 100, y: 100 } }],
    ]);
    const host = createMockHost({ getPixiNodes: () => pixiNodes });
    const ctrl = new LayoutController(host);
    const meta: ClusterMetadata = {
      nodeClusterMap: new Map([["a", "c1"], ["b", "c1"], ["c", "c2"]]),
      clusterCenters: new Map(),
      clusterBBoxes: new Map(),
    };
    const result = ctrl.computeLiveCentroids(meta);
    expect(result!.size).toBe(2);
    expect(result!.get("c1")).toEqual({ x: 20, y: 30 });
    expect(result!.get("c2")).toEqual({ x: 100, y: 100 });
  });

  it("skips nodes not found in pixiNodes", () => {
    const pixiNodes = new Map<string, any>([
      ["a", { data: { x: 50, y: 50 } }],
      // "b" missing from pixiNodes
    ]);
    const host = createMockHost({ getPixiNodes: () => pixiNodes });
    const ctrl = new LayoutController(host);
    const meta: ClusterMetadata = {
      nodeClusterMap: new Map([["a", "c1"], ["b", "c1"]]),
      clusterCenters: new Map(),
      clusterBBoxes: new Map(),
    };
    const result = ctrl.computeLiveCentroids(meta);
    // Only "a" contributes; centroid = a's position
    expect(result!.get("c1")).toEqual({ x: 50, y: 50 });
  });

  it("returns empty map when all nodes missing from pixiNodes", () => {
    const host = createMockHost({ getPixiNodes: () => new Map() });
    const ctrl = new LayoutController(host);
    const meta: ClusterMetadata = {
      nodeClusterMap: new Map([["a", "c1"]]),
      clusterCenters: new Map(),
      clusterBBoxes: new Map(),
    };
    const result = ctrl.computeLiveCentroids(meta);
    expect(result!.size).toBe(0);
  });

  it("returns empty map when nodeClusterMap is empty", () => {
    const host = createMockHost();
    const ctrl = new LayoutController(host);
    const meta: ClusterMetadata = {
      nodeClusterMap: new Map(),
      clusterCenters: new Map(),
      clusterBBoxes: new Map(),
    };
    const result = ctrl.computeLiveCentroids(meta);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildSortComparator
// ---------------------------------------------------------------------------
describe("LayoutController.buildSortComparator", () => {
  it("returns undefined when no sort rules", () => {
    const host = createMockHost();
    const ctrl = new LayoutController(host);
    const result = ctrl.buildSortComparator([], []);
    expect(result).toBeUndefined();
  });

  it("returns comparator when sort rules exist", () => {
    const sortRules: SortRule[] = [{ key: "degree", order: "desc" }];
    const degrees = new Map([["a", 5], ["b", 10]]);
    const host = createMockHost({
      getPanel: () => ({ sortRules, nodeRules: [] } as any),
      getDegrees: () => degrees,
    });
    const ctrl = new LayoutController(host);
    const nodes = [mkNode("a"), mkNode("b")];
    const cmp = ctrl.buildSortComparator(nodes, []);
    expect(cmp).toBeTypeOf("function");
    // b has higher degree, desc = b first (negative when b < a in sorted order)
    const result = cmp!(nodes[0], nodes[1]);
    expect(result).not.toBe(0);
  });

  it("returns comparator for label sort", () => {
    const sortRules: SortRule[] = [{ key: "label", order: "asc" }];
    const host = createMockHost({
      getPanel: () => ({ sortRules, nodeRules: [] } as any),
      getDegrees: () => new Map(),
    });
    const ctrl = new LayoutController(host);
    const nodes = [mkNode("banana", { label: "Banana" }), mkNode("apple", { label: "Apple" })];
    const cmp = ctrl.buildSortComparator(nodes, []);
    expect(cmp).toBeTypeOf("function");
    // Apple < Banana in ascending
    const result = cmp!(nodes[0], nodes[1]);
    expect(result).toBeGreaterThan(0);
  });

  it("computes in-degree when rule requires it", () => {
    const sortRules: SortRule[] = [{ key: "in-degree", order: "desc" }];
    const host = createMockHost({
      getPanel: () => ({ sortRules, nodeRules: [] } as any),
      getDegrees: () => new Map([["a", 2], ["b", 5]]),
    });
    const ctrl = new LayoutController(host);
    const nodes = [mkNode("a"), mkNode("b")];
    const edges = [mkEdge("a", "b"), mkEdge("a", "b"), mkEdge("b", "a")];
    const cmp = ctrl.buildSortComparator(nodes, edges);
    expect(cmp).toBeTypeOf("function");
  });

  it("computes importance when rule requires it", () => {
    const sortRules: SortRule[] = [{ key: "importance", order: "desc" }];
    const host = createMockHost({
      getPanel: () => ({ sortRules, nodeRules: [] } as any),
      getDegrees: () => new Map([["a", 1], ["b", 3]]),
    });
    const ctrl = new LayoutController(host);
    const nodes = [mkNode("a"), mkNode("b")];
    const edges = [mkEdge("a", "b")];
    const cmp = ctrl.buildSortComparator(nodes, edges);
    expect(cmp).toBeTypeOf("function");
  });
});

// ---------------------------------------------------------------------------
// computeNodeSpacingMap
// ---------------------------------------------------------------------------
describe("LayoutController.computeNodeSpacingMap", () => {
  it("returns empty map when no node rules", () => {
    const host = createMockHost({
      getPanel: () => ({ nodeRules: [] } as any),
    });
    const ctrl = new LayoutController(host);
    const result = ctrl.computeNodeSpacingMap([mkNode("a")]);
    expect(result.size).toBe(0);
  });

  it("applies spacingMultiplier from matching rule", () => {
    const rules: NodeRule[] = [{
      query: "*",
      spacingMultiplier: 2.0,
      gravityAngle: -1,
      gravityStrength: 0,
    }];
    const host = createMockHost({
      getPanel: () => ({ nodeRules: rules } as any),
    });
    const ctrl = new LayoutController(host);
    const nodes = [mkNode("a"), mkNode("b")];
    const result = ctrl.computeNodeSpacingMap(nodes);
    expect(result.get("a")).toBe(2.0);
    expect(result.get("b")).toBe(2.0);
  });

  it("multiplies multiple matching rules", () => {
    const rules: NodeRule[] = [
      { query: "*", spacingMultiplier: 2.0, gravityAngle: -1, gravityStrength: 0 },
      { query: "*", spacingMultiplier: 3.0, gravityAngle: -1, gravityStrength: 0 },
    ];
    const host = createMockHost({
      getPanel: () => ({ nodeRules: rules } as any),
    });
    const ctrl = new LayoutController(host);
    const nodes = [mkNode("a")];
    const result = ctrl.computeNodeSpacingMap(nodes);
    expect(result.get("a")).toBe(6.0);
  });

  it("skips nodes with default multiplier (1.0)", () => {
    const rules: NodeRule[] = [{
      query: "tag:special",
      spacingMultiplier: 2.0,
      gravityAngle: -1,
      gravityStrength: 0,
    }];
    const host = createMockHost({
      getPanel: () => ({ nodeRules: rules } as any),
    });
    const ctrl = new LayoutController(host);
    const nodes = [
      mkNode("a"),
      mkNode("b", { tags: ["special"] }),
    ];
    const result = ctrl.computeNodeSpacingMap(nodes);
    // "a" should not be in the map (default 1.0), "b" should match tag:special
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// Constructor and LayoutHost interface
// ---------------------------------------------------------------------------
describe("LayoutController construction", () => {
  it("creates without error", () => {
    const host = createMockHost();
    const ctrl = new LayoutController(host);
    expect(ctrl).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// updateForces — with d3 simulation mock
// ---------------------------------------------------------------------------
describe("LayoutController.updateForces", () => {
  function createSimMock(nodes: GraphNode[] = []) {
    const forces = new Map<string, any>();
    const sim: any = {
      nodes: () => nodes,
      force: (name: string, f?: any) => {
        if (f === undefined) return forces.get(name) ?? null;
        if (f === null) forces.delete(name);
        else forces.set(name, f);
        return sim;
      },
      alpha: () => sim,
      restart: () => sim,
    };
    return sim;
  }

  it("returns early when no simulation", () => {
    const host = createMockHost({ getSimulation: () => null });
    const ctrl = new LayoutController(host);
    // Should not throw
    ctrl.updateForces();
  });

  it("sets charge, link, collide, and center forces", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const edges = [mkEdge("a", "b")];
    const sim = createSimMock(nodes);
    const host = createMockHost({
      getSimulation: () => sim,
      getGraphEdges: () => edges,
      getDegrees: () => new Map([["a", 1], ["b", 1]]),
    });
    const ctrl = new LayoutController(host);
    ctrl.updateForces();

    // Should have set charge, link, collide forces
    expect(sim.force("charge")).toBeTruthy();
    // wakeRenderLoop should have been called
    expect(host.wakeRenderLoop).toHaveBeenCalled();
  });

  it("delegates to applyClusterForce when cluster arrangement is active", () => {
    const nodes = [mkNode("a")];
    const sim = createSimMock(nodes);
    // Pre-set clusterArrangement force
    sim.force("clusterArrangement", () => {});
    const host = createMockHost({
      getSimulation: () => sim,
      getGraphEdges: () => [],
      getDegrees: () => new Map([["a", 1]]),
      getPanel: () => ({
        clusterArrangement: "spiral",
        clusterGravity: { interGroupAttraction: 0.5, intraGroupDensity: 1.0 },
        clusterGroupRules: [],
        clusterFollowsGroupBy: false,
        groupBy: "none",
        autoFit: false,
        renderThresholds: {},
        nodeSize: 10,
        repelForce: 200,
        nodeDisplayMode: "dot",
        tagDisplay: "none",
        nodeRules: [],
        sortRules: [],
        enclosureSpacing: 1.5,
        timelineKey: "date",
        timelineEndKey: "end-date",
        timelineOrderFields: "",
        coordinateLayout: null,
        clusterNodeSpacing: 3,
        clusterGroupScale: 3,
        clusterGroupSpacing: 2,
        clusterGroupArrangement: "auto",
        orphanClusterField: "",
      } as any),
    });
    const ctrl = new LayoutController(host);
    // Should not throw
    ctrl.updateForces();
  });
});

// ---------------------------------------------------------------------------
// applyNodeRulesForce
// ---------------------------------------------------------------------------
describe("LayoutController.applyNodeRulesForce", () => {
  function createSimMock(nodes: GraphNode[] = []) {
    const forces = new Map<string, any>();
    const sim: any = {
      nodes: () => nodes,
      force: (name: string, f?: any) => {
        if (f === undefined) return forces.get(name) ?? null;
        if (f === null) forces.delete(name);
        else forces.set(name, f);
        return sim;
      },
    };
    return sim;
  }

  it("removes directionalGravity force when no rules exist", () => {
    const sim = createSimMock([mkNode("a")]);
    sim.force("directionalGravity", () => {});
    const host = createMockHost({
      getSimulation: () => sim,
      getSettingsDirectionalGravityRules: () => [],
      getPanel: () => ({
        directionalGravityRules: [],
        nodeRules: [],
      } as any),
    });
    const ctrl = new LayoutController(host);
    ctrl.applyNodeRulesForce();
    expect(sim.force("directionalGravity")).toBeNull();
  });

  it("creates directionalGravity force for matching nodes", () => {
    const nodes = [mkNode("a", { tags: ["char"] }), mkNode("b")];
    const sim = createSimMock(nodes);
    const host = createMockHost({
      getSimulation: () => sim,
      getSettingsDirectionalGravityRules: () => [
        { filter: "tag:char", direction: "top", strength: 0.2 },
      ],
      getPanel: () => ({
        directionalGravityRules: [],
        nodeRules: [],
      } as any),
    });
    const ctrl = new LayoutController(host);
    ctrl.applyNodeRulesForce();
    expect(sim.force("directionalGravity")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyEnclosureRepulsionForce
// ---------------------------------------------------------------------------
describe("LayoutController.applyEnclosureRepulsionForce", () => {
  function createSimMock(nodes: GraphNode[] = []) {
    const forces = new Map<string, any>();
    const sim: any = {
      nodes: () => nodes,
      force: (name: string, f?: any) => {
        if (f === undefined) return forces.get(name) ?? null;
        if (f === null) forces.delete(name);
        else forces.set(name, f);
        return sim;
      },
    };
    return sim;
  }

  it("removes enclosureRepulsion when tagDisplay is not enclosure", () => {
    const sim = createSimMock([mkNode("a")]);
    sim.force("enclosureRepulsion", () => {});
    const host = createMockHost({
      getSimulation: () => sim,
      getPanel: () => ({ tagDisplay: "none", enclosureSpacing: 1.5 } as any),
      getTagMembership: () => new Map(),
    });
    const ctrl = new LayoutController(host);
    ctrl.applyEnclosureRepulsionForce();
    expect(sim.force("enclosureRepulsion")).toBeNull();
  });

  it("removes enclosureRepulsion when tagMembership is empty", () => {
    const sim = createSimMock([mkNode("a")]);
    sim.force("enclosureRepulsion", () => {});
    const host = createMockHost({
      getSimulation: () => sim,
      getPanel: () => ({ tagDisplay: "enclosure", enclosureSpacing: 1.5 } as any),
      getTagMembership: () => new Map(),
    });
    const ctrl = new LayoutController(host);
    ctrl.applyEnclosureRepulsionForce();
    expect(sim.force("enclosureRepulsion")).toBeNull();
  });

  it("creates enclosureRepulsion force when conditions met", () => {
    const nodes = [
      mkNode("a", { x: 0, y: 0 }),
      mkNode("b", { x: 100, y: 100 }),
    ];
    const sim = createSimMock(nodes);
    const membership = new Map([
      ["tag1", new Set(["a"])],
      ["tag2", new Set(["b"])],
    ]);
    const host = createMockHost({
      getSimulation: () => sim,
      getPanel: () => ({ tagDisplay: "enclosure", enclosureSpacing: 1.5 } as any),
      getTagMembership: () => membership,
      getTagRelPairsCache: () => new Set(),
    });
    const ctrl = new LayoutController(host);
    ctrl.applyEnclosureRepulsionForce();
    expect(sim.force("enclosureRepulsion")).not.toBeNull();
  });
});
