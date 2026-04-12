// ---------------------------------------------------------------------------
// DiffOverlay.ts — スナップショット差分のビジュアルオーバーレイ
// ---------------------------------------------------------------------------
// Canvas2D コンテキストに直接描画するポストレンダーパス。
// 既存のインタラクション（ホバー、クリック、ドラッグ）に干渉しない。
// ---------------------------------------------------------------------------

import type { SnapshotDiff, SnapshotNode } from "../types";
import type { PixiNode } from "./InteractionManager";
import { t } from "../i18n";

// ---------------------------------------------------------------------------
// 描画定数
// ---------------------------------------------------------------------------

/** 追加ノードのリング色（緑） */
const ADDED_COLOR = "#22c55e";
/** 削除ノードの色（グレー） */
const REMOVED_COLOR = "#9ca3af";
/** 削除ノードのフィルアルファ */
const REMOVED_ALPHA = 0.3;

/** メタデータ変更ノードのリング色（黄色） */
const CHANGED_COLOR = "#eab308";
/** 追加エッジの色（緑） */
const ADDED_EDGE_COLOR = "#22c55e";
/** 削除エッジの色（赤） */
const REMOVED_EDGE_COLOR = "#ef4444";

/** リングの線幅（px） */
const RING_LINE_WIDTH = 2;

/** ゴーストノードの半径（px） */
const GHOST_RADIUS = 6;
/** ゴーストノードのグリッド間隔（px） */
const GHOST_SPACING = 24;
/** ゴーストノードのラベルフォントサイズ（px） */
const GHOST_FONT_SIZE = 9;
/** ゴーストエリアのビューポート端からのマージン（px） */
const GHOST_MARGIN = 40;

/** ステータスバーの背景色 */
const STATUS_BG = "rgba(0, 0, 0, 0.6)";
/** ステータスバーのテキスト色 */
const STATUS_TEXT_COLOR = "#ffffff";
/** ステータスバーのフォントサイズ（px） */
const STATUS_FONT_SIZE = 12;
/** ステータスバーの余白（px） */
const STATUS_PADDING = 8;

export class DiffOverlay {
	private diff: SnapshotDiff | null = null;
	private snapshotName = "";
	/** Animation phase (0–1, cycles over time) for pulse effects */
	private _pulsePhase = 0;
	private _pulseStart = 0;
	/** Navigable node IDs (non-ghost) for ↑/↓ keyboard navigation */
	private _navIds: string[] = [];
	private _navIndex = -1;

	/** 差分モードを有効化する */
	activate(diff: SnapshotDiff, snapshotName: string): void {
		this.diff = diff;
		this.snapshotName = snapshotName;
		this._pulseStart = performance.now();
	}

	/** 差分モードを無効化する */
	deactivate(): void {
		this.diff = null;
		this.snapshotName = "";
	}

	/** 差分モードが有効かどうか */
	isActive(): boolean {
		return this.diff !== null;
	}

	/** 差分の要約情報を取得する */
	getSummary(): { name: string; added: number; removed: number; changed: number } | null {
		if (!this.diff) return null;
		return {
			name: this.snapshotName,
			added: this.diff.addedNodeIds.size,
			removed: this.diff.removedNodes.length,
			changed: this.diff.changedNodeIds.size,
		};
	}

