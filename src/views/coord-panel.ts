/**
 * Coordinate layout panel — axis evaluation, preview, expression library,
 * constants UI, and axis source parsing extracted from PanelBuilder.
 */

import type {
	CoordinateLayout,
	AxisSource,
	AxisConfig,
	AxisTransform,
} from "../types";
import { setIcon } from "obsidian";
import { t, tHelp, getLocale } from "../i18n";
import { CURVE_REGISTRY } from "../layouts/coordinate-presets";
import { validateExpr, parseExpr, evalExpr, setUserVars } from "../utils/expr-eval";
import {
	parseTransformExpr,
	transformExprToString,
} from "../utils/transform-expr";
import { addSlider, getUnifiedFieldSuggestions } from "./panel-widgets";
import {
	syncArrangementFromLayout,
	getPreset,
	type ClusterSectionCtx,
} from "./panel-sections-layout";
import type { PanelState, PanelContext, PanelCallbacks } from "./PanelBuilder";
import { mergeRenderThresholds } from "../types";

// ---------------------------------------------------------------------------
// Pure evaluation helpers
// ---------------------------------------------------------------------------

/** Evaluate an axis source definition at index i of n total. */
export function evalSource(source: AxisSource, i: number, n: number): number {
	const t = i / Math.max(n - 1, 1);
	switch (source.kind) {
		case "index":
			return t; // uniform ramp
		case "random": {
			// Deterministic pseudo-random (mulberry32-style) for consistent preview
			let s = (i * 2654435761 + (source.seed ?? 42)) >>> 0;
			s = (s ^ (s >> 16)) * 0x45d9f3b;
			s = (s ^ (s >> 16)) >>> 0;
			return (s & 0xffff) / 0xffff;
		}
		case "const":
			return source.value ?? 1;
		case "metric": {
			const m = source.metric;
			if (m === "degree") {
				// Power-law-like: many low-degree, few high-degree
				return Math.pow(t, 0.4);
			}
			if (m === "bfs-depth") {
				// Discrete depth levels (0..4)
				return Math.floor(t * 5) / 4;
			}
			if (m === "sibling-rank") {
				// Sawtooth: resets within each depth level
				return (t * 5) % 1;
			}
			return t;
		}
		case "property":
			return t; // date → monotonic
		case "field":
			// Categorical: discrete steps
			return Math.floor(t * 6) / 5;
		default:
			return t;
	}
}

/** Evaluate a single transform at input value t, index i of n total. */
export function evalTransform(
	transform: AxisTransform,
	t: number,
	i: number,
	n: number,
	constants?: Record<string, number>,
): number {
	switch (transform.kind) {
		case "linear":
			return t * (transform.scale ?? 1);
		case "bin": {
			const count = Math.max(transform.count, 1);
			return Math.min(Math.floor(t * count), count - 1) / Math.max(count - 1, 1);
		}
		case "date-to-index":
			return t;
		case "golden-angle":
			return (i * 2.3999632297286535) % (Math.PI * 2);
		case "even-divide": {
			const totalRad = ((transform.totalRange ?? 360) * Math.PI) / 180;
			return t * totalRad;
		}
		case "stack-avoid":
			return t + Math.sin(i * 9.1) * 0.05;
		case "curve": {
			const curveDef = CURVE_REGISTRY[transform.curve];
			if (!curveDef) return t;
			const params = { ...curveDef.defaultParams, ...transform.params, ...constants };
			return curveDef.fn(t * n, params);
		}
		case "expression": {
			const expr = transform.expr || "t";
			try {
				const err = validateExpr(expr);
				if (err) return t;
				const ast = parseExpr(expr);
				return (
					evalExpr(ast, { t: t * n, i, n, v: t, pi: Math.PI, e: Math.E, ...constants }) *
					(transform.scale ?? 1)
				);
			} catch {
				return t;
			}
		}
	}
	return t;
}

// ---------------------------------------------------------------------------
// Canvas preview
// ---------------------------------------------------------------------------

/**
 * Draw source→transform curve onto a canvas region.
 * Source distribution shapes the x-input; transform shapes the y-output.
 */
