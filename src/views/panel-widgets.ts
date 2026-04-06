import { setIcon } from "obsidian";
import { t } from "../i18n";
import type { PanelCallbacks, PanelContext, PanelState, GroupByRule } from "./PanelBuilder";
import type {
	SortKey,
	OntologyRule,
	OntologyRelation,
	ClusterGroupRule,
	ClusterGroupBy,
	GraphViewsSettings,
	NodeRule,
} from "../types";
// ShapeRule import removed (unused)
import { DEFAULT_COLORS } from "../types";
import { EDGE_TYPE_INHERITANCE } from "../constants";
import { parseQueryExpr, serializeExpr } from "../utils/query-expr";

export function updateSliderProgress(el: HTMLInputElement) {
	const min = parseFloat(el.min) || 0;
	const max = parseFloat(el.max) || 100;
	const val = parseFloat(el.value);
	const pct = ((val - min) / (max - min)) * 100;
	el.style.setProperty("--progress", pct + "%");
}

/** Dual-range slider for selecting a min/max range (0–1) */
export function buildDualRangeSlider(
	container: HTMLElement,
	label: string,
	initialMin: number,
	initialMax: number,
	onChange: (min: number, max: number) => void,
	description?: string,
) {
	const row = container.createDiv({ cls: "setting-item gi-dual-range" });
	const info = row.createDiv({ cls: "setting-item-info" });
	const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
	nameEl.title = description || label;
	const rangeLabel = info.createEl("span", {
		cls: "gi-slider-value",
		text: `${Math.round(initialMin * 100)}% – ${Math.round(initialMax * 100)}%`,
	});
	const control = row.createDiv({ cls: "setting-item-control gi-dual-range-control" });

	const minInput = control.createEl("input", {
		type: "range",
		cls: "gi-range-min",
		attr: { "aria-label": label + " (min)" },
	});
	minInput.min = "0";
	minInput.max = "100";
	minInput.step = "1";
	minInput.value = String(Math.round(initialMin * 100));
	const maxInput = control.createEl("input", {
		type: "range",
		cls: "gi-range-max",
		attr: { "aria-label": label + " (max)" },
	});
	maxInput.min = "0";
	maxInput.max = "100";
	maxInput.step = "1";
	maxInput.value = String(Math.round(initialMax * 100));

	updateSliderProgress(minInput);
	updateSliderProgress(maxInput);
	const update = () => {
		let lo = parseInt(minInput.value);
		let hi = parseInt(maxInput.value);
		if (lo > hi) {
			const tmp = lo;
			lo = hi;
			hi = tmp;
		}
		rangeLabel.textContent = `${lo}% – ${hi}%`;
		updateSliderProgress(minInput);
		updateSliderProgress(maxInput);
		onChange(lo / 100, hi / 100);
	};
	minInput.addEventListener("input", update);
	maxInput.addEventListener("input", update);
}

export function addSlider(
	container: HTMLElement,
	label: string,
	min: number,
	max: number,
	step: number,
	initial: number,
	onChange: (v: number) => void,
	description?: string,
): HTMLElement {
	const row = container.createDiv({ cls: "setting-item mod-slider" });
	const info = row.createDiv({ cls: "setting-item-info" });
	const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
	nameEl.title = description || label;
	const valueSpan = info.createEl("span", { cls: "gi-slider-value", text: String(initial) });
	const control = row.createDiv({ cls: "setting-item-control" });
	const input = control.createEl("input", { type: "range", attr: { "aria-label": label } });
	input.min = String(min);
	input.max = String(max);
	input.step = String(step);
	input.value = String(initial);
	updateSliderProgress(input);
	input.addEventListener("input", () => {
		const v = parseFloat(input.value);
		valueSpan.textContent = String(v);
		updateSliderProgress(input);
		onChange(v);
	});
	input.addEventListener("dblclick", () => {
		input.value = String(initial);
		valueSpan.textContent = String(initial);
		updateSliderProgress(input);
		onChange(initial);
	});
	return row;
}

export function addToggle(
	container: HTMLElement,
	label: string,
	initial: boolean,
	onChange: (v: boolean) => void,
	description?: string,
): HTMLElement {
	const row = container.createDiv({ cls: "setting-item mod-toggle" });
	const info = row.createDiv({ cls: "setting-item-info" });
	const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
	nameEl.title = description || label;
	const control = row.createDiv({ cls: "setting-item-control" });
	const toggle = control.createDiv({
		cls: "checkbox-container" + (initial ? " is-enabled" : ""),
		attr: { role: "switch", "aria-label": label, "aria-checked": String(initial), tabindex: "0" },
	});
	const activate = () => {
		const on = toggle.hasClass("is-enabled");
		toggle.toggleClass("is-enabled", !on);
		toggle.setAttribute("aria-checked", String(!on));
		onChange(!on);
	};
	toggle.addEventListener("click", activate);
	toggle.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			activate();
		}
	});
	return row;
}

export function addTextInput(
	container: HTMLElement,
	label: string,
	initial: string,
	placeholder: string,
	onChange: (v: string) => void,
) {
	const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
	const info = row.createDiv({ cls: "setting-item-info" });
	const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
	nameEl.title = label;
	const control = row.createDiv({ cls: "setting-item-control" });
	const input = control.createEl("input", { type: "text", placeholder, attr: { "aria-label": label } });
	input.value = initial;
	input.addEventListener("change", () => onChange(input.value));
}

/** Custom filtered autocomplete popup (replaces native datalist) */
export function attachAutocomplete(input: HTMLInputElement, suggestions: string[]) {
	const popup = document.createElement("div");
	popup.className = "gi-ac-popup";
	popup.style.display = "none";
	// Append to the flow/pair container (has position:relative)
	const anchor = input.closest(".gi-ont-flow") ?? input.closest(".gi-ont-pair") ?? input.parentElement!;
	anchor.appendChild(popup);

	let selected = -1;

	function show() {
		const q = input.value.toLowerCase();
		const filtered = suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 12);
		popup.empty();
		if (filtered.length === 0) {
			popup.style.display = "none";
			return;
		}
		for (let i = 0; i < filtered.length; i++) {
			const item = popup.createDiv({ cls: "gi-ac-item", text: filtered[i] });
			item.addEventListener("mousedown", (e) => {
				e.preventDefault();
				input.value = filtered[i];
				input.dispatchEvent(new Event("change"));
				popup.style.display = "none";
			});
		}
		// Position below the input
		const anchorRect = anchor.getBoundingClientRect();
		const inputRect = input.getBoundingClientRect();
		popup.style.left = inputRect.left - anchorRect.left + "px";
		popup.style.top = inputRect.bottom - anchorRect.top + 2 + "px";
		popup.style.display = "";
		selected = -1;
	}

	input.addEventListener("focus", show);
	input.addEventListener("input", show);
	input.addEventListener("blur", () => {
		setTimeout(() => (popup.style.display = "none"), 150);
	});
	input.addEventListener("keydown", (e) => {
		const items = popup.querySelectorAll(".gi-ac-item");
		if (!items.length) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			selected = Math.min(selected + 1, items.length - 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			selected = Math.max(selected - 1, 0);
		} else if (e.key === "Enter" && selected >= 0) {
			e.preventDefault();
			input.value = (items[selected] as HTMLElement).textContent ?? "";
			input.dispatchEvent(new Event("change"));
			popup.style.display = "none";
			return;
		} else return;
		items.forEach((it, i) => it.toggleClass("is-selected", i === selected));
	});
}

/** Legacy alias — other inputs still call this */
export function attachDatalist(input: HTMLInputElement, suggestions: string[]) {
	attachAutocomplete(input, suggestions);
}

/** Unified field suggestion list: built-in fields + all frontmatter keys (including nested) */
export function getUnifiedFieldSuggestions(ctx: PanelContext): string[] {
	const builtIn = ["path", "file", "tag", "category", "folder", "id", "isTag"];
	return [...new Set([...builtIn, ...ctx.frontmatterKeys])];
}

