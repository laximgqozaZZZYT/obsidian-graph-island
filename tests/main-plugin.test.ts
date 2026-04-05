import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// ---------------------------------------------------------------------------
// activateView - opens graph in new tab + ensures detail pane
// ---------------------------------------------------------------------------
describe("activateView", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("opens graph view in a tab leaf", async () => {
    await plugin.activateView();
    const leaf = (plugin as any).app.workspace.getLeaf.mock.results[0].value;
    expect(leaf.setViewState).toHaveBeenCalledWith({
      type: "graph-view",
      active: true,
    });
  });

  it("reveals the leaf to user", async () => {
    await plugin.activateView();
    expect((plugin as any).app.workspace.revealLeaf).toHaveBeenCalled();
  });

  it("calls ensureDetailPane", async () => {
    const ensureDetailPaneSpy = vi.spyOn(plugin as any, "ensureDetailPane");
    await plugin.activateView();
    expect(ensureDetailPaneSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// openSubgraphInNewTab - splits view with subgraph filters
// ---------------------------------------------------------------------------
describe("openSubgraphInNewTab", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it("opens a new split view", async () => {
    await plugin.openSubgraphInNewTab(["node1", "node2"], "force-layout");
    expect((plugin as any).app.workspace.getLeaf).toHaveBeenCalledWith("split");
  });

  it("sets subgraph config after delay", async () => {
    await plugin.openSubgraphInNewTab(["node1", "node2"], "force-layout");
    const leaf = (plugin as any).app.workspace.getLeaf.mock.results[0].value;
    leaf.view = { panel: {} };

    vi.advanceTimersByTime(100);

    expect(leaf.view.panel.subgraphNodeIds).toEqual(["node1", "node2"]);
    expect(leaf.view.panel.viewMode).toBe("force-layout");
    expect(leaf.view.panel.multiSelectNodeIds).toEqual([]);
    expect(leaf.view.panel.subgraphStack).toEqual([]);
  });

  it("triggers render after subgraph config", async () => {
    await plugin.openSubgraphInNewTab(["node1"], "timeline");
    const leaf = (plugin as any).app.workspace.getLeaf.mock.results[0].value;
    leaf.view = { panel: {}, doRender: vi.fn(), rawData: null };

    vi.advanceTimersByTime(100);

    expect(leaf.view.doRender).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ribbon icon + command palette callbacks
// ---------------------------------------------------------------------------
describe("ribbon icon + commands", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("ribbon icon callback activates view", async () => {
    const activateViewSpy = vi.spyOn(plugin, "activateView");
    await plugin.onload();
    const ribbonCalls = (plugin as any).addRibbonIcon.mock.calls;
    expect(ribbonCalls.length).toBeGreaterThan(0);

    const callback = ribbonCalls[0][2];
    callback();
    expect(activateViewSpy).toHaveBeenCalled();
  });

  it("open-graph-view command activates view", async () => {
    const activateViewSpy = vi.spyOn(plugin, "activateView");
    await plugin.onload();

    const openGraphCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "open-graph-view",
    )[0];
    openGraphCmd.callback();
    expect(activateViewSpy).toHaveBeenCalled();
  });

  it("embed-graph-in-note command shows toast when no graph", async () => {
    const { showToast } = await import("../src/utils/toast");
    await plugin.onload();

    const embedCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "embed-graph-in-note",
    )[0];
    await embedCmd.editorCallback();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 5000);
  });

  it("mode commands access active graph view", async () => {
    await plugin.onload();

    const graphViewMock = { applyPresetByKey: vi.fn() };
    (plugin as any).app.workspace.getLeavesOfType.mockReturnValue([
      { view: graphViewMock },
    ]);

    const exploreCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-mode-explore",
    )[0];
    exploreCmd.callback();
    expect(graphViewMock.applyPresetByKey).toHaveBeenCalledWith("explore");

    const analyzeCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-mode-analyze",
    )[0];
    analyzeCmd.callback();
    expect(graphViewMock.applyPresetByKey).toHaveBeenCalledWith("analyze");

    const writeCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-mode-write",
    )[0];
    writeCmd.callback();
    expect(graphViewMock.applyPresetByKey).toHaveBeenCalledWith("write");
  });
});