export function plotCurve(
	ctx: CanvasRenderingContext2D,
	axisCfg: AxisConfig,
	n: number,
	x0: number,
	y0: number,
	w: number,
	h: number,
	color: string,
	label: string,
	constants?: Record<string, number>,
): void {
	const samples: number[] = [];
	for (let i = 0; i < n; i++) {
		const srcVal = evalSource(axisCfg.source, i, n);
		samples.push(evalTransform(axisCfg.transform, srcVal, i, n, constants));
	}
	let lo = Infinity,
		hi = -Infinity;
	for (const v of samples) {
		if (v < lo) lo = v;
		if (v > hi) hi = v;
	}
	const range = hi - lo || 1;

	// Axis line
	ctx.strokeStyle = "rgba(255,255,255,0.08)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x0, y0 + h);
	ctx.lineTo(x0 + w, y0 + h);
	ctx.moveTo(x0, y0);
	ctx.lineTo(x0, y0 + h);
	ctx.stroke();

	// Curve
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const sx = x0 + (i / (n - 1)) * w;
		const sy = y0 + h - ((samples[i] - lo) / range) * h;
		if (i === 0) { ctx.moveTo(sx, sy); } else { ctx.lineTo(sx, sy); }
	}
	ctx.stroke();

	// Label (axis name)
	ctx.fillStyle = "rgba(200, 210, 230, 0.7)";
	ctx.font = "bold 9px sans-serif";
	ctx.fillText(label, x0 + 2, y0 + 10);

	// Source + transform subtitle
	const srcLabel =
		axisCfg.source.kind === "metric" ? (axisCfg.source as { metric: string }).metric : axisCfg.source.kind;
	ctx.fillStyle = "rgba(180, 190, 220, 0.5)";
	ctx.font = "8px sans-serif";
	ctx.fillText(`${srcLabel} → ${axisCfg.transform.kind}`, x0 + 2, y0 + 19);
}

/**
 * Build preview showing axis1 and axis2 transform functions as graphs,
 * plus a small combined XY/polar scatter for the overall shape.
 */
export function buildCoordPreview(body: HTMLElement, layout: CoordinateLayout): void {
	const W = 240,
		H = 80;
	const N = 60;
	const PAD = 4;

	const container = body.createDiv({ cls: "gi-coord-preview" });
	const canvas = container.createEl("canvas");
	canvas.width = W;
	canvas.height = H;
	canvas.style.width = `${W}px`;
	canvas.style.height = `${H}px`;

	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	// Background
	ctx.fillStyle = "rgba(0,0,0,0.15)";
	ctx.fillRect(0, 0, W, H);

	const isPolar = layout.system === "polar";
	const lbl1 = isPolar ? "r" : "X";
	const lbl2 = isPolar ? "θ" : "Y";
	const col1 = "rgba(100, 160, 255, 0.8)";
	const col2 = "rgba(255, 130, 100, 0.8)";

	// Left half: axis1 curve, Right half: axis2 curve
	const halfW = (W - PAD * 3) / 2;
	const plotH = H - PAD * 2;
	plotCurve(ctx, layout.axis1, N, PAD, PAD, halfW, plotH, col1, lbl1, layout.constants);
	plotCurve(ctx, layout.axis2, N, PAD * 2 + halfW, PAD, halfW, plotH, col2, lbl2, layout.constants);
}

// ---------------------------------------------------------------------------
// Expression Library — preset formulas for common shapes and patterns
// ---------------------------------------------------------------------------

interface ExprLibraryEntry {
	/** Display name (i18n key or literal) */
	name: string;
	/** Description */
	desc: string;
	/** Axis 1 expression */
	axis1: string;
	/** Axis 2 expression */
	axis2: string;
	/** Coordinate system */
	system?: "cartesian" | "polar";
	/** User-defined constants to set alongside the expressions */
	constants?: Record<string, number>;
}

