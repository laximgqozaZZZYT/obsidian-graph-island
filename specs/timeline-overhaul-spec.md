# Timeline Layout Overhaul Specification

## Overview
- **Purpose**: Replace the current flat column-stacking timeline arrangement with a structure-aware layout engine that respects sequential ordering, parent-child hierarchy, simultaneous events, branching narratives, cycles, and duration bars.
- **Status**: Draft
- **Version**: 1.0.0
- **Last Updated**: 2026-03-17
- **Author**: vow-spec-architect

## Problem Statement

The current `timelineOffsets()` pipeline in `src/layouts/cluster-force.ts` treats all nodes as a flat sorted list. It partitions nodes into timed/untimed, places timed nodes in X-columns by time value, and vertically stacks nodes sharing the same time value. Chain ordering (`buildLinkChainOrder`) and hierarchy ordering (`buildHierarchyOrder`) exist but only produce a flat DFS order that gets injected as synthetic `__chain_` / `__hier_` time values -- resulting in side-by-side placement regardless of the actual relationship type.

### Current limitations:
1. **Parent-child flattening**: `buildHierarchyOrder` does a DFS traversal and assigns sequential indices. Children of a parent end up placed left-to-right just like siblings, not below the parent.
2. **No branching visualization**: When a node has multiple `next` links (branching), `buildLinkChainOrder` follows only the first match. Diverging paths are invisible.
3. **No cycle detection**: Chain walking in `buildLinkChainOrder` uses a `visited` set to avoid infinite loops but does not mark the back-edge or render any visual cycle indicator.
4. **Simultaneous events stacked arbitrarily**: Multiple nodes at the same time value stack vertically but have no lane assignment logic -- they pile up in insertion order.
5. **Duration bars are post-hoc**: `TimelineBarInfo` is computed after placement as a visual overlay. It does not influence the spatial layout of other nodes.

## Requirements

### Functional Requirements

- [FR-001] Nodes connected by sequence fields (e.g. `next`/`prev`) MUST be placed side-by-side horizontally with uniform spacing, connected by horizontal sequence edges.
- [FR-002] Nodes connected by `story_order` within the same parent MUST be placed side-by-side horizontally, sorted by `story_order` ascending.
- [FR-003] When a node has a `parent_id` pointing to another node in the graph, the child node MUST be placed BELOW its parent, not beside it. The parent occupies the "lane row" and children form a sub-row beneath.
- [FR-004] When multiple independent sequences exist at the same time point (same `timelineKey` value), they MUST be placed in separate horizontal lanes stacked vertically, forming parallel tracks.
- [FR-005] When a node has multiple outgoing sequence links (branching), the layout MUST visually fork: the main trunk continues forward and each branch occupies a new parallel lane below, with a visible fork connector at the divergence point.
- [FR-006] When a sequence chain references a node already visited (cycle), the layout MUST detect the back-edge and emit a `CycleBackEdge` visual indicator (a curved return arrow rendered by `EdgeRenderer` or a dedicated overlay).
- [FR-007] Nodes with `start-date` and `end-date` MUST render a horizontal duration bar spanning from the start time-column X to the end time-column X. Duration bars MUST influence layout: other non-bar nodes in the same lane should be pushed below or above the bar, not overlap it.
- [FR-008] All layout parameters (lane height, fork angle, cycle arrow radius, bar height) MUST be configurable via `userConstants` -- no hardcoded magic numbers.
- [FR-009] The existing `timelineOrderFields` setting (`parent_id,story_order`) MUST continue to work. The overhaul extends behavior; it does not remove any existing configuration surface.
- [FR-010] The layout MUST produce `ArrangementResult` with the same interface shape (offsets, guide, bars, sequenceEdges, nodeChains) so downstream consumers (route rendering, road network, render pipeline) remain compatible.

### Non-Functional Requirements

- [NFR-001] Layout computation for 500 nodes with mixed hierarchy/sequence/branching MUST complete in < 100ms.
- [NFR-002] The implementation MUST NOT increase the bundle size by more than 5KB gzipped.
- [NFR-003] All new helper functions MUST be pure (no side effects, no mutation of input arrays) to enable unit testing.
- [NFR-004] The refactored code MUST be split into a dedicated module (`src/layouts/timeline-layout.ts`) to reduce the size of `cluster-force.ts` (currently ~3200 lines).

