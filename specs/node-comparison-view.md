# Node Comparison View Specification

## Overview
- Purpose: Allow users to select exactly 2 nodes (Ctrl+click) and display a comparison panel showing shared/unique neighbors, shared tags/categories, shortest path, and visual highlighting on the graph canvas.
- Status: Draft
- Version: 1.0.0
- Last Updated: 2026-03-17
- Author: vow-spec-architect

## Architecture Summary

The feature adds **multi-select** capability (max 2 nodes) to `InteractionManager`, a new **`NodeComparisonView`** sidebar pane (registered like `NodeDetailView`), and comparison highlight integration into the existing `RenderPipeline`.

No new files for graph algorithms -- all computation uses the existing `adj` map (BFS) and `GraphNode.tags`/`GraphNode.category` fields already present.

```
User Ctrl+clicks 2 nodes
  -> InteractionManager tracks selectedNodeIds (Set, max 2)
  -> GraphViewContainer fires EVENT_COMPARE_NODES workspace event
  -> NodeComparisonView receives event, computes comparison, renders panel
  -> NodeComparisonView fires EVENT_HIGHLIGHT_NODES for visual feedback on canvas
```

## Requirements

### Functional Requirements
- [FR-001] User Ctrl+clicks a node to add it to a "comparison selection" (max 2 nodes). Visual ring indicator on selected nodes.
- [FR-002] When exactly 2 nodes are selected, auto-open the comparison panel (if not already open) and compute comparison data.
- [FR-003] Comparison panel displays: (a) shared neighbors, (b) unique neighbors of node A, (c) unique neighbors of node B, (d) shared tags, (e) shared categories, (f) shortest path length and path nodes.
- [FR-004] Clicking a node name in the comparison panel opens the file. Hovering highlights it on the graph.
- [FR-005] A "Clear" button in the comparison panel deselects both nodes.
- [FR-006] Selecting a 3rd node via Ctrl+click replaces the oldest selection (FIFO).
- [FR-007] Non-Ctrl click clears the comparison selection (existing behavior: clearAllHolds).
- [FR-008] Shortest path uses existing BFS on `adj` map (same as pathfinder).

### Non-Functional Requirements
- [NFR-001] Comparison computation must complete in < 50ms for graphs up to 5000 nodes.
- [NFR-002] No new npm dependencies.
- [NFR-003] All user-facing strings go through `i18n.ts` (t() function).

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `src/views/InteractionManager.ts` | Add `selectedForCompare: string[]` (max 2), update `handlePointerUp` Ctrl+click branch |
| `src/views/InteractionManager.ts` | Add `InteractionHost.notifyCompare(nodeIds: string[])` to host interface |
| `src/views/GraphViewContainer.ts` | Implement `notifyCompare()`, fire `EVENT_COMPARE_NODES`, expose `getAdj()` / `getPixiNodes()` publicly (already has `getPixiNodes` on InteractionHost) |
| `src/views/GraphViewContainer.ts` | Add comparison highlight ring drawing (reuse pathfinder ring style) |
| `src/views/RenderPipeline.ts` | Add `getCompareNodeIds(): string[]` to RenderHost, draw selection rings for compared nodes |
| `src/constants.ts` | Add `EVENT_COMPARE_NODES` constant |
| `src/i18n.ts` | Add comparison panel strings |
| `src/main.ts` | Register `NodeComparisonView` |
| `styles.css` | Add `.gi-compare-*` CSS classes |

### Files to Create

| File | Purpose |
|------|---------|
| `src/views/NodeComparisonView.ts` | New ItemView sidebar pane -- comparison panel UI and computation logic |

### Data Structures

```typescript
// Emitted with EVENT_COMPARE_NODES
interface CompareEvent {
  nodeA: GraphNode;
  nodeB: GraphNode;
  adj: Map<string, Set<string>>;
  pixiNodes: Map<string, PixiNode>;
}

// Computed inside NodeComparisonView
interface ComparisonResult {
  sharedNeighbors: string[];      // node IDs connected to BOTH
  uniqueToA: string[];            // node IDs connected only to A
  uniqueToB: string[];            // node IDs connected only to B
  sharedTags: string[];           // tags present on both nodes
  uniqueTagsA: string[];          // tags only on A
  uniqueTagsB: string[];          // tags only on B
  sharedCategories: string[];     // categories matching (usually 0 or 1)
  shortestPath: string[] | null;  // BFS path (null = no path)
  pathLength: number;             // -1 if no path
}
```

### Computation Logic (in NodeComparisonView)

