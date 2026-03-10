import { App, Modal, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type GraphViewsPlugin from "./main";
import type { GraphViewsSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { t } from "./i18n";

// ---------------------------------------------------------------------------
// Help entries (kept for HelpModal reuse from PanelBuilder)
// ---------------------------------------------------------------------------

interface HelpEntry {
  title: string;
  body: string;
}

const HELP: Record<string, HelpEntry> = {
  metadataFields: {
    title: "Metadata Fields",
    body:
      "YAML frontmatter のフィールド名をカンマ区切りで指定します。\n" +
      "ここに列挙されたフィールドの値がリンク先として解釈され、グラフのエッジが生成されます。\n\n" +
      "例: tags, category, characters, locations\n\n" +
      "フィールドの値が配列の場合、各要素がそれぞれリンクとして扱われます。",
  },
  colorField: {
    title: "Color Field",
    body:
      "ノードの色分けに使用する frontmatter フィールド名です。\n" +
      "同じ値を持つノードは同じ色でグループ化されます。\n\n" +
      "例: category → 同じ category 値のノードが同色に",
  },
  groupField: {
    title: "Group Field",
    body:
      "同心円 (Concentric) レイアウトのシェル分割、Sunburst の階層に使用する frontmatter フィールド名です。\n" +
      "同じ値のノードが同じシェル/セクターに配置されます。",
  },
  enclosure: {
    title: "Enclosure",
    body:
      "Enclosure（包絡線）は、同じタググループに属するノード群を凸包で囲んで可視化する機能です。\n\n" +
      "Minimum Ratio: 全ノード数に対するグループの最小割合。\n" +
      "例: 0.05 = ノード全体の 5% 未満のグループは包絡線を表示しない。\n" +
      "小さいグループの包絡線が多すぎて見づらい場合に閾値を上げてください。",
  },
  ontology: {
    title: "Ontology",
    body:
      "オントロジー設定は、ノート間の意味的な関係をグラフに反映します。\n\n" +
      "■ Inheritance (継承 / is-a):\n" +
      "  parent, extends, up などのフィールドを指定。\n" +
      "  例: Character → Entity（Character は Entity の一種）\n" +
      "  @-プレフィックス付きインラインフィールド（@Parent::）にも対応。\n\n" +
      "■ Aggregation (集約 / has-a):\n" +
      "  contains, parts, has などのフィールドを指定。\n" +
      "  例: Kingdom → City（Kingdom は City を含む）\n\n" +
      "■ Similar (類似):\n" +
      "  similar, related などのフィールドを指定。\n" +
      "  ノート間の類似関係エッジを表示。\n\n" +
      "■ Tag Hierarchy:\n" +
      "  ネストタグ（例: #entity/character）から自動で\n" +
      "  継承エッジ entity → character を生成。",
  },
  groupPresets: {
    title: "Group Presets",
    body:
      "レイアウト条件に応じた色分けグループのプリセットを JSON で定義します。\n\n" +
      "構造:\n" +
      '  [{ "condition": { "layout": "force" },\n' +
      '     "groups": [\n' +
      '       { "expression": { "type": "leaf", "field": "tag", "value": "character" },\n' +
      '         "color": "#ff6b6b" }\n' +
      "     ] }]\n\n" +
      "■ condition: どのレイアウトで有効にするか\n" +
      '■ expression: クエリ条件（"leaf" は単純条件、"branch" は AND/OR 等の論理演算）\n' +
      "■ color: グループの表示色（hex）\n\n" +
      "クエリ記法の詳細は docs/query-syntax.md を参照。",
  },
  clusterGroupRules: {
    title: "Default Cluster Group Rules",
    body:
      "クラスター配置のデフォルトグループ分けルールを JSON 配列で定義します。\n\n" +
      "構造:\n" +
      '  [{ "groupBy": "tag", "recursive": false },\n' +
      '   { "groupBy": "node_type", "recursive": true }]\n\n' +
      "■ groupBy: グループ分け基準\n" +
      '  - "tag": タグ別\n' +
      '  - "backlinks": 被リンク数別\n' +
      '  - "node_type": ノードタイプ別\n\n' +
      "■ recursive: true にすると、グループ内をさらに連結成分で分割\n\n" +
      "複数ルールはパイプライン方式で適用され、\n" +
      "前段の出力グループを次段がさらに細分化します。\n" +
      "空配列 = クラスタリング無し。",
  },
  directionalGravity: {
    title: "Directional Gravity",
    body:
      "特定のノード群に方向性のある重力を適用するルールです。\n\n" +
      "構造:\n" +
      '  [{ "filter": "tag:character",\n' +
      '     "direction": "top",\n' +
      '     "strength": 0.1 }]\n\n' +
      "■ filter: クエリ記法で対象ノードを指定\n" +
      "  例: tag:character, category:person, path:chapters/\n\n" +
      '■ direction: 重力方向\n' +
      '  "top" | "bottom" | "left" | "right" またはラジアン値\n\n' +
      "■ strength: 重力強度（0〜1）\n\n" +
      "クエリ記法の詳細は docs/query-syntax.md を参照。",
  },
  nodeRules: {
    title: "Node Rules",
    body:
      "ノード個別の間隔・重力を制御するルールです。\n\n" +
      "構造:\n" +
      '  [{ "query": "*",\n' +
      '     "spacingMultiplier": 2.0,\n' +
      '     "gravityAngle": -1,\n' +
      '     "gravityStrength": 0 }]\n\n' +
      "■ query: クエリ記法で対象ノードを指定\n" +
      "  例: *, tag:character, category:person AND path:chapters/\n\n" +
      "■ spacingMultiplier: ノード間隔の倍率（0.1〜5.0）\n\n" +
      "■ gravityAngle: 重力方向（度）\n" +
      "  0=右, 90=下, 180=左, 270=上, -1=なし\n\n" +
      "■ gravityStrength: 重力強度（0〜1）\n\n" +
      "クエリ記法の詳細は docs/query-syntax.md を参照。",
  },
};

export { HELP, HelpEntry, HelpModal };

class HelpModal extends Modal {
  private entry: HelpEntry;
  constructor(app: App, entry: HelpEntry) {
    super(app);
    this.entry = entry;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.entry.title });
    const pre = contentEl.createEl("div", { cls: "gi-help-body" });
    pre.textContent = this.entry.body;
  }
  onClose() {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Settings Tab — JSON import/export only
// ---------------------------------------------------------------------------

export class GraphViewsSettingTab extends PluginSettingTab {
  plugin: GraphViewsPlugin;

  constructor(app: App, plugin: GraphViewsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text: t("settingsTab.description"),
      cls: "gi-settings-description",
    });

    // --- Import section ---
    new Setting(containerEl)
      .setName(t("settingsTab.import"))
      .setDesc(t("settingsTab.importDesc"))
      .addButton((btn) =>
        btn.setButtonText(t("settingsTab.importBtn")).onClick(() => {
          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept = ".json";
          fileInput.addClass("gi-file-input-hidden");
          document.body.appendChild(fileInput);
          fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0];
            document.body.removeChild(fileInput);
            if (!file) return;
            try {
              const raw = await file.text();
              const parsed = JSON.parse(raw) as Partial<GraphViewsSettings>;
              this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, parsed);
              this.plugin.settings.settingsJsonPath = file.name;
              await this.plugin.saveSettings();
              new Notice(`${t("settingsTab.importDone")}: ${file.name}`);
              this.display();
            } catch (e) {
              new Notice(`${t("settingsTab.importFail")}: ${(e as Error).message}`);
            }
          });
          fileInput.click();
        })
      );

    // --- Vault path (for export target and vault-based import) ---
    new Setting(containerEl)
      .setName(t("settingsTab.jsonPath"))
      .setDesc(t("settingsTab.jsonPathDesc"))
      .addText((text) =>
        text
          .setPlaceholder("settings/graph-island.json")
          .setValue(this.plugin.settings.settingsJsonPath)
          .onChange(async (value) => {
            this.plugin.settings.settingsJsonPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // --- Export button ---
    new Setting(containerEl)
      .setName(t("settingsTab.export"))
      .setDesc(t("settingsTab.exportDesc"))
      .addButton((btn) =>
        btn.setButtonText(t("settingsTab.exportBtn")).setCta().onClick(async () => {
          const path = this.plugin.settings.settingsJsonPath;
          if (!path) {
            new Notice(t("settingsTab.exportNoPath"));
            return;
          }
          try {
            const dir = path.substring(0, path.lastIndexOf("/"));
            if (dir && !this.app.vault.getFolderByPath(dir)) {
              await this.app.vault.createFolder(dir);
            }
            const data = JSON.stringify(this.plugin.settings, null, 2);
            const existing = this.app.vault.getFileByPath(path);
            if (existing) {
              await this.app.vault.modify(existing, data);
            } else {
              await this.app.vault.create(path, data);
            }
            new Notice(`${t("settingsTab.exportDone")}: ${path}`);
          } catch (e) {
            new Notice(`${t("settingsTab.exportFail")}: ${(e as Error).message}`);
          }
        })
      );

    // --- Ontology field editors ---
    containerEl.createEl("h3", { text: t("settings.ontologyHeading") });

    new Setting(containerEl)
      .setName(t("settings.inheritanceFields"))
      .addText((text) =>
        text
          .setPlaceholder("parent, extends, up")
          .setValue(this.plugin.settings.ontology.inheritanceFields.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.inheritanceFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.aggregationFields"))
      .addText((text) =>
        text
          .setPlaceholder("contains, parts, has")
          .setValue(this.plugin.settings.ontology.aggregationFields.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.aggregationFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.reverseInheritanceFields"))
      .addText((text) =>
        text
          .setPlaceholder("child, down")
          .setValue((this.plugin.settings.ontology.reverseInheritanceFields ?? []).join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.reverseInheritanceFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.reverseAggregationFields"))
      .addText((text) =>
        text
          .setPlaceholder("part-of, belongs-to")
          .setValue((this.plugin.settings.ontology.reverseAggregationFields ?? []).join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.reverseAggregationFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.similarFields"))
      .addText((text) =>
        text
          .setPlaceholder("similar, related")
          .setValue(this.plugin.settings.ontology.similarFields.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.similarFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.siblingFields"))
      .addText((text) =>
        text
          .setPlaceholder("sibling, same")
          .setValue((this.plugin.settings.ontology.siblingFields ?? []).join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.siblingFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.sequenceFields"))
      .addText((text) =>
        text
          .setPlaceholder("next")
          .setValue((this.plugin.settings.ontology.sequenceFields ?? []).join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.sequenceFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.reverseSequenceFields"))
      .addText((text) =>
        text
          .setPlaceholder("prev, previous")
          .setValue((this.plugin.settings.ontology.reverseSequenceFields ?? []).join(", "))
          .onChange(async (v) => {
            this.plugin.settings.ontology.reverseSequenceFields = v.split(",").map(x => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.tagHierarchy"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ontology.useTagHierarchy)
          .onChange(async (v) => {
            this.plugin.settings.ontology.useTagHierarchy = v;
            await this.plugin.saveSettings();
          })
      );

    // --- Custom Mappings ---
    containerEl.createEl("h3", { text: t("settings.customMappingsHeading") });
    const mappingsListEl = containerEl.createDiv({ cls: "gi-ontology-list" });
    this.renderSettingsCustomMappings(mappingsListEl);

    // --- Tag Relations ---
    containerEl.createEl("h3", { text: t("settings.tagRelationsHeading") });
    const tagRelListEl = containerEl.createDiv({ cls: "gi-ontology-list" });
    this.renderSettingsTagRelations(tagRelListEl);

    // --- Preview: show current settings as read-only JSON ---
    containerEl.createEl("h3", { text: t("settingsTab.preview") });

    const preview = containerEl.createEl("textarea", { cls: "gi-settings-preview" });
    preview.readOnly = true;
    preview.value = JSON.stringify(this.plugin.settings, null, 2);
  }

  private renderSettingsCustomMappings(container: HTMLElement) {
    container.empty();
    const onto = this.plugin.settings.ontology;
    if (!onto.customMappings) onto.customMappings = {};
    const entries = Object.entries(onto.customMappings);

    for (const [field, type] of entries) {
      const row = container.createDiv({ cls: "gi-mapping-row" });
      const fieldInput = row.createEl("input", { type: "text", cls: "gi-mapping-field", placeholder: t("settings.mappingFieldPlaceholder") });
      fieldInput.value = field;

      const typeSelect = row.createEl("select", { cls: "gi-mapping-type dropdown" });
      for (const opt of ["inheritance", "aggregation", "similar", "sibling", "sequence"] as const) {
        const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.mappingType.${opt}`) });
        if (opt === type) optEl.selected = true;
      }

      const removeBtn = row.createEl("button", { cls: "gi-mapping-remove clickable-icon", text: "\u00d7" });

      const update = () => {
        const oldField = field;
        const newField = fieldInput.value.trim();
        const newType = typeSelect.value as "inheritance" | "aggregation" | "similar" | "sibling" | "sequence";
        if (oldField !== newField) delete onto.customMappings[oldField];
        if (newField) onto.customMappings[newField] = newType;
        this.plugin.saveSettings();
      };
      fieldInput.addEventListener("change", update);
      typeSelect.addEventListener("change", update);
      removeBtn.addEventListener("click", () => {
        delete onto.customMappings[field];
        this.plugin.saveSettings();
        this.renderSettingsCustomMappings(container);
      });
    }

    const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addMapping") });
    addBtn.addEventListener("click", () => {
      onto.customMappings[""] = "inheritance";
      this.renderSettingsCustomMappings(container);
    });
  }

  private renderSettingsTagRelations(container: HTMLElement) {
    container.empty();
    const onto = this.plugin.settings.ontology;
    if (!onto.tagRelations) onto.tagRelations = [];

    for (let i = 0; i < onto.tagRelations.length; i++) {
      const rel = onto.tagRelations[i];
      const row = container.createDiv({ cls: "gi-tag-rel-row" });

      const srcInput = row.createEl("input", { type: "text", cls: "gi-tag-rel-src", placeholder: t("settings.tagRelSourcePlaceholder") });
      srcInput.value = rel.source;

      const typeSelect = row.createEl("select", { cls: "gi-tag-rel-type dropdown" });
      for (const opt of ["inheritance", "aggregation"] as const) {
        const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.tagRelType.${opt}`) });
        if (opt === rel.type) optEl.selected = true;
      }

      const tgtInput = row.createEl("input", { type: "text", cls: "gi-tag-rel-tgt", placeholder: t("settings.tagRelTargetPlaceholder") });
      tgtInput.value = rel.target;

      const removeBtn = row.createEl("button", { cls: "gi-tag-rel-remove clickable-icon", text: "\u00d7" });

      const update = () => {
        rel.source = srcInput.value.trim().replace(/^#/, "");
        rel.target = tgtInput.value.trim().replace(/^#/, "");
        rel.type = typeSelect.value as "inheritance" | "aggregation";
        this.plugin.saveSettings();
      };
      srcInput.addEventListener("change", update);
      tgtInput.addEventListener("change", update);
      typeSelect.addEventListener("change", update);
      removeBtn.addEventListener("click", () => {
        onto.tagRelations.splice(i, 1);
        this.plugin.saveSettings();
        this.renderSettingsTagRelations(container);
      });
    }

    const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addTagRelation") });
    addBtn.addEventListener("click", () => {
      onto.tagRelations.push({ source: "", target: "", type: "inheritance" });
      this.renderSettingsTagRelations(container);
    });
  }
}