/** GroupBy suggestion list: returns {value, label} options in "field:?" format */
export function getGroupByOptions(ctx: PanelContext): { value: string; label: string }[] {
	const builtIn = ["tag", "category", "folder", "path", "file", "id", "isTag"];
	const allFields = [...new Set([...builtIn, ...ctx.frontmatterKeys])];
	const opts = allFields.map((f) => ({ value: `${f}:?`, label: `${f}:?` }));
	// Louvain コミュニティ自動検出オプション
	opts.unshift({ value: "louvain:?", label: t("groupBy.louvain") });
	return opts;
}

// ---------------------------------------------------------------------------
// Ontology rule row: [input] [▼ relation] [input] [×]
// ---------------------------------------------------------------------------

const RELATION_OPTIONS: { value: OntologyRelation; label: string }[] = [
	{ value: "is-a", label: "is-a" },
	{ value: "has-a", label: "has-a" },
	{ value: "is-from", label: "is-from" },
	{ value: "is-alike", label: "is-alike" },
	{ value: "sibling", label: "sibling" },
];

export function renderOntologyRule(
	container: HTMLElement,
	rules: OntologyRule[],
	idx: number,
	cb: PanelCallbacks,
	save: () => void,
	rerender: () => void,
) {
	const rule = rules[idx];
	const row = container.createDiv({ cls: "gi-ont-rule" });

	// Forward input
	const fwdInput = row.createEl("input", {
		cls: "gi-search gi-ont-input",
		type: "text",
		placeholder: "parent, extends...",
		attr: { "aria-label": "Forward relation label" },
	});
	fwdInput.value = rule.forward;
	fwdInput.addEventListener("change", () => {
		rule.forward = fwdInput.value;
		save();
	});
	attachQueryHint(fwdInput, (field) => cb.collectValueSuggestions(field));

	// Relation dropdown
	const relBtn = row.createEl("button", { cls: "gi-ont-rel-btn" });
	relBtn.textContent = rule.relation;
	relBtn.addEventListener("click", () => {
		// Cycle through options or show popup
		const popup = row.querySelector(".gi-ont-rel-popup");
		if (popup) {
			popup.remove();
			return;
		}
		const menu = row.createDiv({ cls: "gi-ont-rel-popup" });
		for (const opt of RELATION_OPTIONS) {
			const item = menu.createDiv({
				cls: `gi-ont-rel-item${opt.value === rule.relation ? " is-active" : ""}`,
				text: opt.label,
			});
			item.addEventListener("click", () => {
				rule.relation = opt.value;
				relBtn.textContent = opt.label;
				menu.remove();
				save();
				rerender(); // Update reverse input disabled state for bidirectional relations
			});
		}
	});

	// Reverse input (hidden for bidirectional relations)
	const isBidir = rule.relation === "is-alike" || rule.relation === "sibling";
	const revInput = row.createEl("input", {
		cls: "gi-search gi-ont-input",
		type: "text",
		placeholder: isBidir ? "(双方向)" : "child, down...",
		attr: { "aria-label": "Reverse relation label" },
	});
	revInput.value = rule.reverse;
	revInput.disabled = isBidir;
	if (isBidir) revInput.classList.add("is-disabled");
	revInput.addEventListener("change", () => {
		rule.reverse = revInput.value;
		save();
	});
	attachQueryHint(revInput, (field) => cb.collectValueSuggestions(field));

	// Delete button
	const delBtn = row.createEl("button", { cls: "gi-ont-del-btn", attr: { "aria-label": "Delete" } });
	setIcon(delBtn, "x");
	delBtn.addEventListener("click", () => {
		rules.splice(idx, 1);
		save();
		rerender();
	});
}

/**
 * Multi-value input: renders a list of values as individual rows with add/delete buttons
 * and autocomplete suggestions. Replaces comma-separated text inputs for list-type fields.
 */
export function addMultiValueInput(
	container: HTMLElement,
	label: string,
	values: string[],
	placeholder: string,
	suggestions: string[],
	onChange: (values: string[]) => void,
) {
	const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
	const info = row.createDiv({ cls: "setting-item-info" });
	const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
	nameEl.title = label;
	const control = row.createDiv({ cls: "setting-item-control gi-multivalue-control" });

	const listEl = control.createDiv({ cls: "gi-multivalue-list" });

	function rebuild() {
		listEl.empty();
		values.forEach((val, i) => {
			const itemRow = listEl.createDiv({ cls: "gi-multivalue-row" });
			const input = itemRow.createEl("input", { type: "text", placeholder, cls: "gi-multivalue-field" });
			input.value = val;
			attachDatalist(input, suggestions);
			input.addEventListener("change", () => {
				values[i] = input.value.trim();
				onChange(values.filter(Boolean));
			});
			const rmBtn = itemRow.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00d7" });
			rmBtn.addEventListener("click", () => {
				values.splice(i, 1);
				onChange(values.filter(Boolean));
				rebuild();
			});
		});

		const addBtn = listEl.createEl("button", { cls: "gi-add-group gi-multivalue-add", text: "+" });
		addBtn.addEventListener("click", () => {
			values.push("");
			rebuild();
			// Focus the newly added input
			const inputs = listEl.querySelectorAll<HTMLInputElement>(".gi-multivalue-field");
			inputs[inputs.length - 1]?.focus();
		});
	}

	rebuild();
}

// ---------------------------------------------------------------------------
// GroupBy multi-rule editor
// ---------------------------------------------------------------------------

/** Parse groupBy string into individual rules: "tag AND category" → [{field:"tag",op:"AND"},{field:"category"}] */
export function parseGroupByRules(groupBy: string): GroupByRule[] {
	if (!groupBy || groupBy === "none") return [];
	// Split by known operators while preserving them
	const parts = groupBy.split(/\s+(AND|OR|XOR|NOR|NAND|NOT)\s+/i);
	const rules: GroupByRule[] = [];
	for (let i = 0; i < parts.length; i++) {
		const trimmed = parts[i].trim();
		if (!trimmed) continue;
		if (["AND", "OR", "XOR", "NOR", "NAND", "NOT"].includes(trimmed.toUpperCase())) {
			// Attach operator to previous rule
			if (rules.length > 0) rules[rules.length - 1].op = trimmed.toUpperCase();
		} else {
			// Could be comma-separated
			for (const field of trimmed.split(",")) {
				const f = field.trim();
				if (f) rules.push({ field: f, indent: 0 });
			}
		}
	}
	return rules.length > 0 ? rules : [];
}

/** Derive clusterGroupRules from groupByRules (used in follow mode). */
export function deriveClusterRulesFromGroupBy(rules: GroupByRule[]): ClusterGroupRule[] {
	return rules
		.filter((r) => r.field.trim() !== "")
		.map((r) => ({
			groupBy: (r.field.endsWith(":?") ? r.field : r.field + ":?") as ClusterGroupBy,
			recursive: r.recursive ?? false,
		}));
}

export function serializeGroupByRules(rules: GroupByRule[]): string {
	if (rules.length === 0) return "none";
	return rules
		.map((r, i) => {
			const op = i < rules.length - 1 ? ` ${r.op || "AND"} ` : "";
			return r.field + op;
		})
		.join("");
}

