---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 723-712-639-626-subtask-issue-status-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 723-712-639-626-subtask-issue-status-done-git-mv)

`★ Insight ─────────────────────────────────────`
- このissueは「1ファイルのfrontmatter編集 + git mv + 単一コミット」という不可分な原子操作なので、分割するとコミット履歴が汚れて検証が難しくなる
- 自律パイプラインの max-turns 30 は十分な余裕があり、Glob→Read→Edit→git mv→commit→検証のシーケンスは1セッションで完結可能
- 分解すると「edit 済みのまま git mv する」という順序制約が壊れる可能性がある(rename検出を狙うため)
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
