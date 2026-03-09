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

    // --- Enclosure section ---
    containerEl.createEl("h3", { text: "Enclosure" });

    new Setting(containerEl)
      .setName("Enclosure minimum ratio")
      .setDesc(
        "Minimum fraction of total nodes a tag group must contain to display an enclosure. " +
        "E.g. 0.05 = groups with fewer than 5% of all nodes are hidden."
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, 0.3, 0.01)
          .setValue(this.plugin.settings.enclosureMinRatio)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.enclosureMinRatio = value;
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
      .setName("Show similar edges")
      .setDesc("Display edges between similar notes/tags.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSimilar)
          .onChange(async (value) => {
            this.plugin.settings.showSimilar = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Similar fields")
      .setDesc(
        "Frontmatter field names treated as similarity. Comma-separated."
      )
      .addText((text) =>
        text
          .setPlaceholder("similar, related")
          .setValue(this.plugin.settings.ontology.similarFields.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.ontology.similarFields = value
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

    // --- Group Presets section ---
    containerEl.createEl("h3", { text: "Group Presets" });

    const gpDesc = containerEl.createEl("p", {
      text: 'JSON array of presets. Each: { "condition": { "layout": "force", ... }, "groups": [{ "expression": {...}, "color": "#hex" }] }',
      cls: "setting-item-description",
    });
    gpDesc.style.fontSize = "0.85em";
    gpDesc.style.marginBottom = "8px";

    const gpTextarea = containerEl.createEl("textarea");
    gpTextarea.style.width = "100%";
    gpTextarea.style.minHeight = "120px";
    gpTextarea.style.fontFamily = "monospace";
    gpTextarea.style.fontSize = "0.85em";
    gpTextarea.value = JSON.stringify(this.plugin.settings.groupPresets ?? [], null, 2);

    const gpStatus = containerEl.createEl("div");
    gpStatus.style.fontSize = "0.85em";
    gpStatus.style.marginTop = "4px";

    gpTextarea.addEventListener("input", async () => {
      try {
        const parsed = JSON.parse(gpTextarea.value);
        if (!Array.isArray(parsed)) throw new Error("Must be an array");
        this.plugin.settings.groupPresets = parsed;
        await this.plugin.saveSettings();
        gpStatus.textContent = "Saved.";
        gpStatus.style.color = "var(--text-success)";
      } catch (e) {
        gpStatus.textContent = `Invalid JSON: ${(e as Error).message}`;
        gpStatus.style.color = "var(--text-error)";
      }
    });

    // --- Directional Gravity section ---
    containerEl.createEl("h3", { text: "Directional Gravity" });

    const dgDesc = containerEl.createEl("p", {
      text: 'JSON array of rules. Each rule: { "filter": "tag:character", "direction": "top"|"bottom"|"left"|"right"|<radians>, "strength": 0.1 }',
      cls: "setting-item-description",
    });
    dgDesc.style.fontSize = "0.85em";
    dgDesc.style.marginBottom = "8px";

    const dgTextarea = containerEl.createEl("textarea");
    dgTextarea.style.width = "100%";
    dgTextarea.style.minHeight = "120px";
    dgTextarea.style.fontFamily = "monospace";
    dgTextarea.style.fontSize = "0.85em";
    dgTextarea.value = JSON.stringify(
      this.plugin.settings.directionalGravityRules,
      null,
      2
    );

    const dgStatus = containerEl.createEl("div");
    dgStatus.style.fontSize = "0.85em";
    dgStatus.style.marginTop = "4px";

    dgTextarea.addEventListener("input", async () => {
      try {
        const parsed = JSON.parse(dgTextarea.value);
        if (!Array.isArray(parsed)) throw new Error("Must be an array");
        this.plugin.settings.directionalGravityRules = parsed;
        await this.plugin.saveSettings();
        dgStatus.textContent = "Saved.";
        dgStatus.style.color = "var(--text-success)";
      } catch (e) {
        dgStatus.textContent = `Invalid JSON: ${(e as Error).message}`;
        dgStatus.style.color = "var(--text-error)";
      }
    });

    // --- Node Rules section ---
    containerEl.createEl("h3", { text: "Node Rules" });

    const nrDesc = containerEl.createEl("p", {
      text: 'JSON array of rules. Each: { "query": "tag:character", "spacingMultiplier": 1.0, "gravityAngle": -1, "gravityStrength": 0.1 }. gravityAngle in degrees (0=right, 90=down, 180=left, 270=up, -1=none).',
      cls: "setting-item-description",
    });
    nrDesc.style.fontSize = "0.85em";
    nrDesc.style.marginBottom = "8px";

    const nrTextarea = containerEl.createEl("textarea");
    nrTextarea.style.width = "100%";
    nrTextarea.style.minHeight = "120px";
    nrTextarea.style.fontFamily = "monospace";
    nrTextarea.style.fontSize = "0.85em";
    nrTextarea.value = JSON.stringify(
      this.plugin.settings.defaultNodeRules ?? [],
      null,
      2
    );

    const nrStatus = containerEl.createEl("div");
    nrStatus.style.fontSize = "0.85em";
    nrStatus.style.marginTop = "4px";

    nrTextarea.addEventListener("input", async () => {
      try {
        const parsed = JSON.parse(nrTextarea.value);
        if (!Array.isArray(parsed)) throw new Error("Must be an array");
        this.plugin.settings.defaultNodeRules = parsed;
        await this.plugin.saveSettings();
        nrStatus.textContent = "Saved.";
        nrStatus.style.color = "var(--text-success)";
      } catch (e) {
        nrStatus.textContent = `Invalid JSON: ${(e as Error).message}`;
        nrStatus.style.color = "var(--text-error)";
      }
    });
  }
}
