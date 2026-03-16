# Edge Rendering System Research — Graph Island Plugin

## Overview

The edge rendering system in Graph Island is a comprehensive system that handles visualization of graph edges through multiple layers of abstraction. Edges are drawn into a canvas-based graphics context with support for multiple layout modes, bundling strategies, cable routing, and interactive highlighting.

---

## 1. EdgeRenderer.ts — Full Architecture

**File**: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/views/EdgeRenderer.ts` (1337 lines)

### Graphics Primitives Used

The system uses **CanvasGraphics** (canvas 2D API wrapper) with these primitives:

- **lineTo(x, y)** — straight line segments (lines 761, 762, 775, 815, etc.)
- **quadraticCurveTo(cx, cy, x, y)** — Bézier curves (lines 772, 813, 231)
- **bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)** — cubic Bézier (route drawing, line 2320)
- **moveTo(x, y)** — path start/restart (lines 761, 774, 812, etc.)
- **beginFill(color, alpha)** — fill setup (lines 1024, 1036, 1070, 1109)
- **closePath()** — close polygon (lines 1028, 1041, 1074, 1113)
- **setLineDash(segments)** — dash patterns (lines 727, 730, 733)
- **drawCircle(x, y, r)** — circles for cardinality markers (line 2372, 1203)
- **lineStyle(width, color, alpha)** — stroke setup (lines 582, 617, 981, 1023)

### Data Flow: Edge → Screen Pixels

```
drawEdges() [public API, line 902]
  ↓
g.clear() [line 909]
  ↓
Density computation [line 918]
  ↓
Pre-compute edge pair counts (weight) [lines 921-928]
  ↓
Pre-compute direction bundles [lines 931-941] (caching)
  ↓
Build inter-cluster cables [lines 952-962] (caching)
  ↓
drawCables() [line 966] (trunk + fan lines)
  ↓
Main loop: for each edge [lines 969-988]
  ├─ shouldSkipEdge() check [line 972]
  ├─ Resolve source/target positions [lines 974-976]
  ├─ Resolve color & style [lines 978-979]
  ├─ Apply line style [line 981]
  ├─ Apply dash pattern [line 982]
  ├─ drawEdgeSegment() [line 984] (path geometry)
  └─ drawEdgeDecorations() [line 985] (markers/arrows)
  ↓
Canvas 2D context flush via CanvasGraphics._flush()
```

---

## 2. shouldSkipEdge() — Edge Visibility Filtering

**Location**: Lines 92-107

```typescript
function shouldSkipEdge(e: GraphEdge, cfg: EdgeDrawConfig): boolean {
  switch (e.type) {
    case EDGE_TYPE_LINK: return !cfg.showLinks;
    case EDGE_TYPE_TAG: return !cfg.showTagEdges;
    case "category": return !cfg.showCategoryEdges;
    case "semantic": return !cfg.showSemanticEdges;
    case EDGE_TYPE_INHERITANCE: return !cfg.showInheritance;
    case EDGE_TYPE_AGGREGATION: return !cfg.showAggregation;
    case EDGE_TYPE_HAS_TAG: return !cfg.showTagNodes;
    case EDGE_TYPE_SIMILAR: return !cfg.showSimilar;
    case EDGE_TYPE_SIBLING: return !cfg.showSibling;
    case EDGE_TYPE_SEQUENCE: return !cfg.showSequence;
    default: return !cfg.showLinks; // untyped → treated as links
  }
}
```

**Behavior**: Returns `true` to skip rendering. Each edge type has an independent visibility toggle passed in `EdgeDrawConfig`.

**Applied at**:
- Direction bundle pre-computation (line 286)
- Cable bundling pre-computation (line 391)
- Main render loop (line 972)
- Edge label filtering (line 1294)

---

## 3. Edge Types — Rendering Differences

**Types enum**: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/types.ts` lines 37-49

| Type | Visual Style | Color | Dash Pattern | Markers | Used For |
|------|-------------|-------|--------------|---------|----------|
| **link** | Straight/curved | gray (theme-aware) | none | none | Wikilinks between files |
| **tag** | Straight/curved | gray | `[8s, 3s]` dash | none | File→tag associations |
| **has-tag** | Straight/curved | `#b4a0ff` (purple) | `[8s, 3s]` dash | none | Tag hierarchy |
| **semantic** | Straight/curved | gray | `[4s, 4s]` dash | none | Semantic relationships |
| **category** | Straight/curved | gray | none | none | Category field links |
| **inheritance** | Straight/curved | `#9ca3af` (gray) | none | **hollow triangle** (target) | UML generalization |
| **aggregation** | Straight/curved | `#60a5fa` (blue) | none | **hollow diamond** (source) | UML aggregation |
| **similar** | Straight line only | `#fbbf24` (amber) | `[3s, 5s]` dash | none | Similarity edges (no bundling) |
| **sibling** | Straight/curved | `#34d399` (green) | none | none | Peer relationships |
| **sequence** | Straight/curved | `#fb923c` (orange) | none | **filled arrow** (target) | Sequential order |

