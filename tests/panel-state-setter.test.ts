import { describe, it, expect } from "vitest";
import {
	setPanelField,
	asNodeShape,
	asNodeColorMode,
	asEdgeDirectionFilter,
	asNodeDisplayMode,
	asImportanceMetric,
	asClusterLabelDetail,
	asAnalysisOverlay,
	asCableBundleMode,
	asLabelModeOverride,
	asEnclosureLabelPosition,
	asClusterArrangement,
	asClusterGroupArrangement,
	asCoordinateSystem,
	asGridStyle,
	asGridLabelPlacement,
	asCardPreset,
	asHeaderStyle,
	asFieldFormat,
	asHoverEdgeTypeKey,
	EDGE_TYPE_KEYS,
	setEdgeTypeFlag,
	getEdgeTypeFlag,
	setHoverEdgeTypeFlag,
	getHoverEdgeTypeFlag,
} from "../src/views/panel-state-setter";
import { createDefaultPanel } from "../src/views/PanelBuilder";

describe("setPanelField", () => {
	it("assigns a typed value to the panel field", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "nodeSize", 42);
		expect(panel.nodeSize).toBe(42);
	});

	it("assigns boolean flags", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
		setPanelField(panel, "showLinks", true);
		expect(panel.showLinks).toBe(true);
	});

	it("assigns string fields", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "searchQuery", "test query");
		expect(panel.searchQuery).toBe("test query");
	});
});

// ---------------------------------------------------------------------------
// Narrowing helpers — each returns null for invalid input, the value for valid.
// We cover one valid + a few invalid shapes per group: garbage string, number,
// null, undefined, empty string. The pattern is shared but each guard wraps a
// different literal set, so we verify them all to catch typos in the union.
// ---------------------------------------------------------------------------

describe("asNodeShape", () => {
	it.each(["circle", "triangle", "diamond", "hexagon", "square"])("accepts %s", (shape) => {
		expect(asNodeShape(shape)).toBe(shape);
	});

	it("rejects non-shape strings, non-strings, and edge cases", () => {
		expect(asNodeShape("ellipse")).toBeNull();
		expect(asNodeShape("")).toBeNull();
		expect(asNodeShape(null)).toBeNull();
		expect(asNodeShape(undefined)).toBeNull();
		expect(asNodeShape(0)).toBeNull();
		expect(asNodeShape({})).toBeNull();
	});
});

describe("asNodeColorMode", () => {
	it.each(["default", "category", "heatmap", "community", "field"])("accepts %s", (m) => {
		expect(asNodeColorMode(m)).toBe(m);
	});

	it("rejects invalid", () => {
		expect(asNodeColorMode("rainbow")).toBeNull();
		expect(asNodeColorMode("DEFAULT")).toBeNull(); // case-sensitive
		expect(asNodeColorMode(null)).toBeNull();
	});
});

