export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  category?: string;
  tags?: string[];
  filePath?: string;
  /** True for virtual tag nodes (not backed by a file) */
  isTag?: boolean;
  /** If this node is a collapsed group (super node), the IDs of its member nodes */
  collapsedMembers?: string[];
  /** If this node is hidden because it belongs to a collapsed group */
  collapsedInto?: string;
  /** Frontmatter key-value pairs from the source file */
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: EdgeType;
  label?: string;
  /** Excalibrain-style relation name (e.g. "Author", "Location") */
  relation?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type EdgeType =
  | "link"
  | "tag"
  | "category"
  | "reference"
  | "hierarchy"
  | "semantic"
  | "inheritance"
  | "aggregation"
  | "has-tag"
  | "similar"
  | "sibling"
  | "sequence";

export type LayoutType =
  | "force"
  | "concentric"
  | "tree"
  | "arc"
  | "sunburst"
  | "timeline";

/** How to partition nodes into clusters within the force layout.
 *  Legacy values: "none" | "tag" | "backlinks" | "node_type"
 *  New: any "field:?" string (e.g. "tag:?", "folder:?", "category:?") */
export type ClusterGroupBy = string;

/** How to arrange nodes within each cluster */
export type ClusterArrangement = "spiral" | "concentric" | "radial" | "phyllotaxis" | "tree" | "grid" | "triangle" | "random" | "mountain" | "sunburst" | "timeline" | "custom";

/** Source of values for a coordinate axis.
 *
 *  - index: sort position (0..n-1)
 *  - field: any node attribute — built-in fields (path, file, folder, tag,
 *           category, id, isTag) or arbitrary frontmatter property.
 *           Uses the same resolution as getNodeFieldValues().
 *  - property: (legacy) frontmatter-only lookup — prefer "field" for new uses
 *  - metric: graph-structure-derived values (degree, bfs-depth, …)
 *  - hop: BFS distance from a specific node (identified by id substring)
 *  - random: deterministic pseudo-random in [0, 1)
 *  - const: fixed numeric value
 */
export type AxisSource =
  | { kind: "index" }
  | { kind: "field"; field: string }
  | { kind: "property"; key: string }
  | { kind: "metric"; metric: MetricKind }
  | { kind: "hop"; from: string; maxDepth?: number }
  | { kind: "random"; seed: number }
  | { kind: "const"; value: number };

/** Graph-structure-derived metrics */
export type MetricKind = "degree" | "in-degree" | "out-degree" | "bfs-depth" | "sibling-rank";

/** Parametric curve preset names */
export type CurveKind =
  | "archimedean"
  | "logarithmic"
  | "fermat"
  | "hyperbolic"
  | "cardioid"
  | "rose"
  | "lissajous"
  | "golden";

/** Shape kinds for node-packing layouts */
export type ShapeFillKind = "square" | "triangle" | "hexagon" | "diamond" | "circle";

/** How raw values are transformed into coordinates */
export type AxisTransform =
  | { kind: "linear"; scale: number }
  | { kind: "bin"; count: number }
  | { kind: "date-to-index" }
  | { kind: "stack-avoid" }
  | { kind: "golden-angle" }
  | { kind: "even-divide"; totalRange: number }
  | { kind: "expression"; expr: string; scale?: number }
  | { kind: "curve"; curve: CurveKind; params?: Record<string, number>; scale?: number }
  | { kind: "shape-fill"; shape: ShapeFillKind; axis: 1 | 2 };

/** Full axis configuration */
export interface AxisConfig {
  source: AxisSource;
  transform: AxisTransform;
}

/** Coordinate system type */
export type CoordinateSystem = "cartesian" | "polar";

/** Complete coordinate layout configuration */
export interface CoordinateLayout {
  system: CoordinateSystem;
  axis1: AxisConfig;  // x (cartesian) or r (polar)
  axis2: AxisConfig;  // y (cartesian) or θ (polar)
  perGroup: boolean;
  /** User-defined constants available in expressions (e.g. { a: 1, b: 0.3, k: 3 }) */
  constants?: Record<string, number>;
  /** Custom grid overlay configuration */
  grid?: GridConfig;
}

// ---------------------------------------------------------------------------
// Custom grid configuration
// ---------------------------------------------------------------------------

