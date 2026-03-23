// ---------------------------------------------------------------------------
// Timeline Layout — cluster-force.ts から分離したタイムライン配置エンジン
// ---------------------------------------------------------------------------
// Phase 1: 既存の timelineOffsets パイプラインをそのまま移動 (動作変更なし)
// 元の関数シグネチャを維持し、cluster-force.ts からインポートして呼び出す
// ---------------------------------------------------------------------------

import type { GraphNode, GraphEdge } from "../types";
import {
  ARRANGEMENT_TIMELINE, EDGE_TYPE_SEQUENCE,
} from "../constants";
import type {
  ClusterForceConfig,
  ArrangementResult,
  TimelineBarInfo,
} from "./cluster-force";

// ---------------------------------------------------------------------------
// ユーティリティ関数 (cluster-force.ts からの依存)
// ---------------------------------------------------------------------------

/** ノード固有のスペーシング倍率を取得 */
function getSpacing(id: string, map?: Map<string, number>): number {
  return map?.get(id) ?? 1.0;
}

/** 2要素間のペアワイズギャップ (中心間距離) */
function pairwiseGap(r1: number, r2: number, spacing: number): number {
  return Math.max(r1, r2) * 2 * spacing;
}

// ---------------------------------------------------------------------------
// ArrangementParams — timelineOffsetsV2 が受け取るパラメータ型
// ---------------------------------------------------------------------------

