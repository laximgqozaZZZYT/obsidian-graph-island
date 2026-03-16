# Cable Tray & Edge Rendering System — Research Report

**Date**: 2026-03-16
**Branch**: feat/road-network-v4
**Purpose**: Comprehensive analysis of cable tray data flow, edge rendering architecture, and identified architectural problems.

---

## 1. Cable Tray Data Flow

### 1.1 CableTray Interface (cable-tray.ts:35-47)

```typescript
export interface CableTray {
  intersections: TrayJunction[];           // Junction nodes in the tray graph
  segments: TraySegment[];                 // Physical connections between junctions
  nodeAccess: Map<string, number>;         // Node ID → intersection ID (where each node accesses the tray)
  adjacency: Map<number, { to: number; weight: number; segIdx: number }[]>;  // Graph connectivity
  system: "polar" | "cartesian";           // Topology type
  cx: number;                              // Center X (for polar layouts)
  cy: number;                              // Center Y (for polar layouts)
}

export interface TrayJunction {
  id: number;
  x: number;
  y: number;
}

export interface TraySegment {
  from: number;
  to: number;
  waypoints: { x: number; y: number }[];   // Arc waypoints for curved segments (rings)
  length: number;
}
```

### 1.2 Cable Tray Construction Pipeline

**Three parallel paths exist for building cable trays:**

#### Path A: Grid-Based Tray from Guide Data (cable-tray.ts:71-284)
**Function**: `buildCableTray(cfg: CableTrayConfig)`

**Called from**: `GraphViewContainer._buildCableTrayInner()` lines 2454-2644

**Input**:
- `axis1Lines`: Grid lines for first axis (r values for polar, x values for cartesian)
- `axis2Lines`: Grid lines for second axis (θ values in radians for polar, y values for cartesian)
- `axis1Shape`: "circle" | "radial" | "line" | "curve"
- `axis2Shape`: Shape type for axis2
- `cx`, `cy`: Center point
- `bounds`: Bounding box with optional `maxR` for polar
- `nodes`: All positioned nodes for access point mapping

**Algorithm**:
1. **Polar** (cable-tray.ts:79-138):
   - Create center intersection at (cx, cy)
   - For each (r, θ) pair: create intersection at polar coords
   - Ring segments: connect adjacent θ on same r with arc waypoints
   - Radial segments: connect adjacent r on same θ with straight lines

2. **Cartesian** (cable-tray.ts:140-177):
   - For each (x, y) pair: create intersection
   - Horizontal segments: connect (xi, yi) → (xi+1, yi)
   - Vertical segments: connect (xi, yi) → (xi, yi+1)

3. **Node Access Mapping** (cable-tray.ts:189-281):
   - For each node: find nearest intersection (Euclidean distance)
   - **Cartesian only**: Also check mid-segment points
   - If node is closest to segment mid-point (not endpoint), split segment
   - Create new junction at projection point
   - Update adjacency graph bidirectionally

**Output**: `CableTray` object with:
- ~200 intersections (sparse grid)
- ~400-800 segments (depending on grid density)
- nodeAccess map populated for all nodes

---

#### Path B: Phantom-Based Tray (cable-tray.ts:685-811)
**Function**: `buildCableTrayFromPhantoms(phantomNodes, realNodes, system, cx, cy)`

**Called from**: `GraphViewContainer._buildCableTrayInner()` line 2404

**Purpose**: When force-simulation has phantom nodes (grid infrastructure), use their positions directly.

**Algorithm**:
1. Parse phantom node IDs for grid indices:
   - Polar: `__phantom_r{ring}_s{spoke}` → (ri, si)
   - Cartesian: `__phantom_x{col}_y{row}` → (xi, yi)

2. Create junctions at phantom positions

3. Connect adjacent phantoms:
   - **Polar**: ring neighbors (same r, next spoke), spoke neighbors (same spoke, next r)
   - **Cartesian**: horizontal neighbors (same y, next x), vertical neighbors (same x, next y)

4. Map real nodes to nearest phantom intersection

**Output**: Same `CableTray` structure, with intersections at phantom positions

---

