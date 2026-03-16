# Road Network Architecture — Visual Reference

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Graph Island Road Network System                  │
└─────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────┐
│   Cluster-Force Layout Engine   │
│   (src/layouts/cluster-force.ts)│
│                                │
│  generateGuides() →            │
│  ├─ ConcentricGuide            │
│  │  {rings: [100,300,500]}    │
│  ├─ GridGuide                  │
│  │  {verticals,horizontals}    │
│  ├─ TimelineGuide              │
│  │  {axisY, ticks}             │
│  └─ CoordinateGuide            │
│     {system, gridInfo}         │
└────────────────┬───────────────┘
                 │
                 │ ClusterMetadata.groupGuides
                 ▼
┌────────────────────────────────────────────────┐
│  GraphViewContainer._buildRoadNetworkInner()   │
│  (src/views/GraphViewContainer.ts:2289-2459)  │
│                                                │
│  1. Collect positioned nodes                   │
│  2. Parse groupGuides by type                  │
│     ├─ ConcentricGuide → polar roads          │
│     ├─ GridGuide → cartesian roads            │
│     ├─ TimelineGuide → cartesian roads        │
│     └─ CoordinateGuide → merge & densify     │
│  3. Fallback: auto-gen polar (no guides)      │
│  4. Densify grid lines (midpoints)            │
│  5. buildRoadNetwork(RoadNetworkConfig)       │
└────────────────┬───────────────────────────────┘
                 │
                 │ RoadNetworkConfig
                 ▼
┌────────────────────────────────────────────────┐
│     buildRoadNetwork()                         │
│     (src/layouts/road-network.ts:47-230)      │
│                                                │
│  1. Generate intersections at grid crossings  │
│     ├─ Polar: (r, θ) → (cx+r*cos(θ), ...)   │
│     └─ Cartesian: (x, y) → (cx+x, cy+y)     │
│  2. Generate segments between adjacent isects │
│     ├─ Ring segments (polar): arc waypoints  │
│     ├─ Radial segments (polar): straight     │
│     ├─ Horiz segments (cartesian): straight  │
│     └─ Vert segments (cartesian): straight   │
│  3. Build adjacency list (bidirectional)     │
│  4. Map nodes → nearest intersections        │
│     └─ O(n) closest point search             │
│  5. Return RoadNetwork                       │
└────────────────┬───────────────────────────────┘
                 │
                 │ RoadNetwork {intersections[], segments[],
                 │              nodeAccess, adjacency, system, cx, cy}
                 ▼
        ┌────────────────────┐
        │ this.roadNetworkData│
        │ + window.__gi_best  │ (shared across tabs)
        │    RoadNetwork      │
        └────────────┬───────┘
                     │
         ┌───────────┴──────────┐
         │                      │
         ▼                      ▼
  ┌─────────────────┐    ┌──────────────────┐
  │ drawRoadNetwork │    │ drawEdges() with │
  │ (lines 2471-    │    │ road routing     │
  │  2525)          │    │ (EdgeRenderer)   │
  │                 │    │                  │
  │ • LOD culling   │    │ • routeEdge()    │
  │ • Alpha fading  │    │ • Dijkstra       │
  │ • Render segments   │ • Cache waypoints│
  │ • Waypoint curves   │ • Quadratic curves
  └─────────────────┘    └──────────────────┘
         │                      │
         ▼                      ▼
    roadGraphics          edgeGraphics
       (visual)            (visual)