**Color resolution** (lines 221-238):
- Structural types have hardcoded colors (inheritance, aggregation, similar, has-tag, sibling, sequence)
- Custom relation colors via `colorEdgesByRelation` flag + `relationColors` map
- Fallback: theme-aware gray (0x666666 dark, 0x999999 light)

---

## 4. Cable Mode — Bundle Inter-Cluster Edges

**Purpose**: When nodes are grouped into clusters, cables merge multiple same-cluster-pair edges into parallel "highways" with individual "fan" lines.

### Cable Structure (lines 335-366)

```typescript
interface Cable {
  pairKey: string;                    // "clusterA|clusterB" (alphabetical)
  srcCluster: string;
  tgtCluster: string;
  lanes: CableLane[];                 // One lane per distinct color
  allEdges: GraphEdge[];
  cableIndex: number;                 // Index within parallel cables
  totalCables: number;                // Total cables for this pair
}

interface CableLane {
  color: number;
  edges: GraphEdge[];
}
```

### Cable Layout (lines 458-509)

Computes trunk endpoints clipped to cluster boundaries:
- **trunkStart**: point on source cluster boundary
- **trunkEnd**: point on target cluster boundary
- **offsetX, offsetY**: perpendicular offset for parallel cables

If clusters overlap (distance < 2×radius + margin):
- Trunk endpoints placed at 40% of centroid-centroid line (CABLE_OVERLAP_FRAC)

Parallel cables spaced by `cableSpacing` (default 4px).

### Cable Drawing (lines 519-629)

**Three layers per cable**:

1. **Trunk lines** (line 582-584): ONE stroke per lane color, 2px width, high alpha (0.85)
   - Applies edge weight: `trunkWidth *= sqrt(lane.edges.length)`
   - Highlight: brighter (1.0 alpha) or dimmed (0.15) based on hover

2. **Fan-in lines** (lines 619-621): source nodes → trunk endpoint (straight)
3. **Fan-out lines** (lines 623-625): trunk endpoint → target nodes (straight)
   - Fan alpha: base 0.45 × crowd attenuation
   - Crowd factor: `min(1, CABLE_FAN_CROWD_THRESHOLD / fanCount)` (threshold = 6.0)
   - Non-matching hover: 0.15 × 0.15 = 0.0225 (very dim)

---

## 5. Edge Bundling — Direction-Color Highway Merging

**Purpose**: Reduce visual clutter by grouping spatially proximate, same-direction, same-color edges and curving them through a shared "highway" point.

### Algorithm (lines 277-326)

1. **Angle normalization**: angles [0, π) treat opposite directions as same highway
   - `normalizeAngle()` (lines 262-266)

2. **Spatial grid**: 200px cells (GRID_CELL)

3. **Bin angles**: 6 bins, 30° each (ANGLE_BINS = 6, BIN_WIDTH = π/6)

4. **Group key**: `"{gx},{gy}|{bin}|{color}"`
   - Grid cell (gx, gy) based on edge midpoint
   - Angle bin
   - Edge color (hex)

5. **Accumulate**: sum midpoint coordinates for all edges in group

6. **Output**: centroid if group has ≥ 4 edges (MIN_BUNDLE_SIZE)

### Bundle Strength (line 756, 810)

Interpolates edge toward bundle centroid:
```
controlPoint = midpoint + (bundleGroup.centroid - midpoint) * bundleStrength
```
- bundleStrength ∈ [0, 1]
- 0 = straight lines, 1 = full routing through centroid

### Caching (lines 634-649)

- Recomputes every 3rd frame (`BUNDLE_SKIP = 3`)
- Invalidate via `invalidateBundleCache()` on data/visibility changes

---

## 6. How Edges Connect to Nodes

**Start/end point calculation** (lines 747-777, 974-976)

### Position Resolution

```typescript
private _resolveEdgePos = (ref: string | object):
  typeof ref === "object"
    ? (ref as { x: number; y: number; id?: string })
    : this.pixiNodes.get(ref)?.data;
```

- If `ref` is object: use `{x, y, id}` directly
- If string (node ID): look up in `pixiNodes` map → `.data` (PixiNode.data is position)

### Node Boundary Adjustment

