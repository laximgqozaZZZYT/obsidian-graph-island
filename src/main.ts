import { Plugin } from "obsidian";
import { GraphViewsSettingTab } from "./settings";
import { GraphViewContainer, VIEW_TYPE_GRAPH } from "./views/GraphViewContainer";
import { NodeDetailView, VIEW_TYPE_NODE_DETAIL } from "./views/NodeDetailView";
import { NodeComparisonView, VIEW_TYPE_NODE_COMPARE } from "./views/NodeComparisonView";
import { EVENT_COMPARE_NODES } from "./constants";
import { DEFAULT_SETTINGS, type GraphViewsSettings } from "./types";
import { detectTagRelations } from "./utils/tag-relation-presets";
import { ManagedTimers } from "./utils/managed-timers";
import { t } from "./i18n";
import { showToast } from "./utils/toast";
import { asInternalWorkspace, asGraphView, type GraphViewInternal } from "./obsidian-internals";

export default class GraphViewsPlugin extends Plugin {
	settings: GraphViewsSettings = DEFAULT_SETTINGS;
	private _snapshotsLoaded = false;
	private timers = new ManagedTimers();

	async onload() {
		await this.loadSettings();

		// Auto-detect tag relationships on first load (when tagRelations is empty)
		this.app.workspace.onLayoutReady(() => {
			this.autoDetectTagRelationsIfNeeded();
		});

		this.registerView(VIEW_TYPE_GRAPH, (leaf) => new GraphViewContainer(leaf, this));

		this.registerView(VIEW_TYPE_NODE_DETAIL, (leaf) => new NodeDetailView(leaf));

		this.registerView(VIEW_TYPE_NODE_COMPARE, (leaf) => new NodeComparisonView(leaf));

		// 比較イベント発火時に比較パネルを自動オープン
		this.registerEvent(
			asInternalWorkspace(this.app.workspace).on(EVENT_COMPARE_NODES, (data: unknown) => {
				if (data) this.ensureComparePane();
			}),
		);

		this.addRibbonIcon("git-fork", "Graph Island", () => {
			this.activateView();
		});

		this._registerCoreCommands();
		this._registerGraphUtilityCommands();

		this.addSettingTab(new GraphViewsSettingTab(this.app, this));

		// Code block processor for embedded mini-graphs in notes
		this.registerMarkdownCodeBlockProcessor("graph-island", (source, el, _ctx) => {
			import("./views/EmbeddedGraphRenderer")
				.then(({ renderEmbeddedGraph }) => {
					renderEmbeddedGraph(el, source, this.app, this.settings);
				})
				.catch(() => {
					el.createDiv({ cls: "gi-embed-error", text: t("embed.renderFailed") });
				});
		});
	}

	private _registerCoreCommands() {
		this.addCommand({
			id: "open-graph-view",
			name: "Open graph view",
			callback: () => {
				this.activateView();
			},
		});

		// グラフをアクティブノートにPNG画像として埋め込むコマンド
		this.addCommand({
			id: "embed-graph-in-note",
			name: "Embed graph in note",
			editorCallback: async () => {
				const view = this._findGraphIslandView();
				if (!view) {
					showToast(t("toast.embedNoGraph"), 5000);
					return;
				}
				await view.embedGraphInNote?.();
			},
		});

		// I5: Keyboard shortcuts for graph operations
		this.addCommand({
			id: "graph-mode-explore",
			name: "Graph: Explore mode",
			callback: () => {
				const view = this._findGraphIslandView();
				if (view) view.applyPresetByKey?.("explore");
			},
		});
		this.addCommand({
			id: "graph-mode-analyze",
			name: "Graph: Analyze mode",
			callback: () => {
				const view = this._findGraphIslandView();
				if (view) view.applyPresetByKey?.("analyze");
			},
		});
		this.addCommand({
			id: "graph-mode-write",
			name: "Graph: Write mode",
			callback: () => {
				const view = this._findGraphIslandView();
				if (view) view.applyPresetByKey?.("write");
			},
		});
		this.addCommand({
			id: "graph-focus-toggle",
			name: "Graph: Toggle focus mode",
			callback: () => {
				const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
				if (leaf) {
					const v = asGraphView(leaf);
					if (!v) return;
					v.panel.focusMode = !v.panel.focusMode;
					v.markDirty?.(true);
				}
			},
		});
		this.addCommand({
			id: "graph-search-focus",
			name: "Graph: Focus search bar",
			callback: () => {
				const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
				if (leaf) {
					const v = asGraphView(leaf);
					const searchInput = v?.panelEl?.querySelector<HTMLInputElement>("input[type='text']");
					if (searchInput) searchInput.focus();
				}
			},
		});
	}

