---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 582-570-graphviewcontainer-ts-verify-only
depends: none
summary: subtask
---

## Description (subtask of 582-570-graphviewcontainer-ts-verify-only)

`★ Insight ─────────────────────────────────────`
- verify-only タスクは並列化しやすい（共有状態なし、読み取り専用）
- 行数チェックは最も重要 — CLAUDE.md の God Object Policy 違反は即座にブロッカー
- `pnpm format:check` と `pnpm lint` は別ツールだが関連性が高く、1タスクに統合可
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
