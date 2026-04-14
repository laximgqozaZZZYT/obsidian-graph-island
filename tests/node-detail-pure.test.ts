/**
 * Tests for src/views/NodeDetailView.ts
 *
 * Covers:
 *   - VIEW_TYPE_NODE_DETAIL constant
 *   - NodeDetailView public view-type methods (getViewType, getDisplayText, getIcon)
 *   - Private findNodeByFilePath() — iterates pixiNodes to locate a node by path
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock obsidian before importing the module under test
// ---------------------------------------------------------------------------
vi.mock("obsidian", () => {
  class Component {
    load() {}
    unload() {}
  }

  class TFile {
    path = "";
    basename = "";
    extension = "md";
  }

  // ItemView must call super() so derived class property-fields work correctly
  class ItemView extends Component {
    app: any;
    containerEl: any;
    contentEl: any;

    constructor(_leaf?: any) {
      super();
      this.app = {
        workspace: { on: () => ({}), trigger: () => {} },
        vault: {
          getAbstractFileByPath: (_p: string) => null,
          cachedRead: async () => "",
        },
        metadataCache: {
          getFileCache: () => null,
          resolvedLinks: {},
        },
      };
      this.containerEl = { empty: () => {}, createEl: () => ({}) };
      this.contentEl = {
        empty: () => {},
        createEl: (_tag: string, _opts?: any) => ({
          empty: () => {},
          createEl: () => ({}),
          addClass: () => {},
          setAttribute: () => {},
          addEventListener: () => {},
        }),
        addClass: () => {},
      };
    }

    registerEvent(_e: any) {}
  }

  return {
    ItemView,
    Component,
    TFile,
    WorkspaceLeaf: class {},
    MarkdownRenderer: { render: vi.fn().mockResolvedValue(undefined) },
    setIcon: () => {},
  };
});

import {
  VIEW_TYPE_NODE_DETAIL,
  NodeDetailView,
} from "../src/views/NodeDetailView";

// ---------------------------------------------------------------------------
// Helper: create a stub NodeDetailView instance
// ---------------------------------------------------------------------------

function makeView(): NodeDetailView {
  return new NodeDetailView(null as any);
}

// ---------------------------------------------------------------------------
// Constant
// ---------------------------------------------------------------------------

describe("VIEW_TYPE_NODE_DETAIL", () => {
  it("has the expected string value", () => {
    expect(VIEW_TYPE_NODE_DETAIL).toBe("graph-node-detail");
  });
});

// ---------------------------------------------------------------------------
// Public view-type methods
// ---------------------------------------------------------------------------

describe("NodeDetailView public methods", () => {
  it("getViewType() returns the registered view type", () => {
    const view = makeView();
    expect(view.getViewType()).toBe("graph-node-detail");
  });

  it("getDisplayText() returns a non-empty string", () => {
    const view = makeView();
    expect(view.getDisplayText()).toBeTruthy();
    expect(typeof view.getDisplayText()).toBe("string");
  });

  it("getIcon() returns git-fork", () => {
    const view = makeView();
    expect(view.getIcon()).toBe("git-fork");
  });
});

// ---------------------------------------------------------------------------
// findNodeByFilePath — private method
// ---------------------------------------------------------------------------

describe("NodeDetailView findNodeByFilePath", () => {
  let view: NodeDetailView;
  let findByPath: (filePath: string) => string | null;

  beforeEach(() => {
    view = makeView();
    // Inject fake pixiNodes map directly
    (view as any).pixiNodes = new Map([
      ["nodeA", { data: { filePath: "notes/A.md", label: "A" } }],
      ["nodeB", { data: { filePath: "notes/B.md", label: "B" } }],
      ["nodeC", { data: { filePath: undefined, label: "C" } }],
    ]);
    findByPath = (view as any).findNodeByFilePath.bind(view);
  });

  it("returns the node id when filePath matches", () => {
    expect(findByPath("notes/A.md")).toBe("nodeA");
    expect(findByPath("notes/B.md")).toBe("nodeB");
  });

  it("returns null when no node has the given filePath", () => {
    expect(findByPath("notes/missing.md")).toBeNull();
  });

  it("returns null for empty string path", () => {
    expect(findByPath("")).toBeNull();
  });

  it("returns null for node with undefined filePath", () => {
    // nodeC has no filePath — should not be returned for any path
    expect(findByPath("notes/C.md")).toBeNull();
  });

  it("returns null when pixiNodes is empty", () => {
    (view as any).pixiNodes = new Map();
    expect(findByPath("notes/A.md")).toBeNull();
  });

  it("returns first matching node id in iteration order", () => {
    // Add a duplicate path — only the first should be returned
    (view as any).pixiNodes = new Map([
      ["first", { data: { filePath: "dup.md", label: "First" } }],
      ["second", { data: { filePath: "dup.md", label: "Second" } }],
    ]);
    expect(findByPath("dup.md")).toBe("first");
  });
});
