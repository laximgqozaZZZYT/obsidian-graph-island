# Graph Snapshot Diff Specification

## Overview
- **Purpose**: Allow users to save named snapshots of the current graph state, then visually compare the live graph against any saved snapshot to see structural changes (added/removed nodes, added/removed edges, metadata changes).
- **Status**: Draft
- **Version**: 1.0.0
- **Last Updated**: 2026-03-17
- **Author**: vow-spec-architect

## Requirements

### Functional Requirements
- [FR-001] User can save the current graph state as a named snapshot via a toolbar button
- [FR-002] User can list, rename, and delete saved snapshots from a dropdown/modal
- [FR-003] User can select a snapshot to diff against the current graph
- [FR-004] Diff overlay highlights new nodes with green fill/stroke
- [FR-005] Diff overlay shows removed nodes as ghost/gray semi-transparent nodes at approximate positions
- [FR-006] Diff overlay draws new edges as green lines
- [FR-007] Diff overlay draws removed edges as red dashed lines (between surviving or ghost nodes)
- [FR-008] Diff overlay highlights nodes with changed metadata using yellow ring
- [FR-009] User can dismiss the diff overlay with a single click/button
- [FR-010] Maximum 10 snapshots per vault; saving an 11th prompts deletion of the oldest

### Non-Functional Requirements
- [NFR-001] Snapshot data must be lightweight: node IDs + edge source/target pairs + metadata hashes only (no positions, no full metadata values)
- [NFR-002] Snapshots stored in plugin settings (`GraphViewsSettings`) via `saveData()`
- [NFR-003] Diff computation must complete in < 50ms for graphs up to 5000 nodes
- [NFR-004] Diff overlay must not interfere with existing interaction (hover, click, drag) on unchanged nodes
- [NFR-005] Must work with Canvas2D rendering pipeline (no WebGL dependency)

---

## Technical Design

### 1. Data Structures

All new types go in `src/types.ts`.

```typescript
/** Lightweight fingerprint of a single node at snapshot time. */
export interface SnapshotNode {
  id: string;
  /** Hash of JSON.stringify(sorted meta keys+values). Empty string if no meta. */
  metaHash: string;
}

/** Lightweight fingerprint of a single edge at snapshot time. */
export interface SnapshotEdge {
  source: string;
  target: string;
  type: string; // EdgeType serialised
}

/** A saved graph snapshot. */
export interface GraphSnapshot {
  /** User-chosen or auto-generated name */
  name: string;
  /** ISO-8601 timestamp */
  createdAt: string;
  /** Node fingerprints */
  nodes: SnapshotNode[];
  /** Edge fingerprints */
  edges: SnapshotEdge[];
  /** Panel state summary for context (layout, searchQuery, groupBy) — informational only */
  context: {
    layout: string;
    searchQuery: string;
    groupBy: string;
    nodeCount: number;
    edgeCount: number;
  };
}

/** Result of diffing current graph against a snapshot. */
export interface SnapshotDiff {
  /** Node IDs present in current graph but not in snapshot */
  addedNodeIds: Set<string>;
  /** SnapshotNodes present in snapshot but not in current graph */
  removedNodes: SnapshotNode[];
  /** Node IDs present in both but with different metaHash */
  changedNodeIds: Set<string>;
  /** Edges present in current but not in snapshot (keyed as "source->target->type") */
  addedEdgeKeys: Set<string>;
  /** SnapshotEdges present in snapshot but not in current */
  removedEdges: SnapshotEdge[];
}
```

**Settings extension** (added to `GraphViewsSettings`):

```typescript
// in GraphViewsSettings interface:
/** Saved graph snapshots (max 10) */
snapshots?: GraphSnapshot[];
```

**DEFAULT_SETTINGS extension**:

```typescript
// add to DEFAULT_SETTINGS:
snapshots: [],
```

### 2. Snapshot Capture (`src/utils/snapshot.ts` — new file)

```
captureSnapshot(data: GraphData, name: string, panelState: PanelState): GraphSnapshot
```

- Iterates `data.nodes`, creates `SnapshotNode` with `metaHash = hashMeta(node.meta)`
- Iterates `data.edges`, creates `SnapshotEdge` with source/target/type
- Records context from panelState
- Returns `GraphSnapshot`

**`hashMeta(meta: Record<string, unknown> | undefined): string`**
- If undefined/null/empty: return `""`
- Sort keys alphabetically, `JSON.stringify()` the sorted entries, return a simple FNV-1a 32-bit hash as hex string
- FNV-1a is fast, no crypto needed (this is a change-detection hash, not security)

### 3. Diff Algorithm (`src/utils/snapshot.ts`)

```
computeSnapshotDiff(current: GraphData, snapshot: GraphSnapshot): SnapshotDiff
```

**Algorithm**:
1. Build `Map<string, SnapshotNode>` from snapshot nodes (keyed by id)
2. Build `Set<string>` of snapshot edge keys (`"${source}->${target}->${type}"`)
3. Iterate current nodes:
   - If id not in snapshot map: add to `addedNodeIds`
   - If id in snapshot map but `hashMeta(current.meta) !== snapshot.metaHash`: add to `changedNodeIds`
   - Mark id as "seen"
