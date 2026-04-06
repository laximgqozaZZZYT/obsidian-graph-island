// ---------------------------------------------------------------------------
// snapshot.ts — グラフスナップショットのキャプチャと差分計算
// ---------------------------------------------------------------------------
// 純粋関数のみ。DOM・Canvas依存なし。
// ---------------------------------------------------------------------------

import type { GraphData, GraphNode, GraphSnapshot, SnapshotNode, SnapshotEdge, SnapshotDiff } from "../types";
import { edgeSourceId, edgeTargetId } from "./graph-helpers";

// ---------------------------------------------------------------------------
// FNV-1a 32bit ハッシュ — 変更検出用（暗号用途ではない）
// ---------------------------------------------------------------------------
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 文字列を FNV-1a 32bit ハッシュに変換し、16進文字列で返す */
export function fnv1a(str: string): string {
	let hash = FNV_OFFSET;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	// 符号なし32ビットに変換して16進文字列化
	return (hash >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// メタデータハッシュ — ネストされたオブジェクトも再帰的にキーをソート
// ---------------------------------------------------------------------------

/** オブジェクトのキーを再帰的にソートして安定した文字列表現を得る */
function stableStringify(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return "[" + value.map(stableStringify).join(",") + "]";
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

/** ノードのメタデータからハッシュ文字列を生成する */
export function hashMeta(meta: Record<string, unknown> | undefined): string {
	if (!meta || Object.keys(meta).length === 0) return "";
	return fnv1a(stableStringify(meta));
}

// ---------------------------------------------------------------------------
// スナップショットキャプチャ
// ---------------------------------------------------------------------------

/** 現在のグラフ状態からスナップショットを作成する */
export function captureSnapshot(
	data: GraphData,
	name: string,
	context: {
		layout: string;
		searchQuery: string;
		groupBy: string;
	},
): GraphSnapshot {
	const nodes: SnapshotNode[] = data.nodes.map((n) => ({
		id: n.id,
		metaHash: hashMeta(n.meta),
	}));

	const edges: SnapshotEdge[] = data.edges.map((e) => ({
		source: edgeSourceId(e as any),
		target: edgeTargetId(e as any),
		type: e.type ?? "link",
	}));

	return {
		name,
		createdAt: new Date().toISOString(),
		nodes,
		edges,
		context: {
			...context,
			nodeCount: nodes.length,
			edgeCount: edges.length,
		},
	};
}

// ---------------------------------------------------------------------------
// エッジキーの生成ヘルパー
// ---------------------------------------------------------------------------

/** エッジを一意に識別するキー文字列を生成する (NUL区切り — IDに含まれない文字) */
export function edgeKey(source: string, target: string, type: string): string {
	return `${source}\0${target}\0${type}`;
}

// ---------------------------------------------------------------------------
// 差分計算 — O(N + E)
// ---------------------------------------------------------------------------

/** スナップショットと現在のグラフデータの差分を計算する */
export function computeSnapshotDiff(current: GraphData, snapshot: GraphSnapshot): SnapshotDiff {
	// スナップショットのノードをMapに変換
	const snapNodeMap = new Map<string, SnapshotNode>();
	for (const sn of snapshot.nodes) {
		snapNodeMap.set(sn.id, sn);
	}

	const addedNodeIds = new Set<string>();
	const changedNodeIds = new Set<string>();
	const seenIds = new Set<string>();

	// 現在のノードを走査
	for (const node of current.nodes) {
		const snapNode = snapNodeMap.get(node.id);
		if (!snapNode) {
			// スナップショットに存在しない → 追加されたノード
			addedNodeIds.add(node.id);
		} else {
			// メタデータハッシュが異なる → 変更されたノード
			const currentHash = hashMeta(node.meta);
			if (currentHash !== snapNode.metaHash) {
				changedNodeIds.add(node.id);
			}
		}
		seenIds.add(node.id);
	}

	// スナップショットにあって現在のグラフにないノード → 削除されたノード
	const removedNodes: SnapshotNode[] = [];
	for (const sn of snapshot.nodes) {
		if (!seenIds.has(sn.id)) {
			removedNodes.push(sn);
		}
	}

	// エッジの差分計算
	const snapEdgeKeys = new Set<string>();
	for (const se of snapshot.edges) {
		snapEdgeKeys.add(edgeKey(se.source, se.target, se.type));
	}

	const currentEdgeKeys = new Set<string>();
	const addedEdgeKeys = new Set<string>();
	for (const e of current.edges) {
		const k = edgeKey(e.source, e.target, e.type ?? "link");
		currentEdgeKeys.add(k);
		if (!snapEdgeKeys.has(k)) {
			addedEdgeKeys.add(k);
		}
	}

	const removedEdges: SnapshotEdge[] = [];
	for (const se of snapshot.edges) {
		const k = edgeKey(se.source, se.target, se.type);
		if (!currentEdgeKeys.has(k)) {
			removedEdges.push(se);
		}
	}

	return {
		addedNodeIds,
		removedNodes,
		changedNodeIds,
		addedEdgeKeys,
		removedEdges,
	};
}

/**
 * Compare two snapshots directly (without live graph data).
 * "newer" is treated as "current state", "older" is treated as "baseline".
 * Nodes in newer but not in older → added.
 * Nodes in older but not in newer → removed.
 * Nodes in both with different metaHash → changed.
 */
export function computeSnapshotToSnapshotDiff(newer: GraphSnapshot, older: GraphSnapshot): SnapshotDiff {
	const olderNodeMap = new Map<string, SnapshotNode>();
	for (const sn of older.nodes) olderNodeMap.set(sn.id, sn);

	const addedNodeIds = new Set<string>();
	const changedNodeIds = new Set<string>();
	const seenIds = new Set<string>();

	for (const sn of newer.nodes) {
		const old = olderNodeMap.get(sn.id);
		if (!old) {
			addedNodeIds.add(sn.id);
		} else if (sn.metaHash !== old.metaHash) {
			changedNodeIds.add(sn.id);
		}
		seenIds.add(sn.id);
	}

	const removedNodes: SnapshotNode[] = [];
	for (const sn of older.nodes) {
		if (!seenIds.has(sn.id)) removedNodes.push(sn);
	}

	// Edge diff
	const olderEdgeKeys = new Set(older.edges.map((e) => edgeKey(e.source, e.target, e.type)));
	const newerEdgeKeys = new Set(newer.edges.map((e) => edgeKey(e.source, e.target, e.type)));

	const addedEdgeKeys = new Set<string>();
	for (const k of newerEdgeKeys) {
		if (!olderEdgeKeys.has(k)) addedEdgeKeys.add(k);
	}

	const removedEdges: SnapshotEdge[] = [];
	for (const e of older.edges) {
		if (!newerEdgeKeys.has(edgeKey(e.source, e.target, e.type))) {
			removedEdges.push(e);
		}
	}

	return { addedNodeIds, removedNodes, changedNodeIds, addedEdgeKeys, removedEdges };
}