## Technical Design

### 1. Data Model

#### 1.1 Timeline Graph (intermediate representation)

Before placement, build a directed graph of timeline relationships from raw nodes:

```typescript
/** A node in the timeline structure graph */
interface TimelineNode {
  id: string;
  graphNode: GraphNode;
  /** Resolved time value (from timelineKey field), or null if untimed */
  timeValue: string | null;
  /** Numeric story_order within parent scope */
  storyOrder: number;
  /** Parent node ID (from parent_id field), or null if root */
  parentId: string | null;
  /** Start date for duration bar (from timelineKey or start-date) */
  startDate: string | null;
  /** End date for duration bar (from timelineEndKey) */
  endDate: string | null;
}

/** Directed edge in the timeline structure graph */
interface TimelineEdge {
  from: string;   // source node ID
  to: string;     // target node ID
  type: "sequence" | "hierarchy" | "branch";
}

/** The full intermediate representation */
interface TimelineGraph {
  nodes: Map<string, TimelineNode>;
  edges: TimelineEdge[];
  /** Detected chains (linear sequences) */
  chains: TimelineChain[];
  /** Detected cycles (back-edges) */
  cycles: CycleBackEdge[];
  /** Hierarchy trees (parent -> children) */
  hierarchies: HierarchyTree[];
}

/** A linear chain of nodes connected by sequence links */
interface TimelineChain {
  /** Ordered node IDs from head to tail */
  nodeIds: string[];
  /** ID of the chain (for lane assignment) */
  chainId: string;
}

/** A back-edge indicating a cycle */
interface CycleBackEdge {
  fromId: string;
  toId: string;
  /** The chain this cycle belongs to */
  chainId: string;
}

/** A tree rooted at a parent node */
interface HierarchyTree {
  rootId: string;
  children: Map<string, { id: string; storyOrder: number }[]>;
}
```

#### 1.2 Lane Assignment Model

```typescript
/** A horizontal lane in the timeline layout */
interface TimelineLane {
  /** Unique lane index (0 = top) */
  index: number;
  /** Y offset from the layout origin */
  yOffset: number;
  /** The chain or sub-chain occupying this lane */
  chainId: string;
  /** Whether this lane is a child lane (indented below parent) */
  isChildLane: boolean;
  /** Parent lane index, if this is a child or branch lane */
  parentLaneIndex: number | null;
}

/** Placement result for a single node */
interface TimelinePlacement {
  nodeId: string;
  /** X position (time-axis) */
  x: number;
  /** Y position (lane-axis) */
  y: number;
  /** Lane this node is assigned to */
  laneIndex: number;
  /** Column index on the time axis */
  columnIndex: number;
}
```

#### 1.3 Extended ArrangementResult outputs

The new layout emits additional data through existing interfaces:

```typescript
// Added to ArrangementResult (already has these fields):
{
  offsets: Map<string, { dx: number; dy: number }>;  // node placements
  guide: TimelineGuide;                               // axis ticks
  bars: TimelineBarInfo[];                            // duration bars
  sequenceEdges: GraphEdge[];                         // sequence + branch connectors
  nodeChains: string[][];                             // chain arrays
}

// New: cycle back-edges emitted as sequenceEdges with a special type marker
// The edge type EDGE_TYPE_SEQUENCE is reused; a new constant EDGE_TYPE_CYCLE_BACK
// is added for the curved return arrows.
```

### 2. Algorithm Design

The new `timelineOffsets()` replacement follows a 6-stage pipeline:

#### Stage 1: Build Timeline Graph
**Input**: `GraphNode[]`, `ClusterForceConfig`
**Output**: `TimelineGraph`

1. For each node, extract `timeValue`, `parentId`, `storyOrder`, `startDate`, `endDate` from frontmatter via `getNodeProperty`.
2. Build sequence edges from `sequenceFields` / `reverseSequenceFields` (same as current `buildLinkChainOrder` but retain ALL outgoing links, not just first match).
3. Build hierarchy edges from `parent_id` field.
4. Detect chains by walking forward links from chain heads (nodes with no incoming sequence edge).
5. Detect cycles: during chain walking, if a forward link targets an already-visited node, record a `CycleBackEdge` and stop the walk (do not follow the back-edge).
6. Detect branching: if a node has >1 outgoing sequence links, mark each additional link as a "branch" edge and spawn new chains for them.

