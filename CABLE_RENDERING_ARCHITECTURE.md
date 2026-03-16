# Cable/Edge Rendering Pipeline Architecture

## High-Level Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CABLE TRAY CONSTRUCTION PHASE                       │
│                    (GraphViewContainer._buildCableTrayInner)            │
└─────────────────────────────────────────────────────────────────────────┘

     GraphNode[] (positioned by force simulation)
                          ↓
     Cluster Metadata (centroids, radii, guides)
                          ↓
        Guide Analysis (ConcentricGuide? GridGuide? etc.)
                          ↓
    ┌──────────────────────────────────────────────────────┐
    │  Road Network Generation (cable-tray.ts)            │
    │                                                      │
    │  Polar System          │  Cartesian System          │
    │  ─────────────────     │  ──────────────────        │
    │  • Ring roads          │  • Vertical lines          │
    │  • Radial spokes       │  • Horizontal lines        │
    │  • Concentric pattern  │  • Manhattan grid          │
    └──────────────────────────────────────────────────────┘
                          ↓
        RoadNetwork { intersections[], segments[], adjacency }
                          ↓
        Add Trunk Roads Connecting Cluster Centroids
                          ↓
        Map Nodes to Nearest Intersection (nodeAccess)
                          ↓
        cableTrayData: RoadNetwork  (stored in GraphViewContainer)


