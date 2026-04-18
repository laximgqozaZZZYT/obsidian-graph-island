---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: none
summary: subtask
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

検証専用タスク（コード変更なし）なので、lint と test+coverage の2段階に分解します。

`★ Insight ─────────────────────────────────────`
- 検証タスクは「失敗時の切り分け」を容易にするため、lint と test を別サブタスクにする方が原因特定が速い
- `pnpm test` は vitest.config.ts のカバレッジしきい値を自動チェックするため、しきい値低下も自然と失敗扱いになる
- CLAUDE.md の「Coverage ratchet — thresholds must never decrease」方針と一致
`─────────────────────────────────────────────────`

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