/** Source of grid line positions */
export type GridPositionSource =
  | { kind: "auto" }
  | { kind: "count"; n: number }
  | { kind: "step"; step: number }
  | { kind: "values"; values: number[] }
  | { kind: "field"; field: string }
  | { kind: "expression"; expr: string };

/** Shape of grid lines */
export type GridShape =
  | { kind: "line" }
  | { kind: "circle" }
  | { kind: "radial" }
  | { kind: "curve"; expr: string };

/** Source of tick labels */
export type GridLabelSource =
  | { kind: "auto" }
  | { kind: "field"; field: string }
  | { kind: "custom"; values: string[] };

/** Tick/label configuration for a grid axis */
export interface GridTickConfig {
  show: boolean;
  labels: GridLabelSource;
  position?: "on-line" | "between";
}

/** Configuration for one set of grid lines */
export interface GridAxisConfig {
  positions: GridPositionSource;
  shape: GridShape;
  ticks?: GridTickConfig;
}

/** Overall grid display style */
export type GridStyle = "lines" | "table";

/** Complete grid configuration */
export interface GridConfig {
  axis1Grid?: GridAxisConfig;
  axis2Grid?: GridAxisConfig;
  style: GridStyle;
  cellShading?: boolean;
}

/** A single rule in the multi-level cluster grouping pipeline */
export interface ClusterGroupRule {
  groupBy: ClusterGroupBy;
  recursive: boolean;
}

import type { QueryExpression } from "./utils/query-expr";

/** A group rule with boolean expression matching */
export interface GroupRule {
  expression: QueryExpression | null;  // null = match all
  color: string;
}

/** Common query applied across all groups — splits nodes by match pattern */
export interface CommonGroupQuery {
  expression: QueryExpression;
}