	private _registerGraphUtilityCommands() {
		// D2: Additional command palette integrations
		const gv = (): GraphViewInternal | null => {
			const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)[0];
			return leaf ? asGraphView(leaf) : null;
		};
		this.addCommand({
			id: "graph-toggle-stats",
			name: "Graph: Toggle statistics panel",
			callback: () => {
				const v = gv();
				if (v) {
					v.panel.showGraphStats = !v.panel.showGraphStats;
					v.markDirty?.(true);
				}
			},
		});
		this.addCommand({
			id: "graph-toggle-arrows",
			name: "Graph: Toggle edge arrows",
			callback: () => {
				const v = gv();
				if (v) {
					v.panel.showArrows = !v.panel.showArrows;
					v.markDirty?.(true);
				}
			},
		});
		this.addCommand({
			id: "graph-analysis-all",
			name: "Graph: Show all analysis overlays",
			callback: () => {
				const v = gv();
				if (v) {
					v.panel.analysisOverlay = "all";
					v.doRender?.();
				}
			},
		});
		this.addCommand({
			id: "graph-analysis-off",
			name: "Graph: Hide analysis overlays",
			callback: () => {
				const v = gv();
				if (v) {
					v.panel.analysisOverlay = "off";
					v.doRender?.();
				}
			},
		});
		this.addCommand({
			id: "graph-help",
			name: "Graph: Show keyboard shortcuts",
			callback: () => {
				const v = gv();
				if (v) {
					v._toggleHelpOverlay?.();
				}
			},
		});