4. Iterate snapshot nodes: any unseen id goes to `removedNodes`
5. Build current edge key set, diff against snapshot edge keys for `addedEdgeKeys` and `removedEdges`

**Complexity**: O(N + E) where N = max(current nodes, snapshot nodes), E = max(current edges, snapshot edges)

### 4. Diff Overlay Rendering

The diff overlay is a **post-render pass** in `RenderPipeline`. It draws on the same Canvas2D context after the normal render completes.

**New file: `src/views/DiffOverlay.ts`**

```typescript
export class DiffOverlay {
  private diff: SnapshotDiff | null = null;
  private snapshotName: string = "";

  /** Activate diff mode with computed diff result */
  activate(diff: SnapshotDiff, snapshotName: string): void;

  /** Deactivate diff mode */
  deactivate(): void;

  /** Whether diff mode is active */
  isActive(): boolean;

  /**
   * Render diff highlights on top of existing graph.
   * Called from RenderPipeline after normal node/edge rendering.
   *
   * @param ctx        Canvas2D rendering context
   * @param nodes      Current PixiNode array (for position lookup)
   * @param nodeMap    Map<nodeId, PixiNode> for quick lookup
   * @param transform  Current camera transform {x, y, scale}
   */
  render(
    ctx: CanvasRenderingContext2D,
    nodes: PixiNode[],
    nodeMap: Map<string, PixiNode>,
    transform: { x: number; y: number; scale: number }
  ): void;
}
```

**Rendering rules**:

| Element | Visual Treatment |
|---------|-----------------|
| Added node | Green ring (2px stroke, `#22c55e` at 0.7 alpha) around existing node circle |
| Removed node | Gray filled circle (`#9ca3af` at 0.3 alpha) at center of viewport (clustered in a "removed" area, bottom-right corner) |
| Changed metadata | Yellow ring (2px stroke, `#eab308` at 0.7 alpha) around existing node circle |
| Added edge | Green line (`#22c55e`, 2px, solid) between existing nodes |
| Removed edge | Red dashed line (`#ef4444`, 1.5px, dash `[4,4]`) — only drawn if both endpoints exist as current or ghost nodes |

**Ghost node positioning**: Removed nodes have no position in the current graph. Strategy:
- Place them in a dedicated "ghost shelf" area at the bottom-right of the viewport
- Arrange in a grid layout with spacing proportional to node size
- Draw a subtle label beneath each ghost node showing its original label

### 5. UI Integration Points

#### 5a. Toolbar Button (`GraphViewContainer._initActionButtons`)

Add a **camera/snapshot** button after the existing export button in `_initActionButtons()`:

```
Icon: "bookmark" (Obsidian built-in Lucide icon)
Tooltip: t("toolbar.snapshot")
```

Click action: Opens a **snapshot menu** (Obsidian `Menu` component) with:
1. "Save snapshot..." -- prompts for name via `Notice` + simple text input modal
2. Separator
3. List of saved snapshots (up to 10), each as a submenu with:
   - "Compare with current" -- activates diff overlay
   - "Rename..."
   - "Delete"
4. Separator (if diff is active)
5. "Clear diff overlay" (if diff is active)

#### 5b. Diff Status Indicator

When diff is active, show a status bar message:
```
"Diff: vs '{snapshotName}' — {added} added, {removed} removed, {changed} changed"
```

Use the existing `this.statusEl` in the toolbar. Add a dismiss "x" icon button next to it.

#### 5c. Panel Integration (optional, Phase 2)

A dedicated "Snapshots" section could be added to the Settings tab in PanelBuilder. Deferred to Phase 2.

### 6. i18n Keys (`src/i18n.ts`)

Add under appropriate locale sections:

```
toolbar.snapshot: "Snapshots"
snapshot.save: "Save snapshot..."
snapshot.savePlaceholder: "Snapshot name"
snapshot.compare: "Compare with current"
snapshot.rename: "Rename..."
snapshot.delete: "Delete"
snapshot.clearDiff: "Clear diff overlay"
snapshot.diffStatus: "Diff: vs '{name}' — {added} added, {removed} removed, {changed} changed"
snapshot.limitReached: "Maximum 10 snapshots. Delete one first."
snapshot.saved: "Snapshot '{name}' saved"
snapshot.deleted: "Snapshot '{name}' deleted"
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/snapshot.ts` | `captureSnapshot()`, `computeSnapshotDiff()`, `hashMeta()` — pure functions, no DOM |
| `src/views/DiffOverlay.ts` | `DiffOverlay` class — Canvas2D rendering of diff highlights |

## Files to Modify

