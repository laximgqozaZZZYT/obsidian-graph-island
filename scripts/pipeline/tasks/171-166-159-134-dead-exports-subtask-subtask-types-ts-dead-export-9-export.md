---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 166-159-134-dead-exports-subtask-subtask
depends: none
summary: types.ts の dead export 9個を export 解除（配列定数・型ガード）
---

## Description (subtask of 166-159-134-dead-exports-subtask-subtask)

以下9シンボルの export キーワードを削除:
  - VIEW_MODES (L134), CLUSTER_ARRANGEMENTS (L143), isClusterArrangement (L145)
  - CLUSTER_GROUP_ARRANGEMENTS (L151), SORT_KEYS (L310), SORT_ORDERS (L312)
  - isSortKey (L314), NODE_DISPLAY_MODES (L609), EDGE_CARDINALITY_MODES (L649)
  各シンボルについて grep で未使用を確認してから export を外す。
  型派生元（typeof VIEW_MODES[number] 等）が同ファイル内で使われている場合は
  export のみ外して const/function 宣言は残す。
  pnpm build && pnpm test で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
