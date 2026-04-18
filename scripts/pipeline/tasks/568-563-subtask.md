---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 563-560-graphviewcontainer-ts-verify
depends: none
summary: subtask
---

## Description (subtask of 563-560-graphviewcontainer-ts-verify)

`★ Insight ─────────────────────────────────────`
- 元issueの insight が明示しているとおり、verify-only タスクは副作用ゼロ・記録のみで完結するため、分解コストが pipeline オーバーヘッドを上回る。
- `wc -l` → 閾値判定 → 空コミット → `git log`/`git status` 確認は因果的に直列かつ claude -p 1セッションで完結する (max-turns 30 に余裕で収まる)。
- fail-fast 条件 (8612 超過時は commit しない) も単一タスク内で制御するほうが状態受け渡しが不要で安全。
`─────────────────────────────────────────────────`

このissueは単一の verify セッションで完結するため、1タスクに集約します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
