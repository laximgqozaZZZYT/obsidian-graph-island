/**
 * RenderHelpers — residual pure helpers kept for tests and internal consumers.
 * Most prior exports were migrated to `src/utils/gvc-helpers.ts`; this file now
 * hosts only helpers still referenced from production code (`heatmapColor`) or
 * re-exports that preserve legacy test surface.
 */

import {
	addFrontmatterTag as _addFrontmatterTag,
	setFrontmatterField as _setFrontmatterField,
} from "../utils/frontmatter-helper";
import { generatePhantomNodes as _generatePhantomNodes } from "./phantom-node-generator";

// ---------------------------------------------------------------------------
// Heatmap color ramp (consumed by node-coloring.ts)
// ---------------------------------------------------------------------------

/**
 * Heatmap color ramp: cold (blue 0x3b82f6) -> warm (red 0xef4444).
 * @param degree - node degree
 * @param maxDegree - maximum degree in the graph (for normalization)
 */
export function heatmapColor(degree: number, maxDegree: number): number {
	const t = Math.min(1, degree / Math.max(1, maxDegree));
	const r = Math.round(59 + t * (239 - 59)); // 0x3b -> 0xef
	const g = Math.round(130 - t * (130 - 68)); // 0x82 -> 0x44
	const b = Math.round(246 - t * (246 - 68)); // 0xf6 -> 0x44
	return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// Frontmatter helpers — re-exported from canonical source
// ---------------------------------------------------------------------------

/** Set a frontmatter field (creates YAML block if needed). */
export const setFrontmatterField = _setFrontmatterField;

/** Add a tag to frontmatter tags array. */
export const addFrontmatterTag = _addFrontmatterTag;

// ---------------------------------------------------------------------------
// Phantom node generation (road network routing junctions)
// ---------------------------------------------------------------------------

/**
 * Thin wrapper over `phantom-node-generator.ts` preserving the legacy
 * boolean signature used by existing tests.
 */
export function generatePhantomNodes(
	realNodes: { x: number; y: number; isPhantom?: boolean }[],
	cx: number,
	cy: number,
	isPolar: boolean,
): { id: string; label: string; x: number; y: number; vx: number; vy: number; isPhantom: true }[] {
	const arrangement = isPolar ? "concentric" : "grid";
	return _generatePhantomNodes(realNodes as Parameters<typeof _generatePhantomNodes>[0], cx, cy, arrangement) as {
		id: string;
		label: string;
		x: number;
		y: number;
		vx: number;
		vy: number;
		isPhantom: true;
	}[];
}
