---
priority: high
reported: 2026-04-17
status: decomposed
source: decomposed
parent: 483-475-god-object
depends: none
summary: pnpm test 実行と全テストパス確認
---

## Description (subtask of 483-475-god-object)

`pnpm test` を実行し、vitest 全テストがパスすることを確認する。
  失敗があれば失敗テスト名・エラーメッセージを記録し、subtask-2 の実装に
  起因するか調査する。カバレッジしきい値 (S28.6/B27.1/F25.4/L28.3) を
  下回っていないことも確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
