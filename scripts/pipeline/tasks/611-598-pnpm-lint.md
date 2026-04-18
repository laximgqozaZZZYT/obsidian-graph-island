---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 598-582-pnpm-lint-pnpm-format-check
depends: none
summary: pnpm lint 実行結果を記録
---

## Description (subtask of 598-582-pnpm-lint-pnpm-format-check)

`pnpm lint` を実行し、完全な stdout/stderr をキャプチャ。
  - エラー0件なら "PASS: 0 errors, 0 warnings" を記録
  - エラーがあればファイル名・ルール名・行番号・メッセージを列挙
  - 自動修正 (`lint:fix`) は実行しない
  - 実行コマンド・終了コード・所要時間も併記
  レポートは `memory/582-570-lint-report.md` に追記形式で保存。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
