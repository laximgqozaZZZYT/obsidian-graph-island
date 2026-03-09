import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, Component, setIcon } from "obsidian";
import type { GraphNode } from "../types";

export const VIEW_TYPE_NODE_DETAIL = "graph-node-detail";

/**
 * Sidebar pane that shows details for the node hovered in the graph view.
 * Listens to the custom "graph-views:hover-node" workspace event.
 */
export class NodeDetailView extends ItemView {
  private renderComponent: Component | null = null;
  /** When true, ignore further hover events until user releases hold */
  private held = false;
  /** True if a node has been captured while hold was active */
  private holdCaptured = false;
  private holdBtn: HTMLElement | null = null;
  /** Persistent body container below the toolbar */
  private bodyEl: HTMLElement | null = null;

  /** Cached references for hover-highlight from graph */
  private pixiNodes: Map<string, any> = new Map();

  getViewType() { return VIEW_TYPE_NODE_DETAIL; }
  getDisplayText() { return "Graph Node Detail"; }
  getIcon() { return "git-fork"; }

  async onOpen() {
    this.contentEl.addClass("ngp-detail-root");
    this.contentEl.empty();

    // Persistent toolbar with hold (pin) button — always visible
    const toolbar = this.contentEl.createEl("div", { cls: "ngp-detail-toolbar" });
    this.holdBtn = toolbar.createEl("button", { cls: "ngp-hold-btn" });
    setIcon(this.holdBtn, "pin");
    this.holdBtn.setAttribute("aria-label", "ホールド（表示を固定）");
    this.holdBtn.toggleClass("is-active", this.held);
    this.holdBtn.addEventListener("click", () => this.toggleHold());

    this.bodyEl = this.contentEl.createEl("div", { cls: "ngp-detail-body" });
    this.renderEmpty();

    this.registerEvent(
      this.app.workspace.on(
        "graph-views:hover-node" as any,
        (node: GraphNode | null, adj: Map<string, Set<string>>, pixiNodes: Map<string, any>, degrees: Map<string, number>) => {
          if (this.held && this.holdCaptured) return; // locked
          this.pixiNodes = pixiNodes;
          this.renderNode(node, adj, pixiNodes, degrees);
          if (this.held && node) this.holdCaptured = true;
        }
      )
    );
  }

  async onClose() {
    this.cleanupRenderComponent();
    this.bodyEl = null;
    this.holdBtn = null;
    this.contentEl.empty();
  }

