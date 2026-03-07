import { Plugin } from "obsidian";
import { NovelGraphViewsSettingTab } from "./settings";
import { GraphViewContainer, VIEW_TYPE_NOVEL_GRAPH } from "./views/GraphViewContainer";
import { DEFAULT_SETTINGS, type NovelGraphViewsSettings } from "./types";

export default class NovelGraphViewsPlugin extends Plugin {
  settings: NovelGraphViewsSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_NOVEL_GRAPH,
      (leaf) => new GraphViewContainer(leaf, this)
    );

    this.addRibbonIcon("git-fork", "Novel Graph Views", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-novel-graph-view",
      name: "Open graph view",
      callback: () => {
        this.activateView();
      },
    });

    this.addSettingTab(new NovelGraphViewsSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_NOVEL_GRAPH)[0];
    if (!leaf) {
      const newLeaf = workspace.getRightLeaf(false);
      if (!newLeaf) return;
      await newLeaf.setViewState({
        type: VIEW_TYPE_NOVEL_GRAPH,
        active: true,
      });
      leaf = newLeaf;
    }
    workspace.revealLeaf(leaf);
  }
}
