import { describe, it, expect } from "vitest";
import { classifyRelation } from "../src/parsers/metadata-parser";
import { DEFAULT_ONTOLOGY } from "../src/types";
import type { OntologyConfig } from "../src/types";

const baseOntology: OntologyConfig = {
  ...DEFAULT_ONTOLOGY,
  inheritanceFields: ["parent", "extends"],
  aggregationFields: ["contains", "parts"],
  similarFields: ["similar", "related"],
  customMappings: {},
};

describe("classifyRelation", () => {
  it("classifies inheritance field", () => {
    expect(classifyRelation("parent", baseOntology)).toEqual({ type: "inheritance", reverse: false });
    expect(classifyRelation("extends", baseOntology)).toEqual({ type: "inheritance", reverse: false });
  });

  it("classifies aggregation field", () => {
    expect(classifyRelation("contains", baseOntology)).toEqual({ type: "aggregation", reverse: false });
    expect(classifyRelation("parts", baseOntology)).toEqual({ type: "aggregation", reverse: false });
  });

  it("classifies similar field", () => {
    expect(classifyRelation("similar", baseOntology)).toEqual({ type: "similar", reverse: false });
    expect(classifyRelation("related", baseOntology)).toEqual({ type: "similar", reverse: false });
  });

  it("classifies sibling field", () => {
    expect(classifyRelation("sibling", baseOntology)).toEqual({ type: "sibling", reverse: false });
    expect(classifyRelation("same", baseOntology)).toEqual({ type: "sibling", reverse: false });
  });

  it("classifies sequence field", () => {
    expect(classifyRelation("next", baseOntology)).toEqual({ type: "sequence", reverse: false });
  });

  it("classifies reverse inheritance field", () => {
    expect(classifyRelation("child", baseOntology)).toEqual({ type: "inheritance", reverse: true });
    expect(classifyRelation("down", baseOntology)).toEqual({ type: "inheritance", reverse: true });
  });

  it("classifies reverse aggregation field", () => {
    expect(classifyRelation("part-of", baseOntology)).toEqual({ type: "aggregation", reverse: true });
    expect(classifyRelation("belongs-to", baseOntology)).toEqual({ type: "aggregation", reverse: true });
  });

  it("classifies reverse sequence field", () => {
    expect(classifyRelation("prev", baseOntology)).toEqual({ type: "sequence", reverse: true });
    expect(classifyRelation("previous", baseOntology)).toEqual({ type: "sequence", reverse: true });
  });

  it("is case-insensitive", () => {
    expect(classifyRelation("Parent", baseOntology)).toEqual({ type: "inheritance", reverse: false });
    expect(classifyRelation("CONTAINS", baseOntology)).toEqual({ type: "aggregation", reverse: false });
    expect(classifyRelation("Similar", baseOntology)).toEqual({ type: "similar", reverse: false });
    expect(classifyRelation("SIBLING", baseOntology)).toEqual({ type: "sibling", reverse: false });
    expect(classifyRelation("Next", baseOntology)).toEqual({ type: "sequence", reverse: false });
    expect(classifyRelation("CHILD", baseOntology)).toEqual({ type: "inheritance", reverse: true });
    expect(classifyRelation("PART-OF", baseOntology)).toEqual({ type: "aggregation", reverse: true });
    expect(classifyRelation("Prev", baseOntology)).toEqual({ type: "sequence", reverse: true });
    expect(classifyRelation("PREVIOUS", baseOntology)).toEqual({ type: "sequence", reverse: true });
  });

  it("handles @-prefixed names", () => {
    expect(classifyRelation("@Parent", baseOntology)).toEqual({ type: "inheritance", reverse: false });
    expect(classifyRelation("@Contains", baseOntology)).toEqual({ type: "aggregation", reverse: false });
    expect(classifyRelation("@similar", baseOntology)).toEqual({ type: "similar", reverse: false });
    expect(classifyRelation("@sibling", baseOntology)).toEqual({ type: "sibling", reverse: false });
    expect(classifyRelation("@next", baseOntology)).toEqual({ type: "sequence", reverse: false });
    expect(classifyRelation("@child", baseOntology)).toEqual({ type: "inheritance", reverse: true });
    expect(classifyRelation("@part-of", baseOntology)).toEqual({ type: "aggregation", reverse: true });
    expect(classifyRelation("@prev", baseOntology)).toEqual({ type: "sequence", reverse: true });
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
    expect(classifyRelation("belongsTo", onto)).toEqual({ type: "aggregation", reverse: false });
  });

  it("uses customMappings with new types", () => {
    const onto: OntologyConfig = {
      ...baseOntology,
      customMappings: { "follows": "sequence", "peer": "sibling" },
    };
    expect(classifyRelation("follows", onto)).toEqual({ type: "sequence", reverse: false });
    expect(classifyRelation("peer", onto)).toEqual({ type: "sibling", reverse: false });
  });

  it("handles whitespace in names", () => {
    expect(classifyRelation("  parent  ", baseOntology)).toEqual({ type: "inheritance", reverse: false });
    expect(classifyRelation("@ Parent ", baseOntology)).toEqual({ type: "inheritance", reverse: false });
  });
});