/** Preset applied on view load based on display state */
export interface GroupPreset {
  condition: {
    tagDisplay?: "node" | "enclosure";
    layout?: LayoutType;
  };
  groups: GroupRule[];
  /** Multi-level common queries (new format) */
  commonQueries?: { query: string; recursive: boolean }[];
  /** @deprecated Legacy single common query — use commonQueries instead */
  commonQuery?: CommonGroupQuery;
  /** @deprecated Legacy recursive flag — use commonQueries instead */
  recursive?: boolean;
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------
export type SortKey = "degree" | "in-degree" | "tag" | "category" | "label" | "importance";
export type SortOrder = "asc" | "desc";
export interface SortRule { key: SortKey; order: SortOrder; }

export interface DirectionalGravityRule {
  /** Filter: "tag:character", "category:protagonist", "isTag", "*" (all) etc. */
  filter: string;
  /** Direction in radians. 0=right, PI/2=down, PI=left, 3PI/2=up. Presets: "top"|"bottom"|"left"|"right" */
  direction: number | "top" | "bottom" | "left" | "right";
  /** Gravity strength (0-1, default 0.1) */
  strength: number;
}

export interface NodeRule {
  /** Query filter: "tag:character", "category:protagonist", "*", etc. */
  query: string;
  /** Spacing multiplier for this node (0.1–5.0, default 1.0) */
  spacingMultiplier: number;
  /** Gravity direction in degrees (0=right, 90=down, 180=left, 270=up). -1 = none */
  gravityAngle: number;
  /** Gravity strength (0–1, default 0.1) */
  gravityStrength: number;
  /** Center gravity multiplier (0–2, default 1.0). Force layout only. */
  centerGravity?: number;
  /** Repel force multiplier (0–3, default 1.0). Force layout only. */
  repelMultiplier?: number;
}

/** Cluster-level gravity coefficients for group spacing */
export interface ClusterGravityConfig {
  /** Inter-group distance coefficient (0–2, default 0.5). Higher = groups closer together */
  interGroupAttraction: number;
  /** Intra-group density coefficient (0.1–3, default 1.0). Higher = nodes packed tighter */
  intraGroupDensity: number;
}

export interface ConcentricLayoutOptions {
  centerX?: number;
  centerY?: number;
  minRadius?: number;
  radiusStep?: number;
  sortByInDegree?: boolean;
  sortComparator?: (a: GraphNode, b: GraphNode) => number;
  /** Per-node spacing multiplier from NodeRules */
  nodeSpacingMap?: Map<string, number>;
}

export interface TreeLayoutOptions {
  rootId?: string;
  startX?: number;
  startY?: number;
  levelHeight?: number;
  nodeWidth?: number;
  groupByCategory?: boolean;
  categoryGap?: number;
  treeGap?: number;
  sortComparator?: (a: GraphNode, b: GraphNode) => number;
  /** Per-node spacing multiplier from NodeRules */
  nodeSpacingMap?: Map<string, number>;
}

export interface ArcLayoutOptions {
  centerX?: number;
  centerY?: number;
  radius?: number;
  sortBy?: "degree" | "category" | "label";
  sortComparator?: (a: GraphNode, b: GraphNode) => number;
}

export interface SunburstData {
  name: string;
  value?: number;
  children?: SunburstData[];
  filePath?: string;
}

export interface ShellInfo {
  radius: number;
  nodeIds: string[];
  centerX: number;
  centerY: number;
  angleOffset: number;
  /** Rotation speed in radians per second (0 = stopped) */
  rotationSpeed: number;
  /** 1 = clockwise, -1 = counter-clockwise */
  rotationDirection: 1 | -1;
}

export interface ConcentricLayoutResult {
  data: GraphData;
  shells: ShellInfo[];
}

/** Explicit relationship between two tags (without nesting) */
export interface TagRelation {
  source: string;
  target: string;
  type: "inheritance" | "aggregation";
}

export type OntologyRelation = "is-a" | "has-a" | "is-from" | "is-alike" | "sibling";

export interface OntologyRule {
  forward: string;   // comma-separated field names (e.g. "parent, extends")
  relation: OntologyRelation;
  reverse: string;   // comma-separated field names (e.g. "child, down"); empty for bidirectional
}

export interface OntologyConfig {
  /** Frontmatter/inline field names treated as inheritance (is-a) */
  inheritanceFields: string[];
  /** Frontmatter/inline field names treated as aggregation (has-a) */
  aggregationFields: string[];
  /** Reverse inheritance fields — edge direction is inverted (Breadcrumbs child/down compat) */
  reverseInheritanceFields: string[];
  /** Reverse aggregation fields — edge direction is inverted (Breadcrumbs part-of compat) */
  reverseAggregationFields: string[];
  /** Derive inheritance edges from nested tags like #a/b/c */
  useTagHierarchy: boolean;
  /** Frontmatter/inline field names treated as similarity (related-to) */
  similarFields: string[];
  /** Frontmatter/inline field names treated as sibling (peer) — Breadcrumbs compat */
  siblingFields: string[];
  /** Frontmatter/inline field names treated as sequence (next) — Breadcrumbs compat */
  sequenceFields: string[];
  /** Reverse sequence fields (prev/previous) — edge direction is inverted */
  reverseSequenceFields: string[];
  /** Map arbitrary relation names to ontology types (ExcaliBrain compat) */
  customMappings: Record<string, "inheritance" | "aggregation" | "similar" | "sibling" | "sequence">;
  /** Explicit tag-to-tag relationships (without nesting) */
  tagRelations: TagRelation[];
  /** Rule-based ontology definitions (UI-driven) — synced to field arrays on save */
  rules?: OntologyRule[];
}

/** Convert legacy field arrays → rules array */
export function ontologyToRules(o: OntologyConfig): OntologyRule[] {
  const rules: OntologyRule[] = [];
  const join = (a: string[]) => a.join(", ");
  if (o.inheritanceFields.length || o.reverseInheritanceFields?.length)
    rules.push({ forward: join(o.inheritanceFields), relation: "is-a", reverse: join(o.reverseInheritanceFields ?? []) });
  if (o.aggregationFields.length || o.reverseAggregationFields?.length)
    rules.push({ forward: join(o.aggregationFields), relation: "has-a", reverse: join(o.reverseAggregationFields ?? []) });
  if (o.sequenceFields?.length || o.reverseSequenceFields?.length)
    rules.push({ forward: join(o.sequenceFields ?? []), relation: "is-from", reverse: join(o.reverseSequenceFields ?? []) });
  if (o.similarFields.length)
    rules.push({ forward: join(o.similarFields), relation: "is-alike", reverse: "" });
  if (o.siblingFields?.length)
    rules.push({ forward: join(o.siblingFields ?? []), relation: "sibling", reverse: "" });
  return rules;
}

/** Sync rules array → legacy field arrays (for classifyRelation compat) */
export function rulesToOntologyFields(rules: OntologyRule[], o: OntologyConfig): void {
  const split = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
  // Clear all
  o.inheritanceFields = []; o.reverseInheritanceFields = [];
  o.aggregationFields = []; o.reverseAggregationFields = [];
  o.sequenceFields = []; o.reverseSequenceFields = [];
  o.similarFields = []; o.siblingFields = [];
  for (const r of rules) {
    const fwd = split(r.forward);
    const rev = split(r.reverse);
    switch (r.relation) {
      case "is-a":
        o.inheritanceFields.push(...fwd); o.reverseInheritanceFields.push(...rev); break;
      case "has-a":
        o.aggregationFields.push(...fwd); o.reverseAggregationFields.push(...rev); break;
      case "is-from":
        o.sequenceFields.push(...fwd); o.reverseSequenceFields.push(...rev); break;
      case "is-alike":
        o.similarFields.push(...fwd); break;
      case "sibling":
        o.siblingFields.push(...fwd); break;
    }
  }
}

export const DEFAULT_ONTOLOGY: OntologyConfig = {
  inheritanceFields: ["parent", "extends", "up"],
  aggregationFields: ["contains", "parts", "has"],
  reverseInheritanceFields: ["child", "down"],
  reverseAggregationFields: ["part-of", "belongs-to"],
  similarFields: ["similar", "related"],
  siblingFields: ["sibling", "same"],
  sequenceFields: ["next"],
  reverseSequenceFields: ["prev", "previous"],
  useTagHierarchy: true,
  customMappings: {},
  tagRelations: [],
};

export interface GraphViewsSettings {
  defaultLayout: LayoutType;
  nodeSize: number;
  showLabels: boolean;
  metadataFields: string[];
  edgeFields: string[];
  colorField: string;
  groupField: string;
  ontology: OntologyConfig;
  /** Show similar edges in the graph (default false) */
  showSimilar: boolean;
  /** Directional gravity rules for force layout */
  directionalGravityRules: DirectionalGravityRule[];
  /** Minimum fraction of total nodes a tag group must have to show an enclosure (0–1). Default 1/20 = 0.05 */
  enclosureMinRatio: number;
  /** Group presets applied on view load based on display state */
  groupPresets: GroupPreset[];
  /** Default sort rules for node ordering in layouts */
  defaultSortRules: SortRule[];
  /** Default cluster group rules for multi-level grouping */
  defaultClusterGroupRules: ClusterGroupRule[];
  /** Default node rules for spacing and gravity */
  defaultNodeRules: NodeRule[];
  /** Default cluster arrangement pattern (spiral | concentric | tree | grid | triangle) */
  defaultClusterArrangement?: ClusterArrangement;
  /** Default cluster node spacing (1–10, default 3.0) */
  defaultClusterNodeSpacing?: number;
  /** Default cluster group scale (0.2–5, default 3.0) */
  defaultClusterGroupScale?: number;
  /** Default cluster group spacing (0.5–10, default 2.0) */
  defaultClusterGroupSpacing?: number;
  /** Default edge bundle strength (0–1, default 0.65) */
  defaultEdgeBundleStrength?: number;
  /** Vault-relative path for JSON import/export */
  settingsJsonPath: string;
}

export const DEFAULT_SETTINGS: GraphViewsSettings = {
  defaultLayout: "force",
  nodeSize: 8,
  showLabels: true,
  metadataFields: ["tags", "category", "characters", "locations"],
  edgeFields: ["tags", "category"],
  colorField: "category",
  groupField: "category",
  ontology: DEFAULT_ONTOLOGY,
  showSimilar: false,
  directionalGravityRules: [],
  enclosureMinRatio: 0.05,
  groupPresets: [
    {
      condition: { tagDisplay: "enclosure" },
      groups: [],
      commonQueries: [{ query: "tag:*", recursive: false }],
    },
  ],
  defaultSortRules: [{ key: "degree", order: "desc" }],
  defaultClusterGroupRules: [{ groupBy: "tag:?", recursive: false }],
  defaultNodeRules: [],
  settingsJsonPath: "",
};

// ---------------------------------------------------------------------------
// Node display mode types
// ---------------------------------------------------------------------------

/** How nodes are rendered on the canvas */
export type NodeDisplayMode = "node" | "card" | "donut" | "sunburst-segment";

/** Card display configuration */
export interface CardDisplayConfig {
  fields: string[];        // Metadata fields to show on card
  maxWidth?: number;       // Card max width in pixels (default: 120)
  showIcon?: boolean;      // Show file icon (default: false)
  headerStyle?: "plain" | "table";  // Card rendering style (default: "plain")
  /** Field display format: "key-value" (default) shows "field: value",
   *  "value-only" shows just the value */
  fieldFormat?: "key-value" | "value-only";
}

/** Donut display configuration */
export interface DonutDisplayConfig {
  breakdownField?: string; // Field for sector breakdown (super nodes)
  innerRadius?: number;    // Inner radius ratio 0-0.9 (default: 0.6)
}

/** Sunburst segment display configuration */
export interface SunburstSegmentConfig {
  arcAngle?: number;       // Segment angle in degrees (default: 30)
}

/** Display configuration (PanelState level or ShapeRule level) */
export interface DisplayConfig {
  mode: NodeDisplayMode;
  card?: CardDisplayConfig;
  donut?: DonutDisplayConfig;
  sunburst?: SunburstSegmentConfig;
}

// ---------------------------------------------------------------------------
// Edge cardinality (crow's foot notation)
// ---------------------------------------------------------------------------

/** Edge cardinality marker style */
export type EdgeCardinalityMode = "none" | "crowsfoot";

/** Cardinality specification for an edge endpoint */
export type Cardinality = "1" | "0..1" | "N" | "0..N" | "1..N";

/** Rule for mapping edge types/relations to cardinality markers */
export interface CardinalityRule {
  /** Match by edge type */
  edgeType?: EdgeType;
  /** Match by relation name (substring) */
  relation?: string;
  /** Cardinality at source end */
  sourceCardinality: Cardinality;
  /** Cardinality at target end */
  targetCardinality: Cardinality;
}

// ---------------------------------------------------------------------------
// Rendering config objects (replacing hardcoded magic numbers)
// ---------------------------------------------------------------------------

/** Card visual rendering configuration.
 *  All values have sensible defaults — override via preset JSON or UI. */
export interface CardRenderConfig {
  // ---- Opacity / alpha ----
  /** Alpha multiplier for timeline-filtered-out nodes (default 0.08) */
  filteredNodeAlpha?: number;
  /** Darken factor for stroke color (default 0.4) */
  strokeDarken?: number;
  /** Alpha multiplier for outer stroke (default 0.5) */
  strokeAlpha?: number;
  /** Lighten factor for gradient highlight (default 0.25) */
  gradientHighlight?: number;
  /** Darken factor for gradient shadow (default 0.15) */
  gradientShadow?: number;