// ---------------------------------------------------------------------------
// focus + search + statistics + analysis commands
// ---------------------------------------------------------------------------
describe("graph control commands", () => {
  let plugin: GraphViewsPlugin;
  let graphViewMock: any;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
    graphViewMock = {
      panel: {},
      markDirty: vi.fn(),
      doRender: vi.fn(),
      _toggleHelpOverlay: vi.fn(),
      copyGraphToClipboard: vi.fn(),
      exportFullGraph: vi.fn(),
      exportGraphAsCSV: vi.fn(),
      exportGraphAsMermaid: vi.fn(),
      panelEl: {},
    };
    (plugin as any).app.workspace.getLeavesOfType.mockReturnValue([
      { view: graphViewMock },
    ]);
  });

  it("focus-toggle command toggles focusMode", async () => {
    await plugin.onload();
    const focusCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-focus-toggle",
    )[0];

    graphViewMock.panel.focusMode = false;
    focusCmd.callback();
    expect(graphViewMock.panel.focusMode).toBe(true);
    expect(graphViewMock.markDirty).toHaveBeenCalled();
  });

  it("toggle-stats command toggles showGraphStats", async () => {
    await plugin.onload();
    const statsCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-toggle-stats",
    )[0];

    graphViewMock.panel.showGraphStats = false;
    statsCmd.callback();
    expect(graphViewMock.panel.showGraphStats).toBe(true);
    expect(graphViewMock.markDirty).toHaveBeenCalled();
  });

  it("toggle-arrows command toggles showArrows", async () => {
    await plugin.onload();
    const arrowsCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-toggle-arrows",
    )[0];

    graphViewMock.panel.showArrows = false;
    arrowsCmd.callback();
    expect(graphViewMock.panel.showArrows).toBe(true);
    expect(graphViewMock.markDirty).toHaveBeenCalled();
  });

  it("analysis-all command sets analysisOverlay = all", async () => {
    await plugin.onload();
    const allCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-analysis-all",
    )[0];
    allCmd.callback();
    expect(graphViewMock.panel.analysisOverlay).toBe("all");
    expect(graphViewMock.doRender).toHaveBeenCalled();
  });

  it("analysis-off command sets analysisOverlay = off", async () => {
    await plugin.onload();
    const offCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-analysis-off",
    )[0];
    offCmd.callback();
    expect(graphViewMock.panel.analysisOverlay).toBe("off");
    expect(graphViewMock.doRender).toHaveBeenCalled();
  });

  it("help command calls _toggleHelpOverlay", async () => {
    await plugin.onload();
    const helpCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-help",
    )[0];
    helpCmd.callback();
    expect(graphViewMock._toggleHelpOverlay).toHaveBeenCalled();
  });

  it("export commands call appropriate methods", async () => {
    await plugin.onload();

    const pngCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-copy-png",
    )[0];
    pngCmd.callback();
    expect(graphViewMock.copyGraphToClipboard).toHaveBeenCalled();

    const jsonCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-export-full",
    )[0];
    jsonCmd.callback();
    expect(graphViewMock.exportFullGraph).toHaveBeenCalled();

    const csvCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-export-csv",
    )[0];
    csvCmd.callback();
    expect(graphViewMock.exportGraphAsCSV).toHaveBeenCalled();

    const mermaidCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-export-mermaid",
    )[0];
    mermaidCmd.callback();
    expect(graphViewMock.exportGraphAsMermaid).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// search-focus command
// ---------------------------------------------------------------------------
describe("search-focus command", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("search-focus command is registered", async () => {
    await plugin.onload();

    const focusSearchCmd = (plugin as any).addCommand.mock.calls.find(
      (c: any) => c[0].id === "graph-search-focus",
    );
    expect(focusSearchCmd).toBeDefined();
    expect(focusSearchCmd[0].name).toBe("Graph: Focus search bar");
  });
});

// ---------------------------------------------------------------------------
// Pane management (detail + compare)
// ---------------------------------------------------------------------------
describe("pane management", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("ensureDetailPane opens detail pane if missing", async () => {
    (plugin as any).app.workspace.getLeavesOfType.mockReturnValue([]);
    (plugin as any).app.workspace.getRightLeaf.mockReturnValue({
      setViewState: vi.fn(),
    });

    await plugin.activateView();

    expect((plugin as any).app.workspace.getRightLeaf).toHaveBeenCalledWith(
      false,
    );
  });

  it("registerEvent is called to register compare event", async () => {
    await plugin.onload();

    const registerEventCalls = (plugin as any).registerEvent.mock.calls;
    expect(registerEventCalls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// markdown code block processor
// ---------------------------------------------------------------------------
describe("markdown code block processor", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("registers graph-island code block processor", async () => {
    await plugin.onload();
    expect(
      (plugin as any).registerMarkdownCodeBlockProcessor,
    ).toHaveBeenCalledWith("graph-island", expect.any(Function));
  });

  it("processor callback is a function", async () => {
    await plugin.onload();
    const processorCall = (plugin as any)
      .registerMarkdownCodeBlockProcessor.mock.calls[0];
    const processor = processorCall[1];
    expect(typeof processor).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// saveSettings - notifies all graph views to rebuild
// ---------------------------------------------------------------------------
describe("saveSettings", () => {
  let plugin: GraphViewsPlugin;

  beforeEach(() => {
    plugin = new GraphViewsPlugin() as any;
  });

  it("notifies graph views to rebuild when settings change", async () => {
    const graphView1 = { rawData: { nodes: [] }, doRender: vi.fn() };
    const graphView2 = { rawData: { nodes: [] }, doRender: vi.fn() };
    (plugin as any).app.workspace.getLeavesOfType.mockReturnValue([
      { view: graphView1 },
      { view: graphView2 },
    ]);

    await plugin.saveSettings();

    expect(graphView1.rawData).toBeNull();
    expect(graphView2.rawData).toBeNull();
    expect(graphView1.doRender).toHaveBeenCalled();
    expect(graphView2.doRender).toHaveBeenCalled();
  });

  it("ignores views without rawData property", async () => {
    const graphView = {}; // no rawData property
    (plugin as any).app.workspace.getLeavesOfType.mockReturnValue([
      { view: graphView },
    ]);

    // Should not throw
    await expect(plugin.saveSettings()).resolves.not.toThrow();
  });
});
