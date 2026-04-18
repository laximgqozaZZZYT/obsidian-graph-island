---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 597-582-pnpm-test-pass
depends: none
summary: pnpm test を実行し生ログを保存
---

## Description (subtask of 597-582-pnpm-test-pass)

`pnpm test 2>&1 | tee reports/verify-582-pnpm-test.log` を実行し、vitest の全出力 (成功/失敗/coverage threshold 判定含む) をログに保存する。
  終了コード ($?) をログ末尾に `EXIT_CODE=N` として追記。
  コード・テスト・設定ファイルの変更は一切行わない。
  `vitest.config.ts` の coverage threshold を緩和しない (CLAUDE.md 禁止事項)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
