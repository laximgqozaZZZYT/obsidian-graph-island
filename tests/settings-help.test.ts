import { describe, it, expect, vi } from "vitest";
vi.mock("obsidian", () => ({
	App: class {},
	Modal: class {
		open() {}
		onOpen() {}
		onClose() {}
	},
	Notice: class {},
	PluginSettingTab: class {},
	Setting: class {
		setName() {
			return this;
		}
		setDesc() {
			return this;
		}
		addButton() {
			return this;
		}
		addText() {
			return this;
		}
		addToggle() {
			return this;
		}
	},
	setIcon: () => {},
}));
import { HELP } from "../src/settings";
import type { HelpEntry } from "../src/settings";

// ---------------------------------------------------------------------------
// HELP data integrity — ensure all entries are well-formed
// ---------------------------------------------------------------------------
describe("HELP entries", () => {
	const entries = Object.entries(HELP) as [string, HelpEntry][];

	it("contains expected keys", () => {
		const keys = Object.keys(HELP);
		const expected = [
			"metadataFields",
			"colorField",
			"groupField",
			"enclosure",
			"ontology",
			"groupPresets",
			"clusterGroupRules",
			"directionalGravity",
			"nodeRules",
		];
		for (const k of expected) {
			expect(keys).toContain(k);
		}
	});

	it("all entries have non-empty title", () => {
		for (const [key, entry] of entries) {
			expect(entry.title, `HELP.${key}.title`).toBeTruthy();
			expect(entry.title.length, `HELP.${key}.title length`).toBeGreaterThan(0);
		}
	});

	it("all entries have non-empty body", () => {
		for (const [key, entry] of entries) {
			expect(entry.body, `HELP.${key}.body`).toBeTruthy();
			expect(entry.body.length, `HELP.${key}.body length`).toBeGreaterThan(10);
		}
	});

	it("no duplicate titles", () => {
		const titles = entries.map(([, e]) => e.title);
		expect(new Set(titles).size).toBe(titles.length);
	});

	it("body text contains relevant keywords", () => {
		// Spot check: ontology should mention inheritance
		expect(HELP.ontology.body.toLowerCase()).toContain("inheritance");
		// groupPresets should mention JSON
		expect(HELP.groupPresets.body.toLowerCase()).toContain("json");
		// clusterGroupRules should mention groupBy
		expect(HELP.clusterGroupRules.body).toContain("groupBy");
	});

	it("entry count matches expected", () => {
		// Guard against accidental deletion
		expect(entries.length).toBeGreaterThanOrEqual(9);
	});
});
