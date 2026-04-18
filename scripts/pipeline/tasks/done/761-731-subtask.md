---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 731-717-read-git-status
depends: none
summary: subtask
---

## Description (subtask of 731-717-read-git-status)

`★ Insight ─────────────────────────────────────`
- このissueは「検証のみ」のタスクで、編集・コミットは兄弟タスクの責務。依存順に注意して再Read→差分確認→git status確認の3ステップに分ける
- `status: done` 以外のfrontmatter保全を確認するには、編集前後の差分を `git diff` で見るのが最も確実(Read比較より軽量)
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
