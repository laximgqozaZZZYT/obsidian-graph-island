---
priority: medium
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask)

9個すべてが外部から未使用であることを確認できました。これは単純な作業です — 各定数/関数のexportキーワードを外すだけ。ただし派生型（`ViewMode`, `ClusterArrangement`等）は外部使用されている可能性があるのでそのままにします。

`★ Insight ─────────────────────────────────────`
このタスクチェーンは**rate limitの無限再帰分解**の典型例です。元タスクがrate limitでdescriptionが空→パイプラインが再分解→また空→7回繰り返し。実際の作業は「types.tsの9箇所のexportキーワードを削除する」だけで、1タスクで十分完了できるサイズです。
`─────────────────────────────────────────────────`

このタスクは**分解不要**です。9個のexportキーワード削除は1セッションで余裕を持って完了できます。ただしルール上最低限のタスク形式で出力します：

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
