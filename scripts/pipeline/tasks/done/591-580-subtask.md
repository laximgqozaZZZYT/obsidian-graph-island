---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 580-568-graphviewcontainer-ts-verify
depends: none
summary: subtask
---

## Description (subtask of 580-568-graphviewcontainer-ts-verify)

`★ Insight ─────────────────────────────────────`
- このタスクは「verify → commit」が fail-fast で密結合しているため、分割すると中間状態で commit される危険があります。1タスクに保つのが安全です。
- CLAUDE.md の "Ratchet down only" は単調減少不変条件で、現在値 (8597) を上限として使います。超過時に commit しないことで、ratchet が緩まないことを保証します。
`─────────────────────────────────────────────────`

元タスクは副作用ゼロの verify-only かつ fail-fast 条件付きなので、1タスクに保ちます (分割すると超過時に部分 commit が残るリスク)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
