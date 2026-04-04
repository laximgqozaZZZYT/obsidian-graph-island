// ---------------------------------------------------------------------------
// Louvain Community Detection — モジュラリティ最適化によるコミュニティ検出
// ---------------------------------------------------------------------------
// 標準的な Louvain アルゴリズム:
//   Phase 1: 各ノードを隣接コミュニティに移動してモジュラリティを改善
//   Phase 2: コミュニティをスーパーノードに集約して繰り返す
//   改善がなくなったら停止
// ---------------------------------------------------------------------------

/** エッジ入力型（重みはオプション） */
export interface LouvainEdge {
	source: string;
	target: string;
	weight?: number;
}

/** 隣接リスト構築結果 */
interface AdjacencyResult {
	adj: Map<number, number>[];
	totalWeight: number;
}

/**
 * エッジ配列から無向グラフの隣接リストを構築する。
 * 自己ループは無視し、同一ペアの重みは加算される。
 */
export function buildAdjacencyList(
	edges: LouvainEdge[],
	idToIdx: Map<string, number>,
	n: number,
): AdjacencyResult {
	const adj: Map<number, number>[] = new Array(n);
	for (let i = 0; i < n; i++) adj[i] = new Map();

	let totalWeight = 0;
	for (const e of edges) {
		const si = idToIdx.get(e.source);
		const ti = idToIdx.get(e.target);
		if (si === undefined || ti === undefined) continue;
		if (si === ti) continue;
		const w = e.weight ?? 1;
		adj[si].set(ti, (adj[si].get(ti) ?? 0) + w);
		adj[ti].set(si, (adj[ti].get(si) ?? 0) + w);
		totalWeight += w;
	}

	return { adj, totalWeight };
}

/** 各ノードの次数（隣接エッジ重みの合計）を計算する。 */
export function computeNodeDegrees(adj: Map<number, number>[], n: number): Float64Array {
	const degree = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let d = 0;
		for (const w of adj[i].values()) d += w;
		degree[i] = d;
	}
	return degree;
}

/** コミュニティIDを連番に振り直し、ノードID → コミュニティID マッピングを返す。 */
export function renumberCommunities(
	community: Int32Array,
	nodeIds: string[],
): Map<string, number> {
	const uniqueComms = new Map<number, number>();
	let nextId = 0;
	for (let i = 0; i < community.length; i++) {
		const c = community[i];
		if (!uniqueComms.has(c)) {
			uniqueComms.set(c, nextId++);
		}
	}

	const result = new Map<string, number>();
	for (let i = 0; i < community.length; i++) {
		result.set(nodeIds[i], uniqueComms.get(community[i])!);
	}
	return result;
}

/**
 * Louvain コミュニティ検出を実行する。
 * @param nodeIds ノードIDの配列
 * @param edges   ソース/ターゲットペアの配列（重みオプション）
 * @returns ノードID → コミュニティID のマッピング
 */
export function louvainCommunities(nodeIds: string[], edges: LouvainEdge[]): Map<string, number> {
	if (nodeIds.length === 0) return new Map();

	const idToIdx = new Map<string, number>();
	for (let i = 0; i < nodeIds.length; i++) {
		idToIdx.set(nodeIds[i], i);
	}

	const n = nodeIds.length;
	const { adj, totalWeight } = buildAdjacencyList(edges, idToIdx, n);

	if (totalWeight === 0) {
		const result = new Map<string, number>();
		for (let i = 0; i < n; i++) result.set(nodeIds[i], i);
		return result;
	}

	const m2 = totalWeight * 2;
	const degree = computeNodeDegrees(adj, n);

	// 初期コミュニティ: 各ノードが独自のコミュニティ
	const community = new Int32Array(n);
	for (let i = 0; i < n; i++) community[i] = i;

	// コミュニティ内の重み合計（Σ_in）とコミュニティの次数合計（Σ_tot）
	const sigmaIn = new Float64Array(n);
	const sigmaTot = new Float64Array(n);
	for (let i = 0; i < n; i++) sigmaTot[i] = degree[i];

	/** Find the best neighbor community for node i; returns community id or -1 if no improvement. */
	function findBestCommunity(
		i: number,
		neighborComm: Map<number, number>,
		kiIn: number,
	): number {
		const ci = community[i];
		const ki = degree[i];
		const removeCost = kiIn - ((sigmaTot[ci] - ki) * ki) / m2;
		let bestComm = -1;
		let bestGain = 0;
		for (const [cTarget, wTarget] of neighborComm) {
			if (cTarget === ci) continue;
			const gain = wTarget - (sigmaTot[cTarget] * ki) / m2 - removeCost;
			if (gain > bestGain) {
				bestGain = gain;
				bestComm = cTarget;
			}
		}
		return bestComm;
	}

	// Phase 1: ローカルな移動による最適化
	const MAX_PASSES = 20;
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		let improved = false;

		for (let i = 0; i < n; i++) {
			const ci = community[i];

			const neighborComm = new Map<number, number>();
			let kiIn = 0;
			for (const [j, w] of adj[i]) {
				const cj = community[j];
				neighborComm.set(cj, (neighborComm.get(cj) ?? 0) + w);
				if (cj === ci) kiIn += w;
			}

			const bestComm = findBestCommunity(i, neighborComm, kiIn);
			if (bestComm < 0) continue;

			const ki = degree[i];
			sigmaIn[ci] -= 2 * kiIn;
			sigmaTot[ci] -= ki;

			const kiNewIn = neighborComm.get(bestComm) ?? 0;
			sigmaIn[bestComm] += 2 * kiNewIn;
			sigmaTot[bestComm] += ki;

			community[i] = bestComm;
			improved = true;
		}

		if (!improved) break;
	}

	return renumberCommunities(community, nodeIds);
}