	/**
	 * 差分ハイライトを既存グラフの上に描画する。
	 * CanvasApp の onPostFlush コールバックから呼ばれる。
	 *
	 * @param ctx       Canvas2D 描画コンテキスト（DPR スケーリング済み）
	 * @param pixiNodes 現在の PixiNode マップ（位置情報の参照用）
	 * @param transform 現在のカメラ変換 {x, y, scale}
	 * @param viewport  ビューポートサイズ {width, height}（CSS px）
	 */
	render(
		ctx: CanvasRenderingContext2D,
		pixiNodes: Map<string, PixiNode>,
		transform: { x: number; y: number; scale: number },
		viewport: { width: number; height: number },
	): void {
		if (!this.diff) return;

		const { x: tx, y: ty, scale } = transform;

		// ワールド座標→スクリーン座標変換
		const toScreen = (wx: number, wy: number): [number, number] => {
			return [wx * scale + tx, wy * scale + ty];
		};

		// Pulse animation: 2-second cycle (0→1→0)
		// prefers-reduced-motion: disable pulse, use static highlight
		const reducedMotion =
			typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
		if (reducedMotion) {
			this._pulsePhase = 0;
		} else {
			const elapsed = (performance.now() - this._pulseStart) / 1000;
			this._pulsePhase = (Math.sin(elapsed * Math.PI) + 1) / 2; // 0–1 sine wave
		}
		const pulseScale = 1 + this._pulsePhase * 0.3; // 1.0–1.3 radius multiplier
		const pulseAlpha = 0.5 + this._pulsePhase * 0.3; // 0.5–0.8 alpha range

		// --- ノードリング描画（追加=緑、変更=黄） ---
		const ringLayers: Array<{ ids: Set<string>; color: string; alphaScale: number }> = [
			{ ids: this.diff.addedNodeIds, color: ADDED_COLOR, alphaScale: 1 },
			{ ids: this.diff.changedNodeIds, color: CHANGED_COLOR, alphaScale: 0.9 },
		];
		for (const { ids, color, alphaScale } of ringLayers) {
			ctx.strokeStyle = color;
			ctx.lineWidth = RING_LINE_WIDTH * pulseScale;
			ctx.globalAlpha = pulseAlpha * alphaScale;
			for (const nodeId of ids) {
				const pn = pixiNodes.get(nodeId);
				if (!pn) continue;
				const [sx, sy] = toScreen(pn.data.x, pn.data.y);
				const sr = (pn.radius * scale + 3) * pulseScale;
				ctx.beginPath();
				ctx.arc(sx, sy, sr, 0, Math.PI * 2);
				ctx.stroke();
			}
		}

		// --- 追加エッジ（緑の実線） ---
		ctx.strokeStyle = ADDED_EDGE_COLOR;
		ctx.lineWidth = 2;
		ctx.globalAlpha = 0.5;
		ctx.setLineDash([]);
		for (const edgeKey of this.diff.addedEdgeKeys) {
			const [src, tgt] = edgeKey.split("\0");
			const pnSrc = pixiNodes.get(src);
			const pnTgt = pixiNodes.get(tgt);
			if (!pnSrc || !pnTgt) continue;
			const [sx1, sy1] = toScreen(pnSrc.data.x, pnSrc.data.y);
			const [sx2, sy2] = toScreen(pnTgt.data.x, pnTgt.data.y);
			ctx.beginPath();
			ctx.moveTo(sx1, sy1);
			ctx.lineTo(sx2, sy2);
			ctx.stroke();
		}

		// --- ゴーストノード（削除されたノード、右下にグリッド配置） ---
		const ghostPositions = this._layoutGhostNodes(this.diff.removedNodes, viewport);
		this._renderGhostNodes(ctx, ghostPositions, this.diff.removedNodes);

		// --- 削除エッジ（赤い破線） ---
		this._renderRemovedEdges(ctx, pixiNodes, ghostPositions, this.diff.removedNodes, this.diff.removedEdges, toScreen);

		// --- ステータスバー（左下に表示） ---
		this._renderStatusBar(ctx, viewport);

		// グローバルアルファをリセット
		ctx.globalAlpha = 1;
	}