  // ---- Table card (ER-style) ----
  /** Card background alpha (default 0.15) */
  cardBackgroundAlpha?: number;
  /** Header bar alpha (default 0.6) */
  cardHeaderAlpha?: number;
  /** Divider darken factor (default 0.3) */
  cardDividerDarken?: number;
  /** Divider alpha (default 0.7) */
  cardDividerAlpha?: number;
  /** Even-row alpha (default 0.05) */
  cardRowAlphaEven?: number;
  /** Odd-row alpha (default 0.08) */
  cardRowAlphaOdd?: number;

  // ---- Plain card ----
  /** Plain card stroke alpha (default 0.4) */
  plainCardStrokeAlpha?: number;
  /** Plain card fill alpha (default 0.8) */
  plainCardFillAlpha?: number;

  // ---- Card dimensions (in screen pixels, divided by worldScale at render) ----
  /** Table card header height (default 16) */
  tableHeaderHeight?: number;
  /** Field row line height (default 12) */
  fieldLineHeight?: number;
  /** Card internal padding (default 4) */
  cardPadding?: number;
  /** Card corner radius (default 3) */
  cardCornerRadius?: number;
  /** Card width factor relative to node radius (default 4).
   *  Used as fallback when cardAspectRatio is not set. */
  cardWidthFactor?: number;
  /** Card aspect ratio (width / height). Default 1.618 (golden ratio).
   *  When set, card width = content height × this value, overriding cardWidthFactor. */
  cardAspectRatio?: number;
  /** Plain card base height (default 20) */
  plainCardHeight?: number;
  /** Plain card width factor relative to node radius (default 3) */
  plainCardWidthFactor?: number;