export function renderGroupByRules(container: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks) {
	container.empty();

	// Use panel.groupByRules as the authoritative source.
	// Initialize from the groupBy string only on first render.
	if (!panel.groupByRules) {
		panel.groupByRules = parseGroupByRules(panel.groupBy);
	}
	const rules = panel.groupByRules;
	const groupByOpts = getGroupByOptions(ctx);

	/** Sync panel.groupBy from rules (only filled fields) and re-render graph. */
	function syncAndRender() {
		const filled = rules.filter((r) => r.field.trim() !== "");
		panel.groupBy = filled.length > 0 ? serializeGroupByRules(filled) : "none";
		panel.collapsedGroups.clear();

		// Follow mode: auto-sync clusterGroupRules from groupByRules
		if (panel.clusterFollowsGroupBy) {
			panel.clusterGroupRules = deriveClusterRulesFromGroupBy(filled);
			cb.applyClusterForce();
			cb.restartSimulation(0.5);
		}

		cb.doRenderKeepPanel();
		cb.rebuildPanel(); // Progressive disclosure: groupMinSize/groupFilter/clusterGravity
	}

	/** Re-render the rows UI from the rules array. */
	function rebuildUI() {
		container.empty();
		renderRows();
	}

	/** Full rebuild: update UI + sync to graph. */
	function rebuild() {
		rebuildUI();
		syncAndRender();
	}

	function renderRows() {
		rules.forEach((rule, i) => {
			// Operator dropdown between rows
			if (i > 0) {
				const opRow = container.createDiv({ cls: "gi-expr-op-row" });
				opRow.style.paddingLeft = `${(rule.indent ?? 0) * 20}px`;
				const opSel = opRow.createEl("select", { cls: "dropdown gi-expr-op" });
				for (const op of ["AND", "OR", "XOR", "NOR", "NAND", "NOT"]) {
					const el = opSel.createEl("option", { text: op, value: op });
					if (op === (rules[i - 1].op ?? "AND")) el.selected = true;
				}
				opSel.addEventListener("change", () => {
					rules[i - 1].op = opSel.value;
					rebuild();
				});
			}

			const rowEl = container.createDiv({ cls: "gi-expr-row" });
			rowEl.style.paddingLeft = `${(rule.indent ?? 0) * 20}px`;

			// Field input with field:? suggestions (similar to search query UI)
			const fieldInput = rowEl.createEl("input", {
				cls: "gi-expr-field",
				type: "text",
				placeholder: "tag:?, category:?, folder:?...",
			});
			fieldInput.value = rule.field;
			attachFixedHint(fieldInput, groupByOpts, (val) => {
				rule.field = val;
				rebuild();
			});
			fieldInput.addEventListener("change", () => {
				rule.field = fieldInput.value.trim();
				rebuild();
			});

			// Indent/dedent
			const indentBtn = rowEl.createEl("span", { cls: "gi-expr-btn gi-indent-btn", text: "\u2192" });
			indentBtn.addEventListener("click", () => {
				rule.indent = (rule.indent ?? 0) + 1;
				rebuild();
			});
			const dedentBtn = rowEl.createEl("span", { cls: "gi-expr-btn gi-indent-btn", text: "\u2190" });
			dedentBtn.addEventListener("click", () => {
				rule.indent = Math.max(0, (rule.indent ?? 0) - 1);
				rebuild();
			});

			// Delete
			const rmBtn = rowEl.createEl("span", { cls: "gi-group-remove", text: "\u00d7" });
			rmBtn.addEventListener("click", () => {
				rules.splice(i, 1);
				rebuild();
			});
		});

		// Add rule button
		const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("expr.addCondition") });
		addBtn.addEventListener("click", () => {
			rules.push({ field: "", indent: 0 });
			// Only rebuild UI — don't sync to graph or trigger doRenderKeepPanel.
			// The empty rule lives in panel.groupByRules and survives buildPanel() calls.
			rebuildUI();
		});
	}

	renderRows();
}

/** Checkbox group — shows items as individually toggleable checkboxes */
export function addCheckboxGroup(
	container: HTMLElement,
	label: string,
	items: string[],
	selected: Set<string>,
	onChange: (selected: Set<string>) => void,
) {
	const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
	const info = row.createDiv({ cls: "setting-item-info" });
	const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
	nameEl.title = label;
	const control = row.createDiv({ cls: "setting-item-control gi-checkbox-group" });
	if (items.length === 0) {
		control.createEl("span", { cls: "gi-checkbox-empty", text: "—" });
		return;
	}
	for (const item of items) {
		const lbl = control.createEl("label", { cls: "gi-checkbox-item" });
		const cb = lbl.createEl("input", { type: "checkbox" });
		cb.checked = selected.has(item);
		lbl.createEl("span", { text: item });
		cb.addEventListener("change", () => {
			if (cb.checked) selected.add(item);
			else selected.delete(item);
			onChange(selected);
		});
	}
}

// ---------------------------------------------------------------------------
// Custom Mappings UI (ExcaliBrain compat)
// ---------------------------------------------------------------------------
export function renderCustomMappings(
	container: HTMLElement,
	s: GraphViewsSettings,
	ctx: PanelContext,
	cb: PanelCallbacks,
) {
	container.empty();
	if (!s.ontology.customMappings) s.ontology.customMappings = {};
	const entries = Object.entries(s.ontology.customMappings);

	for (const [field, type] of entries) {
		const row = container.createDiv({ cls: "gi-mapping-row" });

		const fieldInput = row.createEl("input", {
			type: "text",
			cls: "gi-mapping-field",
			placeholder: t("settings.mappingFieldPlaceholder"),
		});
		fieldInput.value = field;
		attachDatalist(fieldInput, ctx.frontmatterKeys);

		const typeSelect = row.createEl("select", { cls: "gi-mapping-type dropdown" });
		for (const opt of ["inheritance", "aggregation", "similar", "sibling", "sequence"] as const) {
			const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.mappingType.${opt}`) });
			if (opt === type) optEl.selected = true;
		}

		const removeBtn = row.createEl("button", { cls: "gi-mapping-remove clickable-icon", text: "\u00d7" });

		const update = () => {
			const oldField = field;
			const newField = fieldInput.value.trim();
			const newType = typeSelect.value as "inheritance" | "aggregation" | "similar" | "sibling" | "sequence";
			if (oldField !== newField) delete s.ontology.customMappings[oldField];
			if (newField) s.ontology.customMappings[newField] = newType;
			ctx.saveSettings();
			cb.invalidateDataKeepPanel();
		};
		fieldInput.addEventListener("change", update);
		typeSelect.addEventListener("change", update);
		removeBtn.addEventListener("click", () => {
			delete s.ontology.customMappings[field];
			ctx.saveSettings();
			cb.invalidateDataKeepPanel();
			renderCustomMappings(container, s, ctx, cb);
		});
	}

	const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addMapping") });
	addBtn.addEventListener("click", () => {
		s.ontology.customMappings[""] = EDGE_TYPE_INHERITANCE;
		renderCustomMappings(container, s, ctx, cb);
	});
}

// ---------------------------------------------------------------------------
// Tag Relations UI (explicit tag-to-tag relationships)
// ---------------------------------------------------------------------------
export function renderTagRelations(
	container: HTMLElement,
	s: GraphViewsSettings,
	ctx: PanelContext,
	cb: PanelCallbacks,
) {
	container.empty();
	if (!s.ontology.tagRelations) s.ontology.tagRelations = [];

	for (let i = 0; i < s.ontology.tagRelations.length; i++) {
		const rel = s.ontology.tagRelations[i];
		const row = container.createDiv({ cls: "gi-tag-rel-row" });

		const srcInput = row.createEl("input", {
			type: "text",
			cls: "gi-tag-rel-src",
			placeholder: t("settings.tagRelSourcePlaceholder"),
		});
		srcInput.value = rel.source;
		attachDatalist(srcInput, ctx.availableTags);

		const typeSelect = row.createEl("select", { cls: "gi-tag-rel-type dropdown" });
		for (const opt of ["inheritance", "aggregation"] as const) {
			const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.tagRelType.${opt}`) });
			if (opt === rel.type) optEl.selected = true;
		}

		const tgtInput = row.createEl("input", {
			type: "text",
			cls: "gi-tag-rel-tgt",
			placeholder: t("settings.tagRelTargetPlaceholder"),
		});
		tgtInput.value = rel.target;
		attachDatalist(tgtInput, ctx.availableTags);

		const removeBtn = row.createEl("button", { cls: "gi-tag-rel-remove clickable-icon", text: "\u00d7" });

		const update = () => {
			rel.source = srcInput.value.trim().replace(/^#/, "");
			rel.target = tgtInput.value.trim().replace(/^#/, "");
			rel.type = typeSelect.value as "inheritance" | "aggregation";
			ctx.saveSettings();
			cb.invalidateDataKeepPanel();
		};
		srcInput.addEventListener("change", update);
		tgtInput.addEventListener("change", update);
		typeSelect.addEventListener("change", update);
		removeBtn.addEventListener("click", () => {
			s.ontology.tagRelations.splice(i, 1);
			ctx.saveSettings();
			cb.invalidateDataKeepPanel();
			renderTagRelations(container, s, ctx, cb);
		});
	}

	const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addTagRelation") });
	addBtn.addEventListener("click", () => {
		s.ontology.tagRelations.push({ source: "", target: "", type: EDGE_TYPE_INHERITANCE });
		renderTagRelations(container, s, ctx, cb);
	});
}