/** cluster-force.ts 内の ArrangementParams と同一構造 */
export interface TimelineArrangementParams {
  members: GraphNode[];
  degrees: Map<string, number>;
  edges: GraphEdge[];
  nodeSpacing: number;
  groupScale: number;
  nodeSize: number;
  maxGroupNodeR: number;
  cmp: (a: GraphNode, b: GraphNode) => number;
  nodeSpacingMap?: Map<string, number>;
  cfg: ClusterForceConfig;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** タイムラインキーの自動検出フォールバック候補 */
const TIMELINE_FALLBACK_KEYS = [
  "start-date", "story_order", "order", "sequence", "created", "date",
  "era", "turn", "chapter", "episode", "sort", "priority", "index",
];

// ---------------------------------------------------------------------------
// TimelineGuide — タイムライン軸ガイドデータ
// ---------------------------------------------------------------------------

/** タイムラインガイド (軸 + 目盛り) */
interface TimelineGuide {
  type: "timeline";
  axisY: number;
  ticks: { x: number; label: string }[];
}

// ---------------------------------------------------------------------------
// メインエントリポイント
// ---------------------------------------------------------------------------

/**
 * タイムライン配置のエントリポイント。
 * cluster-force.ts の timelineOffsets() と完全に同一の動作。
 */
export function timelineOffsetsV2(p: TimelineArrangementParams): ArrangementResult {
  const { members, nodeSpacing, groupScale, nodeSize, nodeSpacingMap, cfg } = p;
  const getNodeProperty = cfg.getNodeProperty;
  const userConstants = cfg.userConstants;

  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = members.length;
  if (n === 0) return { offsets };

  // pairwiseGap で nodeSize ベースのスペーシング算出
  const spacing = pairwiseGap(nodeSize, nodeSize, Math.max(nodeSpacing, groupScale));

  // --- Step 1: ノードを timed/untimed に分割し、リンクベース順序を適用 ---
  const { timed, untimed, detectedChains, hierParentMap, hierChildrenMap } = timelinePartitionNodes(members, cfg);

  // --- Step 2: timed ノードをソートし、タイムステップを構築 ---
  const { sortedTimed, uniqueTimes, timeIndexMap, allNumeric } = timelineSortAndBuildSteps(timed);

  // --- Step 3: 実効 X/Y スペーシングを算出 ---
  const { effectiveSpacing, yStackSpacing, nTimedCols } = timelineComputeSpacing(
    uniqueTimes.length, untimed.length, spacing, nodeSize, userConstants,
  );

  // --- Step 4: timed ノードを配置 (X = 時間カラム, Y = スタック) ---
  timelinePlaceTimedNodes(sortedTimed, timeIndexMap, effectiveSpacing, yStackSpacing, nodeSpacingMap, offsets, detectedChains);

  // --- Step 5: untimed ノードをコンパクトグリッドに配置 ---
  timelinePlaceUntimedNodes(untimed, nTimedCols, effectiveSpacing, yStackSpacing, offsets);

  // --- Step 6: 両軸を中央揃え ---
  const { xCenter, yCenter } = timelineCenterOffsets(offsets);

  // --- Step 7: 期間バーを算出 ---
  const bars = timelineComputeBars(
    sortedTimed, allNumeric, uniqueTimes, timeIndexMap,
    effectiveSpacing, xCenter, nodeSize, getNodeProperty,
    cfg.timelineEndKey, offsets,
  );

  // --- Step 8: 重複バーのレーン割り当て ---
  timelineAssignBarLanes(bars, offsets, nodeSize, userConstants, n, cfg);

  // --- Step 9: 同一カラム内の非バーノードを離間 ---
  timelineEnforceColumnGaps(sortedTimed, bars, timeIndexMap, offsets, nodeSize, userConstants, yStackSpacing);

  // --- Step 9b: 階層ノードを親の直下に再配置 (バーレーン割当後に実行) ---
  if (hierParentMap && hierChildrenMap && hierParentMap.size > 0) {
    timelineAlignHierarchy(hierParentMap, hierChildrenMap, offsets, yStackSpacing);
  }

  // --- Step 10: レーン割り当て後に Y 軸を再中央揃え ---
  timelineRecenterY(offsets, bars);

  // --- タイムラインガイド構築 (軸 + 目盛り) ---
  const ticks: { x: number; label: string }[] = [];
  for (const tv of uniqueTimes) {
    if (tv.startsWith("__")) continue;
    const idx = timeIndexMap.get(tv)!;
    ticks.push({ x: idx * effectiveSpacing - xCenter, label: tv });
  }
  const guide: TimelineGuide = {
    type: ARRANGEMENT_TIMELINE,
    axisY: -yCenter,
    ticks,
  };

  // --- シンセティックシーケンスエッジ生成 ---
  const seqEdges = timelineBuildSequenceEdges(sortedTimed);

  return {
    offsets,
    guide,
    bars: bars.length > 0 ? bars : undefined,
    sequenceEdges: seqEdges.length > 0 ? seqEdges : undefined,
    nodeChains: detectedChains,
  };
}

// ---------------------------------------------------------------------------
// timelineOffsets ヘルパー — ファイルプライベートサブ関数
// ---------------------------------------------------------------------------

/** メンバーを timed/untimed に分割し、リンクベース順序を untimed ノードに適用する */
export function timelinePartitionNodes(
  members: GraphNode[],
  cfg: ClusterForceConfig,
): { timed: { node: GraphNode; value: string }[]; untimed: GraphNode[]; detectedChains?: string[][]; hierParentMap?: Map<string, string>; hierChildrenMap?: Map<string, string[]> } {
  const getNodeProperty = cfg.getNodeProperty;
  const timelineOrderFields = cfg.timelineOrderFields;

  const resolvedKey = resolveTimeKey(members, cfg.timelineKey || "date", getNodeProperty);

  const timed: { node: GraphNode; value: string }[] = [];
  let untimed: GraphNode[] = [];
  for (const nd of members) {
    const val = resolvedKey ? getNodeProperty?.(nd.id, resolvedKey) : undefined;
    if (val !== undefined && val !== "") {
      timed.push({ node: nd, value: String(val) });
    } else {
      untimed.push(nd);
    }
  }

  const fwdSeqFields = cfg.sequenceFields ?? [];
  const revSeqFields = cfg.reverseSequenceFields ?? [];
  const hasSequenceFields = fwdSeqFields.length > 0 || revSeqFields.length > 0;

  const orderFieldStr = timelineOrderFields || "";
  const orderFields = orderFieldStr.split(",").map(f => f.trim()).filter(Boolean);
  const hasParentId = orderFields.includes("parent_id");

  let detectedChains: string[][] | undefined;
  let hierParentMap: Map<string, string> | undefined;
  let hierChildrenMap: Map<string, string[]> | undefined;

  if (untimed.length > 0 && getNodeProperty) {
    if (hasSequenceFields) {
      const { order: chainOrder, chains } = buildLinkChainOrder(untimed, getNodeProperty, fwdSeqFields, revSeqFields);
      if (chainOrder.size > 0) {
        if (chains.length > 0) detectedChains = chains;
        const chainOrdered: GraphNode[] = [];
        const remaining: GraphNode[] = [];
        for (const nd of untimed) {
          if (chainOrder.has(nd.id)) chainOrdered.push(nd);
          else remaining.push(nd);
        }
        chainOrdered.sort((a, b) => (chainOrder.get(a.id) ?? 0) - (chainOrder.get(b.id) ?? 0));
        const startIdx = timed.length > 0 ? timed.length : 0;
        for (let i = 0; i < chainOrdered.length; i++) {
          timed.push({ node: chainOrdered[i], value: `__chain_${String(startIdx + i).padStart(6, "0")}` });
        }
        untimed = remaining;
      }
    }

    if (untimed.length > 0 && hasParentId) {
      const hierOrder = buildHierarchyOrder(untimed, getNodeProperty);
      if (hierOrder.size > 0) {
        hierParentMap = hierOrder.parentMap;
        hierChildrenMap = hierOrder.childrenMap;
        const hierOrdered: GraphNode[] = [];
        const remaining: GraphNode[] = [];
        for (const nd of untimed) {
          if (hierOrder.has(nd.id)) hierOrdered.push(nd);
          else remaining.push(nd);
        }
        hierOrdered.sort((a, b) => (hierOrder.get(a.id) ?? 0) - (hierOrder.get(b.id) ?? 0));
        const startIdx = timed.length > 0 ? timed.length : 0;
        for (let i = 0; i < hierOrdered.length; i++) {
          timed.push({ node: hierOrdered[i], value: `__hier_${String(startIdx + i).padStart(6, "0")}` });
        }
        untimed = remaining;
      }
    }
  }

  return { timed, untimed, detectedChains, hierParentMap, hierChildrenMap };
}

/** timed エントリをソート (数値 vs 辞書順) し、ユニークタイムステップインデックスを構築 */
function timelineSortAndBuildSteps(
  timed: { node: GraphNode; value: string }[],
): {
  sortedTimed: { node: GraphNode; value: string }[];
  uniqueTimes: string[];
  timeIndexMap: Map<string, number>;
  allNumeric: boolean;
} {
  const realTimed = timed.filter(t => !t.value.startsWith("__chain_") && !t.value.startsWith("__hier_"));
  const allNumeric = realTimed.length > 0 && realTimed.every(t => !isNaN(Number(t.value)));
  const syntheticSet = new Set(timed.filter(t => t.value.startsWith("__")).map(t => t.node.id));
  const realTimedArr = timed.filter(t => !syntheticSet.has(t.node.id));
  const syntheticArr = timed.filter(t => syntheticSet.has(t.node.id));
  if (allNumeric) {
    realTimedArr.sort((a, b) => Number(a.value) - Number(b.value));
  } else {
    realTimedArr.sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
  }
  const sortedTimed = [...realTimedArr, ...syntheticArr];

  const uniqueTimes = [...new Set(sortedTimed.map(t => t.value))];
  const timeIndexMap = new Map<string, number>();
  uniqueTimes.forEach((t, i) => timeIndexMap.set(t, i));

  return { sortedTimed, uniqueTimes, timeIndexMap, allNumeric };
}

/** 実効 X スペーシング (自動圧縮付き) と Y スタックスペーシングを算出 */
function timelineComputeSpacing(
  nTimedCols: number,
  untimedCount: number,
  spacing: number,
  nodeSize: number,
  userConstants?: Record<string, number>,
): { effectiveSpacing: number; yStackSpacing: number; nTimedCols: number } {
  const untimedGridCols = untimedCount > 0 ? Math.ceil(Math.sqrt(untimedCount)) : 0;
  const totalCols = nTimedCols + untimedGridCols;
  const maxCols = 40;
  const minSpacing = totalCols > 200
    ? nodeSize * 1.2
    : totalCols > 100
      ? nodeSize * 1.8
      : nodeSize * 3;
  const effectiveSpacing = totalCols > maxCols
    ? Math.max(minSpacing, spacing * maxCols / totalCols)
    : spacing;

  const barH = nodeSize * 2;
  const barGap = nodeSize * (userConstants?._barGapFactor ?? 1.5);
  const minYStack = barH + barGap;
  const yStackSpacing = Math.max(effectiveSpacing * (userConstants?._yStackFactor ?? 0.6), minYStack);

  return { effectiveSpacing, yStackSpacing, nTimedCols };
}

/** timed ノードを配置: X = 時間カラムインデックス, Y = カラム内の垂直スタック。
 *  チェーンノードは同一チェーン内で同じ Y 行に横並びで配置される。 */
function timelinePlaceTimedNodes(
  sortedTimed: { node: GraphNode; value: string }[],
  timeIndexMap: Map<string, number>,
  effectiveSpacing: number,
  yStackSpacing: number,
  nodeSpacingMap: Map<string, number> | undefined,
  offsets: Map<string, { dx: number; dy: number }>,
  detectedChains?: string[][],
): void {
  // Build chain membership lookup: nodeId → chainIndex
  const nodeChainIndex = new Map<string, number>();
  if (detectedChains) {
    for (let ci = 0; ci < detectedChains.length; ci++) {
      for (const nodeId of detectedChains[ci]) {
        nodeChainIndex.set(nodeId, ci);
      }
    }
  }

  // Count how many non-chain timed nodes exist (to determine Y row offset for chains)
  // Strategy: non-chain nodes use column-stack as before.
  // Chain nodes: each chain gets a dedicated Y row below the non-chain nodes.
  const columnStack = new Map<number, number>();

  // First pass: place non-chain timed nodes
  for (const { node, value } of sortedTimed) {
    if (nodeChainIndex.has(node.id)) continue; // skip chain nodes
    const ti = timeIndexMap.get(value)!;
    const stackIdx = columnStack.get(ti) ?? 0;
    columnStack.set(ti, stackIdx + 1);
    const ns = getSpacing(node.id, nodeSpacingMap);
    offsets.set(node.id, {
      dx: ti * effectiveSpacing,
      dy: stackIdx * yStackSpacing * ns,
    });
  }

  // Determine the max stack depth used by non-chain nodes to place chains below
  let maxNonChainStack = 0;
  for (const count of columnStack.values()) {
    if (count > maxNonChainStack) maxNonChainStack = count;
  }

  // Second pass: place chain nodes — each chain gets its own Y row
  if (detectedChains && detectedChains.length > 0) {
    for (let ci = 0; ci < detectedChains.length; ci++) {
      const chain = detectedChains[ci];
      const chainRowY = (maxNonChainStack + ci) * yStackSpacing;
      for (const nodeId of chain) {
        // Find the entry in sortedTimed to get the timeIndex
        const entry = sortedTimed.find(e => e.node.id === nodeId);
        if (!entry) continue;
        const ti = timeIndexMap.get(entry.value)!;
        const ns = getSpacing(nodeId, nodeSpacingMap);
        offsets.set(nodeId, {
          dx: ti * effectiveSpacing,
          dy: chainRowY * ns,
        });
      }
    }
  }
}

/** 階層ノードを親の直下に再配置 (同X, 親Y + offset) */
function timelineAlignHierarchy(
  parentMap: Map<string, string>,
  childrenMap: Map<string, string[]>,
  offsets: Map<string, { dx: number; dy: number }>,
  yStackSpacing: number,
): void {
  // BFS from roots: place children directly below their parent
  const roots: string[] = [];
  for (const [childId, parentId] of parentMap) {
    if (!parentMap.has(parentId)) roots.push(parentId);
  }
  // Deduplicate roots
  const rootSet = new Set(roots);

  const visited = new Set<string>();
  const queue = [...rootSet];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);
    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) continue;
    const parentOff = offsets.get(parentId);
    if (!parentOff) continue;
    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      offsets.set(childId, {
        dx: parentOff.dx,
        dy: parentOff.dy + (i + 1) * yStackSpacing,
      });
      queue.push(childId);
    }
  }
}

