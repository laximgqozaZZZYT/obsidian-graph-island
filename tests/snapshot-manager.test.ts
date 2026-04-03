import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Minimal global stubs
// ---------------------------------------------------------------------------
(globalThis as any).window = globalThis;
(globalThis as any).window.prompt = vi.fn(() => null);

// Mock obsidian
vi.mock("obsidian", () => ({
  Menu: class {
    items: any[] = [];
    addItem(cb: (item: any) => void) {
      const item = {
        setTitle: vi.fn().mockReturnThis(),
        setIcon: vi.fn().mockReturnThis(),
        onClick: vi.fn().mockReturnThis(),
      };
      cb(item);
      this.items.push(item);
      return this;
    }
    addSeparator() { return this; }
    showAtMouseEvent = vi.fn();
  },
}));

vi.mock("../src/i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../src/utils/toast", () => ({
  showToast: vi.fn(),
}));

vi.mock("../src/utils/snapshot", () => ({
  captureSnapshot: vi.fn((_data: any, name: string, ctx: any) => ({
    name,
    createdAt: new Date().toISOString(),
    nodes: [{ id: "a", metaHash: "abc" }],
    edges: [{ source: "a", target: "b", type: "link" }],
    context: { ...ctx, nodeCount: 1, edgeCount: 1 },
  })),
  computeSnapshotDiff: vi.fn(() => ({
    addedNodeIds: new Set(["new-node"]),
    removedNodes: [],
    changedNodeIds: new Set(),
    addedEdgeKeys: new Set(),
    removedEdges: [],
  })),
  computeSnapshotToSnapshotDiff: vi.fn(() => ({
    addedNodeIds: new Set(),
    removedNodes: [],
    changedNodeIds: new Set(),
    addedEdgeKeys: new Set(),
    removedEdges: [],
  })),
}));

vi.mock("../src/views/DiffOverlay", () => ({
  buildTimelineEntries: vi.fn((snaps: any[]) =>
    snaps.map((s: any, i: number) => ({
      name: s.name,
      createdAt: s.createdAt,
      nodeCount: s.context.nodeCount,
      edgeCount: s.context.edgeCount,
      nodeDelta: i === 0 ? undefined : 0,
    })),
  ),
  formatDelta: vi.fn(() => ({ text: "---", color: "muted" })),
  formatSnapshotDate: vi.fn(() => "4/2 12:00"),
}));

