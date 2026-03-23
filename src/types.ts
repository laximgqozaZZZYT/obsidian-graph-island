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
  /** File modification time (epoch ms) */
  mtime?: number;
  /** File creation time (epoch ms) */
  ctime?: number;
  /** First 100 chars of body text (YAML stripped) for content preview */
  bodyPreview?: string;
  /** Full body text length (YAML stripped) for content-proportional card sizing */
  bodyLength?: number;
  /** Runtime-injected: node degree (connection count) */
  degree?: number;
  /** Runtime-injected: road network phantom node flag */
  isPhantom?: boolean;
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

// ---------------------------------------------------------------------------
// スナップショット差分用の型定義
// ---------------------------------------------------------------------------

/** スナップショット時点のノードの軽量フィンガープリント */
export interface SnapshotNode {
  id: string;
  /** メタデータのハッシュ値（FNV-1a）。メタデータがない場合は空文字列 */
  metaHash: string;
}

/** スナップショット時点のエッジの軽量フィンガープリント */
export interface SnapshotEdge {
  source: string;
  target: string;
  type: string;
}

/** 保存されたグラフスナップショット */
export interface GraphSnapshot {
  /** ユーザーが付けた名前 */
  name: string;
  /** ISO-8601 形式のタイムスタンプ */
  createdAt: string;
  /** ノードフィンガープリント配列 */
  nodes: SnapshotNode[];
  /** エッジフィンガープリント配列 */
  edges: SnapshotEdge[];
  /** ユーザーメモ（スナップショットの説明や目的） */
  notes?: string;
  /** パネル状態の要約（情報表示用） */
  context: {
    layout: string;
    searchQuery: string;
    groupBy: string;
    nodeCount: number;
    edgeCount: number;
  };
}

/** 保存されたグラフテンプレート（パネル設定の名前付きスナップショット） */
export interface GraphTemplate {
  /** ユーザーが付けた名前 */
  name: string;
  /** ISO-8601 形式の保存日時 */
  createdAt: string;
  /** パネル設定の部分コピー（一時的な状態を除く） */
  panel: Record<string, unknown>;
}

/** スナップショットと現在のグラフの差分結果 */
export interface SnapshotDiff {
  /** 現在のグラフにあってスナップショットにないノードID */
  addedNodeIds: Set<string>;
  /** スナップショットにあって現在のグラフにないノード */
  removedNodes: SnapshotNode[];
  /** 両方に存在するがメタデータハッシュが異なるノードID */
  changedNodeIds: Set<string>;
  /** 現在のグラフにあってスナップショットにないエッジキー */
  addedEdgeKeys: Set<string>;
  /** スナップショットにあって現在のグラフにないエッジ */
  removedEdges: SnapshotEdge[];
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

/** Top-level visualization mode — determines which layout algorithm and
 *  which panel sections are active. */
export type ViewMode = "graph" | "sunburst" | "timeline" | "tree" | "matrix";

/** How to partition nodes into clusters within the force layout.
 *  Legacy values: "none" | "tag" | "backlinks" | "node_type"
 *  New: any "field:?" string (e.g. "tag:?", "folder:?", "category:?") */
export type ClusterGroupBy = string;

/** How to arrange nodes within each cluster */
export type ClusterArrangement = "concentric" | "radial" | "phyllotaxis" | "grid" | "triangle" | "random" | "timeline" | "custom" | "ego";

/** How to arrange groups relative to each other (inter-group layout).
 *  "auto" preserves legacy behavior — derived from clusterArrangement. */
export type ClusterGroupArrangement = "auto" | "circle" | "horizontal" | "vertical" | "concentric" | "grid";

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
  | { kind: "property"; key: string }
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
  /** ノードカラーオーバーライド (CSS hex string, e.g. "#ff0000"). 空文字 = オーバーライドなし */
  color?: string;
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
  nodeSize: number;
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
  /** 保存されたグラフスナップショット（最大10件） */
  snapshots?: GraphSnapshot[];
  /** 自動スナップショットの間隔（分）。0で無効。デフォルト5分 */
  autoSnapshotIntervalMin?: number;
  /** 保存されたグラフテンプレート（最大20件） */
  templates?: GraphTemplate[];
}