/** untimed ノードを timed カラムの後にコンパクトグリッドで配置 */
function timelinePlaceUntimedNodes(
  untimed: GraphNode[],
  nTimedCols: number,
  effectiveSpacing: number,
  yStackSpacing: number,
  offsets: Map<string, { dx: number; dy: number }>,
): void {
  if (untimed.length === 0) return;
  untimed.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
  const gridCols = Math.max(1, Math.ceil(Math.sqrt(untimed.length)));
  const startX = nTimedCols * effectiveSpacing + effectiveSpacing * 2;
  for (let i = 0; i < untimed.length; i++) {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    offsets.set(untimed[i].id, {
      dx: startX + col * effectiveSpacing,
      dy: row * yStackSpacing,
    });
  }
}

/** 全オフセットを両軸の中間点で中央揃え。中央値を返す */
function timelineCenterOffsets(
  offsets: Map<string, { dx: number; dy: number }>,
): { xCenter: number; yCenter: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { dx, dy } of offsets.values()) {
    if (dx < minX) minX = dx;
    if (dx > maxX) maxX = dx;
    if (dy < minY) minY = dy;
    if (dy > maxY) maxY = dy;
  }
  const xCenter = (minX + maxX) / 2;
  const yCenter = (minY + maxY) / 2;
  for (const [id, pos] of offsets) {
    offsets.set(id, { dx: pos.dx - xCenter, dy: pos.dy - yCenter });
  }
  return { xCenter, yCenter };
}