  // ---- Card typography ----
  /** Header font size min (default 8) */
  headerFontSizeMin?: number;
  /** Header font size base (default 11) */
  headerFontSizeBase?: number;
  /** Field font size min (default 7) */
  fieldFontSizeMin?: number;
  /** Field font size base (default 9) */
  fieldFontSizeBase?: number;
  /** Vertical baseline offset factor (default 0.3) */
  fontBaselineOffset?: number;

  // ---- Card shadow & hover ----
  /** Card shadow alpha (default 0.12) */
  cardShadowAlpha?: number;
  /** Card shadow offset in screen pixels (default 2) */
  cardShadowOffset?: number;
  /** Card scale multiplier on hover (default 1.08) */
  cardHoverScale?: number;
  /** Card glow alpha on hover (default 0.3) */
  cardHoverGlowAlpha?: number;

  // ---- Highlight ----
  /** Alpha for background nodes when a node is highlighted (default 0.15) */
  highlightDimAlpha?: number;
  /** Halo radius multiplier for highlighted nodes (default 2.2) */
  highlightHaloRadius?: number;
  /** Halo alpha for highlighted nodes (default 0.15) */
  highlightHaloAlpha?: number;
  /** Stroke width for highlighted nodes (default 1.8) */
  highlightStrokeWidth?: number;
}

/** Cardinality marker rendering configuration */
export interface CardinalityRenderConfig {
  /** Minimum marker size in pixels (default 6) */
  markerSizeMin?: number;
  /** Marker size as fraction of node radius (default 0.3) */
  markerSizeRatio?: number;
  /** Offset distance from node boundary in pixels (default 3) */
  markerOffset?: number;
  /** Line width (default 1.5) */
  lineWidth?: number;
  /** Alpha multiplier (default 0.8) */
  alpha?: number;
  /** Crow's foot fork distance factor (default 0.8) */
  crowsFootForkFactor?: number;
  /** Circle radius as fraction of marker size (default 0.25) */
  circleRadiusFactor?: number;
  /** Circle offset factor (default 0.6 for 0..1, 1.2 for 0..N) */
  circleOffsetFactor01?: number;
  circleOffsetFactor0N?: number;
}

/** Level-of-detail thresholds for performance tuning */
export interface RenderThresholds {
  /** Node count below which gradient rendering is used (default 500) */
  gradientNodeCount?: number;
  /** Node count below which card text is rendered (default 200) */
  cardTextNodeCount?: number;
  /** Node count below which glow halos are shown (default 800) */
  glowNodeCount?: number;
  /** Grid label offset in pixels (default 12) */
  gridLabelOffset?: number;
  /** Cluster simulation charge force strength (default -10) */
  clusterChargeForce?: number;
  /** Grid divisions for continuous coordinate axes (default 5) */
  coordinateGridDivisions?: number;
  /** Grid line alpha for normal mode (default 0.4) */
  gridLineAlpha?: number;
  /** Grid line alpha for table mode (default 0.6) */
  gridTableLineAlpha?: number;
  /** Cell shading minimum alpha (default 0.08) */
  gridCellShadingMin?: number;
  /** Cell shading dynamic range (default 0.35) */
  gridCellShadingRange?: number;
  /** Extra collision radius when nodeDisplayMode is card (default 40) */
  cardCollisionPadding?: number;

