import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, Component } from "obsidian";
import type { GraphNode } from "../types";

export const VIEW_TYPE_NODE_DETAIL = "graph-node-detail";

/**
 * Sidebar pane that shows details for the node hovered in the graph view.
 * Listens to the custom "graph-views:hover-node" workspace event.
 */
export class NodeDetailView extends ItemView {
  private renderComponent: Component | null = null;

  getViewType() { return VIEW_TYPE_NODE_DETAIL; }
  getDisplayText() { return "Graph Node Detail"; }
  getIcon() { return "git-fork"; }

  async onOpen() {
    this.contentEl.addClass("ngp-detail-root");
    this.contentEl.empty();
    this.renderEmpty();

    this.registerEvent(
      this.app.workspace.on(
        "graph-views:hover-node" as any,
        (node: GraphNode | null, adj: Map<string, Set<string>>, pixiNodes: Map<string, any>, degrees: Map<string, number>) => {
          this.renderNode(node, adj, pixiNodes, degrees);
        }
      )
    );
  }

  async onClose() {
    this.cleanupRenderComponent();
    this.contentEl.empty();
  }

  private cleanupRenderComponent() {
    if (this.renderComponent) {
      this.renderComponent.unload();
      this.renderComponent = null;
    }
  }

  private renderEmpty() {
    this.contentEl.empty();
    this.contentEl.createEl("div", {
      cls: "ngp-detail-empty",
      text: "グラフ上のノードにホバーすると詳細が表示されます",
    });
  }