| File | Changes |
|------|---------|
| `src/types.ts` | Add `SnapshotNode`, `SnapshotEdge`, `GraphSnapshot`, `SnapshotDiff` interfaces; extend `GraphViewsSettings` with `snapshots` field; extend `DEFAULT_SETTINGS` |
| `src/views/GraphViewContainer.ts` | (1) Add `DiffOverlay` instance field. (2) Add snapshot toolbar button in `_initActionButtons()`. (3) Wire save/compare/delete actions. (4) Expose current `GraphData` to snapshot capture. (5) Pass `DiffOverlay` to `RenderPipeline` |
| `src/views/RenderPipeline.ts` | (1) Accept `DiffOverlay` reference. (2) Call `diffOverlay.render()` at end of `redrawNodeBatch()` after normal node/edge pass. (3) Build `nodeMap` for position lookup |
| `src/i18n.ts` | Add i18n keys for all snapshot-related strings |
| `src/main.ts` | No changes needed — settings persistence is already handled by `saveData()` |

---

## Implementation Tasks

Tasks are ordered by dependency. Tasks at the same level can be parallelized.

### Phase 1: Data Layer (no UI, pure functions)

- [ ] **T1.1** Add type definitions to `src/types.ts` — `SnapshotNode`, `SnapshotEdge`, `GraphSnapshot`, `SnapshotDiff`, settings extension
- [ ] **T1.2** Create `src/utils/snapshot.ts` with `hashMeta()`, `captureSnapshot()`, `computeSnapshotDiff()`
- [ ] **T1.3** Write unit tests for `hashMeta()`, `captureSnapshot()`, `computeSnapshotDiff()` with edge cases (empty graph, identical graphs, fully disjoint graphs)

### Phase 2: Diff Overlay Renderer (visual, no user interaction)

- [ ] **T2.1** Create `src/views/DiffOverlay.ts` with `activate()`, `deactivate()`, `isActive()`, `render()` (Prerequisite: T1.1)
- [ ] **T2.2** Integrate `DiffOverlay` into `RenderPipeline.redrawNodeBatch()` — call `render()` after normal passes (Prerequisite: T2.1)
- [ ] **T2.3** Add `DiffOverlay` instance to `GraphViewContainer`, pass to `RenderPipeline` (Prerequisite: T2.2)

### Phase 3: Toolbar UI and Wiring

- [ ] **T3.1** Add i18n keys to `src/i18n.ts` (Parallelizable with T2.x)
- [ ] **T3.2** Add snapshot toolbar button with `Menu` dropdown in `GraphViewContainer._initActionButtons()` (Prerequisite: T2.3, T3.1)
- [ ] **T3.3** Implement save-snapshot flow: text input modal, capture, persist to settings, enforce 10-snapshot limit (Prerequisite: T1.2, T3.2)
- [ ] **T3.4** Implement compare flow: compute diff, activate overlay, show status (Prerequisite: T1.2, T2.3, T3.2)
- [ ] **T3.5** Implement rename/delete actions (Prerequisite: T3.2)
- [ ] **T3.6** Implement "Clear diff" button and Escape key dismissal (Prerequisite: T3.4)

### Phase 4: Polish

- [ ] **T4.1** Ghost node layout algorithm — grid arrangement in bottom-right viewport area
- [ ] **T4.2** Edge case handling: diff against snapshot when layout/groupBy differs from snapshot time
- [ ] **T4.3** E2E test via CDP: save snapshot, modify vault, re-render, compare, verify overlay presence

---

## Acceptance Criteria

- [AC-001] Clicking "Save snapshot" with a name creates a snapshot persisted in plugin settings; reloading Obsidian preserves it
- [AC-002] Snapshot data size for a 2000-node graph is under 200KB in JSON
- [AC-003] "Compare with current" activates diff overlay showing green rings on new nodes within 1 render frame
- [AC-004] Removed nodes appear as gray ghost circles in a dedicated viewport area
- [AC-005] Added edges render as green solid lines; removed edges render as red dashed lines
- [AC-006] Changed-metadata nodes show a yellow ring
- [AC-007] Status bar shows diff summary with counts
- [AC-008] "Clear diff" or Escape dismisses overlay completely; graph returns to normal rendering
- [AC-009] 11th snapshot save is blocked with a notice (or prompts to delete oldest)
- [AC-010] Diff computation for 5000 nodes + 10000 edges completes in under 50ms

---

## Agent Coordination Notes

- **T1.x tasks** are fully isolated — pure TypeScript, no DOM or Canvas dependency. Ideal for a separate agent.
- **T2.x tasks** require understanding of `RenderPipeline` and Canvas2D context flow. The key integration point is the `redrawNodeBatch()` method which handles the per-frame render loop.
- **T3.x tasks** touch `GraphViewContainer` which is 170KB+. Read only the `_initActionButtons()` and `_initToolbar()` methods (lines ~394-500) and the `doRender()` method (line ~3300) for context.
- The `PixiNode` type is defined in `InteractionManager.ts` — it wraps `GraphNode` with canvas display objects. The `DiffOverlay` needs access to the `PixiNode[]` array to get screen positions.
- Settings persistence: `this.plugin.saveSettings()` calls `this.saveData(this.settings)`. The `snapshots` array will be serialized as part of the settings JSON. Keep snapshot data minimal to avoid bloating the settings file.
- The `meta` field on `GraphNode` is `Record<string, unknown>` populated from frontmatter. The hash function must handle nested objects and arrays deterministically (sort keys at all levels).