#### Path C: Fallback Tray from Node Distribution (cable-tray.ts:2589-2645)
**Called from**: `GraphViewContainer._buildCableTrayInner()`

**Triggered when**:
- No guide data available
- No phantom nodes

**Algorithm**:
- **Cartesian** (lines 2596-2621):
  - Generate sparse grid: 8-16 lines per axis
  - Spacing based on node bounding box

- **Polar** (lines 2622-2643):
  - Generate rings from sorted node distances (6-12 rings)
  - Generate spokes from angle distribution (8-16 spokes)

---

### 1.3 Cable Tray Finalization (cable-tray.ts:2359-2380)
**Function**: `GraphViewContainer._finishCableTray(allNodes)`

**Steps**:
1. **Add Trunk Cables** (cable-tray.ts:485-509):
   - Map group centroids to nearest tray intersections
   - Connect based on `clusterGroupArrangement`:
     - `circle` / `concentric`: Sort by angle, connect in ring
     - `grid`: Connect row-wise and column-wise
     - Others: Connect sequentially

2. **Enforce Unified Directional Ingress** (cable-tray.ts:946-972):
   - **Polar**: All nodes → nearest intersection closer to center
   - **Cartesian**: All nodes → nearest intersection with dy > 0 (downward)
   - Function: `findDirectionalIntersection(tray, nx, ny, direction)`
   - **Problem**: Forces all nodes to same entry point per cluster

---

### 1.4 Guide Data Sources (cluster-force.ts)

**Guide types** in `ArrangementGuide` union (cluster-force.ts:71-76):
- `timeline`: X-axis ticks, Y-axis position
- `grid`: Vertical/horizontal line positions
- `triangle`: 3 vertices, triangle shape
- `concentric`: Ring radius values
- `coordinate`: Full grid from coordinate engine

**GroupGuideEntry** structure (cluster-force.ts:109-125):
```typescript
interface GroupGuideEntry {
  guide: ArrangementGuide;
  centerX: number;
  centerY: number;
}
```

**Built in** `cluster-force.ts:computeAbsoluteTargets()` and returned as metadata:
```typescript
metadata: {
  groupGuides?: GroupGuideEntry[];  // Per-group arrangement guides
  // ... other metadata
}
```

---

## 2. Edge Rendering Cable System

### 2.1 Cable & CableLane Interfaces (EdgeRenderer.ts:341-369)

```typescript
interface CableLane {
  color: number;
  edges: GraphEdge[];              // All edges of this color
}

interface Cable {
  pairKey: string;                 // "clusterA|clusterB" (alphabetical)
  srcCluster: string;
  tgtCluster: string;
  lanes: CableLane[];              // Max 8 distinct colors per cable
  allEdges: GraphEdge[];           // All edges in cable
  cableIndex: number;              // For parallel offset
  totalCables: number;             // Total cables for this pair
}

interface CableLayout {
  trunkPath: { x: number; y: number }[];  // Waypoints following tray
  offsetX: number;                        // Perpendicular offset
  offsetY: number;
}
```

### 2.2 Cable Building (EdgeRenderer.ts:376-459)

**Function**: `buildCables(edges, resolvePos, cfg)`

**Algorithm**:
1. Group inter-cluster edges by (src cluster, tgt cluster) pair
2. Within each pair, group by color (resolveEdgeColor)
3. Split into cables of max 8 colors each
4. Return cables + set of edge IDs handled by cables

**Key constraint**: Only includes edges where:
- Source and target in different clusters
- Both cluster centroids exist in `cfg.clusterCentroids`

**Called from**: Main draw loop (line 1843) via `cfg.cableTray`

---

### 2.3 Cable Layout Computation (EdgeRenderer.ts:471-536)

**Function**: `computeCableLayout(cable, centroids, radii, cfg?)`

**Algorithm**:

1. **Cluster Boundary Clipping** (lines 492-505):
   ```
   Entry point = centroid + (unit vec toward target) × (radius + margin)
   Exit point = centroid - (unit vec toward target) × (radius + margin)

   If gap > 2×margin: clip at boundaries
   Else: overlap at 40% fraction (CABLE_OVERLAP_FRAC = 0.4)
   ```