┌─────────────────────────────────────────────────────────────────────────┐
│                      EDGE RENDERING PHASE (Per Frame)                   │
│                    (GraphViewContainer.drawEdges)                        │
└─────────────────────────────────────────────────────────────────────────┘

     Build EdgeDrawConfig
       • roadNetwork ← getCableTray()
       • nodeClusterMap, clusterCentroids, clusterRadii
       • highlightSet (for hover emphasis)
       • edge visibility, colors, densities
                          ↓
    ┌──────────────────────────────────────────────────────┐
    │  Cable Bundling Phase (EdgeRenderer.buildCables)   │
    │                                                      │
    │  Filter: inter-cluster edges only                   │
    │  Group by: (srcCluster, tgtCluster) pair            │
    │  Sub-group by: edge color                           │
    │  Split: if > 7 colors → multiple cables             │
    │                                                      │
    │  Output: Cable[] with lanes                         │
    └──────────────────────────────────────────────────────┘
                          ↓
    ┌──────────────────────────────────────────────────────┐
    │  Cable Layout & Rendering (EdgeRenderer.drawCables) │
    │                                                      │
    │  For each cable:                                     │
    │    1. computeCableLayout()                          │
    │       ├─ Trunk start: source cluster boundary       │
    │       ├─ Trunk end: target cluster boundary         │
    │       └─ Parallel offset for visual separation      │
    │    2. For each color lane:                          │
    │       ├─ Draw trunk line (high contrast)            │
    │       └─ Draw fan lines (subtle node connections)   │
    └──────────────────────────────────────────────────────┘
                          ↓
    ┌──────────────────────────────────────────────────────┐
    │  Individual Edge Routing (EdgeRenderer.drawEdges)    │
    │                                                      │
    │  For each non-cabled edge:                          │
    │    1. drawEdgeSegment()                             │
    │       ├─ Road routing (if available):              │
    │       │  └─ routeEdge(roadNetwork) → waypoints    │
    │       │     └─ Dijkstra shortest path              │
    │       │     └─ waypoints connected via quadratic   │
    │       ├─ Direction bundling (if bundleStrength > 0)│
    │       ├─ Arc layout (if isArcLayout)               │
    │       └─ Straight line (default)                   │
    │    2. drawEdgeDecorations()                        │
    │       ├─ Ontology markers (inheritance/aggregation)│
    │       ├─ Sequence arrows                           │
    │       └─ Cardinality symbols (crow's foot)         │
    └──────────────────────────────────────────────────────┘
                          ↓
              CanvasGraphics batch → PixiJS render
```

---

## Data Structure Transformations

### 1. Cluster → Cable Grouping

```
GraphEdge[] (all edges)
  ├─ Edge A: node1 (cluster X) → node2 (cluster X)  [SKIP: same cluster]
  ├─ Edge B: node3 (cluster X) → node4 (cluster Y)  [CABLE]
  ├─ Edge C: node5 (cluster X) → node6 (cluster Y)  [CABLE] (same pair as B)
  └─ Edge D: node7 (cluster X) → node8 (cluster Z)  [CABLE] (different pair)
                          ↓
         pairData Map:
         {
           "X|Y": {
             srcCluster: "X", tgtCluster: "Y",
             byColor: {
               0xFF0000: [Edge B],
               0x00FF00: [Edge C]
             }
           },
           "X|Z": {
             srcCluster: "X", tgtCluster: "Z",
             byColor: {
               0x0000FF: [Edge D]
             }
           }
         }
                          ↓
         cables: Cable[]
         {
           { pairKey: "X|Y", srcCluster: "X", tgtCluster: "Y",
             lanes: [
               { color: 0xFF0000, edges: [B] },
               { color: 0x00FF00, edges: [C] }
             ],
             cableIndex: 0, totalCables: 1 }
           ,
           { pairKey: "X|Z", srcCluster: "X", tgtCluster: "Z",
             lanes: [
               { color: 0x0000FF, edges: [D] }
             ],
             cableIndex: 0, totalCables: 1 }
         }
```

### 2. Cluster Pair → Cable Layout

```
Cable {
  pairKey: "X|Y",
  srcCluster: "X", tgtCluster: "Y",
  lanes: [ ... ]
}
                          ↓
     clusterCentroids: { "X": {x:100, y:200}, "Y": {x:400, y:300} }
     clusterRadii: { "X": 50, "Y": 50 }
                          ↓
     computeCableLayout()
       • Direction: (400-100, 300-200) = (300, 100)
       • Normalized: (0.949, 0.316)
       • Perpendicular: (-0.316, 0.949)
       • Trunk Start (cluster X boundary): (149.75, 215.8)
       • Trunk End (cluster Y boundary): (350.25, 315.8)
       • Offset for parallel: (0, 0) if totalCables=1
                          ↓
     CableLayout {
       trunkStart: {x: 149.75, y: 215.8},
       trunkEnd: {x: 350.25, y: 315.8},
       offsetX: 0, offsetY: 0
     }
```

### 3. Road Network Node Access

```
GraphNode[] { id: "N1", x: 123.4, y: 456.7 }, ...
                          ↓
     (in buildRoadNetwork)
                          ↓
     RoadIntersection[] {
       {id: 0, x: 100, y: 400},
       {id: 1, x: 100, y: 500},
       {id: 2, x: 200, y: 400},
       {id: 3, x: 200, y: 500},
       ...
     }
                          ↓
     For each node: find nearest intersection or split segment
                          ↓
     nodeAccess: Map {
       "N1" → 0,  (closest to intersection 0)
       "N2" → 1,
       ...
     }
```

### 4. Edge → Routed Waypoints

```
GraphEdge { source: "N1", target: "N3", ... }
                          ↓
     (in drawEdgeSegment with roadNetwork available)
                          ↓
     routeEdge(network, "N1", "N3")
       1. startIsect = nodeAccess["N1"] = 0
       2. endIsect = nodeAccess["N3"] = 3
       3. findShortestPath(0, 3) → [0, 1, 3]  (via Dijkstra)
       4. pathToWaypoints([0, 1, 3])
                          ↓
     waypoints: [
       {x: 100, y: 400},   // intersection 0
       {x: 100, y: 500},   // intersection 1
       {x: 200, y: 500}    // intersection 3
     ]
                          ↓
     (in drawEdgeSegment)
     Draw: node1 → (quadratic curve through waypoints) → node3
```

---

## State & Lifecycle

### Cable Tray Lifecycle

```
1. INITIALIZATION (first render)
   └─ _buildCableTrayInner() called
      └─ Analyzes guides, generates RoadNetwork
      └─ Stores in this.cableTrayData
      └─ _cableTrayFinalized = false

2. DURING SIMULATION (layout animation)
   └─ Position updates trigger layout tick
      └─ On position change: buildCableTray() called
         └─ Rebuilds network if not finalized
         └─ Updates node positions → nodeAccess mapping
         └─ _roadDrawn = false (invalidate draw cache)

3. AFTER SIMULATION (layout stable)
   └─ applyClusterForce() calls buildCableTray(final=true)
      └─ Marks _cableTrayFinalized = true
      └─ Prevents unnecessary rebuilds

4. ON TOPOLOGY CHANGE (cluster rules applied)
   └─ applyClusterForce() re-runs layout
      └─ Resets positions, rebuilds cable tray
      └─ Re-animates layout
```

### Bundle Cache Lifecycle

```
1. INITIALIZATION
   └─ _bundleDirty = true
   └─ _bundleCache = null

2. FIRST RENDER with bundleStrength > 0
   └─ _buildDirectionBundles(edges, ...)
   └─ Stored in _bundleCache
   └─ _bundleDirty = false

3. PERIODIC REFRESH (every BUNDLE_SKIP=3 frames)
   └─ Recomputed during animation
   └─ Reduces cost (~33% of full recompute per frame)

4. ON INVALIDATION
   └─ invalidateBundleCache() called
   └─ _bundleDirty = true
   └─ _bundleCache = null
   └─ Triggers on edge visibility change, layout change, etc.
```

### Route Cache Lifecycle

```
1. INITIALIZATION
   └─ _roadRouteCache = Map (empty)
   └─ _roadRouteCacheNetwork = null

2. FIRST EDGE ROUTING
   └─ roadNetwork reference stored
   └─ Routes computed via Dijkstra
   └─ Cached: srcId|tgtId → waypoints

3. NETWORK TOPOLOGY CHANGE
   └─ If new roadNetwork object (!== _roadRouteCacheNetwork)
      └─ _roadRouteCache.clear()
      └─ _roadRouteCacheNetwork = new reference
      └─ All routes recomputed on demand

4. CACHE HIT
   └─ Same network, same pair → direct lookup (no Dijkstra)
```

---

## Rendering Decision Tree

```
START: Edge e, configuration cfg
       ├─ Is e in cabledEdgeIds? (drawn by cable bundling)
       │  └─ YES: SKIP (already drawn as part of trunk+fan)
       │
       └─ NO: Individual edge drawing
          ├─ shouldSkipEdge(e, cfg)? (visibility flags)
          │  └─ YES: SKIP
          │
          └─ NO: Resolve positions
             ├─ src = resolvePos(e.source)
             ├─ tgt = resolvePos(e.target)
             │
             ├─ Compute style (alpha, thickness)
             │  ├─ Base alpha from edge type (structural vs non-structural)
             │  ├─ Apply density scale (more edges → fainter)
             │  ├─ Apply degree fade (low-degree nodes → fainter)
             │  ├─ Apply weight thickness (multiple edges between pair → thicker)
             │  └─ Apply hover highlight (if hovered → bright, else → dim)
             │
             ├─ Apply dash pattern (if semantic/tag edge)
             │
             ├─ drawEdgeSegment(src, tgt, cfg, roadNetwork)
             │  ├─ If roadNetwork available & not arc layout:
             │  │  ├─ routeEdge(roadNetwork, srcId, tgtId) → waypoints
             │  │  ├─ If waypoints found:
             │  │  │  └─ Draw src → quadratic curves through waypoints → tgt
             │  │  └─ Else: Draw straight line (fallback)
             │  │
             │  ├─ Else if bundles available & not arc layout:
             │  │  ├─ Compute bundle key from angle + grid cell
             │  │  ├─ If bundle group found:
             │  │  │  └─ Draw src → quadratic curve toward centroid → tgt
             │  │  └─ Else: Draw straight line
             │  │
             │  ├─ Else if arc layout:
             │  │  └─ Draw src → quadratic arc → tgt
             │  │
             │  └─ Else: Draw straight line
             │
             └─ drawEdgeDecorations(e, src, tgt, ...)
                ├─ If inheritance/aggregation:
                │  └─ Draw ontology marker (triangle/diamond)
                ├─ If sequence:
                │  └─ Draw sequence arrow
                ├─ If showArrows:
                │  └─ Draw generic directional arrow
                └─ If cardinality mode = "crowsfoot":
                   └─ Draw crow's foot symbols
```

---

## Cable Bundling Visual Structure

```
                    Cluster Y Boundary
                            |
                        Trunk End
                            *
                          / | \
                       /    |    \
                    /       |       \  Edge C
                /           |        \
            Node4 ------      --------  Node6
                     (Lane 2: green)

                        Trunk Spine
                          /    \
                       /        \
                    /            \
                Node1 ------*------ Node4
                Node2 ------*------ Node5
                Node3 ------*------ Node6
                     (One trunk per color)

                Cluster X Boundary
                            |
                        Trunk Start
                            *
                          / | \
                       /    |    \
                    /       |       \  Edge A
                /           |        \
            Node1 ------      --------  Node3
                     (Lane 1: red)
```

**Key**: Multiple lanes (colors) bundled into single cable with shared trunk

---

## Performance Characteristics

| Operation | Cost | Frequency | Notes |
|-----------|------|-----------|-------|
| buildCables() | O(E × C) | Per frame (cached) | E=edges, C=colors, cached while edges stable |
| computeCableLayout() | O(C² × G) | Per cable | C=cables, G=geometry ops (cheap) |
| drawCables() | O(C × L × E) | Per frame | C=cables, L=lanes, E=edges/lane |
| routeEdge() (Dijkstra) | O(I² × log I) | Per edge (cached) | I=intersections (~50-300), expensive but cached |
| drawEdges() | O(E × ops) | Per frame | ops=color resolve, density scale, decorations |
| buildRoadNetwork() | O(A1 × A2) | Once per topology change | A1/A2=axis line counts, usually small |
| findShortestPath() | O(I × log I) | Per route | Uses simple priority queue |

---

## Key Constants & Tunables

**Cable Rendering**
- `MAX_CABLE_COLORS = 7` — Split cables if > 7 colors per pair
- `CABLE_LANE_SPACING = 1` — Perpendicular offset between lanes within cable
- `CABLE_LAYOUT_MARGIN = 10` — Margin from cluster boundary to trunk start
- `CABLE_OVERLAP_FRAC = 0.4` — Trunk placement when clusters overlap
- `CABLE_FAN_CROWD_THRESHOLD = 10` — Threshold for fan line alpha dampening
- `CABLE_FAN_CROWD_MIN_FRACTION = 0.3` — Min alpha multiplier when crowded
- `CABLE_FAN_CONNECTED_FACTOR = 0.8` — Fan alpha multiplier when node highlighted

**Road Network**
- `buildCableTray()` sparse grids: 6-16 rings/spokes, 8-16 grid lines
- No densification (sparse networks for clarity)
- Trunk roads added after main network (Dijkstra-optimal routes)

**Caching**
- `BUNDLE_SKIP = 3` — Recompute direction bundles every 3 frames
- Route cache: Keyed by (srcId|tgtId), invalidated on network reference change
- Cable cache: Invalidated by `invalidateBundleCache()` (edge visibility, layout change)

---

## Integration Points

### With Layout System
- Cable tray updated during force simulation (position changes)
- Finalized when `layoutController.applyClusterForce()` completes
- Cluster arrangement determines road topology (polar/cartesian)

### With Panel Configuration
- Cable bundling enable/disable via `panel.cableBundleMode`
- Cable styling: `cableTrunkWidth`, `cableTrunkAlpha`, `cableSpacing`, etc.
- Road routing enable/disable via `panel.renderThresholds.routeWiresOnTray`
- Edge visibility flags propagate to `shouldSkipEdge()`

### With Hover/Highlight System
- `highlightSet` computed in `_buildHoverHighlightSet()` (BFS from hovered node)
- Lane/edge is "hit" if any endpoint in set
- Highlighted edges: Bright, thick; non-matched: Dim (FADE_BY_DEGREE_MIN_ALPHA)

### With Canvas Rendering
- CanvasGraphics batch cleared, populated, rendered via PixiJS
- Arrow graphics rendered to separate layer (stays on top)
- Edge labels rendered to container (between edges and nodes)
