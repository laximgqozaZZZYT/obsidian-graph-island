export interface GraphNode {
	id: string;
	label: string;
	// Cluster keys this node belongs to. Single-cluster files have one entry;
	// multi-tag files (when GROUP_BY uses `tag:?`) have one entry per tag.
	memberships: string[];
}

export interface GraphEdge {
	source: string;
	target: string;
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface Offset {
	dx: number;
	dy: number;
}

export interface MiniSettings {
	clusterSpacing: number;
	nodeSpacing: number;
	cardMaxChars: number;
	// Each entry is one query row in the panel. Empty rows are ignored; all
	// non-empty rows are AND-combined for evaluation.
	where: string[];
	groupBy: string[];
	// SQL-like aggregate post-filter. Each row is "count <op> <number>"; rows
	// are AND-combined. Failing clusters keep their nodes visible but their
	// enclosure (outline + label) is suppressed.
	having: string[];
	// Per-cluster node display tiers: `limit N` (top N shown full) and
	// `brief N` (next batch shown title-only). Anything beyond the highest
	// tier is hidden. The sort order used to compute "top N" comes from
	// orderField/orderDir below.
	limit: string[];
	// Sort criterion shared by LIMIT tiers. `orderField` accepts built-ins
	// (name/mtime/ctime/size) plus any frontmatter field name.
	orderField: string;
	orderDir: "asc" | "desc";
	// When `*Auto` is true, the system AND-augments the corresponding section
	// with auto-computed conditions so the default view stays readable. Manual
	// rows are always respected and combine multiplicatively with the auto
	// additions.
	whereAuto: boolean;
	groupByAuto: boolean;
	havingAuto: boolean;
	limitAuto: boolean;
	// "concentric": focus at centre, others fill expanding rings around it.
	// "flow": focus at top-left, others fill columns to the right (main flow
	// direction = toward the focus / "stage").
	anchorPlacement: "concentric" | "flow";
	// Per-view display toggles.
	showBody: boolean;
	// Card span in grid units. nodeRows = m (height in cells), nodeCols = n
	// (width in cells). Default 1 × 1 (= a single cell). When nodeSizeMode
	// != "fixed" the (m, n) pair is multiplied by a shared scale factor so
	// the m : n aspect ratio survives.
	nodeRows: number;
	nodeCols: number;
	nodeSizeMode: "fixed" | "indegree" | "outdegree";
	showEnclosures: boolean;
	showEdges: boolean;
	// Excel-style row/column lattice underlay. Cell size = unified card W × H;
	// rows/columns are inferred from actual card centres, not from cluster
	// bounding boxes (so clusters can overlap the grid freely).
	showGrid: boolean;
	// Per-card visibility. List of node IDs explicitly hidden globally.
	// Managed via per-layer card toggles in the settings panel.
	hiddenNodes: string[];
	// Cluster keys whose members are replaced on the canvas by a single
	// 3-card diagonal stack (aggregate display).
	aggregatedLayers: string[];
	// Inheritance map: child layer key → parent (source) layer key. When
	// set, the child cluster's bbox grows to engulf the parent's bbox so
	// the parent visually "joins" the child territory.
	inheritFrom: Record<string, string>;
	// Per-cluster NODE_DISPLAY overrides. Resolution order for a node:
	//   1. Override on the node's own group
	//   2. Override on `inheritFrom[group]`
	//   3. Override on any cluster that's a strict superset of the group
	//   4. Global setting (= this.nodeRows / nodeCols / nodeSizeMode)
	// Each field is optional — a partial override only replaces what it
	// defines; unset fields fall through to the next priority level.
	nodeDisplayOverrides: Record<
		string,
		{
			nodeRows?: number;
			nodeCols?: number;
			nodeSizeMode?: "fixed" | "indegree" | "outdegree";
		}
	>;
	panelVisible: boolean;
	clusterOffsets: Record<string, Offset>;
	nodeOffsets: Record<string, Offset>;
	// View mode for the [全体] tab. "euler" = the current Euler-diagram
	// rectangle layout. Future modes will be appended here.
	viewMode: ViewMode;
}

export type ViewMode = "euler";

export interface ViewModeOption {
	id: ViewMode;
	label: string;
	description?: string;
}

export const VIEW_MODES: ViewModeOption[] = [
	{ id: "euler", label: "Euler diagram", description: "Main / sub rectangle enclosures" },
];

export const DEFAULT_SETTINGS: MiniSettings = {
	clusterSpacing: 80,
	nodeSpacing: 16,
	cardMaxChars: 160,
	where: [],
	groupBy: ["tag:*"],
	having: [],
	limit: [],
	orderField: "name",
	orderDir: "asc",
	whereAuto: true,
	groupByAuto: true,
	havingAuto: true,
	limitAuto: true,
	anchorPlacement: "concentric",
	showBody: true,
	nodeRows: 1,
	nodeCols: 1,
	nodeSizeMode: "fixed",
	showEnclosures: true,
	showEdges: true,
	showGrid: true,
	hiddenNodes: [],
	aggregatedLayers: [],
	inheritFrom: {},
	nodeDisplayOverrides: {},
	panelVisible: false,
	clusterOffsets: {},
	nodeOffsets: {},
	viewMode: "euler",
};

export const NONE_BUCKET = "(none)";

// Card text geometry. Title and body lines use different sizes/weights.
export const CARD_RADIUS_PX = 4;
export const CARD_TITLE_FONT_PX = 12;
export const CARD_BODY_FONT_PX = 10;
export const CARD_LINE_HEIGHT_PX = 14;
export const CARD_BODY_LINE_HEIGHT_PX = 12;
export const CARD_PAD_X = 8;
export const CARD_PAD_Y = 6;
export const CARD_TITLE_BODY_GAP = 4;
export const CARD_MIN_W = 80;
export const CARD_MAX_W = 240;
export const CARD_BODY_CHARS_MIN = 0;
export const CARD_BODY_CHARS_MAX = 400;

// Single-cell pixel dimensions for the global grid. A card with nodeRows = 1
// and nodeCols = 1 occupies exactly one cell at this size; multi-cell cards
// scale these uniformly by (rows, cols).
export const CARD_CELL_W = 120;
export const CARD_CELL_H = 32;