```

---

## Road Network Data Structure

```
RoadNetwork {
  ┌─────────────────────────────────────────┐
  │ intersections: RoadIntersection[]        │
  │ [                                       │
  │   {id:0, x:0, y:0},     ← center       │
  │   {id:1, x:100, y:0},                  │
  │   {id:2, x:100, y:100},                │
  │   ...                                   │
  │ ]                                       │
  └─────────────────────────────────────────┘

  ┌──────────────────────────────────────────────┐
  │ segments: RoadSegment[]                      │
  │ [                                            │
  │   {from:0, to:1, waypoints:[], len:100},   │
  │   {from:1, to:2, waypoints:[], len:100},   │
  │   {from:0, to:3,                           │
  │    waypoints:[{x:50,y:50},...], len:106},  │
  │   ...                                        │
  │ ]                                            │
  └──────────────────────────────────────────────┘

  ┌────────────────────────────────────┐
  │ nodeAccess: Map<nodeId, isectId>   │
  │ {                                  │
  │   "file.md": 1,  ← file at isect 1│
  │   "note.md": 2,  ← note at isect 2│
  │   ...                              │
  │ }                                  │
  └────────────────────────────────────┘

  ┌────────────────────────────────────────────┐
  │ adjacency: Map<isectId, neighbor[]>        │
  │ {                                          │
  │   0: [{to:1, weight:100, segIdx:0}, ...] │
  │   1: [{to:0, weight:100, segIdx:0},      │
  │        {to:2, weight:100, segIdx:1}, ...] │
  │   ...                                      │
  │ }                                          │
  └────────────────────────────────────────────┘

  system: "polar"     ← or "cartesian"
  cx: 150, cy: 150    ← network center (world coords)
}
```

---

## Edge Routing Pipeline

```
Edge (source, target, type)
│
└─→ drawEdgeSegment(g, src, tgt, e, ...)
    │
    ├─ Check: isArcLayout?
    │  └─ YES → drawArcCurve() [skip roads]
    │
    └─ NO → Check: roadNetwork exists & non-empty?
       │
       ├─ NO → Check: bundles exist?
       │      └─ YES → drawBundledSegment()
       │      └─ NO → drawStraightLine()
       │
       └─ YES → Check: cache hit?
              │
              ├─ YES → use cached waypoints
              │
              └─ NO → Call: routeEdge(network, srcId, tgtId)
                     │
                     ├─ nodeAccess.get(srcId) → startIsect
                     ├─ nodeAccess.get(tgtId) → endIsect
                     │
                     └─ findShortestPath(startIsect, endIsect)
                        │
                        ├─ Dijkstra algorithm
                        │  (simple O(n²) priority queue)
                        │
                        └─ pathToWaypoints(path)
                           └─ Include arc waypoints
                              for curved segments
                                  │
                                  └─ Cache result
                                     Draw via quadratic curves
```

---

## Polar Road Network (Concentric)

```
Input: ConcentricGuide {rings: [100, 300, 500]}

                        Densified grid:
Spokes (θ)              Rings (r)
   ↓                    ↓
   0°                   50  100  150  200  250  300  350  400  450  500
   ↓                    ↓
┌──────────────┐
│      ·········· Ring 100 (8 waypoints per arc)
│   /····  ····\
│  /····     ····\
│ |·········  ····|  Ring 300 (densified midpoint)
│ |····         ····|
│  \····     ····/
│   \····  ····/
│    ··········  Ring 500
│
│ Spokes: 16-48 radial lines at uniform angles
└──────────────┘

Segments:
├─ Ring segments (arc): from (r[i], θ[j]) to (r[i], θ[j+1])
│  waypoints: 8-point arc interpolation
│  length: r[i] * |θ[j+1] - θ[j]|
│
└─ Radial segments (straight): from (r[i], θ[j]) to (r[i+1], θ[j])
   waypoints: []
   length: r[i+1] - r[i]
```

---

## Cartesian Road Network (Grid)

```
Input: GridGuide {
  verticals: [100, 300],
  horizontals: [50, 200]
}

Densified grid (with midpoints):
         x-axis (verticals)
         ↓
    50 100 150 200 250 300
    ↓  ↓   ↓   ↓   ↓   ↓
   ┌──┬──┬──┬──┬──┬──┐
25 ├──┼──┼──┼──┼──┼──┤
   ├──┼──┼──┼──┼──┼──┤ y-axis
50 ├──┼──┼──┼──┼──┼──┤ (horizontals)
   ├──┼──┼──┼──┼──┼──┤
125├──┼──┼──┼──┼──┼──┤
   ├──┼──┼──┼──┼──┼──┤
200├──┼──┼──┼──┼──┼──┤
   ├──┼──┼──┼──┼──┼──┤
   └──┴──┴──┴──┴──┴──┘

Segments:
├─ Horizontal: (x[i], y[j]) to (x[i+1], y[j])
│  waypoints: []
│  length: x[i+1] - x[i]
│
└─ Vertical: (x[i], y[j]) to (x[i], y[j+1])
   waypoints: []
   length: y[j+1] - y[j]
