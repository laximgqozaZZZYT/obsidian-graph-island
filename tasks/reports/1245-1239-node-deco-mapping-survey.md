# NODE_DECO_* リテラル置換マッピング調査 (1245-1239)

調査対象: `src/views/node-decorations.ts` (521 lines)
親タスク: `1239-1235-node-decorations-ts-node-deco`
依存前提: subtask-1 (`1238-1235-constants-ts-node-deco-11`) は **未完了** (constants.ts に
`NODE_DECO_*` 定数も `// ---- Renderer decorations ----` セクションも未追加)

## スコープ
- 対象: バッジ/リング/ラベル/アイコン/ハロー描画パラメータのインライン数値リテラル
- **除外**: 既に命名済みの `PATHFINDER_*` / `COMPARE_RING_*` / `INDICATOR_*` 群 (lines 23-44)
- **除外**: ズーム/LOD/密度系 (`1 / ws`, `1 / zoom`, `lodLevel` 由来)
- **除外**: 色値 (0xRRGGBB) — 本タスク範囲外 (将来別タスクで NODE_DECO_*_COLOR として整理予定)

## 候補定数 (11件) → リテラル出現位置

| # | 候補定数名 | 値 | 出現行 | 周辺コード | 用途 | 置換可否 |
|---|---|---|---|---|---|---|
| 1 | `NODE_DECO_BADGE_MAX_COUNT` | `4` | 208 | `const MAX_BADGES = 4;` | renderTagBadges 上限 | OK (完全一致) |
| 2 | `NODE_DECO_BADGE_RADIUS_PX` | `3` | 209, 211 | `const minScreenPx = 3;` / `screenToWorld(minScreenPx, ws, 3)` の fallback `3` | tag badge 最小半径 (画面px) | OK (両出現とも完全一致, 同じ値) |
| 3 | `NODE_DECO_BADGE_PAD_FACTOR` | `0.7` | 212 | `const PAD = BADGE_R * 0.7;` | tag badge パディング (BADGE_R比) | OK (完全一致) |
| 4 | `NODE_DECO_RECENCY_DOT_RADIUS` | `3` | 303 | `const DOT_R = 3;` | recency 緑ドット半径 | OK (完全一致, ローカル名既存) |
| 5 | `NODE_DECO_RECENCY_OLD_DAYS` | `90` | 302 | `90 * 24 * 60 * 60 * 1000` | recency 古さ閾値 (日) | OK (定数化対象) |
| 6 | `NODE_DECO_BOOKMARK_STAR_RATIO` | `0.35` | 135 | `Math.max(4, pn.radius * 0.35)` | star outer radius / nodeR | OK (完全一致) |
| 7 | `NODE_DECO_BOOKMARK_INNER_RATIO` | `0.4` | 142 | `const innerR = sr * 0.4;` | star inner / outer ratio | OK (完全一致) |
| 8 | `NODE_DECO_BOOKMARK_SPIKES` | `5` | 140 | `const spikes = 5;` | bookmark star スパイク数 | OK (完全一致) |
| 9 | `NODE_DECO_MULTISELECT_RING_WIDTH` | `2.5` | 431 | `const RING_WIDTH = 2.5;` | multi-select ring 線幅 | OK (完全一致, ローカル名) |
| 10 | `NODE_DECO_MULTISELECT_PAD` | `5` | 432 | `const PAD = 5;` | multi-select ring パディング | OK (完全一致) |
| 11 | `NODE_DECO_HALO_BASE_ALPHA` | `0.15` | 413 | `g.beginFill(color, 0.15 + t * 0.2);` | entropy halo 基底 alpha | OK (完全一致) |

## 曖昧一致 (置換対象外としてマーク)

以下は値は一致するが意味的文脈が異なる/算術式の一部のため置換しない:

