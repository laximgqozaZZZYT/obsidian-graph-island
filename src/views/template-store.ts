import type { GraphTemplate } from "../types";
import type { PanelState } from "./PanelBuilder";

/** テンプレートから除外する一時的なフィールド（保存時/復元時に共通で skip） */
export const TEMPLATE_TRANSIENT_KEYS: ReadonlySet<string> = new Set([
	"searchQuery",
	"localGraphCenter",
	"focusNodeId",
	"annotations",
	"searchHistory",
	"syncViewId",
	"bookmarkedNodes",
]);

/** テンプレート保存数の上限 */
export const MAX_TEMPLATES = 20;

/**
 * 現在のパネル状態から GraphTemplate を構築する。
 * - TEMPLATE_TRANSIENT_KEYS は除外
 * - Set は JSON シリアライズのため Array に変換
 */
export function buildTemplateFromPanel(name: string, panel: PanelState): GraphTemplate {
	const panelData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(panel)) {
		if (TEMPLATE_TRANSIENT_KEYS.has(key)) continue;
		if (value instanceof Set) {
			panelData[key] = Array.from(value);
		} else {
			panelData[key] = value;
		}
	}
	return {
		name,
		createdAt: new Date().toISOString(),
		panel: panelData,
	};
}

/**
 * 既存テンプレート配列に新しいテンプレートを upsert（同名なら上書き）した
 * 新配列を返す。上限超過時は null（既存挙動の保持: 同名上書きでも上限拒否）。
 */
export function upsertTemplate(
	template: GraphTemplate,
	templates: ReadonlyArray<GraphTemplate>,
	maxTemplates: number = MAX_TEMPLATES,
): GraphTemplate[] | null {
	if (templates.length >= maxTemplates) return null;
	const idx = templates.findIndex((t) => t.name === template.name);
	if (idx >= 0) {
		const next = templates.slice();
		next[idx] = template;
		return next;
	}
	return [...templates, template];
}

/**
 * テンプレートを panel に適用する。
 * - Set 型のフィールドは Array → Set へ復元
 * - TEMPLATE_TRANSIENT_KEYS は念のためスキップ
 *
 * panel は in-place で書き換える。見つからなければ false を返す。
 */
export function applyTemplate(name: string, templates: ReadonlyArray<GraphTemplate>, panel: PanelState): boolean {
	const template = templates.find((t) => t.name === name);
	if (!template) return false;
	const src = panel as unknown as Record<string, unknown>;
	for (const [key, value] of Object.entries(template.panel)) {
		if (TEMPLATE_TRANSIENT_KEYS.has(key)) continue;
		if (src[key] instanceof Set && Array.isArray(value)) {
			src[key] = new Set(value as unknown[]);
		} else {
			src[key] = value;
		}
	}
	return true;
}

/** 指定名を除いた新しい配列を返す */
export function removeTemplate(name: string, templates: ReadonlyArray<GraphTemplate>): GraphTemplate[] {
	return templates.filter((t) => t.name !== name);
}
