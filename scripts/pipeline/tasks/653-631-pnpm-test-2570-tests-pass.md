---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: subtask-1
summary: pnpm test を実行し 2570+ tests pass とカバレッジしきい値維持を確認
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

Bash で `pnpm test` を実行し、以下をすべて確認:
  1. vitest が全件 pass すること（2570+ tests, 102 test files 目安）
  2. vitest.config.ts のカバレッジしきい値（S/B/F/L）を下回らないこと
     - 現行: S28.6 / B27.1 / F25.4 / L28.3（MEMORY.md 記載値）
  3. テストファイル数・スキップ数の急変がないこと
  失敗時の扱い:
  - テスト失敗 → 親タスク 594 の regression として失敗テスト名を列挙
  - カバレッジ低下 → しきい値とメトリクス実値を併記して報告
  コード変更・しきい値緩和・vitest.config.ts の編集は禁止。
  CLAUDE.md「Relaxing coverage thresholds」禁止ルールに従う。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
