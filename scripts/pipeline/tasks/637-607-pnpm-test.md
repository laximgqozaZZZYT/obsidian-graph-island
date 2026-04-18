---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 607-597-subtask
depends: none
summary: pnpm test を実行し結果をログ保存
---

## Description (subtask of 607-597-subtask)

`pnpm test --reporter=verbose` を実行し、標準出力/エラーを `logs/test-results-597-582.log` に保存する。
  同時に `pnpm test --reporter=json --outputFile=logs/test-results-597-582.json` を実行し機械可読な結果も取得。
  コード変更は行わない (verify-only)。ログファイル配置のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