2. **Problematic Ingress Caching** (lines 507-511):
   ```typescript
   const cachedSrc = _clusterIngressCache.get(cable.srcCluster);
   const cachedTgt = _clusterIngressCache.get(cable.tgtCluster);
   if (cachedSrc) { ts = cachedSrc; } else { _clusterIngressCache.set(...) }
   if (cachedTgt) { te = cachedTgt; } else { _clusterIngressCache.set(...) }
   ```
   **Problem**: All cables to/from a cluster REUSE THE SAME ENTRY POINT.
   - First cable computes entry point, subsequent cables use it
   - No variation per cable → visual bundling is too tight
   - Should compute unique entry per cable (e.g., offset perpendicular)

3. **Tray Routing** (lines 513-523):
   ```typescript
   if (tray && tray.intersections.length > 0) {
     trunkPath = routeOnTray(tray, ts, te);
   } else {
     // Fallback: L-path
   }
   ```
   - Calls `routeOnTray()` which uses Dijkstra on tray graph
   - Returns waypoints including arc segments

4. **Perpendicular Offset** (lines 525-535):
   ```typescript
   const px = -uy;  // perpendicular X
   const py = ux;   // perpendicular Y
   const centerOffset = (cable.cableIndex - (totalCables - 1) / 2) * spacing;
   return { trunkPath, offsetX: px * centerOffset, offsetY: py * centerOffset };
   ```

**Architectural Problem**: Offset is applied uniformly to entire path, but:
- Offset is perpendicular to initial centroid direction
- At tray junctions (which may not be on centroid line), offset direction is wrong
- Creates visual misalignment at tray corners

---

### 2.4 Cable Drawing (EdgeRenderer.ts:546-710)

**Function**: `drawCables(g, cables, resolvePos, cfg, densityScale)`

**Rendering structure**:

1. **Trunk Line** (lines 583-631):
   - Per-lane: Draw offset path with smooth curves at corners
   - Color: lane.color
   - Width: cfg.cableTrunkWidth (default 2px)
   - Alpha: densityScale × trunkAlpha

2. **Branch Cables** (lines 633-707):
   - Per-edge in lane:
     - Source side: node → [tray access point] → [Dijkstra] → trunk entry
     - Target side: trunk exit → [Dijkstra] → [tray access point] → node
   - Called via `_drawTrayRoutedBranch(g, tray, fromId, toId)`
   - Each call invokes **Dijkstra per edge per frame** (NO CACHING)

---

### 2.5 Tray-Based Edge Routing (EdgeRenderer.ts:857-937)

**Function**: `drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength, cableTray, cfg)`

**Cable routing flow** (lines 869-917):
1. If `cableTray` exists and not arc layout:
2. Cache lookup: `_wireRouteCache` (edge-pair key)
3. If not cached:
   - Get node cluster assignments
   - Call `routeWire(tray, srcId, tgtId, srcGroup, tgtGroup, clusterCentroids)`
   - Returns waypoints
4. Draw wire along waypoints with smooth curves at direction changes

**Caching strategy**:
- Per-frame persistent: `_wireRouteCache`
- Invalidated when: tray reference changes (line 874)
- **Problem**: Routes recomputed every frame if tray changes (e.g., during simulation)

---

## 3. Cable Tray to Edge Renderer Flow

### 3.1 Data Flow

```
CableTray Construction:
  buildCableTray() or buildCableTrayFromPhantoms()
         ↓
  _finishCableTray(allNodes)
    ├─ addTrunkCables(cableTray, centroids, arrangement)
    └─ nodeAccess mapping (directional ingress)
         ↓
  GraphViewContainer.cableTrayData

Edge Rendering:
  edgeRenderer.buildCables(edges, resolvePos, cfg)
    ├─ cfg.nodeClusterMap (cluster assignments)
    ├─ cfg.clusterCentroids (group centers)
    └─ cfg.clusterRadii (group sizes)
         ↓
  edgeRenderer.computeCableLayout(cable, ...)
    ├─ Route trunk: routeOnTray(cableTray, entry, exit)
    └─ Offset for parallel cables
         ↓
  edgeRenderer.drawCables(g, cables, ...)
    ├─ Draw trunk lines (per color)
    └─ Draw branch cables (per edge, Dijkstra per edge)
         ↓
  edgeRenderer.drawEdgeSegment(g, src, tgt, ...)
    ├─ Non-cabled edges: routeWire() or bundle/arc
    └─ Cached routes (wireRouteCache)
```

