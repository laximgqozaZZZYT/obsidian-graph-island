---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 135-e2e-smoke-fail
depends: subtask-1
summary: showOrphans filter ロジックまたはE2Eテストの修正
---

## Description (subtask of 135-e2e-smoke-fail)

subtask-1 の調査結果に基づき、以下のいずれかを実施:
  (A) ロジックバグの場合: src/utils/graph-filter.ts の filterOrphans() を修正。
      has-tagエッジを含む全エッジを使って孤立判定する既存仕様を維持しつつ、
      テスト期待値を満たす挙動にする。
  (B) テスト期待値が古い場合: e2e/smoke.spec.ts:149 の閾値/assertionを現在の
      正しい挙動に合わせて更新。ただし「reducesnodes」のセマンティクスは維持。
  どちらの場合も GOD OBJECT ファイル(GraphViewContainer.ts等)の行数は増やさない。
  必要なら新規ファイルに抽出する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
