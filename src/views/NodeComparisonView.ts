import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type { GraphNode } from "../types";
import { t } from "../i18n";
import { EVENT_COMPARE_NODES, EVENT_HIGHLIGHT_NODES } from "../constants";
import type { PixiNode } from "./InteractionManager";

export const VIEW_TYPE_NODE_COMPARE = "graph-node-compare";

/** 比較イベントのペイロード */
interface CompareEvent {
	nodeA: GraphNode;
	nodeB: GraphNode;
	adj: Map<string, Set<string>>;
	pixiNodes: Map<string, PixiNode>;
}

/** 比較結果の計算データ */
interface ComparisonResult {
	sharedNeighbors: string[];
	uniqueToA: string[];
	uniqueToB: string[];
	sharedTags: string[];
	uniqueTagsA: string[];
	uniqueTagsB: string[];
	sharedCategories: string[];
	shortestPath: string[] | null;
	pathLength: number;
}

/**
 * ノード比較サイドバーパネル。
 * 2つのノードの共通・固有の隣接ノード、タグ、最短経路を表示する。
 */
export class NodeComparisonView extends ItemView {
	private bodyEl: HTMLElement | null = null;
	private pixiNodes: Map<string, PixiNode> = new Map();

	getViewType() {
		return VIEW_TYPE_NODE_COMPARE;
	}
	getDisplayText() {
		return t("compare.title");
	}
	getIcon() {
		return "git-compare";
	}

	async onOpen() {
		this.contentEl.addClass("gi-compare-root");
		this.contentEl.empty();

		this.bodyEl = this.contentEl.createEl("div", { cls: "gi-compare-body" });
		this.renderEmpty();

		// 比較イベントをリスン
		this.registerEvent(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom workspace event
			(this.app.workspace as any).on(EVENT_COMPARE_NODES, (data: CompareEvent | null) => {
				if (!data) {
					this.renderEmpty();
					return;
				}
				this.pixiNodes = data.pixiNodes;
				this.renderComparison(data);
			}),
		);
	}

	async onClose() {
		this.bodyEl = null;
		this.contentEl.empty();
	}

