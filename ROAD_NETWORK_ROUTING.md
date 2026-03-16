# Road Network & Edge Routing Design

## RoadNetwork Data Structure

### Core Components

```typescript
interface RoadNetwork {
  // Graph vertices
  intersections: RoadIntersection[];

  // Graph edges with curved segments
  segments: RoadSegment[];

  // Node allocation map
  nodeAccess: Map<string, number>;

  // Graph adjacency (neighbor lookup)
  adjacency: Map<number, EdgeInfo[]>;

  // Metadata
  system: "polar" | "cartesian";
  cx: number;
  cy: number;
}

interface RoadIntersection {
  id: number;        // Index into intersections array
  x: number;         // World coordinates
  y: number;
}

interface RoadSegment {
  from: number;          // Intersection ID (start)
  to: number;            // Intersection ID (end)
  waypoints: Point[];    // Intermediate curve waypoints
  length: number;        // Arc/path length for Dijkstra weight
}

// Adjacency list entry
type EdgeInfo = {
  to: number;           // Target intersection ID
  weight: number;       // Segment length
  segIdx: number;       // Index into segments array
};
```

---

## Road Network Types

### 1. Polar Coordinate System (Rings + Spokes)

**Architecture**
```
            Spoke 3
                |
        ╱───────╲
    ╱   Ring 3    ╲
  ╱           Spoke 2
 │  ┌──────╖
 │  │Ring 2 │
 │  └──────╜
 │    ╱  ╲
 │   ╱    ╲
  ╲ /      ╲ /
   ╱        ╲
Ring 1 (center)
```

**Intersection Generation**
- Center point: (cx, cy) with ID=0
- For each ring radius r ∈ axis1Lines:
  - For each spoke angle θ ∈ axis2Lines:
    - Create intersection at (cx + r·cos(θ), cy + r·sin(θ))

**Example**: 3 rings, 8 spokes = 1 center + 3×8 = 25 intersections

**Segment Types**

1. **Ring Segments** (Along constant r, between adjacent θ)
   - From: (r, θ₁)
   - To: (r, θ₂)
   - Waypoints: Bézier arc with ~8 intermediate points
   - Length: Arc length = r × (θ₂ - θ₁)

2. **Radial Segments** (Along constant θ, between adjacent r)
   - From: (r₁, θ)
   - To: (r₂, θ)
   - Waypoints: Empty (straight line)
   - Length: r₂ - r₁
   - Special: Center → first ring also radial

**Adjacency Graph**
- Each intersection connected to:
  - 2 ring neighbors (previous/next angle on same ring)
  - Up to 2 radial neighbors (ring above/below)

---

### 2. Cartesian Coordinate System (Manhattan Grid)

**Architecture**
```
Y
↑    ┌────┬────┬────┐
│    │    │    │    │
└────┼────┼────┼────┘
     │    │    │    │
    ─┴────┴────┴────┴─→ X
```

**Intersection Generation**
- For each x ∈ axis1Lines:
  - For each y ∈ axis2Lines:
    - Create intersection at (cx + x, cy + y)

**Example**: 8 vertical lines, 8 horizontal lines = 8×8 = 64 intersections

**Segment Types**

1. **Horizontal Segments** (Constant y, between adjacent x)
   - From: (x₁, y)
   - To: (x₂, y)
   - Waypoints: Empty (straight line)
   - Length: x₂ - x₁

2. **Vertical Segments** (Constant x, between adjacent y)
   - From: (x, y₁)
   - To: (x, y₂)
   - Waypoints: Empty (straight line)
   - Length: y₂ - y₁

**Adjacency Graph**
- Each intersection connected to:
  - Up to 2 horizontal neighbors (left/right)
  - Up to 2 vertical neighbors (up/down)
  - Total degree: 2-4 (interior cells have 4 neighbors)

---

## Node Allocation (nodeAccess Mapping)

### Objective
Map each GraphNode to the closest point on the road network, enabling edges to be routed via intersections/segments.

### Algorithm