const EXPR_LIBRARY: ExprLibraryEntry[] = [
	// ── Shape fills ──
	{
		name: "Grid",
		desc: "i % ceil(sqrt(n)) × floor(i / ceil(sqrt(n)))",
		axis1: "i % ceil(sqrt(n))",
		axis2: "floor(i / ceil(sqrt(n)))",
	},
	{
		name: "Triangle",
		desc: "row k → k+1 nodes, centered",
		axis1: "i - floor((-1+sqrt(1+8*i))/2)*(floor((-1+sqrt(1+8*i))/2)+1)/2 - floor((-1+sqrt(1+8*i))/2)/2",
		axis2: "floor((-1+sqrt(1+8*i))/2)",
	},
	{
		name: "Diamond",
		desc: "rhombus — triangle top + mirrored bottom",
		axis1: "i - floor((-1+sqrt(1+8*(i%floor(n/2))))/2)*(floor((-1+sqrt(1+8*(i%floor(n/2))))/2)+1)/2 - floor((-1+sqrt(1+8*(i%floor(n/2))))/2)/2",
		axis2: "floor((-1+sqrt(1+8*(i%floor(n/2))))/2) * (1 - 2*floor(i/floor(n/2)))",
	},
	{
		name: "Octagon",
		desc: "regular octagon outline — nodes on edges",
		axis1: "cos(floor(8*i/n)*pi/4+pi/8)*(1-8*i/n+floor(8*i/n))+cos((floor(8*i/n)+1)*pi/4+pi/8)*(8*i/n-floor(8*i/n))",
		axis2: "sin(floor(8*i/n)*pi/4+pi/8)*(1-8*i/n+floor(8*i/n))+sin((floor(8*i/n)+1)*pi/4+pi/8)*(8*i/n-floor(8*i/n))",
	},
	{
		name: "Hexagon",
		desc: "regular hexagon outline — nodes on edges",
		axis1: "cos(floor(6*i/n)*pi/3+pi/6)*(1-6*i/n+floor(6*i/n))+cos((floor(6*i/n)+1)*pi/3+pi/6)*(6*i/n-floor(6*i/n))",
		axis2: "sin(floor(6*i/n)*pi/3+pi/6)*(1-6*i/n+floor(6*i/n))+sin((floor(6*i/n)+1)*pi/3+pi/6)*(6*i/n-floor(6*i/n))",
	},
	{
		name: "Filled Polygon",
		desc: "golden-angle fill shaped to k-gon (k=sides, d=density)",
		axis1: "(i/n)^d*(cos(pi/k)/cos(i*2.39996%(2*pi/k)-pi/k))*cos(i*2.39996)",
		axis2: "(i/n)^d*(cos(pi/k)/cos(i*2.39996%(2*pi/k)-pi/k))*sin(i*2.39996)",
		constants: { k: 6, d: 0.5 },
	},
	// ── Spirals & curves ──
	{
		name: "Sunflower",
		desc: "r=√t, θ=golden angle (137.5°)",
		axis1: "sqrt(t)",
		axis2: "i * 137.508",
		system: "polar",
	},
	{
		name: "Archimedean Spiral",
		desc: "r=t, θ=t×360°",
		axis1: "t",
		axis2: "t * 720",
		system: "polar",
	},
	{
		name: "Fermat Spiral",
		desc: "r=√t, θ=t×720°",
		axis1: "sqrt(t)",
		axis2: "t * 720",
		system: "polar",
	},
	// ── Mathematical patterns ──
	{
		name: "Sine Wave",
		desc: "X=t, Y=sin(2πt)",
		axis1: "t",
		axis2: "sin(t * tau)",
	},
	{
		name: "Lissajous",
		desc: "sin(3t) × cos(2t)",
		axis1: "sin(3 * t * tau)",
		axis2: "cos(2 * t * tau)",
	},
	{
		name: "Concentric Rings",
		desc: "r=floor(sqrt(i)), θ evenly spaced per ring",
		axis1: "floor(sqrt(i))",
		axis2: "i * 137.508",
		system: "polar",
	},
	{
		name: "Diagonal",
		desc: "X=i, Y=i (simple baseline)",
		axis1: "i",
		axis2: "i",
	},
];

