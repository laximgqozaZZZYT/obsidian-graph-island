---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask)

全体で9つのdead exportを特定しました。以下がタスク分解です。

---

`★ Insight ─────────────────────────────────────`
`types.ts` のdead exportパターン: `const XXX = [...] as const` で定義した配列は、対応する `type XXX = (typeof XXX)[number]` の型だけが使われ、元の配列自体は未使用になりがち。型ガード関数 (`isClusterArrangement`, `isSortKey`) も同様に、PanelBuilder等でバリデーション無しに値を直接使うため不要になっている。
`─────────────────────────────────────────────────`

---

## Dead Exports一覧 (9件)

| # | Export | 種別 |
|---|--------|------|
| 1 | `EDGE_CARDINALITY_MODES` | const array |
| 2 | `NODE_DISPLAY_MODES` | const array |
| 3 | `CLUSTER_ARRANGEMENTS` | const array |
| 4 | `CLUSTER_GROUP_ARRANGEMENTS` | const array |
| 5 | `VIEW_MODES` | const array |
| 6 | `SORT_KEYS` | const array |
| 7 | `SORT_ORDERS` | const array |
| 8 | `isClusterArrangement` | function |
| 9 | `isSortKey` | function |

## タスク分解

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
