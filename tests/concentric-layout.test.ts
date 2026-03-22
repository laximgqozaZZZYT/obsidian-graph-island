import { describe, it, expect } from "vitest";
import { applyConcentricLayout, repositionShell } from "../src/layouts/concentric";
import type { GraphNode, GraphEdge, GraphData, ShellInfo } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string): GraphNode {
  return { id, label: id, x: 0, y: 0, group: "", tags: [], category: "" } as GraphNode;
}

function mkEdge(source: string, target: string): GraphEdge {
  return { source, target, type: "link" } as GraphEdge;
}

function mkGraph(nodeIds: string[], edges: [string, string][] = []): GraphData {
  return {
    nodes: nodeIds.map(id => mkNode(id)),
    edges: edges.map(([s, t]) => mkEdge(s, t)),
  };
}

function dist(x: number, y: number, cx: number, cy: number): number {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

// ---------------------------------------------------------------------------
// applyConcentricLayout
// ---------------------------------------------------------------------------

describe("applyConcentricLayout", () => {
  it("returns empty for empty graph", () => {
    const result = applyConcentricLayout({ nodes: [], edges: [] });
    expect(result.data.nodes).toEqual([]);
    expect(result.shells).toEqual([]);
  });

  it("single node placed at center (radius=0)", () => {
    const result = applyConcentricLayout(mkGraph(["a"]));
    expect(result.data.nodes[0].x).toBe(0);
    expect(result.data.nodes[0].y).toBe(0);
    expect(result.shells[0].radius).toBe(0);
  });

  it("highest-degree node on innermost shell", () => {
    // "hub" has 4 edges, others have 1
    const graph = mkGraph(["hub", "a", "b", "c", "d"], [
      ["hub", "a"], ["hub", "b"], ["hub", "c"], ["hub", "d"],
    ]);
    const result = applyConcentricLayout(graph);
    // First shell should contain "hub" (highest degree)
    expect(result.shells[0].nodeIds).toContain("hub");
  });

  it("multiple shells created for many nodes", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const result = applyConcentricLayout(mkGraph(ids));
    expect(result.shells.length).toBeGreaterThan(1);
  });

  it("all nodes are assigned to shells", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `n${i}`);
    const result = applyConcentricLayout(mkGraph(ids));
    const allShellNodes = result.shells.flatMap(s => s.nodeIds);
    expect(allShellNodes.length).toBe(15);
    for (const id of ids) {
      expect(allShellNodes).toContain(id);
    }
  });

  it("nodes on same shell are equidistant from center", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `n${i}`);
    const result = applyConcentricLayout(mkGraph(ids), { centerX: 0, centerY: 0 });
    for (const shell of result.shells) {
      if (shell.nodeIds.length <= 1) continue;
      const distances = shell.nodeIds.map(id => {
        const node = result.data.nodes.find(n => n.id === id)!;
        return dist(node.x, node.y, 0, 0);
      });
      const first = distances[0];
      for (const d of distances) {
        expect(d).toBeCloseTo(first, 5);
      }
    }
  });

  it("outer shells have larger radius", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const result = applyConcentricLayout(mkGraph(ids));
    for (let i = 1; i < result.shells.length; i++) {
      expect(result.shells[i].radius).toBeGreaterThanOrEqual(result.shells[i - 1].radius);
    }
  });

  it("shell rotation directions alternate", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const result = applyConcentricLayout(mkGraph(ids));
    if (result.shells.length >= 2) {
      expect(result.shells[0].rotationDirection).toBe(1);
      expect(result.shells[1].rotationDirection).toBe(-1);
    }
  });

  it("custom center offsets all positions", () => {
    const result = applyConcentricLayout(
      mkGraph(["a", "b", "c", "d"]),
      { centerX: 500, centerY: 300 },
    );
    // Single center node should be at the custom center
    const centerNode = result.data.nodes.find(n =>
      result.shells[0].nodeIds.includes(n.id) && result.shells[0].radius === 0
    );
    if (centerNode) {
      expect(centerNode.x).toBe(500);
      expect(centerNode.y).toBe(300);
    }
  });

  it("preserves edges unchanged", () => {
    const edges: [string, string][] = [["a", "b"], ["b", "c"]];
    const result = applyConcentricLayout(mkGraph(["a", "b", "c"], edges));
    expect(result.data.edges.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// repositionShell
// ---------------------------------------------------------------------------

describe("repositionShell", () => {
  it("no-op for empty shell", () => {
    const shell: ShellInfo = {
      radius: 100, nodeIds: [], centerX: 0, centerY: 0,
      angleOffset: 0, rotationSpeed: 0.08, rotationDirection: 1,
    };
    repositionShell(shell, new Map());
    // No crash
  });

  it("repositions nodes on the shell circle", () => {
    const nodes = new Map<string, GraphNode>([
      ["a", mkNode("a")],
      ["b", mkNode("b")],
    ]);
    const shell: ShellInfo = {
      radius: 100, nodeIds: ["a", "b"], centerX: 0, centerY: 0,
      angleOffset: 0, rotationSpeed: 0.08, rotationDirection: 1,
    };
    repositionShell(shell, nodes);
    // Both nodes should be at radius=100 from center
    expect(dist(nodes.get("a")!.x, nodes.get("a")!.y, 0, 0)).toBeCloseTo(100, 5);
    expect(dist(nodes.get("b")!.x, nodes.get("b")!.y, 0, 0)).toBeCloseTo(100, 5);
  });

  it("angleOffset rotates the positions", () => {
    const nodes = new Map([["a", mkNode("a")]]);
    const shell: ShellInfo = {
      radius: 100, nodeIds: ["a"], centerX: 0, centerY: 0,
      angleOffset: 0, rotationSpeed: 0.08, rotationDirection: 1,
    };
    repositionShell(shell, nodes);
    const x0 = nodes.get("a")!.x;
    const y0 = nodes.get("a")!.y;

    shell.angleOffset = Math.PI / 4;
    repositionShell(shell, nodes);
    const x1 = nodes.get("a")!.x;
    const y1 = nodes.get("a")!.y;

    // Position should change after rotation
    expect(Math.abs(x1 - x0) + Math.abs(y1 - y0)).toBeGreaterThan(1);
  });

  it("skips missing nodes gracefully", () => {
    const nodes = new Map([["a", mkNode("a")]]);
    const shell: ShellInfo = {
      radius: 100, nodeIds: ["a", "missing"], centerX: 0, centerY: 0,
      angleOffset: 0, rotationSpeed: 0.08, rotationDirection: 1,
    };
    // Should not throw
    repositionShell(shell, nodes);
    expect(dist(nodes.get("a")!.x, nodes.get("a")!.y, 0, 0)).toBeCloseTo(100, 5);
  });
});