  // ---- Timeline bar visual ----
  /** Timeline bar fill alpha (default 0.35) */
  timelineBarFillAlpha?: number;
  /** Timeline bar stroke alpha (default 0.8) */
  timelineBarStrokeAlpha?: number;
  /** Timeline bar corner radius in pixels (default 4) */
  timelineBarCornerRadius?: number;
  /** Timeline bar fill alpha on hover (default 0.6) */
  timelineBarHoverAlpha?: number;

  // ---- Grid line visual ----
  /** Grid line margin beyond bounds in world px (default 20) */
  gridLineMargin?: number;
  /** Grid line width multiplier (default 0.8) */
  gridLineWidthFactor?: number;
  /** Grid label font-size minimum (default 7) */
  gridLabelFontSizeMin?: number;
  /** Grid label font-size maximum (default 13) */
  gridLabelFontSizeMax?: number;
  /** Grid label font-size base for 1/worldScale scaling (default 11) */
  gridLabelFontSizeBase?: number;

  // ---- Auto-fit ----
  /** Extra padding (px) added to bounding-box when nodeDisplayMode is card (default 20) */
  autoFitCardPadding?: number;

  // ---- LOD & auto-fit ----
  /** LOD: below this screen-px, render circles instead of cards. Default 4.0 */
  cardLODNormalPx?: number;
  /** LOD: below this screen-px, render as 1px dots. Default 1.5 */
  cardLODExtremePx?: number;
  /** Minimum scale for autoFitView (0 = no minimum). Default 0 */
  autoFitMinScale?: number;