/** start + end dates を持つ timed ノードの期間バーを算出 */
function timelineComputeBars(
  sortedTimed: { node: GraphNode; value: string }[],
  allNumeric: boolean,
  uniqueTimes: string[],
  timeIndexMap: Map<string, number>,
  effectiveSpacing: number,
  xCenter: number,
  nodeSize: number,
  getNodeProperty: ((id: string, key: string) => string | undefined) | undefined,
  timelineEndKey: string | undefined,
  offsets: Map<string, { dx: number; dy: number }>,
): TimelineBarInfo[] {
  const bars: TimelineBarInfo[] = [];
  const resolvedEndKey = timelineEndKey || "end-date";
  if (!getNodeProperty) return bars;

  for (const { node, value } of sortedTimed) {
    if (value.startsWith("__")) continue;
    const endVal = getNodeProperty(node.id, resolvedEndKey);
    if (!endVal || endVal === "") continue;
    const endTimeIdx = timeIndexMap.get(endVal);
    const startOff = offsets.get(node.id);
    if (!startOff) continue;
    const xStart = startOff.dx;
    let xEnd: number;
    if (endTimeIdx !== undefined) {
      xEnd = endTimeIdx * effectiveSpacing - xCenter;
    } else {
      if (allNumeric && !isNaN(Number(endVal))) {
        const endNum = Number(endVal);
        let bestIdx = uniqueTimes.length - 1;
        for (let i = 0; i < uniqueTimes.length; i++) {
          if (Number(uniqueTimes[i]) >= endNum) { bestIdx = i; break; }
        }
        xEnd = bestIdx * effectiveSpacing - xCenter;
      } else {
        let bestIdx = uniqueTimes.length - 1;
        for (let i = 0; i < uniqueTimes.length; i++) {
          if (uniqueTimes[i] >= endVal) { bestIdx = i; break; }
        }
        xEnd = bestIdx * effectiveSpacing - xCenter;
      }
    }
    if (xEnd > xStart) {
      bars.push({
        nodeId: node.id,
        xStart,
        xEnd,
        barHeight: nodeSize * 2,
        yCenter: startOff.dy,
      });
    }
  }
  return bars;
}

