import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type { GraphNode } from "../types";

export const VIEW_TYPE_NODE_DETAIL = "graph-node-detail";

/**
 * Sidebar pane that shows details for the node hovered in the graph view.
 * Listens to the custom "graph-views:hover-node" workspace event.
 */
export class NodeDetailView extends ItemView {
  private eventRef: ReturnType<typeof this.app.workspace.on> | null = null;

  getViewType() { return VIEW_TYPE_NODE_DETAIL; }
  getDisplayText() { return "Graph Node Detail"; }
  getIcon() { return "info"; }

  async onOpen() {
    this.contentEl.empty();
    this.renderEmpty();

    // Listen for hover events from GraphViewContainer
    this.eventRef = this.app.workspace.on(
      "graph-views:hover-node" as any,
      (node: GraphNode | null, adj: Map<string, Set<string>>, pixiNodes: Map<string, any>, degrees: Map<string, number>) => {
        this.renderNode(node, adj, pixiNodes, degrees);
      }
    );
    this.registerEvent(this.eventRef);
  }

  async onClose() {
    this.contentEl.empty();
  }

  private renderEmpty() {
    this.contentEl.empty();
    this.contentEl.createEl("div", {
      cls: "ngp-detail-empty",
      text: "グラフ上のノードにホバーすると詳細が表示されます",
    });
  }

  private renderNode(
    node: GraphNode | null,
    adj: Map<string, Set<string>>,
    pixiNodes: Map<string, any>,
    degrees: Map<string, number>,
  ) {
    this.contentEl.empty();

    if (!node) {
      this.renderEmpty();
      return;
    }

    const wrap = this.contentEl.createDiv({ cls: "ngp-detail-wrap" });

    // --- Header ---
    const header = wrap.createEl("div", { cls: "ngp-detail-header" });
    const nameEl = header.createEl("div", { cls: "ngp-ni-name" });
    nameEl.textContent = node.label;
    if (node.isTag) {
      nameEl.createEl("span", { cls: "ngp-ni-badge", text: "tag" });
    }

    // --- Meta ---
    if (node.category) {
      wrap.createEl("div", { cls: "ngp-ni-meta", text: `カテゴリ: ${node.category}` });
    }
    if (node.tags && node.tags.length > 0) {
      wrap.createEl("div", { cls: "ngp-ni-meta", text: `タグ: ${node.tags.map(t => "#" + t).join(" ")}` });
    }

    const deg = degrees.get(node.id) || 0;
    wrap.createEl("div", { cls: "ngp-ni-meta", text: `リンク数: ${deg}` });

    // --- Open file link ---
    if (node.filePath) {
      const openLink = wrap.createEl("div", { cls: "ngp-detail-open" });
      const btn = openLink.createEl("a", { cls: "ngp-ni-link", text: "ファイルを開く →" });
      btn.addEventListener("click", () => {
        this.app.workspace.openLinkText(node.filePath!, "", false);
      });
    }

    // --- Backlinks from vault ---
    if (node.filePath) {
      const tf = this.app.vault.getAbstractFileByPath(node.filePath);
      if (tf instanceof TFile) {
        const backlinks = this.getBacklinks(tf);
        if (backlinks.length > 0) {
          wrap.createEl("div", { cls: "ngp-ni-section-title", text: `バックリンク (${backlinks.length})` });
          const list = wrap.createEl("ul", { cls: "ngp-ni-list" });
          for (const bl of backlinks) {
            const li = list.createEl("li", { cls: "ngp-ni-list-item" });
            const link = li.createEl("span", { cls: "ngp-ni-link", text: bl.basename });
            link.addEventListener("click", () => {
              this.app.workspace.openLinkText(bl.path, "", false);
            });
          }
        }
      }
    }

    // --- Linked nodes from graph ---
    const neighbors = adj.get(node.id);
    if (neighbors && neighbors.size > 0) {
      wrap.createEl("div", { cls: "ngp-ni-section-title", text: `リンク中のノード (${neighbors.size})` });
      const list = wrap.createEl("ul", { cls: "ngp-ni-list" });
      for (const nbId of neighbors) {
        const nbPn = pixiNodes.get(nbId);
        if (!nbPn) continue;
        const li = list.createEl("li", { cls: "ngp-ni-list-item" });
        const link = li.createEl("span", { cls: "ngp-ni-link", text: nbPn.data.label });
        if (nbPn.data.isTag) {
          li.createEl("span", { cls: "ngp-ni-badge", text: "tag" });
        }
        if (nbPn.data.filePath) {
          link.addEventListener("click", () => {
            this.app.workspace.openLinkText(nbPn.data.filePath!, "", false);
          });
        }
      }
    }
  }

  /**
   * Get files that link TO the given file (backlinks) using Obsidian's metadataCache.
   */
  private getBacklinks(file: TFile): TFile[] {
    const resolved = this.app.metadataCache.resolvedLinks;
    const results: TFile[] = [];
    // resolvedLinks: { [sourcePath]: { [targetPath]: linkCount } }
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