  private cleanupRenderComponent() {
    if (this.renderComponent) {
      this.renderComponent.unload();
      this.renderComponent = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Hold toggle
  // ---------------------------------------------------------------------------

  private toggleHold() {
    this.held = !this.held;
    if (!this.held) {
      this.holdCaptured = false;
    }
    this.holdBtn?.toggleClass("is-active", this.held);
  }

  // ---------------------------------------------------------------------------
  // Ephemeral highlight helpers
  // ---------------------------------------------------------------------------

  private triggerHighlight(nodeIds: Set<string> | null) {
    this.app.workspace.trigger("graph-views:highlight-nodes" as any, nodeIds);
  }

  /** Find all pixi node IDs whose frontmatter[key] contains `value` */
  private findNodesByProperty(key: string, value: unknown): Set<string> {
    const ids = new Set<string>();
    const valStr = String(value);
    for (const [id, pn] of this.pixiNodes) {
      const fp = pn.data?.filePath;
      if (!fp) continue;
      const tf = this.app.vault.getAbstractFileByPath(fp);
      if (!(tf instanceof TFile)) continue;
      const cache = this.app.metadataCache.getFileCache(tf);
      const fm = cache?.frontmatter;
      if (!fm) continue;
      const fmVal = fm[key];
      if (fmVal === undefined) continue;
      if (Array.isArray(fmVal)) {
        if (fmVal.some(v => String(v) === valStr)) ids.add(id);
      } else if (String(fmVal) === valStr) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** Find pixi node ID by filePath */
  private findNodeByFilePath(filePath: string): string | null {
    for (const [id, pn] of this.pixiNodes) {
      if (pn.data?.filePath === filePath) return id;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  private renderEmpty() {
    if (!this.bodyEl) return;
    this.bodyEl.empty();
    this.bodyEl.createEl("div", {
      cls: "ngp-detail-empty",
      text: "グラフ上のノードにホバーすると詳細が表示されます",
    });
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  private async renderNode(
    node: GraphNode | null,
    adj: Map<string, Set<string>>,
    pixiNodes: Map<string, any>,
    degrees: Map<string, number>,
  ) {
    this.cleanupRenderComponent();
    if (!this.bodyEl) return;
    this.bodyEl.empty();
    this.renderComponent = new Component();
    this.renderComponent.load();

    if (!node) {
      this.renderEmpty();
      return;
    }

    const wrap = this.bodyEl.createDiv({ cls: "ngp-detail-wrap" });

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
            nodeId: nbId,
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

    const stripped = content.replace(/^---[\s\S]*?---\n?/, "");
    if (!stripped.trim()) return;

    const maxLen = 600;
    let preview = stripped.slice(0, maxLen);
    if (stripped.length > maxLen) preview += "\n\n…";

    const section = parent.createEl("div", { cls: "ngp-detail-preview" });
    section.createEl("div", { cls: "ngp-detail-section-label", text: "プレビュー" });

    const previewContent = section.createEl("div", { cls: "ngp-preview-content" });

    await MarkdownRenderer.render(
      this.app,
      preview,
      previewContent,
      file.path,
      this.renderComponent!,
    );
  }

  // ---------------------------------------------------------------------------
  // Inline link preview (for ▼ expand)
  // ---------------------------------------------------------------------------

  private async renderInlinePreview(container: HTMLElement, filePath: string) {
    const tf = this.app.vault.getAbstractFileByPath(filePath);
    if (!(tf instanceof TFile)) return;

    let content: string;
    try {
      content = await this.app.vault.cachedRead(tf);
    } catch {
      return;
    }
    if (!content.trim()) {
      container.createEl("div", { cls: "ngp-inline-preview-empty", text: "（空のファイル）" });
      return;
    }

    const stripped = content.replace(/^---[\s\S]*?---\n?/, "");
    if (!stripped.trim()) {
      container.createEl("div", { cls: "ngp-inline-preview-empty", text: "（本文なし）" });
      return;
    }

    const maxLen = 400;
    let preview = stripped.slice(0, maxLen);
    if (stripped.length > maxLen) preview += "\n\n…";

    await MarkdownRenderer.render(
      this.app,
      preview,
      container,
      tf.path,
      this.renderComponent!,
    );
  }

  // ---------------------------------------------------------------------------
  // Properties (frontmatter) — supports nested objects & arrays
  // ---------------------------------------------------------------------------

  private renderProperties(parent: HTMLElement, file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return;

    const skip = new Set(["position", "cssclass", "cssclasses", "publish", "aliases"]);
    const entries = Object.entries(fm).filter(([k]) => !skip.has(k) && !k.startsWith("_"));
    if (entries.length === 0) return;

    const details = parent.createEl("details", { cls: "ngp-detail-collapsible" });
    details.createEl("summary", { cls: "ngp-detail-section-label", text: `プロパティ (${entries.length})` });

    const table = details.createEl("table", { cls: "ngp-props-table" });
    for (const [key, value] of entries) {
      this.renderPropertyRow(table, key, key, value);
    }
  }

  /** Render a single property row — recursively handles objects/arrays */
  private renderPropertyRow(table: HTMLElement, rootKey: string, displayKey: string, value: unknown) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Object: render each sub-property as its own row
      const subEntries = Object.entries(value as Record<string, unknown>);
      if (subEntries.length === 0) {
        this.renderSimpleRow(table, rootKey, displayKey, "{}");
        return;
      }
      // Group header
      const headerTr = table.createEl("tr", { cls: "ngp-props-group-header" });
      const headerTd = headerTr.createEl("td", { attr: { colspan: "2" }, cls: "ngp-props-key" });
      headerTd.textContent = `${displayKey}:`;
      for (const [subKey, subVal] of subEntries) {
        this.renderPropertyRow(table, `${rootKey}.${subKey}`, `  ${subKey}`, subVal);
      }
    } else if (Array.isArray(value)) {
      // Array of primitives — render as comma-separated links
      if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
        // Array of objects
        const headerTr = table.createEl("tr", { cls: "ngp-props-group-header" });
        const headerTd = headerTr.createEl("td", { attr: { colspan: "2" }, cls: "ngp-props-key" });
        headerTd.textContent = `${displayKey}: (${value.length})`;
        for (let i = 0; i < value.length; i++) {
          this.renderPropertyRow(table, rootKey, `  [${i}]`, value[i]);
        }
      } else {
        // Array of primitives
        const tr = table.createEl("tr");
        tr.createEl("td", { cls: "ngp-props-key", text: displayKey });
        const valTd = tr.createEl("td", { cls: "ngp-props-value" });
        this.renderArrayValues(valTd, rootKey, value);
      }
    } else {
      this.renderSimpleRow(table, rootKey, displayKey, value);
    }
  }

  /** Render a primitive value as a hoverable link */
  private renderSimpleRow(table: HTMLElement, propKey: string, displayKey: string, value: unknown) {
    const tr = table.createEl("tr");
    tr.createEl("td", { cls: "ngp-props-key", text: displayKey });
    const valTd = tr.createEl("td", { cls: "ngp-props-value" });
    const valStr = String(value ?? "");
    const link = valTd.createEl("span", { cls: "ngp-prop-link", text: valStr });
    this.attachPropertyHover(link, propKey, value);
  }

  /** Render array values as comma-separated hoverable links */
  private renderArrayValues(container: HTMLElement, propKey: string, values: unknown[]) {
    for (let i = 0; i < values.length; i++) {
      if (i > 0) container.appendText(", ");
      const valStr = String(values[i] ?? "");
      const link = container.createEl("span", { cls: "ngp-prop-link", text: valStr });
      this.attachPropertyHover(link, propKey, values[i]);
    }
  }

  /** Attach mouseenter/mouseleave handlers to highlight nodes sharing property */
  private attachPropertyHover(el: HTMLElement, propKey: string, value: unknown) {
    // Extract the root key (before any dots for nested paths)
    const rootKey = propKey.split(".")[0];
    el.addEventListener("mouseenter", () => {
      const ids = this.findNodesByProperty(rootKey, value);
      if (ids.size > 0) this.triggerHighlight(ids);
    });
    el.addEventListener("mouseleave", () => {
      this.triggerHighlight(null);
    });
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
      (bl) => ({
        label: bl.basename,
        isTag: false,
        filePath: bl.path,
        nodeId: this.findNodeByFilePath(bl.path),
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Collapsible list with inline preview toggle + hover highlight
  // ---------------------------------------------------------------------------

  private renderCollapsibleList<T>(
    parent: HTMLElement,
    title: string,
    items: T[],
    resolve: (item: T) => { label: string; isTag?: boolean; filePath?: string; nodeId?: string | null } | null,
  ) {
    const details = parent.createEl("details", { cls: "ngp-detail-collapsible" });
    details.open = true;
    details.createEl("summary", { cls: "ngp-detail-section-label", text: title });

    const list = details.createEl("ul", { cls: "ngp-ni-list" });
    for (const item of items) {
      const info = resolve(item);
      if (!info) continue;

      const li = list.createEl("li", { cls: "ngp-ni-list-item-wrap" });
      const row = li.createEl("div", { cls: "ngp-ni-item-row" });

      // ▼ expand button (only for items with files)
      if (info.filePath) {
        const expandBtn = row.createEl("button", { cls: "ngp-expand-btn", text: "▶" });
        let expanded = false;
        let previewEl: HTMLElement | null = null;

        expandBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          expanded = !expanded;
          expandBtn.textContent = expanded ? "▼" : "▶";

          if (expanded && !previewEl) {
            previewEl = li.createEl("div", { cls: "ngp-inline-preview" });
            await this.renderInlinePreview(previewEl, info.filePath!);
          } else if (previewEl) {
            previewEl.style.display = expanded ? "" : "none";
          }
        });
      }

      const link = row.createEl("span", { cls: "ngp-ni-link", text: info.label });
      if (info.isTag) {
        row.createEl("span", { cls: "ngp-ni-badge", text: "tag" });
      }
      if (info.filePath) {
        link.addEventListener("click", () => {
          this.app.workspace.openLinkText(info.filePath!, "", false);
        });
      }

      // Hover → highlight corresponding node on graph
      const nodeId = info.nodeId ?? (info.filePath ? this.findNodeByFilePath(info.filePath) : null);
      if (nodeId) {
        link.addEventListener("mouseenter", () => {
          this.triggerHighlight(new Set([nodeId]));
        });
        link.addEventListener("mouseleave", () => {
          this.triggerHighlight(null);
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
