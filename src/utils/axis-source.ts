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

export function parseAxisSourceString(s: string): AxisSource | null {
	const trimmed = s.trim();
	if (!trimmed) return null;

	// Exact matches for keywords
	if (trimmed === "index") return { kind: "index" };
	if (METRIC_NAMES.has(trimmed)) return { kind: "metric", metric: trimmed as MetricKind };

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