export const DEFAULT_SETTINGS: GraphViewsSettings = {
  nodeSize: 8,
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
  snapshots: [],
  templates: [],
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

  // ---- Compact card (LOD 4 / semantic zoom tier 1) ----
  /** Compact card stroke alpha (default 0.3) */
  compactCardStrokeAlpha?: number;
  /** Compact card fill alpha (default 0.08) */
  compactCardFillAlpha?: number;
  /** Compact card width as multiple of node radius (default 3.5) */
  compactCardWidthRatio?: number;
  /** Compact card height as multiple of node radius (default 1.8) */
  compactCardHeightRatio?: number;

  // ---- Semantic zoom cards (tiers 3–4) ----
  /** Semantic zoom tier 3 (compact) card fill alpha (default 0.3) */
  semanticCardFillAlpha?: number;
  /** Semantic zoom tier 4 (full) card fill alpha (default 0.25) */
  semanticCardFullFillAlpha?: number;
  /** Semantic zoom tier 4 header height as ratio of effR (default 0.8) */
  semanticCardHeaderHeightRatio?: number;
  /** Semantic zoom tier 4 header fill alpha (default 0.6) */
  semanticCardHeaderFillAlpha?: number;

  // ---- Card text alpha ----
  /** Sub-text alpha for definition fields, meta text, and body lines (default 0.7) */
  cardSubTextAlpha?: number;
  /** Body preview text alpha in semantic zoom tier 4 (default 0.6) */
  cardBodyPreviewAlpha?: number;

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

/**
 * Rendering configuration — 216 optional fields across 50+ categories.
 *
 * Categories: node display, card rendering, label culling, edge visibility,
 * edge alpha/thickness, edge labels, enclosures, road network, timeline,
 * grid, glow, minimap, performance, a11y, sunburst, zone placement.
 *
 * All fields are optional. Use `mergeRenderThresholds()` to get a
 * `Required<RenderThresholds>` with defaults from `DEFAULT_RENDER_THRESHOLDS`.
 */
export interface RenderThresholds {
  /** Node count below which gradient rendering is used (default 500) */
  gradientNodeCount?: number;
  /** Node count below which card text is rendered (default 200) */
  cardTextNodeCount?: number;
  /** FT: Maximum body preview lines in plain card mode (default 3) */
  cardBodyMaxLines?: number;
  /** HM: Card content scale — log-based size boost from body length (0=off, 0.5=default, 2.0=max) */
  cardContentScale?: number;
  /** FU: Enclosure label position ("top" | "center" | "bottom", default "top") */
  enclosureLabelPosition?: "top" | "center" | "bottom";
  /** FX: Card body font size in screen pixels (default 8) */
  cardBodyFontSize?: number;
  /** GD: Max characters for node label (0 = no limit) */
  labelMaxChars?: number;
  /** GC: Enclosure stroke width override (0 = auto) */
  enclosureStrokeWidth?: number;
  /** GG: Global edge alpha multiplier (0-1, default 1.0) */
  globalEdgeAlpha?: number;
  /** GW: Edge label font size in pixels (default 10) */
  edgeLabelFontSize?: number;
  /** FY: Enclosure fill opacity 0-1 (default from sizeFade calculation) */
  enclosureFillOpacity?: number;
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
  /** Collision padding added to regular node radius in forceCollide (default 2) */
  collisionPadding?: number;
  /** Collision padding added to super node (collapsed group) radius in forceCollide (default 8) */
  superNodeCollisionPadding?: number;

  // ---- Super node double outline ----
  /** Inner circle radius ratio for super node double outline (default 0.65) */
  superNodeInnerRatio?: number;
  /** Outer stroke width for super node double outline (default 1.5) */
  superNodeOuterStroke?: number;
  /** Inner stroke width for super node double outline (default 1.0) */
  superNodeInnerStroke?: number;
  /** Inner stroke alpha for super node double outline (default 0.5) */
  superNodeInnerAlpha?: number;

  // ---- Sort-rank prominence ----
  /** Number of top-sorted nodes to emphasize with double outline (default 5) */
  prominentTopN?: number;
  /** Saturation multiplier for non-prominent nodes (0-1, default 0.4). Lower = more washed out. */
  nonProminentSaturation?: number;

  // ---- Timeline axis labels ----
  /** Show text labels on timeline axis ticks (default true) */
  timelineAxisShowLabels?: boolean;
  /** Timeline axis label font size (default 9) */
  timelineAxisLabelFontSize?: number;
  /** Timeline axis label alpha (default 0.7) */
  timelineAxisLabelAlpha?: number;
  /** Timeline axis label offset below tick in px (default 10) */
  timelineAxisLabelOffset?: number;
  /** Max number of axis labels before thinning (default 30) */
  timelineAxisLabelMaxCount?: number;

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

  // ---- Coordinate axis titles ----
  /** Show axis titles on coordinate grid (default true) */
  axisTitleShow?: boolean;
  /** Axis title font size (default 12) */
  axisTitleFontSize?: number;
  /** Axis title alpha (default 0.8) */
  axisTitleAlpha?: number;
  /** Axis title offset from grid edge in px (default 18) */
  axisTitleOffset?: number;

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
  /** Base padding (px) for non-card auto-fit (default 40). */
  autoFitBasePadding?: number;
  /** Normalize spread across arrangement patterns so nodes appear the same
   *  screen size after autoFitView (default true). When true, each pattern's
   *  bounding radius is scaled to match a grid-equivalent reference. */
  normalizeArrangementSpread?: boolean;
  // ---- Viewport utilization ----
  /** Minimum world-space node bbox area / viewport area at z=1.0 (default 0.10).
   *  After layout, if utilization is below this, node positions are scaled outward
   *  from their center so the graph fills more of the viewport.  Set 0 to disable. */
  minViewportUtilization?: number;

  // ---- Enclosure zoom ----
  /** Zoom threshold below which enclosures switch to outline-only mode (default 0.45). */
  enclosureZoomOutThreshold?: number;

  // ---- Label animation ----
  /** Alpha decrement per frame when fading out overlapping labels (default 0.15).
   *  Lower = slower fade, higher = snappier transitions. */
  labelFadeRate?: number;

  // ---- Label overlap culling ----
  /** Enable label overlap culling (default true) */
  labelOverlapCulling?: boolean;
  /** Extra margin around label bounding box for overlap test (world px, default 4) */
  labelOverlapMargin?: number;
  /** Minimum screen distance between label centers for density culling at zoom-out (default 80px) */
  labelDensityMinScreenDist?: number;
  /** Maximum density culling distance cap (px, default 200) — prevents over-aggressive label removal at extreme zoom */
  labelDensityMaxDist?: number;
  /** Zoom threshold below which density-adaptive culling activates (default 0.5) */
  labelDensityZoomThreshold?: number;
  /** Manual label mode override: "auto" (default) | "initials" | "truncated" | "full".
   *  When set to non-auto, ignores zoom-based label mode switching. */
  labelModeOverride?: "auto" | "initials" | "truncated" | "full";
  /** Number of render frames to skip between label cull recalculations (default 6).
   *  Lower = more responsive zoom, higher = less CPU. Affects §0.4 zoom response. */
  labelCullCooldown?: number;

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

  // ---- Zoom-out fade ----
  /** Alpha floor for low-degree nodes at zoom-out (default 0.2).
   *  At zoom < 0.3, nodes ranked beyond prominentTopN×2 fade by zoom/0.3,
   *  but never below this floor. Higher = less aggressive fading. */
  fadeLowDegreeFloor?: number;

  // ---- Theme-dependent indicator colors (hex number, e.g. 0xff8c00) ----
  /** Pathfinder start node ring color (default 0x22d3ee — cyan) */
  pathfinderStartColor?: number;
  /** Pathfinder end node ring color (default 0xf97316 — orange) */
  pathfinderEndColor?: number;
  /** Bookmark star indicator color (default 0xf5c542 — gold) */
  bookmarkStarColor?: number;
  /** Missing neighbor ring color (default 0xff8c00 — dark orange) */
  missingNeighborRingColor?: number;
  /** Recency marker color (default 0x22c55e — green-500) */
  recencyMarkerColor?: number;

  // ---- Density-aware stroke (zoom-out node stroke thickening) ----
  /** Zoom threshold below which dense stroke kicks in (default 0.3) */
  denseStrokeZoomLow?: number;
  /** Zoom threshold for mid-range stroke (default 0.7) */
  denseStrokeZoomMid?: number;
  /** Max world-px stroke at extreme zoom-out (default 6) */
  denseStrokeMaxWidth?: number;
  /** Mid-zoom stroke width (default 1.5) */
  denseStrokeMidWidth?: number;

  // ---- Donut chart ----
  /** Color palette for donut chart sectors (hex numbers). Default: 8-color qualitative palette. */
  donutSectorColors?: number[];

  // ---- Edge density ----
  /** Minimum density scale for edge/cable alpha — prevents edges from becoming invisible at high count + low zoom (default 0.08) */
  edgeDensityFloor?: number;

  // ---- Hover edge highlight ----
  /** Alpha for edges connected to the hovered node (default 1.0). Applied regardless of densityScale. */
  highlightEdgeAlpha?: number;
  /** Alpha for edges NOT connected to the hovered node while hover is active (default 0.15). */
  highlightEdgeNonMatchAlpha?: number;

  // ---- Node radius cap ----
  /** Maximum node radius in world units (default 60). Set 0 = unlimited. */
  maxNodeRadius?: number;
  /** Minimum node radius in world units (default 3). Prevents nodes from becoming
   *  too small to hover/click. Applied after all size calculations. */
  minNodeRadius?: number;
  /** Whether to adapt node size based on zoom level (default true).
   *  When enabled, nodeSize counter-scales with zoom to maintain consistent
   *  screen-space size, and layout is recalculated on zoom changes. */
  zoomNodeSizeAdapt?: boolean;
  /** Show FPS counter in toolbar (debug) */
  showFpsMonitor?: boolean;
  /** Scale node radius proportional to degree (sqrt dampened) */
  nodeSizeByDegree?: boolean;
  /** Minimum hit-test radius in screen pixels (default 4).
   *  Ensures nodes remain hoverable even when very small in world units.
   *  Applied in hitTestNode: effective hit radius = max(worldRadius, minHoverScreenPx / zoom). */
  minHoverScreenPx?: number;

  // ---- Label leader lines ----
  /** Draw thin leader lines from displaced labels to their node (default true) */
  labelLeaderLines?: boolean;
  /** Leader line stroke alpha (default 0.3) */
  labelLeaderLineAlpha?: number;
  /** Leader line stroke width in px (default 0.8) */
  labelLeaderLineWidth?: number;
  /** Counter-scale threshold above which leader lines are always drawn (default 3.0).
   *  When labels are scaled up 3x+, even default-position labels need visual connection to node. */
  labelLeaderLineAlwaysThreshold?: number;

  /** Minimum number of non-super (regular) labels guaranteed to be placed after overlap
   *  culling. If culling leaves fewer than this many non-super labels, the top candidates
   *  by degree are force-shown even if they overlap. Prevents super-node monopoly (AP-5).
   *  Default: 5. Set to 0 to disable. */
  labelMinNonSuper?: number;

  /** Maximum effective label width in screen pixels for the overlap AABB check (default 200).
   *  At extreme zoom-out the counter-scaled world AABB becomes enormous, causing excessive
   *  culling. This cap converts the AABB back to at most N screen pixels wide before
   *  checking overlap. Set to 0 to disable (use raw world AABB). */
  labelOverlapMaxScreenW?: number;
  /** Maximum effective label height in screen pixels for the overlap AABB check (default 60).
   *  Companion to labelOverlapMaxScreenW. */
  labelOverlapMaxScreenH?: number;
  /** Minimum number of labels guaranteed to survive culling regardless of overlap
   *  (including both super and regular). Acts as an absolute floor so the graph is
   *  never completely unlabelled. Default: 3. Set to 0 to disable. */
  labelMinPlaced?: number;
  /** Minimum fraction of culling candidates that must survive as placed labels
   *  (0–1). Ensures AP-4 placed/candidates ratio never falls below this floor
   *  regardless of how many candidates exist. Default: 0.18 (18%). Set to 0 to
   *  disable the ratio floor. */
  labelMinPlacedRatio?: number;

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

  // ---- Semantic zoom / label scaling ----
  /** Minimum on-screen pixel size for node labels (default 14) */
  labelMinScreenPx?: number;
  /** Counter-scale power exponent — controls shrink rate when zooming out (default 0.4) */
  labelScalePower?: number;
  /** Maximum counter-scale factor for labels (default 12) */
  labelScaleMax?: number;
  /** Maximum counter-scale at extreme zoom-out (<0.1) — allows larger labels for readability (default 7) */
  labelScaleMaxExtreme?: number;
  /** Minimum counter-scale factor for labels (default 0.8) */
  labelScaleMin?: number;
  /** Minimum alpha for visible labels regardless of textFadeThreshold (default 0.7) */
  labelAlphaMin?: number;
  /** Zoom threshold: below this only top-10% degree nodes show labels (default 0.15) */
  labelZoomTier1?: number;
  /** Zoom threshold: below this only top-30% degree nodes show labels (default 0.35) */
  labelZoomTier2?: number;
  /** Zoom threshold: below this only top-50% degree nodes show labels (default 0.7) */
  labelZoomTier3?: number;
  /** Degree percentile rank for tier 1 (top N fraction, default 0.10) */
  labelDegreePctTier1?: number;
  /** Degree percentile rank for tier 2 (top N fraction, default 0.30) */
  labelDegreePctTier2?: number;
  /** Degree percentile rank for tier 3 (top N fraction, default 0.50) */
  labelDegreePctTier3?: number;
  /** Maximum number of node labels visible at once (0 = unlimited, default 0).
   *  After semantic-zoom filtering, labels are sorted by degree and capped.
   *  Hovered nodes and their BFS neighbours bypass this limit. */
  labelMaxVisible?: number;
  /** Label density multiplier for zoom-based cap (default 1.0).
   *  Higher values show more labels at zoom-out, lower values show fewer.
   *  Range: 0.2 – 3.0. Applied as multiplier to the zoom-based label cap. */
  labelDensity?: number;
  /** Label pill background color for dark theme (hex, default 0x1a1a2e) */
  labelBgColor?: number;
  /** Label pill background color for light theme (hex, default 0xf0f0f4) */
  labelBgColorLight?: number;
  /** Sync label background with node color (subtle 15% tint, default false) */
  labelBgColorSync?: boolean;
  /** Label pill background alpha (default 0.85) */
  labelBgAlpha?: number;
  /** Label text stroke/outline color (hex, default 0x000000) */
  labelStrokeColor?: number;
  /** Label text stroke width (default 3). 0 = no stroke. */
  labelStrokeWidth?: number;
  /** Zoom threshold below which labels show initials only (2 chars, default 0.2).
   *  Below this zoom, labels are reduced to initials (first letters of path segments). */
  labelInitialsZoom?: number;
  /** Zoom threshold below which label text is truncated (default 0.35).
   *  Between labelInitialsZoom and this, labels are 5-12 char truncated.
   *  At or above this zoom, full label text is shown. */
  labelTruncateZoom?: number;
  /** Max characters for truncated labels at extreme zoom (default 8).
   *  Only applies when zoom < labelTruncateZoom.
   *  Actual chars used = max(labelTruncateMinChars, round(this * zoom/labelTruncateZoom)). */
  labelTruncateMaxChars?: number;
  /** Minimum characters even at the most extreme zoom (default 5).
   *  Prevents labels from becoming unreadable single-char strings.
   *  The actual displayed chars = min(this, textLength) - 1 + ellipsis. */
  labelTruncateMinChars?: number;
  /** Zoom threshold below which node-name labels are hidden unless high-degree (default 0.4).
   *  Super nodes are always eligible. Below this, labels follow tier1/tier2/tier3 rules. */
  nodeLabelZoomMin?: number;
  /** IQR multiplier for enclosure outlier filtering (default 2.0).
   *  Nodes beyond Q3 + factor×IQR from centroid are excluded from the hull.
   *  Higher values include more outliers. */
  enclosureOutlierFactor?: number;
  /** Max displacement distance as a ratio of normBase (default 4.0).
   *  Prevents labels from floating too far from their node after overlap displacement.
   *  AP-1 metric uses normBase = max(radius + visualW*0.3, radius, 1). */
  labelMaxDisplacementRatio?: number;

  // ---- Group label scaling ----
  /** Max counter-scale for group/sunburst/grid labels (default 2.5) */
  groupLabelScaleMax?: number;
  /** Min counter-scale for group/sunburst/grid labels (default 0.5) */
  groupLabelScaleMin?: number;
  /** Power exponent for group label counter-scaling (default 0.35) */
  groupLabelScalePower?: number;
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

  // ---- Zone-based label placement ----
  /** Enable zone-based label placement using neighbor angle analysis (default true) */
  labelZonePlacement?: boolean;
  /** Gap from node edge to label anchor in world px (default 6) */
  labelZoneOffset?: number;

  // ---- Tag labels ----
  /** Show tag labels below nodes (default true) */
  tagLabelShow?: boolean;
  /** Tag label font size (default 9) */
  tagLabelFontSize?: number;
  /** Tag label alpha (default 0.65) */
  tagLabelAlpha?: number;
  /** Zoom threshold below which tag labels are hidden (default 0.75) */
  tagLabelZoomMin?: number;
  /** Vertical offset from node center for tag labels in world px (default 4) */
  tagLabelOffset?: number;
  /** Maximum number of tags to display per node (default 2) */
  tagLabelMaxTags?: number;

  // ---- Node label font scaling by importance ----
  /** Minimum font size for node name labels (default 10) */
  nodeLabelFontSizeMin?: number;
  /** Maximum font size for node name labels (default 14) */
  nodeLabelFontSizeMax?: number;

  // ---- Group label convex hull placement ----
  /** Offset beyond farthest node for group label placement in world px (default 20) */
  groupLabelHullOffset?: number;
  /** Letter spacing for group labels in em units (default 0.15) */
  groupLabelLetterSpacing?: number;
  /** Alpha for group name labels (default 0.6) */
  groupLabelAlpha?: number;
  /** Font size for group labels (default 12) */
  groupLabelFontSize?: number;
  /** Font weight for group labels (default "500") */
  groupLabelFontWeight?: string;
  /** Background alpha for group label pill (default 0.65) */
  groupLabelBgAlpha?: number;

  // ---- Label spacing in layout ----
  /** Factor (0–1) controlling how much estimated label width inflates
   *  node spacing during layout.  0 = ignore labels (legacy), 1 = full
   *  label width added to gap.  Default 0.7. */
  labelSpacingFactor?: number;

  // ---- Hover tooltip ----
  /** Show combined tooltip (name + tags + group) on node hover (default true) */
  hoverTooltipShow?: boolean;
  /** Hover tooltip font size (default 10) */
  hoverTooltipFontSize?: number;

  // ---- Halo background ----
  /** Corner radius for label halo background in px (default 3) */
  labelHaloCornerRadius?: number;

  // ---- Cluster layout blend ----
  /** Sunburst blend base coefficient (default 0.93).
   *  Formula: min(sunburstBlendCeiling, sunburstBlendBase + repelForce * sunburstBlendRepelSensitivity) */
  sunburstBlendBase?: number;
  /** Sunburst blend ceiling — maximum blend factor (default 0.99) */
  sunburstBlendCeiling?: number;
  /** Sunburst blend sensitivity to repelForce (default 0.0008) */
  sunburstBlendRepelSensitivity?: number;
  /** Default blend factor for non-sunburst cluster arrangements (default 0.85) */
  clusterBlendDefault?: number;
  /** Blend decay factor — controls how fast blend decays with simulation alpha (default 3) */
  clusterBlendDecayFactor?: number;

  // ---- Label zone placement tuning ----
  /** Proximity scan radius multiplier for zone-based label placement (default 8).
   *  Scans proximityR = (nodeRadius + offset) * this factor for neighbor angles. */
  labelZoneProximityFactor?: number;
  /** Gap-scale narrow angle threshold in radians (default PI/4).
   *  Gaps below this threshold use labelGapScaleNarrow factor. */
  labelGapScaleNarrowThreshold?: number;
  /** Gap-scale medium angle threshold in radians (default PI/2).
   *  Gaps below this threshold use labelGapScaleMedium factor. */
  labelGapScaleMediumThreshold?: number;
  /** Label distance scaling for narrow gaps (default 0.6) */
  labelGapScaleNarrow?: number;
  /** Label distance scaling for medium gaps (default 0.8) */
  labelGapScaleMedium?: number;

  // ---- Label LOD hysteresis ----
  /** Hysteresis hide factor: once visible, label stays until zoom drops to
   *  minShowZoom × this factor (default 0.7 = 30% margin). */
  labelHysteresisHideFactor?: number;

  // ---- Super-node label ----
  /** Font size for super-node (collapsed group) labels (default 13) */
  superNodeFontSize?: number;
  /** Background alpha for super-node label pill (default 0.9) */
  superNodeLabelBgAlpha?: number;
  /** Maximum displacement for force-show labels, in multiples of node radius
   *  (default 5). Labels that cannot be placed within this range are hidden. */
  labelForceShowMaxRadii?: number;

  // ---- Road network ----
  /** Show auto-generated road network overlay (default true) */
  showRoadNetwork?: boolean;
  /** Road line width in world units (default 6) */
  roadWidth?: number;
  /** Road alpha (default 0.25) */
  roadAlpha?: number;
  /** Road color override — if not set, uses theme-aware default */
  roadColor?: number;
  /** Minimum zoom level to draw edges (default 0 = always draw). Set >0 to skip at extreme zoom-out. */
  edgeMinZoom?: number;
  /** Zoom threshold below which edge thickness/alpha are gradually reduced (default 0.5).
   *  Below this zoom, edges thin & fade proportionally to reduce visual clutter. */
  edgeZoomFadeThreshold?: number;
  /** Zoom level below which edge labels are completely hidden (default 0.15). */
  edgeLabelZoomHide?: number;
  /** Zoom level below which edge labels fade in (default 0.3).
   *  Between edgeLabelZoomHide and this value, labels fade 0→1. */
  edgeLabelZoomFade?: number;
  /** Minimum alpha floor for edges at extreme zoom-out (default 0.1).
   *  Thickness floor = 3×this, breadcrumb floor = 2×this. */
  edgeFadeMinAlpha?: number;
  /** Alpha boost for bidirectional edges (default 0.2). */
  edgeBidirectionalBoost?: number;
  /** Alpha reduction for unidirectional edges when indicator is active (default 0.15). */
  edgeUnidirectionalDim?: number;
  /** Alpha boost for inheritance/hierarchy edges (default 0.3). */
  edgeHierarchyBoost?: number;
  /** Thickness multiplier for bidirectional edges (default 1.5). */
  edgeBidirectionalThickFactor?: number;
  /** Thickness multiplier for inheritance/hierarchy edges (default 2.5). */
  edgeHierarchyThickFactor?: number;
  /** Maximum edge count for arc (quadratic curve) layout (default 500). */
  arcMaxEdgeCount?: number;
  /** Minimum alpha floor for distance-based hover falloff (default 0.08). */
  edgeHoverFalloffMinAlpha?: number;
  /** Minimum zoom level to show roads (default 0 = always visible). Set >0 to hide at extreme zoom-out. */
  roadMinZoom?: number;
  /** Minimum road width in screen pixels (default 1). Roads scale up at low zoom to stay visible. */
  roadMinScreenWidth?: number;
  /** Route edges along road network when available (default true) */
  roadRouteEdges?: boolean;

  // ---- Edge strength glow ----
  /** Scale edge width by target node in-degree (default false) */
  edgeStrengthGlow?: boolean;
  /** Minimum width multiplier when edgeStrengthGlow is enabled (default 0.5) */
  edgeStrengthGlowMin?: number;
  /** Maximum width multiplier when edgeStrengthGlow is enabled (default 3.0) */
  edgeStrengthGlowMax?: number;

  // ---- Road network fallback (used only when no guide data is available) ----
  /** Fallback ring count when no grid info available (default: auto-computed from node count) */
  roadRingCount?: number;
  /** Fallback spoke count when no grid info available (default: auto-computed from ring count) */
  roadSpokeCount?: number;

  // ---- Semantic zoom (M1) ----
  /** Screen-px threshold for compact card tier (default 6) */
  semanticZoomCompactPx?: number;
  /** Screen-px threshold for full card tier (default 15) */
  semanticZoomFullPx?: number;

  // ---- Auto LOD (5-level) ----
  /** LOD 2 threshold (px): above this, show top-30% labels (default 3.0) */
  cardLODMidLabelPx?: number;
  /** LOD 4 threshold (px): above this, auto-switch to compact card (default 8.0) */
  cardLODCompactPx?: number;
  /** LOD 5 threshold (px): above this, auto-switch to full card (default 15.0) */
  cardLODFullCardPx?: number;
  /** Card density fallback: revert card→node mode when visible count exceeds this at LOD 3 (default 150) */
  cardDensityFallbackCount?: number;
  /** IC: Card density fallback at LOD 4: revert card→node when visible > this (default 500) */
  cardDensityFallbackCountHigh?: number;
  /** HP: Max number of neighbor labels shown on hover (default 30) */
  maxHoverNeighborLabels?: number;
  /** HT: Hover edge alpha falloff per hop (0-1, default 0.6) */
  hoverEdgeFalloff?: number;
  /** Auto-LOD: switch display mode based on zoom level (default false) */
  autoLOD?: boolean;
  /** R6: Adaptive label font min multiplier (default 0.7) */
  adaptiveLabelMin?: number;
  /** R6: Adaptive label font max multiplier (default 1.5) */
  adaptiveLabelMax?: number;

  // ---- Focus cone & search highlight ----
  /** Exponential falloff base for focus cone alpha (default 0.65).
   *  depth 0 → 1.0, depth 1 → base, depth 2 → base², ... */
  focusConeFalloff?: number;
  /** Minimum alpha for unreachable/distant nodes in focus cone (default 0.08). */
  focusConeMinAlpha?: number;
  /** Alpha floor for dimmed nodes when focus cone + search overlap (default 0.12).
   *  Prevents dark-theme WCAG contrast issues (IK). */
  focusConeDimFloor?: number;
  /** Alpha for search-only non-matching nodes (no focus cone active, default 0.15).
   *  Raised from 0.06 for dark-theme visibility (IK). */
  searchDimAlpha?: number;
  /** Alpha for search-hit shape halo overlay (default 0.08). */
  searchHaloAlpha?: number;
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
  compactCardStrokeAlpha: 0.3,
  compactCardFillAlpha: 0.08,
  compactCardWidthRatio: 3.5,
  compactCardHeightRatio: 1.8,
  semanticCardFillAlpha: 0.3,
  semanticCardFullFillAlpha: 0.25,
  semanticCardHeaderHeightRatio: 0.8,
  semanticCardHeaderFillAlpha: 0.6,
  cardSubTextAlpha: 0.7,
  cardBodyPreviewAlpha: 0.6,
  plainCardStrokeAlpha: 0.4,
  plainCardFillAlpha: 0.8,
  tableHeaderHeight: 16,
  fieldLineHeight: 12,
  cardPadding: 4,
  cardCornerRadius: 3,
  cardWidthFactor: 4,
  cardAspectRatio: 1.618,
  plainCardHeight: 20,
  headerFontSizeMin: 8,
  headerFontSizeBase: 11,
  fieldFontSizeMin: 7,
  fieldFontSizeBase: 9,
  fontBaselineOffset: 0.3,
  cardShadowAlpha: 0.12,
  cardShadowOffset: 2,
  cardHoverScale: 1.08,
  highlightDimAlpha: 0.1,
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
  cardTextNodeCount: 3000,
  cardBodyMaxLines: 3,
  cardContentScale: 0.5,
  enclosureLabelPosition: "top" as const,
  cardBodyFontSize: 8,
  labelMaxChars: 0,
  enclosureStrokeWidth: 0,
  globalEdgeAlpha: 1.0,
  edgeLabelFontSize: 10,
  enclosureFillOpacity: 0,
  glowNodeCount: 800,
  gridLabelOffset: 12,
  clusterChargeForce: -10,
  coordinateGridDivisions: 5,
  gridLineAlpha: 0.4,
  gridTableLineAlpha: 0.6,
  gridCellShadingMin: 0.08,
  gridCellShadingRange: 0.35,
  cardCollisionPadding: 60,
  collisionPadding: 12,
  superNodeCollisionPadding: 20,
  superNodeInnerRatio: 0.65,
  superNodeOuterStroke: 1.5,
  superNodeInnerStroke: 1.0,
  superNodeInnerAlpha: 0.5,
  prominentTopN: 5,
  nonProminentSaturation: 0.4,
  timelineAxisShowLabels: true,
  timelineAxisLabelFontSize: 9,
  timelineAxisLabelAlpha: 0.7,
  timelineAxisLabelOffset: 10,
  timelineAxisLabelMaxCount: 30,
  timelineBarFillAlpha: 0.35,
  timelineBarStrokeAlpha: 0.8,
  timelineBarCornerRadius: 4,
  timelineBarHoverAlpha: 0.6,
  gridLineMargin: 20,
  gridLineWidthFactor: 0.8,
  gridLabelFontSizeMin: 7,
  gridLabelFontSizeMax: 13,
  gridLabelFontSizeBase: 11,
  axisTitleShow: true,
  axisTitleFontSize: 12,
  axisTitleAlpha: 0.8,
  axisTitleOffset: 18,
  autoFitCardPadding: 20,
  cardLODNormalPx: 4.0,
  cardLODExtremePx: 1.5,
  autoFitMinScale: 0,
  autoFitBasePadding: 40,
  normalizeArrangementSpread: true,
  minViewportUtilization: 0.12,
  enclosureZoomOutThreshold: 0.45,
  labelFadeRate: 0.15,
  labelOverlapCulling: true,
  labelOverlapMargin: 12,
  labelDensityMinScreenDist: 80,
  labelDensityMaxDist: 200,
  labelDensityZoomThreshold: 0.5,
  labelModeOverride: "auto" as const,
  labelCullCooldown: 6,
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
  fadeLowDegreeFloor: 0.2,
  pathfinderStartColor: 0x22d3ee,
  pathfinderEndColor: 0xf97316,
  bookmarkStarColor: 0xf5c542,
  missingNeighborRingColor: 0xff8c00,
  recencyMarkerColor: 0x22c55e,
  denseStrokeZoomLow: 0.3,
  denseStrokeZoomMid: 0.7,
  denseStrokeMaxWidth: 6,
  denseStrokeMidWidth: 1.5,
  donutSectorColors: [0x818cf8, 0xf472b6, 0x34d399, 0xfbbf24, 0x60a5fa, 0xf87171, 0xa78bfa, 0x2dd4bf],
  edgeDensityFloor: 0.12,
  highlightEdgeAlpha: 1.0,
  highlightEdgeNonMatchAlpha: 0.04,
  maxNodeRadius: 60,
  minNodeRadius: 15,
  minHoverScreenPx: 16,
  zoomNodeSizeAdapt: true,
  showFpsMonitor: false,
  nodeSizeByDegree: true,
  labelLeaderLines: true,
  labelLeaderLineAlpha: 0.45,
  labelLeaderLineWidth: 1.2,
  labelLeaderLineAlwaysThreshold: 3.0,
  labelMinNonSuper: 20,
  labelOverlapMaxScreenW: 500,
  labelOverlapMaxScreenH: 150,
  labelMinPlaced: 3,
  labelMinPlacedRatio: 0.18,
  autoOptOverlapThreshold: 0.15,
  autoOptPadIncrement: 0.2,
  autoOptPadMax: 3.0,
  autoOptRepelScale: 1.3,
  autoOptLinkScale: 1.2,
  autoOptMaxPasses: 3,
  autoOptCloseThreshold: 3.0,
  labelMinScreenPx: 20,
  labelScalePower: 0.4,
  labelScaleMax: 6,
  labelScaleMaxExtreme: 7,
  labelScaleMin: 0.8,
  labelAlphaMin: 0.7,
  labelZoomTier1: 0.05,
  labelZoomTier2: 0.15,
  labelZoomTier3: 0.35,
  labelDegreePctTier1: 0.03,
  labelDegreePctTier2: 0.10,
  labelDegreePctTier3: 0.30,
  labelMaxVisible: 0,
  labelDensity: 1.0,
  labelInitialsZoom: 0.2,
  labelTruncateZoom: 0.35,
  labelTruncateMaxChars: 12,
  labelTruncateMinChars: 5,
  nodeLabelZoomMin: 0.90,
  enclosureOutlierFactor: 2.0,
  labelMaxDisplacementRatio: 2.5,
  labelBgColor: 0x1a1a2e,
  labelBgColorLight: 0xf0f0f4,
  labelBgColorSync: false,
  labelBgAlpha: 0.85,
  labelStrokeColor: 0x000000,
  labelStrokeWidth: 3.5,
  groupLabelScaleMax: 4.0,
  groupLabelScaleMin: 0.6,
  groupLabelScalePower: 0.45,
  sunburstDepthLighten: 0.18,
  sunburstMinArcSweep: 0.005,
  sunburstBorderWidth: 1.0,
  sunburstBorderAlpha: 0.3,
  sunburstMaxDepth: 6,

  // Zone-based label placement
  labelZonePlacement: true,
  labelZoneOffset: 6,

  // Tag labels
  tagLabelShow: true,
  tagLabelFontSize: 9,
  tagLabelAlpha: 0.75,
  tagLabelZoomMin: 1.2,
  tagLabelOffset: 4,
  tagLabelMaxTags: 2,

  // Node label font scaling
  nodeLabelFontSizeMin: 16,
  nodeLabelFontSizeMax: 20,

  // Label spacing in layout
  labelSpacingFactor: 0.7,

  // Group label convex hull placement
  groupLabelHullOffset: 24,
  groupLabelLetterSpacing: 0.15,
  groupLabelAlpha: 0.6,
  groupLabelFontSize: 12,
  groupLabelFontWeight: "500",
  groupLabelBgAlpha: 0.65,

  // Hover tooltip
  hoverTooltipShow: true,
  hoverTooltipFontSize: 16,

  // Halo background
  labelHaloCornerRadius: 3,

  // Cluster layout blend
  sunburstBlendBase: 0.93,
  sunburstBlendCeiling: 0.99,
  sunburstBlendRepelSensitivity: 0.0008,
  clusterBlendDefault: 0.85,
  clusterBlendDecayFactor: 3,

  // Label LOD hysteresis
  labelHysteresisHideFactor: 0.7,

  // Label zone placement tuning
  labelZoneProximityFactor: 8,
  labelGapScaleNarrowThreshold: Math.PI / 4,
  labelGapScaleMediumThreshold: Math.PI / 2,
  labelGapScaleNarrow: 0.6,
  labelGapScaleMedium: 0.8,

  // Super-node label
  superNodeFontSize: 13,
  superNodeLabelBgAlpha: 0.9,
  labelForceShowMaxRadii: 5,

  // Edge visibility
  edgeMinZoom: 0,
  edgeZoomFadeThreshold: 0.5,
  edgeLabelZoomHide: 0.15,
  edgeLabelZoomFade: 0.3,
  edgeFadeMinAlpha: 0.1,
  edgeBidirectionalBoost: 0.2,
  edgeUnidirectionalDim: 0.15,
  edgeHierarchyBoost: 0.3,
  edgeBidirectionalThickFactor: 1.5,
  edgeHierarchyThickFactor: 2.5,
  arcMaxEdgeCount: 500,
  edgeHoverFalloffMinAlpha: 0.08,

  // Road network
  showRoadNetwork: true,
  roadWidth: 4,
  roadAlpha: 0.12,
  roadColor: 0x9999bb,
  roadMinZoom: 0,
  roadMinScreenWidth: 1,
  roadRouteEdges: true,
  roadRingCount: 0,
  roadSpokeCount: 0,

  // Edge strength glow
  edgeStrengthGlow: false,
  edgeStrengthGlowMin: 0.5,
  edgeStrengthGlowMax: 3.0,
  semanticZoomCompactPx: 6,
  semanticZoomFullPx: 15,
  cardLODMidLabelPx: 3.0,
  cardLODCompactPx: 8.0,
  cardLODFullCardPx: 15.0,
  cardDensityFallbackCount: 150,
  cardDensityFallbackCountHigh: 500,
  maxHoverNeighborLabels: 30,
  hoverEdgeFalloff: 0.6,
  autoLOD: true,
  adaptiveLabelMin: 0.7,
  adaptiveLabelMax: 1.5,
  // Focus cone & search highlight
  focusConeFalloff: 0.65,
  focusConeMinAlpha: 0.08,
  focusConeDimFloor: 0.12,
  searchDimAlpha: 0.15,
  searchHaloAlpha: 0.08,
};

/** Merge user overrides with defaults, returning a fully-populated object.
 *  Centralises the `as Required` cast so callers don't need `??` fallbacks. */
export function mergeRenderThresholds(
  user?: Partial<RenderThresholds>,
): Required<RenderThresholds> {
  return { ...DEFAULT_RENDER_THRESHOLDS, ...(user ?? {}) } as Required<RenderThresholds>;
}

export const DEFAULT_COLORS = [
  "#818cf8", "#f472b6", "#fbbf24", "#34d399",
  "#60a5fa", "#f87171", "#b4a0ff", "#2dd4bf",
  "#fb923c", "#22d3ee", "#a3e635", "#fb7185",
] as const;