---

## 4. Pathfinding Functions

### 4.1 Dijkstra on Tray (cable-tray.ts:821-862)

**Function**: `dijkstraOnTray(tray, startId, endId)`

**Algorithm**:
- Classic Dijkstra shortest path on tray adjacency graph
- Returns ordered intersection IDs
- Time: O(n²) for n junctions (simple linear scan, no heap)
- **For 200 junctions**: ~40K operations per path
- **Problem**: Called **per-edge per-frame** in `_drawTrayRoutedBranch()`

---

### 4.2 Path to Waypoints (cable-tray.ts:868-896)

**Function**: `pathToWaypoints(tray, path)`

**Algorithm**:
- For each pair of consecutive junctions in path
- Look up segment in adjacency graph
- Extract arc waypoints (if ring segment)
- Reverse waypoints if traversing backward
- Return full coordinate path

---

### 4.3 Route on Tray (cable-tray.ts:903-919)

**Function**: `routeOnTray(tray, src, tgt)`

**Algorithm**:
1. Snap src/tgt to nearest intersections
2. Run `dijkstraOnTray()` between them
3. Convert path to waypoints via `pathToWaypoints()`
4. Return [src, ...waypoints, tgt]

**Used for**: Trunk cable routing (line 518)

---

### 4.4 Route on Tray by IDs (cable-tray.ts:924-934)

**Function**: `routeOnTrayByIds(tray, fromId, toId)`

**Algorithm**: Same as routeOnTray but takes intersection IDs directly.

**Used for**: Branch cable routing per edge (line 693)

---

### 4.5 Pattern-Forced Routing (cable-tray.ts:297-434)

**Function**: `routeWirePolar()`, `routeWireCartesian()`, `routeWire()`

**Polar** (cable-tray.ts:297-349):
- Source → spoke to transit ring → arc along ring → spoke to target
- Transit ring = max(srcR, tgtR)

**Cartesian** (cable-tray.ts:385-407):
- L-shaped: source → corner → target
- Corner = (targetX, sourceY)

**Inter-group** (cable-tray.ts:440-477):
- Via group centroids: source → srcCenter → tgtCenter → target

---

## 5. Key Data Structures & Caches

### 5.1 EdgeRenderer Module-Level Caches (lines 732-756)

```typescript
let _bundleCache: Map<string, BundleGroup> | null = null;
let _bundleDirty = true;

let _wireRouteCache = new Map<string, { x: number; y: number }[]>();
let _wireRouteCacheTray: CableTray | null = null;

let _cableCache: { cables: Cable[]; cabledEdgeIds: Set<string> } | null = null;
let _cableDirty = true;

let _clusterIngressCache = new Map<string, { x: number; y: number }>();
```

**Invalidation**:
- `invalidateBundleCache()` (line 750): Clears all 4 caches
- Triggered on edge visibility change, layout change, data reload

---

### 5.2 GraphViewContainer Cable Tray State

```typescript
this.cableTrayData: CableTray | null          // Current instance network
this._cableTrayFinalized: boolean              // Locked after simulation ends
this._trayDrawn: boolean                       // Graphics cache valid
```

---

## 6. Architectural Problems Identified

### 6.1 Problem 1: Cluster Ingress Caching Forces Single Entry Point

**Location**: EdgeRenderer.ts:507-511

**Issue**: All cables to/from a cluster reuse the same cached entry point.

```typescript
const cachedSrc = _clusterIngressCache.get(cable.srcCluster);
if (cachedSrc) { ts = cachedSrc; }  // Reuse first computed point
else { _clusterIngressCache.set(cable.srcCluster, ts); }
```