import {
  showSnapshotMenu,
  saveSnapshot,
  compareWithSnapshot,
  deleteSnapshot,
  showSnapshotTimeline,
  clearDiffOverlay,
  createAutoSnapshot,
  AUTO_SNAP_PREFIX,
  AUTO_SNAP_MAX,
} from "../src/views/SnapshotManager";
import type { SnapshotHost } from "../src/views/SnapshotManager";
import { showToast } from "../src/utils/toast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockSnapshot(name: string, nodeCount = 5, edgeCount = 3) {
  return {
    name,
    createdAt: new Date().toISOString(),
    nodes: Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i}`, metaHash: `h${i}` })),
    edges: Array.from({ length: edgeCount }, (_, i) => ({ source: `n${i}`, target: `n${i + 1}`, type: "link" })),
    context: { layout: "force", searchQuery: "", groupBy: "", nodeCount, edgeCount },
  };
}

function createMockDiffOverlay() {
  return {
    isActive: vi.fn(() => false),
    activate: vi.fn(),
    deactivate: vi.fn(),
    buildDiffList: vi.fn(),
    removeDiffList: vi.fn(),
  };
}

function createMockHost(overrides: Partial<SnapshotHost> = {}): SnapshotHost {
  return {
    containerEl: {
      querySelector: vi.fn(() => ({
        querySelector: vi.fn(() => null),
        remove: vi.fn(),
        createDiv: vi.fn(() => ({
          createDiv: vi.fn(() => ({
            createEl: vi.fn(() => ({
              addEventListener: vi.fn(),
              style: {},
            })),
            createDiv: vi.fn(() => ({
              createEl: vi.fn(() => ({ style: {} })),
              style: {},
            })),
            style: {},
            addEventListener: vi.fn(),
          })),
          createEl: vi.fn(() => ({
            addEventListener: vi.fn(),
            style: {},
          })),
          style: {},
        })),
      })),
    } as any,
    pixiApp: {
      markNeedsRender: vi.fn(),
    } as any,
    pixiNodes: new Map([
      ["node-a", { data: { id: "node-a" } }],
      ["node-b", { data: { id: "node-b" } }],
    ]),
    plugin: {
      settings: {
        snapshots: [],
        autoSnapshotIntervalMin: 5,
      },
      saveSettings: vi.fn(async () => {}),
    },
    panel: {
      searchQuery: "",
      clusterGroupRules: [{ groupBy: "tag:?" }],
    },
    diffOverlay: createMockDiffOverlay() as any,
    currentLayout: "force",
    getGraphData: vi.fn(() => ({
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [{ source: "a", target: "b", type: "link" }],
    })),
    getNodeLabel: vi.fn((id: string) => id),
    panToNode: vi.fn(),
    setHighlightedNodeId: vi.fn(),
    applyHover: vi.fn(),
    wakeRenderLoop: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("SnapshotManager constants", () => {
  it("AUTO_SNAP_PREFIX is '[auto] '", () => {
    expect(AUTO_SNAP_PREFIX).toBe("[auto] ");
  });

  it("AUTO_SNAP_MAX is 10", () => {
    expect(AUTO_SNAP_MAX).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// showSnapshotMenu
// ---------------------------------------------------------------------------
describe("showSnapshotMenu", () => {
  it("does not throw with empty snapshots", () => {
    const host = createMockHost();
    const evt = { clientX: 0, clientY: 0 } as MouseEvent;
    expect(() => showSnapshotMenu(host, evt)).not.toThrow();
  });

  it("does not throw with existing snapshots", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = [createMockSnapshot("S1"), createMockSnapshot("S2")];
    const evt = { clientX: 0, clientY: 0 } as MouseEvent;
    expect(() => showSnapshotMenu(host, evt)).not.toThrow();
  });

  it("does not throw when diff is active", () => {
    const diffOverlay = createMockDiffOverlay();
    diffOverlay.isActive.mockReturnValue(true);
    const host = createMockHost({ diffOverlay: diffOverlay as any });
    const evt = { clientX: 0, clientY: 0 } as MouseEvent;
    expect(() => showSnapshotMenu(host, evt)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// saveSnapshot
// ---------------------------------------------------------------------------
describe("saveSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows limit toast when 10 snapshots already exist", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = Array.from({ length: 10 }, (_, i) =>
      createMockSnapshot(`S${i}`)
    );
    saveSnapshot(host);
    expect(vi.mocked(showToast)).toHaveBeenCalledWith("snapshot.limitReached", 5000);
  });

  it("does nothing when prompt returns null (cancel)", () => {
    (globalThis as any).window.prompt = vi.fn(() => null);
    const host = createMockHost();
    saveSnapshot(host);
    expect(host.plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("saves snapshot when name is provided", () => {
    let callCount = 0;
    (globalThis as any).window.prompt = vi.fn(() => {
      callCount++;
      if (callCount === 1) return "My Snapshot";
      return "test notes";
    });
    const host = createMockHost();

    saveSnapshot(host);

    expect(host.getGraphData).toHaveBeenCalled();
    expect(host.plugin.saveSettings).toHaveBeenCalled();
    expect(host.plugin.settings.snapshots!.length).toBe(1);
    expect(host.plugin.settings.snapshots![0].name).toBe("My Snapshot");
  });

  it("saves snapshot without notes when notes prompt returns empty", () => {
    let callCount = 0;
    (globalThis as any).window.prompt = vi.fn(() => {
      callCount++;
      if (callCount === 1) return "No Notes Snap";
      return "";
    });
    const host = createMockHost();

    saveSnapshot(host);
    expect(host.plugin.settings.snapshots!.length).toBe(1);
  });

  it("initializes snapshots array if undefined", () => {
    let callCount = 0;
    (globalThis as any).window.prompt = vi.fn(() => {
      callCount++;
      if (callCount === 1) return "Init Snap";
      return null;
    });
    const host = createMockHost();
    host.plugin.settings.snapshots = undefined;

    saveSnapshot(host);
    expect(host.plugin.settings.snapshots).toBeDefined();
    expect(host.plugin.settings.snapshots!.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// compareWithSnapshot
// ---------------------------------------------------------------------------
describe("compareWithSnapshot", () => {
  it("activates diff overlay and requests redraw", () => {
    const host = createMockHost();
    const snapshot = createMockSnapshot("Compare Me");
    compareWithSnapshot(host, snapshot as any);

    expect(host.diffOverlay.activate).toHaveBeenCalled();
    expect(host.pixiApp!.markNeedsRender).toHaveBeenCalled();
    expect(host.wakeRenderLoop).toHaveBeenCalled();
  });

  it("builds diff list when canvas area exists", () => {
    const host = createMockHost();
    const snapshot = createMockSnapshot("Compare Me");
    compareWithSnapshot(host, snapshot as any);
    expect(host.diffOverlay.buildDiffList).toHaveBeenCalled();
  });

  it("skips diff list when canvas area is not found", () => {
    const host = createMockHost({
      containerEl: { querySelector: vi.fn(() => null) } as any,
    });
    const snapshot = createMockSnapshot("No Canvas");
    compareWithSnapshot(host, snapshot as any);
    expect(host.diffOverlay.buildDiffList).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteSnapshot
// ---------------------------------------------------------------------------
describe("deleteSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes snapshot at valid index", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = [
      createMockSnapshot("S0"),
      createMockSnapshot("S1"),
      createMockSnapshot("S2"),
    ];

    deleteSnapshot(host, 1);

    expect(host.plugin.settings.snapshots!.length).toBe(2);
    expect(host.plugin.settings.snapshots![0].name).toBe("S0");
    expect(host.plugin.settings.snapshots![1].name).toBe("S2");
    expect(host.plugin.saveSettings).toHaveBeenCalled();
  });

  it("does nothing for negative index", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = [createMockSnapshot("S0")];
    deleteSnapshot(host, -1);
    expect(host.plugin.settings.snapshots!.length).toBe(1);
  });

  it("does nothing for out-of-range index", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = [createMockSnapshot("S0")];
    deleteSnapshot(host, 5);
    expect(host.plugin.settings.snapshots!.length).toBe(1);
  });

  it("handles empty snapshots array", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = [];
    deleteSnapshot(host, 0);
    expect(host.plugin.settings.snapshots!.length).toBe(0);
  });

  it("shows toast with deleted snapshot name", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = [createMockSnapshot("Deleted One")];
    deleteSnapshot(host, 0);
    expect(vi.mocked(showToast)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// showSnapshotTimeline
// ---------------------------------------------------------------------------
describe("showSnapshotTimeline", () => {
  it("does nothing with fewer than 2 snapshots", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = [createMockSnapshot("S0")];
    showSnapshotTimeline(host);
  });

  it("does nothing when canvas area is not found", () => {
    const host = createMockHost({
      containerEl: { querySelector: vi.fn(() => null) } as any,
    });
    host.plugin.settings.snapshots = [createMockSnapshot("S0"), createMockSnapshot("S1")];
    showSnapshotTimeline(host);
  });
});

// ---------------------------------------------------------------------------
// clearDiffOverlay
// ---------------------------------------------------------------------------
describe("clearDiffOverlay", () => {
  it("deactivates overlay and removes diff list", () => {
    const host = createMockHost();
    clearDiffOverlay(host);

    expect(host.diffOverlay.deactivate).toHaveBeenCalled();
    expect(host.diffOverlay.removeDiffList).toHaveBeenCalled();
    expect(host.pixiApp!.markNeedsRender).toHaveBeenCalled();
    expect(host.wakeRenderLoop).toHaveBeenCalled();
  });

  it("works when no canvas area", () => {
    const host = createMockHost({
      containerEl: { querySelector: vi.fn(() => null) } as any,
    });
    clearDiffOverlay(host);
    expect(host.diffOverlay.deactivate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createAutoSnapshot
// ---------------------------------------------------------------------------
describe("createAutoSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when pixiNodes is empty", () => {
    const host = createMockHost({ pixiNodes: new Map() });
    createAutoSnapshot(host);
    expect(host.plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("creates an auto-snapshot with prefixed name", () => {
    const host = createMockHost();
    createAutoSnapshot(host);

    expect(host.plugin.settings.snapshots!.length).toBe(1);
    expect(host.plugin.settings.snapshots![0].name).toContain(AUTO_SNAP_PREFIX);
    expect(host.plugin.saveSettings).toHaveBeenCalled();
  });

  it("removes oldest auto-snapshot when at limit", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = Array.from({ length: AUTO_SNAP_MAX }, (_, i) => ({
      ...createMockSnapshot(`${AUTO_SNAP_PREFIX}2026-01-0${i + 1} 12:00`),
      name: `${AUTO_SNAP_PREFIX}2026-01-0${i + 1} 12:00`,
    }));

    createAutoSnapshot(host);

    expect(host.plugin.settings.snapshots!.length).toBe(AUTO_SNAP_MAX);
    const last = host.plugin.settings.snapshots![host.plugin.settings.snapshots!.length - 1];
    expect(last.name).toContain(AUTO_SNAP_PREFIX);
  });

  it("does not remove manual snapshots when pruning auto ones", () => {
    const host = createMockHost();
    const manual = createMockSnapshot("Manual Snap");
    const autoSnaps = Array.from({ length: AUTO_SNAP_MAX }, (_, i) => ({
      ...createMockSnapshot(`${AUTO_SNAP_PREFIX}auto-${i}`),
      name: `${AUTO_SNAP_PREFIX}auto-${i}`,
    }));
    host.plugin.settings.snapshots = [manual, ...autoSnaps];

    createAutoSnapshot(host);

    const names = host.plugin.settings.snapshots!.map(s => s.name);
    expect(names).toContain("Manual Snap");
  });

  it("initializes snapshots array if undefined", () => {
    const host = createMockHost();
    host.plugin.settings.snapshots = undefined;
    createAutoSnapshot(host);
    expect(host.plugin.settings.snapshots).toBeDefined();
    expect(host.plugin.settings.snapshots!.length).toBe(1);
  });

  it("auto-snapshot name includes date prefix", () => {
    const host = createMockHost();
    createAutoSnapshot(host);
    const snap = host.plugin.settings.snapshots![0];
    expect(snap.name.startsWith(AUTO_SNAP_PREFIX)).toBe(true);
    expect(snap.name.length).toBeGreaterThan(AUTO_SNAP_PREFIX.length);
  });
});
