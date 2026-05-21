import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { buildGraph } from "./parser";
import { layout, type LaidOut, type PositionedNode, type SizedNode } from "./layout";
import type { MiniSettings, GraphNode } from "./types";
import {
	CARD_TITLE_FONT_PX,
	CARD_BODY_FONT_PX,
	CARD_LINE_HEIGHT_PX,
	CARD_BODY_LINE_HEIGHT_PX,
	CARD_PAD_X,
	CARD_PAD_Y,
	CARD_TITLE_BODY_GAP,
	CARD_MIN_W,
	CARD_MAX_W,
} from "./types";

export const VIEW_TYPE_MINI = "graph-island-mini";

const HOVER_DELAY_MS = 350;
const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = -8;
const CARD_RADIUS_PX = 4;

// Internal cache: maps file path → pre-processed body preview (post-frontmatter,
// trimmed). Persists across rebuilds so we don't re-read 2k+ files every time
// metadataCache fires "resolved".
type CardContent = { title: string; body: string; bodyLines: string[]; width: number; height: number };

type HoverTarget =
	| { kind: "node"; nodeId: string }
	| { kind: "cluster"; group: string }
	| null;

export class MiniGraphView extends ItemView {
	private canvas!: HTMLCanvasElement;
	private ctx!: CanvasRenderingContext2D;
	private root!: HTMLElement;
	private laid: LaidOut = { nodes: [], edges: [], clusters: [] };
	private panX = 0;
	private panY = 0;
	private zoom = 1;
	private dragging = false;
	private lastX = 0;
	private lastY = 0;
	private rafId = 0;
	private resizeObs?: ResizeObserver;
	private hoverTimer = 0;
	private hoverTarget: HoverTarget = null;
	private tipEl: HTMLDivElement | null = null;
	private hoverGen = 0;
	private marqueeEl: HTMLDivElement | null = null;
	private marqueeStart: { sx: number; sy: number } | null = null;
	private marqueeArmed = false;
	private highlightedNodes: Set<string> = new Set();
	private highlightedEdgeIdx: Set<number> = new Set();
	private adjacency: Map<string, number[]> = new Map();
	private moveTarget:
		| { kind: "node"; id: string; startWX: number; startWY: number; baseDx: number; baseDy: number }
		| { kind: "cluster"; group: string; startWX: number; startWY: number; baseDx: number; baseDy: number }
		| null = null;
	private moveHappened = false;
	private bodyCache: Map<string, string> = new Map();
	private cardCache: Map<string, CardContent> = new Map();
	private rebuildGen = 0;
	private clusterLabels: Map<string, string> = new Map();
	private whereError = "";
	private groupByError = "";
	private panelEl: HTMLDivElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private settings: MiniSettings,
		private save: () => Promise<void>,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_MINI;
	}
	getDisplayText(): string {
		return "Graph Island Mini";
	}
	getIcon(): string {
		return "git-fork";
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.style.padding = "0";
		root.style.overflow = "hidden";
		root.style.position = "relative";
		this.root = root;

		this.canvas = root.createEl("canvas");
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.canvas.style.display = "block";
		this.canvas.style.cursor = "grab";
		this.ctx = this.canvas.getContext("2d")!;

		this.addAction("square-dashed-mouse-pointer", "Marquee zoom (or Shift+drag)", () => this.armMarquee());
		this.addAction("zoom-in", "Zoom in", () => this.zoomBy(1.4));
		this.addAction("zoom-out", "Zoom out", () => this.zoomBy(1 / 1.4));
		this.addAction("maximize", "Fit to view", () => this.fitToView());

		this.attachInputs();
		this.resizeObs = new ResizeObserver(() => this.resize());
		this.resizeObs.observe(root);

		this.registerEvent(this.app.metadataCache.on("resolved", () => this.rebuild()));
		this.registerEvent(
			this.app.vault.on("create", (f) => {
				if (!(f instanceof TFile)) return;
				this.rebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (f) => {
				if (!(f instanceof TFile)) return;
				this.bodyCache.delete(f.path);
				this.cardCache.delete(f.path);
				this.rebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (f, oldPath) => {
				if (!(f instanceof TFile)) return;
				this.bodyCache.delete(oldPath);
				this.cardCache.delete(oldPath);
				this.rebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (f) => {
				if (!(f instanceof TFile)) return;
				this.bodyCache.delete(f.path);
				this.cardCache.delete(f.path);
				this.rebuild();
			}),
		);

		this.addAction("sliders-horizontal", "Toggle graph settings", () => this.togglePanel());

		void this.rebuild();
		this.resize();
		if (this.settings.panelVisible) this.renderPanel();
	}

	private togglePanel(): void {
		this.settings.panelVisible = !this.settings.panelVisible;
		void this.save();
		if (this.settings.panelVisible) this.renderPanel();
		else this.tearDownPanel();
	}

	async onClose(): Promise<void> {
		this.resizeObs?.disconnect();
		cancelAnimationFrame(this.rafId);
		this.cancelHover();
		this.tearDownPanel();
	}

	// ---- Settings panel (in-view, Obsidian-core-graph-style) ----

	private tearDownPanel(): void {
		this.panelEl?.remove();
		this.panelEl = null;
	}

	private renderPanel(): void {
		if (!this.settings.panelVisible) {
			this.tearDownPanel();
			return;
		}
		if (!this.panelEl) {
			this.panelEl = this.root.createDiv({ cls: "gim-panel" });
		}
		const el = this.panelEl;
		el.empty();

		const header = el.createDiv({ cls: "gim-panel-header" });
		header.createEl("h3", { text: "Graph settings" });
		const closeBtn = header.createEl("button", { cls: "gim-panel-close", text: "×" });
		closeBtn.setAttr("aria-label", "Close settings");
		closeBtn.addEventListener("click", () => this.togglePanel());

		this.renderExprSection(el, "WHERE", this.settings.where, this.whereError);
		this.renderExprSection(el, "GROUP_BY", this.settings.groupBy, this.groupByError);
		this.renderToggleSection(el, "Node display", [
			{ key: "showBody", label: "Show body preview" },
		]);
		this.renderToggleSection(el, "Graph display", [
			{ key: "showEnclosures", label: "Show enclosures" },
			{ key: "showEdges", label: "Show edges" },
		]);
	}

	private renderToggleSection(
		parent: HTMLElement,
		heading: string,
		toggles: { key: "showBody" | "showEnclosures" | "showEdges"; label: string }[],
	): void {
		const section = parent.createDiv({ cls: "gim-panel-section" });
		section.createEl("h4", { text: heading });
		for (const t of toggles) {
			const row = section.createEl("label", { cls: "gim-toggle-row" });
			const cb = row.createEl("input", { type: "checkbox" });
			cb.checked = this.settings[t.key];
			cb.addEventListener("change", () => {
				this.settings[t.key] = cb.checked;
				void this.save();
			});
			row.createSpan({ text: t.label });
		}
	}

	private renderExprSection(
		parent: HTMLElement,
		label: string,
		rows: string[],
		error: string,
	): void {
		const section = parent.createDiv({ cls: "gim-panel-section" });
		section.createEl("h4", { text: label });

		// Ensure at least one editable row is shown so users can type into it.
		const displayRows = rows.length > 0 ? rows : [""];

		displayRows.forEach((value, idx) => {
			const row = section.createDiv({ cls: "gim-expr-row" });
			const input = row.createEl("input", { type: "text", cls: "gim-expr" });
			input.value = value;
			input.placeholder = "e.g. tag:#wip AND status:draft";
			input.spellcheck = false;
			input.addEventListener("change", () => {
				this.updateRow(rows, idx, input.value.trim());
			});
			const del = row.createEl("button", { cls: "gim-expr-del", text: "×" });
			del.setAttr("aria-label", "Remove row");
			del.disabled = rows.length === 0;
			del.addEventListener("click", () => this.removeRow(rows, idx));
		});

		const addBtn = section.createEl("button", { cls: "gim-expr-add", text: "+ Add row" });
		addBtn.addEventListener("click", () => this.addRow(rows));

		if (error) section.createDiv({ cls: "gim-expr-msg", text: error });
	}

	private updateRow(rows: string[], idx: number, value: string): void {
		// Re-materialize: a blank value should disappear so empty rows don't
		// silently pile up in the saved settings.
		if (rows.length === 0) {
			if (value) rows.push(value);
		} else {
			if (value) rows[idx] = value;
			else rows.splice(idx, 1);
		}
		void this.save();
	}

	private addRow(rows: string[]): void {
		rows.push("");
		this.renderPanel();
	}

	private removeRow(rows: string[], idx: number): void {
		if (rows.length === 0) return;
		rows.splice(idx, 1);
		void this.save();
	}

	updateSettings(s: MiniSettings): void {
		const sizingChanged =
			s.cardMaxChars !== this.settings.cardMaxChars ||
			s.showBody !== this.settings.showBody;
		this.settings = s;
		if (sizingChanged) this.cardCache.clear();
		void this.rebuild();
	}

	private async rebuild(): Promise<void> {
		const gen = ++this.rebuildGen;
		const { result, errors } = buildGraph(
			this.app,
			this.settings.where,
			this.settings.groupBy,
		);
		this.whereError = errors.where ?? "";
		this.groupByError = errors.groupBy ?? "";
		const { data, clusterLabels } = result;
		this.clusterLabels = clusterLabels;
		await this.ensureBodies(data.nodes);
		if (gen !== this.rebuildGen) return;

		const sized = data.nodes.map((n) => this.cardFor(n));
		const wasEmpty = this.laid.clusters.length === 0;
		this.laid = layout(data, sized, {
			clusterSpacing: this.settings.clusterSpacing,
			nodeSpacing: this.settings.nodeSpacing,
			clusterOffsets: this.settings.clusterOffsets,
			nodeOffsets: this.settings.nodeOffsets,
			clusterLabels,
		});
		this.adjacency = new Map();
		this.laid.edges.forEach((e, i) => {
			const sa = this.adjacency.get(e.source);
			if (sa) sa.push(i); else this.adjacency.set(e.source, [i]);
			const ta = this.adjacency.get(e.target);
			if (ta) ta.push(i); else this.adjacency.set(e.target, [i]);
		});
		this.highlightedNodes.clear();
		this.highlightedEdgeIdx.clear();
		if (wasEmpty) this.fitToView();
		this.requestDraw();
		if (this.settings.panelVisible) this.renderPanel();
	}

	private async ensureBodies(nodes: GraphNode[]): Promise<void> {
		const missing = nodes.filter((n) => !this.bodyCache.has(n.id));
		if (missing.length === 0) return;
		await Promise.all(
			missing.map(async (n) => {
				const f = this.app.vault.getAbstractFileByPath(n.id);
				if (!(f instanceof TFile)) {
					this.bodyCache.set(n.id, "");
					return;
				}
				try {
					const raw = await this.app.vault.cachedRead(f);
					const stripped = raw.replace(/^---[\s\S]*?---\n?/, "").trim();
					this.bodyCache.set(n.id, stripped);
				} catch {
					this.bodyCache.set(n.id, "");
				}
			}),
		);
	}

	private cardFor(n: GraphNode): SizedNode {
		const cached = this.cardCache.get(n.id);
		if (cached && cached.title === n.label) {
			return { ...n, width: cached.width, height: cached.height };
		}
		const body = (this.bodyCache.get(n.id) ?? "").slice(0, this.settings.cardMaxChars);
		const card = this.measureCard(n.label, body);
		this.cardCache.set(n.id, card);
		return { ...n, width: card.width, height: card.height };
	}

	private measureCard(title: string, body: string): CardContent {
		const ctx = this.ctx;
		const padX = CARD_PAD_X;
		const padY = CARD_PAD_Y;
		const innerMax = CARD_MAX_W - 2 * padX;
		// Honour the showBody toggle at measurement time so cards stay compact
		// (title-only) when previews are off.
		const effectiveBody = this.settings.showBody ? body : "";

		// Title: single line. Width is the natural width capped at innerMax.
		ctx.font = `600 ${CARD_TITLE_FONT_PX}px sans-serif`;
		const titleW = Math.min(innerMax, Math.ceil(ctx.measureText(title).width));

		// Body: wrap to the maximum allowable inner width, then trim card width to
		// the actual longest line.
		ctx.font = `${CARD_BODY_FONT_PX}px sans-serif`;
		const bodyLines = effectiveBody ? wrapText(ctx, effectiveBody, innerMax) : [];
		let bodyMaxW = 0;
		for (const line of bodyLines) {
			const w = Math.ceil(ctx.measureText(line).width);
			if (w > bodyMaxW) bodyMaxW = w;
		}

		const innerW = Math.max(titleW, bodyMaxW);
		const width = Math.max(CARD_MIN_W, Math.min(CARD_MAX_W, innerW + 2 * padX));
		const titleH = CARD_LINE_HEIGHT_PX;
		const bodyH =
			bodyLines.length > 0
				? bodyLines.length * CARD_BODY_LINE_HEIGHT_PX + CARD_TITLE_BODY_GAP
				: 0;
		const height = padY + titleH + bodyH + padY;
		return { title, body, bodyLines, width, height };
	}

	private resize(): void {
		const dpr = window.devicePixelRatio || 1;
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		this.canvas.width = Math.max(1, Math.floor(w * dpr));
		this.canvas.height = Math.max(1, Math.floor(h * dpr));
		this.requestDraw();
	}

	private zoomBy(factor: number): void {
		const rect = this.canvas.getBoundingClientRect();
		const sx = rect.width / 2;
		const sy = rect.height / 2;
		const next = Math.max(0.005, Math.min(8, this.zoom * factor));
		const wx = (sx - this.panX) / this.zoom;
		const wy = (sy - this.panY) / this.zoom;
		this.zoom = next;
		this.panX = sx - wx * next;
		this.panY = sy - wy * next;
		this.cancelHover();
		this.requestDraw();
	}

	private fitToRect(world: { minX: number; minY: number; maxX: number; maxY: number }): void {
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		const pad = 24;
		const dw = Math.max(1, world.maxX - world.minX);
		const dh = Math.max(1, world.maxY - world.minY);
		const z = Math.min((w - 2 * pad) / dw, (h - 2 * pad) / dh);
		this.zoom = Math.min(8, Math.max(0.005, z));
		this.panX = w / 2 - ((world.minX + world.maxX) / 2) * this.zoom;
		this.panY = h / 2 - ((world.minY + world.maxY) / 2) * this.zoom;
		this.cancelHover();
		this.requestDraw();
	}

	private fitToView(): void {
		if (this.laid.clusters.length === 0) return;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const c of this.laid.clusters) {
			minX = Math.min(minX, c.x);
			minY = Math.min(minY, c.y);
			maxX = Math.max(maxX, c.x + c.width);
			maxY = Math.max(maxY, c.y + c.height);
		}
		// The settings panel overlays the right side of the canvas without
		// pushing it, so subtract its width from the effective fit area and
		// centre against the visible half.
		const panelW = this.settings.panelVisible && this.panelEl ? this.panelEl.offsetWidth : 0;
		const visW = Math.max(1, this.canvas.clientWidth - panelW);
		const visH = this.canvas.clientHeight;
		// Reserve canvas-pixel padding (zoom-independent). Top gets extra room
		// for cluster labels which sit ~20 canvas px above each enclosure.
		const padX = 20;
		const padTop = 36;
		const padBottom = 20;
		const fitW = Math.max(1, visW - 2 * padX);
		const fitH = Math.max(1, visH - padTop - padBottom);
		const zx = fitW / Math.max(1, maxX - minX);
		const zy = fitH / Math.max(1, maxY - minY);
		// Min floor is intentionally very low so huge vaults still fit on
		// screen; the user can zoom in interactively as needed.
		this.zoom = Math.min(2, Math.max(0.005, Math.min(zx, zy)));
		const worldCenterX = (minX + maxX) / 2;
		const worldCenterY = (minY + maxY) / 2;
		this.panX = padX + fitW / 2 - worldCenterX * this.zoom;
		this.panY = padTop + fitH / 2 - worldCenterY * this.zoom;
		this.requestDraw();
	}

	private requestDraw(): void {
		cancelAnimationFrame(this.rafId);
		this.rafId = requestAnimationFrame(() => this.draw());
	}

	private draw(): void {
		const ctx = this.ctx;
		const dpr = window.devicePixelRatio || 1;
		const cw = this.canvas.width;
		const ch = this.canvas.height;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = "#0f1116";
		ctx.fillRect(0, 0, cw, ch);
		ctx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, dpr * this.panX, dpr * this.panY);

		// Outline-only enclosures: stroke colours are hue-distinct so the
		// boundaries stay readable when clusters overlap or nest. Fills are
		// intentionally absent — translucent fills stacked additively where
		// clusters intersect, producing murky regions.
		if (this.settings.showEnclosures) {
			const sortedClusters = [...this.laid.clusters].sort(
				(a, b) => b.width * b.height - a.width * a.height,
			);
			const strokeW = 1.6 / this.zoom;
			for (const c of sortedClusters) {
				const hue = clusterHue(c.groupKey);
				ctx.strokeStyle = `hsla(${hue}, 70%, 62%, 0.9)`;
				ctx.lineWidth = strokeW;
				ctx.strokeRect(c.x, c.y, c.width, c.height);
			}
		}

		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		const hasHighlight = this.highlightedEdgeIdx.size > 0;
		const dim = "rgba(180,200,220,0.10)";
		const base = "rgba(180,200,220,0.55)";
		const accent = "#ff9d3f";
		const glow = "rgba(255,157,63,0.35)";

		// Layer 1: base edges (skip highlighted ones; we draw them on top later)
		if (this.settings.showEdges) {
			this.laid.edges.forEach((e, i) => {
				if (hasHighlight && this.highlightedEdgeIdx.has(i)) return;
				const path = e.path;
				if (!path || path.length < 2) return;
				ctx.strokeStyle = hasHighlight ? dim : base;
				const baseW = Math.max(0.6, Math.log2(1 + e.weight) * 1.1);
				ctx.lineWidth = baseW / this.zoom;
				ctx.beginPath();
				ctx.moveTo(path[0].x, path[0].y);
				for (let i2 = 1; i2 < path.length; i2++) ctx.lineTo(path[i2].x, path[i2].y);
				ctx.stroke();
			});
		}

		// Layer 2: base cards (covers the "stub" segment from edge port → card center)
		for (const n of this.laid.nodes) {
			if (this.highlightedNodes.has(n.id)) continue;
			this.drawCard(ctx, n, false);
		}

		// Layer 3: accent edges (drawn on top of base cards so they reach the focus card)
		if (hasHighlight && this.settings.showEdges) {
			this.laid.edges.forEach((e, i) => {
				if (!this.highlightedEdgeIdx.has(i)) return;
				const path = e.path;
				if (!path || path.length < 2) return;
				const baseW = Math.max(0.6, Math.log2(1 + e.weight) * 1.1);
				// Glow halo
				ctx.strokeStyle = glow;
				ctx.lineWidth = (baseW * 5) / this.zoom;
				ctx.beginPath();
				ctx.moveTo(path[0].x, path[0].y);
				for (let i2 = 1; i2 < path.length; i2++) ctx.lineTo(path[i2].x, path[i2].y);
				ctx.stroke();
				// Solid accent
				ctx.strokeStyle = accent;
				ctx.lineWidth = (baseW * 2.5) / this.zoom;
				ctx.beginPath();
				ctx.moveTo(path[0].x, path[0].y);
				for (let i2 = 1; i2 < path.length; i2++) ctx.lineTo(path[i2].x, path[i2].y);
				ctx.stroke();
			});
		}

		// Layer 4: accent cards on top
		for (const n of this.laid.nodes) {
			if (!this.highlightedNodes.has(n.id)) continue;
			this.drawCard(ctx, n, true);
		}

		// Cluster labels above each enclosure, tinted with the cluster's hue
		// so they tie back visually to the matching enclosure.
		if (this.settings.showEnclosures) {
			const groupFontPx = 12 / this.zoom;
			ctx.font = `${groupFontPx}px sans-serif`;
			ctx.textBaseline = "middle";
			ctx.textAlign = "center";
			for (const c of this.laid.clusters) {
				const hue = clusterHue(c.groupKey);
				ctx.fillStyle = `hsla(${hue}, 65%, 70%, 1)`;
				const display = `${c.label} (${c.memberCount})`;
				const label = truncateToWidth(ctx, display, c.width);
				ctx.fillText(label, c.x + c.width / 2, c.y - 8 / this.zoom);
			}
			ctx.textAlign = "start";
		}
	}

	private drawCard(
		ctx: CanvasRenderingContext2D,
		n: PositionedNode,
		highlighted: boolean,
	): void {
		const x = n.x - n.width / 2;
		const y = n.y - n.height / 2;
		const w = n.width;
		const h = n.height;
		const r = Math.min(CARD_RADIUS_PX, w / 2, h / 2);

		ctx.beginPath();
		roundedRectPath(ctx, x, y, w, h, r);
		ctx.fillStyle = highlighted ? "#ffe7a8" : "#1d2230";
		ctx.fill();

		ctx.lineWidth = (highlighted ? 1.8 : 1) / this.zoom;
		ctx.strokeStyle = highlighted ? "#ff9d3f" : "#5a7ba8";
		ctx.beginPath();
		roundedRectPath(ctx, x, y, w, h, r);
		ctx.stroke();

		const card = this.cardCache.get(n.id);
		const bodyLines = card?.bodyLines ?? [];
		const innerLeft = x + CARD_PAD_X;
		const innerTop = y + CARD_PAD_Y;
		const innerRight = x + w - CARD_PAD_X;

		ctx.textAlign = "start";
		ctx.textBaseline = "top";

		ctx.font = `600 ${CARD_TITLE_FONT_PX}px sans-serif`;
		ctx.fillStyle = highlighted ? "#1d1100" : "#e6edf3";
		const titleFitted = truncateToWidth(ctx, n.label, innerRight - innerLeft);
		ctx.fillText(titleFitted, innerLeft, innerTop);

		if (bodyLines.length > 0 && this.settings.showBody) {
			ctx.font = `${CARD_BODY_FONT_PX}px sans-serif`;
			ctx.fillStyle = highlighted ? "#3a2400" : "#9eb0c4";
			let ly = innerTop + CARD_LINE_HEIGHT_PX + CARD_TITLE_BODY_GAP;
			for (const line of bodyLines) {
				ctx.fillText(line, innerLeft, ly);
				ly += CARD_BODY_LINE_HEIGHT_PX;
			}
		}
	}

	private screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
	}

	private hitTest(wx: number, wy: number): HoverTarget {
		// Cards are rectangles; pick the smallest-distance card hit so adjacent cards
		// don't beat each other when the cursor sits on the gap.
		let bestId: string | null = null;
		let bestDist2 = Infinity;
		const slackPx = 1 / this.zoom;
		for (const n of this.laid.nodes) {
			const left = n.x - n.width / 2 - slackPx;
			const right = n.x + n.width / 2 + slackPx;
			const top = n.y - n.height / 2 - slackPx;
			const bottom = n.y + n.height / 2 + slackPx;
			if (wx < left || wx > right || wy < top || wy > bottom) continue;
			const dx = wx - n.x;
			const dy = wy - n.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestDist2) {
				bestDist2 = d2;
				bestId = n.id;
			}
		}
		if (bestId) return { kind: "node", nodeId: bestId };
		for (const c of this.laid.clusters) {
			if (wx >= c.x && wx <= c.x + c.width && wy >= c.y && wy <= c.y + c.height) {
				return { kind: "cluster", group: c.groupKey };
			}
		}
		return null;
	}

	private openFile(id: string): void {
		this.app.workspace.openLinkText(id, "", false);
	}

	private clampClusterOffset(dx: number, dy: number): { dx: number; dy: number } {
		const max = Math.max(0, this.settings.clusterSpacing / 2 - 4);
		return {
			dx: Math.max(-max, Math.min(max, dx)),
			dy: Math.max(-max, Math.min(max, dy)),
		};
	}

	private clampNodeOffset(nodeId: string, dx: number, dy: number): { dx: number; dy: number } {
		const node = this.laid.nodes.find((n) => n.id === nodeId);
		// Multi-membership nodes have multiple enclosing rects; use the first as
		// the "home" cluster for drag clamping.
		const primary = node?.memberships[0];
		const cluster = primary
			? this.laid.clusters.find((c) => c.groupKey === primary)
			: null;
		if (!node || !cluster) return { dx, dy };
		// rel is the card-center position relative to the (un-offset) cluster origin.
		const rel = {
			x: node.x - cluster.x - (this.settings.nodeOffsets[nodeId]?.dx ?? 0),
			y: node.y - cluster.y - (this.settings.nodeOffsets[nodeId]?.dy ?? 0),
		};
		const halfW = node.width / 2;
		const halfH = node.height / 2;
		const minDx = halfW - rel.x;
		const maxDx = cluster.width - halfW - rel.x;
		const minDy = halfH - rel.y;
		const maxDy = cluster.height - halfH - rel.y;
		return {
			dx: Math.max(minDx, Math.min(maxDx, dx)),
			dy: Math.max(minDy, Math.min(maxDy, dy)),
		};
	}

	private onPointerMove(e: MouseEvent): void {
		if (this.dragging) {
			this.cancelHover();
			return;
		}
		const rect = this.canvas.getBoundingClientRect();
		const w = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
		const hit = this.hitTest(w.x, w.y);
		if (!sameTarget(this.hoverTarget, hit)) {
			this.cancelHover();
			this.hoverTarget = hit;
			this.applyHighlight(hit);
			if (hit) this.scheduleHover(hit, e.clientX - rect.left, e.clientY - rect.top);
		} else if (this.tipEl) {
			this.positionTip(e.clientX - rect.left, e.clientY - rect.top, this.tipEl);
		}
	}

	private applyHighlight(target: HoverTarget): void {
		this.highlightedEdgeIdx.clear();
		this.highlightedNodes.clear();
		if (!target || target.kind !== "node") {
			this.requestDraw();
			return;
		}
		const id = target.nodeId;
		this.highlightedNodes.add(id);
		const adj = this.adjacency.get(id);
		if (adj) for (const i of adj) this.highlightedEdgeIdx.add(i);
		this.requestDraw();
	}

	private scheduleHover(target: NonNullable<HoverTarget>, sx: number, sy: number): void {
		const gen = ++this.hoverGen;
		this.hoverTimer = window.setTimeout(() => {
			if (gen !== this.hoverGen) return;
			void this.showHover(target, sx, sy);
		}, HOVER_DELAY_MS);
	}

	private cancelHover(): void {
		this.hoverGen++;
		if (this.hoverTimer) {
			window.clearTimeout(this.hoverTimer);
			this.hoverTimer = 0;
		}
		if (this.tipEl) {
			this.tipEl.remove();
			this.tipEl = null;
		}
		this.hoverTarget = null;
		if (this.highlightedEdgeIdx.size > 0 || this.highlightedNodes.size > 0) {
			this.highlightedEdgeIdx.clear();
			this.highlightedNodes.clear();
			this.requestDraw();
		}
	}

	private async showHover(target: NonNullable<HoverTarget>, sx: number, sy: number): Promise<void> {
		const gen = this.hoverGen;
		const tip = document.createElement("div");
		tip.className = "gim-hover-tip gim-tip-" + target.kind;
		tip.setAttr("data-kind", target.kind);

		if (target.kind === "node") {
			const file = this.app.vault.getAbstractFileByPath(target.nodeId);
			if (!(file instanceof TFile)) return;
			tip.createSpan({ cls: "gim-tip-title", text: file.basename });
			tip.createSpan({ cls: "gim-tip-sub", text: file.parent?.path ?? "" });
			// Use the already-loaded body cache; show a richer preview than the
			// card itself (2× the card body limit, capped).
			const cached = this.bodyCache.get(target.nodeId) ?? "";
			const tipCap = Math.min(400, Math.max(200, this.settings.cardMaxChars * 2));
			if (gen !== this.hoverGen) return;
			if (cached) {
				const trimmed = cached.length > tipCap ? cached.slice(0, tipCap) + "…" : cached;
				tip.createDiv({ cls: "gim-tip-body", text: trimmed });
			}
		} else {
			const cl = this.laid.clusters.find((c) => c.groupKey === target.group);
			if (!cl) return;
			tip.createSpan({ cls: "gim-tip-title", text: cl.label });
			tip.createSpan({ cls: "gim-tip-sub", text: cl.memberCount + " items" });
		}

		this.root.appendChild(tip);
		this.tipEl = tip;
		this.positionTip(sx, sy, tip);
	}

	private armMarquee(): void {
		this.marqueeArmed = true;
		this.canvas.style.cursor = "crosshair";
		this.cancelHover();
	}

	private startMarquee(sx: number, sy: number): void {
		this.cancelHover();
		this.marqueeStart = { sx, sy };
		const el = document.createElement("div");
		el.className = "gim-marquee";
		el.style.left = sx + "px";
		el.style.top = sy + "px";
		el.style.width = "0px";
		el.style.height = "0px";
		this.root.appendChild(el);
		this.marqueeEl = el;
	}

	private updateMarquee(clientX: number, clientY: number): void {
		if (!this.marqueeStart || !this.marqueeEl) return;
		const rect = this.canvas.getBoundingClientRect();
		const sx = Math.max(0, Math.min(rect.width, clientX - rect.left));
		const sy = Math.max(0, Math.min(rect.height, clientY - rect.top));
		const x = Math.min(this.marqueeStart.sx, sx);
		const y = Math.min(this.marqueeStart.sy, sy);
		const w = Math.abs(sx - this.marqueeStart.sx);
		const h = Math.abs(sy - this.marqueeStart.sy);
		this.marqueeEl.style.left = x + "px";
		this.marqueeEl.style.top = y + "px";
		this.marqueeEl.style.width = w + "px";
		this.marqueeEl.style.height = h + "px";
	}

	private finishMarquee(clientX: number, clientY: number): void {
		if (!this.marqueeStart) return;
		const rect = this.canvas.getBoundingClientRect();
		const sx = clientX - rect.left;
		const sy = clientY - rect.top;
		const x0 = Math.min(this.marqueeStart.sx, sx);
		const y0 = Math.min(this.marqueeStart.sy, sy);
		const x1 = Math.max(this.marqueeStart.sx, sx);
		const y1 = Math.max(this.marqueeStart.sy, sy);
		this.cancelMarquee();
		if (x1 - x0 < 6 || y1 - y0 < 6) return;
		const a = this.screenToWorld(x0, y0);
		const b = this.screenToWorld(x1, y1);
		this.fitToRect({ minX: a.x, minY: a.y, maxX: b.x, maxY: b.y });
	}

	private cancelMarquee(): void {
		this.marqueeStart = null;
		this.marqueeArmed = false;
		this.canvas.style.cursor = "grab";
		if (this.marqueeEl) {
			this.marqueeEl.remove();
			this.marqueeEl = null;
		}
	}

	private positionTip(sx: number, sy: number, tip: HTMLElement): void {
		const rect = this.canvas.getBoundingClientRect();
		const tipW = tip.offsetWidth || 240;
		const tipH = tip.offsetHeight || 60;
		let x = sx + TOOLTIP_OFFSET_X;
		let y = sy + TOOLTIP_OFFSET_Y;
		if (x + tipW > rect.width) x = sx - tipW - TOOLTIP_OFFSET_X;
		if (y + tipH > rect.height) y = rect.height - tipH - 4;
		if (y < 4) y = 4;
		tip.style.left = x + "px";
		tip.style.top = y + "px";
	}

	private attachInputs(): void {
		const c = this.canvas;
		c.addEventListener("mousedown", (e) => {
			if (e.button !== 0) return;
			this.moveHappened = false;
			const rect = c.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			if (e.shiftKey || this.marqueeArmed) {
				this.startMarquee(sx, sy);
				e.preventDefault();
				return;
			}
			const w = this.screenToWorld(sx, sy);
			const hit = this.hitTest(w.x, w.y);
			if (hit?.kind === "node") {
				const cur = this.settings.nodeOffsets[hit.nodeId] ?? { dx: 0, dy: 0 };
				this.moveTarget = {
					kind: "node",
					id: hit.nodeId,
					startWX: w.x,
					startWY: w.y,
					baseDx: cur.dx,
					baseDy: cur.dy,
				};
				this.moveHappened = false;
				c.style.cursor = "move";
				this.cancelHover();
				return;
			}
			if (hit?.kind === "cluster") {
				const cur = this.settings.clusterOffsets[hit.group] ?? { dx: 0, dy: 0 };
				this.moveTarget = {
					kind: "cluster",
					group: hit.group,
					startWX: w.x,
					startWY: w.y,
					baseDx: cur.dx,
					baseDy: cur.dy,
				};
				this.moveHappened = false;
				c.style.cursor = "move";
				this.cancelHover();
				return;
			}
			this.dragging = true;
			this.lastX = e.clientX;
			this.lastY = e.clientY;
			c.style.cursor = "grabbing";
			this.cancelHover();
		});
		window.addEventListener("mousemove", (e) => {
			if (this.marqueeStart) {
				this.updateMarquee(e.clientX, e.clientY);
				return;
			}
			if (this.moveTarget) {
				const rect = c.getBoundingClientRect();
				const w = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
				const rawDx = this.moveTarget.baseDx + (w.x - this.moveTarget.startWX);
				const rawDy = this.moveTarget.baseDy + (w.y - this.moveTarget.startWY);
				if (this.moveTarget.kind === "node") {
					const { dx, dy } = this.clampNodeOffset(this.moveTarget.id, rawDx, rawDy);
					this.settings.nodeOffsets[this.moveTarget.id] = { dx, dy };
				} else {
					const { dx, dy } = this.clampClusterOffset(rawDx, rawDy);
					this.settings.clusterOffsets[this.moveTarget.group] = { dx, dy };
				}
				this.moveHappened = true;
				this.rebuild();
				return;
			}
			if (!this.dragging) return;
			this.panX += e.clientX - this.lastX;
			this.panY += e.clientY - this.lastY;
			this.lastX = e.clientX;
			this.lastY = e.clientY;
			this.requestDraw();
		});
		window.addEventListener("mouseup", (e) => {
			if (this.marqueeStart) {
				this.finishMarquee(e.clientX, e.clientY);
				return;
			}
			if (this.moveTarget) {
				const moved = this.moveHappened;
				this.moveTarget = null;
				c.style.cursor = "grab";
				if (moved) void this.save();
				// keep moveHappened set; click handler will consume + clear it
				return;
			}
			this.dragging = false;
			c.style.cursor = "grab";
		});
		window.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && this.marqueeStart) this.cancelMarquee();
		});
		c.addEventListener("contextmenu", (e) => {
			if (this.marqueeStart) {
				e.preventDefault();
				this.cancelMarquee();
			}
		});
		c.addEventListener("click", (e) => {
			if (e.shiftKey || this.marqueeStart || this.marqueeEl) return;
			if (this.moveHappened) {
				this.moveHappened = false;
				return;
			}
			const rect = c.getBoundingClientRect();
			const w = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
			const hit = this.hitTest(w.x, w.y);
			if (hit?.kind === "node") this.openFile(hit.nodeId);
		});
		c.addEventListener("mousemove", (e) => this.onPointerMove(e));
		c.addEventListener("mouseleave", () => this.cancelHover());
		c.addEventListener("wheel", (e) => {
			e.preventDefault();
			this.cancelHover();
			const rect = c.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const factor = Math.exp(-e.deltaY * 0.0015);
			const next = Math.max(0.005, Math.min(8, this.zoom * factor));
			const wx = (sx - this.panX) / this.zoom;
			const wy = (sy - this.panY) / this.zoom;
			this.zoom = next;
			this.panX = sx - wx * next;
			this.panY = sy - wy * next;
			this.requestDraw();
		}, { passive: false });
		c.addEventListener("dblclick", () => this.fitToView());
	}
}

