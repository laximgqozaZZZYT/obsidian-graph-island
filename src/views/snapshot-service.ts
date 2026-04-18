// ---------------------------------------------------------------------------
// snapshot-service.ts — pure orchestration helpers for graph snapshots.
// ---------------------------------------------------------------------------
// Extracted from GraphViewContainer so the DOM-free flow (serialize / restore /
// auto-snap bookkeeping) can be unit-tested without Obsidian.
// ---------------------------------------------------------------------------

import type { GraphData, GraphSnapshot, SnapshotEdge } from "../types";
import { captureSnapshot } from "../utils/snapshot";

/** Auto-snapshot name prefix (shared with SnapshotManager for backward compat). */
export const AUTO_SNAP_PREFIX = "[auto] ";

/** Maximum number of auto-snapshots to retain. */
export const AUTO_SNAP_MAX = 10;

/** Context fields that travel with a snapshot. */
export interface SnapshotContext {
	layout: string;
	searchQuery: string;
	groupBy: string;
}

/** Lightweight state recovered from a snapshot (fingerprint only). */
export interface RestoredSnapshotState {
	nodes: Array<{ id: string }>;
	edges: Array<{ source: string; target: string; type: string }>;
	context: GraphSnapshot["context"];
	name: string;
	createdAt: string;
	notes?: string;
}

/**
 * Serialize the current graph state into a snapshot.
 * Returns null when data is missing or malformed so callers can skip persistence.
 */
export function serializeState(
	data: GraphData | null | undefined,
	name: string,
	context: SnapshotContext,
): GraphSnapshot | null {
	if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
	return captureSnapshot(data, name, context);
}

/**
 * Restore the lightweight state captured in a snapshot. Returns null for null/undefined.
 * The returned shape is intentionally partial — snapshots store fingerprints, not full metadata.
 */
export function restoreState(snapshot: GraphSnapshot | null | undefined): RestoredSnapshotState | null {
	if (!snapshot) return null;
	const nodes = (snapshot.nodes ?? []).map((n) => ({ id: n.id }));
	const edges: Array<{ source: string; target: string; type: string }> = (snapshot.edges ?? []).map(
		(e: SnapshotEdge) => ({ source: e.source, target: e.target, type: e.type }),
	);
	return {
		nodes,
		edges,
		context: snapshot.context,
		name: snapshot.name,
		createdAt: snapshot.createdAt,
		notes: snapshot.notes,
	};
}

/**
 * Build the canonical auto-snapshot name for a given moment.
 * Format: `[auto] YYYY-MM-DD HH:MM` (UTC, matches legacy behavior).
 */
export function buildAutoSnapshotName(date: Date = new Date()): string {
	return AUTO_SNAP_PREFIX + date.toISOString().replace("T", " ").slice(0, 16);
}

/**
 * Prune the oldest auto-snapshots in place until fewer than `max` remain.
 * Manual snapshots (no prefix) are left untouched.
 */
export function pruneAutoSnapshots(
	snapshots: GraphSnapshot[],
	max: number = AUTO_SNAP_MAX,
	prefix: string = AUTO_SNAP_PREFIX,
): GraphSnapshot[] {
	const autoSnaps = snapshots.filter((s) => s.name.startsWith(prefix));
	while (autoSnaps.length >= max) {
		const oldest = autoSnaps.shift();
		if (!oldest) break;
		const idx = snapshots.indexOf(oldest);
		if (idx >= 0) snapshots.splice(idx, 1);
	}
	return snapshots;
}

/**
 * Append a new auto-snapshot to `snapshots`, pruning older entries first.
 * Returns the created snapshot, or null if data is missing.
 */
export function appendAutoSnapshot(
	snapshots: GraphSnapshot[],
	data: GraphData | null | undefined,
	context: SnapshotContext,
	now: Date = new Date(),
): GraphSnapshot | null {
	pruneAutoSnapshots(snapshots);
	const snap = serializeState(data, buildAutoSnapshotName(now), context);
	if (!snap) return null;
	snapshots.push(snap);
	return snap;
}