**Consequence**:
- First cable computes entry/exit
- All subsequent cables use identical points
- Cables to same cluster bundle visually at single junction
- No perpendicular spreading at cluster boundary

**Should be**: Compute unique entry per cable (e.g., offset perpendicular to radial direction from center)

---

### 6.2 Problem 2: Perpendicular Offset Applied to Entire Path

**Location**: EdgeRenderer.ts:525-535, 607

**Issue**: Offset is perpendicular to initial centroid-to-centroid direction but applied uniformly.

```typescript
const px = -uy;  // perpendicular to centroid direction
const py = ux;
const centerOffset = ...;
const offsetPath = trunkPath.map(p => ({ x: p.x + lox, y: p.y + loy }));
```

**Consequence**:
- At tray junctions far from centroid line, offset is perpendicular to LOCAL path, not centroid direction
- Cables misalign when trunk path deviates (e.g., at corners)
- Parallel cables don't truly feel parallel at the tray

**Should be**: Compute perpendicular direction locally at each segment

---

### 6.3 Problem 3: Dijkstra Called Per-Edge Per-Frame (NO CACHING)

**Location**: EdgeRenderer.ts:681, 693 (`_drawTrayRoutedBranch`)

**Issue**: Each edge calls Dijkstra without caching.

```typescript
_drawTrayRoutedBranch(g, tray, srcAccessId, nearTrayId);
```

For a 100-edge cable:
- 100 calls per frame
- Each call: Dijkstra on ~200 junctions = ~40K ops
- Total: ~4M operations per cable per frame
- Over 100 frames: **400M operations**

**Should be**: Cache per (fromId, toId) pair in thread-local/frame-local cache

---

### 6.4 Problem 4: Cluster Boundary Clipping Then Snaps to Tray (Backwards Order)

**Location**: EdgeRenderer.ts:492-518

**Issue**: Compute entry point at cluster boundary, THEN snap to tray.

```typescript
// Step 1: Clip at cluster boundary
const ts = { x: cA.x + ux * dist * startFrac, y: cA.y + uy * dist * startFrac };
// Step 2: Route on tray
const trunkPath = routeOnTray(tray, ts, te);  // Snaps to nearest tray intersection
```

**Consequence**:
- Entry point calculated at cluster radius + margin
- But routeOnTray snaps to nearest tray intersection (may be far away)
- Trunk path may not start/end where cluster intersection is
- Fan line from cluster node to trunk start can be long

**Should be**:
1. Snap cluster entry point to nearest tray intersection first
2. Then compute offset for parallel cables
3. Then route trunk on tray

---

### 6.5 Problem 5: findDirectionalIntersection Maps All to Same Intersection

**Location**: cable-tray.ts:946-971, GraphViewContainer.ts:2374-2377

**Issue**: Function finds single "best" intersection in a direction.

```typescript
export function findDirectionalIntersection(tray, nx, ny, direction): number {
  let bestId = -1, bestDist = Infinity;
  for (const isect of tray.intersections) {
    // Only consider intersections in desired direction
    if (direction === "center") {
      if (isectDistSq >= nodeDistSq) continue;  // Closer to center
    } else {
      if (dy <= 0) continue;  // Must be below (dy > 0)
    }
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; bestId = isect.id; }
  }
  return bestId;
}
```

**Consequence**:
- All nodes in cluster map to nearest intersection in (center/down) direction
- Nodes that should use different junctions forced to same one
- Creates artificial bottleneck at single access point per cluster

**Should be**: Cluster can have multiple access points (e.g., one per direction quadrant, or one per node if sparse)

---

### 6.6 Problem 6: Coordinate Clipping Applied Before Tray Snapping

**Location**: EdgeRenderer.ts:504-505

**Issue**: Cluster boundary clipping is independent of tray topology.

```typescript
let ts = { x: cA.x + ux * dist * startFrac, y: cA.y + uy * dist * startFrac };
// ... later ...
const trunkPath = routeOnTray(tray, ts, te);  // Might snap far away
```

**Consequence**:
- Clipping assumes cluster boundary is circular (radius only)
- But actual tray intersections may be far outside that circle
- routeOnTray snaps to nearest, which defeats the clipping

