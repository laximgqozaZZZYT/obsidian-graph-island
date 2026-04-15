---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: types.ts の dead export 9個から export キーワードを削除
---

## Description (subtask of 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask)

以下9シンボルの `export` キーワードのみ削除（const/function 宣言は残す）:
  - L134: `export const VIEW_MODES` → `const VIEW_MODES`
  - L143: `export const CLUSTER_ARRANGEMENTS` → `const CLUSTER_ARRANGEMENTS`
  - L145: `export function isClusterArrangement` → `function isClusterArrangement`
  - L151: `export const CLUSTER_GROUP_ARRANGEMENTS` → `const CLUSTER_GROUP_ARRANGEMENTS`
  - L310: `export const SORT_KEYS` → `const SORT_KEYS`
  - L312: `export const SORT_ORDERS` → `const SORT_ORDERS`
  - L314: `export function isSortKey` → `function isSortKey`
  - L609: `export const NODE_DISPLAY_MODES` → `const NODE_DISPLAY_MODES`
  - L649: `export const EDGE_CARDINALITY_MODES` → `const EDGE_CARDINALITY_MODES`
  
  注意: 各シンボルから派生する型エイリアス（ViewMode, ClusterArrangement 等）は
  外部で使用されているため export を維持する。定数/関数のみ export 解除。
  
  検証: `pnpm build && pnpm test && pnpm lint`

---

**補足**: このタスクは本来分解不要です。親タスクチェーンはrate limit (`You've hit your limit`) で7回再帰的に空の分解が行われただけで、元の作業は上記1タスクで完了します。パイプラインのrate limit時に再分解を抑制する仕組みの検討を推奨します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