function sameTarget(a: HoverTarget, b: HoverTarget): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind !== b.kind) return false;
	if (a.kind === "cluster" && b.kind === "cluster") return a.group === b.group;
	if (a.kind === "node" && b.kind === "node") return a.nodeId === b.nodeId;
	return false;
}

// Stable hue (0-359) derived from a cluster's groupKey. Uses a tiny string
// hash multiplied by the golden-angle constant so neighbouring clusters end up
// far apart on the colour wheel even when their keys are similar.
function clusterHue(key: string): number {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	const u = (h >>> 0) / 0xffffffff;
	return (u * 360 * 1.61803398875) % 360;
}

function roundedRectPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	const rr = Math.max(0, Math.min(r, w / 2, h / 2));
	ctx.moveTo(x + rr, y);
	ctx.lineTo(x + w - rr, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
	ctx.lineTo(x + w, y + h - rr);
	ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
	ctx.lineTo(x + rr, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
	ctx.lineTo(x, y + rr);
	ctx.quadraticCurveTo(x, y, x + rr, y);
}

// Word-aware wrapping with character-break fallback for over-long tokens
// (covers Japanese where there are no whitespace separators).
function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	maxLines: number = 8,
): string[] {
	if (maxWidth <= 0 || maxLines <= 0) return [];
	const lines: string[] = [];
	const paragraphs = text.split(/\n+/);
	outer: for (const para of paragraphs) {
		const tokens = para.match(/\S+|\s+/g) ?? [];
		let cur = "";
		for (const tok of tokens) {
			const candidate = cur + tok;
			if (ctx.measureText(candidate).width <= maxWidth) {
				cur = candidate;
				continue;
			}
			if (cur.trim()) {
				lines.push(cur.trimEnd());
				if (lines.length >= maxLines) break outer;
			}
			if (ctx.measureText(tok).width > maxWidth) {
				let chunk = "";
				for (const ch of tok) {
					const t = chunk + ch;
					if (ctx.measureText(t).width <= maxWidth) {
						chunk = t;
					} else {
						if (chunk) lines.push(chunk);
						if (lines.length >= maxLines) break outer;
						chunk = ch;
					}
				}
				cur = chunk;
			} else {
				cur = tok.trimStart();
			}
		}
		if (cur.trim() && lines.length < maxLines) lines.push(cur.trimEnd());
		if (lines.length >= maxLines) break;
	}
	if (lines.length > maxLines) lines.length = maxLines;
	// Add ellipsis on last line if text exceeded our line budget.
	if (lines.length === maxLines) {
		const last = lines[maxLines - 1];
		const withEll = last.replace(/\s+$/, "") + "…";
		if (ctx.measureText(withEll).width <= maxWidth) {
			lines[maxLines - 1] = withEll;
		} else {
			lines[maxLines - 1] = truncateToWidth(ctx, last, maxWidth);
		}
	}
	return lines;
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	const ell = "…";
	let lo = 0, hi = text.length;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (ctx.measureText(text.slice(0, mid) + ell).width <= maxWidth) lo = mid;
		else hi = mid - 1;
	}
	return lo === 0 ? ell : text.slice(0, lo) + ell;
}
