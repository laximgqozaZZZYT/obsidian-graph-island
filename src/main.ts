import { Plugin } from "obsidian";
import { GraphViewsSettingTab } from "./settings";
import { GraphViewContainer, VIEW_TYPE_GRAPH } from "./views/GraphViewContainer";
import { DEFAULT_SETTINGS, type GraphViewsSettings } from "./types";

export default class GraphViewsPlugin extends Plugin {
  settings: GraphViewsSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_GRAPH,
      (leaf) => new GraphViewContainer(leaf, this)
    );

    this.addRibbonIcon("git-fork", "Graph Views", () => {
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
  }
}