	/** ゴーストノード（削除済みノード）をドット+ラベルで描画する */
	private _renderGhostNodes(
		ctx: CanvasRenderingContext2D,
		ghostPositions: Array<{ x: number; y: number }>,
		removedNodes: SnapshotNode[],
	): void {
		ctx.fillStyle = REMOVED_COLOR;
		ctx.globalAlpha = REMOVED_ALPHA;
		for (const { x, y } of ghostPositions) {
			ctx.beginPath();
			ctx.arc(x, y, GHOST_RADIUS, 0, Math.PI * 2);
			ctx.fill();
		}

		// ラベル
		ctx.fillStyle = REMOVED_COLOR;
		ctx.globalAlpha = 0.5;
		ctx.font = `${GHOST_FONT_SIZE}px sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		for (let i = 0; i < ghostPositions.length; i++) {
			const { x, y } = ghostPositions[i];
			ctx.fillText(ghostLabel(removedNodes[i].id), x, y + GHOST_RADIUS + 2);
		}

		// オーバーフロー表示
		const overflow = removedNodes.length - ghostPositions.length;
		if (overflow > 0 && ghostPositions.length > 0) {
			const last = ghostPositions[ghostPositions.length - 1];
			ctx.fillStyle = REMOVED_COLOR;
			ctx.globalAlpha = 0.6;
			ctx.font = `bold ${GHOST_FONT_SIZE + 1}px sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.fillText(`+${overflow} more`, last.x, last.y + GHOST_RADIUS + GHOST_FONT_SIZE + 4);
		}
	}

	/** 削除エッジを赤い破線で描画する */
	private _renderRemovedEdges(
		ctx: CanvasRenderingContext2D,
		pixiNodes: Map<string, PixiNode>,
		ghostPositions: Array<{ x: number; y: number }>,
		removedNodes: SnapshotNode[],
		removedEdges: Array<{ source: string; target: string }>,
		toScreen: (wx: number, wy: number) => [number, number],
	): void {
		ctx.strokeStyle = REMOVED_EDGE_COLOR;
		ctx.lineWidth = 1.5;
		ctx.globalAlpha = 0.4;
		ctx.setLineDash([4, 4]);

		const ghostPosMap = new Map<string, { x: number; y: number }>();
		for (let i = 0; i < ghostPositions.length; i++) {
			ghostPosMap.set(removedNodes[i].id, ghostPositions[i]);
		}

		for (const edge of removedEdges) {
			const srcPn = pixiNodes.get(edge.source);
			const tgtPn = pixiNodes.get(edge.target);
			const srcGhost = ghostPosMap.get(edge.source);
			const tgtGhost = ghostPosMap.get(edge.target);

			let sx1: number | undefined, sy1: number | undefined;
			let sx2: number | undefined, sy2: number | undefined;

			if (srcPn) {
				[sx1, sy1] = toScreen(srcPn.data.x, srcPn.data.y);
			} else if (srcGhost) {
				sx1 = srcGhost.x;
				sy1 = srcGhost.y;
			}

			if (tgtPn) {
				[sx2, sy2] = toScreen(tgtPn.data.x, tgtPn.data.y);
			} else if (tgtGhost) {
				sx2 = tgtGhost.x;
				sy2 = tgtGhost.y;
			}

			if (sx1 !== undefined && sy1 !== undefined && sx2 !== undefined && sy2 !== undefined) {
				ctx.beginPath();
				ctx.moveTo(sx1, sy1);
				ctx.lineTo(sx2, sy2);
				ctx.stroke();
			}
		}

		ctx.setLineDash([]);
	}

	/** 削除ノードをビューポート右下にグリッド配置する */
	private _layoutGhostNodes(
		removedNodes: SnapshotNode[],
		viewport: { width: number; height: number },
	): Array<{ x: number; y: number }> {
		return layoutGhostNodes(removedNodes.length, viewport);
	}

	/** ステータスバーを左下に描画する */
	private _renderStatusBar(ctx: CanvasRenderingContext2D, viewport: { width: number; height: number }): void {
		const summary = this.getSummary();
		if (!summary) return;

		const text = `Diff: vs '${summary.name}' — ${summary.added} added, ${summary.removed} removed, ${summary.changed} changed`;

		ctx.font = `${STATUS_FONT_SIZE}px sans-serif`;
		const metrics = ctx.measureText(text);
		const textW = metrics.width;
		const barH = STATUS_FONT_SIZE + STATUS_PADDING * 2;
		const barW = textW + STATUS_PADDING * 2;
		const barX = STATUS_PADDING;
		const barY = viewport.height - barH - STATUS_PADDING;

		// 背景
		ctx.globalAlpha = 0.7;
		ctx.fillStyle = STATUS_BG;
		ctx.beginPath();
		ctx.roundRect(barX, barY, barW, barH, 4);
		ctx.fill();

		// テキスト
		ctx.globalAlpha = 1;
		ctx.fillStyle = STATUS_TEXT_COLOR;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillText(text, barX + STATUS_PADDING, barY + barH / 2);
	}

	// -----------------------------------------------------------------------
	// Phase 2: clickable diff list panel (DOM overlay)
	// -----------------------------------------------------------------------

	/**
	 * Build a clickable diff list DOM element showing added/removed/changed nodes.
	 * Each entry has a color badge and clicking pans to the node.
	 *
	 * @param container  Parent element to mount the list into
	 * @param getLabel   Resolve node ID → display label
	 * @param onNodeClick  Callback when a node entry is clicked (pan + highlight)
	 * @param onClose    Callback when close button is clicked
	 */
	buildDiffList(
		container: HTMLElement,
		getLabel: (id: string) => string,
		onNodeClick: (id: string) => void,
		onClose: () => void,
	): void {
		if (!this.diff) return;

		// Remove any previous diff list
		container.querySelector(".gi-diff-list")?.remove();

		const panel = container.createDiv({ cls: "gi-diff-list" });
		panel.style.cssText =
			"position:absolute;top:8px;right:8px;max-height:60vh;overflow-y:auto;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:6px;font-size:11px;z-index:20;min-width:180px;max-width:260px;box-shadow:0 2px 8px rgba(0,0,0,0.15);";

		// Header
		const header = panel.createDiv();
		header.style.cssText =
			"display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--background-modifier-border);";
		header.createEl("span", { text: t("diff.title").replace("{name}", this.snapshotName), attr: { style: "font-weight:600;" } });
		const closeBtn = header.createEl("button", {
			text: "\u00d7",
			attr: {
				"aria-label": t("a11y.closeDiffList"),
				style: "border:none;background:none;cursor:pointer;font-size:14px;padding:0 4px;",
			},
		});
		closeBtn.addEventListener("click", onClose);

		// Build navigable ID list (non-ghost only)
		this._navIds = [...this.diff.addedNodeIds, ...this.diff.changedNodeIds];
		this._navIndex = -1;

		// Panel-level keyboard navigation
		panel.setAttribute("tabindex", "0");
		panel.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				if (this._navIds.length === 0) return;
				if (e.key === "ArrowDown") {
					this._navIndex = Math.min(this._navIndex + 1, this._navIds.length - 1);
				} else {
					this._navIndex = Math.max(this._navIndex - 1, 0);
				}
				onNodeClick(this._navIds[this._navIndex]);
				// Highlight active row
				const items = panel.querySelectorAll(".gi-diff-list-item");
				items.forEach((item: Element) => ((item as HTMLElement).style.background = ""));
				if (items[this._navIndex]) {
					(items[this._navIndex] as HTMLElement).style.background = "var(--background-modifier-hover)";
					(items[this._navIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
				}
			} else if (e.key === "Escape") {
				onClose();
			}
		});

		const sections: Array<{ title: string; ids: string[]; color: string; ghost?: boolean }> = [
			{ title: `Added (${this.diff.addedNodeIds.size})`, ids: [...this.diff.addedNodeIds], color: ADDED_COLOR },
			{
				title: `Changed (${this.diff.changedNodeIds.size})`,
				ids: [...this.diff.changedNodeIds],
				color: CHANGED_COLOR,
			},
			{
				title: `Removed (${this.diff.removedNodes.length})`,
				ids: this.diff.removedNodes.map((n) => n.id),
				color: REMOVED_COLOR,
				ghost: true,
			},
		];

		for (const sec of sections) {
			if (sec.ids.length === 0) continue;
			const secEl = panel.createDiv();
			secEl.createEl("div", {
				text: sec.title,
				attr: { style: `font-weight:600;color:${sec.color};margin:4px 0 2px;` },
			});
			for (const id of sec.ids.slice(0, 50)) {
				// cap at 50 entries
				const label = getLabel(id);
				const row = secEl.createDiv({
					cls: "gi-diff-list-item",
					attr: {
						role: "button",
						tabindex: "0",
						"aria-label": `${sec.ghost ? "Removed" : "Jump to"}: ${label}`,
					},
				});
				row.style.cssText =
					"display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;border-radius:3px;";
				row.addEventListener("mouseenter", () => {
					row.style.background = "var(--background-modifier-hover)";
				});
				row.addEventListener("mouseleave", () => {
					row.style.background = "";
				});

				// Color badge
				const badge = row.createDiv();
				badge.style.cssText = `width:8px;height:8px;border-radius:50%;background:${sec.color};flex-shrink:0;`;

				row.createEl("span", {
					text: label,
					attr: { style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" },
				});

				if (!sec.ghost) {
					row.addEventListener("click", () => onNodeClick(id));
					row.addEventListener("keydown", (e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onNodeClick(id);
						}
					});
				} else {
					row.style.opacity = "0.6";
					row.style.cursor = "default";
				}
			}
			if (sec.ids.length > 50) {
				secEl.createEl("div", {
					text: `+${sec.ids.length - 50} more...`,
					attr: { style: "color:var(--text-muted);font-style:italic;padding:2px 4px;" },
				});
			}
		}
	}

	/** Remove the diff list DOM panel */
	removeDiffList(container: HTMLElement): void {
		container.querySelector(".gi-diff-list")?.remove();
		this._navIds = [];
		this._navIndex = -1;
	}

	/** Get current navigation index and total (for testing/a11y) */
	getNavState(): { index: number; total: number } {
		return { index: this._navIndex, total: this._navIds.length };
	}
}