  // ---- Label overlap culling ----
  /** Enable label overlap culling (default true) */
  labelOverlapCulling?: boolean;
  /** Extra margin around label bounding box for overlap test (world px, default 4) */
  labelOverlapMargin?: number;

  // ---- Timeline bar labels ----
  /** Show text labels inside timeline bars (default true) */
  timelineBarShowLabel?: boolean;
  /** Minimum bar screen-px width to show label (default 30) */
  timelineBarLabelMinWidth?: number;
  /** Font size for timeline bar labels (default 9) */
  timelineBarLabelFontSize?: number;

  // ---- Card text truncation ----
  /** Enable card text truncation with ellipsis (default true) */
  cardTextTruncation?: boolean;

  // ---- Glow halos ----
  /** Base glow alpha for node halos (default 0.18) */
  glowBaseAlpha?: number;
  /** Base glow radius multiplier (default 2.2) */
  glowBaseRadius?: number;
  /** Glow alpha for hub nodes (top 10% degree) multiplier (default 1.6) */
  glowHubFactor?: number;
  /** Glow radius for hub nodes multiplier (default 1.3) */
  glowHubRadiusFactor?: number;

  // ---- Minimap ----
  /** Minimap node dot radius in px (default 2.5) */
  minimapDotRadius?: number;
  /** Minimap node thinning step when above threshold (default 3) */
  minimapThinStep?: number;
  /** Minimap node thinning threshold (default 800) */
  minimapThinThreshold?: number;

  // ---- Edge density ----
  /** Minimum density scale for edge/cable alpha — prevents edges from becoming invisible at high count + low zoom (default 0.08) */
  edgeDensityFloor?: number;

  // ---- Label leader lines ----
  /** Draw thin leader lines from displaced labels to their node (default true) */
  labelLeaderLines?: boolean;
  /** Leader line stroke alpha (default 0.3) */
  labelLeaderLineAlpha?: number;
  /** Leader line stroke width in px (default 0.8) */
  labelLeaderLineWidth?: number;

  // ---- Auto-optimize ----
  /** Auto-optimize: overlap ratio threshold to trigger adjustment (default 0.15) */
  autoOptOverlapThreshold?: number;
  /** Auto-optimize: _overlapPad increment per pass (default 0.2) */
  autoOptPadIncrement?: number;
  /** Auto-optimize: maximum _overlapPad value (default 3.0) */
  autoOptPadMax?: number;
  /** Auto-optimize: repelForce scale factor per pass (default 1.3) */
  autoOptRepelScale?: number;
  /** Auto-optimize: linkDistance scale factor per pass (default 1.2) */
  autoOptLinkScale?: number;
  /** Auto-optimize: maximum iteration passes (default 3) */
  autoOptMaxPasses?: number;
  /** Auto-optimize: close-pair detection radius as multiple of avg node radius (default 3.0) */
  autoOptCloseThreshold?: number;