// ---------------------------------------------------------------------------
// Search options hint — shown below query inputs on focus, like core graph view
// ---------------------------------------------------------------------------
export function getQueryOptions(): { prefix: string; desc: string }[] {
	const base = [
		{ prefix: "path:", desc: t("query.pathMatch") },
		{ prefix: "file:", desc: t("query.fileMatch") },
		{ prefix: "tag:", desc: t("query.tagSearch") },
		{ prefix: "category:", desc: t("query.categoryMatch") },
		{ prefix: "id:", desc: t("query.idMatch") },
		{ prefix: "isTag", desc: t("query.isTag") },
		{ prefix: "hop:name:N", desc: t("query.hop") },
		{ prefix: "AND / OR", desc: t("query.boolOps") },
		{ prefix: "*", desc: t("query.all") },
	];
	// Add dynamic frontmatter fields from the cached field suggestion context
	if (_cachedFieldSuggestions.length > 0) {
		for (const field of _cachedFieldSuggestions.slice(0, 15)) {
			if (!base.some((b) => b.prefix === `${field}:`)) {
				base.push({ prefix: `${field}:`, desc: `Frontmatter: ${field}` });
			}
		}
	}
	return base;
}

/** Cached field suggestions (populated by buildPanel) */
let _cachedFieldSuggestions: string[] = [];
export function setCachedFieldSuggestions(suggestions: string[]) {
	_cachedFieldSuggestions = suggestions;
}

/** Maps a search prefix to the field name used by collectValueSuggestions.
 *  Known prefixes are listed here; any unknown `xxx:` prefix is also accepted
 *  dynamically (forwarded as-is to getSuggestions). */
const KNOWN_PREFIXES: Record<string, string> = {
	"path:": "path",
	"file:": "file",
	"tag:": "tag",
	"category:": "category",
	"id:": "id",
};

/** Resolve a prefix like "status:" to a field name. Known prefixes are mapped
 *  explicitly; any other "xxx:" prefix returns the xxx portion, enabling
 *  frontmatter property value suggestions. */
export function resolvePrefix(prefix: string): string {
	if (prefix in KNOWN_PREFIXES) return KNOWN_PREFIXES[prefix];
	// Accept any "field:" pattern — strip trailing colon to get field name
	if (prefix.endsWith(":") && prefix.length > 1) return prefix.slice(0, -1);
	return "";
}

/**
 * Parse the current input to detect if cursor is inside a `prefix:value` token.
 * Returns { prefix, partial } if found, null otherwise.
 */
export function parseActiveToken(
	value: string,
	cursorPos: number,
): { prefix: string; partial: string; tokenStart: number } | null {
	// Walk backwards from cursor to find the token start
	const before = value.slice(0, cursorPos);
	// Find the last space before cursor (or start of string)
	const lastSpace = before.lastIndexOf(" ");
	const token = before.slice(lastSpace + 1);
	const colonIdx = token.indexOf(":");
	if (colonIdx < 0) return null;
	const prefix = token.slice(0, colonIdx + 1); // e.g. "path:"
	if (!resolvePrefix(prefix)) return null;
	const partial = token.slice(colonIdx + 1); // e.g. "bibl"
	return { prefix, partial, tokenStart: lastSpace + 1 + colonIdx + 1 };
}

export function attachQueryHint(input: HTMLInputElement, getSuggestions: (field: string) => string[]) {
	let hintEl: HTMLElement | null = null;
	let selectedIdx = -1;
	let currentItems: { text: string; onSelect: () => void }[] = [];

	// Create anchor wrapper immediately (not during focus, which would steal focus)
	const anchor = document.createElement("div");
	anchor.className = "gi-suggest-anchor";
	input.parentNode!.insertBefore(anchor, input);
	anchor.appendChild(input);

	const insertText = (text: string) => {
		_insertTextAtCursor(input, text);
	};

	const replaceTokenValue = (tokenStart: number, value: string) => {
		_replaceTokenAtPosition(input, tokenStart, value);
	};

	const updateSelection = (container: HTMLElement) => {
		_updateHintSelection(container, selectedIdx);
	};

	const buildOptionsList = () => {
		currentItems = getQueryOptions().map((opt) => ({
			text: opt.prefix,
			onSelect: () => {
				insertText(opt.prefix.endsWith(":") ? opt.prefix : opt.prefix + " ");
				// After inserting prefix, rebuild to show value suggestions
				rebuildHint();
			},
		}));
	};

	const buildValueList = (prefix: string, partial: string, tokenStart: number) => {
		const field = resolvePrefix(prefix);
		if (!field) return false;
		const allValues = getSuggestions(field);
		const lowerPartial = partial.toLowerCase();
		const filtered = partial ? allValues.filter((v) => v.toLowerCase().includes(lowerPartial)) : allValues;
		if (filtered.length === 0) return false;
		currentItems = filtered.slice(0, 30).map((v) => ({
			text: v,
			onSelect: () => {
				replaceTokenValue(tokenStart, v);
				dismissHint();
			},
		}));
		return true;
	};

	const renderHint = (headerText: string) => {
		if (hintEl) hintEl.remove();
		hintEl = _buildQueryHintContainer(headerText, currentItems, (i) => {
			selectedIdx = i;
			updateSelection(hintEl!);
		});
		selectedIdx = 0;
		updateSelection(hintEl);
		anchor.appendChild(hintEl);
	};

	const rebuildHint = () => {
		const pos = input.selectionStart ?? input.value.length;
		const token = parseActiveToken(input.value, pos);
		if (token && buildValueList(token.prefix, token.partial, token.tokenStart)) {
			renderHint(token.prefix.slice(0, -1) + " " + t("query.candidates"));
		} else {
			buildOptionsList();
			renderHint(t("query.searchOptions"));
		}
	};

	const dismissHint = () => {
		hintEl?.remove();
		hintEl = null;
		selectedIdx = -1;
		currentItems = [];
	};

	_setupQueryHintListeners(input, {
		show: () => rebuildHint(),
		hide: () => {
			if (!hintEl) return;
			setTimeout(() => {
				if (input === document.activeElement) return;
				dismissHint();
			}, 150);
		},
		rebuildHint,
		getHintEl: () => hintEl,
		getItems: () => currentItems,
		getSelectedIdx: () => selectedIdx,
		setSelectedIdx: (i: number) => {
			selectedIdx = i;
		},
		updateSelection: () => {
			if (hintEl) updateSelection(hintEl);
		},
		dismissHint,
	});
}

