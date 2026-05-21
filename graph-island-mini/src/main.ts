import { Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, MiniSettings, GroupBySpec } from "./types";
import { MiniGraphView, VIEW_TYPE_MINI } from "./view";

export default class GraphIslandMiniPlugin extends Plugin {
	settings: MiniSettings = DEFAULT_SETTINGS;
	private views: MiniGraphView[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_MINI, (leaf) => {
			const v = new MiniGraphView(leaf, this.settings, () => this.saveSettings());
			this.views.push(v);
			return v;
		});

		this.addRibbonIcon("git-fork", "Graph Island Mini", () => this.activateView());
		this.addCommand({
			id: "open-mini-graph",
			name: "Open mini graph view",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new MiniSettingTab(this));
	}

	async onunload(): Promise<void> {
		this.views = [];
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_MINI)[0];
		if (existing) {
			workspace.revealLeaf(existing);
			return;
		}
		const leaf: WorkspaceLeaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_MINI, active: true });
		workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		const raw = await this.loadData();
		const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) } as Record<string, unknown>;
		delete merged.collapsedGroups;
		// Drop legacy circle-era setting; cardMaxChars supersedes it.
		delete merged.nodeRadius;
		this.settings = merged as unknown as MiniSettings;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		for (const v of this.views) v.updateSettings(this.settings);
	}
}

class MiniSettingTab extends PluginSettingTab {
	constructor(private plugin: GraphIslandMiniPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		new Setting(containerEl)
			.setName("Group by")
			.setDesc("Cluster nodes by folder, tag, frontmatter field, or none.")
			.addDropdown((d) => {
				d.addOption("folder", "Folder");
				d.addOption("tag", "Tag");
				d.addOption("frontmatter", "Frontmatter field");
				d.addOption("none", "None");
				d.setValue(s.groupBy.kind);
				d.onChange(async (v) => {
					s.groupBy = toSpec(v, currentField(s.groupBy));
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (s.groupBy.kind === "frontmatter") {
			new Setting(containerEl)
				.setName("Frontmatter field")
				.addText((t) => {
					t.setPlaceholder("category");
					t.setValue(s.groupBy.kind === "frontmatter" ? s.groupBy.field : "");
					t.onChange(async (v) => {
						s.groupBy = { kind: "frontmatter", field: v.trim() || "category" };
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName("Cluster spacing")
			.addSlider((sl) => {
				sl.setLimits(20, 200, 5).setValue(s.clusterSpacing).setDynamicTooltip();
				sl.onChange(async (v) => {
					s.clusterSpacing = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Node spacing")
			.addSlider((sl) => {
				sl.setLimits(8, 60, 1).setValue(s.nodeSpacing).setDynamicTooltip();
				sl.onChange(async (v) => {
					s.nodeSpacing = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Card preview chars")
			.setDesc(
				"Maximum body preview length per card. Cards auto-size to fit their content; set to 0 for title-only.",
			)
			.addSlider((sl) => {
				sl.setLimits(0, 400, 20).setValue(s.cardMaxChars).setDynamicTooltip();
				sl.onChange(async (v) => {
					s.cardMaxChars = v;
					await this.plugin.saveSettings();
				});
			});

	}
}

function currentField(spec: GroupBySpec): string {
	return spec.kind === "frontmatter" ? spec.field : "category";
}

function toSpec(kind: string, field: string): GroupBySpec {
	if (kind === "folder") return { kind: "folder" };
	if (kind === "tag") return { kind: "tag" };
	if (kind === "frontmatter") return { kind: "frontmatter", field };
	return { kind: "none" };
}
