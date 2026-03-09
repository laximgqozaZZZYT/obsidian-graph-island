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
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: EdgeType;
  label?: string;
  /** Excalibrain-style relation name (e.g. "Author", "Location") */
  relation?: string;
  /** Similarity score between 0 and 1 (future use) */
  similarityScore?: number;
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
  | "similar";

export type LayoutType =
  | "force"
  | "concentric"
  | "tree"
  | "arc"
  | "sunburst";

/** How to partition nodes into clusters within the force layout */
export type ClusterGroupBy = "none" | "tag" | "backlinks" | "node_type";

/** How to arrange nodes within each cluster */
export type ClusterArrangement = "spiral" | "concentric" | "tree" | "grid";

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

export interface ConcentricLayoutOptions {
  centerX?: number;
  centerY?: number;
  minRadius?: number;
  radiusStep?: number;
  sortByInDegree?: boolean;
  sortComparator?: (a: GraphNode, b: GraphNode) => number;
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

export interface OntologyConfig {
  /** Frontmatter/inline field names treated as inheritance (is-a) */
  inheritanceFields: string[];
  /** Frontmatter/inline field names treated as aggregation (has-a) */
  aggregationFields: string[];
  /** Derive inheritance edges from nested tags like #a/b/c */
  useTagHierarchy: boolean;
  /** Frontmatter/inline field names treated as similarity (related-to) */
  similarFields: string[];
  /** Map arbitrary relation names to ontology types (ExcaliBrain compat) */
  customMappings: Record<string, "inheritance" | "aggregation" | "similar">;
}

export const DEFAULT_ONTOLOGY: OntologyConfig = {
  inheritanceFields: ["parent", "extends", "up"],
  aggregationFields: ["contains", "parts", "has"],
  similarFields: ["similar", "related"],
  useTagHierarchy: true,
  customMappings: {},
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
};

export const DEFAULT_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  "#f97316", "#06b6d4", "#84cc16", "#e11d48",
] as const;