**Generic arrows** (lines 1082-1115):
- Arrow tip placed at: `node_center - direction × (nodeRadius + GENERIC_ARROW_TIP_OFFSET)`
- GENERIC_ARROW_TIP_OFFSET = 2px

**Ontology markers** (lines 1000-1044):
- Inheritance triangle (target): base point at `tgt - direction × EDGE_MARKER_SIZE` (8px)
- Aggregation diamond (source): offset computed from source

**Cardinality markers** (lines 1161-1245):
- Base point: `nearNode + direction × (nodeRadius + cfg.markerOffset)`

---

## 7. Performance Considerations

### Edge Count Handling

**Density-based alpha reduction** (lines 878-888):
- ≤100 edges: full alpha (1.0)
- 100–500: gentle fade (reduction = 0.35)
- 500–2000: aggressive fade (mid-alpha = 0.65)
- >2000: minimal alpha (0.3)
- Floor: `edgeDensityFloor` (default 0.25)

**Arc curve disabling** (line 915):
```
const isArcLayout = cfg.isArcLayout && edges.length < ARC_MAX_EDGE_COUNT;
// ARC_MAX_EDGE_COUNT = 500
```
Reason: quadraticCurveTo generates ~20 vertices vs 4 for lineTo → vertex buffer explosion

**Edge label limit** (line 1302):
```
if (labelable.length > MAX_EDGE_LABELS)  // MAX_EDGE_LABELS = 200
```
Skips labels beyond 200 (prioritizes by combined degree).

### Batching

All edges draw into **single CanvasGraphics** batch (line 909 `g.clear()`, line 1779 single `drawEdgesImpl()` call).

**Separate batches**:
- Edge labels: `edgeLabelContainer` (CanvasContainer) — drawn after edges, before nodes
- Arrows: `arrowGraphics` (separate batch) — drawn on top, re-added to world each frame (line 1811)
- Cables: same batch as regular edges (no separate draw call)

### Cache Invalidation

- **Direction bundles**: invalidate on edge type visibility toggle (line 3156 calls `invalidateBundleCache()`)
- **Cables**: same invalidation as bundles
- **Edge pair counts**: recomputed every frame (lines 921-928) if `edgeWeightThickness` enabled

---

## 8. GraphEdge Type Definition

**Location**: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/types.ts` lines 22-30

```typescript
export interface GraphEdge {
  id: string;                          // Unique edge ID
  source: string;                      // Source node ID
  target: string;                      // Target node ID
  type?: EdgeType;                     // Edge type (link, tag, semantic, etc.)
  label?: string;                      // Custom label (optional)
  relation?: string;                   // Excalibrain-style relation (e.g., "Author")
}
```

**Type field values**: "link" | "tag" | "category" | "reference" | "hierarchy" | "semantic" | "inheritance" | "aggregation" | "has-tag" | "similar" | "sibling" | "sequence"

---

## 9. Render Pipeline — Z-Order & Visibility

**Render order in world container** (lines 985-1050 GraphViewContainer.ts):

```
1. orbitGraphics       (orbital path overlays)
2. sunburstGraphics    (sunburst layout visual)
3. guideLineGraphics   (layout guides, e.g., timeline axes)
4. routeGraphics       (timeline routes — Catmull-Rom curves)
5. groupGridGraphics   (cluster circles and cross-hairs)
6. enclosureGraphics   (tag enclosures)
7. edgeGraphics        ← EDGES DRAWN HERE
8. edgeLabelContainer  (edge labels — CanvasText objects)
9. barGraphics         (timeline bars)
10. batchGraphics      (node batch)
11. arrowGraphics      (directional arrows — re-added to top each frame)
12. barLabelContainer  (timeline bar labels)
13. labelContainer     (node labels)
14. customGridLabelContainer (grid axis labels)
```

**Key z-order facts**:
- Edges always **below nodes** (batchGraphics comes after edgeGraphics)
- Arrows rendered on **top** of nodes (added to world last, line 1811)
- Edge labels between edges and nodes

---

## 10. Path/Route Rendering — Timeline Routes

**Source**: Lines 2271-2323 GraphViewContainer.ts

### TimelineRoute Type

```typescript
interface TimelineRoute {
  groupKey: string;              // Cluster group identifier
  waypoints: { x: number; y: number }[];  // Path points
}
```

Produced by cluster layout (cluster-force.ts) for sequential node chains.

### Route Rendering

**Curve algorithm**: Catmull-Rom to cubic Bézier conversion (lines 2306-2321)

```
For each consecutive pair (p[i], p[i+1]):
  1. Get control points: p[i-1], p[i], p[i+1], p[i+2]
  2. Convert Catmull-Rom to cubic Bézier with tension=0.5
  3. Call g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p[i+1].x, p[i+1].y)
