---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1175-1168-buildedgevisibilitycontrols-3
depends: subtask-1
summary: 全体テスト・カバレッジ・lint・format 回帰確認
---

## Description (subtask of 1175-1168-buildedgevisibilitycontrols-3)

subtask-1 で追加したテストに対し以下の回帰検証を順に実施:

  1. `pnpm test` 全体 PASS
  2. `pnpm test:coverage` でしきい値維持:
     - Statements ≥ 28.67%
     - Branches ≥ 27.19%
     - Functions ≥ 25.49%
     - Lines ≥ 28.35%
  3. `pnpm lint` PASS
  4. `pnpm format:check` PASS

  失敗時の対応:
  - テスト失敗 → subtask-1 のテストコードを修正 (querySelector セレクタ、mock 返り値、solo ボタン要素取得ロジック等)
  - カバレッジ低下 → 新規テストで `buildEdgeVisibilityControls` の未カバー分岐 (特に count=0 スキップ分岐、Solo クリックハンドラ) を確実に通るようアサーションを追加
  - lint/format 失敗 → `pnpm lint:fix` と `pnpm format` で自動修正

  制約:
  - `src/` 配下の実装コードは変更しない (テストが実装のバグを発見した場合のみ別 issue 化)
  - カバレッジしきい値 (`vitest.config.ts`) は絶対に下げない
  - 修正対象は `tests/views/panel-sections-edge-display.test.ts` のみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