  private async renderNode(
    node: GraphNode | null,
    adj: Map<string, Set<string>>,
    pixiNodes: Map<string, any>,
    degrees: Map<string, number>,
  ) {
    this.cleanupRenderComponent();
    this.contentEl.empty();

    if (!node) {
      this.renderEmpty();
      return;
    }

    const wrap = this.contentEl.createDiv({ cls: "ngp-detail-wrap" });

    // === Header ===
    const header = wrap.createEl("div", { cls: "ngp-detail-header" });
    const nameEl = header.createEl("div", { cls: "ngp-ni-name" });
    nameEl.textContent = node.label;
    if (node.isTag) {
      nameEl.createEl("span", { cls: "ngp-ni-badge", text: "tag" });
    }

    // === Meta ===
    const metaWrap = wrap.createEl("div", { cls: "ngp-detail-meta" });
    if (node.tags && node.tags.length > 0) {
      const tagRow = metaWrap.createEl("div", { cls: "ngp-detail-tags" });
      for (const t of node.tags) {
        tagRow.createEl("span", { cls: "ngp-tag-pill", text: `#${t}` });
      }
    }

    const deg = degrees.get(node.id) || 0;
    const statsRow = metaWrap.createEl("div", { cls: "ngp-detail-stats" });
    statsRow.createEl("span", { cls: "ngp-stat", text: `リンク数: ${deg}` });
    if (node.category) {
      statsRow.createEl("span", { cls: "ngp-stat", text: `カテゴリ: ${node.category}` });
    }

    // === Open file ===
    if (node.filePath) {
      const openLink = wrap.createEl("div", { cls: "ngp-detail-open" });
      const btn = openLink.createEl("a", { cls: "ngp-ni-link", text: "ファイルを開く →" });
      btn.addEventListener("click", () => {
        this.app.workspace.openLinkText(node.filePath!, "", false);
      });
    }

    // === File Preview (Markdown render) ===
    if (node.filePath) {
      const tf = this.app.vault.getAbstractFileByPath(node.filePath);
      if (tf instanceof TFile) {
        await this.renderPreview(wrap, tf);
        this.renderProperties(wrap, tf);
        this.renderBacklinks(wrap, tf);
      }
    }

    // === Linked nodes ===
    const neighbors = adj.get(node.id);
    if (neighbors && neighbors.size > 0) {
      this.renderCollapsibleList(
        wrap,
        `リンク中のノード (${neighbors.size})`,
        [...neighbors],
        (nbId) => {
          const nbPn = pixiNodes.get(nbId);
          if (!nbPn) return null;
          return {
            label: nbPn.data.label,
            isTag: nbPn.data.isTag,
            filePath: nbPn.data.filePath,
          };
        },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  private async renderPreview(parent: HTMLElement, file: TFile) {
    let content: string;
    try {
      content = await this.app.vault.cachedRead(file);
    } catch {
      return;
    }
    if (!content.trim()) return;

    // Strip frontmatter
    const stripped = content.replace(/^---[\s\S]*?---\n?/, "");
    if (!stripped.trim()) return;

    // Take first ~600 chars (enough for a preview)
    const maxLen = 600;
    let preview = stripped.slice(0, maxLen);
    if (stripped.length > maxLen) preview += "\n\n…";

    const section = parent.createEl("div", { cls: "ngp-detail-preview" });
    section.createEl("div", { cls: "ngp-detail-section-label", text: "プレビュー" });

    const previewContent = section.createEl("div", { cls: "ngp-preview-content" });

    this.renderComponent = new Component();
    this.renderComponent.load();

    await MarkdownRenderer.render(
      this.app,
      preview,
      previewContent,
      file.path,
      this.renderComponent,
    );
  }

  // ---------------------------------------------------------------------------
  // Properties (frontmatter)
  // ---------------------------------------------------------------------------

  private renderProperties(parent: HTMLElement, file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return;

    // Filter out Obsidian internal keys
    const skip = new Set(["position", "cssclass", "cssclasses", "publish", "aliases"]);
    const entries = Object.entries(fm).filter(([k]) => !skip.has(k) && !k.startsWith("_"));
    if (entries.length === 0) return;

    const details = parent.createEl("details", { cls: "ngp-detail-collapsible" });
    details.createEl("summary", { cls: "ngp-detail-section-label", text: `プロパティ (${entries.length})` });

    const table = details.createEl("table", { cls: "ngp-props-table" });
    for (const [key, value] of entries) {
      const tr = table.createEl("tr");
      tr.createEl("td", { cls: "ngp-props-key", text: key });
      const valTd = tr.createEl("td", { cls: "ngp-props-value" });
      const display = Array.isArray(value) ? value.join(", ") : String(value ?? "");
      valTd.textContent = display;
    }
  }

  // ---------------------------------------------------------------------------
  // Backlinks
  // ---------------------------------------------------------------------------

  private renderBacklinks(parent: HTMLElement, file: TFile) {
    const backlinks = this.getBacklinks(file);
    if (backlinks.length === 0) return;

    this.renderCollapsibleList(
      parent,
      `バックリンク (${backlinks.length})`,
      backlinks,
      (bl) => ({ label: bl.basename, isTag: false, filePath: bl.path }),
    );
  }

  // ---------------------------------------------------------------------------
  // Collapsible list helper
  // ---------------------------------------------------------------------------

  private renderCollapsibleList<T>(
    parent: HTMLElement,
    title: string,
    items: T[],
    resolve: (item: T) => { label: string; isTag?: boolean; filePath?: string } | null,
  ) {
    const details = parent.createEl("details", { cls: "ngp-detail-collapsible" });
    details.open = true;
    details.createEl("summary", { cls: "ngp-detail-section-label", text: title });

    const list = details.createEl("ul", { cls: "ngp-ni-list" });
    for (const item of items) {
      const info = resolve(item);
      if (!info) continue;
      const li = list.createEl("li", { cls: "ngp-ni-list-item" });
      const link = li.createEl("span", { cls: "ngp-ni-link", text: info.label });
      if (info.isTag) {
        li.createEl("span", { cls: "ngp-ni-badge", text: "tag" });
      }
      if (info.filePath) {
        link.addEventListener("click", () => {
          this.app.workspace.openLinkText(info.filePath!, "", false);
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Backlink resolver
  // ---------------------------------------------------------------------------

  private getBacklinks(file: TFile): TFile[] {
    const resolved = this.app.metadataCache.resolvedLinks;
    const results: TFile[] = [];
    for (const [sourcePath, targets] of Object.entries(resolved)) {
      if (targets[file.path]) {
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (sourceFile instanceof TFile) {
          results.push(sourceFile);
        }
      }
    }
    return results.sort((a, b) => a.basename.localeCompare(b.basename));
  }
}