/** Variable reference entries: name → [description_en, description_ja, range] */
const VARIABLE_REFERENCE: Array<{ name: string; desc: string; descJa: string; range: string }> = [
	{
		name: "i",
		desc: "Node index in group (0-based)",
		descJa: "グループ内インデックス（0始まり）",
		range: "0, 1, …, n−1",
	},
	{ name: "n", desc: "Total node count in group", descJa: "グループ内ノード総数", range: "≥ 1" },
	{ name: "t", desc: "Normalized position (min→0, max→1)", descJa: "正規化位置（最小→0, 最大→1）", range: "[0, 1]" },
	{ name: "v", desc: "Raw source value (before normalization)", descJa: "ソースの生値（正規化前）", range: "any" },
];

/** Build a compact variable reference table inside the expression library */
function buildVariableReference(container: HTMLElement): void {
	const section = container.createDiv({ cls: "gi-var-reference" });
	const header = section.createDiv({ cls: "gi-var-reference-header" });
	header.createEl("span", { text: t("coord.variableReference"), cls: "gi-setting-label" });

	const table = section.createEl("table", { cls: "gi-var-table" });
	for (const v of VARIABLE_REFERENCE) {
		const tr = table.createEl("tr");
		tr.createEl("td", { text: v.name, cls: "gi-var-name" });
		tr.createEl("td", { text: getLocale() === "ja" ? v.descJa : v.desc, cls: "gi-var-desc" });
		tr.createEl("td", { text: v.range, cls: "gi-var-range" });
	}
}

/** Build the expression library UI — collapsible list of preset formulas */
export function buildExprLibrary(body: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	const wrapper = body.createDiv({ cls: "gi-expr-library" });

	// Header (collapsible)
	const header = wrapper.createDiv({ cls: "gi-expr-library-header clickable-icon" });
	const chevron = header.createEl("span", { cls: "gi-expr-library-chevron", text: "▸" });
	header.createEl("span", { text: ` ${t("coord.exprLibrary")}` });

	// Help icon
	const helpBtn = header.createEl("span", { cls: "gi-help-btn clickable-icon" });
	setIcon(helpBtn, "help-circle");
	helpBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		const existing = wrapper.querySelector(".gi-help-popup");
		if (existing) {
			existing.remove();
			return;
		}
		const popup = wrapper.createDiv({ cls: "gi-help-popup" });
		popup.textContent = tHelp("help.exprReference");
	});

	// Body (initially hidden)
	const listBody = wrapper.createDiv({ cls: "gi-expr-library-body" });
	listBody.style.display = "none";

	header.addEventListener("click", () => {
		const open = listBody.style.display !== "none";
		listBody.style.display = open ? "none" : "block";
		chevron.textContent = open ? "▸" : "▾";
	});

	// Hint
	listBody.createEl("div", {
		cls: "gi-hint",
		text: t("coord.libraryHint"),
	});

	// Variable reference table
	buildVariableReference(listBody);

	// Library entries
	for (const entry of EXPR_LIBRARY) {
		const item = listBody.createDiv({ cls: "gi-expr-library-item" });
		const nameEl = item.createEl("span", { cls: "gi-expr-library-name", text: entry.name });
		item.createEl("span", { cls: "gi-expr-library-desc", text: entry.desc });

		item.addEventListener("click", () => {
			// Apply the preset to panel
			const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
			panel.coordinateLayout = {
				...base,
				system: entry.system ?? "cartesian",
				axis1: {
					source: { kind: "index" },
					transform: { kind: "expression", expr: entry.axis1, scale: 1 },
				},
				axis2: {
					source: { kind: "index" },
					transform: { kind: "expression", expr: entry.axis2, scale: 1 },
				},
				...(entry.constants ? { constants: { ...entry.constants } } : {}),
			};
			panel.clusterArrangement = "custom";
			cb.applyClusterForce();
			cb.rebuildPanel();
			cb.restartSimulation(0.5);

			// Brief highlight
			nameEl.style.color = "var(--text-success, #4f4)";
			setTimeout(() => {
				nameEl.style.color = "";
			}, 600);
		});
	}

	// Auto-optimize button
	const optRow = listBody.createDiv({ cls: "gi-auto-optimize-row" });
	const optBtn = optRow.createEl("button", {
		cls: "gi-auto-optimize-btn",
		text: t("coord.autoOptimize"),
	});
	optBtn.addEventListener("click", () => {
		optBtn.disabled = true;
		optBtn.textContent = t("coord.autoOptimizeRunning");
		cb.autoOptimize();
		const rt = mergeRenderThresholds(panel.renderThresholds);
		const waitMs = rt.autoOptMaxPasses * 1500 + 500;
		setTimeout(() => {
			optBtn.disabled = false;
			optBtn.textContent = t("coord.autoOptimize");
		}, waitMs);
	});
}

