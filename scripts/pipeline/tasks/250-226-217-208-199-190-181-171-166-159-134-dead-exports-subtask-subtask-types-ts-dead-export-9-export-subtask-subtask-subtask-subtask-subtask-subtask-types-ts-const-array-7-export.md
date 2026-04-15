---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: types.tsから未使用const array 7件のexportを除去
---

## Description (subtask of 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask)

以下の7つのconst arrayからexportキーワードを削除する（定義自体は残す。typeof演算で型が参照しているため）:
  - `EDGE_CARDINALITY_MODES` (line 649)
  - `NODE_DISPLAY_MODES` (line 609)
  - `CLUSTER_ARRANGEMENTS` (line 143)
  - `CLUSTER_GROUP_ARRANGEMENTS` (line 151)
  - `VIEW_MODES` (line 134)
  - `SORT_KEYS` (line 310)
  - `SORT_ORDERS` (line 312)
  変更: 各行の `export const` → `const` に変更。
  対応する型定義 (例: `export type ViewMode = (typeof VIEW_MODES)[number]`) はそのまま残す。
  pnpm build && pnpm test で既存テスト全パスを確認。

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
