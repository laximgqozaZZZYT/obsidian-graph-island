---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 723-712-639-626-subtask-issue-status-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 723-712-639-626-subtask-issue-status-done-git-mv)

`★ Insight ─────────────────────────────────────`
- この issue は単一の atomic 操作（frontmatter 編集 + git mv + commit）のため、過分解は避けて1タスクにまとめるのが適切
- `git mv` を edit 後に実行することで、rename + modify 検出になる（先に mv すると rename + modify が別々に扱われることがある）
- No-op 終了パス（done に既にある場合）を明示することで、冪等性を確保
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