```
computeComparison(nodeA, nodeB, adj):
  neighborsA = adj.get(nodeA.id) ?? empty
  neighborsB = adj.get(nodeB.id) ?? empty
  shared     = intersection(neighborsA, neighborsB) - {nodeA.id, nodeB.id}
  uniqueToA  = neighborsA - neighborsB - {nodeB.id}
  uniqueToB  = neighborsB - neighborsA - {nodeA.id}

  tagsA = new Set(nodeA.tags ?? [])
  tagsB = new Set(nodeB.tags ?? [])
  sharedTags = intersection(tagsA, tagsB)

  shortestPath = BFS(adj, nodeA.id, nodeB.id)  // copy of existing computePathfinderPath logic
```

### UI Layout Design

The comparison panel is a new Obsidian `ItemView` in the right sidebar, similar to `NodeDetailView`.

```
+---------------------------------------------+
| [Compare icon]  Node Comparison    [X Clear] |
+---------------------------------------------+
| A: "Character Alpha"     B: "Character Beta" |
| #protagonist, #hero       #antagonist         |
+---------------------------------------------+
| Shortest Path: 3 hops (A -> C -> D -> B)     |
|   [clickable path node list]                  |
+---------------------------------------------+
| > Shared Neighbors (5)                        |
|   - Node X                                    |
|   - Node Y  ...                               |
+---------------------------------------------+
| > Unique to A (12)                            |
|   - Node M  ...                               |
+---------------------------------------------+
| > Unique to B (8)                             |
|   - Node N  ...                               |
+---------------------------------------------+
| > Shared Tags (2): #fantasy, #main-cast       |
| > Shared Category: protagonist                |
+---------------------------------------------+
```

Each section is a collapsible `<details>` element (reuse `gi-detail-collapsible` pattern from NodeDetailView). Node names are clickable (open file) and hoverable (highlight on graph via `EVENT_HIGHLIGHT_NODES`).

### Visual Highlighting on Graph

When 2 nodes are compared:
1. **Selection rings**: Both selected nodes get a distinctive ring (dashed stroke, accent color). Drawn in RenderPipeline alongside pathfinder rings.
2. **Shared neighbor highlight**: When hovering "Shared Neighbors" section header, all shared neighbors + both selected nodes highlight on graph.
3. **Path highlight**: Reuse existing `pathfinderPath` overlay drawing. When comparison is active, auto-set pathfinder start/end to the two compared nodes.

### Integration Points

**1. InteractionManager.handlePointerUp (Ctrl+click branch)**

Current code at line 418:
```typescript
if (!e.ctrlKey && !e.metaKey) {
  this.host.clearAllHolds();
}
this.host.toggleHold(node);
```

Modified logic:
```typescript
if (e.ctrlKey || e.metaKey) {
  // Add to comparison selection
  this.host.addCompareNode(node.data.id);
  // Also toggle hold as before
  this.host.toggleHold(node);
} else {
  this.host.clearAllHolds();
  this.host.clearCompareSelection();
  this.host.toggleHold(node);
}
```

**2. InteractionHost interface additions**

```typescript
addCompareNode(nodeId: string): void;
clearCompareSelection(): void;
getCompareNodeIds(): string[];
```

**3. GraphViewContainer implementation**

```typescript
private compareNodeIds: string[] = [];

addCompareNode(nodeId: string) {
  // Remove if already selected (toggle)
  const idx = this.compareNodeIds.indexOf(nodeId);
  if (idx >= 0) {
    this.compareNodeIds.splice(idx, 1);
  } else {
    if (this.compareNodeIds.length >= 2) {
      this.compareNodeIds.shift(); // FIFO: remove oldest
    }
    this.compareNodeIds.push(nodeId);
  }
  this.notifyCompare();
  this.markDirty(true);
}

clearCompareSelection() {
  this.compareNodeIds = [];
  this.notifyCompare();
  this.markDirty(true);
}

private notifyCompare() {
  if (this.compareNodeIds.length === 2) {
    const a = this.pixiNodes.get(this.compareNodeIds[0]);
    const b = this.pixiNodes.get(this.compareNodeIds[1]);
    if (a && b) {
      this.app.workspace.trigger(EVENT_COMPARE_NODES, {
        nodeA: a.data, nodeB: b.data,
        adj: this.adj, pixiNodes: this.pixiNodes,
      });
      // Also set pathfinder for visual path overlay
      this.setPathfinderNode(this.compareNodeIds[0], "start");
      this.setPathfinderNode(this.compareNodeIds[1], "end");
    }
  } else {
    this.app.workspace.trigger(EVENT_COMPARE_NODES, null);
    this.clearPathfinder();
  }
}

getCompareNodeIds(): string[] {
  return this.compareNodeIds;
}
```