/** Insert text at cursor position in an input element. */
export function _insertTextAtCursor(input: HTMLInputElement, text: string) {
	const cur = input.value;
	const pos = input.selectionStart ?? cur.length;
	const before = cur.slice(0, pos);
	const after = cur.slice(pos);
	const needSpace = before.length > 0 && !before.endsWith(" ") ? " " : "";
	input.value = before + needSpace + text + after;
	input.focus();
	const newPos = (before + needSpace + text).length;
	input.setSelectionRange(newPos, newPos);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Replace the token at a given position with a new value. */
export function _replaceTokenAtPosition(input: HTMLInputElement, tokenStart: number, value: string) {
	const cur = input.value;
	// Find end of current token (next space or end)
	let end = cur.indexOf(" ", tokenStart);
	if (end < 0) end = cur.length;
	input.value = cur.slice(0, tokenStart) + value + cur.slice(end);
	input.focus();
	const newPos = tokenStart + value.length;
	input.setSelectionRange(newPos, newPos);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Update the is-selected class on hint suggestion items. */
export function _updateHintSelection(container: HTMLElement, selectedIdx: number) {
	const rows = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
	rows.forEach((r, i) => {
		r.classList.toggle("is-selected", i === selectedIdx);
	});
}

/** Build the DOM container for query hint suggestions. */
export function _buildQueryHintContainer(
	headerText: string,
	items: { text: string; onSelect: () => void }[],
	onHover: (index: number) => void,
): HTMLElement {
	const el = document.createElement("div");
	el.className = "suggestion-container mod-search-suggestion";

	// Header
	const headerItem = el.createDiv({ cls: "suggestion-item mod-complex search-suggest-item mod-group" });
	const headerContent = headerItem.createDiv({ cls: "suggestion-content" });
	const headerTitle = headerContent.createDiv({ cls: "suggestion-title list-item-part mod-extended" });
	headerTitle.createEl("span", { text: headerText });
	const headerAux = headerItem.createDiv({ cls: "suggestion-aux" });
	const infoBtn = headerAux.createDiv({ cls: "list-item-part search-suggest-icon clickable-icon" });
	infoBtn.setAttribute("aria-label", t("query.viewDetails"));
	setIcon(infoBtn, "info");

	// Items
	for (let i = 0; i < items.length; i++) {
		const ci = items[i];
		const item = el.createDiv({ cls: "suggestion-item mod-complex search-suggest-item" });
		const content = item.createDiv({ cls: "suggestion-content" });
		const title = content.createDiv({ cls: "suggestion-title" });
		// For options list, show description; for value list, just the value
		const opt = getQueryOptions().find((o) => o.prefix === ci.text);
		if (opt) {
			title.createEl("span", { text: opt.prefix });
			title.createEl("span", { cls: "search-suggest-info-text", text: opt.desc });
		} else {
			title.createEl("span", { text: ci.text });
		}
		item.addEventListener("click", () => ci.onSelect());
		item.addEventListener("mouseenter", () => onHover(i));
	}

	return el;
}

/** Wire up focus/blur/input/keydown listeners for query hint. */
function _setupQueryHintListeners(
	input: HTMLInputElement,
	ctx: {
		show: () => void;
		hide: () => void;
		rebuildHint: () => void;
		getHintEl: () => HTMLElement | null;
		getItems: () => { text: string; onSelect: () => void }[];
		getSelectedIdx: () => number;
		setSelectedIdx: (i: number) => void;
		updateSelection: () => void;
		dismissHint: () => void;
	},
) {
	input.addEventListener("focus", ctx.show);
	input.addEventListener("blur", ctx.hide);
	// Rebuild on input to switch between options/values as user types
	input.addEventListener("input", () => {
		if (input === document.activeElement) ctx.rebuildHint();
	});
	input.addEventListener("keydown", (e: KeyboardEvent) => {
		const hintEl = ctx.getHintEl();
		const items = ctx.getItems();
		if (!hintEl || items.length === 0) return;
		const idx = ctx.getSelectedIdx();
		if (e.key === "ArrowDown") {
			e.preventDefault();
			ctx.setSelectedIdx((idx + 1) % items.length);
			ctx.updateSelection();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			ctx.setSelectedIdx((idx - 1 + items.length) % items.length);
			ctx.updateSelection();
		} else if (e.key === "Enter" && idx >= 0 && idx < items.length) {
			e.preventDefault();
			items[idx].onSelect();
		} else if (e.key === "Escape") {
			ctx.dismissHint();
		}
	});
}

// ---------------------------------------------------------------------------
// Fixed-option hint (lightweight autocomplete for a small set of choices)
// ---------------------------------------------------------------------------
export function attachFixedHint(
	input: HTMLInputElement,
	options: { value: string; label: string }[],
	onSelect: (value: string) => void,
) {
	let hintEl: HTMLElement | null = null;
	let selectedIdx = -1;
	let filteredOpts = options;

	const anchor = document.createElement("div");
	anchor.className = "gi-suggest-anchor";
	input.parentNode!.insertBefore(anchor, input);
	anchor.appendChild(input);

	const updateSelection = (container: HTMLElement) => {
		const rows = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
		rows.forEach((r, idx) => r.classList.toggle("is-selected", idx === selectedIdx));
	};

	const renderHint = () => {
		if (hintEl) hintEl.remove();
		if (filteredOpts.length === 0) {
			hintEl = null;
			return;
		}
		hintEl = document.createElement("div");
		hintEl.className = "suggestion-container mod-search-suggestion";
		for (let i = 0; i < filteredOpts.length; i++) {
			const opt = filteredOpts[i];
			const item = hintEl.createDiv({ cls: "suggestion-item mod-complex search-suggest-item" });
			const content = item.createDiv({ cls: "suggestion-content" });
			const title = content.createDiv({ cls: "suggestion-title" });
			title.createEl("span", { text: opt.label });
			if (opt.value !== opt.label) {
				title.createEl("span", { cls: "search-suggest-info-text", text: opt.value });
			}
			item.addEventListener("click", () => {
				input.value = opt.label;
				onSelect(opt.value);
				dismissHint();
			});
			item.addEventListener("mouseenter", () => {
				selectedIdx = i;
				updateSelection(hintEl!);
			});
		}
		selectedIdx = 0;
		updateSelection(hintEl);
		anchor.appendChild(hintEl);
	};

	const dismissHint = () => {
		hintEl?.remove();
		hintEl = null;
		selectedIdx = -1;
	};

	const rebuild = () => {
		const q = input.value.toLowerCase().trim();
		filteredOpts = q
			? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
			: options;
		renderHint();
	};

	input.addEventListener("focus", rebuild);
	input.addEventListener("blur", () => {
		setTimeout(() => {
			if (input === document.activeElement) return;
			dismissHint();
		}, 150);
	});
	input.addEventListener("input", () => {
		if (input === document.activeElement) rebuild();
	});
	input.addEventListener("keydown", (e: KeyboardEvent) => {
		if (!hintEl || filteredOpts.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedIdx = (selectedIdx + 1) % filteredOpts.length;
			updateSelection(hintEl);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedIdx = (selectedIdx - 1 + filteredOpts.length) % filteredOpts.length;
			updateSelection(hintEl);
		} else if (e.key === "Enter" && selectedIdx >= 0 && selectedIdx < filteredOpts.length) {
			e.preventDefault();
			const opt = filteredOpts[selectedIdx];
			input.value = opt.label;
			onSelect(opt.value);
			dismissHint();
		} else if (e.key === "Escape") {
			dismissHint();
		}
	});
}

// ---------------------------------------------------------------------------
// Search-jump dropdown: shows matching node IDs and jumps to selected node
// ---------------------------------------------------------------------------
export function attachSearchJump(input: HTMLInputElement, cb: PanelCallbacks) {
	let dropdownEl: HTMLElement | null = null;
	let selectedIdx = 0;
	let filteredIds: string[] = [];

	// The input is already inside an ngp-suggest-anchor wrapper (from attachQueryHint).
	// We attach our dropdown to the same anchor so it stacks correctly.
	const getAnchor = (): HTMLElement => input.closest(".ngp-suggest-anchor") ?? input.parentElement!;

	const dismiss = () => {
		dropdownEl?.remove();
		dropdownEl = null;
		filteredIds = [];
		selectedIdx = 0;
	};

	const updateSelection = () => {
		if (!dropdownEl) return;
		const items = dropdownEl.querySelectorAll(".gi-search-result-item");
		items.forEach((el, i) => el.classList.toggle("is-selected", i === selectedIdx));
	};

	const jumpToSelected = () => {
		if (filteredIds.length > 0 && selectedIdx >= 0 && selectedIdx < filteredIds.length) {
			cb.jumpToNode(filteredIds[selectedIdx]);
			dismiss();
		}
	};

	const rebuild = () => {
		const query = input.value.trim().toLowerCase();
		// Don't show the jump dropdown for structured queries (field:value, hop:, etc.)
		if (!query || /^[a-z]+:/i.test(query)) {
			dismiss();
			return;
		}

		const allIds = cb.getNodeIds();
		filteredIds = allIds.filter((id) => id.toLowerCase().includes(query)).slice(0, 10);

		if (filteredIds.length === 0) {
			dismiss();
			return;
		}

		dropdownEl = _rebuildSearchDropdown(dropdownEl, getAnchor(), filteredIds, cb, dismiss, (i) => {
			selectedIdx = i;
			updateSelection();
		});
		selectedIdx = 0;
		updateSelection();
	};

	_setupSearchJumpListeners(input, {
		rebuild,
		dismiss,
		getAnchor,
		getDropdownEl: () => dropdownEl,
		getFilteredIds: () => filteredIds,
		getSelectedIdx: () => selectedIdx,
		setSelectedIdx: (i: number) => {
			selectedIdx = i;
		},
		updateSelection,
		jumpToSelected,
	});
}

/** Build or rebuild the search jump dropdown DOM. Returns the dropdown element. */
function _rebuildSearchDropdown(
	existing: HTMLElement | null,
	anchor: HTMLElement,
	ids: string[],
	cb: PanelCallbacks,
	dismiss: () => void,
	onHover: (index: number) => void,
): HTMLElement {
	const dropdownEl =
		existing ??
		(() => {
			const el = document.createElement("div");
			el.className = "gi-search-results";
			anchor.appendChild(el);
			return el;
		})();

	// Clear and rebuild items
	dropdownEl.empty();

	// Hint header
	const hint = dropdownEl.createDiv({ cls: "gi-search-result-hint" });
	hint.textContent = t("search.jumpHint");

	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];
		const item = dropdownEl.createDiv({ cls: "gi-search-result-item" });
		item.textContent = id;
		item.addEventListener("click", () => {
			cb.jumpToNode(id);
			dismiss();
		});
		item.addEventListener("mouseenter", () => onHover(i));
	}

	return dropdownEl;
}