```

---

## Guide Type Processing

```
ClusterMetadata.groupGuides

│
├─ ConcentricGuide
│  {type: "concentric", rings: number[]}
│  │
│  └─→ buildRoadNetwork({
│      system: "polar",
│      axis1Lines: densified rings,
│      axis2Lines: uniform spokes,
│      cx, cy
│    })
│
├─ GridGuide
│  {type: "grid", verticals, horizontals, bounds}
│  │
│  └─→ buildRoadNetwork({
│      system: "cartesian",
│      axis1Lines: densified verticals,
│      axis2Lines: densified horizontals,
│      cx, cy
│    })
│
├─ TimelineGuide
│  {type: "timeline", axisY, ticks: {x, label}[]}
│  │
│  └─→ buildRoadNetwork({
│      system: "cartesian",
│      axis1Lines: tick positions,
│      axis2Lines: [axisY],
│      cx, cy
│    })
│
└─ CoordinateGuide
   {type: "coordinate", system, gridInfo}
   │
   ├─ Merge all coordinate guides' axis lines
   │  (combine axis1Lines + axis2Lines from all groups)
   │
   └─→ buildRoadNetwork({
       system: guide.system,
       axis1Lines: merged axis1,
       axis2Lines: merged axis2,
       cx, cy
     })
```

---

## Dijkstra Shortest Path

```
findShortestPath(network, startId, endId)

Initialize:
  dist = {startId: 0}
  prev = {}
  visited = {}
  queue = [{id: startId, d: 0}]

Loop:
  1. Extract min from queue (O(n) search)
     current = startId

  2. If current === endId → done

  3. For each neighbor in adjacency[current]:
     if neighbor not visited:
       newDist = dist[current] + weight
       if newDist < dist[neighbor]:
         dist[neighbor] = newDist
         prev[neighbor] = current
         queue.push({id: neighbor, d: newDist})

Reconstruct:
  path = []
  cur = endId
  while cur !== startId:
    path.unshift(cur)
    cur = prev[cur]
  path.unshift(startId)

Return: path (intersection ID sequence)

Time: O(k²) where k = intersection count
Space: O(k)

Typical: 100 isects → <1ms
         1000 isects → ~10-50ms
         10000 isects → >200ms
```

---

## Edge Rendering Priority

```
Edge rendering decision tree:

if isArcLayout
  ├─ YES → drawArcCurve()          [HIGHEST PRIORITY]
  │        (straight lines with arc curvature)
  │        roads IGNORED
  │
  └─ NO → if roadNetwork exists & !empty
          ├─ YES → routeEdge()     [HIGH PRIORITY]
          │        (Dijkstra + quadratic curves)
          │        roads USED
          │
          └─ NO → if bundles exist
                  ├─ YES → drawBundledSegment()  [MEDIUM]
                  │        (direction-bundled curves)
                  │
                  └─ NO → drawStraightLine()     [LOW]
                          (simple straight line)

Note: Each edge type checked by shouldSkipEdge()
      (showLinks, showTagEdges, etc. toggles)
```

---

## Cache Management

```
Module scope (EdgeRenderer.ts):
┌────────────────────────────────────┐
│ _roadRouteCache (Map)              │
│ [                                  │
│   "file-1|file-2": [{x,y}, ...],  │
│   "file-3|file-4": [{x,y}, ...],  │
│   ...                              │
│ ]                                  │
│                                    │
│ _roadRouteCacheNetwork (RoadNetwork)
│ (tracks current network reference) │
└────────────────────────────────────┘
           ↑
           │ Invalidate when:
           ├─ _roadRouteCacheNetwork reference changes
           ├─ buildRoadNetwork() called
           └─ Layout changed

Global scope (window):
┌────────────────────────────────────┐
│ window.__gi_bestRoadNetwork        │
│ (highest-quality network across   │
│  all GraphViewContainer instances) │
└────────────────────────────────────┘
           ↑
           │ Set by: _setBestRoadNetwork()
           │ (picks network with most isects)
           │
           │ Retrieved by: getRoadNetwork()
           │ (returns best or instance)
```

---

## LOD (Level of Detail)

```
Zoom level vs. road visibility:

1.0  ┌────────────────────── Full visibility
     │  roads fully opaque (alpha = baseAlpha)
     │