/** Build the constants management UI — key-value list for user-defined constants */
export function buildConstantsUI(body: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	const constants = panel.coordinateLayout?.constants ?? {};
	const entries = Object.entries(constants);

	const section = body.createDiv({ cls: "gi-constants-section" });

	// Header
	const header = section.createDiv({ cls: "gi-setting-row" });
	header.createEl("span", {
		cls: "gi-setting-label",
		text: t("coord.constants"),
	});

	// Existing constant rows
	const listEl = section.createDiv({ cls: "gi-constants-list" });
	for (const [key, val] of entries) {
		buildConstantRow(listEl, key, val, panel, cb);
	}

	// Add button
	const addBtn = section.createEl("button", {
		cls: "gi-add-group",
		text: t("coord.addConstant"),
	});
	addBtn.addEventListener("click", () => {
		const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
		const existing = base.constants ?? {};
		// Find a free single-letter key
		const alphabet = "abcdefghijklmnopqrstuvwxyz";
		const reserved = new Set(["t", "i", "n", "v", "e"]);
		let newKey = "c";
		for (const ch of alphabet) {
			if (!reserved.has(ch) && !(ch in existing)) {
				newKey = ch;
				break;
			}
		}
		panel.coordinateLayout = {
			...base,
			constants: { ...existing, [newKey]: 1 },
		};
		syncUserVarsFromLayout(panel);
		cb.applyClusterForce();
		// Add the new row directly instead of rebuilding the entire panel
		buildConstantRow(listEl, newKey, 1, panel, cb);
		cb.restartSimulation(0.5);
	});

	// --- System constants (overlap control + arrangement-specific) ---
	const SYSTEM_CONSTANTS: Record<string, { default: number; hint: string }> = {
		_blend: { default: 0.85, hint: t("coord.sysBlend") },
		_overlapPad: { default: 1.3, hint: t("coord.sysOverlapPad") },
		_minGap: { default: 0, hint: t("coord.sysMinGap") },
	};

	const sysHeader = section.createDiv({ cls: "gi-setting-row" });
	sysHeader.createEl("span", {
		cls: "gi-setting-label gi-system-constants-label",
		text: t("coord.systemConstants"),
	});

	const sysListEl = section.createDiv({ cls: "gi-constants-list gi-system-constants" });
	for (const [sysKey, sysDef] of Object.entries(SYSTEM_CONSTANTS)) {
		const currentVal = constants[sysKey] ?? sysDef.default;
		const isDefault = !(sysKey in constants);
		buildSystemConstantRow(sysListEl, sysKey, currentVal, isDefault, sysDef.hint, panel, cb);
	}

	// Hint
	section.createEl("p", { cls: "gi-hint", text: t("coord.constantsHint") });
}