/** バーを非重複 Y レーンに割り当て、必要に応じてコンパクトスケーリングを適用 */
function timelineAssignBarLanes(
  bars: TimelineBarInfo[],
  offsets: Map<string, { dx: number; dy: number }>,
  nodeSize: number,
  userConstants: Record<string, number> | undefined,
  memberCount: number,
  cfg: ClusterForceConfig,
): void {
  if (bars.length <= 1) return;

  const barH = nodeSize * 2;
  const laneH = barH + (userConstants?._laneGap ?? 2);
  const maxLanes = 200;

  bars.sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);

  const laneEnds: number[] = [];

  for (const bar of bars) {
    let assigned = -1;
    for (let l = 0; l < Math.min(laneEnds.length, maxLanes); l++) {
      if (bar.xStart >= laneEnds[l]) {
        assigned = l;
        break;
      }
    }
    if (assigned < 0 && laneEnds.length < maxLanes) {
      assigned = laneEnds.length;
      laneEnds.push(-Infinity);
    }
    if (assigned < 0) {
      let minEnd = Infinity, minL = 0;
      for (let l = 0; l < laneEnds.length; l++) {
        if (laneEnds[l] < minEnd) { minEnd = laneEnds[l]; minL = l; }
      }
      assigned = minL;
    }
    laneEnds[assigned] = bar.xEnd;

    const laneY = assigned * laneH;
    bar.yCenter = laneY;
    const off = offsets.get(bar.nodeId);
    if (off) offsets.set(bar.nodeId, { dx: off.dx, dy: laneY });
  }

  // トータルレーン高がターゲットを超えた場合のコンパクトスケーリング
  const totalLaneH = laneEnds.length * laneH;
  const timelineMinH = cfg.userConstants?._timelineMinH ?? 600;
  const timelineHPerNode = cfg.userConstants?._timelineHPerNode ?? 0.8;
  const targetH = Math.max(timelineMinH, memberCount * timelineHPerNode);
  if (totalLaneH > targetH) {
    const scale = targetH / totalLaneH;
    for (const bar of bars) {
      bar.yCenter *= scale;
      bar.barHeight *= scale;
      const off = offsets.get(bar.nodeId);
      if (off) offsets.set(bar.nodeId, { dx: off.dx, dy: bar.yCenter });
    }
  }
}

