/**
 * Axis source string ↔ AxisSource conversion.
 * Extracted from PanelBuilder / coord-panel to eliminate duplication.
 *
 * Supported syntax:
 *   index                       → { kind: "index" }
 *   random                      → { kind: "random", seed: 42 }
 *   random:123                  → { kind: "random", seed: 123 }
 *   const:5                     → { kind: "const", value: 5 }
 *   degree / in-degree / out-degree / bfs-depth / sibling-rank
 *                               → { kind: "metric", metric: "..." }
 *   hop:nodeName                → { kind: "hop", from: "nodeName" }
 *   hop:nodeName:5              → { kind: "hop", from: "nodeName", maxDepth: 5 }
 *   path / file / folder / tag / category / id / isTag
 *                               → { kind: "field", field: "..." }
 *   [anyFrontmatterKey]         → { kind: "field", field: "..." }
 */

import type { AxisSource, MetricKind } from "../types";

const METRIC_NAMES = new Set(["degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank"]);
const BUILT_IN_FIELDS = new Set(["path", "file", "folder", "tag", "category", "id", "isTag"]);

function parseRandom(trimmed: string): AxisSource | null {
	if (trimmed === "random") return { kind: "random", seed: 42 };
	if (!trimmed.startsWith("random:")) return null;
	const seed = parseInt(trimmed.slice(7), 10);
	return { kind: "random", seed: isNaN(seed) ? 42 : seed };
}

function parseConst(trimmed: string): AxisSource | null {
	if (trimmed === "const") return { kind: "const", value: 1 };
	if (!trimmed.startsWith("const:")) return null;
	const v = parseFloat(trimmed.slice(6));
	return { kind: "const", value: isNaN(v) ? 1 : v };
}

function parseHop(trimmed: string): AxisSource | null {
	if (trimmed === "hop") return { kind: "hop", from: "" };
	if (!trimmed.startsWith("hop:")) return null;
	const parts = trimmed.slice(4).split(":");
	const from = parts[0] || "";
	const maxDepth = parts[1] ? parseInt(parts[1], 10) : undefined;
	return { kind: "hop", from, ...(maxDepth != null && !isNaN(maxDepth) ? { maxDepth } : {}) };
}

function parseField(trimmed: string): AxisSource {
	if (BUILT_IN_FIELDS.has(trimmed)) return { kind: "field", field: trimmed };
	const fieldMatch = trimmed.replace(/:[?*]?$/, "");
	if (fieldMatch && fieldMatch !== trimmed) return { kind: "field", field: fieldMatch };
	return { kind: "field", field: trimmed };
}

export function parseAxisSourceString(s: string): AxisSource | null {
	const trimmed = s.trim();
	if (!trimmed) return null;

	if (trimmed === "index") return { kind: "index" };
	if (METRIC_NAMES.has(trimmed)) return { kind: "metric", metric: trimmed as MetricKind };

	return parseRandom(trimmed) ?? parseConst(trimmed) ?? parseHop(trimmed) ?? parseField(trimmed);
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