**4. RenderPipeline -- selection ring drawing**

In the node drawing pass, check `host.getCompareNodeIds()`. For matched nodes, draw a dashed ring (distinct from hold ring and pathfinder ring). Use a different color or dash pattern (e.g., alternating accent + white dashes).

**5. NodeComparisonView registration (main.ts)**

```typescript
this.registerView(VIEW_TYPE_NODE_COMPARE, (leaf) => new NodeComparisonView(leaf));
```

Add a ribbon icon or make it auto-open when comparison is triggered (similar to NodeDetailView auto-open logic in main.ts line ~73).

**6. Constants**

```typescript
export const EVENT_COMPARE_NODES = "graph-island:compare-nodes" as const;
export const VIEW_TYPE_NODE_COMPARE = "graph-node-compare";
```

## Implementation Tasks

Ordered by dependency. Tasks marked with [PARALLEL] can be done simultaneously.

- [ ] **Task 1**: Add constants (`EVENT_COMPARE_NODES`, `VIEW_TYPE_NODE_COMPARE`) to `src/constants.ts`
- [ ] **Task 2**: Add i18n strings for comparison panel to `src/i18n.ts` (compare.title, compare.sharedNeighbors, compare.uniqueTo, compare.sharedTags, compare.shortestPath, compare.clear, compare.noPath, compare.selectHint)
- [ ] **Task 3** [PARALLEL with 1,2]: Add `InteractionHost` interface methods (`addCompareNode`, `clearCompareSelection`, `getCompareNodeIds`)
- [ ] **Task 4**: Implement `compareNodeIds` state + `addCompareNode`/`clearCompareSelection`/`notifyCompare` in `GraphViewContainer.ts`
- [ ] **Task 5**: Modify `InteractionManager.handlePointerUp` to call `addCompareNode` on Ctrl+click instead of just `toggleHold`
- [ ] **Task 6**: Create `src/views/NodeComparisonView.ts` -- full sidebar panel with comparison computation and UI rendering
- [ ] **Task 7**: Register `NodeComparisonView` in `src/main.ts` and add auto-open logic when `EVENT_COMPARE_NODES` fires with 2 nodes
- [ ] **Task 8**: Add `getCompareNodeIds()` to `RenderHost` interface in `RenderPipeline.ts` and draw selection rings for compared nodes
- [ ] **Task 9**: Add `.gi-compare-*` CSS styles to `styles.css`
- [ ] **Task 10**: Integration test -- verify Ctrl+click 2 nodes triggers panel, path overlay, and highlight interactions

## Acceptance Criteria

- [AC-001] Ctrl+clicking 2 different nodes opens the comparison panel showing shared/unique neighbors.
- [AC-002] Shared tags and categories are correctly computed and displayed.
- [AC-003] Shortest path is displayed with hop count; clicking path nodes opens files.
- [AC-004] Hovering neighbor names in the panel highlights corresponding nodes on the graph canvas.
- [AC-005] Clicking "Clear" deselects both nodes, closes path overlay, and resets the panel.
- [AC-006] Ctrl+clicking a 3rd node replaces the oldest selection (FIFO) and recomputes.
- [AC-007] Non-Ctrl single click clears the comparison selection.
- [AC-008] Selection rings are visually distinct from hold rings and pathfinder rings.
- [AC-009] Works correctly with grouped/collapsed nodes (super nodes are excluded from comparison).
- [AC-010] All strings are localized via `t()`.

## Agent Coordination Notes

- **NodeComparisonView (Task 6)** is the largest task (~300-400 lines). It follows the exact same patterns as `NodeDetailView.ts` -- use that as the template. Key differences: it receives 2 nodes instead of 1, and computes set operations instead of just listing neighbors.
- **Do not refactor** existing pathfinder code. Reuse it by calling `setPathfinderNode()` from `notifyCompare()`. The pathfinder overlay drawing already works.
- **BFS for shortest path**: Copy the BFS logic from `GraphViewContainer.computePathfinderPath()` into a standalone function in `NodeComparisonView` (or call it through the event data). The pathfinder auto-set in `notifyCompare()` handles the visual overlay, but the panel needs the path node list for display.
- **CSS**: Follow naming convention `gi-compare-*`. Reuse existing `gi-detail-*` and `gi-ni-*` utility classes where applicable.
- **The `adj` map** is passed via the workspace event (same pattern as `EVENT_HOVER_NODE`). No need to expose it via a new getter.
- **Existing Ctrl+click behavior** currently only affects hold (pin) toggling. The new comparison selection is additive -- nodes are both held AND added to comparison. This is intentional so the visual pin indicator also shows.