/** Wire up input/keydown/blur listeners for search jump. */
function _setupSearchJumpListeners(
	input: HTMLInputElement,
	ctx: {
		rebuild: () => void;
		dismiss: () => void;
		getAnchor: () => HTMLElement;
		getDropdownEl: () => HTMLElement | null;
		getFilteredIds: () => string[];
		getSelectedIdx: () => number;
		setSelectedIdx: (i: number) => void;
		updateSelection: () => void;
		jumpToSelected: () => void;
	},
) {
	input.addEventListener("input", () => {
		// Defer slightly so attachQueryHint processes first
		setTimeout(ctx.rebuild, 50);
	});

	input.addEventListener("keydown", (e: KeyboardEvent) => {
		const dropdownEl = ctx.getDropdownEl();
		const ids = ctx.getFilteredIds();
		if (!dropdownEl || ids.length === 0) return;
		if (e.key === "Enter") {
			// Only handle Enter for jump when the query hint dropdown is NOT visible.
			const anchor = ctx.getAnchor();
			const queryHint = anchor.querySelector(".suggestion-container.mod-search-suggestion");
			if (queryHint) return; // let attachQueryHint handle it
			e.preventDefault();
			ctx.jumpToSelected();
		} else if (e.key === "Escape") {
			ctx.dismiss();
		} else if (e.key === "ArrowDown") {
			if (!ctx.getAnchor().querySelector(".suggestion-container.mod-search-suggestion")) {
				e.preventDefault();
				const idx = ctx.getSelectedIdx();
				ctx.setSelectedIdx((idx + 1) % ids.length);
				ctx.updateSelection();
			}
		} else if (e.key === "ArrowUp") {
			if (!ctx.getAnchor().querySelector(".suggestion-container.mod-search-suggestion")) {
				e.preventDefault();
				const idx = ctx.getSelectedIdx();
				ctx.setSelectedIdx((idx - 1 + ids.length) % ids.length);
				ctx.updateSelection();
			}
		}
	});

	input.addEventListener("blur", () => {
		setTimeout(ctx.dismiss, 200);
	});
}

export function addSelect<T extends string = string>(
	container: HTMLElement,
	label: string,
	options: { value: T; label: string }[],
	initial: T,
	onChange: (v: T) => void,
	description?: string,
) {
	const row = container.createDiv({ cls: "setting-item" });
	const info = row.createDiv({ cls: "setting-item-info" });
	const nameEl = info.createDiv({ cls: "setting-item-name", text: label });
	nameEl.title = description || label;
	const control = row.createDiv({ cls: "setting-item-control" });
	const sel = control.createEl("select", { cls: "dropdown", attr: { "aria-label": label } });
	for (const opt of options) {
		const el = sel.createEl("option", { text: opt.label, value: opt.value });
		if (opt.value === initial) el.selected = true;
	}
	sel.addEventListener("change", () => onChange(sel.value as T));
}

export function renderGroupList(container: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks) {
	container.empty();
	panel.groups.forEach((g, i) => {
		const row = container.createDiv({ cls: "gi-group-rule-row" });

		// Color dot (click to cycle)
		const colorDot = row.createDiv({ cls: "gi-group-color gi-color-dot" });
		colorDot.style.background = g.color;
		colorDot.addEventListener("click", () => {
			const next =
				DEFAULT_COLORS[
					(DEFAULT_COLORS.indexOf(g.color as (typeof DEFAULT_COLORS)[number]) + 1) % DEFAULT_COLORS.length
				];
			g.color = next;
			colorDot.style.background = next;
			cb.recolorNodes();
		});

		// Search-bar style input (same as top search)
		const input = row.createEl("input", {
			cls: "gi-search gi-group-search",
			type: "text",
			placeholder: t("search.placeholder"),
			attr: { "aria-label": t("search.placeholder") },
		});
		input.value = g.expression ? serializeExpr(g.expression) : "";
		input.addEventListener("input", () => {
			g.expression = parseQueryExpr(input.value);
			cb.recolorNodes();
		});
		attachQueryHint(input, (field) => cb.collectValueSuggestions(field));

		// Remove button
		const rm = row.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "×" });
		rm.addEventListener("click", () => {
			panel.groups.splice(i, 1);
			renderGroupList(container, panel, ctx, cb);
			cb.recolorNodes();
		});
	});
}

export function getSortKeyOptions(): { value: SortKey; label: string }[] {
	return [
		{ value: "degree", label: t("sort.degree") },
		{ value: "in-degree", label: t("sort.inDegree") },
		{ value: "tag", label: t("sort.tag") },
		{ value: "category", label: t("sort.category") },
		{ value: "label", label: t("sort.label") },
		{ value: "importance", label: t("sort.importance") },
	];
}

export function renderSortRuleList(container: HTMLElement, panel: PanelState, cb: PanelCallbacks) {
	container.empty();
	const rules = panel.sortRules;
	rules.forEach((rule, i) => {
		const row = container.createDiv({ cls: "gi-group-item" });

		// Sort key dropdown
		const keySel = row.createEl("select", { cls: "dropdown" });
		keySel.addClass("gi-flex-fill");
		for (const opt of getSortKeyOptions()) {
			const el = keySel.createEl("option", { text: opt.label, value: opt.value });
			if (opt.value === rule.key) el.selected = true;
		}
		keySel.addEventListener("change", () => {
			rule.key = keySel.value as SortKey;
			cb.applyClusterForce();
			cb.doRenderKeepPanel();
		});

		// Order toggle button
		const orderBtn = row.createEl("button", {
			cls: "gi-direction-btn",
			text: rule.order === "asc" ? t("sort.asc") : t("sort.desc"),
		});
		orderBtn.addClass("gi-order-btn");
		orderBtn.addEventListener("click", () => {
			rule.order = rule.order === "asc" ? "desc" : "asc";
			orderBtn.textContent = rule.order === "asc" ? t("sort.asc") : t("sort.desc");
			cb.applyClusterForce();
			cb.doRenderKeepPanel();
		});

		// Remove button
		const rm = row.createEl("span", { cls: "gi-group-remove gi-ml-4", text: "\u00D7" });
		rm.addEventListener("click", () => {
			rules.splice(i, 1);
			renderSortRuleList(container, panel, cb);
			cb.applyClusterForce();
			cb.doRenderKeepPanel();
		});
	});
}

// ---------------------------------------------------------------------------
// Cluster group rule list
// ---------------------------------------------------------------------------

