---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 595-582-subtask
depends: none
summary: GraphViewContainer.ts 関連のユニットテストを実行
---

## Description (subtask of 595-582-subtask)

`pnpm test -- GraphViewContainer` で GraphViewContainer 関連のテストのみ実行。
  - 全 PASS であることを確認
  - FAIL がある場合: テスト名・エラーメッセージを報告
  次に `pnpm test:coverage -- GraphViewContainer` で該当ファイルのカバレッジ数値を記録し、CLAUDE.md のカバレッジラチェット (S28.6/B27.1/F25.4/L28.3) を下回っていないか検証する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