| 行 | 値 | コード断片 | 除外理由 |
|---|---|---|---|
| 132 | `0.9` | `const starAlpha = 0.9;` | bookmark star alpha 専用、汎用 NODE_DECO_*_ALPHA に統合する根拠が弱い (recency dot alpha=0.9 と独立) |
| 135 | `4` | `Math.max(4, pn.radius * 0.35)` | 半径下限のクランプ値 (px) で、独立した意味 |
| 136-137 | `0.7` | `pn.radius * 0.7` | bookmark 中心オフセット率。ID#3 と同値だが用途別 (badge pad ≠ bookmark offset) |
| 171 | `2` | `const lineWidth = 2;` | missing-neighbor ring 線幅 (renderMissingNeighborRings のローカル) |
| 172 | `10` | `const dashSegments = 10;` | dashed ring セグメント数 (用途特化) |
| 173 | `0.35` | `const gapFraction = 0.35;` | dashed gap 比率 (ID#6 と同値だが意味が完全に異なる: ring gap vs star ratio) |
| 174 | `4` | `const radiusPad = 4;` | missing-neighbor ring パディング |
| 274 | `2` | `const minRingPx = 2;` | importance ring 最小幅 (px) |
| 282 | `1 + t * MAX_RING_WIDTH` | — | アニメーション式の `1` (基準値) |
| 311, 326 | `0.7` | `pn.radius * 0.7` | recency offset (ID#3 と同値だが意味別) |
| 321 | `0.3` | `g.beginFill(0x000000, 0.3)` | recency 古ノード黒覆い alpha |
| 408 | `4` | `4 / ws` | entropy halo 最小ピクセル (ズーム連動: 除外規則) |
| 409 | `1 + t * 2` | — | halo 成長式の `1`/`2` (アニメーション係数) |
| 413 | `0.2` | `0.15 + t * 0.2` | halo alpha range (ID#11 と組で意味あるが、`0.15` が代表値) |
| 432 | `0.85` | `g.lineStyle(..., 0.85)` | multi-select alpha — ローカル名なし、用途特化 |
| 452 | `2.5` | `EDGE_WIDTH = 2.5` | hierarchy overlay 線幅 (ID#9 と同値だが overlay vs ring で文脈別) |
| 454 | `0.6` | `g.lineStyle(..., 0.6)` | hierarchy overlay alpha |
| 474 | `4`, `0.25` | `g.lineStyle(4, 0x6366f1, 0.25)` | ontology backbone 線幅/alpha |
| 495 | `6` | `const DASH_LEN = 6;` | gap edges dash 長 |
| 496 | `4` | `const GAP_LEN = 4;` | gap edges gap 長 (ID#1 と同値だが文脈別) |
| 511 | `1.5`, `0.45` | `g.lineStyle(1.5, GAP_COLOR, 0.45)` | gap edges 線幅/alpha |

## 置換候補総括

- **完全一致 + 意味的に同じ用途**: 11件 (上の表 #1–#11)
- **同値だが文脈別 = 置換対象外**: 13箇所 (例: `0.7` が badge pad / bookmark offset / recency offset の3用途で独立)
- **算術式内オフセット (例: `1 + t * 2`)**: 全件除外

## 注記 — subtask-1 (1238) 実装時の指針

constants.ts の `// ---- Renderer decorations ----` セクションに以下の順で追加すべき:

```ts
// ---- Renderer decorations (NODE_DECO_*) ----
/** Tag badge — maximum number of colored pills shown per node */
export const NODE_DECO_BADGE_MAX_COUNT = 4;
/** Tag badge — minimum on-screen radius (px) */
export const NODE_DECO_BADGE_RADIUS_PX = 3;
/** Tag badge — padding between node edge and badge (BADGE_R 比) */
export const NODE_DECO_BADGE_PAD_FACTOR = 0.7;
/** Recency marker — green dot world-radius */
export const NODE_DECO_RECENCY_DOT_RADIUS = 3;
/** Recency marker — old age threshold (days) */
export const NODE_DECO_RECENCY_OLD_DAYS = 90;
/** Bookmark star — outer radius factor (vs node radius) */
export const NODE_DECO_BOOKMARK_STAR_RATIO = 0.35;
/** Bookmark star — inner / outer radius ratio */
export const NODE_DECO_BOOKMARK_INNER_RATIO = 0.4;
/** Bookmark star — number of spike pairs */
export const NODE_DECO_BOOKMARK_SPIKES = 5;
/** Multi-select ring — line width */
export const NODE_DECO_MULTISELECT_RING_WIDTH = 2.5;
/** Multi-select ring — radius padding */
export const NODE_DECO_MULTISELECT_PAD = 5;
/** Entropy halo — base alpha (additive with t-scaled range) */
export const NODE_DECO_HALO_BASE_ALPHA = 0.15;
```

## 行数影響予測 (subtask-2 = 1239 本体置換時)

- node-decorations.ts 現在: 521 行
- import 1 行追加 (or 既存 import への merge → +0 行も可能)
- リテラル値→定数名の置換は同一行内 (純増 0)
- **合計**: 0〜+1 行 (CLAUDE.md ratchet 影響なし、God Object 対象外)

## 結論

11 件の置換候補を確定。subtask-1 (1238) が完了次第、subtask-2 (1239 本体) で
本マッピングに従った機械的置換を実行可能。本タスク (1245) ではコード変更なし。
