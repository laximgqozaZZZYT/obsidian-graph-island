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
	setEdgeTypeFlag,
	getEdgeTypeFlag,
	setHoverEdgeTypeFlag,
	getHoverEdgeTypeFlag,
	EDGE_TYPE_KEYS,
} from "../src/views/panel-state-setter";
import { createDefaultPanel } from "../src/views/PanelBuilder";

/**
 * Common invalid inputs reused across narrowing-helper tests.
 * Each value is something a dropdown/JSON callback might pass that is
 * NOT in any literal union — the helper must return null for all of them.
 */
const INVALID_INPUTS: readonly unknown[] = [
	"",
	"unknown",
	"FOO",
	123,
	0,
	-1,
	NaN,
	null,
	undefined,
	true,
	false,
	{},
	[],
	() => "circle",
	Symbol("circle"),
];

describe("setPanelField", () => {
	it("assigns a value to the named PanelState field", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "nodeSize", 42);
		expect(panel.nodeSize).toBe(42);
	});

	it("works for boolean fields", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "showLinks", false);
		expect(panel.showLinks).toBe(false);
		setPanelField(panel, "showLinks", true);
		expect(panel.showLinks).toBe(true);
	});

	it("works for string fields", () => {
		const panel = createDefaultPanel();
		setPanelField(panel, "searchQuery", "category:character");
		expect(panel.searchQuery).toBe("category:character");
	});

	it("does not affect sibling fields", () => {
		const panel = createDefaultPanel();
		const before = panel.showOrphans;
		setPanelField(panel, "nodeSize", 99);
		expect(panel.showOrphans).toBe(before);
	});
});

describe("asNodeShape", () => {
	const valid = ["circle", "triangle", "diamond", "hexagon", "square"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asNodeShape(v)).toBe(v);
		});
	}
	it("rejects all invalid inputs", () => {
		for (const v of INVALID_INPUTS) {
			expect(asNodeShape(v)).toBeNull();
		}
	});
});

describe("asNodeColorMode", () => {
	const valid = ["default", "category", "heatmap", "community", "field"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asNodeColorMode(v)).toBe(v);
		});
	}
	it("rejects close-but-wrong values", () => {
		expect(asNodeColorMode("Default")).toBeNull(); // case-sensitive
		expect(asNodeColorMode("color")).toBeNull();
	});
	it("rejects all invalid inputs", () => {
		for (const v of INVALID_INPUTS) {
			expect(asNodeColorMode(v)).toBeNull();
		}
	});
});

describe("asEdgeDirectionFilter", () => {
	it("accepts all three valid values", () => {
		expect(asEdgeDirectionFilter("all")).toBe("all");
		expect(asEdgeDirectionFilter("bidirectional")).toBe("bidirectional");
		expect(asEdgeDirectionFilter("unidirectional")).toBe("unidirectional");
	});
	it("rejects invalid inputs", () => {
		expect(asEdgeDirectionFilter("none")).toBeNull();
		expect(asEdgeDirectionFilter(undefined)).toBeNull();
	});
});

describe("asNodeDisplayMode", () => {
	const valid = ["node", "card", "donut", "sunburst-segment"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asNodeDisplayMode(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asNodeDisplayMode("matrix")).toBeNull();
		expect(asNodeDisplayMode(null)).toBeNull();
	});
});

describe("asImportanceMetric", () => {
	const valid = ["degree", "betweenness", "pagerank"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asImportanceMetric(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asImportanceMetric("closeness")).toBeNull();
		expect(asImportanceMetric(0)).toBeNull();
	});
});

describe("asClusterLabelDetail", () => {
	const valid = ["minimal", "standard", "detailed", "rich"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asClusterLabelDetail(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asClusterLabelDetail("verbose")).toBeNull();
	});
});

describe("asAnalysisOverlay", () => {
	const valid = ["off", "bridges", "entropy", "gaps", "missing", "density", "all"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asAnalysisOverlay(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asAnalysisOverlay("communities")).toBeNull();
		expect(asAnalysisOverlay(true)).toBeNull();
	});
});

describe("asCableBundleMode", () => {
	const valid = ["auto", "always", "never"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asCableBundleMode(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asCableBundleMode("sometimes")).toBeNull();
	});
});

describe("asLabelModeOverride", () => {
	const valid = ["auto", "initials", "truncated", "full"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asLabelModeOverride(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asLabelModeOverride("short")).toBeNull();
	});
});

describe("asEnclosureLabelPosition", () => {
	const valid = ["top", "center", "bottom"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asEnclosureLabelPosition(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asEnclosureLabelPosition("middle")).toBeNull(); // close synonym still rejected
		expect(asEnclosureLabelPosition("left")).toBeNull();
	});
});

describe("asClusterArrangement", () => {
	const valid = [
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
	];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asClusterArrangement(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asClusterArrangement("force")).toBeNull();
		expect(asClusterArrangement("circle")).toBeNull(); // belongs to ClusterGroupArrangement
	});
});

describe("asClusterGroupArrangement", () => {
	const valid = ["auto", "circle", "horizontal", "vertical", "concentric", "grid"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asClusterGroupArrangement(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asClusterGroupArrangement("inherit")).toBeNull(); // belongs to ClusterArrangement
		expect(asClusterGroupArrangement("triangle")).toBeNull();
	});
});

