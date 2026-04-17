import { CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { IApp } from "./canvas2d/interfaces";
import { Menu, Platform, type App } from "obsidian";
import type { GraphNode, LayoutType, ShellInfo } from "../types";
import { repositionShell } from "../layouts/concentric";
import type { Simulation } from "d3-force";
import { LAYOUT_CONCENTRIC } from "../constants";
import { t } from "../i18n";
import { asInternalApp } from "../obsidian-internals";

// ---------------------------------------------------------------------------
// PixiNode shape (mirrors the one in GraphViewContainer)
// ---------------------------------------------------------------------------
export interface PixiNode {
	data: GraphNode;
	gfx: CanvasContainer;
	circle: CanvasGraphics;
	label: CanvasText | null;
	/** Tag label displayed below the node (LOD-gated) */
	tagLabel: CanvasText | null;
	hoverLabel: CanvasText | null;
	leaderLine: CanvasGraphics | null;
	radius: number;
	color: number;
	held: boolean;
	/** Sort rank (0 = highest/most prominent, increases downward). -1 = unranked. */
	sortRank: number;
	/** Pre-computed LOD priority score (higher = shown at lower zoom). */
	priorityScore: number;
	/** Minimum zoom level at which this node's label becomes visible. */
	minShowZoom: number;
	/** Whether label was visible in the previous zoom update (hysteresis). */
	labelWasVisible: boolean;
	/** True when label was force-shown by hover (needs restore on hover-clear). */
	hoverForcedLabel: boolean;
	/** Sub-labels showing additional metadata fields below the node */
	subLabels: CanvasText[];
	/** Runtime card dimension cache: total card height (set by card-renderer) */
	_cardTotalH?: number;
	/** Runtime card dimension cache: number of body lines (set by card-renderer) */
	_cardBodyLines?: number;
	/** Runtime flag: whether search pulse animation has fired */
	_searchPulsed?: boolean;
	/** Runtime: group key for collapsed text labels */
	_groupKey?: string;
}

// ---------------------------------------------------------------------------
// InteractionHost — the interface the InteractionManager needs from its parent
// ---------------------------------------------------------------------------
export interface InteractionHost {
	/** Hit-test a world-coordinate point against the spatial grid */
	hitTestNode(wx: number, wy: number): PixiNode | null;
	/** Mark the render loop as needing a redraw */
	markDirty(forceFullRedraw?: boolean): void;
	/** Apply hover highlight based on current highlightedNodeId */
	applyHover(): void;
	/** Get/set the currently highlighted (hovered) node ID */
	getHighlightedNodeId(): string | null;
	setHighlightedNodeId(id: string | null): void;
	/** Current layout type */
	getCurrentLayout(): LayoutType;
	/** Concentric layout shell data */
	getShells(): ShellInfo[];
	getNodeShellIndex(): Map<string, number>;
	/** The PIXI node map */
	getPixiNodes(): Map<string, PixiNode>;
	/** The d3 force simulation (null for static layouts) */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- d3-force link type
	getSimulation(): Simulation<GraphNode, any> | null;
	/** Open a file in the workspace */
	openFile(filePath: string): void;
	/** Toggle hold (pin) state for a node */
	toggleHold(pn: PixiNode): void;
	applyFocusOnClick?(nodeId: string): void;
	/** Focus-zoom to a node (animated pan + zoom) */
	focusZoomToNode?(nodeId: string): void;
	/** Clear all held (pinned) nodes */
	clearAllHolds(): void;
	/** Get the accent color (for marquee drawing) */
	getAccentColor(): number;
	/** Zoom the view to fit a screen-space rectangle */
	zoomToScreenRect(sx: number, sy: number, sw: number, sh: number): void;
	/** The renderer app instance (for coordinate transforms) */
	getPixiApp(): IApp | null;
	/** Handle double-click on a super node (collapsed group) — returns true if handled */
	handleSuperNodeDblClick(pn: PixiNode): boolean;
	/** Set pathfinder start or end node */
	setPathfinderNode(nodeId: string, role: "start" | "end"): void;
	/** Clear pathfinder state */
	clearPathfinder(): void;
	/** Get current pathfinder state */
	getPathfinderState(): { startId: string | null; endId: string | null };
	/** Get the Obsidian App instance (for hover-link events) */
	getApp(): App;
	/** Get the view's container element (for hover-link parent) */
	getContainerEl(): HTMLElement;
	/** IL: Zoom wheel sensitivity multiplier (0.5-2.0, default 1.0) */
	getZoomSensitivity?(): number;
	/** Called when zoom changes — debounced layout recalculation */
	onZoomLayoutUpdate?(zoom: number): void;
	/** Update label visibility for semantic zoom */
	updateLabelsForZoom?(): void;
	/** Lightweight LOD fade — updates label alpha/visible without expensive cull */
	applyTextFade?(): void;
	/** Update the on-screen zoom percentage indicator */
	updateZoomIndicator?(scale: number): void;
	/** 比較選択にノードを追加 (最大2件、FIFO) */
	addCompareNode(nodeId: string): void;
	/** 比較選択をクリア */
	clearCompareSelection(): void;
	/** キャンバス空白ダブルクリック: 注釈を追加 */
	addAnnotationAt?(wx: number, wy: number): void;
	/** ブックマークの追加/削除 */
	toggleBookmark?(nodeId: string): void;
	/** ブックマーク済みかどうか判定 */
	isBookmarked?(nodeId: string): boolean;
	/** ビジュアルリンクエディタが有効かどうか */
	isVisualLinkEditorEnabled?(): boolean;
	/** ドラッグでリンク作成 (ソースファイルに [[target]] wikilink を挿入) */
	createLink?(sourceId: string, targetId: string): void;
	/** リンクプレビュー線を描画 (ソースノード中心からワールド座標まで) */
	drawLinkPreview?(srcX: number, srcY: number, dstX: number, dstY: number): void;
	/** リンクプレビュー線をクリア */
	clearLinkPreview?(): void;
	/** Feature CY: export N-hop subgraph as JSON download */
	exportSubgraph?(nodeId: string): void;
	/** Create a new note at the given world coordinates (Phase 4a) */
	createNoteAtPosition?(wx: number, wy: number): void;
	/** I2: Insert a blank placeholder node at the given world coordinates */
	insertBlankNode?(wx: number, wy: number): void;
	/** Set search query and trigger filter (context menu shortcut) */
	setSearchQuery(query: string): void;
	/** Export full graph as JSON download */
	exportFullGraph?(): void;
	/** FC: Export graph as PNG image */
	exportPng?(): void;
	/** ED: Save current viewport position/scale */
	saveViewport?(name: string): void;
	/** ED: Restore saved viewport */
	restoreViewport?(name: string): void;
	/** ED: Get saved viewport names */
	getSavedViewportNames?(): string[];
	/** F2: Whether inline ontology editor is enabled */
	isInlineOntologyEnabled?(): boolean;
	/** C3: Whether relation type picker is enabled */
	isRelationTypePickerEnabled?(): boolean;
	/** F2: Set ontology type on a node via frontmatter */
	setNodeOntologyType?(nodeId: string, type: string): void;
	/** C3: Add a typed relation between two nodes via frontmatter */
	addRelationToNode?(nodeId: string, targetId: string, relType: string): void;
	/** Get neighbor IDs for a node */
	getNeighborIds?(nodeId: string): string[];
	/** C6: Toggle multi-select for a node */
	toggleMultiSelect?(nodeId: string): void;
	/** Lasso selection: add all nodes inside polygon to multiSelect */
	lassoSelectNodes?(screenPolygon: { x: number; y: number }[], additive: boolean): void;
	/** Hit-test group/aggregate labels at world coordinates. Returns true if handled (zoomed). */
	hitTestAndZoomGroupLabel?(wx: number, wy: number): boolean;
	/** Enter subgraph mode with selected nodes */
	enterSubgraph?(nodeIds: string[], viewMode: string): void;
	/** Open subgraph in a new tab */
	openSubgraphNewTab?(nodeIds: string[], viewMode: string): void;
	/** Get current panel state for context menu decisions */
	getPanel?(): { multiSelectNodeIds: string[]; subgraphNodeIds: string[]; viewMode: string };
	/** D5: Toggle cluster compare for a node's cluster */
	toggleClusterCompare?(nodeId: string): void;
	/** D5: Whether cluster compare is enabled */
	isClusterCompareEnabled?(): boolean;
	/** C4: Whether manual clustering is enabled */
	isManualClusteringEnabled?(): boolean;
	/** C4: Get available cluster group keys */
	getClusterGroupKeys?(): string[];
	/** C4: Set a node's manual cluster override */
	setManualCluster?(nodeId: string, groupKey: string): void;
	/** C7: Show inline editor for a node */
	showInlineEditor?(pn: PixiNode): void;
	/** C7: Whether inline edit is enabled */
	isInlineEditEnabled?(): boolean;
	/** I1: Persist node position after drag */
	saveDragPosition?(nodeId: string, x: number, y: number): void;
	/** D1: Toggle expand/collapse of a node's neighbors in local graph mode */
	toggleExpandNode?(nodeId: string): void;
	/** D1: Check if a node is expanded */
	isNodeExpanded?(nodeId: string): boolean;
	/** Sunburst arc hit test: returns depth-1 group name at world coordinates */
	hitTestSunburstArc?(wx: number, wy: number): string | null;
	/** Set sunburst hover highlight group */
	setSunburstHover?(groupName: string | null): void;
	/** Handle click on a sunburst arc (switch to graph with filter) */
	onSunburstArcClick?(groupName: string): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Scale multiplier per wheel tick (zoom in / zoom out) */
export const ZOOM_IN_FACTOR = 1.1;
export const ZOOM_OUT_FACTOR = 0.9;

/** Minimum/maximum scale clamp for wheel zoom */
export const ZOOM_SCALE_MIN = 0.02;
export const ZOOM_SCALE_MAX = 10;

/**
 * Compute the zoom scale factor for a wheel event.
 * Pure function — no DOM or Canvas dependency.
 *
 * @param deltaY   Wheel deltaY (negative = zoom in, positive = zoom out)
 * @param sensitivity  User zoom sensitivity (0.5–2.0, default 1.0)
 * @returns Scale multiplier to apply to current zoom
 */
export function computeZoomFactor(deltaY: number, sensitivity = 1.0): number {
	const inF = 1 + (ZOOM_IN_FACTOR - 1) * sensitivity;
	const outF = 1 - (1 - ZOOM_OUT_FACTOR) * sensitivity;
	return deltaY < 0 ? inF : outF;
}

/**
 * Clamp a scale value to the allowed zoom range.
 * Pure function.
 */
export function clampScale(scale: number): number {
	return Math.max(ZOOM_SCALE_MIN, Math.min(ZOOM_SCALE_MAX, scale));
}

/**
 * Compute the next zoom scale in a single step from a wheel event.
 * Pure function — composes {@link computeZoomFactor} and {@link clampScale}.
 *
 * @param currentScale Current zoom scale
 * @param deltaY       Wheel deltaY (negative = zoom in, positive = zoom out)
 * @param sensitivity  User zoom sensitivity (0.5–2.0, default 1.0)
 * @returns Next clamped zoom scale
 */
export function computeZoomStep(
	currentScale: number,
	deltaY: number,
	sensitivity = 1.0,
): number {
	return clampScale(currentScale * computeZoomFactor(deltaY, sensitivity));
}

/** d3 simulation alphaTarget when dragging a node */
const DRAG_ALPHA_TARGET = 0.3;

/** Minimum marquee rectangle size (px) to trigger zoom */
const MARQUEE_MIN_SIZE_PX = 10;

/** Debounce delay (ms) for zoom-dependent layout recalculation */
const ZOOM_LAYOUT_DEBOUNCE_MS = 400;
/** Minimum relative zoom change to trigger layout recalculation (matches DEFAULT_RENDER_THRESHOLDS.zoomLayoutDeltaThreshold) */
const ZOOM_LAYOUT_DELTA_THRESHOLD = 0.2;
/** Marquee selection stroke width */
const MARQUEE_STROKE_WIDTH = 1.5;
/** Marquee selection stroke alpha */
const MARQUEE_STROKE_ALPHA = 0.9;
/** Marquee selection fill alpha */
const MARQUEE_FILL_ALPHA = 0.08;
/** Lasso selection stroke width */
const LASSO_STROKE_WIDTH = 2;
/** Lasso selection stroke alpha */
const LASSO_STROKE_ALPHA = 0.9;
/** Lasso selection fill alpha */
const LASSO_FILL_ALPHA = 0.06;
/** Minimum lasso points to form a polygon */
const LASSO_MIN_POINTS = 5;
/** Smooth zoom lerp factor per frame (0–1; higher = snappier) */
const SMOOTH_ZOOM_LERP = 0.25;
/** Smooth zoom convergence threshold — stop animating below this */
const SMOOTH_ZOOM_EPSILON = 0.001;

// ---------------------------------------------------------------------------
// InteractionManager — owns all pointer/wheel event handling
// ---------------------------------------------------------------------------
export class InteractionManager {
	private host: InteractionHost;
	private canvas: HTMLCanvasElement;
	private world: CanvasContainer;

	// Interaction state
	private draggedNode: PixiNode | null = null;
	private dragOffset = { x: 0, y: 0 };
	private _dragStartX = 0;
	private _dragStartY = 0;
	private hasDragged = false;
	private isPanning = false;
	private panStart = { x: 0, y: 0 };
	private worldStart = { x: 0, y: 0 };

	// Shell rotation (concentric layout)
	private rotatingShellIdx: number | null = null;
	private rotateStartAngle = 0;
	private rotateStartOffset = 0;

	// Marquee zoom
	marqueeMode = false;
	private isMarqueeActive = false;
	private marqueeStart = { x: 0, y: 0 };
	private marqueeGraphics: CanvasGraphics | null = null;

	// Lasso selection
	lassoMode = false;
	private isLassoActive = false;
	private lassoPoints: { x: number; y: number }[] = [];
	private lassoGraphics: CanvasGraphics | null = null;

	// ビジュアルリンクエディタ: Alt+ドラッグでリンク作成
	private dragLinkSource: PixiNode | null = null;

	// Hover hitTest minimum movement threshold
	private _lastHoverX = 0;
	private _lastHoverY = 0;
	// Debounced zoom layout recalculation
	private _zoomLayoutTimer = 0;
	// Last zoom scale at which layout was recalculated (for delta threshold)
	private _lastLayoutZoom = 1;
	// Debounced label cull (expensive overlap detection) during rapid zoom
	private _zoomCullTimer = 0;

	// Smooth zoom interpolation state
	private _targetScale = 1;
	private _smoothZoomId = 0;
	private _smoothZoomCursorX = 0;
	private _smoothZoomCursorY = 0;

	// Hover preview: track last hovered node to avoid redundant hover-link events
	private lastHoveredId: string | null = null;

	// Bound handlers for removal
	private _onWheel: (e: WheelEvent) => void;
	private _onPointerDown: (e: PointerEvent) => void;
	private _onPointerMove: (e: PointerEvent) => void;
	private _onPointerUp: (e: PointerEvent) => void;
	private _onPointerLeave: () => void;
	private _onDblClick: ((e: MouseEvent) => void) | null = null;
	private _onContextMenu: ((e: MouseEvent) => void) | null = null;

	constructor(host: InteractionHost, canvas: HTMLCanvasElement, world: CanvasContainer) {
		this.host = host;
		this.canvas = canvas;
		this.world = world;
		this._targetScale = world.scale.x;

		this._onWheel = this.handleWheel.bind(this);
		this._onPointerDown = this.handlePointerDown.bind(this);
		this._onPointerMove = this.handlePointerMove.bind(this);
		this._onPointerUp = this.handlePointerUp.bind(this);
		this._onPointerLeave = this.handlePointerLeave.bind(this);

		canvas.addEventListener("wheel", this._onWheel, { passive: false });
		canvas.addEventListener("pointerdown", this._onPointerDown);
		canvas.addEventListener("pointermove", this._onPointerMove);
		canvas.addEventListener("pointerup", this._onPointerUp);
		canvas.addEventListener("pointerleave", this._onPointerLeave);

		if (!Platform.isMobile) {
			this._onDblClick = this.handleDblClick.bind(this);
			canvas.addEventListener("dblclick", this._onDblClick);
			this._onContextMenu = this.handleContextMenu.bind(this);
			canvas.addEventListener("contextmenu", this._onContextMenu);
		}
	}

	/** Remove all event listeners and clean up PIXI resources */
	detach() {
		cancelAnimationFrame(this._smoothZoomId);
		this._smoothZoomId = 0;
		clearTimeout(this._zoomLayoutTimer);
		clearTimeout(this._zoomCullTimer);
		this.canvas.removeEventListener("wheel", this._onWheel);
		this.canvas.removeEventListener("pointerdown", this._onPointerDown);
		this.canvas.removeEventListener("pointermove", this._onPointerMove);
		this.canvas.removeEventListener("pointerup", this._onPointerUp);
		this.canvas.removeEventListener("pointerleave", this._onPointerLeave);
		if (this._onDblClick) {
			this.canvas.removeEventListener("dblclick", this._onDblClick);
		}
		if (this._onContextMenu) {
			this.canvas.removeEventListener("contextmenu", this._onContextMenu);
		}
		if (this.marqueeGraphics) {
			this.marqueeGraphics.destroy();
			this.marqueeGraphics = null;
		}
		if (this.lassoGraphics) {
			this.lassoGraphics.destroy();
			this.lassoGraphics = null;
		}
	}

	// -----------------------------------------------------------------------
	// Wheel zoom
	// -----------------------------------------------------------------------
	private handleWheel(e: WheelEvent) {
		e.preventDefault();
		const app = this.host.getPixiApp();
		if (!app) return;

		const sens = this.host.getZoomSensitivity?.() ?? 1.0;
		const rect = this.canvas.getBoundingClientRect();
		this._smoothZoomCursorX = e.clientX - rect.left;
		this._smoothZoomCursorY = e.clientY - rect.top;

		this._targetScale = computeZoomStep(this._targetScale, e.deltaY, sens);

		if (!this._smoothZoomId) {
			this._smoothZoomId = requestAnimationFrame(() => this.smoothZoomTick());
		}
	}

	private smoothZoomTick() {
		this._smoothZoomId = 0;
		const app = this.host.getPixiApp();
		if (!app) return;
		const world = this.world;

		const current = world.scale.x;
		const diff = this._targetScale - current;
		if (Math.abs(diff) < SMOOTH_ZOOM_EPSILON) {
			world.scale.set(this._targetScale);
			this.afterZoomStep(this._targetScale);
			return;
		}

		const next = clampScale(current + diff * SMOOTH_ZOOM_LERP);
		const mx = this._smoothZoomCursorX;
		const my = this._smoothZoomCursorY;
		const worldPos = world.toLocal({ x: mx, y: my }, app.stage);
		world.scale.set(next);
		const newScreenPos = world.toGlobal(worldPos);
		world.x += mx - newScreenPos.x;
		world.y += my - newScreenPos.y;

		this.afterZoomStep(next);
		this._smoothZoomId = requestAnimationFrame(() => this.smoothZoomTick());
	}

	private afterZoomStep(s: number) {
		this.host.markDirty();
		clearTimeout(this._zoomCullTimer);
		this._zoomCullTimer = window.setTimeout(() => {
			this.host.updateLabelsForZoom?.();
		}, 50) as unknown as number;
		this.host.updateZoomIndicator?.(s);
		const zoomDelta = Math.abs(s - this._lastLayoutZoom) / (this._lastLayoutZoom || 1);
		if (zoomDelta >= ZOOM_LAYOUT_DELTA_THRESHOLD) {
			clearTimeout(this._zoomLayoutTimer);
			this._zoomLayoutTimer = window.setTimeout(() => {
				this._lastLayoutZoom = s;
				this.host.onZoomLayoutUpdate?.(s);
			}, ZOOM_LAYOUT_DEBOUNCE_MS) as unknown as number;
		}
	}

	// -----------------------------------------------------------------------
	// Pointer down
	// -----------------------------------------------------------------------
	private handlePointerDown(e: PointerEvent) {
		const app = this.host.getPixiApp();
		if (!app) return;

		const rect = this.canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);

		const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
		if (Platform.isMobile && hit) {
			this._downMobileTapHover(hit);
		}
		if (hit) {
			this._downOnNode(e, hit, worldPt);
		} else {
			this._downOnEmpty(e, app, mx, my);
		}
	}

	/** Mobile tap-to-hover: trigger hover highlight on tap (no pointermove hover on touch). */
	private _downMobileTapHover(hit: PixiNode) {
		const newId = hit.data.id;
		if (newId !== this.host.getHighlightedNodeId()) {
			this.host.setHighlightedNodeId(newId);
			this.host.applyHover();
			this.host.markDirty(true);
		}
	}

	/** Handle pointer-down on an existing node (link editor, shell rotate, or drag). */
	private _downOnNode(e: PointerEvent, hit: PixiNode, worldPt: { x: number; y: number }) {
		// ビジュアルリンクエディタ: Alt+ドラッグでリンク作成開始
		if (e.altKey && this.host.isVisualLinkEditorEnabled?.()) {
			this.dragLinkSource = hit;
			this.hasDragged = false;
			return;
		}
		// Concentric: rotate shell instead of dragging individual node
		if (this.host.getCurrentLayout() === LAYOUT_CONCENTRIC && this.host.getShells().length > 0) {
			const shellIdx = this.host.getNodeShellIndex().get(hit.data.id);
			if (shellIdx !== undefined && shellIdx > 0) {
				const shell = this.host.getShells()[shellIdx];
				this.rotatingShellIdx = shellIdx;
				this.rotateStartAngle = Math.atan2(worldPt.y - shell.centerY, worldPt.x - shell.centerX);
				this.rotateStartOffset = shell.angleOffset;
				this.hasDragged = false;
				return;
			}
		}
		this.draggedNode = hit;
		this.hasDragged = false;
		this.dragOffset.x = worldPt.x - hit.data.x;
		this.dragOffset.y = worldPt.y - hit.data.y;
		this._dragStartX = hit.data.x;
		this._dragStartY = hit.data.y;
		const sim = this.host.getSimulation();
		if (sim) {
			hit.data.fx = hit.data.x;
			hit.data.fy = hit.data.y;
			sim.alphaTarget(DRAG_ALPHA_TARGET).restart();
		}
	}

	/** Handle pointer-down on empty canvas (pan, lasso, or marquee). */
	private _downOnEmpty(e: PointerEvent, app: IApp, mx: number, my: number) {
		if (e.button === 1 || e.altKey) {
			// Middle-click or Alt+drag → pan
			this._startPan(mx, my);
		} else if (this.lassoMode) {
			this.isLassoActive = true;
			this.lassoPoints = [{ x: mx, y: my }];
			if (!this.lassoGraphics) {
				this.lassoGraphics = new CanvasGraphics();
				app.stage.addChild(this.lassoGraphics);
			}
			this.lassoGraphics.clear();
		} else if (this.marqueeMode) {
			this.isMarqueeActive = true;
			this.marqueeStart = { x: mx, y: my };
			if (!this.marqueeGraphics) {
				this.marqueeGraphics = new CanvasGraphics();
				app.stage.addChild(this.marqueeGraphics);
			}
			this.marqueeGraphics.clear();
		} else {
			// Default left-click drag on empty space → pan
			this._startPan(mx, my);
		}
	}

	/** Begin panning from the given screen position. */
	private _startPan(mx: number, my: number) {
		this.isPanning = true;
		this.panStart = { x: mx, y: my };
		this.worldStart = { x: this.world.x, y: this.world.y };
	}

	// -----------------------------------------------------------------------
	// Pointer move
	// -----------------------------------------------------------------------
	private handlePointerMove(e: PointerEvent) {
		const app = this.host.getPixiApp();
		if (!app) return;

		const rect = this.canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		if (this.dragLinkSource) {
			this._moveLinkPreview(app, mx, my);
			return;
		}
		if (this.rotatingShellIdx !== null) {
			this._moveRotateShell(app, mx, my);
		} else if (this.draggedNode) {
			this._moveDragNode(app, mx, my);
		} else if (this.isLassoActive && this.lassoGraphics) {
			this._moveLassoDraw(mx, my);
		} else if (this.isMarqueeActive && this.marqueeGraphics) {
			this._moveMarqueeDraw(mx, my);
		} else if (this.isPanning) {
			this.world.x = this.worldStart.x + (mx - this.panStart.x);
			this.world.y = this.worldStart.y + (my - this.panStart.y);
			this.host.markDirty();
		} else {
			this._moveHover(e, app, mx, my);
		}
	}

	/** Link preview drag: draw line + highlight snap target */
	private _moveLinkPreview(app: IApp, mx: number, my: number) {
		this.hasDragged = true;
		const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
		const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
		const targetId = hit && hit !== this.dragLinkSource ? hit.data.id : null;
		if (targetId !== this.host.getHighlightedNodeId()) {
			this.host.setHighlightedNodeId(targetId);
			this.host.applyHover();
		}
		const dstX = hit && hit !== this.dragLinkSource ? hit.data.x : worldPt.x;
		const dstY = hit && hit !== this.dragLinkSource ? hit.data.y : worldPt.y;
		this.host.drawLinkPreview?.(this.dragLinkSource!.data.x, this.dragLinkSource!.data.y, dstX, dstY);
		this.host.markDirty();
	}

	/** Concentric shell rotation */
	private _moveRotateShell(app: IApp, mx: number, my: number) {
		this.hasDragged = true;
		const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
		const shell = this.host.getShells()[this.rotatingShellIdx!];
		const currentAngle = Math.atan2(worldPt.y - shell.centerY, worldPt.x - shell.centerX);
		shell.angleOffset = this.rotateStartOffset + (currentAngle - this.rotateStartAngle);
		const nodeMap = new Map<string, GraphNode>();
		for (const pn of this.host.getPixiNodes().values()) nodeMap.set(pn.data.id, pn.data);
		repositionShell(shell, nodeMap);
		this.host.markDirty();
	}

	/** Node drag with distance limit */
	private _moveDragNode(app: IApp, mx: number, my: number) {
		this.hasDragged = true;
		const world = this.world;
		const worldPt = world.toLocal({ x: mx, y: my }, app.stage);
		const nx = worldPt.x - this.dragOffset.x;
		const ny = worldPt.y - this.dragOffset.y;

		const dragDist = Math.sqrt((nx - this._dragStartX) ** 2 + (ny - this._dragStartY) ** 2);
		const maxDist = (Math.max(this.canvas.width, this.canvas.height) * 3) / (world.scale.x || 1);
		if (dragDist > maxDist) {
			this.draggedNode!.data.x = this._dragStartX;
			this.draggedNode!.data.y = this._dragStartY;
			const sim = this.host.getSimulation();
			if (sim) {
				this.draggedNode!.data.fx = undefined;
				this.draggedNode!.data.fy = undefined;
			}
			this.draggedNode = null;
			this.host.markDirty();
			return;
		}

		this.draggedNode!.data.x = nx;
		this.draggedNode!.data.y = ny;
		const sim = this.host.getSimulation();
		if (sim) {
			this.draggedNode!.data.fx = nx;
			this.draggedNode!.data.fy = ny;
		}
		this.host.markDirty();
	}

	/** Lasso polygon drawing */
	private _moveLassoDraw(mx: number, my: number) {
		this.lassoPoints.push({ x: mx, y: my });
		this.lassoGraphics!.clear();
		const lassoColor = this.host.getAccentColor();
		this.lassoGraphics!.lineStyle(LASSO_STROKE_WIDTH, lassoColor, LASSO_STROKE_ALPHA);
		this.lassoGraphics!.beginFill(lassoColor, LASSO_FILL_ALPHA);
		this.lassoGraphics!.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
		for (let i = 1; i < this.lassoPoints.length; i++) {
			this.lassoGraphics!.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
		}
		this.lassoGraphics!.closePath();
		this.lassoGraphics!.endFill();
	}

	/** Marquee rectangle drawing */
	private _moveMarqueeDraw(mx: number, my: number) {
		this.hasDragged = true;
		const sx = this.marqueeStart.x;
		const sy = this.marqueeStart.y;
		this.marqueeGraphics!.clear();
		const marqueeColor = this.host.getAccentColor();
		this.marqueeGraphics!.lineStyle(MARQUEE_STROKE_WIDTH, marqueeColor, MARQUEE_STROKE_ALPHA);
		this.marqueeGraphics!.beginFill(marqueeColor, MARQUEE_FILL_ALPHA);
		this.marqueeGraphics!.drawRect(Math.min(sx, mx), Math.min(sy, my), Math.abs(mx - sx), Math.abs(my - sy));
		this.marqueeGraphics!.endFill();
	}

	/** Hover hit-test, sunburst arc highlight, and hover-link event */
	private _moveHover(e: PointerEvent, app: IApp, mx: number, my: number) {
		const hoverDx = mx - this._lastHoverX;
		const hoverDy = my - this._lastHoverY;
		if (hoverDx * hoverDx + hoverDy * hoverDy < 9) return;
		this._lastHoverX = mx;
		this._lastHoverY = my;
		const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
		const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
		const newId = hit?.data.id ?? null;
		if (newId !== this.host.getHighlightedNodeId()) {
			this.host.setHighlightedNodeId(newId);
			this.host.applyHover();
			this.host.markDirty(true);
			this.canvas.style.cursor = newId ? "pointer" : "";
		}
		if (this.host.hitTestSunburstArc && this.host.setSunburstHover) {
			const arcGroup = this.host.hitTestSunburstArc(worldPt.x, worldPt.y);
			this.host.setSunburstHover(arcGroup);
			if (arcGroup && !newId) this.canvas.style.cursor = "pointer";
		}
		if (newId && newId !== this.lastHoveredId) {
			this.lastHoveredId = newId;
			const filePath = hit?.data.filePath;
			if (filePath) {
				this.host.getApp().workspace.trigger("hover-link", {
					event: e,
					source: "graph-island",
					hoverParent: this.host.getContainerEl(),
					targetEl: e.target,
					linktext: filePath,
					sourcePath: filePath,
				});
			}
		} else if (!newId) {
			this.lastHoveredId = null;
		}
	}

	// -----------------------------------------------------------------------
	// Pointer up
	// -----------------------------------------------------------------------
	private handlePointerUp(e: PointerEvent) {
		if (this.dragLinkSource) {
			this._upLinkDrop(e);
			return;
		}
		if (this.isLassoActive) {
			this._upLassoComplete(e);
			return;
		}
		if (this.isMarqueeActive) {
			this._upMarqueeComplete(e);
			return;
		}
		if (this.rotatingShellIdx !== null) {
			this.rotatingShellIdx = null;
			return;
		}
		if (this.draggedNode) {
			this._upNodeRelease(e);
		} else if (!this.hasDragged) {
			if (this._upSunburstArcClick(e)) return;
		}
		if (!this.hasDragged && this._upGroupLabelClick(e)) return;

		this.isPanning = false;
		this.hasDragged = false;
	}

	/** Link editor: finalize link on drop */
	private _upLinkDrop(e: PointerEvent) {
		const src = this.dragLinkSource!;
		this.dragLinkSource = null;
		this.host.clearLinkPreview?.();
		this.host.setHighlightedNodeId(null);
		this.host.applyHover();
		if (this.hasDragged) {
			const app = this.host.getPixiApp();
			if (app) {
				const rect = this.canvas.getBoundingClientRect();
				const mx = e.clientX - rect.left;
				const my = e.clientY - rect.top;
				const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
				const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
				if (hit && hit !== src && hit.data.id !== src.data.id) {
					this.host.createLink?.(src.data.id, hit.data.id);
				}
			}
		}
		this.hasDragged = false;
		this.host.markDirty(true);
	}

	/** Lasso: finalize selection */
	private _upLassoComplete(e: PointerEvent) {
		this.isLassoActive = false;
		if (this.lassoGraphics) this.lassoGraphics.clear();
		if (this.lassoPoints.length >= LASSO_MIN_POINTS && this.host.lassoSelectNodes) {
			this.host.lassoSelectNodes(this.lassoPoints, e.shiftKey);
		}
		this.lassoPoints = [];
	}

	/** Marquee: finalize zoom-to-rect */
	private _upMarqueeComplete(e: PointerEvent) {
		this.isMarqueeActive = false;
		if (this.marqueeGraphics) this.marqueeGraphics.clear();
		if (this.hasDragged) {
			const rect = this.canvas.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			const sx = this.marqueeStart.x;
			const sy = this.marqueeStart.y;
			const w = Math.abs(mx - sx);
			const h = Math.abs(my - sy);
			if (w > MARQUEE_MIN_SIZE_PX && h > MARQUEE_MIN_SIZE_PX) {
				this.host.zoomToScreenRect(Math.min(sx, mx), Math.min(sy, my), w, h);
			}
		}
		this.hasDragged = false;
	}

	/** Node click or drag-end handling */
	private _upNodeRelease(e: PointerEvent) {
		const node = this.draggedNode!;
		if (!this.hasDragged) {
			this._upNodeClick(e, node);
		} else {
			const sim = this.host.getSimulation();
			if (!node.held && sim) {
				node.data.fx = null;
				node.data.fy = null;
			}
			this.host.saveDragPosition?.(node.data.id, node.data.x, node.data.y);
		}
		const sim = this.host.getSimulation();
		if (sim) sim.alphaTarget(0);
		this.draggedNode = null;
		this.host.markDirty(true);
	}

	/** Handle click (no drag) on a node: super-node, shift/alt/ctrl, or normal click */
	private _upNodeClick(e: PointerEvent, node: PixiNode) {
		if (node.data.collapsedMembers && node.data.id.startsWith("__super__")) {
			this.host.handleSuperNodeDblClick(node);
			this.draggedNode = null;
			this.host.markDirty(true);
			return;
		}
		if (e.shiftKey && this.host.toggleMultiSelect) {
			this.host.toggleMultiSelect(node.data.id);
			this.host.markDirty(true);
			this.draggedNode = null;
			this.isPanning = false;
			return;
		}
		if (e.altKey) {
			this._upPathfinderClick(node);
			this.draggedNode = null;
			this.isPanning = false;
			return;
		}
		if (e.ctrlKey || e.metaKey) {
			this.host.addCompareNode(node.data.id);
		} else {
			this.host.clearAllHolds();
			this.host.clearCompareSelection();
			this.host.applyFocusOnClick?.(node.data.id);
		}
		this.host.toggleHold(node);
	}

	/** Alt+click pathfinder: cycle start → end → reset */
	private _upPathfinderClick(node: PixiNode) {
		const pf = this.host.getPathfinderState();
		if (!pf.startId) {
			this.host.setPathfinderNode(node.data.id, "start");
		} else if (!pf.endId) {
			this.host.setPathfinderNode(node.data.id, "end");
		} else {
			this.host.clearPathfinder();
			this.host.setPathfinderNode(node.data.id, "start");
		}
	}

	/** Sunburst arc click — returns true if handled */
	private _upSunburstArcClick(e: PointerEvent): boolean {
		const app = this.host.getPixiApp();
		if (!app) return false;
		const rect = this.canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const wp = this.world.toLocal({ x: mx, y: my }, app.stage);
		if (this.host.hitTestSunburstArc && this.host.onSunburstArcClick) {
			const arcGroup = this.host.hitTestSunburstArc(wp.x, wp.y);
			if (arcGroup) {
				this.host.onSunburstArcClick(arcGroup);
				this.isPanning = false;
				this.hasDragged = false;
				return true;
			}
		}
		return false;
	}

	/** Group label click — returns true if handled */
	private _upGroupLabelClick(e: PointerEvent): boolean {
		const app = this.host.getPixiApp();
		if (!app) return false;
		const rect = this.canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const wp = this.world.toLocal({ x: mx, y: my }, app.stage);
		if (this.host.hitTestAndZoomGroupLabel?.(wp.x, wp.y)) {
			this.isPanning = false;
			this.hasDragged = false;
			return true;
		}
		return false;
	}

	// -----------------------------------------------------------------------
	// Pointer leave
	// -----------------------------------------------------------------------
	private handlePointerLeave() {
		// リンクドラッグ中にキャンバスを離れた場合はキャンセル
		if (this.dragLinkSource) {
			this.dragLinkSource = null;
			this.host.clearLinkPreview?.();
		}
		if (!Platform.isMobile && this.host.getHighlightedNodeId()) {
			this.host.setHighlightedNodeId(null);
			this.host.applyHover();
			this.host.markDirty(true);
		}
	}

	// -----------------------------------------------------------------------
	// Double-click to open file
	// -----------------------------------------------------------------------
	private handleDblClick(e: MouseEvent) {
		const app = this.host.getPixiApp();
		if (!app) return;

		const rect = this.canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
		const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
		if (!hit) {
			// 空白ダブルクリック: 注釈を追加
			if (this.host.addAnnotationAt) {
				this.host.addAnnotationAt(worldPt.x, worldPt.y);
			}
			return;
		}
		// Handle super node expand/collapse first
		if (this.host.handleSuperNodeDblClick(hit)) return;
		// C7: Inline edit — show editor overlay instead of opening file
		if (this.host.isInlineEditEnabled?.() && this.host.showInlineEditor) {
			this.host.showInlineEditor(hit);
			return;
		}
		// Default: open file
		if (hit.data.filePath) {
			this.host.openFile(hit.data.filePath);
		}
	}

	// -----------------------------------------------------------------------
	// Context menu (right-click on node)
	// -----------------------------------------------------------------------
	private handleContextMenu(e: MouseEvent) {
		const app = this.host.getPixiApp();
		if (!app) return;

		const rect = this.canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
		const hit = this.host.hitTestNode(worldPt.x, worldPt.y);

		e.preventDefault();

		if (!hit) {
			this._showCanvasContextMenu(e, worldPt);
			return;
		}

		const menu = new Menu();
		const node = hit;

		this._ctxOpenSection(menu, node);
		this._ctxNeighborSection(menu, node);
		this._ctxEditSection(menu, node);
		this._ctxFilterSection(menu, node);
		this._ctxPathfinderSection(menu, node);
		this._ctxOntologySection(menu, node);
		this._ctxRelationSection(menu, node);
		this._ctxClusterSection(menu, node);
		this._ctxMultiSelectSection(menu, node);
		this._ctxSubgraphSection(menu);

		menu.showAtPosition({ x: e.clientX, y: e.clientY });
	}

	/** Context menu: Open file + focus zoom */
	private _ctxOpenSection(menu: Menu, node: PixiNode) {
		if (node.data.filePath) {
			menu.addItem((item) => {
				item.setTitle(t("context.openFile"))
					.setIcon("file-text")
					.onClick(() => this.host.openFile(node.data.filePath!));
			});
		}
	}

	/** Context menu: Linked neighbor nodes */
	private _ctxNeighborSection(menu: Menu, node: PixiNode) {
		const neighborIds = this.host.getNeighborIds?.(node.data.id) ?? [];
		if (neighborIds.length === 0) return;
		menu.addSeparator();
		for (const nbId of neighborIds.slice(0, 8)) {
			const nbPn = this.host.getPixiNodes().get(nbId);
			if (!nbPn) continue;
			const nbLabel = nbPn.data.label || nbId.split("/").pop() || nbId;
			menu.addItem((item) => {
				item.setTitle(`→ ${nbLabel}`)
					.setIcon("arrow-right")
					.onClick(() => {
						this.host.setHighlightedNodeId(nbId);
						this.host.applyHover();
						if (nbPn.data.filePath) this.host.openFile(nbPn.data.filePath);
					});
			});
		}
		if (neighborIds.length > 8) {
			menu.addItem((item) => {
				item.setTitle(`… +${neighborIds.length - 8} more`)
					.setIcon("more-horizontal")
					.setDisabled(true);
			});
		}
	}

	/** Context menu: Pin, search, copy, bookmark, expand, export */
	private _ctxEditSection(menu: Menu, node: PixiNode) {
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("context.focusZoom"))
				.setIcon("maximize-2")
				.onClick(() => this.host.focusZoomToNode?.(node.data.id));
		});
		menu.addItem((item) => {
			item.setTitle(node.held ? t("context.unpin") : t("context.pin"))
				.setIcon(node.held ? "pin-off" : "pin")
				.onClick(() => this.host.toggleHold(node));
		});
		menu.addItem((item) => {
			item.setTitle(t("context.searchInVault"))
				.setIcon("search")
				.onClick(() => {
					const obsApp = this.host.getApp();
					asInternalApp(obsApp).commands?.executeCommandById("global-search:open");
					setTimeout(() => {
						const searchLeaf = obsApp.workspace.getLeavesOfType("search")[0];
						if (searchLeaf) {
							const search = searchLeaf.view as unknown as { setQuery?: (q: string) => void };
							if (search?.setQuery) search.setQuery(node.data.label);
						}
					}, 300);
				});
		});
		const copyText = node.data.filePath || node.data.id;
		menu.addItem((item) => {
			item.setTitle(t("context.copyPath"))
				.setIcon("copy")
				.onClick(() => navigator.clipboard.writeText(copyText));
		});
		if (this.host.toggleBookmark) {
			const isBookmarked = this.host.isBookmarked?.(node.data.id) ?? false;
			menu.addItem((item) => {
				item.setTitle(isBookmarked ? t("bookmark.remove") : t("bookmark.add"))
					.setIcon(isBookmarked ? "star-off" : "star")
					.onClick(() => this.host.toggleBookmark!(node.data.id));
			});
		}
		if (this.host.toggleExpandNode) {
			const isExpanded = this.host.isNodeExpanded?.(node.data.id) ?? false;
			menu.addItem((item) => {
				item.setTitle(isExpanded ? t("context.collapse") : t("context.expand"))
					.setIcon(isExpanded ? "minimize-2" : "maximize-2")
					.onClick(() => this.host.toggleExpandNode!(node.data.id));
			});
		}
		if (this.host.exportSubgraph) {
			menu.addItem((item) => {
				item.setTitle(t("context.exportSubgraph"))
					.setIcon("download")
					.onClick(() => this.host.exportSubgraph!(node.data.id));
			});
		}
	}

	/** Context menu: Filter by folder/tag */
	private _ctxFilterSection(menu: Menu, node: PixiNode) {
		menu.addSeparator();
		if (node.data.filePath) {
			const folder = node.data.filePath.split("/").slice(0, -1).join("/");
			if (folder) {
				menu.addItem((item) => {
					item.setTitle(`Filter: ${folder}`)
						.setIcon("folder")
						.onClick(() => this.host.setSearchQuery(`path:${folder}`));
				});
			}
		}
		if (node.data.tags && node.data.tags.length > 0) {
			menu.addItem((item) => {
				item.setTitle(`Filter: #${node.data.tags![0]}`)
					.setIcon("tag")
					.onClick(() => this.host.setSearchQuery(`tag:${node.data.tags![0]}`));
			});
		}
	}

	/** Context menu: Pathfinder start/end/clear */
	private _ctxPathfinderSection(menu: Menu, node: PixiNode) {
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("context.pathStart"))
				.setIcon("navigation")
				.onClick(() => this.host.setPathfinderNode(node.data.id, "start"));
		});
		menu.addItem((item) => {
			item.setTitle(t("context.pathEnd"))
				.setIcon("flag")
				.onClick(() => this.host.setPathfinderNode(node.data.id, "end"));
		});
		const pfState = this.host.getPathfinderState();
		if (pfState.startId || pfState.endId) {
			menu.addItem((item) => {
				item.setTitle(t("context.pathClear"))
					.setIcon("x")
					.onClick(() => this.host.clearPathfinder());
			});
		}
	}

	/** Context menu: Inline ontology type editor */
	private _ctxOntologySection(menu: Menu, node: PixiNode) {
		if (!this.host.isInlineOntologyEnabled?.()) return;
		menu.addSeparator();
		for (const otype of ["is-a", "has-a", "similar"]) {
			menu.addItem((item) => {
				item.setTitle(t("context.setType").replace("{type}", otype))
					.setIcon("tag")
					.onClick(() => this.host.setNodeOntologyType?.(node.data.id, otype));
			});
		}
	}

	/** Context menu: Relation type picker */
	private _ctxRelationSection(menu: Menu, node: PixiNode) {
		if (!this.host.isRelationTypePickerEnabled?.()) return;
		const nbIds = this.host.getNeighborIds?.(node.data.id) ?? [];
		if (nbIds.length === 0) return;
		menu.addSeparator();
		for (const nbId of nbIds.slice(0, 2)) {
			const nbPn = this.host.getPixiNodes().get(nbId);
			if (!nbPn) continue;
			const nbLabel = nbPn.data.label || nbId;
			menu.addItem((item) => {
				item.setTitle(`Link → ${nbLabel}`)
					.setIcon("git-branch")
					.onClick(() => this.host.addRelationToNode?.(node.data.id, nbId, "is-a"));
			});
		}
	}

	/** Context menu: Cluster compare + manual clustering */
	private _ctxClusterSection(menu: Menu, node: PixiNode) {
		if (this.host.isClusterCompareEnabled?.()) {
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle(t("context.clusterCompare"))
					.setIcon("git-compare")
					.onClick(() => this.host.toggleClusterCompare?.(node.data.id));
			});
		}
		if (this.host.isManualClusteringEnabled?.()) {
			const groupKeys = this.host.getClusterGroupKeys?.() ?? [];
			if (groupKeys.length > 0) {
				menu.addSeparator();
				for (const gk of groupKeys.slice(0, 5)) {
					menu.addItem((item) => {
						item.setTitle(t("context.moveTo").replace("{group}", gk))
							.setIcon("folder")
							.onClick(() => this.host.setManualCluster?.(node.data.id, gk));
					});
				}
			}
		}
	}

	/** Context menu: Multi-select toggle */
	private _ctxMultiSelectSection(menu: Menu, node: PixiNode) {
		if (!this.host.toggleMultiSelect) return;
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("context.multiSelect"))
				.setIcon("check-square")
				.onClick(() => this.host.toggleMultiSelect!(node.data.id));
		});
	}

	/** Context menu: Subgraph view entries */
	private _ctxSubgraphSection(menu: Menu) {
		const panel = this.host.getPanel?.();
		const multiIds = panel?.multiSelectNodeIds ?? [];
		if (multiIds.length < 2 || !this.host.enterSubgraph) return;
		menu.addSeparator();
		const viewModes = ["graph", "sunburst", "timeline", "tree", "matrix"] as const;
		for (const vm of viewModes) {
			menu.addItem((item) => {
				item.setTitle(`${t("context.openSubgraph") ?? "Open as subgraph"} → ${vm}`)
					.setIcon("git-branch")
					.onClick(() => this.host.enterSubgraph!([...multiIds], vm));
			});
		}
		if (this.host.openSubgraphNewTab) {
			menu.addSeparator();
			for (const vm of viewModes) {
				menu.addItem((item) => {
					item.setTitle(`${t("context.openSubgraphNewTab") ?? "Open in new tab"} → ${vm}`)
						.setIcon("external-link")
						.onClick(() => this.host.openSubgraphNewTab!([...multiIds], vm));
				});
			}
		}
	}

	// -----------------------------------------------------------------------
	// Canvas context menu (right-click on empty space)
	// -----------------------------------------------------------------------
	private _showCanvasContextMenu(e: MouseEvent, worldPt: { x: number; y: number }) {
		const menu = new Menu();

		// Create note here (4a)
		if (this.host.createNoteAtPosition) {
			menu.addItem((item) => {
				item.setTitle(t("context.createNote"))
					.setIcon("file-plus")
					.onClick(() => this.host.createNoteAtPosition!(worldPt.x, worldPt.y));
			});
		}

		// I2: Insert blank placeholder node
		if (this.host.insertBlankNode) {
			menu.addItem((item) => {
				item.setTitle(t("context.insertBlank"))
					.setIcon("plus-circle")
					.onClick(() => this.host.insertBlankNode!(worldPt.x, worldPt.y));
			});
		}

		// Export full graph as JSON
		if (this.host.exportFullGraph) {
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle(t("context.exportGraphJson"))
					.setIcon("download")
					.onClick(() => this.host.exportFullGraph!());
			});
		}

		// ED: Viewport bookmark — save/restore
		if (this.host.saveViewport) {
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle(t("context.saveViewport") ?? "Save Viewport")
					.setIcon("bookmark")
					.onClick(() => {
						const name = `View ${(this.host.getSavedViewportNames?.()?.length ?? 0) + 1}`;
						this.host.saveViewport!(name);
					});
			});
			const names = this.host.getSavedViewportNames?.() ?? [];
			for (const name of names.slice(0, 5)) {
				menu.addItem((item) => {
					item.setTitle(`→ ${name}`)
						.setIcon("map-pin")
						.onClick(() => this.host.restoreViewport!(name));
				});
			}
		}

		// FC: PNG export
		if (this.host.exportPng) {
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle(t("context.exportPng"))
					.setIcon("image")
					.onClick(() => this.host.exportPng!());
			});
		}

		// Subgraph view (requires multi-select with >= 2 nodes)
		const panel = this.host.getPanel?.();
		const multiIds = panel?.multiSelectNodeIds ?? [];
		if (multiIds.length >= 2 && this.host.enterSubgraph) {
			menu.addSeparator();
			const viewModes = ["graph", "sunburst", "timeline", "tree", "matrix"] as const;
			for (const vm of viewModes) {
				menu.addItem((item) => {
					item.setTitle(`${t("context.openSubgraph") ?? "Open as subgraph"} → ${vm}`)
						.setIcon("git-branch")
						.onClick(() => this.host.enterSubgraph!([...multiIds], vm));
				});
			}
			if (this.host.openSubgraphNewTab) {
				menu.addSeparator();
				for (const vm of viewModes) {
					menu.addItem((item) => {
						item.setTitle(`${t("context.openSubgraphNewTab") ?? "Open in new tab"} → ${vm}`)
							.setIcon("external-link")
							.onClick(() => this.host.openSubgraphNewTab!([...multiIds], vm));
					});
				}
			}
		}

		menu.showAtPosition({ x: e.clientX, y: e.clientY });
	}
}
