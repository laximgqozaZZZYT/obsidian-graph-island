---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 678-664-639-626-subtask-issue-status-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 678-664-639-626-subtask-issue-status-done-git-mv)

`★ Insight ─────────────────────────────────────`
- このissueは本質的に1アトミックなgit操作（frontmatter書き換え + git mv + commit）であり、過度な分解は不要
- `git mv` はpending→doneの遷移履歴を保持するため、rename検出で差分が「1 file modified」として記録され、PR diff が最小化される
- `status: done` 書き換えと `git mv` を同一コミットにまとめることで、状態と場所の整合性が保たれる
`─────────────────────────────────────────────────`

タスクの粒度的に1サブタスクで十分に完了可能です。以下のように出力します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
