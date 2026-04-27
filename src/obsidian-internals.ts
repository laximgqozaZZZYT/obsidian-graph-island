/**
 * Type declarations for Obsidian internal APIs that are not part of the public type definitions.
 * These are accessed at runtime but not exported in obsidian.d.ts.
 *
 * Using explicit interfaces instead of `as any` for better type safety.
 */
import type { App, Vault, View, Workspace, WorkspaceLeaf } from "obsidian";

// ---------------------------------------------------------------------------
// Obsidian internal App extensions
// ---------------------------------------------------------------------------

/** Obsidian App with internal plugin registry access. */
interface ObsidianAppInternal extends App {
	plugins?: {
		plugins?: Record<string, { api?: unknown }>;
	};
	commands?: {
		executeCommandById(id: string): void;
	};
}

// ---------------------------------------------------------------------------
// Obsidian internal Workspace extensions (custom events)
// ---------------------------------------------------------------------------

/** Workspace with custom event support (non-standard event names). */
interface ObsidianWorkspaceInternal {
	on(name: string, callback: (...data: unknown[]) => void): import("obsidian").EventRef;
	trigger(name: string, ...data: unknown[]): void;
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

// ---------------------------------------------------------------------------
// Window globals injected by Obsidian
// ---------------------------------------------------------------------------

/** Window with Obsidian injected globals. */
interface ObsidianWindow extends Window {
	moment?: {
		locale: () => string;
	};
	app?: App;
	Notice: new (message: string, timeout?: number) => unknown;
}

// ---------------------------------------------------------------------------
// Obsidian internal Vault extensions
// ---------------------------------------------------------------------------

/** Vault with internal methods for attachment path resolution. */
interface ObsidianVaultInternal extends Vault {
	getAvailablePath?: (basePath: string, extension: string) => string;
	config?: { attachmentFolderPath?: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast App to internal variant for accessing private APIs. */
export function asInternalApp(app: App): ObsidianAppInternal {
	return app as unknown as ObsidianAppInternal;
}

/** Cast Workspace to internal variant for custom events. */
export function asInternalWorkspace(workspace: Workspace): ObsidianWorkspaceInternal {
	return workspace as unknown as ObsidianWorkspaceInternal;
}

/** Cast Vault to internal variant for attachment-path resolution. */
export function asInternalVault(vault: Vault): ObsidianVaultInternal {
	return vault as unknown as ObsidianVaultInternal;
}

/** Obsidian search view with optional `setQuery` method. */
export interface ObsidianSearchView {
	setQuery?: (q: string) => void;
}

/** Access a leaf's view as an Obsidian search view (internal API, not in public types). */
export function asSearchView(view: View): ObsidianSearchView {
	return view as unknown as ObsidianSearchView;
}

/** Cast window to Obsidian-augmented window. */
export function asObsidianWindow(): ObsidianWindow {
	return window as unknown as ObsidianWindow;
}

/** Access a leaf's view as a Graph Island view with internal properties. Returns null for non-Graph-Island views (e.g. Obsidian built-in graph). */
export function asGraphView(leaf: WorkspaceLeaf): GraphViewInternal | null {
	const view = leaf.view;
	if (!view || !("pixiNodes" in view)) return null;
	return view as unknown as GraphViewInternal;
}

// ---------------------------------------------------------------------------
// Internal sub-component host casts (compile-time only)
// ---------------------------------------------------------------------------

/**
 * Cast `this`/value to a sub-component host interface.
 * Used where the host interface is structurally compatible but the type system
 * cannot prove it (e.g. circular type imports or `this` binding).
 */
export function asHost<T>(value: unknown): T {
	return value as T;
}

/** Get a workspace leaf's internal id (not in public Obsidian types). */
export function getLeafId(leaf: WorkspaceLeaf): string {
	return (leaf as unknown as { id: string }).id;
}

/** Cast a panel-state object to Record<string, unknown> for dynamic key access. */
export function panelAsRecord(panel: object): Record<string, unknown> {
	return panel as Record<string, unknown>;
}

/** Convert browser/node setTimeout return to number for storage in number-typed fields. */
export function asTimerId(id: unknown): number {
	return id as number;
}