	// ---------------------------------------------------------------------------
	// ハイライト通知
	// ---------------------------------------------------------------------------
	private triggerHighlight(nodeIds: Set<string> | null) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom workspace event
		this.app.workspace.trigger(EVENT_HIGHLIGHT_NODES as any, nodeIds);
	}

	// ---------------------------------------------------------------------------
	// 空状態の表示
	// ---------------------------------------------------------------------------
	private renderEmpty() {
		if (!this.bodyEl) return;
		this.bodyEl.empty();
		this.bodyEl.createEl("div", {
			cls: "gi-compare-empty",
			text: t("compare.selectHint"),
		});
	}

	// ---------------------------------------------------------------------------
	// 比較計算 (BFS最短経路 + 集合演算)
	// ---------------------------------------------------------------------------
	private computeComparison(nodeA: GraphNode, nodeB: GraphNode, adj: Map<string, Set<string>>): ComparisonResult {
		const neighborsA = adj.get(nodeA.id) ?? new Set<string>();
		const neighborsB = adj.get(nodeB.id) ?? new Set<string>();

		// 共通隣接ノード (自分自身を除外)
		const sharedNeighbors: string[] = [];
		for (const id of neighborsA) {
			if (id !== nodeA.id && id !== nodeB.id && neighborsB.has(id)) {
				sharedNeighbors.push(id);
			}
		}

		// A固有の隣接ノード
		const uniqueToA: string[] = [];
		for (const id of neighborsA) {
			if (id !== nodeB.id && !neighborsB.has(id)) {
				uniqueToA.push(id);
			}
		}

		// B固有の隣接ノード
		const uniqueToB: string[] = [];
		for (const id of neighborsB) {
			if (id !== nodeA.id && !neighborsA.has(id)) {
				uniqueToB.push(id);
			}
		}

		// 共通タグ
		const tagsA = new Set(nodeA.tags ?? []);
		const tagsB = new Set(nodeB.tags ?? []);
		const sharedTags: string[] = [];
		const uniqueTagsA: string[] = [];
		const uniqueTagsB: string[] = [];
		for (const t of tagsA) {
			if (tagsB.has(t)) sharedTags.push(t);
			else uniqueTagsA.push(t);
		}
		for (const t of tagsB) {
			if (!tagsA.has(t)) uniqueTagsB.push(t);
		}

		// 共通カテゴリ
		const sharedCategories: string[] = [];
		if (nodeA.category && nodeB.category && nodeA.category === nodeB.category) {
			sharedCategories.push(nodeA.category);
		}

		// BFS最短経路
		const shortestPath = this.bfs(adj, nodeA.id, nodeB.id);
		const pathLength = shortestPath ? shortestPath.length - 1 : -1;

		return {
			sharedNeighbors,
			uniqueToA,
			uniqueToB,
			sharedTags,
			uniqueTagsA,
			uniqueTagsB,
			sharedCategories,
			shortestPath,
			pathLength,
		};
	}

	/** BFS最短経路探索 */
	private bfs(adj: Map<string, Set<string>>, startId: string, endId: string): string[] | null {
		if (startId === endId) return [startId];
		const visited = new Set<string>([startId]);
		const parent = new Map<string, string>();
		const queue: string[] = [startId];

		while (queue.length > 0) {
			const current = queue.shift()!;
			if (current === endId) break;
			const neighbors = adj.get(current);
			if (!neighbors) continue;
			for (const n of neighbors) {
				if (!visited.has(n)) {
					visited.add(n);
					parent.set(n, current);
					queue.push(n);
				}
			}
		}

		if (!parent.has(endId)) return null;

		const path: string[] = [];
		let cur = endId;
		while (cur !== startId) {
			path.unshift(cur);
			cur = parent.get(cur)!;
		}
		path.unshift(startId);
		return path;
	}

	// ---------------------------------------------------------------------------
	// 比較パネルの描画
	// ---------------------------------------------------------------------------
	private renderComparison(data: CompareEvent) {
		if (!this.bodyEl) return;
		this.bodyEl.empty();

		const { nodeA, nodeB, adj, pixiNodes } = data;
		const result = this.computeComparison(nodeA, nodeB, adj);

		// HP: A11y — comparison panel as ARIA region with descriptive label
		const wrap = this.bodyEl.createDiv({
			cls: "gi-compare-wrap",
			attr: { role: "region", "aria-label": `${nodeA.label} vs ${nodeB.label}` },
		});

		// === ツールバー: クリアボタン ===
		const toolbar = wrap.createEl("div", { cls: "gi-compare-toolbar" });
		const clearBtn = toolbar.createEl("button", {
			cls: "gi-compare-clear-btn",
			text: t("compare.clear"),
		});
		setIcon(clearBtn.createSpan({ cls: "gi-compare-clear-icon" }), "x");
		clearBtn.addEventListener("click", () => {
			// クリアイベントを発火 (nullペイロード)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom workspace event
			this.app.workspace.trigger(EVENT_COMPARE_NODES as any, null);
		});

		// === ヘッダー: ノードA vs ノードB ===
		const header = wrap.createEl("div", { cls: "gi-compare-header" });
		this.renderNodeCard(header, nodeA, "A");
		header.createEl("span", { cls: "gi-compare-vs", text: "vs" });
		this.renderNodeCard(header, nodeB, "B");

		// === 最短経路 === (A11y: ARIA landmark for screen readers)
		const pathSection = wrap.createEl("section", {
			cls: "gi-compare-section",
			attr: { "aria-label": t("compare.shortestPath") ?? "Shortest path" },
		});
		const pathLabel = pathSection.createEl("div", { cls: "gi-detail-section-label" });
		pathLabel.textContent = t("compare.shortestPath");
		if (result.shortestPath) {
			pathLabel.textContent += ` — ${t("compare.hops").replace("{n}", String(result.pathLength))}`;
			const pathList = pathSection.createEl("div", { cls: "gi-compare-path" });
			for (let i = 0; i < result.shortestPath.length; i++) {
				if (i > 0) pathList.createEl("span", { cls: "gi-compare-arrow", text: " → " });
				const nodeId = result.shortestPath[i];
				const pn = pixiNodes.get(nodeId);
				const label = pn?.data.label ?? nodeId;
				const pathNode = pathList.createEl("span", { cls: "gi-ni-link", text: label });
				this.attachNodeInteraction(pathNode, nodeId, pn);
			}
		} else {
			pathSection.createEl("div", { cls: "gi-compare-no-path", text: t("compare.noPath") });
		}

		// === 共通隣接ノード ===
		if (result.sharedNeighbors.length > 0) {
			this.renderNodeList(
				wrap,
				`${t("compare.sharedNeighbors")} (${result.sharedNeighbors.length})`,
				result.sharedNeighbors,
				pixiNodes,
			);
		}

		// === A固有の隣接ノード ===
		if (result.uniqueToA.length > 0) {
			this.renderNodeList(
				wrap,
				`${t("compare.uniqueTo").replace("{name}", nodeA.label)} (${result.uniqueToA.length})`,
				result.uniqueToA,
				pixiNodes,
			);
		}

		// === B固有の隣接ノード ===
		if (result.uniqueToB.length > 0) {
			this.renderNodeList(
				wrap,
				`${t("compare.uniqueTo").replace("{name}", nodeB.label)} (${result.uniqueToB.length})`,
				result.uniqueToB,
				pixiNodes,
			);
		}

		// === 共通タグ ===
		if (result.sharedTags.length > 0) {
			const tagSection = wrap.createEl("details", { cls: "gi-detail-collapsible" });
			tagSection.open = true;
			tagSection.createEl("summary", {
				cls: "gi-detail-section-label",
				text: `${t("compare.sharedTags")} (${result.sharedTags.length})`,
			});
			const tagRow = tagSection.createEl("div", { cls: "gi-detail-tags" });
			for (const tag of result.sharedTags) {
				tagRow.createEl("span", { cls: "gi-tag-pill", text: `#${tag}` });
			}
		}

		// === 共通カテゴリ ===
		if (result.sharedCategories.length > 0) {
			const catSection = wrap.createEl("div", {
				cls: "gi-compare-section",
				attr: { "aria-label": t("compare.sharedCategories") ?? "Shared categories" },
			});
			catSection.createEl("div", {
				cls: "gi-detail-section-label",
				text: `${t("compare.sharedCategories")}: ${result.sharedCategories.join(", ")}`,
			});
		}
	}

	// ---------------------------------------------------------------------------
	// ノードカード (ヘッダーのA/B表示)
	// ---------------------------------------------------------------------------
	private renderNodeCard(parent: HTMLElement, node: GraphNode, label: string) {
		const card = parent.createEl("div", { cls: "gi-compare-node-card" });
		const nameEl = card.createEl("div", { cls: "gi-compare-node-name" });
		const nameLink = nameEl.createEl("span", { cls: "gi-ni-link", text: node.label });
		nameLink.prepend(document.createTextNode(`${label}: `));
		if (node.filePath) {
			nameLink.addEventListener("click", () => {
				this.app.workspace.openLinkText(node.filePath!, "", false);
			});
		}
		// タグ表示
		if (node.tags && node.tags.length > 0) {
			const tagRow = card.createEl("div", { cls: "gi-detail-tags" });
			for (const tag of node.tags) {
				tagRow.createEl("span", { cls: "gi-tag-pill gi-tag-pill-small", text: `#${tag}` });
			}
		}
	}

	// ---------------------------------------------------------------------------
	// ノードリスト (折りたたみ可能)
	// ---------------------------------------------------------------------------
	private renderNodeList(parent: HTMLElement, title: string, nodeIds: string[], pixiNodes: Map<string, PixiNode>) {
		const details = parent.createEl("details", { cls: "gi-detail-collapsible", attr: { "aria-label": title } });
		details.open = true;
		details.createEl("summary", { cls: "gi-detail-section-label", text: title });

		const list = details.createEl("ul", { cls: "gi-ni-list" });
		for (const nodeId of nodeIds) {
			const pn = pixiNodes.get(nodeId);
			const label = pn?.data.label ?? nodeId;

			const li = list.createEl("li", { cls: "gi-ni-list-item-wrap" });
			const row = li.createEl("div", { cls: "gi-ni-item-row" });
			const link = row.createEl("span", { cls: "gi-ni-link", text: label });
			if (pn?.data.isTag) {
				row.createEl("span", { cls: "gi-ni-badge", text: "tag" });
			}
			this.attachNodeInteraction(link, nodeId, pn);
		}
	}

	// ---------------------------------------------------------------------------
	// ノードのクリック・ホバー操作をアタッチ
	// ---------------------------------------------------------------------------
	private attachNodeInteraction(el: HTMLElement, nodeId: string, pn: PixiNode | undefined) {
		// クリック → ファイルを開く
		if (pn?.data.filePath) {
			el.addEventListener("click", () => {
				this.app.workspace.openLinkText(pn.data.filePath!, "", false);
			});
		}
		// ホバー → グラフ上でハイライト
		el.addEventListener("mouseenter", () => {
			this.triggerHighlight(new Set([nodeId]));
		});
		el.addEventListener("mouseleave", () => {
			this.triggerHighlight(null);
		});
	}
}