```

**Visual style**:
- Width: scaled by zoom (min 3px at scale 1)
- Color: from cluster group (DEFAULT_COLORS palette, indexed by group key)
- Alpha: 0.55
- Line caps/joins: "round" (smooth curves)

**Visibility**: Controlled by `this.panel.showTimelineRoutes` (line 2278)

---

## 11. Other Path/Guide Rendering

### Orbit Graphics
- Used for orbital layout paths
- Initialized line 991

### Guide Lines (guideLineGraphics)
- Cluster radial guides, axis lines
- Initialized line 1000

### Group Grid
- **Circles**: cluster boundaries (line 2372)
  - Width: zoom-scaled
  - Color: group color from palette
  - Alpha: 0.35
- **Cross-hairs**: center lines (lines 2379-2382)
- **Mid-grid**: half-radius lines (lines 2385-2395)

---

## 12. Key Configuration (EdgeDrawConfig)

**Location**: Lines 14-83 EdgeRenderer.ts

Key toggles control edge rendering:
- `showLinks`, `showTagEdges`, `showCategoryEdges`, `showSemanticEdges`
- `showInheritance`, `showAggregation`, `showSimilar`, `showSibling`, `showSequence`
- `showTagNodes` (controls has-tag edges)
- `colorEdgesByRelation` (color by custom relation)
- `fadeByDegree` (dim low-degree node edges)
- `showArrows`, `showEdgeLabels` (decorations)
- `bundleStrength` (0–1 bundling intensity)
- `cableBundleMode` ("auto", "always", "never")
- `edgeCardinalityMode` ("none", "crowsfoot")
- `edgeWeightThickness` (thicken by edge count)

---

## 13. Constants & Thresholds

**Color palette** (lines 113-120):
- INHERITANCE_COLOR = 0x9ca3af
- AGGREGATION_COLOR = 0x60a5fa
- SIMILAR_COLOR = 0xfbbf24
- HAS_TAG_COLOR = 0xb4a0ff
- SIBLING_COLOR = 0x34d399
- SEQUENCE_COLOR = 0xfb923c

**Bundling** (lines 122-128):
- ANGLE_BINS = 6 (30° each)
- GRID_CELL = 200px
- MIN_BUNDLE_SIZE = 4 edges

**Cable** (lines 132-165):
- CABLE_LANE_SPACING = 3px
- CABLE_LAYOUT_MARGIN = 5px
- DEFAULT_CLUSTER_RADIUS = 50px
- CABLE_FAN_CROWD_THRESHOLD = 6.0 edges

**Density thresholds** (lines 188-208):
- DENSITY_FULL_ALPHA_THRESHOLD = 100
- DENSITY_GENTLE_THRESHOLD = 500
- DENSITY_AGGRESSIVE_THRESHOLD = 2000

---

## 14. Architecture Diagram

```
CanvasGraphics._flush(ctx)
        ↑
        │
drawEdges(g, edges, resolvePos, cfg)
        ├─→ buildDirectionBundles() [pre-compute]
        ├─→ buildCables() [pre-compute]
        ├─→ drawCables() [if hasClusters]
        └─→ for each edge:
            ├─→ shouldSkipEdge()
            ├─→ resolveEdgePos() × 2 (source, target)
            ├─→ resolveEdgeColor()
            ├─→ resolveEdgeStyle()
            ├─→ applyDashPattern()
            ├─→ drawEdgeSegment()
            │   ├─→ straight: g.lineTo()
            │   ├─→ bundled: g.quadraticCurveTo()
            │   └─→ arc: g.quadraticCurveTo()
            └─→ drawEdgeDecorations()
                ├─→ drawEdgeMarker() [ontology]
                ├─→ drawSequenceArrow()
                ├─→ drawGenericArrow()
                └─→ drawCardinalityMarker()
```

---

## Summary: Key Files & Purposes

| File | Purpose | Lines |
|------|---------|-------|
| `/src/views/EdgeRenderer.ts` | Edge drawing engine, bundling, cables, markers | 1337 |
| `/src/views/canvas2d/CanvasGraphics.ts` | Canvas 2D API wrapper | 273 |
| `/src/views/canvas2d/CanvasContainer.ts` | Container for CanvasGraphics batches | – |
| `/src/views/GraphViewContainer.ts` | Main view, assembles edge config, calls drawEdges() | 5000+ |
| `/src/types.ts` | GraphEdge, EdgeType definitions | 400+ |
| `/src/layouts/cluster-force.ts` | Cluster layout, produces timelineRoutes | 1600+ |