/** Build a single constant row: [key input] = [value input] [delete] */
function buildConstantRow(
	container: HTMLElement,
	key: string,
	value: number,
	panel: PanelState,
	cb: PanelCallbacks,
): void {
	const row = container.createDiv({ cls: "gi-setting-row gi-constant-row" });

	// Key input (1-2 letters)
	const keyInput = row.createEl("input", {
		cls: "gi-setting-input gi-constant-key",
		type: "text",
		attr: { "aria-label": t("coord.constantKey") },
	});
	keyInput.value = key;
	keyInput.maxLength = 2;
	keyInput.style.width = "40px";
	keyInput.style.textAlign = "center";

	row.createEl("span", { text: " = ", cls: "gi-constant-eq" });

	// Value input
	const valInput = row.createEl("input", {
		cls: "gi-setting-input gi-constant-val",
		type: "number",
		attr: { "aria-label": t("coord.constantValue") },
	});
	valInput.value = String(value);
	valInput.style.width = "70px";
	valInput.step = "0.1";

	// Delete button
	const delBtn = row.createEl("button", { cls: "gi-remove-btn", text: "\u00d7" });

	const applyChange = (oldKey: string, newKey: string, newVal: number) => {
		const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
		const existing = { ...(base.constants ?? {}) };
		if (oldKey !== newKey) delete existing[oldKey];
		existing[newKey] = newVal;
		panel.coordinateLayout = { ...base, constants: existing };
		syncUserVarsFromLayout(panel);
		cb.applyClusterForce();
		cb.restartSimulation(0.5);
	};

	keyInput.addEventListener("change", () => {
		const newKey = keyInput.value.trim().toLowerCase();
		if (!newKey || newKey.length > 2) {
			keyInput.value = key;
			return;
		}
		// Reject reserved names
		const reserved = new Set(["t", "i", "n", "v"]);
		if (reserved.has(newKey)) {
			keyInput.value = key;
			return;
		}
		applyChange(key, newKey, parseFloat(valInput.value) || 0);
	});

	valInput.addEventListener("change", () => {
		const newVal = parseFloat(valInput.value);
		if (isNaN(newVal)) return;
		applyChange(key, keyInput.value.trim().toLowerCase() || key, newVal);
	});

	delBtn.addEventListener("click", () => {
		const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
		const existing = { ...(base.constants ?? {}) };
		delete existing[key];
		panel.coordinateLayout = {
			...base,
			constants: Object.keys(existing).length > 0 ? existing : undefined,
		};
		syncUserVarsFromLayout(panel);
		cb.applyClusterForce();
		// Remove the row from DOM directly instead of rebuilding the entire panel
		row.remove();
		cb.restartSimulation(0.5);
	});
}

/** Build a system constant row: [fixed label] = [value input] [reset] */
function buildSystemConstantRow(
	container: HTMLElement,
	key: string,
	value: number,
	isDefault: boolean,
	hint: string,
	panel: PanelState,
	cb: PanelCallbacks,
): void {
	const row = container.createDiv({ cls: "gi-setting-row gi-constant-row gi-system-constant-row" });
	if (isDefault) row.classList.add("gi-constant-default");

	// Fixed label (not editable)
	const label = row.createEl("span", {
		cls: "gi-constant-key gi-system-constant-key",
		text: key,
		attr: { title: hint },
	});
	label.style.width = "80px";
	label.style.display = "inline-block";
	label.style.fontSize = "11px";

	row.createEl("span", { text: " = ", cls: "gi-constant-eq" });

	// Value input
	const valInput = row.createEl("input", {
		cls: "gi-setting-input gi-constant-val",
		type: "number",
		attr: { "aria-label": key + " " + t("coord.constantValue") },
	});
	valInput.value = String(value);
	valInput.style.width = "70px";
	valInput.step = key === "_minGap" ? "1" : "0.05";
	if (isDefault) valInput.style.opacity = "0.5";

	// Hint text
	const hintEl = row.createEl("span", {
		cls: "gi-hint gi-constant-hint",
		text: hint,
	});
	hintEl.style.fontSize = "10px";
	hintEl.style.marginLeft = "4px";
	hintEl.style.opacity = "0.6";

	valInput.addEventListener("change", () => {
		const newVal = parseFloat(valInput.value);
		if (isNaN(newVal)) return;
		const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
		const existing = { ...(base.constants ?? {}) };
		existing[key] = newVal;
		panel.coordinateLayout = { ...base, constants: existing };
		syncUserVarsFromLayout(panel);
		// Remove default styling
		row.classList.remove("gi-constant-default");
		valInput.style.opacity = "1";
		cb.applyClusterForce();
		cb.restartSimulation(0.5);
	});
}

