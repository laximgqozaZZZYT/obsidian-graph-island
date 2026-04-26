/**
 * panel-sections-filter-card-helpers.ts
 *
 * Sub-block builders extracted from `_buildCardSubSettings` in
 * `panel-sections-filter.ts` to keep the parent function under the
 * 120-line decomposition target.  Each helper builds one cohesive
 * sub-section of the Card display sub-settings panel and is a pure
 * code move (no behavior change, no new i18n / settings keys).
 */
import { mergeRenderThresholds } from "../types";
import { t } from "../i18n";
import { addSlider, addToggle, addSelect, addTextInput } from "./panel-widgets";
import type { PanelState, PanelCallbacks } from "./PanelBuilder";
import { ensureRT } from "./PanelBuilder";

// FO: Card display preset selector — applies field defaults on preset switch.
export function addCardPresetSelector(body: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	addSelect(
		body,
		t("display.cardPreset") ?? "Card Preset",
		[
			{ value: "custom", label: t("display.cardPresetCustom") ?? "Custom" },
			{ value: "compact", label: t("display.cardPresetCompact") ?? "Compact" },
			{ value: "detailed", label: t("display.cardPresetDetailed") ?? "Detailed" },
			{ value: "full", label: t("display.cardPresetFull") ?? "Full" },
		],
		panel.cardDisplayConfig.preset ?? "custom",
		(v) => {
			panel.cardDisplayConfig.preset = v as "custom" | "compact" | "detailed" | "full";
			if (v === "compact") {
				panel.cardDisplayConfig = {
					...panel.cardDisplayConfig,
					preset: "compact",
					fields: [],
					maxWidth: 80,
					showIcon: false,
					headerStyle: "plain",
				};
			} else if (v === "detailed") {
				panel.cardDisplayConfig = {
					...panel.cardDisplayConfig,
					preset: "detailed",
					fields: ["category"],
					maxWidth: 150,
					showIcon: true,
					headerStyle: "table",
				};
			} else if (v === "full") {
				panel.cardDisplayConfig = {
					...panel.cardDisplayConfig,
					preset: "full",
					fields: ["category", "node_type", "tags"],
					maxWidth: 200,
					showIcon: true,
					headerStyle: "table",
				};
			}
			cb.doRenderKeepPanel();
			cb.rebuildPanel();
		},
	);
}

// Card display options: fields / maxWidth / showIcon / headerStyle / fieldFormat.
export function addCardDisplayOptions(body: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	addTextInput(
		body,
		t("display.cardFields"),
		panel.cardDisplayConfig.fields.join(", "),
		"e.g. category, tags, node_type",
		(v) => {
			panel.cardDisplayConfig.fields = v
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			cb.doRenderKeepPanel();
		},
	);
	addSlider(body, t("display.cardMaxWidth"), 60, 300, 10, panel.cardDisplayConfig.maxWidth ?? 120, (v) => {
		panel.cardDisplayConfig.maxWidth = v;
		cb.doRenderKeepPanel();
	});
	addToggle(body, t("display.cardShowIcon"), panel.cardDisplayConfig.showIcon ?? false, (v) => {
		panel.cardDisplayConfig.showIcon = v;
		cb.doRenderKeepPanel();
	});
	addSelect(
		body,
		t("display.cardHeaderStyle"),
		[
			{ value: "plain", label: t("display.cardStylePlain") },
			{ value: "table", label: t("display.cardStyleTable") },
		],
		panel.cardDisplayConfig.headerStyle ?? "plain",
		(v) => {
			panel.cardDisplayConfig.headerStyle = v as "plain" | "table";
			cb.doRenderKeepPanel();
		},
	);
	addSelect(
		body,
		t("display.cardFieldFormat") ?? "Field Format",
		[
			{ value: "key-value", label: "Key: Value" },
			{ value: "value-only", label: "Value Only" },
		],
		panel.cardDisplayConfig.fieldFormat ?? "key-value",
		(v) => {
			panel.cardDisplayConfig.fieldFormat = v as "key-value" | "value-only";
			cb.doRenderKeepPanel();
		},
	);
}

// Card body controls: bodyMaxLines / contentScale / bgOpacity / bodyFontSize.
export function addCardBodyControls(body: HTMLElement, panel: PanelState, cb: PanelCallbacks): void {
	const rtCard = mergeRenderThresholds(panel.renderThresholds);
	// FT: Card body max lines
	addSlider(body, t("display.cardBodyLines") ?? "Body Lines", 0, 10, 1, rtCard.cardBodyMaxLines, (v) => {
		ensureRT(panel).cardBodyMaxLines = v;
		cb.recalcNodeRadii();
		cb.doRenderKeepPanel();
	});
	// HM: Card content scale — log-based size boost from body length
	addSlider(
		body,
		t("display.cardContentScale") ?? "Card Size by Content",
		0,
		2.0,
		0.1,
		rtCard.cardContentScale,
		(v) => {
			ensureRT(panel).cardContentScale = v;
			cb.recalcNodeRadii();
			cb.markDirty();
			cb.announceA11y?.(`${t("display.cardContentScale") ?? "Card Size by Content"}: ${(v * 100).toFixed(0)}%`);
		},
		t("desc.cardContentScale"),
	);
	// GE: Card background opacity
	const crcGE = panel.cardRenderConfig ?? {};
	addSlider(
		body,
		t("display.cardBgOpacity") ?? "Card Opacity",
		0.1,
		1.0,
		0.05,
		crcGE.plainCardFillAlpha ?? 0.8,
		(v) => {
			if (!panel.cardRenderConfig) panel.cardRenderConfig = {};
			panel.cardRenderConfig.plainCardFillAlpha = v;
			cb.doRenderKeepPanel();
		},
	);
	// FX: Card body font size
	addSlider(body, t("display.cardBodyFontSize") ?? "Body Font Size", 4, 16, 1, rtCard.cardBodyFontSize, (v) => {
		ensureRT(panel).cardBodyFontSize = v;
		cb.recalcNodeRadii();
		cb.doRenderKeepPanel();
	});
}