```typescript
for (const node of cfg.nodes) {
  let bestId = 0;
  let bestDist = Infinity;
  let bestSegIdx = -1;
  let bestT = 0;

  // Step 1: Check all intersections
  for (const isect of intersections) {
    const d = (node.x - isect.x)² + (node.y - isect.y)²;
    if (d < bestDist) {
      bestDist = d;
      bestId = isect.id;
      bestSegIdx = -1;
    }
  }

  // Step 2: (Cartesian only) Check segment midpoints
  if (cfg.system === "cartesian") {
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (seg.waypoints.length > 0) continue; // skip curved segments

      const from = intersections[seg.from];
      const to = intersections[seg.to];

      // Project node onto segment
      const t = clamp(project(node, from, to), 0, 1);

      // Skip near endpoints (existing intersections handle those)
      if (t <= 0.05 || t >= 0.95) continue;

      const proj = lerp(from, to, t);
      const d = distance(node, proj)²;

      if (d < bestDist) {
        bestDist = d;
        bestSegIdx = si;
        bestT = t;
      }
    }
  }

  // Step 3: Create intersection if best is mid-segment
  if (bestSegIdx >= 0) {
    const seg = segments[bestSegIdx];
    const newIsect = {
      id: intersections.length,
      x: lerp(intersections[seg.from], intersections[seg.to], bestT).x,
      y: lerp(intersections[seg.from], intersections[seg.to], bestT).y,
    };
    intersections.push(newIsect);

    // Split segment: seg.from → newIsect → seg.to
    // Update adjacency, create two new segments

    nodeAccess.set(node.id, newIsect.id);
  } else {
    nodeAccess.set(node.id, bestId);
  }
}
```

### Example (Cartesian)
```
Node at (105, 405)
Intersections: (100, 400), (100, 500), (200, 400), (200, 500)
Segments: (100,400)-(100,500), (100,400)-(200,400), etc.

Best intersection: (100, 400) distance=√((5²+5²)) ≈ 7.07
Segment midpoint check:
  • (100,400)-(100,500): Project → (100, 405), distance = 5
  • (100,400)-(200,400): Project → (105, 400), distance = 5

Best: Segment (100,400)-(100,500) at t=0.5
New intersection created at (100, 405)
nodeAccess["nodeId"] = newIsect.id
```

### Polar Behavior
- **No mid-segment snapping** (only intersections)
- Ring arcs have waypoints (not flat), so mid-segment snapping skipped
- Nodes snap to nearest ring-spoke intersection

---

## Edge Routing (Dijkstra Shortest Path)

### routeEdge() High-Level Algorithm

```typescript
function routeEdge(network: RoadNetwork, srcId: string, tgtId: string): Point[] {
  // Step 1: Lookup node intersection IDs
  const startIsect = network.nodeAccess.get(srcId);
  const endIsect = network.nodeAccess.get(tgtId);

  if (!startIsect || !endIsect) return [];

  // Step 2: Special case - same intersection
  if (startIsect === endIsect) {
    // Route through a neighbor (to show visible road path)
    const neighbors = network.adjacency.get(startIsect);
    if (!neighbors) return [];

    const best = neighbors[0];  // Pick first neighbor
    const outPath = pathToWaypoints(network, [startIsect, best.to]);
    return outPath;
  }

  // Step 3: Dijkstra shortest path
  const path = findShortestPath(network, startIsect, endIsect);
  if (path.length < 2) return [];

  // Step 4: Convert path to waypoints (including arc waypoints)
  return pathToWaypoints(network, path);
}
```

### findShortestPath() (Dijkstra)