/** Sync user-defined variables from layout constants to the expression parser */
export function syncUserVarsFromLayout(panel: PanelState): void {
	const constants = panel.coordinateLayout?.constants ?? {};
	setUserVars(new Set(Object.keys(constants)));
}

/** Unified axis text input — combines source + transform in a single expression.
 *  Syntax: FUNC(source, params...) or just source (implicit linear).
 *  Examples: "COS(tag:?)", "BIN(degree, 5)", "ROSE(index, k=5)", "folder" */
export function buildAxisTextInput(
	body: HTMLElement,
	axisLabel: string,
	axisCfg: AxisConfig,
	axisNum: 1 | 2,
	panel: PanelState,
	cb: PanelCallbacks,
	_ctx: PanelContext,
	_suggestions: string[],
) {
	const axisKey = axisNum === 1 ? "axis1" : "axis2";

	const updateAxis = (source: AxisSource, transform: AxisTransform, skipRebuild = false) => {
		const base = panel.coordinateLayout ?? { ...getPreset(panel.clusterArrangement) };
		panel.coordinateLayout = {
			...base,
			[axisKey]: { ...base[axisKey], source, transform },
		};
		syncArrangementFromLayout(panel);
		cb.applyClusterForce();
		if (!skipRebuild) cb.rebuildPanel();
		cb.restartSimulation(0.5);
	};

	// --- Unified expression row ---
	const row = body.createDiv({ cls: "gi-setting-row" });
	row.createEl("span", { cls: "gi-setting-label", text: axisLabel });
	const input = row.createEl("textarea", { cls: "gi-setting-input gi-expr-textarea" }) as HTMLTextAreaElement;
	input.value = transformExprToString(axisCfg.source, axisCfg.transform);
	input.placeholder = t("coord.transformExprHint");
	input.title = t("coord.transformExprHelp");
	input.rows = 2;
	// Auto-expand textarea to fit content
	input.addEventListener("input", () => {
		input.style.height = "auto";
		input.style.height = input.scrollHeight + "px";
	});

	// Validation indicator
	const indicator = row.createEl("span", { cls: "gi-expr-indicator" });
	const updateIndicator = (value: string) => {
		const result = parseTransformExpr(value, axisCfg.source);
		if (result) {
			indicator.textContent = " \u2713";
			indicator.title = t("transform.exprValid");
			indicator.style.color = "var(--text-success, #4f4)";
		} else if (value.trim()) {
			indicator.textContent = " \u2717";
			indicator.title = t("transform.exprError");
			indicator.style.color = "var(--text-error, #f44)";
		} else {
			indicator.textContent = "";
		}
	};
	updateIndicator(input.value);

	input.addEventListener("input", () => {
		updateIndicator(input.value);
	});

	input.addEventListener("change", () => {
		const result = parseTransformExpr(input.value, axisCfg.source);
		if (!result) return;
		updateAxis(result.source, result.transform);
	});

	// --- Conditional sub-UI for curve params (when current transform is curve) ---
	if (axisCfg.transform.kind === "curve") {
		const sub = body.createDiv({ cls: "gi-transform-sub" });
		const curveTransform = axisCfg.transform;
		const curveDef = CURVE_REGISTRY[curveTransform.curve];
		if (curveDef) {
			const currentParams = { ...curveDef.defaultParams, ...curveTransform.params };
			for (const [pKey, defaultVal] of Object.entries(curveDef.defaultParams)) {
				const paramLabel = curveDef.paramLabels[pKey] ?? pKey;
				const currentVal = currentParams[pKey] ?? defaultVal;
				const minVal = pKey === "k" ? 1 : -5;
				const maxVal = pKey === "k" ? 12 : 5;
				addSlider(sub, `  ${paramLabel}`, minVal, maxVal, 0.1, currentVal, (v) => {
					const newParams = { ...currentParams, [pKey]: v };
					updateAxis(
						axisCfg.source,
						{
							kind: "curve",
							curve: curveTransform.curve,
							params: newParams,
							scale: curveTransform.scale ?? 1,
						},
						true,
					);
				});
			}
		}
	}
}