```
buildTimelineGraph(members, cfg) -> TimelineGraph
```

#### Stage 2: Assign Columns (X-axis)
**Input**: `TimelineGraph`
**Output**: `Map<string, number>` (nodeId -> columnIndex)

Two modes depending on data:

**Mode A: Date-based columns** (when nodes have `timeValue`):
- Collect unique time values, sort them (numeric or lexicographic).
- Assign each unique time value a column index.
- Nodes without time values but in a chain get interpolated columns between their chain neighbors.

**Mode B: Sequence-based columns** (when nodes lack time values):
- Walk each chain head-to-tail; assign sequential column indices.
- Branch chains start at the fork column + 1.
- Hierarchy children get the SAME column as their parent (they differ in Y, not X).

**Mode C: Mixed** (some timed, some untimed):
- Timed nodes get date-based columns.
- Untimed chain nodes get columns interpolated or appended after the timed range.
- Same as current behavior for the timed/untimed split, but enhanced with hierarchy awareness.

```
assignColumns(graph: TimelineGraph) -> Map<string, number>
```

#### Stage 3: Assign Lanes (Y-axis)
**Input**: `TimelineGraph`, column assignments
**Output**: `TimelineLane[]`, `Map<string, number>` (nodeId -> laneIndex)

Lane assignment rules (in priority order):

1. **Main chain**: The longest chain (or the first chain if equal length) occupies lane 0.
2. **Sibling chains at same time**: Independent chains starting at the same time column get separate lanes, stacked below.
3. **Branch lanes**: When a node forks, each branch gets a new lane below the fork point.
4. **Child lanes**: When `parent_id` is present, children of a parent node are placed in a sub-lane directly below the parent's lane. Multiple children (sorted by `story_order`) share the sub-lane side-by-side (different columns, same Y offset below parent).
5. **Duration bar lanes**: Nodes with duration bars are placed in dedicated lanes with extra vertical clearance (bar height + gap). Non-bar nodes sharing the same lane are pushed to avoid overlap.

```
assignLanes(graph, columns) -> { lanes: TimelineLane[], nodeLanes: Map<string, number> }
```

#### Stage 4: Compute Positions
**Input**: column assignments, lane assignments, spacing parameters
**Output**: `Map<string, { dx: number; dy: number }>`

```
computePositions(columns, lanes, spacing, userConstants) -> offsets
```

Position formula:
- `dx = columnIndex * effectiveSpacing`
- `dy = laneYOffset + (childOffset if hierarchy child)`

Where:
- `effectiveSpacing` = same auto-compression logic as current (`timelineComputeSpacing`)
- `laneYOffset` = cumulative lane heights (configurable via `userConstants._laneHeight`)
- `childOffset` = `userConstants._childYOffset` (default: `nodeSize * 3`)

After computing raw positions, center the entire layout (reuse `timelineCenterOffsets`).

#### Stage 5: Compute Duration Bars & Adjust
**Input**: positions, `TimelineGraph`
**Output**: `TimelineBarInfo[]`, adjusted positions

1. For nodes with `startDate` + `endDate`, compute `xStart`/`xEnd` from the column positions of the start and end times.
2. Run lane-based overlap detection: if a bar overlaps another bar or node in the same lane, push the conflicting item to an adjacent sub-lane.
3. Apply bar height/gap from `userConstants` (reuse `_barGapFactor`, `_barHeightFactor`).

This is largely the same as current `timelineComputeBars` + `timelineAssignBarLanes`, but operates per-lane instead of globally.

#### Stage 6: Emit Results
**Input**: all computed data
**Output**: `ArrangementResult`

1. Build `offsets` map from positions.
2. Build `TimelineGuide` with axis ticks (same format as current).
3. Build `sequenceEdges`:
   - Normal sequence edges between chain-adjacent nodes (type: `EDGE_TYPE_SEQUENCE`).
   - Branch fork edges (type: `EDGE_TYPE_SEQUENCE`, from fork node to branch head).
   - Cycle back-edges (type: new `EDGE_TYPE_CYCLE_BACK`).
4. Build `nodeChains` arrays (same format as current, but now includes branch sub-chains).
5. Build `bars` array.

### 3. Cycle Detection Algorithm

