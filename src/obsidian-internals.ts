/**
 * Type declarations for Obsidian internal APIs that are not part of the public type definitions.
 * These are accessed at runtime but not exported in obsidian.d.ts.
 *
 * Using explicit interfaces instead of `as any` for better type safety.
 */
import type { App, Vault, Workspace, WorkspaceLeaf } from "obsidian";

// ---------------------------------------------------------------------------
// Obsidian internal App extensions
// ---------------------------------------------------------------------------

/** Obsidian App with internal plugin registry access. */
export interface ObsidianAppInternal extends App {
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
export interface ObsidianWorkspaceInternal {
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
}

// ---------------------------------------------------------------------------
// Window globals injected by Obsidian
// ---------------------------------------------------------------------------

/** Window with Obsidian injected globals. */
export interface ObsidianWindow extends Window {
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
export interface ObsidianVaultInternal extends Vault {
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
