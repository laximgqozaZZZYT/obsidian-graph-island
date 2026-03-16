# Cable & Edge Rendering Type Reference

Complete type definitions and data structures used throughout the cable/edge rendering pipeline.

---

## Road Network Types (cable-tray.ts)

### RoadIntersection
```typescript
interface RoadIntersection {
  id: number;       // Unique intersection ID (index)
  x: number;        // World coordinate
  y: number;        // World coordinate
}
```
**Purpose**: Vertex in the road network graph. Nodes are mapped to nearest intersections.

### RoadSegment
```typescript
interface RoadSegment {
  from: number;              // Source intersection ID
  to: number;                // Target intersection ID
  waypoints: { x: number; y: number }[];  // Intermediate curve points
  length: number;            // Arc or path length (for Dijkstra weight)
}
```
**Purpose**: Edge in the road network graph. Waypoints define curves (polar arcs) or are empty (cartesian lines).

### RoadNetwork
```typescript
interface RoadNetwork {
  intersections: RoadIntersection[];
  segments: RoadSegment[];
  nodeAccess: Map<string, number>;     // node ID → intersection ID
  adjacency: Map<number, {
    to: number;
    weight: number;
    segIdx: number;
  }[]>;
  system: "polar" | "cartesian";
  cx: number;                          // Center X (world coordinates)
  cy: number;                          // Center Y (world coordinates)
}
```
**Purpose**: Complete road infrastructure. Used for edge routing via Dijkstra.

### GridLineInput
```typescript
interface GridLineInput {
  position: number;       // r (polar) or x (cartesian)
  label?: string;         // Optional label (for axes)
}
```
**Purpose**: Specification for a single grid line (ring, spoke, vertical, or horizontal).

### RoadNetworkConfig
```typescript
interface RoadNetworkConfig {
  system: "polar" | "cartesian";
  axis1Lines: GridLineInput[];      // r values (polar) or x values (cartesian)
  axis2Lines: GridLineInput[];      // θ values (polar) or y values (cartesian)
  axis1Shape: string;               // "circle" | "radial" | "line" | "curve"
  axis2Shape: string;
  cx: number;
  cy: number;
  bounds: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    maxR?: number;                  // Max radius (for polar)
  };
  nodes: GraphNode[];               // For node allocation
}
```
**Purpose**: Input specification for `buildRoadNetwork()`. Completely configurable topology.

### CableTray (Type Alias)
```typescript
type CableTray = RoadNetwork;
```
**Note**: `CableTray` is an alias for `RoadNetwork`. Same data structure, used interchangeably.

---

## Cable Bundling Types (EdgeRenderer.ts)

### CableLane
```typescript
interface CableLane {
  color: number;            // Hex color (0xRRGGBB)
  edges: GraphEdge[];       // All edges with this color
}
```
**Purpose**: One color lane within a cable. Draws single trunk line for all edges.

### Cable
```typescript
interface Cable {
  pairKey: string;          // Canonical cluster pair "A|B" (alphabetical)
  srcCluster: string;       // Source cluster ID
  tgtCluster: string;       // Target cluster ID
  lanes: CableLane[];       // Up to MAX_CABLE_COLORS (7) lanes
  allEdges: GraphEdge[];    // All edges in this cable (for tracking)
  cableIndex: number;       // 0-based index for parallel offset
  totalCables: number;      // Total parallel cables for this pair
}
```
**Purpose**: Grouped inter-cluster edges with shared trunk line.

### CableLayout
```typescript
interface CableLayout {
  trunkStart: { x: number; y: number };    // On source cluster boundary
  trunkEnd: { x: number; y: number };      // On target cluster boundary
  offsetX: number;                         // Perpendicular offset for parallel cables
  offsetY: number;
}
```
**Purpose**: Computed geometry for cable rendering. Valid only if centroids/radii available.

---

## Edge Rendering Config (EdgeRenderer.ts)

### Pos
```typescript
interface Pos {
  id?: string;      // Optional node ID
  x: number;        // World coordinate
  y: number;        // World coordinate
}
```
**Purpose**: A position in world space. May have associated node ID.

### EdgeStyle
```typescript
interface EdgeStyle {
  alpha: number;        // Opacity (0..1)
  lineThick: number;    // Line width (pixels)
}
```
**Purpose**: Visual style for a single edge. Computed per frame via `resolveEdgeStyle()`.