Uses a color-based DFS approach on the sequence link graph:

```
WHITE = unvisited, GRAY = in current DFS path, BLACK = fully processed

function detectCycles(nextLinks: Map<string, string[]>, heads: string[]):
  cycles = []
  color = new Map()  // all nodes start WHITE

  function dfs(nodeId):
    color.set(nodeId, GRAY)
    for each target in nextLinks.get(nodeId):
      if color.get(target) === GRAY:
        cycles.push({ fromId: nodeId, toId: target })  // back-edge
      else if color.get(target) === WHITE:
        dfs(target)
    color.set(nodeId, BLACK)

  for each head in heads:
    if color.get(head) !== BLACK:
      dfs(head)

  return cycles
```

### 4. Branching Layout Strategy

When node A has outgoing sequence links to both B and C:

```
     A -----> B -----> D        (lane 0, main branch)
     |
     +------> C -----> E        (lane 1, branch)
```

The fork is rendered as:
- A horizontal edge A->B (main continuation, same lane)
- A diagonal/stepped edge A->C (fork indicator, drops to a new lane)

Fork detection: any node with `nextLinks.length > 1` is a fork point. The first link continues in the current lane; each additional link spawns a new lane.

### 5. Hierarchy Layout Strategy

When Scene S has children Beat B1 (story_order=1) and B2 (story_order=2):

```
     S                              (lane 0, column 5)
     |
     B1 ----> B2                    (lane 0.child, columns 5, 6)
```

Children are placed at `y = parent.y + childYOffset` and arranged horizontally by `story_order`. The children effectively form their own mini-chain in a sub-lane.

If a child also has its own children, the nesting continues:
```
     S                              (lane 0)
     |
     B1 ----> B2                    (lane 0.child)
     |
     B1a                            (lane 0.child.child)
```

Maximum nesting depth is configurable: `userConstants._maxHierarchyDepth` (default: 5).

### 6. Visual Elements

#### 6.1 Cycle Back-Edge Rendering

A cycle back-edge from node X back to node Y (where Y.column < X.column) is rendered as a curved arc below the lane:

```
     Y -----> ... -----> X
     ^                   |
     |___________________| (curved arc below)
```

The arc is a quadratic bezier with control point at:
- `cx = (X.x + Y.x) / 2`
- `cy = X.y + arcRadius` (below the lane)

`arcRadius` = `userConstants._cycleArcRadius` (default: `nodeSize * 4`).

#### 6.2 Fork Connector Rendering

At a fork point, a small "T" or "Y" junction is drawn:
- Horizontal continuation to the main branch
- Angled line dropping to the branch lane

#### 6.3 Duration Bar (existing, enhanced)

Duration bars are drawn as before (`TimelineBarInfo`) but now integrated into the lane system. Bars are rendered at the lane's Y position and affect the lane height calculation.

## Files to Modify

### New Files
| File | Purpose |
|---|---|
| `src/layouts/timeline-layout.ts` | New module: `TimelineGraph` construction, column/lane assignment, position computation. All 6 stages of the pipeline. |
| `src/layouts/timeline-types.ts` | Type definitions: `TimelineNode`, `TimelineEdge`, `TimelineGraph`, `TimelineChain`, `CycleBackEdge`, `HierarchyTree`, `TimelineLane`, `TimelinePlacement`. |

### Modified Files
| File | Change |
|---|---|
| `src/layouts/cluster-force.ts` | Replace `timelineOffsets()` body with a call to the new module. Remove `timelinePartitionNodes`, `timelineSortAndBuildSteps`, `timelinePlaceTimedNodes`, `timelinePlaceUntimedNodes`, `buildLinkChainOrder`, `buildHierarchyOrder` (moved to new module). Keep `timelineCenterOffsets`, `timelineComputeBars`, `timelineAssignBarLanes`, `timelineRecenterY` as shared utilities or move them too. |
| `src/constants.ts` | Add `EDGE_TYPE_CYCLE_BACK = "cycle-back"` constant. |
| `src/types.ts` | Add `"cycle-back"` to `EdgeType` union if applicable. Extend `TimelineBarInfo` if needed for lane-aware bars. |
| `src/views/EdgeRenderer.ts` | Handle `EDGE_TYPE_CYCLE_BACK` edges: render as curved bezier arcs instead of straight lines. |
| `src/views/GraphViewContainer.ts` | No interface changes expected (consumes `ArrangementResult` via `ClusterMetadata`). |
| `src/views/RenderPipeline.ts` | No changes (calls `drawTimelineBars()` and `drawRouteLines()` which consume existing data shapes). |
| `src/views/PanelBuilder.ts` | Add new UI controls: `_maxHierarchyDepth`, `_laneHeight`, `_childYOffset`, `_cycleArcRadius` as advanced timeline settings under `userConstants`. |

