---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1170-1164-buildnodestab-ctx-4-40
depends: subtask-1
summary: label/visual セクションを関数呼び出しに置換 + _buildNodesTab を <40 行に縮小
---

## Description (subtask of 1170-1164-buildnodestab-ctx-4-40)

1. `_buildNodesTab` 内の label セクション inline コード（約75行）を削除し、`buildNodesLabelSection(tabEl, panel, ctx)` 呼び出しに置換。
  2. visual セクション inline コード（約75行）を削除し、`buildNodesVisualSection(tabEl, panel, ctx)` 呼び出しに置換。必要なら ctx.handlers にハンドラを追加（型側も更新）。
  3. `_buildNodesTab` メソッド本体が <40 行になっていることを確認（`sed -n '開始行,終了行p' | wc -l`）。
  4. `pnpm build && pnpm test -- PanelBuilder` が通ることを確認。
  5. E2E 的な viewMode/filter 操作が panel 上で動作するか `tests/panel-sections/*.test.ts` で検証（該当テストがあれば実行）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