```typescript
function findShortestPath(
  network: RoadNetwork,
  startId: number,
  endId: number
): number[] {
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const visited = new Set<number>();
  const queue: { id: number; d: number }[] = [];

  // Initialize
  dist.set(startId, 0);
  queue.push({ id: startId, d: 0 });

  // Main loop
  while (queue.length > 0) {
    // Extract minimum distance node
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].d < queue[minIdx].d) minIdx = i;
    }
    const { id: u } = queue.splice(minIdx, 1)[0];

    if (visited.has(u)) continue;
    visited.add(u);

    if (u === endId) break;  // Found target

    // Relax edges
    const neighbors = network.adjacency.get(u);
    if (!neighbors) continue;

    const du = dist.get(u) ?? Infinity;
    for (const { to: v, weight } of neighbors) {
      if (visited.has(v)) continue;
      const newDist = du + weight;
      if (newDist < (dist.get(v) ?? Infinity)) {
        dist.set(v, newDist);
        prev.set(v, u);
        queue.push({ id: v, d: newDist });
      }
    }
  }

  // Reconstruct path
  if (!prev.has(endId) && startId !== endId) return [];
  const path: number[] = [];
  let cur = endId;
  while (cur !== startId) {
    path.unshift(cur);
    const p = prev.get(cur);
    if (p == null) return [];
    cur = p;
  }
  path.unshift(startId);
  return path;
}
```

**Complexity**: O(I² × log I) for I intersections (simple priority queue)

### pathToWaypoints() - Flatten Path to Coordinates

```typescript
function pathToWaypoints(network: RoadNetwork, path: number[]): Point[] {
  if (path.length === 0) return [];

  const pts: Point[] = [];

  // Add first intersection
  pts.push(network.intersections[path[0]]);

  // For each segment in path
  for (let i = 0; i < path.length - 1; i++) {
    const fromId = path[i];
    const toId = path[i + 1];

    // Find segment connecting these two intersections
    const seg = network.segments.find(s =>
      (s.from === fromId && s.to === toId) ||
      (s.from === toId && s.to === fromId)
    );

    if (seg) {
      // Add waypoints (reverse if backward traversal)
      const wps = seg.from === fromId ? seg.waypoints : [...seg.waypoints].reverse();
      for (const wp of wps) {
        pts.push(wp);
      }
    }

    // Add destination intersection
    pts.push(network.intersections[toId]);
  }

  return pts;
}
```

### Example Routing (Polar)

```
Network: 2 rings, 4 spokes
Intersections (IDs in brackets):
  Ring 1 (r=100):
    [1] (100,0)  [2] (0,100)  [3] (-100,0)  [4] (0,-100)
  Ring 2 (r=200):
    [5] (200,0)  [6] (0,200)  [7] (-200,0)  [8] (0,-200)
  Center: [0] (0,0)

Route from intersection 1 to intersection 7:
  Options:
    • 1 → 0 → 7 (center route): distance = 100 + 200 = 300
    • 1 → 2 → 6 → 7 (ring route): distance = 78.5 + 78.5 + 78.5 = 235.5
    • 1 → 5 → 6 → 7 (mix): distance = 100 + 141.4 + 78.5 = 320

Dijkstra finds shortest: 1 → 2 → 6 → 7

Path→Waypoints:
  1. (100, 0) [intersection 1]
  2. (70.7, 70.7) [waypoint on ring 1 arc from 1 to 2]
  3. (0, 100) [intersection 2]
  4. (0, 150) [waypoint on radial from ring 1 to ring 2]
  5. (0, 200) [intersection 6]
  6. (-70.7, 70.7) [waypoint on ring 2 arc from 6 to 7]
  7. (-200, 0) [intersection 7]
```

---

## Trunk Road Integration

### Purpose
**Trunk roads** connect cluster centroids, providing direct highways for cross-cluster edge routing.

### addTrunkRoads() Algorithm