## Implementation Phases

### Phase 1: Extract & Restructure (Foundation)
**Goal**: Move timeline code to a dedicated module without changing behavior.
**Effort**: Small
**Risk**: Low

Tasks:
- [ ] Create `src/layouts/timeline-types.ts` with all new type definitions
- [ ] Create `src/layouts/timeline-layout.ts` with the existing `timelinePartitionNodes`, `timelineSortAndBuildSteps`, `timelinePlaceTimedNodes`, `timelinePlaceUntimedNodes`, `buildLinkChainOrder`, `buildHierarchyOrder` functions moved verbatim
- [ ] Create a `timelineOffsetsV2()` entry point in the new module that delegates to the moved functions (identical behavior to current `timelineOffsets`)
- [ ] Update `cluster-force.ts` to import and call `timelineOffsetsV2` instead of the local `timelineOffsets`
- [ ] Verify: build succeeds, existing presets render identically

### Phase 2: Hierarchy-Aware Placement (parent-child)
**Goal**: Children placed below parent instead of side-by-side.
**Effort**: Medium
**Risk**: Medium (changes node positions for hierarchy data)

Tasks:
- [ ] Implement `buildTimelineGraph()` Stage 1: extract `parentId`, `storyOrder` into `TimelineNode` objects and build `HierarchyTree` structures
- [ ] Implement lane assignment for hierarchy: parent in lane N, children in sub-lane at Y offset below
- [ ] Children within the same parent are placed side-by-side sorted by `story_order`
- [ ] Add `userConstants._childYOffset` (default: `nodeSize * 3`) and `userConstants._maxHierarchyDepth` (default: 5)
- [ ] Update `timelineOffsetsV2` to use hierarchy-aware placement when `parent_id` is detected
- [ ] Verify: test vault scenes with beats display correctly (parent above, children below in order)

### Phase 3: Branching & Multi-chain Lanes
**Goal**: Multiple sequence branches visible as parallel lanes.
**Effort**: Medium
**Risk**: Medium

Tasks:
- [ ] Modify `buildLinkChainOrder` (now in new module) to follow ALL outgoing sequence links, not just first match
- [ ] Implement fork detection: nodes with >1 outgoing links
- [ ] Implement lane spawning for branches: fork node stays in current lane, each branch gets a new lane below
- [ ] Generate branch fork edges (type `EDGE_TYPE_SEQUENCE`) connecting fork node to branch heads
- [ ] Add `userConstants._laneHeight` (default: `nodeSize * 4`)
- [ ] Verify: test with nodes that have multiple `next` links; branches should visually diverge

### Phase 4: Cycle Detection & Visualization
**Goal**: Detect and render cycle back-edges.
**Effort**: Small
**Risk**: Low

Tasks:
- [ ] Implement `detectCycles()` using color-based DFS on the sequence link graph
- [ ] Add `EDGE_TYPE_CYCLE_BACK` constant to `src/constants.ts`
- [ ] Emit `CycleBackEdge` data as synthetic edges in `ArrangementResult.sequenceEdges`
- [ ] Implement curved bezier arc rendering in `EdgeRenderer.ts` for `cycle-back` edge type
- [ ] Add `userConstants._cycleArcRadius` (default: `nodeSize * 4`)
- [ ] Verify: create test data with A->B->C->A cycle; confirm curved return arrow renders

### Phase 5: Simultaneous Event Lanes
**Goal**: Proper parallel lane stacking for same-time nodes.
**Effort**: Small
**Risk**: Low

Tasks:
- [ ] In column assignment (Stage 2), identify nodes sharing the same time value
- [ ] Assign same-time nodes to separate lanes based on their chain membership
- [ ] If same-time nodes are in the same chain, stack them vertically within the lane (current behavior preserved)
- [ ] If same-time nodes are in different chains, place them in their respective chain lanes (parallel tracks)
- [ ] Verify: nodes with identical dates but different chains appear in parallel horizontal tracks