0.2  ├─────────────┐
     │ alpha fade  │  Alpha = baseAlpha * (zoom - minZoom) / (2*minZoom - minZoom)
     │             │
0.1  ├─────────────┘
     │ roadMinZoom  roads culled (alpha = 0)
     │
0.0  └────────────────────── Entire graph visible
              zoom = worldScale

Default:
  roadMinZoom = 0.10 (roads only show at 10%+ zoom)
  baseAlpha = 0.12   (roads semi-transparent)
  fade between 0.10 and 0.20
```

---

## Rendering Path (Actual Drawing)

```
drawRoadNetwork() {
  const network = getRoadNetwork();
  if (!network || network.intersections.length === 0) return;

  // LOD check
  if (worldScale < roadMinZoom) return;  // ← Culled

  // Alpha fade
  const fadeAlpha = baseAlpha * fadeFactor;

  // Draw each segment
  for (const seg of network.segments) {
    const from = network.intersections[seg.from];
    const to = network.intersections[seg.to];

    g.lineStyle(width, color, fadeAlpha);
    g.moveTo(from.x, from.y);

    // Include waypoints (arc segments)
    for (const wp of seg.waypoints) {
      g.lineTo(wp.x, wp.y);
    }

    g.lineTo(to.x, to.y);
  }
}

Visual result:
┌─────────────────────┐
│  Ring roads (arcs)  │
│    with slight      │
│  purple/gray tint   │
│  (semi-transparent) │
│                     │
│  Spoke roads        │
│  (straight radials) │
│                     │
│  Edges curve along  │
│  roads via waypoints│
└─────────────────────┘
```

---

## Same-Intersection Routing

```
When sourceNode & targetNode map to same intersection:

routeEdge(network, "node-a", "node-b")
│
├─ nodeAccess.get("node-a") → isect_id = 5
├─ nodeAccess.get("node-b") → isect_id = 5
│
├─ startIsect === endIsect → handle special case
│  │
│  ├─ neighbors = adjacency[5] = [
│  │    {to: 3, weight: 50},
│  │    {to: 7, weight: 60},
│  │    ...
│  │  ]
│  │
│  └─ bestNeighbor = 3 (shortest segment)
│
└─ pathToWaypoints([5, 3])
   │
   ├─ Start: node-a position
   ├─ Waypoints: route to neighbor 3
   └─ End: node-b position
      (note: doesn't return to 5)

Visual result:
  node-a ····> (road to neighbor 3) > node-b
         edge bulges outward
```

---

## Error Handling (Current)

```
routeEdge() failures:

Case 1: Node not in nodeAccess
  if (startIsect == null || endIsect == null)
    return [];  ← Silent empty array

  Result: Edge falls back to straight line
          No warning to user

Case 2: No path between intersections
  if (path.length < 2)
    return [];  ← Silent empty array

  Result: Edge falls back to straight line
          No indication routing failed

Case 3: Network unavailable
  In drawEdgeSegment():
    if (waypoints.length >= 2)
      ✓ route via waypoints
    else
      [fall through]  ← Silent fallback

  Result: Edge drawn straight
          No indication roads unavailable

Issue: All failures silent
       User cannot debug or report issues
```

---

## Configuration Impact

```
RenderThresholds impact on roads:

showRoadNetwork
  ├─ true → roads drawn
  └─ false → roads hidden (LOD check skipped)

roadMinZoom (default: 0.10)
  ├─ Increase → roads visible at lower zoom
  └─ Decrease → roads culled at lower zoom

roadAlpha (default: 0.12)
  ├─ Increase → roads more opaque
  └─ Decrease → roads fainter

roadColor
  ├─ Dark theme: 0x555577 (muted purple)
  └─ Light theme: 0xaaaacc (light purple)

roadWidth (default: 4)
  ├─ Increase → roads thicker
  └─ Decrease → roads thinner

roadRingCount / roadSpokeCount
  ├─ Auto-calculated if undefined
  ├─ If set: overrides auto-calculation
  └─ Higher count → denser grid

Example: For better visibility at low zoom
  roadMinZoom: 0.05  (show roads at 5%+ zoom)
  roadAlpha: 0.25    (more visible)
  roadColor: 0x7777bb (brighter)
```

---

**Diagrams generated**: 2026-03-16
**Status**: Reference complete
