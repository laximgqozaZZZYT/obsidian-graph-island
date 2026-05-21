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
	// Per-view display toggles.
	showBody: boolean;
	showEnclosures: boolean;
	showEdges: boolean;
	panelVisible: boolean;
	clusterOffsets: Record<string, Offset>;
	nodeOffsets: Record<string, Offset>;
}

export const DEFAULT_SETTINGS: MiniSettings = {
	clusterSpacing: 48,
	nodeSpacing: 16,
	cardMaxChars: 160,
	where: [],
	groupBy: ["tag:?"],
	showBody: true,
	showEnclosures: true,
	showEdges: true,
	panelVisible: false,
	clusterOffsets: {},
	nodeOffsets: {},
};

export const NONE_BUCKET = "(none)";

// Card text geometry. Title and body lines use different sizes/weights.
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