### Phase 6: Duration Bar Integration
**Goal**: Duration bars influence lane layout instead of being a post-hoc overlay.
**Effort**: Medium
**Risk**: Medium (changes existing bar behavior)

Tasks:
- [ ] Move bar computation into Stage 5 of the pipeline (before final position centering)
- [ ] When computing lane heights, account for bar height: lanes containing bar nodes get extra vertical clearance
- [ ] Non-bar nodes sharing a column range with a bar node in the same lane are pushed to a different sub-lane
- [ ] Preserve all existing `TimelineBarInfo` fields and rendering behavior
- [ ] Verify: bars do not overlap non-bar nodes; lane heights adjust automatically

## Acceptance Criteria

- [AC-001] Nodes with `parent_id` referencing another node are placed directly below the parent, not beside it.
- [AC-002] Children of the same parent are placed side-by-side horizontally, sorted by `story_order` ascending.
- [AC-003] Nodes connected by sequence fields (`next`/`prev`) are placed side-by-side horizontally in chain order.
- [AC-004] When a node has 2+ outgoing sequence links, the layout shows visually diverging paths in separate lanes.
- [AC-005] When a sequence chain contains a cycle (back-edge to an earlier node), a curved return arrow is rendered.
- [AC-006] Nodes with identical time values but belonging to different chains are placed in parallel lanes.
- [AC-007] Duration bars span from start-date column to end-date column and do not overlap adjacent non-bar nodes.
- [AC-008] All spacing parameters (`_laneHeight`, `_childYOffset`, `_cycleArcRadius`, `_maxHierarchyDepth`, `_barGapFactor`) are configurable via `userConstants`.
- [AC-009] The `ArrangementResult` output shape is unchanged: `offsets`, `guide`, `bars`, `sequenceEdges`, `nodeChains` all present and consumed by existing downstream code.
- [AC-010] Build succeeds with `npm run build`; no TypeScript errors.
- [AC-011] Existing sample presets (01-20) that use timeline arrangement render without regressions.
- [AC-012] Layout computation for 500 mixed nodes completes in under 100ms (measured via `performance.now()` in dev build).

## Agent Coordination Notes

### File Ownership
- **timeline-layout.ts**: Primary implementation file. One agent should own this entirely per phase.
- **timeline-types.ts**: Can be created independently (Phase 1, no dependencies).
- **cluster-force.ts**: Only the `timelineOffsets` call site and related imports change. Minimal diff; can be done alongside timeline-layout.ts work.
- **EdgeRenderer.ts**: Cycle-back rendering (Phase 4) is independent of layout computation and can be assigned to a different agent.
- **PanelBuilder.ts**: UI controls for new `userConstants` fields can be done in parallel with any phase.

### Testing Strategy
- Each phase should be testable independently by building and deploying to the test vault.
- Use presets with `clusterArrangement: "timeline"` and `timelineOrderFields: "parent_id,story_order"`.
- CDP E2E tests can verify node positions via `evaluate()` calls to check `fx`/`fy` values.

### Migration Path
- Phase 1 is a pure refactor with zero behavior change -- this MUST be completed and verified before any subsequent phase begins.
- Phases 2-6 can be developed in any order after Phase 1, but recommended order is as listed (each builds on the data model established by the previous).
- If Phase 2 is completed, Phase 3 can start immediately since branching extends the chain/lane model that hierarchy establishes.

### Constants Reference (all configurable via userConstants)
| Constant | Default | Description |
|---|---|---|
| `_laneHeight` | `nodeSize * 4` | Vertical distance between parallel lanes |
| `_childYOffset` | `nodeSize * 3` | Y offset of children below parent |
| `_cycleArcRadius` | `nodeSize * 4` | Radius of the curved cycle-back arrow |
| `_maxHierarchyDepth` | `5` | Maximum nesting depth for parent-child trees |
| `_barGapFactor` | `1.5` | Gap between duration bar and adjacent elements (existing) |
| `_barHeightFactor` | `2.0` | Height multiplier for duration bars (existing) |
| `_yStackFactor` | `0.6` | Y stack spacing multiplier (existing) |
| `_forkAngle` | `30` | Angle in degrees for branch fork connectors |
