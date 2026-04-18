---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 941-934-760-730-status-done-acceptance
depends: none
summary: subtask
---

## Description (subtask of 941-934-760-730-status-done-acceptance)

`★ Insight ─────────────────────────────────────`
- このissueは単一マークダウンファイル1個の編集のみで、ビルド/テスト不要なため本来1タスクで完結可能
- Edit ツールの replace_all は `- [ ]` が Description 本文にも存在する場合に誤変換リスクがあるため、Acceptance セクション限定の old_string 指定が安全
- frontmatter の `status: decomposed` が既に `done` になっている場合の no-op 処理も必要
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
