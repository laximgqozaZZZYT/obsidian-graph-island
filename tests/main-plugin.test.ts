import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock obsidian
vi.mock("obsidian", () => {
  const leaves: any[] = [];
  return {
    Plugin: class {
      app = {
        workspace: {
          getLeavesOfType: vi.fn(() => leaves),
          getLeaf: vi.fn(() => ({
            setViewState: vi.fn(async () => {}),
            view: {},
          })),
          getRightLeaf: vi.fn(() => ({
            setViewState: vi.fn(async () => {}),
          })),
          revealLeaf: vi.fn(),
          onLayoutReady: vi.fn((cb: () => void) => cb()),
          on: vi.fn(() => ({ unload: vi.fn() })),
        },
        vault: {
          getAbstractFileByPath: vi.fn(() => null),
        },
        metadataCache: {
          getFileCache: vi.fn(() => null),
        },
      };
      manifest = { id: "graph-island", name: "Graph Island" };
      loadData = vi.fn(async () => null);
      saveData = vi.fn(async () => {});
      registerView = vi.fn();
      registerEvent = vi.fn();
      addRibbonIcon = vi.fn();
      addCommand = vi.fn();
      addSettingTab = vi.fn();
      registerMarkdownCodeBlockProcessor = vi.fn();
    },
    MarkdownView: class {},
    Notice: class {},
  };
});

// Mock settings
vi.mock("../src/settings", () => ({
  GraphViewsSettingTab: class {},
}));

// Mock views
vi.mock("../src/views/GraphViewContainer", () => ({
  GraphViewContainer: class {},
  VIEW_TYPE_GRAPH: "graph-view",
}));
vi.mock("../src/views/NodeDetailView", () => ({
  NodeDetailView: class {},
  VIEW_TYPE_NODE_DETAIL: "node-detail",
}));
vi.mock("../src/views/NodeComparisonView", () => ({
  NodeComparisonView: class {},
  VIEW_TYPE_NODE_COMPARE: "node-compare",
}));

// Mock utilities
vi.mock("../src/utils/tag-relation-presets", () => ({
  detectTagRelations: vi.fn(() => []),
}));
vi.mock("../src/i18n", () => ({
  t: (key: string) => key,
}));
vi.mock("../src/utils/toast", () => ({
  showToast: vi.fn(),
}));

import GraphViewsPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types";
import { detectTagRelations } from "../src/utils/tag-relation-presets";

// ---------------------------------------------------------------------------
// Plugin initialization
// ---------------------------------------------------------------------------
describe("GraphViewsPlugin", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("has DEFAULT_SETTINGS as initial settings", () => {
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("onload registers views", async () => {
    await plugin.onload();
    expect((plugin as any).registerView).toHaveBeenCalledTimes(3);
  });

  it("onload registers ribbon icon", async () => {
    await plugin.onload();
    expect((plugin as any).addRibbonIcon).toHaveBeenCalledWith(
      "git-fork",
      "Graph Island",
      expect.any(Function),
    );
  });

  it("onload registers multiple commands", async () => {
    await plugin.onload();
    // At least: open-graph-view, embed-graph-in-note, explore, analyze, write,
    // focus-toggle, search-focus, toggle-stats, toggle-arrows, analysis-all,
    // analysis-off, help, copy-png, export-full, export-csv, export-mermaid
    expect((plugin as any).addCommand.mock.calls.length).toBeGreaterThanOrEqual(12);
  });

  it("onload registers settings tab", async () => {
    await plugin.onload();
    expect((plugin as any).addSettingTab).toHaveBeenCalledTimes(1);
  });

  it("onload registers markdown code block processor", async () => {
    await plugin.onload();
    expect((plugin as any).registerMarkdownCodeBlockProcessor).toHaveBeenCalledWith(
      "graph-island",
      expect.any(Function),
    );
  });

  it("command IDs are unique", async () => {
    await plugin.onload();
    const ids = (plugin as any).addCommand.mock.calls.map((c: any) => c[0].id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all commands have a name", async () => {
    await plugin.onload();
    for (const [cmd] of (plugin as any).addCommand.mock.calls) {
      expect(cmd.name, `command ${cmd.id} should have a name`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// loadSettings / saveSettings
// ---------------------------------------------------------------------------
describe("settings persistence", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("loadSettings merges saved data with defaults", async () => {
    (plugin as any).loadData.mockResolvedValue({ nodeSize: 42 });
    await plugin.loadSettings();
    expect(plugin.settings.nodeSize).toBe(42);
    // Other fields from DEFAULT_SETTINGS should still exist
    expect(plugin.settings.metadataFields).toEqual(DEFAULT_SETTINGS.metadataFields);
  });

  it("loadSettings uses defaults when no saved data", async () => {
    (plugin as any).loadData.mockResolvedValue(null);
    await plugin.loadSettings();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("saveSettings calls saveData", async () => {
    await plugin.saveSettings();
    expect((plugin as any).saveData).toHaveBeenCalledWith(plugin.settings);
  });
});

// ---------------------------------------------------------------------------
// autoDetectTagRelationsIfNeeded
// ---------------------------------------------------------------------------
describe("autoDetectTagRelationsIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectTagRelations).mockReturnValue([]);
  });

  it("skips when tagRelations already has entries", async () => {
    const plugin = new GraphViewsPlugin() as any;
    plugin.settings.ontology.tagRelations = [{ source: "a", target: "b", type: "inheritance" }];

    await plugin.onload();
    expect(vi.mocked(detectTagRelations)).not.toHaveBeenCalled();
  });

  it("detects and saves when tagRelations is empty", async () => {
    vi.mocked(detectTagRelations).mockReturnValue([{ source: "x", target: "y", type: "inheritance" }] as any);

    const plugin = new GraphViewsPlugin() as any;
    plugin.settings.ontology.tagRelations = [];

    await plugin.onload();
    expect(vi.mocked(detectTagRelations)).toHaveBeenCalled();
    expect(plugin.settings.ontology.tagRelations.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// View type registration
// ---------------------------------------------------------------------------
describe("view type constants", () => {
  it("registers graph-view type", async () => {
    const plugin = new GraphViewsPlugin() as any;
    await plugin.onload();

    const viewTypes = plugin.registerView.mock.calls.map((c: any) => c[0]);
    expect(viewTypes).toContain("graph-view");
    expect(viewTypes).toContain("node-detail");
    expect(viewTypes).toContain("node-compare");
  });
});