### EdgeDrawConfig
```typescript
interface EdgeDrawConfig {
  // Edge visibility
  showLinks: boolean;
  showTagEdges: boolean;
  showCategoryEdges: boolean;
  showSemanticEdges: boolean;
  showInheritance: boolean;
  showAggregation: boolean;
  showTagNodes: boolean;
  showSimilar: boolean;
  showSibling: boolean;
  showSequence: boolean;

  // Rendering style
  colorEdgesByRelation: boolean;
  isArcLayout: boolean;
  isDark: boolean;
  bgColor: number;                     // Background color for alpha blending

  // Highlight / hover
  highlightedNodeId: string | null;    // Currently hovered node
  highlightSet: Set<string>;           // BFS neighbors of hovered node
  highlightEdgeAlpha: number;          // Alpha when highlighted
  highlightEdgeNonMatchAlpha: number;  // Alpha when not highlighted

  // Edge weighting
  fadeByDegree: boolean;
  degrees: Map<string, number>;        // Node degree map
  maxDegree: number;                   // Max degree (for normalization)
  edgeWeightThickness: boolean;        // Thicken edges by pair count
  totalEdgeCount?: number;             // For density scaling

  // Bundles (direction bundling)
  bundleStrength: number;              // 0..1 curve strength toward bundle centroid

  // Cable bundling
  nodeClusterMap: Map<string, string> | null;        // node ID → cluster key
  clusterCentroids: Map<string, {x, y}> | null;     // Cluster centers
  clusterRadii: Map<string, number> | null;         // Cluster radii
  cableBundleMode: "never" | "always" | "auto";     // Enable cable bundling
  cableTrunkWidth: number;                          // Trunk line width
  cableTrunkAlpha: number;                          // Trunk opacity
  cableSpacing: number;                             // Parallel cable offset
  cableFanWidth: number;                            // Fan line width
  cableFanAlpha: number;                            // Fan opacity

  // Road routing
  roadNetwork: RoadNetwork | null;     // Road infrastructure for routing
  enableRoadRouting: boolean;          // Allow road routing

  // Colors and relations
  relationColors: Map<string, string>; // Edge type → color map

  // Edge labels
  showEdgeLabels: boolean;

  // Arrows
  showArrows: boolean;
  nodeRadii: Map<string, number> | null;  // Node radii (for arrow sizing)

  // Cardinality
  edgeCardinalityMode: "none" | "crowsfoot";
  cardinalityRules: CardinalityRule[];
  cardinalityRenderConfig?: CardinalityRenderConfig;

  // Zoom
  worldScale: number;                  // Current zoom level
  edgeDensityFloor: number;            // Minimum alpha despite density
}
```
**Purpose**: Complete rendering configuration. Built once per frame, passed to all edge drawing functions.

---

## Bundle Types (EdgeRenderer.ts)

### BundleGroup
```typescript
interface BundleGroup {
  count: number;      // Number of edges in bundle
  cx: number;         // Centroid X
  cy: number;         // Centroid Y
}
```
**Purpose**: Pre-computed centroid for direction bundling. Edges curve toward this point.

### BundleAccum
```typescript
interface BundleAccum {
  count: number;      // Number of edges summed
  sumMx: number;      // Sum of (source.x + target.x) / 2
  sumMy: number;      // Sum of (source.y + target.y) / 2
}
```
**Purpose**: Accumulator for computing bundle centroids via `buildDirectionBundles()`.

---

## Cardinality Types (types.ts, EdgeRenderer.ts)

### Cardinality
```typescript
type Cardinality = "1" | "0..1" | "N" | "0..N" | "1..N";
```
**Purpose**: Crow's foot notation for relationship cardinality.

### CardinalityRule
```typescript
interface CardinalityRule {
  edgeType?: string;                   // Filter by edge type
  relation?: string;                   // Filter by relation name
  sourceCardinality: Cardinality;      // Cardinality at source node
  targetCardinality: Cardinality;      // Cardinality at target node
}
```
**Purpose**: User-defined cardinality mapping. Overrides defaults.

### CardinalityRenderConfig
```typescript
interface CardinalityRenderConfig {
  markerSizeMin: number;
  markerSizeRatio: number;
  markerOffset: number;
  lineWidth: number;
  alpha: number;
  circleOffsetFactor01: number;        // For "0..1" circle position
  circleOffsetFactor0N: number;        // For "0..N" circle position
  circleRadiusFactor: number;
  crowsFootForkFactor: number;         // For "N" fork position
}
```
**Purpose**: Visual styling for cardinality symbols. User-configurable.

---

## Graph Types (types.ts)