**Should be**: Clip on tray intersections directly, not cluster radius

---

## 7. Function Signature Reference

### Cable Tray Functions

| Function | Signature | Returns | Called From |
|----------|-----------|---------|-------------|
| `buildCableTray` | `(cfg: CableTrayConfig)` | `CableTray` | GraphViewContainer lines 2454-2573 |
| `buildCableTrayFromPhantoms` | `(phantomNodes, realNodes, system, cx, cy)` | `CableTray` | GraphViewContainer line 2404 |
| `routeWirePolar` | `(network, sourceNodeId, targetNodeId)` | `{x,y}[]` | cable-tray.ts:425-428 |
| `routeWireCartesian` | `(network, sourceNodeId, targetNodeId)` | `{x,y}[]` | cable-tray.ts:425-428 |
| `routeWire` | `(tray, srcId, tgtId, srcGroup?, tgtGroup?, groupCentroids?)` | `{x,y}[]` | EdgeRenderer.ts:883 |
| `routeWireInterGroup` | `(tray, srcId, tgtId, srcGroup, tgtGroup, groupCentroids?)` | `{x,y}[]` | routeWire:432 |
| `addTrunkCables` | `(network, groupCentroids, groupArrangement?)` | `void` | GraphViewContainer:2370 |
| `findNearestIntersection` | `(network, x, y)` | `number` (intersection ID) | EdgeRenderer.ts:644, cable-tray.ts:906 |
| `dijkstraOnTray` | `(tray, startId, endId)` | `number[]` (path of intersection IDs) | pathToWaypoints:914, routeOnTray:914 |
| `pathToWaypoints` | `(tray, path)` | `{x,y}[]` | routeOnTray:917, routeOnTrayByIds:933 |
| `routeOnTray` | `(tray, src, tgt)` | `{x,y}[]` | EdgeRenderer.ts:518 |
| `routeOnTrayByIds` | `(tray, fromId, toId)` | `{x,y}[]` | EdgeRenderer.ts:693 (_drawTrayRoutedBranch input) |
| `findDirectionalIntersection` | `(tray, nx, ny, direction)` | `number` (intersection ID) | GraphViewContainer:2376 |

### Edge Renderer Functions

| Function | Signature | Returns | Called From |
|----------|-----------|---------|-------------|
| `buildCables` | `(edges, resolvePos, cfg)` | `{ cables: Cable[], cabledEdgeIds: Set<string> }` | draw loop (cached) |
| `computeCableLayout` | `(cable, centroids, radii, cfg?)` | `CableLayout \| null` | drawCables:557 |
| `drawCables` | `(g, cables, resolvePos, cfg, densityScale)` | `void` | draw loop |
| `_drawTrayRoutedBranch` | `(g, tray, fromId, toId)` | `void` | drawCables:681,693 |
| `drawEdgeSegment` | `(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength, cableTray, cfg)` | `void` | main loop |

---

## 8. Guide Data Types

### Timeline Guide
```typescript
{
  type: "timeline";
  axisY: number;
  ticks: { x: number; label: string }[];
}
```

### Grid Guide
```typescript
{
  type: "grid";
  verticals: number[];
  horizontals: number[];
  bounds: { xMin, yMin, xMax, yMax };
}
```

### Triangle Guide
```typescript
{
  type: "triangle";
  vertices: [{ x, y }, { x, y }, { x, y }];
}
```

### Concentric Guide
```typescript
{
  type: "concentric";
  rings: number[];
}
```

### Coordinate Guide
```typescript
{
  type: "coordinate";
  system: "polar" | "cartesian";
  gridInfo: ResolvedGridInfo;
  axis1Label?: string;
  axis2Label?: string;
  bounds?: { xMin, yMin, xMax, yMax, maxR? };
}
```

---

## 9. Key Files & Line Numbers

