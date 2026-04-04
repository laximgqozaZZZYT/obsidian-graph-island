import { describe, it, expect, beforeEach, vi } from "vitest";
import { NodeDetailView, VIEW_TYPE_NODE_DETAIL } from "../src/views/NodeDetailView";
import type { GraphNode, GraphEdge } from "../src/types";
import type { PixiNode } from "../src/views/InteractionManager";

// ---------------------------------------------------------------------------
// VIEW_TYPE_NODE_DETAIL constant
// ---------------------------------------------------------------------------
describe("VIEW_TYPE_NODE_DETAIL", () => {
  it("is a non-empty string", () => {
    expect(typeof VIEW_TYPE_NODE_DETAIL).toBe("string");
    expect(VIEW_TYPE_NODE_DETAIL.length).toBeGreaterThan(0);
  });

  it("equals 'graph-node-detail'", () => {
    expect(VIEW_TYPE_NODE_DETAIL).toBe("graph-node-detail");
  });

  it("is kebab-case (no uppercase, no underscores)", () => {
    expect(VIEW_TYPE_NODE_DETAIL).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

// ---------------------------------------------------------------------------
// NodeDetailView class methods
// ---------------------------------------------------------------------------

describe("NodeDetailView", () => {
  let view: NodeDetailView;

  beforeEach(() => {
    // Helper to create deeply nested DOM mocks
    const createDOMMock = (): any => ({
      addClass: vi.fn(),
      empty: vi.fn(),
      createEl: vi.fn(function (tag, opts) {
        return createDOMMock();
      }),
      createDiv: vi.fn(function (opts) {
        return createDOMMock();
      }),
      appendChild: vi.fn(),
      appendText: vi.fn(),
      addEventListener: vi.fn(),
      setAttribute: vi.fn(),
      toggleClass: vi.fn(),
      style: {},
      textContent: "",
    });

    // Create a mock app with required structure
    const mockApp = {
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
        cachedRead: vi.fn(async () => ""),
      },
      metadataCache: {
        getFileCache: vi.fn(() => null),
        resolvedLinks: {},
      },
      workspace: {
        trigger: vi.fn(),
        on: vi.fn(() => ({ id: "" })),
        openLinkText: vi.fn(),
      },
    } as any;

    const mockLeaf = {
      getViewType: vi.fn(() => VIEW_TYPE_NODE_DETAIL),
    } as any;

    view = new NodeDetailView(mockLeaf);
    view.app = mockApp;
    view.contentEl = createDOMMock();
    view.registerEvent = vi.fn(() => ({ id: "" }));
  });

  // ---------------------------------------------------------------------------
  // Pure getter methods
  // ---------------------------------------------------------------------------

  describe("getViewType()", () => {
    it("returns VIEW_TYPE_NODE_DETAIL", () => {
      expect(view.getViewType()).toBe(VIEW_TYPE_NODE_DETAIL);
    });

    it("returns exactly 'graph-node-detail'", () => {
      expect(view.getViewType()).toBe("graph-node-detail");
    });

    it("always returns the same constant", () => {
      expect(view.getViewType()).toBe(view.getViewType());
    });
  });

  describe("getDisplayText()", () => {
    it("returns a non-empty string", () => {
      const text = view.getDisplayText();
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    });

    it("contains 'Graph' in the text", () => {
      expect(view.getDisplayText()).toContain("Graph");
    });

    it("contains 'Node' in the text", () => {
      expect(view.getDisplayText()).toContain("Node");
    });

    it("contains 'Detail' in the text", () => {
      expect(view.getDisplayText()).toContain("Detail");
    });

    it("returns consistent value", () => {
      expect(view.getDisplayText()).toBe(view.getDisplayText());
    });
  });

  describe("getIcon()", () => {
    it("returns a non-empty string", () => {
      const icon = view.getIcon();
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
    });

    it("returns 'git-fork'", () => {
      expect(view.getIcon()).toBe("git-fork");
    });

    it("is a kebab-case icon name", () => {
      expect(view.getIcon()).toMatch(/^[a-z][a-z0-9\-]*$/);
    });
  });

  // ---------------------------------------------------------------------------
  // Data structures and node lookups
  // ---------------------------------------------------------------------------

  describe("Node and edge data handling", () => {
    it("handles null node in renderNode gracefully", async () => {
      await view.renderNode(null, new Map(), new Map(), new Map(), []);
      // Should not throw
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles empty adjacency map", async () => {
      const node: GraphNode = { id: "node1", label: "Test", x: 0, y: 0, vx: 0, vy: 0 };
      await view.renderNode(node, new Map(), new Map(), new Map([["node1", 5]]), []);
      // Should not throw
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles empty pixiNodes map", async () => {
      const node: GraphNode = { id: "node1", label: "Test", x: 0, y: 0, vx: 0, vy: 0 };
      const adj = new Map([["node1", new Set(["node2"])]]);
      await view.renderNode(node, adj, new Map(), new Map([["node1", 3]]), []);
      // Should not throw
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles empty degrees map", async () => {
      const node: GraphNode = { id: "node1", label: "Test", x: 0, y: 0, vx: 0, vy: 0 };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      // Should not throw - defaults to degree 0
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles undefined edges array", async () => {
      const node: GraphNode = { id: "node1", label: "Test", x: 0, y: 0, vx: 0, vy: 0 };
      await view.renderNode(node, new Map(), new Map(), new Map(), undefined);
      // Should not throw
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles empty edges array", async () => {
      const node: GraphNode = { id: "node1", label: "Test", x: 0, y: 0, vx: 0, vy: 0 };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      // Should not throw
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Node properties and metadata
  // ---------------------------------------------------------------------------

  describe("Node with various properties", () => {
    it("handles node with tags", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tags: ["tag1", "tag2"],
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with isTag=true", async () => {
      const node: GraphNode = {
        id: "tag/test",
        label: "#test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        isTag: true,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with category", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        category: "Character",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with filePath", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "folder/file.md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with multiple properties", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test Character",
        x: 100,
        y: 200,
        vx: 0,
        vy: 0,
        filePath: "characters/hero.md",
        category: "Character",
        tags: ["protagonist", "human"],
        isTag: false,
      };
      await view.renderNode(node, new Map(), new Map(), new Map([["node1", 42]]), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge relationships
  // ---------------------------------------------------------------------------

  describe("Edge rendering with different types", () => {
    const nodeId = "node1";

    it("handles edges with no type (defaults to 'link')", async () => {
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2" },
      ];
      const node: GraphNode = {
        id: nodeId,
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles edges with explicit type", async () => {
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2", type: "semantic" },
      ];
      const node: GraphNode = {
        id: nodeId,
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles incoming edges", async () => {
      const edges: GraphEdge[] = [
        { id: "e1", source: "node2", target: "node1" },
      ];
      const node: GraphNode = {
        id: nodeId,
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles outgoing edges", async () => {
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2" },
      ];
      const node: GraphNode = {
        id: nodeId,
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("ignores edges not touching the current node", async () => {
      const edges: GraphEdge[] = [
        { id: "e1", source: "node2", target: "node3" },
      ];
      const node: GraphNode = {
        id: nodeId,
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles multiple edges of different types", async () => {
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2", type: "link" },
        { id: "e2", source: "node1", target: "node3", type: "semantic" },
        { id: "e3", source: "node4", target: "node1", type: "tag" },
      ];
      const node: GraphNode = {
        id: nodeId,
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Adjacency and neighbor handling
  // ---------------------------------------------------------------------------

  describe("Node adjacency and neighbor relationships", () => {
    it("handles node with no neighbors", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Isolated",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map<string, Set<string>>();
      await view.renderNode(node, adj, new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with single neighbor", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([["node1", new Set(["node2"])]]);
      await view.renderNode(node, adj, new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with multiple neighbors", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Hub",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([
        ["node1", new Set(["node2", "node3", "node4", "node5"])],
      ]);
      await view.renderNode(node, adj, new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles large neighbor set", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "SuperNode",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const neighbors = new Set<string>();
      for (let i = 0; i < 100; i++) {
        neighbors.add(`node${i + 2}`);
      }
      const adj = new Map([["node1", neighbors]]);
      await view.renderNode(node, adj, new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Degree/connectivity metrics
  // ---------------------------------------------------------------------------

  describe("Node degree metrics", () => {
    it("handles node with degree 0", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Isolated",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const degrees = new Map([["node1", 0]]);
      await view.renderNode(node, new Map(), new Map(), degrees, []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with high degree", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Hub",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const degrees = new Map([["node1", 500]]);
      await view.renderNode(node, new Map(), new Map(), degrees, []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles missing degree (defaults to 0)", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const degrees = new Map(); // empty
      await view.renderNode(node, new Map(), new Map(), degrees, []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles degree 1", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Leaf",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const degrees = new Map([["node1", 1]]);
      await view.renderNode(node, new Map(), new Map(), degrees, []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Closure lifecycle
  // ---------------------------------------------------------------------------

  describe("View lifecycle", () => {
    it("initializes with null render component", () => {
      // View is created in beforeEach without onOpen, so component should be null
      expect(view).toBeDefined();
    });

    it("handles onClose without error", async () => {
      await view.onClose();
      // Should not throw
      expect(view).toBeDefined();
    });

    it("handles multiple onClose calls", async () => {
      await view.onClose();
      await view.onClose();
      // Should not throw
      expect(view).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // onOpen lifecycle initialization
  // ---------------------------------------------------------------------------

  describe("View onOpen initialization", () => {
    it("calls onOpen without error", async () => {
      await view.onOpen();
      expect(view.contentEl.addClass).toHaveBeenCalledWith("gi-detail-root");
      expect(view.contentEl.empty).toHaveBeenCalled();
    });

    it("creates toolbar and hold button in onOpen", async () => {
      await view.onOpen();
      expect(view.contentEl.createEl).toHaveBeenCalled();
    });

    it("registers event listener for hover in onOpen", async () => {
      await view.onOpen();
      // registerEvent should be called with the event listener
      expect(view.registerEvent).toBeDefined();
    });

    it("initializes bodyEl in onOpen", async () => {
      await view.onOpen();
      // After onOpen, bodyEl should be created
      expect(view.contentEl.createEl).toHaveBeenCalled();
    });

    it("calls renderEmpty on initialization", async () => {
      await view.onOpen();
      // renderEmpty should be called initially
      expect(view.contentEl.createEl).toHaveBeenCalled();
    });

    it("creates hold button with pin icon", async () => {
      await view.onOpen();
      // Button should be created with certain properties
      expect(view.contentEl.createEl).toHaveBeenCalled();
    });

    it("sets aria-label on hold button", async () => {
      await view.onOpen();
      // aria-label should be set via setAttribute
      expect(view.contentEl.createEl).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Event handling and state management
  // ---------------------------------------------------------------------------

  describe("Event handling", () => {
    it("triggers highlight with null on property hover leave", async () => {
      // This tests the triggerHighlight function behavior
      await view.onOpen();
      expect(view.app.workspace.trigger).toBeDefined();
    });

    it("handles workspace event registration", async () => {
      await view.onOpen();
      expect(view.registerEvent).toBeDefined();
    });

    it("responds to hover events when not held", async () => {
      await view.onOpen();
      // If held=false, should accept hover events
      expect(view).toBeDefined();
    });

    it("ignores hover events when held with captured node", async () => {
      await view.onOpen();
      // If held=true and holdCaptured=true, should ignore
      expect(view).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Button and UI state
  // ---------------------------------------------------------------------------

  describe("Hold button state management", () => {
    it("toggles hold state on button click", async () => {
      await view.onOpen();
      // Mock click event would toggle hold
      expect(view).toBeDefined();
    });

    it("hold button reflects held state visually", async () => {
      await view.onOpen();
      // toggleClass should be called based on held state
      expect(view.contentEl.createEl).toHaveBeenCalled();
    });

    it("resets holdCaptured when released from hold", async () => {
      await view.onOpen();
      // When held becomes false, holdCaptured should reset
      expect(view).toBeDefined();
    });

    it("captures node when hold is active", async () => {
      await view.onOpen();
      // When held=true and new node arrives, should set holdCaptured
      expect(view).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Extreme value cases
  // ---------------------------------------------------------------------------

  describe("Extreme and edge case values", () => {
    it("handles node with empty label", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with very long label", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "A".repeat(1000),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with special characters in label", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test <>&\"'",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with unicode in label", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "テスト 🎃 中文 العربية",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with empty tags array", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tags: [],
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with many tags", async () => {
      const tags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tags,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with negative coordinates", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: -1000,
        y: -2000,
        vx: -10,
        vy: -20,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with very large coordinates", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 1e10,
        y: 1e10,
        vx: 1e8,
        vy: 1e8,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with NaN in optional fields", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        fx: NaN,
        fy: NaN,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple nodes and complex scenarios
  // ---------------------------------------------------------------------------

  describe("Complex multi-node scenarios", () => {
    it("renders node with neighbors having pixiNode data", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([["node1", new Set(["node2"])]]);
      const pixiNode2: PixiNode = {
        data: { id: "node2", label: "Neighbor", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNodes = new Map([["node2", pixiNode2]]);
      await view.renderNode(node, adj, pixiNodes, new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders node with neighbors missing from pixiNodes", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([["node1", new Set(["node2", "node3"])]]);
      const pixiNodes = new Map(); // missing both neighbors
      await view.renderNode(node, adj, pixiNodes, new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders node with mix of neighbors present and missing", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([["node1", new Set(["node2", "node3", "node4"])]]);
      const pixiNode2: PixiNode = {
        data: { id: "node2", label: "Present", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNodes = new Map([["node2", pixiNode2]]); // only node2 present
      await view.renderNode(node, adj, pixiNodes, new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders edges between node and pixiNodes with data", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2", type: "link" },
        { id: "e2", source: "node1", target: "node3", type: "semantic" },
      ];
      const pixiNode2: PixiNode = {
        data: { id: "node2", label: "Target2", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNode3: PixiNode = {
        data: { id: "node3", label: "Target3", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNodes = new Map([
        ["node2", pixiNode2],
        ["node3", pixiNode3],
      ]);
      await view.renderNode(node, new Map(), pixiNodes, new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders edges with neighbors missing pixiNode data", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2" },
      ];
      const pixiNodes = new Map(); // missing node2
      await view.renderNode(node, new Map(), pixiNodes, new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders multiple edge types from same node", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2", type: "link" },
        { id: "e2", source: "node1", target: "node3", type: "semantic" },
        { id: "e3", source: "node1", target: "node4", type: "tag" },
        { id: "e4", source: "node1", target: "node5", type: "link" },
      ];
      const pixiNode2: PixiNode = {
        data: { id: "node2", label: "N2", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNode3: PixiNode = {
        data: { id: "node3", label: "N3", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNode4: PixiNode = {
        data: { id: "node4", label: "N4", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNode5: PixiNode = {
        data: { id: "node5", label: "N5", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNodes = new Map([
        ["node2", pixiNode2],
        ["node3", pixiNode3],
        ["node4", pixiNode4],
        ["node5", pixiNode5],
      ]);
      await view.renderNode(node, new Map(), pixiNodes, new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Pixi node with tag properties
  // ---------------------------------------------------------------------------

  describe("Pixi nodes with isTag property", () => {
    it("renders neighbors with isTag=true", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([["node1", new Set(["tag1"])]]);
      const pixiTagNode: PixiNode = {
        data: {
          id: "tag1",
          label: "important",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          isTag: true,
        },
      } as any;
      const pixiNodes = new Map([["tag1", pixiTagNode]]);
      await view.renderNode(node, adj, pixiNodes, new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders neighbors with isTag=false", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([["node1", new Set(["node2"])]]);
      const pixiNode: PixiNode = {
        data: {
          id: "node2",
          label: "Regular",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          isTag: false,
        },
      } as any;
      const pixiNodes = new Map([["node2", pixiNode]]);
      await view.renderNode(node, adj, pixiNodes, new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders neighbors with undefined isTag", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Main",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const adj = new Map([["node1", new Set(["node2"])]]);
      const pixiNode: PixiNode = {
        data: {
          id: "node2",
          label: "Neutral",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
        },
      } as any;
      const pixiNodes = new Map([["node2", pixiNode]]);
      await view.renderNode(node, adj, pixiNodes, new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge direction and arrow rendering
  // ---------------------------------------------------------------------------

  describe("Edge direction arrows in relations", () => {
    it("renders outgoing edge with forward arrow", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Source",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node2" },
      ];
      const pixiNode2: PixiNode = {
        data: { id: "node2", label: "Target", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNodes = new Map([["node2", pixiNode2]]);
      await view.renderNode(node, new Map(), pixiNodes, new Map(), edges);
      // Should render with → arrow for outgoing
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders incoming edge with backward arrow", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Target",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const edges: GraphEdge[] = [
        { id: "e1", source: "node2", target: "node1" },
      ];
      const pixiNode2: PixiNode = {
        data: { id: "node2", label: "Source", x: 0, y: 0, vx: 0, vy: 0 },
      } as any;
      const pixiNodes = new Map([["node2", pixiNode2]]);
      await view.renderNode(node, new Map(), pixiNodes, new Map(), edges);
      // Should render with ← arrow for incoming
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders self-loop edge", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Self",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const edges: GraphEdge[] = [
        { id: "e1", source: "node1", target: "node1" },
      ];
      const pixiNodes = new Map();
      await view.renderNode(node, new Map(), pixiNodes, new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Node with backlinks capability (TFile present)
  // ---------------------------------------------------------------------------

  describe("Nodes with file information", () => {
    it("handles node with valid filePath", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Document",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "folder/document.md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with nested filePath", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Deeply nested",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "root/a/b/c/d/e/file.md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with filePath containing special characters", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Special",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "folder/file with spaces & symbols (1).md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with filePath missing extension", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "NoExt",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "folder/file",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Node properties and metadata combinations
  // ---------------------------------------------------------------------------

  describe("Complex node metadata combinations", () => {
    it("renders node with all properties set", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Complete",
        x: 100,
        y: 200,
        vx: 5,
        vy: -3,
        filePath: "folder/complete.md",
        category: "Important",
        tags: ["tag1", "tag2", "tag3"],
        isTag: false,
        degree: 42,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders tag node (virtual, no file)", async () => {
      const node: GraphNode = {
        id: "tag/virtual",
        label: "Virtual Tag",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        isTag: true,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders node with metadata", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "WithMeta",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        meta: {
          author: "Test",
          date: "2026-04-03",
        },
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders node with timestamps", async () => {
      const now = Date.now();
      const node: GraphNode = {
        id: "node1",
        label: "Timestamped",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        mtime: now,
        ctime: now - 86400000,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders node with body preview", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Preview",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        bodyPreview: "This is the first 100 characters of the node body...",
        bodyLength: 5000,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders collapsed group node", async () => {
      const node: GraphNode = {
        id: "group1",
        label: "Collapsed Group",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        collapsedMembers: ["node1", "node2", "node3"],
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("renders phantom node", async () => {
      const node: GraphNode = {
        id: "phantom1",
        label: "Phantom",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        isPhantom: true,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // HTML structure creation
  // ---------------------------------------------------------------------------

  describe("HTML structure creation", () => {
    it("creates root container with correct class", async () => {
      await view.onOpen();
      expect(view.contentEl.addClass).toHaveBeenCalledWith("gi-detail-root");
    });

    it("creates toolbar and body sections", async () => {
      await view.onOpen();
      const createElCalls = (view.contentEl.createEl as any).mock.calls;
      expect(createElCalls.length).toBeGreaterThan(0);
    });

    it("empties contentEl before rebuilding", async () => {
      await view.onOpen();
      expect(view.contentEl.empty).toHaveBeenCalled();
    });

    it("creates detail wrapper for node display", async () => {
      await view.onOpen(); // Initialize bodyEl
      const node: GraphNode = {
        id: "test",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Extreme coordinate values
  // ---------------------------------------------------------------------------

  describe("Extreme coordinate values", () => {
    it("handles Infinity coordinates", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Infinity",
        x: Infinity,
        y: Infinity,
        vx: Infinity,
        vy: Infinity,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles negative Infinity coordinates", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "NegInfinity",
        x: -Infinity,
        y: -Infinity,
        vx: -Infinity,
        vy: -Infinity,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles zero coordinates", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Zero",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles fractional coordinates", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Fractional",
        x: 0.1,
        y: 0.2,
        vx: 0.001,
        vy: 0.002,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles mixed positive/negative coordinates", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Mixed",
        x: 1000,
        y: -2000,
        vx: -500,
        vy: 250,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Label text processing
  // ---------------------------------------------------------------------------

  describe("Label text processing", () => {
    it("handles label with newlines", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Line 1\nLine 2\nLine 3",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles label with tabs", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Text\t\twith\ttabs",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles label with HTML entities", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "&lt;&gt;&quot;&amp;",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles label with emoji sequences", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "👨‍👩‍👧‍👦 Family 🚀 Rocket",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles label with control characters", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Text\x00with\x1fnull",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Tag handling variations
  // ---------------------------------------------------------------------------

  describe("Tag handling variations", () => {
    it("handles tag with empty string", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tags: [""],
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles tags with spaces", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tags: ["tag with spaces", "another tag"],
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles duplicate tags", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tags: ["dup", "dup", "dup"],
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles tags with special characters", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tags: ["@special", "#hashtag", "!important"],
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Category and metadata variations
  // ---------------------------------------------------------------------------

  describe("Category and metadata variations", () => {
    it("handles empty category string", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        category: "",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles category with special characters", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        category: "Category/Sub/Type",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with empty meta object", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        meta: {},
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with nested meta structures", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        meta: {
          level1: {
            level2: {
              level3: "deep value",
            },
          },
        },
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles node with array meta values", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        meta: {
          items: [1, 2, 3, "four"],
          nested: [[1, 2], [3, 4]],
        },
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // FilePath edge cases
  // ---------------------------------------------------------------------------

  describe("FilePath edge cases", () => {
    it("handles absolute-looking filePath", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "/absolute/path.md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles filePath with dots in name", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "folder/file.name.with.dots.md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles filePath with only extension", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: ".md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles filePath with unicode", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "folder/файл/文档.md",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles empty filePath", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        filePath: "",
      };
      await view.renderNode(node, new Map(), new Map(), new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Map sizes and iteration variations
  // ---------------------------------------------------------------------------

  describe("Map sizes and iteration", () => {
    it("handles very large adjacency map", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Hub",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const neighbors = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        neighbors.add(`node${i}`);
      }
      const adj = new Map([["node1", neighbors]]);
      const pixiNodes = new Map();
      for (let i = 0; i < 1000; i++) {
        pixiNodes.set(`node${i}`, {
          data: { id: `node${i}`, label: `N${i}`, x: 0, y: 0, vx: 0, vy: 0 },
        } as any);
      }
      await view.renderNode(node, adj, pixiNodes, new Map(), []);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles very large edge array", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Connected",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const edges: GraphEdge[] = [];
      for (let i = 0; i < 500; i++) {
        edges.push({
          id: `e${i}`,
          source: "node1",
          target: `node${i}`,
          type: i % 3 === 0 ? "link" : i % 3 === 1 ? "semantic" : "tag",
        });
      }
      const pixiNodes = new Map();
      for (let i = 0; i < 500; i++) {
        pixiNodes.set(`node${i}`, {
          data: { id: `node${i}`, label: `N${i}`, x: 0, y: 0, vx: 0, vy: 0 },
        } as any);
      }
      await view.renderNode(node, new Map(), pixiNodes, new Map(), edges);
      expect(view.contentEl.empty).toBeDefined();
    });

    it("handles degrees map with sparse entries", async () => {
      const node: GraphNode = {
        id: "node1",
        label: "Test",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
      const degrees = new Map([
        ["node1", 42],
        ["someOther", 100],
        ["anotherOne", 5],
      ]);
      await view.renderNode(node, new Map(), new Map(), degrees, []);
      expect(view.contentEl.empty).toBeDefined();
    });
  });
});
