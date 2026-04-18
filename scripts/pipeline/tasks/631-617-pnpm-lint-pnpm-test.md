---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 617-593-594-585-done
depends: subtask-2
summary: pnpm lint と pnpm test で親タスクの成果を検証
---

## Description (subtask of 617-593-594-585-done)

Bash で以下を順次実行し、すべて緑であることを確認:
  1. `pnpm lint` — ESLint check が pass すること
  2. `pnpm test` — vitest が全件 pass すること (2570+ tests)
  いずれか失敗した場合、本タスクを done に遷移させず失敗として報告。
  カバレッジしきい値の低下も失敗扱い (vitest.config.ts の閾値は維持必須)。
  コード変更は一切行わない。失敗時は親タスク594のregressionとして報告のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