| File | Section | Lines | Purpose |
|------|---------|-------|---------|
| `src/layouts/cable-tray.ts` | Grid-based tray | 71-284 | buildCableTray algorithm |
| `src/layouts/cable-tray.ts` | Phantom tray | 685-811 | buildCableTrayFromPhantoms |
| `src/layouts/cable-tray.ts` | Dijkstra | 821-862 | dijkstraOnTray shortest path |
| `src/layouts/cable-tray.ts` | Pattern routing | 297-434 | routeWire functions |
| `src/layouts/cable-tray.ts` | Directional access | 946-971 | findDirectionalIntersection |
| `src/views/EdgeRenderer.ts` | Cable interfaces | 341-369 | Cable, CableLane, CableLayout |
| `src/views/EdgeRenderer.ts` | Cable building | 376-459 | buildCables |
| `src/views/EdgeRenderer.ts` | Layout computation | 471-536 | computeCableLayout (PROBLEMS 1,2,6) |
| `src/views/EdgeRenderer.ts` | Cable drawing | 546-710 | drawCables (PROBLEM 3) |
| `src/views/EdgeRenderer.ts` | Branch drawing | 717-727 | _drawTrayRoutedBranch (PROBLEM 3) |
| `src/views/EdgeRenderer.ts` | Edge routing | 857-937 | drawEdgeSegment + routeWire |
| `src/views/EdgeRenderer.ts` | Caches | 732-756 | Module-level cache variables |
| `src/views/GraphViewContainer.ts` | Cable tray init | 2343-2351 | buildCableTray entry |
| `src/views/GraphViewContainer.ts` | Cable tray finish | 2359-2380 | _finishCableTray (PROBLEM 5) |
| `src/views/GraphViewContainer.ts` | Tray building | 2382-2645 | _buildCableTrayInner - all guide paths |
| `src/views/GraphViewContainer.ts` | Get tray | 2748-2750 | getCableTray getter |
| `src/layouts/cluster-force.ts` | Guide types | 44-76 | ArrangementGuide union |
| `src/layouts/cluster-force.ts` | Group guides | 109-125 | GroupGuideEntry |
| `src/layouts/cluster-force.ts` | Guide building | 966-1057 | Guide generation per group |

---

## 10. Summary of Architectural Issues

### Critical (Logic Errors)
1. **Cluster ingress caching** (Problem 1): All cables share one entry point per cluster
2. **Dijkstra per-edge per-frame** (Problem 3): ~4M ops per 100-edge cable = catastrophic perf

### High (Visual/Performance)
3. **Perpendicular offset misalignment** (Problem 2): Cables don't feel parallel at tray
4. **Clipping before snapping** (Problem 4): Boundary calculation defeated by tray snap
5. **Directional access bottleneck** (Problem 5): Single junction per cluster enforced

### Medium (Data Order)
6. **Coordinate clipping independent of tray** (Problem 6): Assumes circular boundary, tray may differ

---

## 11. Recommendations

### Short-term Fixes
1. **Cache Dijkstra results** in _drawTrayRoutedBranch:
   - Use frame-local cache: `Map<string, number[]>` indexed by `fromId|toId`
   - Invalidate when tray reference changes
   - Expected perf: 100→1.5M ops for same cable

2. **Fix ingress caching** to allow multiple entries per cluster:
   - Compute unique entry per cable direction
   - Offset perpendicular to centroid-to-centroid line
   - Use cable.cableIndex for variation

3. **Compute local perpendicular offset**:
   - For each segment in trunkPath, compute local perpendicular direction
   - Apply offset based on local geometry, not global direction

### Medium-term Refactoring
4. **Snap to tray FIRST**:
   - Map cluster boundary to nearest tray intersection
   - Use that as entry point source
   - Then offset for parallel cables

5. **Allow multiple access points per cluster**:
   - Instead of single directional intersection, allow N based on node count
   - Distribute nodes round-robin across junctions

6. **Pre-compute branch routes**:
   - During cable layout computation, build route graph for all (node, trunk-endpoint) pairs
   - Use LRU cache keyed by (cable pair, node)

### Long-term
7. **Tray-aware cluster boundary**:
   - Instead of circular radius, use convex hull of accessible tray intersections per cluster
   - Clip at that boundary, not arbitrary circle

---

**End of Report**
