export interface GraphNode {
	id: string;
	label: string;
	groupKey: string;
}

export interface GraphEdge {
	source: string;
	target: string;
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export type GroupBySpec =
	| { kind: "none" }
	| { kind: "folder" }
	| { kind: "tag" }
	| { kind: "frontmatter"; field: string };

export interface Offset {
	dx: number;
	dy: number;
}

export interface MiniSettings {
	groupBy: GroupBySpec;
	clusterSpacing: number;
	nodeSpacing: number;
	cardMaxChars: number;
	clusterOffsets: Record<string, Offset>;
	nodeOffsets: Record<string, Offset>;
}

export const DEFAULT_SETTINGS: MiniSettings = {
	groupBy: { kind: "folder" },
	clusterSpacing: 48,
	nodeSpacing: 16,
	cardMaxChars: 160,
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