export function renderClusterRuleList(
	container: HTMLElement,
	panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
) {
	container.empty();
	const rules = panel.clusterGroupRules;
	const groupByOpts = getGroupByOptions(ctx);
	rules.forEach((rule, i) => {
		const row = container.createDiv({ cls: "gi-expr-row" });

		// Field input with field:? suggestions (same UI as グルーピング)
		const input = row.createEl("input", {
			cls: "gi-expr-field",
			type: "text",
			placeholder: "tag:?, category:?, folder:?...",
		});
		input.value = rule.groupBy;
		attachFixedHint(input, groupByOpts, (val) => {
			rule.groupBy = val;
			cb.applyClusterForce();
			cb.restartSimulation(0.5);
		});
		input.addEventListener("change", () => {
			rule.groupBy = input.value.trim();
			cb.applyClusterForce();
			cb.restartSimulation(0.5);
		});

		// Recursive toggle (compact checkbox + label)
		const recWrap = row.createEl("label");
		recWrap.addClass("gi-rec-wrap");
		const recToggle = recWrap.createDiv({
			cls: "checkbox-container" + (rule.recursive ? " is-enabled" : ""),
		});
		recWrap.createEl("span", { text: t("clusterGroup.recursive"), cls: "gi-hint" });
		recToggle.addEventListener("click", () => {
			rule.recursive = !rule.recursive;
			recToggle.toggleClass("is-enabled", rule.recursive);
			cb.applyClusterForce();
			cb.restartSimulation(0.5);
		});

		// Remove button
		const rm = row.createEl("span", { cls: "gi-group-remove", text: "\u00D7" });
		rm.addEventListener("click", () => {
			rules.splice(i, 1);
			renderClusterRuleList(container, panel, ctx, cb);
			cb.applyClusterForce();
			cb.restartSimulation(0.5);
		});
	});
}

// ---------------------------------------------------------------------------
// Directional gravity rule list
// ---------------------------------------------------------------------------

export function renderDirectionalGravityList(
	container: HTMLElement,
	panel: PanelState,
	ctx: PanelContext,
	cb: PanelCallbacks,
) {
	container.empty();
	const rules = panel.directionalGravityRules;
	const dirOptions: { value: string; label: string }[] = [
		{ value: "top", label: t("gravDir.top") },
		{ value: "bottom", label: t("gravDir.bottom") },
		{ value: "left", label: t("gravDir.left") },
		{ value: "right", label: t("gravDir.right") },
		{ value: "custom", label: t("gravDir.custom") },
	];
	rules.forEach((rule, i) => {
		const row = container.createDiv({ cls: "gi-group-rule-row gi-gravity-row" });

		// Filter search-bar input (with query hint)
		const filterInput = row.createEl("input", {
			cls: "gi-search",
			type: "text",
			placeholder: "tag:character, category:*, *",
			attr: { "aria-label": "Gravity rule filter" },
		});
		filterInput.value = rule.filter;
		filterInput.addEventListener("input", () => {
			rule.filter = filterInput.value;
			cb.applyDirectionalGravityForce();
			cb.restartSimulation(0.3);
		});
		attachQueryHint(filterInput, (field) => cb.collectValueSuggestions(field));

		// Direction search-bar input (with fixed-option hint)
		const isCustom = typeof rule.direction === "number";
		const dirInput = row.createEl("input", {
			cls: "gi-search gi-dir-input",
			type: "text",
			placeholder: t("gravDir.top"),
			attr: { "aria-label": "Gravity direction" },
		});
		if (isCustom) {
			dirInput.value = t("gravDir.custom");
		} else {
			const curDir = dirOptions.find((o) => o.value === rule.direction);
			dirInput.value = curDir ? curDir.label : String(rule.direction);
		}

		// Custom radian input (shown only in custom mode)
		const radInput = row.createEl("input", {
			cls: "gi-search gi-rad-input",
			type: "number",
			attr: { "aria-label": "Gravity custom angle (radians)" },
		});
		radInput.step = "0.1";
		radInput.placeholder = "rad";
		radInput.value = isCustom ? String(rule.direction) : "0";
		radInput.style.display = isCustom ? "" : "none";

		attachFixedHint(dirInput, dirOptions, (val) => {
			if (val === "custom") {
				rule.direction = parseFloat(radInput.value) || 0;
				radInput.style.display = "";
			} else {
				rule.direction = val as "top" | "bottom" | "left" | "right";
				radInput.style.display = "none";
			}
			cb.applyDirectionalGravityForce();
			cb.restartSimulation(0.3);
		});

		radInput.addEventListener("input", () => {
			rule.direction = parseFloat(radInput.value) || 0;
			cb.applyDirectionalGravityForce();
			cb.restartSimulation(0.3);
		});

		// Strength slider
		const strSlider = row.createEl("input", { type: "range" });
		strSlider.min = "0.01";
		strSlider.max = "1";
		strSlider.step = "0.01";
		strSlider.value = String(rule.strength);
		strSlider.addClass("gi-str-slider");
		updateSliderProgress(strSlider);
		strSlider.addEventListener("input", () => {
			rule.strength = parseFloat(strSlider.value);
			updateSliderProgress(strSlider);
			cb.applyDirectionalGravityForce();
			cb.restartSimulation(0.3);
		});

		// Remove button
		const rm = row.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00D7" });
		rm.addEventListener("click", () => {
			rules.splice(i, 1);
			renderDirectionalGravityList(container, panel, ctx, cb);
			cb.applyDirectionalGravityForce();
			cb.restartSimulation(0.3);
		});
	});
}

// ---------------------------------------------------------------------------
// Node Rule list (unified spacing + gravity per query)
// ---------------------------------------------------------------------------

/** Direction presets for gravity dropdown. Angle in degrees. */
export function getGravityDirOptions(): { value: string; label: string; angle: number }[] {
	return [
		{ value: "none", label: t("gravDir.none"), angle: -1 },
		{ value: "up", label: t("gravDir.up"), angle: 270 },
		{ value: "down", label: t("gravDir.down"), angle: 90 },
		{ value: "left", label: t("gravDir.left"), angle: 180 },
		{ value: "right", label: t("gravDir.right"), angle: 0 },
		{ value: "custom", label: t("gravDir.custom"), angle: -1 },
	];
}

export function angleToPreset(angle: number): string {
	if (angle < 0) return "none";
	if (angle === 270) return "up";
	if (angle === 90) return "down";
	if (angle === 180) return "left";
	if (angle === 0) return "right";
	return "custom";
}

function _buildRuleColorControl(row2: HTMLElement, rule: NodeRule, cb: PanelCallbacks) {
	const colorRow = row2.createDiv({ cls: "setting-item" });
	colorRow.addClass("gi-spacing-row");
	const colorInfo = colorRow.createDiv({ cls: "setting-item-info" });
	colorInfo.createDiv({ cls: "setting-item-name", text: t("nodeRules.color") });
	const colorControl = colorRow.createDiv({ cls: "setting-item-control" });
	const colorPicker = colorControl.createEl("input", {
		type: "color",
		attr: { "aria-label": t("nodeRules.color") },
	});
	colorPicker.value = rule.color || "#ffffff";
	colorPicker.addClass("gi-color-picker");
	const colorClear = colorControl.createEl("button", {
		cls: "gi-color-clear",
		text: "\u00D7",
		attr: { "aria-label": "Clear color" },
	});
	colorClear.style.display = rule.color ? "" : "none";
	const colorEnabled = colorControl.createEl("input", {
		type: "checkbox",
		attr: { "aria-label": "Enable color override" },
	});
	colorEnabled.checked = !!rule.color;
	colorEnabled.addClass("gi-color-enable");
	colorPicker.style.opacity = rule.color ? "1" : "0.4";
	colorPicker.addEventListener("input", () => {
		rule.color = colorPicker.value;
		colorPicker.style.opacity = "1";
		colorEnabled.checked = true;
		colorClear.style.display = "";
		cb.doRenderKeepPanel();
	});
	colorClear.addEventListener("click", () => {
		rule.color = undefined;
		colorPicker.style.opacity = "0.4";
		colorEnabled.checked = false;
		colorClear.style.display = "none";
		cb.doRenderKeepPanel();
	});
	colorEnabled.addEventListener("change", () => {
		if (colorEnabled.checked) {
			rule.color = colorPicker.value;
			colorPicker.style.opacity = "1";
			colorClear.style.display = "";
		} else {
			rule.color = undefined;
			colorPicker.style.opacity = "0.4";
			colorClear.style.display = "none";
		}
		cb.doRenderKeepPanel();
	});
}

