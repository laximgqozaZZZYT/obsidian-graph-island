---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: none
summary: pnpm lint を実行して ESLint check 結果を記録
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

Bash で `pnpm lint` を実行する。
  - 終了コード0 → pass として記録
  - 非0 → 失敗メッセージ全文を記録 (エラー箇所のファイル:行番号を含める)
  コード変更は一切禁止。autofix 実行も禁止 (`pnpm lint:fix` は呼ばない)。
  結果を本タスクのコメントに記録して done へ遷移 (lint失敗でも本subtaskはdone、失敗内容の記録が成果物)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
