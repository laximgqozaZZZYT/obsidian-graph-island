---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 928-911-639-626-subtask-issue-pending-done-git-m
depends: none
summary: subtask
---

## Description (subtask of 928-911-639-626-subtask-issue-pending-done-git-m)

元issueが既に1セッション完結粒度のため、単一SUBTASKとして出力します。

`★ Insight ─────────────────────────────────────`
- 原子的rename+frontmatter書換パターンは、`git mv`が pending削除+done追加をアトミックに記録できるため差分検証が容易
- Glob検索で0件時のdone側確認→no-op exit 0 は冪等性保証のイディオム(再実行耐性)
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