/** 同一タイムカラムの非バーノードを最小ギャップを強制して離間 */
function timelineEnforceColumnGaps(
  sortedTimed: { node: GraphNode; value: string }[],
  bars: TimelineBarInfo[],
  timeIndexMap: Map<string, number>,
  offsets: Map<string, { dx: number; dy: number }>,
  nodeSize: number,
  userConstants: Record<string, number> | undefined,
  yStackSpacing: number,
): void {
  const minNodeGap = Math.max(nodeSize * (userConstants?._barGapFactor ?? 1.5), yStackSpacing);
  const barNodeIds = new Set(bars.map(b => b.nodeId));
  const byColumn = new Map<number, string[]>();
  for (const { node, value } of sortedTimed) {
    if (barNodeIds.has(node.id)) continue;
    const ti = timeIndexMap.get(value);
    if (ti === undefined) continue;
    let col = byColumn.get(ti);
    if (!col) { col = []; byColumn.set(ti, col); }
    col.push(node.id);
  }
  for (const ids of byColumn.values()) {
    if (ids.length < 2) continue;
    const items = ids.map(id => ({ id, off: offsets.get(id)! })).filter(x => x.off);
    items.sort((a, b) => a.off.dy - b.off.dy);
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1], cur = items[i];
      const gap = cur.off.dy - prev.off.dy;
      if (gap < minNodeGap) {
        const newDy = prev.off.dy + minNodeGap;
        offsets.set(cur.id, { dx: cur.off.dx, dy: newDy });
        cur.off = { dx: cur.off.dx, dy: newDy };
      }
    }
  }
}

/** レーン割り当て後に Y 軸オフセットとバー位置を再中央揃え */
function timelineRecenterY(
  offsets: Map<string, { dx: number; dy: number }>,
  bars: TimelineBarInfo[],
): void {
  let minY2 = Infinity, maxY2 = -Infinity;
  for (const { dy } of offsets.values()) {
    if (dy < minY2) minY2 = dy;
    if (dy > maxY2) maxY2 = dy;
  }
  const yAdj = (minY2 + maxY2) / 2;
  if (Math.abs(yAdj) > 0.1) {
    for (const [id, pos] of offsets) {
      offsets.set(id, { dx: pos.dx, dy: pos.dy - yAdj });
    }
    for (const bar of bars) {
      bar.yCenter -= yAdj;
    }
  }
}