		// A11y: Export commands for keyboard-only users
		this.addCommand({
			id: "graph-copy-png",
			name: "Graph: Copy graph as PNG",
			callback: () => {
				const v = gv();
				if (v) v.copyGraphToClipboard?.();
			},
		});
		this.addCommand({
			id: "graph-export-full",
			name: "Graph: Export full graph as JSON",
			callback: () => {
				const v = gv();
				if (v) v.exportFullGraph?.();
			},
		});
		this.addCommand({
			id: "graph-export-csv",
			name: "Graph: Export as CSV",
			callback: () => {
				const v = gv();
				if (v) v.exportGraphAsCSV?.();
			},
		});
		this.addCommand({
			id: "graph-export-mermaid",
			name: "Graph: Export as Mermaid diagram",
			callback: () => {
				const v = gv();
				if (v) v.exportGraphAsMermaid?.();
			},
		});
	}

	private _findGraphIslandView(): GraphViewInternal | null {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)) {
			const v = asGraphView(leaf);
			if (v) return v;
		}
		return null;
	}

	onunload() {
		this.timers.clearAll();
	}

	// Snapshots live in a sidecar file (data-snapshots.json) to keep data.json
	// small and loadSettings() fast. Without this separation, data.json grows
	// unbounded (~6MB+) and loadData() becomes a multi-second blocker on startup.
	private _snapshotsSidecarPath(): string {
		return `${this.manifest.dir ?? ".obsidian/plugins/graph-island"}/data-snapshots.json`;
	}

	async loadSettings() {
		const raw = (await this.loadData()) as Record<string, unknown> | null;
		let migrationSnapshots: unknown[] | null = null;
		if (raw && Array.isArray((raw as any).snapshots) && (raw as any).snapshots.length > 0) {
			// One-time migration: move embedded snapshots to sidecar file.
			migrationSnapshots = (raw as any).snapshots;
			delete (raw as any).snapshots;
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
		this._snapshotsLoaded = false;

		if (migrationSnapshots) {
			try {
				await this.app.vault.adapter.write(
					this._snapshotsSidecarPath(),
					JSON.stringify(migrationSnapshots),
				);
				this.settings.snapshots = [];
				await this.saveData(this.settings); // rewrite data.json without snapshots
				this.settings.snapshots = migrationSnapshots as any;
				this._snapshotsLoaded = true;
			} catch {
				// If migration write fails, restore in-memory for this session
				this.settings.snapshots = migrationSnapshots as any;
				this._snapshotsLoaded = true;
			}
		}
	}

	/** Lazily load snapshots from sidecar file into settings.snapshots. */
	async ensureSnapshotsLoaded(): Promise<void> {
		if (this._snapshotsLoaded) return;
		const path = this._snapshotsSidecarPath();
		try {
			const exists = await this.app.vault.adapter.exists(path);
			if (exists) {
				const txt = await this.app.vault.adapter.read(path);
				this.settings.snapshots = JSON.parse(txt);
			} else {
				this.settings.snapshots = [];
			}
		} catch {
			this.settings.snapshots = [];
		}
		this._snapshotsLoaded = true;
	}

	/** Persist snapshots to sidecar file (kept out of data.json for load speed). */
	async saveSnapshots(): Promise<void> {
		try {
			await this.app.vault.adapter.write(
				this._snapshotsSidecarPath(),
				JSON.stringify(this.settings.snapshots ?? []),
			);
		} catch {
			// swallow — caller will retry or surface to user
		}
	}

	async saveSettings() {
		// Persist snapshots separately (if loaded), then strip before writing data.json.
		const snapshots = this.settings.snapshots;
		if (this._snapshotsLoaded) {
			await this.saveSnapshots();
		}
		// Temporarily remove snapshots field so data.json stays small
		const hadSnapshots = this.settings.snapshots !== undefined;
		if (hadSnapshots) this.settings.snapshots = undefined as any;
		await this.saveData(this.settings);
		if (hadSnapshots) this.settings.snapshots = snapshots;
		// Notify all graph views to rebuild with updated settings
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)) {
			const view = asGraphView(leaf);
			if (view?.rawData !== undefined) {
				view.rawData = null;
				view.doRender?.();
			}
		}
	}

	async activateView() {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_GRAPH,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);

		// Open the detail pane in the right sidebar if not already open
		this.ensureDetailPane();
	}

	/**
	 * On first load, scan the vault to detect tag co-occurrence patterns
	 * and generate tag-to-tag relationships as a starting preset.
	 * Runs only when ontology.tagRelations is empty (never overwrites user edits).
	 */
	private async autoDetectTagRelationsIfNeeded() {
		const ontology = this.settings.ontology;
		if (!ontology || (ontology.tagRelations && ontology.tagRelations.length > 0)) {
			return; // already has relations — respect user's configuration
		}

		const detected = detectTagRelations(this.app);
		if (detected.length === 0) return;

		if (!this.settings.ontology) {
			this.settings.ontology = { ...DEFAULT_SETTINGS.ontology };
		}
		this.settings.ontology.tagRelations = detected;
		await this.saveSettings();
	}

	/**
	 * Open a new graph tab pre-filtered to a subgraph.
	 */
	async openSubgraphInNewTab(nodeIds: string[], viewMode: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf("split");
		await leaf.setViewState({
			type: VIEW_TYPE_GRAPH,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
		// Configure the new view after creation
		this.timers.setTimeout(() => {
			const view = asGraphView(leaf);
			if (view?.panel) {
				view.panel.subgraphNodeIds = [...nodeIds];
				view.panel.viewMode = viewMode;
				view.panel.multiSelectNodeIds = [];
				view.panel.subgraphStack = [];
				view.rawData = null;
				view.doRender?.();
			}
		}, 100);
	}

	private ensureDetailPane() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NODE_DETAIL);
		if (existing.length > 0) return;

		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			rightLeaf.setViewState({ type: VIEW_TYPE_NODE_DETAIL, active: true });
		}
	}

	/** 比較パネルが未オープンなら右サイドバーに開く */
	private ensureComparePane() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NODE_COMPARE);
		if (existing.length > 0) return;

		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			rightLeaf.setViewState({ type: VIEW_TYPE_NODE_COMPARE, active: true });
		}
	}
}
