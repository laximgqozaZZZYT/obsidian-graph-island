import { Plugin } from "obsidian";
import { GraphViewsSettingTab } from "./settings";
import { GraphViewContainer, VIEW_TYPE_GRAPH } from "./views/GraphViewContainer";
import { NodeDetailView, VIEW_TYPE_NODE_DETAIL } from "./views/NodeDetailView";
import { NodeComparisonView, VIEW_TYPE_NODE_COMPARE } from "./views/NodeComparisonView";
import { EVENT_COMPARE_NODES } from "./constants";
import { DEFAULT_SETTINGS, type GraphViewsSettings } from "./types";
import { detectTagRelations } from "./utils/tag-relation-presets";

export default class GraphViewsPlugin extends Plugin {
  settings: GraphViewsSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // Auto-detect tag relationships on first load (when tagRelations is empty)
    this.app.workspace.onLayoutReady(() => {
      this.autoDetectTagRelationsIfNeeded();
    });

    this.registerView(
      VIEW_TYPE_GRAPH,
      (leaf) => new GraphViewContainer(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_NODE_DETAIL,
      (leaf) => new NodeDetailView(leaf)
    );

    this.registerView(
      VIEW_TYPE_NODE_COMPARE,
      (leaf) => new NodeComparisonView(leaf)
    );

    // 比較イベント発火時に比較パネルを自動オープン
    this.registerEvent(
      this.app.workspace.on(EVENT_COMPARE_NODES as any, (data: any) => {
        if (data) this.ensureComparePane();
      })
    );

    this.addRibbonIcon("git-fork", "Graph Island", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-graph-view",
      name: "Open graph view",
      callback: () => {
        this.activateView();
      },
    });

    this.addSettingTab(new GraphViewsSettingTab(this.app, this));

    // Code block processor for embedded mini-graphs in notes
    this.registerMarkdownCodeBlockProcessor("graph-island", (source, el, ctx) => {
      import("./views/EmbeddedGraphRenderer").then(({ renderEmbeddedGraph }) => {
        renderEmbeddedGraph(el, source, this.app, this.settings);
      }).catch((e) => {
        el.createDiv({ cls: "gi-embed-error", text: "Graph Island: render failed" });
        console.error("Graph Island embed error:", e);
      });
    });

  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({
      type: VIEW_TYPE_GRAPH,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);

    // Open the detail pane in the right sidebar if not already open
    this.ensureDetailPane();
  }

  /**
   * On first load, scan the vault to detect tag co-occurrence patterns
   * and generate tag-to-tag relationships as a starting preset.
   * Runs only when ontology.tagRelations is empty (never overwrites user edits).
   */
  private async autoDetectTagRelationsIfNeeded() {
    const ontology = this.settings.ontology;
    if (!ontology || (ontology.tagRelations && ontology.tagRelations.length > 0)) {
      return; // already has relations — respect user's configuration
    }

    const detected = detectTagRelations(this.app);
    if (detected.length === 0) return;

    if (!this.settings.ontology) {
      this.settings.ontology = { ...DEFAULT_SETTINGS.ontology };
    }
    this.settings.ontology.tagRelations = detected;
    await this.saveSettings();

    console.info(`Graph Island: auto-detected ${detected.length} tag relationships from vault`);
  }

  private ensureDetailPane() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NODE_DETAIL);
    if (existing.length > 0) return;

    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      rightLeaf.setViewState({ type: VIEW_TYPE_NODE_DETAIL, active: true });
    }
  }

  /** 比較パネルが未オープンなら右サイドバーに開く */
  private ensureComparePane() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NODE_COMPARE);
    if (existing.length > 0) return;

    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      rightLeaf.setViewState({ type: VIEW_TYPE_NODE_COMPARE, active: true });
    }
  }
}
