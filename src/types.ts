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
  | "semantic";

export type LayoutType =
  | "force"
  | "concentric"
  | "tree"
  | "arc"
  | "sunburst";

export interface ForceLayoutOptions {
  iterations?: number;
  repulsionStrength?: number;
  attractionStrength?: number;
  damping?: number;
  idealEdgeLength?: number;
  gravity?: number;
  centerX?: number;
  centerY?: number;
}

export interface ConcentricLayoutOptions {
  centerX?: number;
  centerY?: number;
  minRadius?: number;
  radiusStep?: number;
  sortByInDegree?: boolean;
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
}

export interface ArcLayoutOptions {
  centerX?: number;
  centerY?: number;
  radius?: number;
  sortBy?: "degree" | "category" | "label";
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

export interface GraphViewsSettings {
  defaultLayout: LayoutType;
  nodeSize: number;
  showLabels: boolean;
  metadataFields: string[];
  edgeFields: string[];
  colorField: string;
  groupField: string;
}

export const DEFAULT_SETTINGS: GraphViewsSettings = {
  defaultLayout: "force",
  nodeSize: 6,
  showLabels: true,
  metadataFields: ["tags", "category", "characters", "locations"],
  edgeFields: ["tags", "category"],
  colorField: "category",
  groupField: "category",
};

export const DEFAULT_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  "#f97316", "#06b6d4", "#84cc16", "#e11d48",
] as const;
