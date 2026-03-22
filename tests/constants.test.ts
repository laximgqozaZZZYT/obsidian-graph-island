import { describe, it, expect } from "vitest";
import * as C from "../src/constants";

describe("constants — uniqueness", () => {
  it("EDGE_TYPE_* values are all unique", () => {
    const edgeTypes = [
      C.EDGE_TYPE_INHERITANCE, C.EDGE_TYPE_AGGREGATION, C.EDGE_TYPE_SEQUENCE,
      C.EDGE_TYPE_SIMILAR, C.EDGE_TYPE_SIBLING, C.EDGE_TYPE_LINK,
      C.EDGE_TYPE_TAG, C.EDGE_TYPE_HAS_TAG,
    ];
    expect(new Set(edgeTypes).size).toBe(edgeTypes.length);
  });

  it("ARRANGEMENT_* values are all unique", () => {
    const arrangements = [
      C.ARRANGEMENT_CONCENTRIC, C.ARRANGEMENT_TIMELINE, C.ARRANGEMENT_TRIANGLE,
      C.ARRANGEMENT_GRID, C.ARRANGEMENT_RADIAL, C.ARRANGEMENT_PHYLLOTAXIS,
      C.ARRANGEMENT_RANDOM, C.ARRANGEMENT_CUSTOM, C.ARRANGEMENT_EGO,
    ];
    expect(new Set(arrangements).size).toBe(arrangements.length);
  });

  it("LAYOUT_* values are all unique", () => {
    const layouts = [
      C.LAYOUT_FORCE, C.LAYOUT_CONCENTRIC, C.LAYOUT_TREE,
      C.LAYOUT_ARC, C.LAYOUT_SUNBURST, C.LAYOUT_TIMELINE,
    ];
    expect(new Set(layouts).size).toBe(layouts.length);
  });

  it("SOURCE_* values are all unique", () => {
    const sources = [
      C.SOURCE_PROPERTY, C.SOURCE_INDEX, C.SOURCE_FIELD,
      C.SOURCE_METRIC, C.SOURCE_HOP, C.SOURCE_RANDOM, C.SOURCE_CONST,
    ];
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("TRANSFORM_* values are all unique", () => {
    const transforms = [
      C.TRANSFORM_EXPRESSION, C.TRANSFORM_EVEN_DIVIDE, C.TRANSFORM_LINEAR,
      C.TRANSFORM_BIN, C.TRANSFORM_DATE_INDEX, C.TRANSFORM_STACK_AVOID,
      C.TRANSFORM_GOLDEN, C.TRANSFORM_CURVE, C.TRANSFORM_SHAPE_FILL,
    ];
    expect(new Set(transforms).size).toBe(transforms.length);
  });

  it("GROUP_ARRANGEMENT_* values are all unique", () => {
    const groupArr = [
      C.GROUP_ARRANGEMENT_AUTO, C.GROUP_ARRANGEMENT_CIRCLE,
      C.GROUP_ARRANGEMENT_HORIZONTAL, C.GROUP_ARRANGEMENT_VERTICAL,
      C.GROUP_ARRANGEMENT_CONCENTRIC, C.GROUP_ARRANGEMENT_GRID,
    ];
    expect(new Set(groupArr).size).toBe(groupArr.length);
  });
});

describe("constants — types", () => {
  it("all string constants are non-empty", () => {
    const stringConsts = Object.values(C).filter((v): v is string => typeof v === "string");
    expect(stringConsts.length).toBeGreaterThan(40); // sanity check
    for (const val of stringConsts) {
      expect(val.length).toBeGreaterThan(0);
    }
  });

  it("no string constants contain whitespace", () => {
    for (const val of Object.values(C)) {
      if (typeof val === "string") {
        expect(val).not.toMatch(/\s/);
      }
    }
  });
});

describe("constants — cross-category independence", () => {
  it("edge types don't collide with layout types", () => {
    const edgeTypes = new Set([
      C.EDGE_TYPE_INHERITANCE, C.EDGE_TYPE_AGGREGATION, C.EDGE_TYPE_SEQUENCE,
      C.EDGE_TYPE_SIMILAR, C.EDGE_TYPE_SIBLING, C.EDGE_TYPE_LINK,
      C.EDGE_TYPE_TAG, C.EDGE_TYPE_HAS_TAG,
    ]);
    const layoutTypes = [C.LAYOUT_FORCE, C.LAYOUT_CONCENTRIC, C.LAYOUT_TREE,
      C.LAYOUT_ARC, C.LAYOUT_SUNBURST, C.LAYOUT_TIMELINE];
    for (const lt of layoutTypes) {
      expect(edgeTypes.has(lt as any)).toBe(false);
    }
  });

  it("source kinds don't collide with transform kinds", () => {
    const sources = new Set([
      C.SOURCE_PROPERTY, C.SOURCE_INDEX, C.SOURCE_FIELD,
      C.SOURCE_METRIC, C.SOURCE_HOP, C.SOURCE_RANDOM, C.SOURCE_CONST,
    ]);
    const transforms = [
      C.TRANSFORM_EXPRESSION, C.TRANSFORM_EVEN_DIVIDE, C.TRANSFORM_LINEAR,
      C.TRANSFORM_BIN, C.TRANSFORM_DATE_INDEX, C.TRANSFORM_STACK_AVOID,
      C.TRANSFORM_GOLDEN, C.TRANSFORM_CURVE, C.TRANSFORM_SHAPE_FILL,
    ];
    for (const t of transforms) {
      expect(sources.has(t as any)).toBe(false);
    }
  });
});