/** 時間的に隣接するノード間のシンセティックシーケンスエッジを生成 */
function timelineBuildSequenceEdges(
  sortedTimed: { node: GraphNode; value: string }[],
): GraphEdge[] {
  const seqEdges: GraphEdge[] = [];
  if (sortedTimed.length < 2) return seqEdges;

  for (let i = 1; i < sortedTimed.length; i++) {
    const prev = sortedTimed[i - 1];
    const cur = sortedTimed[i];
    const prevSynth = prev.value.startsWith("__");
    const curSynth = cur.value.startsWith("__");
    if (prevSynth !== curSynth) continue;
    if (prevSynth && curSynth) {
      const prevParts = prev.value.split("_");
      const curParts = cur.value.split("_");
      if (prevParts.length > 2 && curParts.length > 2 && prevParts[2] !== curParts[2]) continue;
    }
    seqEdges.push({
      id: `__seq__${prev.node.id}__${cur.node.id}`,
      source: prev.node.id,
      target: cur.node.id,
      type: EDGE_TYPE_SEQUENCE,
    });
  }
  return seqEdges;
}

// ---------------------------------------------------------------------------
// Feature A ヘルパー: リンクチェーン順序と階層順序
// ---------------------------------------------------------------------------

/**
 * シーケンスリンクチェーンから順序を構築。
 * オントロジー設定の forward フィールド (例: "next") と reverse フィールド (例: "prev") を読み取る。
 * フィールド名はハードコードされず、settings.ontology.sequenceFields / reverseSequenceFields から取得。
 * フラットな順序マップ (X 軸配置用) と個別チェーン配列 (ルートライン生成用) の両方を返す。
 */
export function buildLinkChainOrder(
  members: GraphNode[],
  getNodeProperty: (id: string, key: string) => string | undefined,
  fwdFields: string[] = [],
  revFields: string[] = [],
): { order: Map<string, number>; chains: string[][] } {
  const order = new Map<string, number>();
  const chains: string[][] = [];
  const idSet = new Set(members.map(n => n.id));

  // Forward リンク構築: id → next id
  const nextMap = new Map<string, string>();
  const hasIncoming = new Set<string>();

  for (const nd of members) {
    // Forward シーケンスフィールド (例: "next") — nd が次のノードを指す
    for (const field of fwdFields) {
      const val = getNodeProperty(nd.id, field);
      if (val) {
        const target = extractWikilink(val);
        if (target && idSet.has(target)) {
          nextMap.set(nd.id, target);
          hasIncoming.add(target);
          break; // 最初のマッチが優先
        }
      }
    }
    // Reverse シーケンスフィールド (例: "prev") — nd が前のノードを指す
    for (const field of revFields) {
      const val = getNodeProperty(nd.id, field);
      if (val) {
        const target = extractWikilink(val);
        if (target && idSet.has(target)) {
          hasIncoming.add(nd.id); // nd は target からの incoming を持つ
          if (!nextMap.has(target)) {
            nextMap.set(target, nd.id);
          }
          break; // 最初のマッチが優先
        }
      }
    }
  }

  if (nextMap.size === 0) return { order, chains };

  // チェーンヘッドを検出 (outgoing next があるが incoming がないノード)
  const heads: string[] = [];
  for (const id of nextMap.keys()) {
    if (!hasIncoming.has(id)) heads.push(id);
  }
  // 明確なヘッドが見つからない場合、next リンクを持つ任意のノードを使用
  if (heads.length === 0 && nextMap.size > 0) {
    heads.push(nextMap.keys().next().value!);
  }

  // 各チェーンをウォーク — フラット順序とチェーン配列の両方を追跡
  let globalIdx = 0;
  const visited = new Set<string>();
  for (const head of heads) {
    const chain: string[] = [];
    let cur: string | undefined = head;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      order.set(cur, globalIdx++);
      chain.push(cur);
      cur = nextMap.get(cur);
    }
    if (chain.length >= 2) chains.push(chain);
  }

  return { order, chains };
}

/**
 * parent_id + story_order 階層から順序を構築。
 * ツリーを構築し、story_order 順で DFS トラバースを行う。
 */
