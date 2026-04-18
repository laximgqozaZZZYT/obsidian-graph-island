---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: none
summary: pnpm lint を実行し ESLint エラーゼロを確認
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

Bash で `pnpm lint` を実行し、ESLint check が pass することを確認する。
  - 成功: exit code 0 かつ警告/エラーなし → サブタスク2へ進む
  - 失敗: ESLint エラー/警告が出た場合、本タスクを失敗扱いとし、
    親タスク 594 の regression として該当ファイル・ルールを報告。
  コード変更は一切行わない（fix コマンドも実行しない）。
  出力ログ全体を結果に含めること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