  // ---- Sunburst hierarchy ----
  /** Sunburst: lighten color per depth level (0-1, default 0.18) */
  sunburstDepthLighten?: number;
  /** Sunburst: minimum arc sweep angle in radians to draw (default 0.005) */
  sunburstMinArcSweep?: number;
  /** Sunburst: border width between sectors (default 1.0) */
  sunburstBorderWidth?: number;
  /** Sunburst: border alpha between sectors (default 0.3) */
  sunburstBorderAlpha?: number;
  /** Sunburst: max hierarchy depth to render (default 6) */
  sunburstMaxDepth?: number;
}

/** Default card rendering config */
export const DEFAULT_CARD_RENDER_CONFIG: Required<CardRenderConfig> = {
  filteredNodeAlpha: 0.15,
  strokeDarken: 0.4,
  strokeAlpha: 0.65,
  gradientHighlight: 0.25,
  gradientShadow: 0.15,
  cardBackgroundAlpha: 0.15,
  cardHeaderAlpha: 0.6,
  cardDividerDarken: 0.3,
  cardDividerAlpha: 0.7,
  cardRowAlphaEven: 0.05,
  cardRowAlphaOdd: 0.08,
  plainCardStrokeAlpha: 0.4,
  plainCardFillAlpha: 0.8,
  tableHeaderHeight: 16,
  fieldLineHeight: 12,
  cardPadding: 4,
  cardCornerRadius: 3,
  cardWidthFactor: 4,
  cardAspectRatio: 1.618,
  plainCardHeight: 20,
  plainCardWidthFactor: 3,
  headerFontSizeMin: 8,
  headerFontSizeBase: 11,
  fieldFontSizeMin: 7,
  fieldFontSizeBase: 9,
  fontBaselineOffset: 0.3,
  cardShadowAlpha: 0.12,
  cardShadowOffset: 2,
  cardHoverScale: 1.08,
  cardHoverGlowAlpha: 0.3,
  highlightDimAlpha: 0.15,
  highlightHaloRadius: 2.2,
  highlightHaloAlpha: 0.15,
  highlightStrokeWidth: 1.8,
};

/** Default cardinality marker config */
export const DEFAULT_CARDINALITY_RENDER_CONFIG: Required<CardinalityRenderConfig> = {
  markerSizeMin: 6,
  markerSizeRatio: 0.3,
  markerOffset: 3,
  lineWidth: 1.5,
  alpha: 0.8,
  crowsFootForkFactor: 0.8,
  circleRadiusFactor: 0.25,
  circleOffsetFactor01: 0.6,
  circleOffsetFactor0N: 1.2,
};

/** Default rendering thresholds */
export const DEFAULT_RENDER_THRESHOLDS: Required<RenderThresholds> = {
  gradientNodeCount: 500,
  cardTextNodeCount: 200,
  glowNodeCount: 800,
  gridLabelOffset: 12,
  clusterChargeForce: -10,
  coordinateGridDivisions: 5,
  gridLineAlpha: 0.4,
  gridTableLineAlpha: 0.6,
  gridCellShadingMin: 0.08,
  gridCellShadingRange: 0.35,
  cardCollisionPadding: 40,
  timelineBarFillAlpha: 0.35,
  timelineBarStrokeAlpha: 0.8,
  timelineBarCornerRadius: 4,
  timelineBarHoverAlpha: 0.6,
  gridLineMargin: 20,
  gridLineWidthFactor: 0.8,
  gridLabelFontSizeMin: 7,
  gridLabelFontSizeMax: 13,
  gridLabelFontSizeBase: 11,
  autoFitCardPadding: 20,
  cardLODNormalPx: 4.0,
  cardLODExtremePx: 1.5,
  autoFitMinScale: 0,
  labelOverlapCulling: true,
  labelOverlapMargin: 4,
  timelineBarShowLabel: true,
  timelineBarLabelMinWidth: 30,
  timelineBarLabelFontSize: 9,
  cardTextTruncation: true,
  glowBaseAlpha: 0.18,
  glowBaseRadius: 2.2,
  glowHubFactor: 1.6,
  glowHubRadiusFactor: 1.3,
  minimapDotRadius: 2.5,
  minimapThinStep: 3,
  minimapThinThreshold: 800,
  edgeDensityFloor: 0.08,
  labelLeaderLines: true,
  labelLeaderLineAlpha: 0.3,
  labelLeaderLineWidth: 0.8,
  autoOptOverlapThreshold: 0.15,
  autoOptPadIncrement: 0.2,
  autoOptPadMax: 3.0,
  autoOptRepelScale: 1.3,
  autoOptLinkScale: 1.2,
  autoOptMaxPasses: 3,
  autoOptCloseThreshold: 3.0,
  sunburstDepthLighten: 0.18,
  sunburstMinArcSweep: 0.005,
  sunburstBorderWidth: 1.0,
  sunburstBorderAlpha: 0.3,
  sunburstMaxDepth: 6,
};

export const DEFAULT_COLORS = [
  "#818cf8", "#f472b6", "#fbbf24", "#34d399",
  "#60a5fa", "#f87171", "#a78bfa", "#2dd4bf",
  "#fb923c", "#22d3ee", "#a3e635", "#fb7185",
] as const;
