import { App, Modal, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type GraphViewsPlugin from "./main";
import type { GraphViewsSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

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
    const pre = contentEl.createEl("div");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.fontFamily = "var(--font-monospace)";
    pre.style.fontSize = "0.9em";
    pre.style.lineHeight = "1.6";
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
      text: "各設定項目はグラフビューのパネルから直接編集できます。ここでは設定の JSON エクスポート / インポートを行えます。",
    }).style.cssText = "color:var(--text-muted);margin-bottom:16px;";

    // --- Import section ---
    new Setting(containerEl)
      .setName("設定をインポート")
      .setDesc("JSON ファイルを選択して設定を読み込みます。現在の設定は上書きされます。")
      .addButton((btn) =>
        btn.setButtonText("インポート").onClick(() => {
          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept = ".json";
          fileInput.style.display = "none";
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
              new Notice(`インポート完了: ${file.name}`);
              this.display();
            } catch (e) {
              new Notice(`インポート失敗: ${(e as Error).message}`);
            }
          });
          fileInput.click();
        })
      );

    // --- Vault path (for export target and vault-based import) ---
    new Setting(containerEl)
      .setName("設定 JSON ファイルパス")
      .setDesc("Vault 内の JSON ファイルパス（例: settings/graph-island.json）。エクスポート先に使用します。")
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
      .setName("設定をエクスポート")
      .setDesc("現在の設定を JSON ファイルに書き出します。")
      .addButton((btn) =>
        btn.setButtonText("エクスポート").setCta().onClick(async () => {
          const path = this.plugin.settings.settingsJsonPath;
          if (!path) {
            new Notice("JSON ファイルパスを指定してください。");
            return;
          }
          try {
            const dir = path.substring(0, path.lastIndexOf("/"));
            if (dir && !(await this.app.vault.adapter.exists(dir))) {
              await this.app.vault.adapter.mkdir(dir);
            }
            const data = JSON.stringify(this.plugin.settings, null, 2);
            await this.app.vault.adapter.write(path, data);
            new Notice(`エクスポート完了: ${path}`);
          } catch (e) {
            new Notice(`エクスポート失敗: ${(e as Error).message}`);
          }
        })
      );

    // --- Preview: show current settings as read-only JSON ---
    containerEl.createEl("h3", { text: "現在の設定（プレビュー）" });

    const preview = containerEl.createEl("textarea");
    preview.style.cssText = "width:100%;min-height:300px;font-family:monospace;font-size:0.85em;";
    preview.readOnly = true;
    preview.value = JSON.stringify(this.plugin.settings, null, 2);
  }
}
