// Feature P / W4: ノード注釈 — キャンバス上のフローティング sticky note
// 元は GraphViewContainer に埋まっていた _renderAnnotation / _positionAnnotationEl /
// _updateAnnotationPositions / _renderAllAnnotations を抽出。
//
// 純粋ではないが (DOM 生成 + イベントハンドラ)、live binding を保つため deps を
// getter 関数で受け取る。これにより panel.annotations が再代入されても、既存の
// click ハンドラが現在の配列を参照できる (元実装と同じ semantics)。

import { CanvasContainer } from "./canvas2d";
import { t } from "../i18n";

export type Annotation = {
	nodeId: string;
	text: string;
	x: number;
	y: number;
	color?: string;
};

export interface AnnotationLayerDeps {
	/** Returns the layer DOM element (or null if not yet attached / detached). */
	getLayer(): HTMLElement | null;
	/** Returns the world container (or null if pixi not yet initialized). */
	getWorld(): CanvasContainer | null;
	/** Returns true once the pixi app is ready (positioning depends on world projection). */
	isPixiReady(): boolean;
	/** Returns the live annotations array. Re-evaluated on each call to preserve
	 *  live-binding semantics across panel state restoration. */
	getAnnotations(): Annotation[];
	/** Persist mutations (added / edited / moved / deleted). */
	onSave(): void;
}

/** W4: Sticky note color palette. */
const STICKY_COLORS: ReadonlyArray<{ name: string; bg: string }> = [
	{ name: "yellow", bg: "#eab308" },
	{ name: "blue", bg: "#3b82f6" },
	{ name: "green", bg: "#22c55e" },
	{ name: "pink", bg: "#ec4899" },
];

/** Render every annotation. Clears the layer first. */
export function renderAllAnnotations(deps: AnnotationLayerDeps): void {
	const layer = deps.getLayer();
	if (!layer) return;
	layer.empty();
	for (const ann of deps.getAnnotations()) renderAnnotation(deps, ann);
}

/** Render a single annotation as a draggable sticky note. */
export function renderAnnotation(deps: AnnotationLayerDeps, ann: Annotation): void {
	const layer = deps.getLayer();
	if (!layer || !deps.getWorld() || !deps.isPixiReady()) return;

	const colorClass = ann.color ? `gi-sticky-${ann.color}` : "gi-sticky-yellow";
	const el = layer.createDiv({ cls: `gi-annotation ${colorClass}` });

	const textEl = el.createEl("textarea", {
		cls: "gi-annotation-text",
		attr: { placeholder: t("annotation.placeholder"), rows: "2" },
	});
	textEl.value = ann.text;
	textEl.addEventListener("input", () => {
		ann.text = textEl.value;
		deps.onSave();
	});
	textEl.addEventListener("pointerdown", (e) => e.stopPropagation());

	const colorBar = el.createDiv({ cls: "gi-annotation-color-bar" });
	for (const sc of STICKY_COLORS) {
		const dot = colorBar.createDiv({ cls: "gi-annotation-color-dot" });
		dot.style.background = sc.bg;
		dot.addEventListener("click", (e) => {
			e.stopPropagation();
			ann.color = sc.name;
			el.className = `gi-annotation gi-sticky-${sc.name}`;
			deps.onSave();
		});
	}
	colorBar.addEventListener("pointerdown", (e) => e.stopPropagation());

	const deleteBtn = el.createEl("button", {
		cls: "gi-annotation-delete",
		attr: { "aria-label": t("annotation.delete"), title: t("annotation.delete") },
	});
	deleteBtn.textContent = "×";
	deleteBtn.addEventListener("click", () => {
		const list = deps.getAnnotations();
		const idx = list.indexOf(ann);
		if (idx >= 0) list.splice(idx, 1);
		el.remove();
		deps.onSave();
	});

	let dragging = false;
	let lastScreenX = 0;
	let lastScreenY = 0;

	el.addEventListener("pointerdown", (e) => {
		if (e.target === textEl) return;
		dragging = true;
		lastScreenX = e.clientX;
		lastScreenY = e.clientY;
		el.setPointerCapture(e.pointerId);
		e.preventDefault();
	});
	el.addEventListener("pointermove", (e) => {
		const world = deps.getWorld();
		if (!dragging || !world) return;
		const scale = world.scale.x || 1;
		ann.x += (e.clientX - lastScreenX) / scale;
		ann.y += (e.clientY - lastScreenY) / scale;
		lastScreenX = e.clientX;
		lastScreenY = e.clientY;
		positionAnnotationEl(deps, el, ann);
	});
	el.addEventListener("pointerup", (e) => {
		if (dragging) {
			dragging = false;
			el.releasePointerCapture(e.pointerId);
			deps.onSave();
		}
	});

	positionAnnotationEl(deps, el, ann);
}

/** Position a single annotation element by projecting world → screen. */
export function positionAnnotationEl(deps: AnnotationLayerDeps, el: HTMLElement, ann: { x: number; y: number }): void {
	const world = deps.getWorld();
	const layer = deps.getLayer();
	if (!world || !deps.isPixiReady() || !layer) return;
	const screen = world.toGlobal({ x: ann.x, y: ann.y });
	const parentRect = layer.parentElement?.getBoundingClientRect();
	if (!parentRect) return;
	el.style.left = `${screen.x - parentRect.left}px`;
	el.style.top = `${screen.y - parentRect.top}px`;
}

/** Update positions of all rendered annotation elements (call on zoom / pan). */
export function updateAnnotationPositions(deps: AnnotationLayerDeps): void {
	const layer = deps.getLayer();
	if (!layer) return;
	const list = deps.getAnnotations();
	const children = layer.children;
	const limit = Math.min(children.length, list.length);
	for (let i = 0; i < limit; i++) {
		const el = children[i];
		if (el instanceof HTMLElement) positionAnnotationEl(deps, el, list[i]);
	}
}
