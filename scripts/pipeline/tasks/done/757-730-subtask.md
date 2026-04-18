---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 730-717-status-done-edit
depends: none
summary: subtask
---

## Description (subtask of 730-717-status-done-edit)

`★ Insight ─────────────────────────────────────`
- このタスクは「Edit → Read 検証 → git status 検証」の 3 段構えで、それぞれ独立した検証ゲートとして成立します。分けることで失敗箇所を特定しやすくなる。
- git mv/add/commit を兄弟タスクに委譲する設計は、Edit 操作と Git 操作の責務分離 (SRP) に忠実。Edit が失敗しても Git 履歴が汚れない。
- `old_string` に周辺 frontmatter 行を含める方針は、Obsidian plugin 開発で頻用する「一意性確保」パターン (同一文字列が複数出現する risk への防御)。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