describe("asEdgeDirectionFilter", () => {
	it.each(["all", "bidirectional", "unidirectional"])("accepts %s", (v) => {
		expect(asEdgeDirectionFilter(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asEdgeDirectionFilter("none")).toBeNull();
		expect(asEdgeDirectionFilter(undefined)).toBeNull();
	});
});

describe("asNodeDisplayMode", () => {
	it.each(["node", "card", "donut", "sunburst-segment"])("accepts %s", (v) => {
		expect(asNodeDisplayMode(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asNodeDisplayMode("sunburst")).toBeNull(); // close-but-wrong
		expect(asNodeDisplayMode("")).toBeNull();
	});
});

describe("asImportanceMetric", () => {
	it.each(["degree", "betweenness", "pagerank"])("accepts %s", (v) => {
		expect(asImportanceMetric(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asImportanceMetric("closeness")).toBeNull();
		expect(asImportanceMetric(42)).toBeNull();
	});
});

describe("asClusterLabelDetail", () => {
	it.each(["minimal", "standard", "detailed", "rich"])("accepts %s", (v) => {
		expect(asClusterLabelDetail(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asClusterLabelDetail("verbose")).toBeNull();
	});
});

describe("asAnalysisOverlay", () => {
	it.each(["off", "bridges", "entropy", "gaps", "missing", "density", "all"])("accepts %s", (v) => {
		expect(asAnalysisOverlay(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asAnalysisOverlay("none")).toBeNull();
		expect(asAnalysisOverlay("ALL")).toBeNull();
	});
});

describe("asCableBundleMode", () => {
	it.each(["auto", "always", "never"])("accepts %s", (v) => {
		expect(asCableBundleMode(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asCableBundleMode("on")).toBeNull();
		expect(asCableBundleMode(true)).toBeNull();
	});
});

describe("asLabelModeOverride", () => {
	it.each(["auto", "initials", "truncated", "full"])("accepts %s", (v) => {
		expect(asLabelModeOverride(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asLabelModeOverride("short")).toBeNull();
	});
});

describe("asEnclosureLabelPosition", () => {
	it.each(["top", "center", "bottom"])("accepts %s", (v) => {
		expect(asEnclosureLabelPosition(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asEnclosureLabelPosition("left")).toBeNull();
		expect(asEnclosureLabelPosition("middle")).toBeNull(); // close-but-wrong
	});
});

describe("asClusterArrangement", () => {
	it.each([
		"inherit",
		"concentric",
		"radial",
		"phyllotaxis",
		"grid",
		"triangle",
		"random",
		"timeline",
		"custom",
		"ego",
	])("accepts %s", (v) => {
		expect(asClusterArrangement(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asClusterArrangement("circle")).toBeNull();
		expect(asClusterArrangement("")).toBeNull();
	});
});

describe("asClusterGroupArrangement", () => {
	it.each(["auto", "circle", "horizontal", "vertical", "concentric", "grid"])("accepts %s", (v) => {
		expect(asClusterGroupArrangement(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asClusterGroupArrangement("radial")).toBeNull();
	});
});

describe("asCoordinateSystem", () => {
	it("accepts cartesian and polar", () => {
		expect(asCoordinateSystem("cartesian")).toBe("cartesian");
		expect(asCoordinateSystem("polar")).toBe("polar");
	});

	it("rejects invalid", () => {
		expect(asCoordinateSystem("spherical")).toBeNull();
		expect(asCoordinateSystem(null)).toBeNull();
	});
});

describe("asGridStyle", () => {
	it("accepts lines and table", () => {
		expect(asGridStyle("lines")).toBe("lines");
		expect(asGridStyle("table")).toBe("table");
	});

	it("rejects invalid", () => {
		expect(asGridStyle("dots")).toBeNull();
	});
});

describe("asGridLabelPlacement", () => {
	it("accepts on-line and between", () => {
		expect(asGridLabelPlacement("on-line")).toBe("on-line");
		expect(asGridLabelPlacement("between")).toBe("between");
	});

	it("rejects invalid", () => {
		expect(asGridLabelPlacement("center")).toBeNull();
		expect(asGridLabelPlacement("on_line")).toBeNull(); // wrong separator
	});
});

describe("asCardPreset", () => {
	it.each(["custom", "compact", "detailed", "full"])("accepts %s", (v) => {
		expect(asCardPreset(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(asCardPreset("minimal")).toBeNull();
	});
});

describe("asHeaderStyle", () => {
	it("accepts plain and table", () => {
		expect(asHeaderStyle("plain")).toBe("plain");
		expect(asHeaderStyle("table")).toBe("table");
	});

	it("rejects invalid", () => {
		expect(asHeaderStyle("bold")).toBeNull();
	});
});

describe("asFieldFormat", () => {
	it("accepts key-value and value-only", () => {
		expect(asFieldFormat("key-value")).toBe("key-value");
		expect(asFieldFormat("value-only")).toBe("value-only");
	});

	it("rejects invalid", () => {
		expect(asFieldFormat("kv")).toBeNull();
		expect(asFieldFormat("key_value")).toBeNull();
	});
});

describe("asHoverEdgeTypeKey", () => {
	it.each(["link", "semantic", "tag", "hasTag", "similar", "sibling", "sequence", "inheritance", "aggregation"])(
		"accepts %s",
		(v) => {
			expect(asHoverEdgeTypeKey(v)).toBe(v);
		},
	);

	it("rejects invalid keys", () => {
		expect(asHoverEdgeTypeKey("category")).toBeNull(); // not in the hover set
		expect(asHoverEdgeTypeKey("has-tag")).toBeNull(); // dash form rejected, camelCase only
		expect(asHoverEdgeTypeKey("")).toBeNull();
		expect(asHoverEdgeTypeKey(null)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Edge-type flag helpers — verify keys exist on PanelState and round-trip.
// ---------------------------------------------------------------------------

describe("EDGE_TYPE_KEYS", () => {
	it("contains exactly the 10 known edge-type flags", () => {
		expect(EDGE_TYPE_KEYS).toEqual([
			"showLinks",
			"showTagEdges",
			"showCategoryEdges",
			"showSemanticEdges",
			"showInheritance",
			"showAggregation",
			"showSimilar",
			"showSibling",
			"showSequence",
			"showInlineRelation",
		]);
	});

	it("has no duplicate keys", () => {
		expect(new Set(EDGE_TYPE_KEYS).size).toBe(EDGE_TYPE_KEYS.length);
	});

	it("every key resolves to a boolean field on a default panel", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			expect(typeof panel[key]).toBe("boolean");
		}
	});
});

describe("setEdgeTypeFlag / getEdgeTypeFlag", () => {
	it("round-trips for every edge-type key", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			setEdgeTypeFlag(panel, key, true);
			expect(getEdgeTypeFlag(panel, key)).toBe(true);
			setEdgeTypeFlag(panel, key, false);
			expect(getEdgeTypeFlag(panel, key)).toBe(false);
		}
	});

	it("does not affect other keys when toggling one", () => {
		const panel = createDefaultPanel();
		// Snapshot all flags as known on/off
		for (const key of EDGE_TYPE_KEYS) setEdgeTypeFlag(panel, key, true);
		setEdgeTypeFlag(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
		// Other keys stay true
		for (const key of EDGE_TYPE_KEYS) {
			if (key === "showLinks") continue;
			expect(panel[key]).toBe(true);
		}
	});
});

describe("setHoverEdgeTypeFlag / getHoverEdgeTypeFlag", () => {
	it("round-trips for every hover edge-type key", () => {
		const panel = createDefaultPanel();
		const het = panel.hoverEdgeTypes;
		const keys = [
			"link",
			"semantic",
			"tag",
			"hasTag",
			"similar",
			"sibling",
			"sequence",
			"inheritance",
			"aggregation",
		] as const;
		for (const key of keys) {
			setHoverEdgeTypeFlag(het, key, true);
			expect(getHoverEdgeTypeFlag(het, key)).toBe(true);
			setHoverEdgeTypeFlag(het, key, false);
			expect(getHoverEdgeTypeFlag(het, key)).toBe(false);
		}
	});

	it("toggling one hover key does not touch the others", () => {
		const panel = createDefaultPanel();
		const het = panel.hoverEdgeTypes;
		const keys = [
			"link",
			"semantic",
			"tag",
			"hasTag",
			"similar",
			"sibling",
			"sequence",
			"inheritance",
			"aggregation",
		] as const;
		for (const k of keys) setHoverEdgeTypeFlag(het, k, true);
		setHoverEdgeTypeFlag(het, "tag", false);
		expect(het.tag).toBe(false);
		for (const k of keys) {
			if (k === "tag") continue;
			expect(het[k]).toBe(true);
		}
	});
});
