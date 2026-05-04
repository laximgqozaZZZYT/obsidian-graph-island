import { t } from "../i18n";

export interface HelpOverlayOptions {
	parent: HTMLElement;
	announce: (msg: string) => void;
	onClose: () => void;
}

interface HelpSection {
	title: string;
	items: [string, string][];
}

function buildSections(): HelpSection[] {
	return [
		{
			title: t("help.sectionNavigation"),
			items: [
				["Tab / Shift+Tab", t("help.nav.tabCycle")],
				["←↑→↓", t("help.nav.arrowKeys")],
				["+/= / −", t("help.nav.zoomInOut")],
				["0–9", t("help.nav.zoomDigits")],
				["Z", t("help.nav.focusZoom")],
				["Space / F", t("help.nav.fitView")],
				["Scroll", t("help.nav.scroll")],
			],
		},
		{
			title: t("help.sectionSelection"),
			items: [
				["Click / Hover", t("help.sel.clickHover")],
				["Shift+Click / Shift+Enter", t("help.sel.shiftClick")],
				["Ctrl+A", t("help.sel.ctrlA")],
				["Ctrl+D", t("help.sel.ctrlD")],
				["Ctrl+E", t("help.sel.ctrlE")],
				["Ctrl+Click / Ctrl+Enter", t("help.sel.ctrlClick")],
				["S (focused)", t("help.sel.pathStart")],
				["E (focused)", t("help.sel.pathEnd")],
				["Enter", t("help.sel.enter")],
				["Double-click", t("help.sel.dblClick")],
			],
		},
		{
			title: t("help.sectionDisplay"),
			items: [
				["P", t("help.disp.panel")],
				["L", t("help.disp.legend")],
				["M", t("help.disp.minimap")],
				["G", t("help.disp.grid")],
				["[ / ]", t("help.disp.hops")],
				["1–4", t("help.disp.tabSwitch")],
			],
		},
		{
			title: t("help.sectionActions"),
			items: [
				["Ctrl+F", t("help.act.search")],
				["Ctrl+Shift+C", t("help.act.copyPng")],
				["Right-click", t("help.act.contextMenu")],
				["Drag node", t("help.act.dragNode")],
				["Drag canvas", t("help.act.dragCanvas")],
				["Escape", t("help.act.escape")],
				["?", t("help.act.helpToggle")],
			],
		},
	];
}

function renderSectionTable(parent: HTMLElement, section: HelpSection): void {
	parent.createEl("h4", { text: section.title, cls: "gi-help-section-title" });
	const table = parent.createEl("table", {
		cls: "gi-help-table",
		attr: { role: "table", "aria-label": `${section.title} shortcuts` },
	});
	for (const [key, desc] of section.items) {
		const tr = table.createEl("tr");
		tr.createEl("td", { cls: "gi-help-key", text: key, attr: { "aria-label": `Key: ${key}` } });
		tr.createEl("td", { text: desc });
	}
}

function renderModes(parent: HTMLElement): void {
	parent.createEl("h3", { text: t("help.sectionModes"), cls: "gi-help-section" });
	const modes: [string, string][] = [
		[t("mode.explore"), t("help.mode.explore")],
		[t("mode.analyze"), t("help.mode.analyze")],
		[t("mode.write"), t("help.mode.write")],
	];
	for (const [name, desc] of modes) {
		const row = parent.createDiv({ cls: "gi-help-mode" });
		row.createEl("strong", { text: name });
		row.createEl("span", { text: ` — ${desc}` });
	}
}

/**
 * Build and attach the full-screen help overlay (keyboard shortcuts + thinking modes).
 * Caller owns the returned element and is responsible for tracking it; the overlay
 * removes itself from the DOM when clicked, and invokes `onClose` so the caller
 * can clear its own reference.
 */
export function renderHelpOverlay(options: HelpOverlayOptions): HTMLElement {
	const { parent, announce, onClose } = options;
	const overlay = parent.createDiv({
		cls: "gi-help-overlay",
		attr: { role: "dialog", "aria-label": "Keyboard shortcuts", "aria-modal": "true" },
	});

	overlay.createEl("h3", { text: t("help.title") });

	for (const section of buildSections()) {
		renderSectionTable(overlay, section);
	}

	renderModes(overlay);

	overlay.addEventListener("click", () => {
		overlay.remove();
		onClose();
		announce("Help closed");
	});

	announce("Keyboard shortcuts help opened. Press Escape or click to close.");

	return overlay;
}