/** Generate autocomplete suggestions for axis source input */
export function getAxisSourceSuggestions(ctx: PanelContext): string[] {
	const keywords = ["index", "degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank", "random", "const"];
	const fields = getUnifiedFieldSuggestions(ctx);
	return [...keywords, ...fields, "hop:"];
}

// ---------------------------------------------------------------------------
// Axis source string ↔ AxisSource conversion
// ---------------------------------------------------------------------------
// Supported syntax:
//   index                       → { kind: "index" }
//   random                      → { kind: "random", seed: 42 }
//   random:123                  → { kind: "random", seed: 123 }
//   const:5                     → { kind: "const", value: 5 }
//   degree / in-degree / out-degree / bfs-depth / sibling-rank
//                               → { kind: "metric", metric: "..." }
//   hop:nodeName                → { kind: "hop", from: "nodeName" }
//   hop:nodeName:5              → { kind: "hop", from: "nodeName", maxDepth: 5 }
//   path / file / folder / tag / category / id / isTag
//                               → { kind: "field", field: "..." }
//   [anyFrontmatterKey]         → { kind: "field", field: "..." }
// ---------------------------------------------------------------------------

const METRIC_NAMES = new Set(["degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank"]);
const BUILT_IN_FIELDS = new Set(["path", "file", "folder", "tag", "category", "id", "isTag"]);

export function parseAxisSourceString(s: string): AxisSource | null {
	const trimmed = s.trim();
	if (!trimmed) return null;

	// Exact matches for keywords
	if (trimmed === "index") return { kind: "index" };
	if (METRIC_NAMES.has(trimmed)) return { kind: "metric", metric: trimmed as import("../types").MetricKind };

	// random / random:seed
	if (trimmed === "random") return { kind: "random", seed: 42 };
	if (trimmed.startsWith("random:")) {
		const seed = parseInt(trimmed.slice(7), 10);
		return { kind: "random", seed: isNaN(seed) ? 42 : seed };
	}

	// const:value
	if (trimmed.startsWith("const")) {
		if (trimmed === "const") return { kind: "const", value: 1 };
		if (trimmed.startsWith("const:")) {
			const v = parseFloat(trimmed.slice(6));
			return { kind: "const", value: isNaN(v) ? 1 : v };
		}
	}

	// hop:from or hop:from:maxDepth
	if (trimmed.startsWith("hop:")) {
		const parts = trimmed.slice(4).split(":");
		const from = parts[0] || "";
		const maxDepth = parts[1] ? parseInt(parts[1], 10) : undefined;
		return { kind: "hop", from, ...(maxDepth != null && !isNaN(maxDepth) ? { maxDepth } : {}) };
	}
	if (trimmed === "hop") return { kind: "hop", from: "" };

	// Built-in fields (path, file, folder, tag, category, id, isTag)
	if (BUILT_IN_FIELDS.has(trimmed)) return { kind: "field", field: trimmed };

	// Anything else with ":" suffix pattern like "tag:?" → treat as field name before ":"
	// But "tag:?" is just "tag" effectively, so strip trailing ":?" or ":*"
	const fieldMatch = trimmed.replace(/:[?*]?$/, "");
	if (fieldMatch && fieldMatch !== trimmed) {
		return { kind: "field", field: fieldMatch };
	}

	// Fallback: treat as a frontmatter field name
	return { kind: "field", field: trimmed };
}

export function axisSourceToString(src: AxisSource): string {
	switch (src.kind) {
		case "index":
			return "index";
		case "metric":
			return src.metric;
		case "random":
			return src.seed === 42 ? "random" : `random:${src.seed}`;
		case "const":
			return src.value === 1 ? "const" : `const:${src.value}`;
		case "hop": {
			let s = `hop:${src.from}`;
			if (src.maxDepth != null) s += `:${src.maxDepth}`;
			return s;
		}
		case "field":
			return src.field;
		case "property":
			return src.key; // legacy — display as field name
		default:
			return "index";
	}
}
