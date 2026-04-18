---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: 652-631-pnpm-lint-eslint
summary: pnpm test を実行して vitest 結果とカバレッジしきい値を検証
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

Bash で `pnpm test` を実行する。
  - 終了コード0 → tests pass + カバレッジしきい値維持 として記録
  - 非0 → 失敗テスト一覧 + カバレッジ数値 (S/B/F/L) を記録
  カバレッジしきい値は `vitest.config.ts` の `coverage.thresholds` を単一真実源とし、
  下回らないことのみ確認する（本文に数値を書かない — ratchet up 時の二重管理を避けるため）。
  テストコード・プロダクションコード・`vitest.config.ts` の変更は禁止。
  結果を本タスクのコメントに記録して done へ遷移。

## Acceptance criteria
- [ ] `pnpm test` の exit code が 0
- [ ] vitest が `vitest.config.ts` の `coverage.thresholds` を満たし、しきい値違反エラーがない
- [ ] テストコード・プロダクションコード・`vitest.config.ts` に変更がない（`git diff --quiet` が 0）
