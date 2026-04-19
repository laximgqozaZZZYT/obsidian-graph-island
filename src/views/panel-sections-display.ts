/**
 * panel-sections-display.ts
 *
 * Extracted display-tab section builders from PanelBuilder.ts to reduce
 * god-object size. Each function builds one collapsible section inside
 * the Display panel tab, delegating the actual control construction to
 * the helpers in `panel-sections-edge-display.ts` and
 * `panel-sections-node-display.ts`.
 */
import { t, tHelp } from "../i18n";
import type { PanelState, PanelCallbacks, PanelContext } from "./PanelBuilder";
import { buildSection, addAdvancedGroup } from "./PanelBuilder";
import {
	buildEdgeStyleControls,
	buildEdgeLabelControls,
	buildEdgeColorControls,
	buildEdgeVisibilityControls,
} from "./panel-sections-edge-display";
import {
	buildNodeSizeControls,
	buildNodeLabelControls,
	buildNodeShapeControls,
	buildNodeThumbnailControls,
} from "./panel-sections-node-display";

// ---------------------------------------------------------------------------
// Edge Display section builder — orchestrates extracted helpers
// ---------------------------------------------------------------------------
export function buildEdgeDisplaySection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.displayEdges"),
		(body) => {
			buildEdgeStyleControls(body, panel, cb);
			buildEdgeLabelControls(body, panel, cb);
			addAdvancedGroup(body, (adv) => {
				buildEdgeColorControls(adv, panel, cb);
				buildEdgeVisibilityControls(adv, panel, cb, _ctx.edgeTypeCounts ?? {});
			});
		},
		tHelp("help.displayEdges"),
		false,
		"git-branch",
	);
}

// ---------------------------------------------------------------------------
// Node Display section builder — orchestrates extracted helpers
// ---------------------------------------------------------------------------
export function buildNodeDisplaySection(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	buildSection(
		tabEl,
		t("section.displayNodes"),
		(body) => {
			buildNodeSizeControls(body, panel, cb);
			buildNodeLabelControls(body, panel, cb);
			addAdvancedGroup(body, (adv) => {
				buildNodeThumbnailControls(adv, panel, cb);
				buildNodeShapeControls(adv, panel, cb);
			});
		},
		tHelp("help.displayNodes"),
		false,
		"circle-dot",
	);
}
