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

    // --- Ontology section ---
    containerEl.createEl("h3", { text: "Ontology" });

    new Setting(containerEl)
      .setName("Inheritance fields")
      .setDesc(
        "Frontmatter field names treated as inheritance (is-a). Also matches @-prefixed inline fields (e.g. @Parent::). Comma-separated."
      )
      .addText((text) =>
        text
          .setPlaceholder("parent, extends, up")
          .setValue(this.plugin.settings.ontology.inheritanceFields.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.ontology.inheritanceFields = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Aggregation fields")
      .setDesc(
        "Frontmatter field names treated as aggregation (has-a). Also matches @-prefixed inline fields (e.g. @Contains::). Comma-separated."
      )
      .addText((text) =>
        text
          .setPlaceholder("contains, parts, has")
          .setValue(this.plugin.settings.ontology.aggregationFields.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.ontology.aggregationFields = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tag hierarchy as inheritance")
      .setDesc(
        "Automatically create inheritance edges from nested tags (e.g. #entity/character)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ontology.useTagHierarchy)
          .onChange(async (value) => {
            this.plugin.settings.ontology.useTagHierarchy = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