describe("asCoordinateSystem", () => {
	it("accepts cartesian and polar", () => {
		expect(asCoordinateSystem("cartesian")).toBe("cartesian");
		expect(asCoordinateSystem("polar")).toBe("polar");
	});
	it("rejects invalid inputs", () => {
		expect(asCoordinateSystem("Cartesian")).toBeNull();
		expect(asCoordinateSystem("spherical")).toBeNull();
	});
});

describe("asGridStyle", () => {
	it("accepts lines and table", () => {
		expect(asGridStyle("lines")).toBe("lines");
		expect(asGridStyle("table")).toBe("table");
	});
	it("rejects invalid inputs", () => {
		expect(asGridStyle("dots")).toBeNull();
	});
});

describe("asGridLabelPlacement", () => {
	it("accepts on-line and between", () => {
		expect(asGridLabelPlacement("on-line")).toBe("on-line");
		expect(asGridLabelPlacement("between")).toBe("between");
	});
	it("rejects invalid inputs", () => {
		expect(asGridLabelPlacement("on_line")).toBeNull(); // underscore variant rejected
		expect(asGridLabelPlacement("inside")).toBeNull();
	});
});

describe("asCardPreset", () => {
	const valid = ["custom", "compact", "detailed", "full"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asCardPreset(v)).toBe(v);
		});
	}
	it("rejects invalid inputs", () => {
		expect(asCardPreset("minimal")).toBeNull();
	});
});

describe("asHeaderStyle", () => {
	it("accepts plain and table", () => {
		expect(asHeaderStyle("plain")).toBe("plain");
		expect(asHeaderStyle("table")).toBe("table");
	});
	it("rejects invalid inputs", () => {
		expect(asHeaderStyle("fancy")).toBeNull();
	});
});

describe("asFieldFormat", () => {
	it("accepts key-value and value-only", () => {
		expect(asFieldFormat("key-value")).toBe("key-value");
		expect(asFieldFormat("value-only")).toBe("value-only");
	});
	it("rejects invalid inputs", () => {
		expect(asFieldFormat("key_value")).toBeNull();
		expect(asFieldFormat("kv")).toBeNull();
	});
});

describe("asHoverEdgeTypeKey", () => {
	const valid = ["link", "semantic", "tag", "hasTag", "similar", "sibling", "sequence", "inheritance", "aggregation"];
	for (const v of valid) {
		it(`accepts "${v}"`, () => {
			expect(asHoverEdgeTypeKey(v)).toBe(v);
		});
	}
	it("rejects camelCase variant for has-tag", () => {
		expect(asHoverEdgeTypeKey("has-tag")).toBeNull(); // canonical form is "hasTag"
		expect(asHoverEdgeTypeKey("has_tag")).toBeNull();
	});
	it("rejects invalid inputs", () => {
		expect(asHoverEdgeTypeKey("HOVER")).toBeNull();
		expect(asHoverEdgeTypeKey(undefined)).toBeNull();
	});
});

describe("EDGE_TYPE_KEYS", () => {
	it("contains all 10 edge-type flags", () => {
		expect(EDGE_TYPE_KEYS).toHaveLength(10);
	});

	it("entries are unique", () => {
		const set = new Set<string>(EDGE_TYPE_KEYS);
		expect(set.size).toBe(EDGE_TYPE_KEYS.length);
	});

	it("every key resolves to a boolean PanelState field", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			expect(typeof panel[key]).toBe("boolean");
		}
	});
});

describe("setEdgeTypeFlag / getEdgeTypeFlag", () => {
	it("round-trips true and false for every key", () => {
		const panel = createDefaultPanel();
		for (const key of EDGE_TYPE_KEYS) {
			setEdgeTypeFlag(panel, key, false);
			expect(getEdgeTypeFlag(panel, key)).toBe(false);
			setEdgeTypeFlag(panel, key, true);
			expect(getEdgeTypeFlag(panel, key)).toBe(true);
		}
	});

	it("setting one flag does not change the others", () => {
		const panel = createDefaultPanel();
		// Capture the initial state for everything except the key under test.
		const target = "showLinks" as const;
		const before: Record<string, boolean> = {};
		for (const key of EDGE_TYPE_KEYS) {
			if (key !== target) before[key] = getEdgeTypeFlag(panel, key);
		}
		setEdgeTypeFlag(panel, target, !panel[target]);
		for (const key of EDGE_TYPE_KEYS) {
			if (key !== target) expect(getEdgeTypeFlag(panel, key)).toBe(before[key]);
		}
	});
});

describe("setHoverEdgeTypeFlag / getHoverEdgeTypeFlag", () => {
	it("round-trips true and false on hoverEdgeTypes", () => {
		const panel = createDefaultPanel();
		const het = panel.hoverEdgeTypes;
		setHoverEdgeTypeFlag(het, "link", false);
		expect(getHoverEdgeTypeFlag(het, "link")).toBe(false);
		setHoverEdgeTypeFlag(het, "link", true);
		expect(getHoverEdgeTypeFlag(het, "link")).toBe(true);
	});

	it("operates on each hover edge-type key independently", () => {
		const panel = createDefaultPanel();
		const het = panel.hoverEdgeTypes;
		// Flip "tag" off; "link" must keep its prior value.
		const linkBefore = getHoverEdgeTypeFlag(het, "link");
		setHoverEdgeTypeFlag(het, "tag", false);
		expect(getHoverEdgeTypeFlag(het, "tag")).toBe(false);
		expect(getHoverEdgeTypeFlag(het, "link")).toBe(linkBefore);
	});
});
