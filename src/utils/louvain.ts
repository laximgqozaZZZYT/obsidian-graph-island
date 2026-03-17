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

/**
 * Louvain コミュニティ検出を実行する。
 * @param nodeIds ノードIDの配列
 * @param edges   ソース/ターゲットペアの配列（重みオプション）
 * @returns ノードID → コミュニティID のマッピング
 */
export function louvainCommunities(
  nodeIds: string[],
  edges: LouvainEdge[],
): Map<string, number> {
  if (nodeIds.length === 0) return new Map();

  // ノードIDを連番インデックスにマッピング
  const idToIdx = new Map<string, number>();
  for (let i = 0; i < nodeIds.length; i++) {
    idToIdx.set(nodeIds[i], i);
  }

  const n = nodeIds.length;

  // 隣接リストと重み行列（スパース）を構築
  // adj[i] = Map<neighbor_index, weight>
  const adj: Map<number, number>[] = new Array(n);
  for (let i = 0; i < n; i++) adj[i] = new Map();

  let totalWeight = 0;
  for (const e of edges) {
    const si = idToIdx.get(e.source);
    const ti = idToIdx.get(e.target);
    if (si === undefined || ti === undefined) continue;
    if (si === ti) continue; // 自己ループは無視
    const w = e.weight ?? 1;
    // 無向グラフとして両方向に追加（既存の重みに加算）
    adj[si].set(ti, (adj[si].get(ti) ?? 0) + w);
    adj[ti].set(si, (adj[ti].get(si) ?? 0) + w);
    totalWeight += w;
  }

  if (totalWeight === 0) {
    // エッジがない場合は各ノードを独立コミュニティにする
    const result = new Map<string, number>();
    for (let i = 0; i < n; i++) result.set(nodeIds[i], i);
    return result;
  }

  const m2 = totalWeight * 2; // 2m（無向グラフの総エッジ重みの2倍）

  // 各ノードの次数（重み合計）
  const degree = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (const w of adj[i].values()) d += w;
    degree[i] = d;
  }

  // 初期コミュニティ: 各ノードが独自のコミュニティ
  const community = new Int32Array(n);
  for (let i = 0; i < n; i++) community[i] = i;

  // コミュニティ内の重み合計（Σ_in）とコミュニティの次数合計（Σ_tot）
  const sigmaIn = new Float64Array(n);  // 初期は0（1ノードのみのコミュニティ）
  const sigmaTot = new Float64Array(n);
  for (let i = 0; i < n; i++) sigmaTot[i] = degree[i];

  // Phase 1: ローカルな移動による最適化
  const MAX_PASSES = 20;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;

    for (let i = 0; i < n; i++) {
      const ci = community[i];
      const ki = degree[i];

      // ノードiの各隣接コミュニティへの接続重みを計算
      const neighborComm = new Map<number, number>(); // community → weight to i
      let kiIn = 0; // ノードiから自身のコミュニティへの重み
      for (const [j, w] of adj[i]) {
        const cj = community[j];
        neighborComm.set(cj, (neighborComm.get(cj) ?? 0) + w);
        if (cj === ci) kiIn += w;
      }

      // ノードiを現在のコミュニティから除去した場合のモジュラリティ変化
      const removeCost = kiIn - (sigmaTot[ci] - ki) * ki / m2;

      // 最良の移動先を探索
      let bestComm = ci;
      let bestGain = 0;

      for (const [cTarget, wTarget] of neighborComm) {
        if (cTarget === ci) continue;
        // cTargetに追加した場合のモジュラリティ改善
        const gain = wTarget - sigmaTot[cTarget] * ki / m2 - removeCost;
        if (gain > bestGain) {
          bestGain = gain;
          bestComm = cTarget;
        }
      }

      // 改善があれば移動
      if (bestComm !== ci) {
        // 現在のコミュニティから除去
        sigmaIn[ci] -= 2 * kiIn; // kiInは片方向なので×2
        sigmaTot[ci] -= ki;

        // 新しいコミュニティに追加
        const kiNewIn = neighborComm.get(bestComm) ?? 0;
        sigmaIn[bestComm] += 2 * kiNewIn;
        sigmaTot[bestComm] += ki;

        community[i] = bestComm;
        improved = true;
      }
    }

    if (!improved) break;
  }

  // コミュニティIDを連番に振り直す
  const uniqueComms = new Map<number, number>();
  let nextId = 0;
  for (let i = 0; i < n; i++) {
    const c = community[i];
    if (!uniqueComms.has(c)) {
      uniqueComms.set(c, nextId++);
    }
  }

  // 結果マッピングを構築
  const result = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    result.set(nodeIds[i], uniqueComms.get(community[i])!);
  }

  return result;
}
