import { describe, it, expect } from "vitest";
import { ontologyToRules, rulesToOntologyFields } from "../src/types";
import type { OntologyConfig, OntologyRule } from "../src/types";

function makeConfig(overrides: Partial<OntologyConfig> = {}): OntologyConfig {
	return {
		inheritanceFields: [],
		aggregationFields: [],
		reverseInheritanceFields: [],
		reverseAggregationFields: [],
		useTagHierarchy: false,
		similarFields: [],
		siblingFields: [],
		sequenceFields: [],
		reverseSequenceFields: [],
		customMappings: {},
		tagRelations: [],
		...overrides,
	};
}

describe("ontologyToRules", () => {
	it("empty config → empty rules", () => {
		expect(ontologyToRules(makeConfig())).toEqual([]);
	});

	it("inheritance fields produce is-a rule", () => {
		const rules = ontologyToRules(
			makeConfig({
				inheritanceFields: ["parent", "extends"],
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0]).toEqual({ forward: "parent, extends", relation: "is-a", reverse: "" });
	});

	it("reverse inheritance fields included in is-a rule", () => {
		const rules = ontologyToRules(
			makeConfig({
				inheritanceFields: ["parent"],
				reverseInheritanceFields: ["child", "down"],
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0].reverse).toBe("child, down");
	});

	it("aggregation fields produce has-a rule", () => {
		const rules = ontologyToRules(
			makeConfig({
				aggregationFields: ["contains"],
				reverseAggregationFields: ["part-of"],
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0]).toEqual({ forward: "contains", relation: "has-a", reverse: "part-of" });
	});

	it("sequence fields produce is-from rule", () => {
		const rules = ontologyToRules(
			makeConfig({
				sequenceFields: ["next"],
				reverseSequenceFields: ["prev"],
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0]).toEqual({ forward: "next", relation: "is-from", reverse: "prev" });
	});

	it("similar fields produce is-alike rule with empty reverse", () => {
		const rules = ontologyToRules(
			makeConfig({
				similarFields: ["related", "see-also"],
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0]).toEqual({ forward: "related, see-also", relation: "is-alike", reverse: "" });
	});

	it("sibling fields produce sibling rule with empty reverse", () => {
		const rules = ontologyToRules(
			makeConfig({
				siblingFields: ["peer"],
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0]).toEqual({ forward: "peer", relation: "sibling", reverse: "" });
	});

	it("multiple field types produce multiple rules in order", () => {
		const rules = ontologyToRules(
			makeConfig({
				inheritanceFields: ["parent"],
				aggregationFields: ["has"],
				similarFields: ["related"],
			}),
		);
		expect(rules).toHaveLength(3);
		expect(rules[0].relation).toBe("is-a");
		expect(rules[1].relation).toBe("has-a");
		expect(rules[2].relation).toBe("is-alike");
	});

	it("reverse-only inheritance still produces rule", () => {
		const rules = ontologyToRules(
			makeConfig({
				reverseInheritanceFields: ["child"],
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0].forward).toBe("");
		expect(rules[0].reverse).toBe("child");
	});

	it("single field produces no comma in forward string", () => {
		const rules = ontologyToRules(
			makeConfig({
				inheritanceFields: ["parent"],
			}),
		);
		expect(rules[0].forward).toBe("parent");
		expect(rules[0].forward).not.toContain(",");
	});
});

// ---------------------------------------------------------------------------
// rulesToOntologyFields — reverse direction (rules → config fields)
// ---------------------------------------------------------------------------
describe("rulesToOntologyFields", () => {
	it("roundtrip: ontologyToRules → rulesToOntologyFields restores original", () => {
		const original = makeConfig({
			inheritanceFields: ["parent", "extends"],
			reverseInheritanceFields: ["child"],
			aggregationFields: ["contains"],
			reverseAggregationFields: ["part-of"],
			sequenceFields: ["next"],
			reverseSequenceFields: ["prev"],
			similarFields: ["related"],
			siblingFields: ["peer"],
		});
		const rules = ontologyToRules(original);
		const target = makeConfig(); // all empty
		rulesToOntologyFields(rules, target);
		expect(target.inheritanceFields).toEqual(["parent", "extends"]);
		expect(target.reverseInheritanceFields).toEqual(["child"]);
		expect(target.aggregationFields).toEqual(["contains"]);
		expect(target.reverseAggregationFields).toEqual(["part-of"]);
		expect(target.sequenceFields).toEqual(["next"]);
		expect(target.reverseSequenceFields).toEqual(["prev"]);
		expect(target.similarFields).toEqual(["related"]);
		expect(target.siblingFields).toEqual(["peer"]);
	});

	it("empty rules array clears all fields", () => {
		const cfg = makeConfig({
			inheritanceFields: ["parent"],
			aggregationFields: ["has"],
		});
		rulesToOntologyFields([], cfg);
		expect(cfg.inheritanceFields).toEqual([]);
		expect(cfg.aggregationFields).toEqual([]);
		expect(cfg.similarFields).toEqual([]);
		expect(cfg.siblingFields).toEqual([]);
	});

	it("comma-separated forward fields are split correctly", () => {
		const rules: OntologyRule[] = [{ forward: "parent, extends, up", relation: "is-a", reverse: "child, down" }];
		const cfg = makeConfig();
		rulesToOntologyFields(rules, cfg);
		expect(cfg.inheritanceFields).toEqual(["parent", "extends", "up"]);
		expect(cfg.reverseInheritanceFields).toEqual(["child", "down"]);
	});

	it("unknown relation type is silently ignored", () => {
		const rules: OntologyRule[] = [{ forward: "foo", relation: "unknown-type" as any, reverse: "bar" }];
		const cfg = makeConfig();
		rulesToOntologyFields(rules, cfg);
		// All arrays should remain empty since "unknown-type" doesn't match any case
		expect(cfg.inheritanceFields).toEqual([]);
		expect(cfg.aggregationFields).toEqual([]);
		expect(cfg.sequenceFields).toEqual([]);
		expect(cfg.similarFields).toEqual([]);
		expect(cfg.siblingFields).toEqual([]);
	});

	it("empty forward/reverse strings produce no entries", () => {
		const rules: OntologyRule[] = [{ forward: "", relation: "is-a", reverse: "" }];
		const cfg = makeConfig();
		rulesToOntologyFields(rules, cfg);
		expect(cfg.inheritanceFields).toEqual([]);
		expect(cfg.reverseInheritanceFields).toEqual([]);
	});
});