### GraphEdge
```typescript
interface GraphEdge {
  id: string;
  source: string | { id: string };     // Node ID or object with id
  target: string | { id: string };
  type: string;                        // "link", "tag", "semantic", etc.
  relation?: string;                   // Custom relation name
  weight?: number;                     // Edge weight (for rendering)
  cardinality?: {
    source?: Cardinality;
    target?: Cardinality;
  };
  // ... other properties
}
```
**Purpose**: Graph edge representation. Source and target can be IDs or objects.

### GraphNode
```typescript
interface GraphNode {
  id: string;
  x: number;                           // Current world position
  y: number;
  size?: number;
  parent?: string;
  isPhantom?: boolean;                 // For phantom nodes
  // ... other properties
}
```
**Purpose**: Graph node representation. Position updated by layout simulation.

---

## Rendering Host Interface (RenderPipeline.ts)

### RenderHost
```typescript
interface RenderHost {
  // Drawing methods
  drawEdges(): void;
  drawEnclosures(): void;
  drawOrbitRings(): void;
  drawRoadNetwork(): void;             // <- Road network overlay
  drawRouteLines(): void;
  drawSunburstArcs(): void;
  drawTimelineBars(): void;

  // Data access
  getPixiApp(): CanvasApp | undefined;
  getAdjacency(): AdjacencyData;
  getDegrees(): Map<string, number>;
  getPixiNodes(): Map<string, PixiNode>;
  getNodeCircleBatch(): PixiNode[];
  getHighlightedNodeId(): string | null;
  getEphemeralHighlight(): Set<string> | null;
  getPathfinderNodeSet(): Set<string> | null;
  getPathfinderState(): PathfinderState;
  getSearchHiddenNodes(): Set<string>;

  // Configuration
  isDarkTheme(): boolean;
  getCanvasDimensions(): {width: number; height: number};
  getIsKeyboardFocused(): boolean;
  isRingChartMode(): boolean;

  // Rendering config
  getCardRenderConfig?(): Partial<CardRenderConfig>;
  getCardDisplayConfig?(): CardDisplayConfig;
  getDonutDisplayConfig?(): DonutDisplayConfig;
  getLabelColor(): number;
  getAccentColor(): number;
  getNodeSize(nodeId: string): number;
  getNodeDisplayMode(): NodeDisplayMode;
  getNodeShapeRules(): NodeShapeRule[];
  getRenderThresholds(): RenderThresholds;
  getTimelineRange(): {min: number; max: number} | null;

  // Simulation
  getWorldContainer(): Container | undefined;
  tickLayoutTransition(): void;
  rebuildSpatialGrid(): void;
}
```
**Purpose**: Interface that GraphViewContainer implements. RenderPipeline calls these methods.

---

## Constants (EdgeRenderer.ts)

### Cable & Edge Rendering Constants
```typescript
const MAX_CABLE_COLORS = 7;                    // Colors per cable
const CABLE_LANE_SPACING = 1;                  // Between-lane offset
const CABLE_LAYOUT_MARGIN = 10;                // From cluster boundary
const CABLE_OVERLAP_FRAC = 0.4;                // Trunk placement when overlap
const CABLE_FAN_CROWD_THRESHOLD = 10;          // Crowding threshold
const CABLE_FAN_CROWD_MIN_FRACTION = 0.3;      // Min alpha when crowded
const CABLE_FAN_CONNECTED_FACTOR = 0.8;        // Highlight multiplier

const DEFAULT_LINE_THICKNESS = 1;
const HIGHLIGHT_LINE_THICKNESS = 2.5;
const HIGHLIGHT_CABLE_TRUNK_WIDTH = 4;

const DEFAULT_CLUSTER_RADIUS = 40;
const DEFAULT_DENSITY_FLOOR = 0.1;             // Minimum alpha

const STRUCTURAL_EDGE_ALPHA = 0.7;             // For inheritance, etc.
const NON_STRUCTURAL_EDGE_ALPHA = 0.4;         // For links, etc.
const FADE_BY_DEGREE_MIN_ALPHA = 0.1;          // Dimmest allowed

const BUNDLE_SKIP = 3;                         // Recompute every N frames
const ARC_MAX_EDGE_COUNT = 2000;               // Disable arcs above this
const MAX_EDGE_LABELS = 100;                   // Label cap
```

### Density Scale Constants
```typescript
const DENSITY_FULL_ALPHA_THRESHOLD = 500;
const DENSITY_GENTLE_THRESHOLD = 2000;
const DENSITY_AGGRESSIVE_THRESHOLD = 5000;
const DENSITY_AGGRESSIVE_MID_ALPHA = 0.4;
const DENSITY_GENTLE_REDUCTION = 0.3;
const DENSITY_AGGRESSIVE_REDUCTION = 0.3;
const DENSITY_MIN_ALPHA = 0.05;
const ZOOM_FADE_THRESHOLD = 0.3;
const ZOOM_FADE_MIN_ALPHA = 0.15;
```

