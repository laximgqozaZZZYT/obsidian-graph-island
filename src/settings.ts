import { App, PluginSettingTab, Setting } from "obsidian";
import type GraphViewsPlugin from "./main";
import type { LayoutType } from "./types";

export class GraphViewsSettingTab extends PluginSettingTab {
  plugin: GraphViewsPlugin;

  constructor(app: App, plugin: GraphViewsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default layout")
      .setDesc("The layout used when opening a new graph view.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            force: "Force-directed",
            concentric: "Concentric",
            tree: "Tree",
            arc: "Arc",
            sunburst: "Sunburst",
          })
          .setValue(this.plugin.settings.defaultLayout)
          .onChange(async (value) => {
            this.plugin.settings.defaultLayout = value as LayoutType;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Node size")
      .setDesc("Default radius for graph nodes.")
      .addSlider((slider) =>
        slider
          .setLimits(3, 20, 1)
          .setValue(this.plugin.settings.nodeSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.nodeSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show labels")
      .setDesc("Display node labels in the graph.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showLabels)
          .onChange(async (value) => {
            this.plugin.settings.showLabels = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Metadata fields")
      .setDesc(
        "YAML frontmatter fields to use for building relationships (comma-separated)."
      )
      .addText((text) =>
        text
          .setPlaceholder("tags, category, characters, locations")
          .setValue(this.plugin.settings.metadataFields.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.metadataFields = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Color field")
      .setDesc("Frontmatter field used to color-code nodes.")
      .addText((text) =>
        text
          .setPlaceholder("category")
          .setValue(this.plugin.settings.colorField)
          .onChange(async (value) => {
            this.plugin.settings.colorField = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Group field")
      .setDesc("Frontmatter field used to group nodes (for concentric shells, sunburst hierarchy).")
      .addText((text) =>
        text
          .setPlaceholder("category")
          .setValue(this.plugin.settings.groupField)
          .onChange(async (value) => {
            this.plugin.settings.groupField = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