```typescript
function addTrunkRoads(
  network: RoadNetwork,
  groupCentroids: { x: number; y: number }[]
): void {
  if (groupCentroids.length < 2) return;

  // Step 1: For each centroid, find or create nearest intersection
  const centroidIsects: number[] = [];
  for (const c of groupCentroids) {
    let bestId = -1;
    let bestDist = Infinity;

    // Find nearest existing intersection
    for (const isect of network.intersections) {
      const d = (c.x - isect.x)² + (c.y - isect.y)²;
      if (d < bestDist) {
        bestDist = d;
        bestId = isect.id;
      }
    }

    // If no nearby intersection, create new one
    if (bestId < 0 || bestDist > THRESHOLD) {
      bestId = network.intersections.length;
      network.intersections.push({ id: bestId, x: c.x, y: c.y });
      if (!network.adjacency.has(bestId)) {
        network.adjacency.set(bestId, []);
      }
    }

    centroidIsects.push(bestId);
  }

  // Step 2: Connect consecutive centroids
  for (let i = 0; i < centroidIsects.length - 1; i++) {
    const fromId = centroidIsects[i];
    const toId = centroidIsects[i + 1];
    if (fromId === toId) continue;

    const from = network.intersections[fromId];
    const to = network.intersections[toId];
    const dist = Math.sqrt((to.x - from.x)² + (to.y - from.y)²);

    // Create segment
    const segIdx = network.segments.length;
    network.segments.push({
      from: fromId,
      to: toId,
      waypoints: [],
      length: dist
    });

    // Update adjacency
    if (!network.adjacency.has(fromId)) network.adjacency.set(fromId, []);
    if (!network.adjacency.has(toId)) network.adjacency.set(toId, []);
    network.adjacency.get(fromId)!.push({ to: toId, weight: dist, segIdx });
    network.adjacency.get(toId)!.push({ to: fromId, weight: dist, segIdx });
  }

  // Step 3: (Optional) Connect first and last for circular arrangements
  if (centroidIsects.length > 2) {
    const firstId = centroidIsects[0];
    const lastId = centroidIsects[centroidIsects.length - 1];
    if (firstId !== lastId) {
      // ... add segment from last to first ...
    }
  }
}
```

### Example: 3 Clusters

```
BEFORE addTrunkRoads:
  Road network has intersections at grid points only
  Centroids at: CX (100, 100), CY (400, 100), CZ (250, 400)

PROCESS:
  1. CX → nearest intersection (100, 100) [or create new]
  2. CY → nearest intersection (400, 100) [or create new]
  3. CZ → nearest intersection (250, 400) [or create new]

  centroidIsects = [id_cx, id_cy, id_cz]

  Connect: id_cx ↔ id_cy (straight trunk)
  Connect: id_cy ↔ id_cz (straight trunk)
  Connect: id_cz ↔ id_cx (circular closure, optional)

AFTER addTrunkRoads:
  New intersections: ±0-3 (at centroids if needed)
  New segments: 2-3 (trunk roads)

RESULT: Cross-cluster edges can route:
  X → Y via trunk road (direct)
  Y → Z via trunk road (direct)
  X → Z via trunk roads (via both)
```

---

## Caching & Invalidation

### Route Cache

**Structure**
```typescript
let _roadRouteCache = new Map<string, Point[]>();
let _roadRouteCacheNetwork: RoadNetwork | null = null;

// Cache key: srcId|tgtId (canonical order)
```

**Lookup Flow**
```
drawEdgeSegment(src, tgt, ..., roadNetwork) {
  if (roadNetwork !== _roadRouteCacheNetwork) {
    // Network changed → clear cache
    _roadRouteCache.clear();
    _roadRouteCacheNetwork = roadNetwork;
  }

  const key = srcId < tgtId ? `${srcId}|${tgtId}` : `${tgtId}|${srcId}`;
  let waypoints = _roadRouteCache.get(key);

  if (!waypoints) {
    // Cache miss → compute
    waypoints = routeEdge(roadNetwork, srcId, tgtId);
    _roadRouteCache.set(key, waypoints);
  }

  // Use waypoints for drawing
}
```

**Invalidation Triggers**
1. New RoadNetwork object created (e.g., topology change)
2. `invalidateBundleCache()` called (clears all caches)

**Benefit**: Avoids re-running Dijkstra for same edge pairs across frames

---

## Road Rendering (Visual Overlay)

### drawRoadNetwork() in GraphViewContainer

Renders road network as semi-transparent overlay:
```typescript
drawRoadNetwork() {
  if (!this.routeGraphics || !this.cableTrayData) return;

  const network = this.cableTrayData;

  // Draw intersections as small circles
  for (const isect of network.intersections) {
    this.routeGraphics.fillStyle(0x00FF00, 0.3);
    this.routeGraphics.fillCircle(isect.x, isect.y, 2);
  }

  // Draw segments as lines
  for (const seg of network.segments) {
    const from = network.intersections[seg.from];
    const to = network.intersections[seg.to];

    this.routeGraphics.lineStyle(1, 0x0000FF, 0.2);
    this.routeGraphics.moveTo(from.x, from.y);

    // Draw through waypoints
    for (const wp of seg.waypoints) {
      this.routeGraphics.lineTo(wp.x, wp.y);
    }

    this.routeGraphics.lineTo(to.x, to.y);
  }
}
```

