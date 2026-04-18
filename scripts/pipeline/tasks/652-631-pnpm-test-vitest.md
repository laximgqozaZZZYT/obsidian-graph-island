---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: subtask-1
summary: pnpm test を実行して vitest 結果とカバレッジしきい値を検証
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

Bash で `pnpm test` を実行する。
  - 終了コード0 → 2570+ tests pass + カバレッジしきい値維持 として記録
  - 非0 → 失敗テスト一覧 + カバレッジ数値 (S/B/F/L) を記録
  vitest.config.ts のしきい値 (S28.6/B27.1/F25.4/L28.3) は変更禁止。
  テストコード・プロダクションコードの変更も禁止。
  結果を本タスクのコメントに記録して done へ遷移。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
