---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 609-595-graphviewcontainer-ts
depends: subtask-1
summary: GraphViewContainerカバレッジをラチェット閾値と照合
---

## Description (subtask of 609-595-graphviewcontainer-ts)

`pnpm test:coverage -- GraphViewContainer` を実行し、S/B/F/L 4指標の数値を記録する。
  CLAUDE.md記載のラチェット閾値 S28.6/B27.1/F25.4/L28.3 と比較し、以下を判定:
  - 全指標が閾値以上 → PASS、数値をissueに記録
  - いずれかが下回る → FAIL、どの指標がどれだけ下回ったか報告
  注意: このカバレッジはプロジェクト全体の数値であり、単一ファイルのカバレッジではない。
  vitest.config.tsの`coverage.thresholds`設定を先にReadして閾値が一致することを確認してから実行する。
  閾値の引き下げは絶対に行わない（禁止パターン）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
