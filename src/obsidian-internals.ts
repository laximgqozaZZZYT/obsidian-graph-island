/**
 * Type declarations for Obsidian internal APIs that are not part of the public type definitions.
 * These are accessed at runtime but not exported in obsidian.d.ts.
 *
 * Approach: TypeScript module augmentation extends Obsidian's public types with the optional
 * internal members we touch. This eliminates `as unknown as X` casts entirely — accessors are
 * type-checked directly against the augmented declarations.
 */
import type { App, EventRef, Vault, View, WorkspaceLeaf } from "obsidian";

// ---------------------------------------------------------------------------
// Module augmentation: extend Obsidian's public types with optional internal APIs.
// ---------------------------------------------------------------------------

declare module "obsidian" {
	interface App {
		plugins?: {
			plugins?: Record<string, { api?: unknown }>;
		};
		commands?: {
			executeCommandById(id: string): void;
		};
	}

	interface Workspace {
		// Custom (non-standard) event names use string keys; Obsidian's built-in
		// overloads remain preferred for known event names.
		on(name: string, callback: (...data: unknown[]) => void): EventRef;
		trigger(name: string, ...data: unknown[]): void;
	}

	interface Vault {
		getAvailablePath?: (basePath: string, extension: string) => string;
		config?: { attachmentFolderPath?: string };
	}
}

// ---------------------------------------------------------------------------
// Window globals injected by Obsidian / runtime.
// ---------------------------------------------------------------------------

declare global {
	interface Window {
		moment?: {
			locale: () => string;
		};
		app?: App;
		Notice: new (message: string, timeout?: number) => unknown;
	}
}

// ---------------------------------------------------------------------------
// Obsidian internal view access
// ---------------------------------------------------------------------------

/** Minimal interface for accessing Graph Island view internals from main.ts commands. */
export interface GraphViewInternal {
	panel: Record<string, unknown> & {
		focusMode?: boolean;
		showGraphStats?: boolean;
		showArrows?: boolean;
		analysisOverlay?: string;
		subgraphNodeIds?: string[];
		viewMode?: string;
		multiSelectNodeIds?: string[];
		subgraphStack?: unknown[];
	};
	panelEl?: HTMLElement;
	rawData?: unknown;
	doRender?: () => void;
	markDirty?: (full?: boolean) => void;
	_toggleHelpOverlay?: () => void;
	copyGraphToClipboard?: () => void;
	exportFullGraph?: () => void;
	exportGraphAsCSV?: () => void;
	exportGraphAsMermaid?: () => void;
	embedGraphInNote?: () => Promise<void>;
	applyPresetByKey?: (key: string) => void;
}

/** Obsidian search view with optional `setQuery` method (internal, not in public types). */
export interface ObsidianSearchView {
	setQuery?: (q: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers — identity functions retained for stable call-site API.
// Module augmentation above makes the underlying types match without casts.
// ---------------------------------------------------------------------------

/** Returns the App as-is; augmentation gives access to internal `plugins` / `commands`. */
export function asInternalApp(app: App): App {
	return app;
}

/** Returns the Workspace as-is; augmentation adds string-keyed `on` / `trigger` overloads. */
export function asInternalWorkspace(workspace: import("obsidian").Workspace): import("obsidian").Workspace {
	return workspace;
}

/** Returns the Vault as-is; augmentation exposes `getAvailablePath` / `config`. */
export function asInternalVault(vault: Vault): Vault {
	return vault;
}

/** Returns the global window with Obsidian-injected globals (`moment`, `app`, `Notice`). */
export function asObsidianWindow(): Window {
	return window;
}

/** Type guard: a leaf's view is a Graph Island view (sentinel: presence of `pixiNodes`). */
function isGraphViewLike(view: unknown): view is GraphViewInternal {
	return typeof view === "object" && view !== null && "pixiNodes" in view;
}

/** Access a leaf's view as a Graph Island view. Returns null for non-Graph-Island views. */
export function asGraphView(leaf: WorkspaceLeaf): GraphViewInternal | null {
	return isGraphViewLike(leaf.view) ? leaf.view : null;
}

/** Access a leaf's view as an Obsidian search view (internal API, not in public types). */
export function asSearchView(view: View): View & ObsidianSearchView {
	return view;
}