### Edge Type Constants
```typescript
const EDGE_TYPE_LINK = "link";
const EDGE_TYPE_TAG = "tag";
const EDGE_TYPE_HAS_TAG = "has-tag";
const EDGE_TYPE_SEMANTIC = "semantic";
const EDGE_TYPE_INHERITANCE = "inheritance";
const EDGE_TYPE_AGGREGATION = "aggregation";
const EDGE_TYPE_SIMILAR = "similar";
const EDGE_TYPE_SIBLING = "sibling";
const EDGE_TYPE_SEQUENCE = "sequence";
```

---

## Function Signatures

### buildCables()
```typescript
function buildCables(
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
): { cables: Cable[]; cabledEdgeIds: Set<string> };
```

### computeCableLayout()
```typescript
function computeCableLayout(
  cable: Cable,
  centroids: Map<string, { x: number; y: number }>,
  radii: Map<string, number>,
  cfg?: EdgeDrawConfig,
): CableLayout | null;
```

### drawCables()
```typescript
function drawCables(
  g: CanvasGraphics,
  cables: Cable[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
  densityScale: number,
): void;
```

### drawEdgeSegment()
```typescript
function drawEdgeSegment(
  g: CanvasGraphics,
  src: Pos,
  tgt: Pos,
  e: GraphEdge,
  lineColor: number,
  isArcLayout: boolean,
  bundles: Map<string, BundleGroup> | null,
  bundleStrength: number,
  roadNetwork?: RoadNetwork | null,
): void;
```

### drawEdges()
```typescript
export function drawEdges(
  g: CanvasGraphics,
  edges: GraphEdge[],
  resolvePos: (ref: string | object) => Pos | undefined,
  cfg: EdgeDrawConfig,
  arrowGfx?: CanvasGraphics | null,
): void;
```

### buildRoadNetwork()
```typescript
export function buildRoadNetwork(cfg: RoadNetworkConfig): RoadNetwork;
```

### routeEdge()
```typescript
export function routeEdge(
  network: RoadNetwork,
  sourceNodeId: string,
  targetNodeId: string,
): { x: number; y: number }[];
```

### findShortestPath()
```typescript
export function findShortestPath(
  network: RoadNetwork,
  startId: number,
  endId: number
): number[];
```

### pathToWaypoints()
```typescript
export function pathToWaypoints(
  network: RoadNetwork,
  path: number[]
): { x: number; y: number }[];
```

### addTrunkRoads()
```typescript
export function addTrunkRoads(
  network: RoadNetwork,
  groupCentroids: { x: number; y: number }[],
): void;
```

---

## Cache Objects

### _roadRouteCache
```typescript
let _roadRouteCache = new Map<string, { x: number; y: number }[]>();
```
**Key**: `"srcId|tgtId"` (canonical order)
**Value**: Waypoints (empty if no route)
**Invalidation**: When `_roadRouteCacheNetwork` reference changes

### _roadRouteCacheNetwork
```typescript
let _roadRouteCacheNetwork: RoadNetwork | null = null;
```
**Purpose**: Stores network reference. Cache cleared if new network object.

### _bundleCache
```typescript
let _bundleCache: Map<string, BundleGroup> | null = null;
```
**Purpose**: Stores pre-computed direction bundles.
**Invalidation**: When `_bundleDirty = true`

### _cableCache
```typescript
let _cableCache: { cables: Cable[]; cabledEdgeIds: Set<string> } | null = null;
```
**Purpose**: Stores built cables and edge ID tracking set.
**Invalidation**: When `_cableDirty = true`

---

## Summary

| Type | Purpose | Location |
|------|---------|----------|
| RoadNetwork | Road infrastructure for routing | cable-tray.ts |
| Cable | Grouped inter-cluster edges | EdgeRenderer.ts |
| CableLayout | Computed trunk geometry | EdgeRenderer.ts |
| EdgeDrawConfig | Complete rendering config | EdgeRenderer.ts |
| EdgeStyle | Per-edge visual style | EdgeRenderer.ts |
| GraphEdge | Graph edge | types.ts |
| GraphNode | Graph node | types.ts |
| RenderHost | Drawing interface | RenderPipeline.ts |

All types are interconnected: EdgeDrawConfig → contains nodeClusterMap → edges grouped into Cables → drawn via drawCables() → roads from RoadNetwork used for routing non-cabled edges.
