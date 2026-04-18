---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 737-721-issue-frontmatter-status-done
depends: none
summary: subtask
---

## Description (subtask of 737-721-issue-frontmatter-status-done)

`★ Insight ─────────────────────────────────────`
- このissueはread-only検証タスクで、親タスク702-691-edit-statusの編集結果を確認するだけなので、実装コードの追加は不要です
- 検証は「status行のカウント」と「保持フィールドの存在確認」の2系統に分かれるため、2タスクに分けるのが自然です
- どちらのサブタスクも `Read` + `Grep` のみで完結するため、max-turns 30 で余裕を持って処理できます
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
