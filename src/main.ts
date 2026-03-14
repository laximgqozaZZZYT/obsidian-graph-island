import { Plugin } from "obsidian";
import { GraphViewsSettingTab } from "./settings";
import { GraphViewContainer, VIEW_TYPE_GRAPH } from "./views/GraphViewContainer";
import { NodeDetailView, VIEW_TYPE_NODE_DETAIL } from "./views/NodeDetailView";
import { DEFAULT_SETTINGS, type GraphViewsSettings } from "./types";

export default class GraphViewsPlugin extends Plugin {
  settings: GraphViewsSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_GRAPH,
      (leaf) => new GraphViewContainer(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_NODE_DETAIL,
      (leaf) => new NodeDetailView(leaf)
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

  private ensureDetailPane() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NODE_DETAIL);
    if (existing.length > 0) return;

    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      rightLeaf.setViewState({ type: VIEW_TYPE_NODE_DETAIL, active: true });
    }
  }
}
