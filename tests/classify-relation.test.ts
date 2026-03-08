import { describe, it, expect } from "vitest";
import { classifyRelation } from "../src/parsers/metadata-parser";
import type { OntologyConfig } from "../src/types";

const baseOntology: OntologyConfig = {
  inheritanceFields: ["parent", "extends"],
  aggregationFields: ["contains", "parts"],
  similarFields: ["similar", "related"],
  useTagHierarchy: true,
  customMappings: {},
};

describe("classifyRelation", () => {
  it("classifies inheritance field", () => {
    expect(classifyRelation("parent", baseOntology)).toBe("inheritance");
    expect(classifyRelation("extends", baseOntology)).toBe("inheritance");
  });

  it("classifies aggregation field", () => {
    expect(classifyRelation("contains", baseOntology)).toBe("aggregation");
    expect(classifyRelation("parts", baseOntology)).toBe("aggregation");
  });

  it("classifies similar field", () => {
    expect(classifyRelation("similar", baseOntology)).toBe("similar");
    expect(classifyRelation("related", baseOntology)).toBe("similar");
  });

  it("is case-insensitive", () => {
    expect(classifyRelation("Parent", baseOntology)).toBe("inheritance");
    expect(classifyRelation("CONTAINS", baseOntology)).toBe("aggregation");
    expect(classifyRelation("Similar", baseOntology)).toBe("similar");
  });

  it("handles @-prefixed names", () => {
    expect(classifyRelation("@Parent", baseOntology)).toBe("inheritance");
    expect(classifyRelation("@Contains", baseOntology)).toBe("aggregation");
    expect(classifyRelation("@similar", baseOntology)).toBe("similar");
  });

  it("returns undefined for unknown fields", () => {
    expect(classifyRelation("author", baseOntology)).toBeUndefined();
    expect(classifyRelation("title", baseOntology)).toBeUndefined();
  });

  it("uses customMappings as fallback", () => {
    const onto: OntologyConfig = {
      ...baseOntology,
      customMappings: { "belongsTo": "aggregation" },
    };
    expect(classifyRelation("belongsTo", onto)).toBe("aggregation");
  });

  it("handles whitespace in names", () => {
    expect(classifyRelation("  parent  ", baseOntology)).toBe("inheritance");
    expect(classifyRelation("@ Parent ", baseOntology)).toBe("inheritance");
  });
});
