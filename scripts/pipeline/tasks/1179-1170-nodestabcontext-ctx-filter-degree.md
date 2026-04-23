---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1170-1164-buildnodestab-ctx-4-40
depends: none
summary: NodesTabContext 型定義 + ctx 組み立て + filter/degree セクションを関数呼び出しに置換
---

## Description (subtask of 1170-1164-buildnodestab-ctx-4-40)

1. `src/views/panel-sections/nodes-tab-context.ts` に `NodesTabContext` 型を定義（既存ファイルがあればそこに追加）: `{ panel: PanelBuilderPanel; handlers: { onXxx: (...) => void; ... }; t: (key) => string; settings: ... }`。必要なハンドラは `_buildNodesTab` の filter/degree セクション内で参照されている `this._onXxx` 系メソッドを列挙して型に含める。
  2. `PanelBuilder.ts` の `_buildNodesTab` 冒頭（1624行付近）で `ctx: NodesTabContext` を組み立てる。`handlers: { onFilterChange: this._onFilterChange.bind(this), ... }` のように bind する。
  3. 既存の filter セクション inline コード（約75行）を削除し、`buildNodesFilterSection(tabEl, panel, ctx)` 呼び出しに置換。
  4. 既存の degree セクション inline コード（約75行）を削除し、`buildNodesDegreeSection(tabEl, panel, ctx)` 呼び出しに置換。
  5. `pnpm build && pnpm test -- PanelBuilder` が通ることを確認。
  6. この時点で `_buildNodesTab` 本体は <40 行になっていなくてよい（label/visual がまだ inline のため）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