// ---------------------------------------------------------------------------
// テスト可能な純粋関数
// ---------------------------------------------------------------------------

/**
 * ゴーストノードのグリッド配置を計算する純粋関数。
 * ビューポート右下からグリッド状に配置し、画面高さの70%を超えないよう制限する。
 *
 * @param count     削除ノード数
 * @param viewport  ビューポートサイズ
 * @returns 表示可能なゴーストノードの位置配列（count より短い場合あり）
 */
export function layoutGhostNodes(
	count: number,
	viewport: { width: number; height: number },
): Array<{ x: number; y: number }> {
	if (count <= 0) return [];

	const cols = Math.max(1, Math.floor((viewport.width * 0.3) / GHOST_SPACING));
	const startX = viewport.width - GHOST_MARGIN;
	const startY = viewport.height - GHOST_MARGIN;

	const maxRows = Math.max(1, Math.floor((viewport.height * 0.7) / GHOST_SPACING));
	const maxVisible = maxRows * cols;
	const visible = Math.min(count, maxVisible);

	const positions: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < visible; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		positions.push({
			x: startX - col * GHOST_SPACING,
			y: startY - row * GHOST_SPACING,
		});
	}
	return positions;
}

/** ゴーストノードのラベルを生成する（IDからファイル名を抽出し省略） */
export function ghostLabel(nodeId: string, maxLen = 12): string {
	const name = nodeId.split("/").pop()?.replace(/\.md$/, "") ?? nodeId;
	return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

// ---------------------------------------------------------------------------
// Snapshot Timeline — pure data functions
// ---------------------------------------------------------------------------

/** A single point in the snapshot timeline */
interface TimelineEntry {
	name: string;
	createdAt: string;
	nodeCount: number;
	edgeCount: number;
	/** Delta from previous snapshot (undefined for first entry) */
	nodeDelta?: number;
	edgeDelta?: number;
}

/**
 * Build timeline entries from an array of snapshots.
 * Pure function — no DOM or side effects.
 *
 * @param snapshots  Array of GraphSnapshot (sorted by createdAt)
 * @returns Timeline entries with deltas computed between consecutive snapshots
 */
export function buildTimelineEntries(
	snapshots: ReadonlyArray<{
		name: string;
		createdAt: string;
		context: { nodeCount: number; edgeCount: number };
	}>,
): TimelineEntry[] {
	if (snapshots.length === 0) return [];

	// Sort by createdAt ascending
	const sorted = [...snapshots].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

	return sorted.map((snap, i) => {
		const entry: TimelineEntry = {
			name: snap.name,
			createdAt: snap.createdAt,
			nodeCount: snap.context.nodeCount,
			edgeCount: snap.context.edgeCount,
		};
		if (i > 0) {
			entry.nodeDelta = snap.context.nodeCount - sorted[i - 1].context.nodeCount;
			entry.edgeDelta = snap.context.edgeCount - sorted[i - 1].context.edgeCount;
		}
		return entry;
	});
}

/**
 * Format a delta value as a signed string with color hint.
 * @returns { text: string; color: "green" | "red" | "muted" }
 */
export function formatDelta(delta: number | undefined): { text: string; color: "green" | "red" | "muted" } {
	if (delta === undefined || delta === 0) return { text: "—", color: "muted" };
	if (delta > 0) return { text: `+${delta}`, color: "green" };
	return { text: String(delta), color: "red" };
}

/**
 * Format an ISO-8601 timestamp as a locale-aware short date/time string.
 * Pure function — no side effects.
 *
 * @param isoString  ISO-8601 date string (e.g. "2026-03-23T09:06:47")
 * @param locale     BCP 47 locale (defaults to user's browser locale)
 * @returns Formatted string like "3/23 09:06" or "23.03. 09:06" depending on locale
 */
export function formatSnapshotDate(isoString: string, locale?: string): string {
	try {
		const date = new Date(isoString);
		if (isNaN(date.getTime())) return isoString;
		return new Intl.DateTimeFormat(locale, {
			month: "numeric",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).format(date);
	} catch (_e) {
		return isoString; // fallback for invalid input
	}
}
