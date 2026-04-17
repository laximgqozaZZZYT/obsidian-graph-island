---
priority: medium
reported: 2026-04-17
status: pending
source: decomposed
parent: 492-483-pnpm-build-800kb
depends: none
summary: subtask
---

## Description (subtask of 492-483-pnpm-build-800kb)

`★ Insight ─────────────────────────────────────`
- バンドルサイズ検証は単純な計測タスクだが、超過時の分岐で「削減」という別タスクが発生する。検証と削減を分けるのが定石。
- CLAUDE.md の 800KB 予算は現在 759KB。subtask-3 の追加コードで 41KB 以内に収まっているかが焦点。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
