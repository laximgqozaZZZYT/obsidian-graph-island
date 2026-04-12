// ---------------------------------------------------------------------------
// Timeline Layout 型定義
// ---------------------------------------------------------------------------
// Phase 1: 既存の型を再エクスポート + 将来のフェーズ用データモデル定義
// cluster-force.ts から分離し、timeline-layout.ts と共有する
// ---------------------------------------------------------------------------

import type { GraphNode } from "../types";

// ---------------------------------------------------------------------------
// Phase 2+ 用の中間表現 (Intermediate Representation)
// ---------------------------------------------------------------------------

/** タイムライン構造グラフ上のノード */
interface TimelineNode {
	id: string;
	graphNode: GraphNode;
	/** 解決済みの時間値 (timelineKey フィールド由来)。未設定なら null */
	timeValue: string | null;
	/** 親スコープ内での story_order (数値) */
	storyOrder: number;
	/** 親ノード ID (parent_id フィールド由来)。ルートなら null */
	parentId: string | null;
	/** 期間バーの開始日 (timelineKey または start-date 由来) */
	startDate: string | null;
	/** 期間バーの終了日 (timelineEndKey 由来) */
	endDate: string | null;
}

/** タイムライン構造グラフ上の有向辺 */
interface TimelineEdge {
	from: string; // ソースノード ID
	to: string; // ターゲットノード ID
	type: "sequence" | "hierarchy" | "branch";
}

/** シーケンスリンクで接続されたノードの線形チェーン */
interface TimelineChain {
	/** 先頭から末尾までの順序付きノード ID */
	nodeIds: string[];
	/** チェーン ID (レーン割り当て用) */
	chainId: string;
}

/** サイクルを示すバックエッジ */
interface CycleBackEdge {
	fromId: string;
	toId: string;
	/** このサイクルが属するチェーン */
	chainId: string;
}

/** 親ノードをルートとするツリー */
interface HierarchyTree {
	rootId: string;
	children: Map<string, { id: string; storyOrder: number }[]>;
}

// ---------------------------------------------------------------------------
// レーン割り当てモデル
// ---------------------------------------------------------------------------

/** タイムラインレイアウト上の水平レーン */
interface TimelineLane {
	/** ユニークなレーンインデックス (0 = 最上部) */
	index: number;
	/** レイアウト原点からの Y オフセット */
	yOffset: number;
	/** このレーンを占有するチェーンまたはサブチェーン */
	chainId: string;
	/** 子レーンかどうか (親の下にインデントされる) */
	isChildLane: boolean;
	/** 親レーンインデックス (子レーンまたは分岐レーンの場合) */
	parentLaneIndex: number | null;
}

/** 単一ノードの配置結果 */
interface TimelinePlacement {
	nodeId: string;
	/** X 位置 (時間軸) */
	x: number;
	/** Y 位置 (レーン軸) */
	y: number;
	/** 割り当て先レーン */
	laneIndex: number;
	/** 時間軸上のカラムインデックス */
	columnIndex: number;
}