export function buildHierarchyOrder(
  members: GraphNode[],
  getNodeProperty: (id: string, key: string) => string | undefined,
): Map<string, number> & { parentMap?: Map<string, string>; childrenMap?: Map<string, string[]> } {
  const order = new Map<string, number>() as Map<string, number> & { parentMap?: Map<string, string>; childrenMap?: Map<string, string[]> };
  const idSet = new Set(members.map(n => n.id));

  // 親→子マップを構築
  const children = new Map<string, { id: string; storyOrder: number }[]>();
  const hasParent = new Set<string>();

  for (const nd of members) {
    const parentVal = getNodeProperty(nd.id, "parent_id");
    if (parentVal) {
      const parentId = extractWikilink(parentVal) || parentVal;
      if (idSet.has(parentId)) {
        hasParent.add(nd.id);
        if (!children.has(parentId)) children.set(parentId, []);
        const so = Number(getNodeProperty(nd.id, "story_order") ?? "0") || 0;
        children.get(parentId)!.push({ id: nd.id, storyOrder: so });
      }
    }
  }

  if (children.size === 0) return order;

  // parentMap (child→parent) と childrenMap (parent→children) を構築して返す
  const parentMap = new Map<string, string>();
  for (const nd of members) {
    const parentVal = getNodeProperty(nd.id, "parent_id");
    if (parentVal) {
      const parentId = extractWikilink(parentVal) || parentVal;
      if (idSet.has(parentId)) {
        parentMap.set(nd.id, parentId);
      }
    }
  }

  // story_order で子をソート
  for (const ch of children.values()) {
    ch.sort((a, b) => a.storyOrder - b.storyOrder);
  }

  // ルートを検出 (親だが自身は親を持たないノード)
  const roots: string[] = [];
  for (const id of children.keys()) {
    if (!hasParent.has(id)) roots.push(id);
  }
  // ルートが見つからない場合、最も子を持つノードを使用
  if (roots.length === 0) {
    let maxChildren = 0;
    let bestId = "";
    for (const [id, ch] of children) {
      if (ch.length > maxChildren) { maxChildren = ch.length; bestId = id; }
    }
    if (bestId) roots.push(bestId);
  }

  // DFS トラバース
  let idx = 0;
  const visited = new Set<string>();
  const dfs = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    order.set(id, idx++);
    const ch = children.get(id);
    if (ch) {
      for (const c of ch) dfs(c.id);
    }
  };
  for (const root of roots) dfs(root);

  // 親を持つが到達できなかった残りのノードを追加
  for (const nd of members) {
    if (!visited.has(nd.id) && hasParent.has(nd.id)) {
      order.set(nd.id, idx++);
    }
  }

  // childrenMap を id リストとして構築
  const childrenMapOut = new Map<string, string[]>();
  for (const [pid, ch] of children) {
    childrenMapOut.set(pid, ch.map(c => c.id));
  }
  order.parentMap = parentMap;
  order.childrenMap = childrenMapOut;

  return order;
}

/** [[wikilink]] または [[wikilink|alias]] 形式からファイルパスを抽出 */
function extractWikilink(val: string): string | null {
  const m = val.match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : null;
}

/** ユーザーキーを最初に試行。ノードの 30% 未満しか持たない場合はフォールバックキーをスキャン */
export function resolveTimeKey(
  members: GraphNode[],
  primaryKey: string,
  getNodeProperty?: (nodeId: string, key: string) => string | undefined,
): string | null {
  if (!getNodeProperty || members.length === 0) return null;

  // プライマリキーのカバレッジチェック
  const threshold = Math.max(1, Math.floor(members.length * 0.3));
  let count = 0;
  for (const nd of members) {
    const val = getNodeProperty(nd.id, primaryKey);
    if (val !== undefined && val !== "") count++;
    if (count >= threshold) return primaryKey;
  }
  if (count > 0) return primaryKey; // 少なくとも一部のノードが持つ

  // フォールバックキーを試行
  for (const fallbackKey of TIMELINE_FALLBACK_KEYS) {
    if (fallbackKey === primaryKey) continue;
    let fc = 0;
    for (const nd of members) {
      const val = getNodeProperty(nd.id, fallbackKey);
      if (val !== undefined && val !== "") fc++;
      if (fc >= threshold) return fallbackKey;
    }
    if (fc > 0) return fallbackKey;
  }

  return null; // 使用可能なキーなし → 全ノードが untimed (ラベル順で一行)
}