**Visual Effect**: Semi-transparent grid overlaid on graph, showing routing highways

---

## Performance Notes

### Dijkstra Complexity
- **Best case**: Fully connected graph, ~O(I × log I)
- **Worst case**: Sparse graph, ~O(I²) with simple priority queue
- **Typical**: ~100-300 intersections → ~100-1000 path calculations per frame, but cached

### Caching ROI
- **Without cache**: ~10,000 routeEdge() calls per frame (edges × frames)
- **With cache**: ~10,000 routeEdge() calls once, reused across frames
- **Speedup**: ~100-1000× during animation when topology stable

### Grid Size Impact
- Polar: I = 1 + r_count × θ_count
  - 10 rings × 12 spokes = 121 intersections
  - 20 rings × 16 spokes = 321 intersections
- Cartesian: I = x_count × y_count
  - 8 × 8 = 64 intersections
  - 16 × 16 = 256 intersections

**Sparse networks (~100-300 intersections) optimal for responsiveness**

---

## Integration with Cable Bundling

### Relationship
- **Cable trunks**: Visual representation of cluster-to-cluster flow
- **Road network**: Infrastructure for routing individual edges

### Routing Flow
```
Inter-cluster edge (in cable):
  Fan-in: Node → trunk endpoint (straight, visual only)
  Trunk: Cluster A boundary → Cluster B boundary (visual, structural)
  Fan-out: Trunk endpoint → target node (straight, visual)

Individual non-cabled edge:
  Routed via roadNetwork via routeEdge()
  Path: Node → waypoints on roads → target node
  Visual: Quadratic curves connecting waypoints
```

### Why Both?
- **Cables**: Merge many same-color edges into single visual strand
- **Road routing**: Ensure individual edges follow geometric highways
- **Combined**: High-level cable structure + detailed edge routing pathways

---

## Configuration Examples

### Polar (Concentric Arrangement)
```javascript
{
  system: "polar",
  axis1Lines: [
    {position: 100},
    {position: 200},
    {position: 300}
  ],
  axis2Lines: Array(8).fill(0).map((_, i) => ({
    position: (i / 8) * Math.PI * 2
  })),
  axis1Shape: "circle",
  axis2Shape: "radial",
  cx: 0, cy: 0,
  bounds: {...},
  nodes: allNodes
}
→ 1 + 3×8 = 25 intersections
→ 3×8 ring segments (arcs) + 8 radial segments
→ Roads: rings + spokes
```

### Cartesian (Grid Arrangement)
```javascript
{
  system: "cartesian",
  axis1Lines: [
    {position: -400},
    {position: -200},
    {position: 0},
    {position: 200},
    {position: 400}
  ],
  axis2Lines: [
    {position: -300},
    {position: -150},
    {position: 0},
    {position: 150},
    {position: 300}
  ],
  axis1Shape: "line",
  axis2Shape: "line",
  cx: 0, cy: 0,
  bounds: {...},
  nodes: allNodes
}
→ 5 × 5 = 25 intersections
→ 4×5 horizontal segments + 5×4 vertical segments
→ Roads: Manhattan grid
```

---

## Debugging & Visualization

**Road network rendering**: `drawRoadNetwork()` shows grid overlay
- Green circles: Intersections
- Blue lines: Segments (with waypoints for arcs)

**Route caching**: Monitor `_roadRouteCache` size
- Should stabilize at ~E edges (one route per unique pair)
- If growing unbounded → network reference changes too frequently

**Node access**: `nodeAccess` map shows node-to-intersection allocation
- All nodes should have valid intersection IDs
- Some nodes may create new intersections (segment splitting)

**Trunk roads**: Check `cableTrayData.segments` for trunk road entries
- Should have 2-N_clusters segments (linear chain)
- Plus optional closing segment for circular arrangements
