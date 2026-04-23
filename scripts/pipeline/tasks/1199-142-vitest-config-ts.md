---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 142-coverage-drop
depends: subtask-1, subtask-2, subtask-3, subtask-4
summary: カバレッジ閾値到達確認と vitest.config.ts ラチェット更新
---

## Description (subtask of 142-coverage-drop)

`pnpm test:coverage` を実行し、全閾値 (statements/branches/functions/lines) が現行ラチェット以上であることを確認する。
  実測値が閾値を大きく上回った場合 (+1% 以上)、`vitest.config.ts` のラチェット値を実測値付近 (切り捨て) に更新する。
  - ラチェット引き下げは絶対禁止 (CLAUDE.md 違反)
  - 引き上げのみ許可
  `pnpm lint` と `pnpm format:check` も通すこと。
  完了基準: `pnpm test:coverage` exit 0、閾値が現行以上。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