function _buildRuleGravityControl(row2: HTMLElement, rule: NodeRule, cb: PanelCallbacks) {
	const gravRow = row2.createDiv({ cls: "gi-group-item" });
	gravRow.addClass("gi-gravity-row");

	const gravLabel = gravRow.createEl("span", { cls: "setting-item-name", text: t("nodeRules.gravity") });
	gravLabel.addClass("gi-gravity-label");

	const dirSelect = gravRow.createEl("select", {
		cls: "dropdown",
		attr: { "aria-label": t("nodeRules.gravity") },
	});
	dirSelect.addClass("gi-gravity-dir-select");
	const currentPreset = angleToPreset(rule.gravityAngle);
	for (const opt of getGravityDirOptions()) {
		const el = dirSelect.createEl("option", { text: opt.label, value: opt.value });
		if (opt.value === currentPreset) el.selected = true;
	}

	const angleInput = gravRow.createEl("input", {
		cls: "gi-search",
		type: "number",
		attr: { "aria-label": "Gravity custom angle (degrees)" },
	});
	angleInput.addClass("gi-angle-input");
	angleInput.step = "1";
	angleInput.min = "0";
	angleInput.max = "360";
	angleInput.placeholder = "°";
	angleInput.value = currentPreset === "custom" ? String(rule.gravityAngle) : "0";
	angleInput.style.display = currentPreset === "custom" ? "" : "none";

	const strSlider = gravRow.createEl("input", { type: "range", attr: { "aria-label": "Gravity strength" } });
	strSlider.min = "0.01";
	strSlider.max = "1";
	strSlider.step = "0.01";
	strSlider.value = String(rule.gravityStrength);
	strSlider.addClass("gi-str-slider");
	updateSliderProgress(strSlider);
	strSlider.style.display = currentPreset === "none" ? "none" : "";

	dirSelect.addEventListener("change", () => {
		const val = dirSelect.value;
		if (val === "none") {
			rule.gravityAngle = -1;
			angleInput.style.display = "none";
			strSlider.style.display = "none";
		} else if (val === "custom") {
			rule.gravityAngle = parseFloat(angleInput.value) || 0;
			angleInput.style.display = "";
			strSlider.style.display = "";
		} else {
			const preset = getGravityDirOptions().find((o) => o.value === val);
			rule.gravityAngle = preset?.angle ?? -1;
			angleInput.style.display = "none";
			strSlider.style.display = "";
		}
		cb.applyNodeRules();
		cb.restartSimulation(0.3);
	});

	angleInput.addEventListener("input", () => {
		rule.gravityAngle = parseFloat(angleInput.value) || 0;
		cb.applyNodeRules();
		cb.restartSimulation(0.3);
	});

	strSlider.addEventListener("input", () => {
		rule.gravityStrength = parseFloat(strSlider.value);
		updateSliderProgress(strSlider);
		cb.applyNodeRules();
		cb.restartSimulation(0.3);
	});
}

function _buildRuleForceSliders(row2: HTMLElement, rule: NodeRule, cb: PanelCallbacks) {
	// Center gravity slider
	const cgRow = row2.createDiv({ cls: "setting-item mod-slider" });
	cgRow.addClass("gi-spacing-row");
	const cgInfo = cgRow.createDiv({ cls: "setting-item-info" });
	cgInfo.createDiv({ cls: "setting-item-name", text: t("gravity.centerGravity") });
	const cgControl = cgRow.createDiv({ cls: "setting-item-control" });
	const cgSlider = cgControl.createEl("input", { type: "range" });
	cgSlider.min = "0";
	cgSlider.max = "2";
	cgSlider.step = "0.1";
	cgSlider.value = String(rule.centerGravity ?? 1.0);
	updateSliderProgress(cgSlider);
	const cgLabel = cgControl.createEl("span", { text: String(rule.centerGravity ?? 1.0) });
	cgLabel.addClass("gi-slider-label");
	cgSlider.addEventListener("input", () => {
		rule.centerGravity = parseFloat(cgSlider.value);
		cgLabel.textContent = cgSlider.value;
		updateSliderProgress(cgSlider);
		cb.applyNodeRules();
		cb.restartSimulation(0.3);
	});

	// Repel multiplier slider
	const rmRow = row2.createDiv({ cls: "setting-item mod-slider" });
	rmRow.addClass("gi-spacing-row");
	const rmInfo = rmRow.createDiv({ cls: "setting-item-info" });
	rmInfo.createDiv({ cls: "setting-item-name", text: t("gravity.repelMultiplier") });
	const rmControl = rmRow.createDiv({ cls: "setting-item-control" });
	const rmSlider = rmControl.createEl("input", { type: "range" });
	rmSlider.min = "0";
	rmSlider.max = "3";
	rmSlider.step = "0.1";
	rmSlider.value = String(rule.repelMultiplier ?? 1.0);
	updateSliderProgress(rmSlider);
	const rmLabel = rmControl.createEl("span", { text: String(rule.repelMultiplier ?? 1.0) });
	rmLabel.addClass("gi-slider-label");
	rmSlider.addEventListener("input", () => {
		rule.repelMultiplier = parseFloat(rmSlider.value);
		rmLabel.textContent = rmSlider.value;
		updateSliderProgress(rmSlider);
		cb.applyNodeRules();
		cb.restartSimulation(0.3);
	});
}

export function renderNodeRuleList(container: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks) {
	container.empty();
	const rules = panel.nodeRules;
	rules.forEach((rule, i) => {
		const wrapper = container.createDiv({ cls: "gi-noderule-item" });

		// Row 1: Query input + delete button
		const row1 = wrapper.createDiv({ cls: "gi-group-item" });
		row1.addClass("gi-noderule-row");

		const queryInput = row1.createEl("input", {
			cls: "gi-search",
			type: "text",
			placeholder: "tag:character, *, degree>5",
			attr: { "aria-label": "Node rule query" },
		});
		queryInput.addClass("gi-query-input");
		queryInput.value = rule.query;
		queryInput.addEventListener("input", () => {
			rule.query = queryInput.value;
			cb.applyNodeRules();
			cb.restartSimulation(0.3);
		});
		attachQueryHint(queryInput, (field) => cb.collectValueSuggestions(field));

		const rm = row1.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00D7" });
		rm.addEventListener("click", () => {
			rules.splice(i, 1);
			renderNodeRuleList(container, panel, ctx, cb);
			cb.applyNodeRules();
			cb.restartSimulation(0.3);
		});

		// Row 2: spacing slider + gravity controls (indented)
		const row2 = wrapper.createDiv();
		row2.addClass("gi-noderule-detail");

		// Spacing slider
		const spacingRow = row2.createDiv({ cls: "setting-item mod-slider" });
		spacingRow.addClass("gi-spacing-row");
		const spacingInfo = spacingRow.createDiv({ cls: "setting-item-info" });
		spacingInfo.createDiv({ cls: "setting-item-name", text: t("nodeRules.spacing") });
		const spacingControl = spacingRow.createDiv({ cls: "setting-item-control" });
		const spacingSlider = spacingControl.createEl("input", {
			type: "range",
			attr: { "aria-label": t("nodeRules.spacing") },
		});
		spacingSlider.min = "0.1";
		spacingSlider.max = "5.0";
		spacingSlider.step = "0.1";
		spacingSlider.value = String(rule.spacingMultiplier);
		updateSliderProgress(spacingSlider);
		const spacingLabel = spacingControl.createEl("span", { text: String(rule.spacingMultiplier) });
		spacingLabel.addClass("gi-slider-label");
		spacingSlider.addEventListener("input", () => {
			rule.spacingMultiplier = parseFloat(spacingSlider.value);
			spacingLabel.textContent = spacingSlider.value;
			updateSliderProgress(spacingSlider);
			cb.applyNodeRules();
			cb.restartSimulation(0.3);
		});

		_buildRuleColorControl(row2, rule, cb);
		_buildRuleGravityControl(row2, rule, cb);
		_buildRuleForceSliders(row2, rule, cb);
	});
}
