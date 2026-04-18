---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 717-691-status-done-edit
depends: none
summary: subtask
---

## Description (subtask of 717-691-status-done-edit)

`★ Insight ─────────────────────────────────────`
- この親タスクは「Edit1回 + 検証」という非常に狭いスコープなので、過剰分解は避けて 2–3 サブタスクに収めるのが適切
- frontmatter の一部フィールドだけを書き換える典型パターンでは、Read→Edit→Read の3段構成が冪等性の保証になる
- git 操作を兄弟タスクに委譲することで、Edit 失敗時のロールバック範囲が最小化される
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
