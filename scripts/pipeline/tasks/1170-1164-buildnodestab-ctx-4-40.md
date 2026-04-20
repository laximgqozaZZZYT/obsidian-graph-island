---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1164-1158-panelbuilder-buildnodestab-4
depends: subtask-1
summary: _buildNodesTab を ctx 組み立て + 4関数呼び出しの <40行 に縮小
---

## Description (subtask of 1164-1158-panelbuilder-buildnodestab-4)

PanelBuilder.ts:1624-1942 の _buildNodesTab 本体を以下の構造に置換:
  1. ctx: NodesTabContext = { panel, handlers: { onXxx: this._onXxx.bind(this), ... }, t, settings } を組み立て
  2. buildNodesFilterSection(tabEl, panel, ctx)
  3. buildNodesDegreeSection(tabEl, panel, ctx)
  4. buildNodesLabelSection(tabEl, panel, ctx)
  5. buildNodesVisualSection(tabEl, panel, ctx)
  元の inline コード (約300行) は完全削除。未使用になった private helper が PanelBuilder 内に残っていればそれも削除。
  メソッド本体は <40 行を厳守。
  ファイル総行数が Max Allowed (2216) 以下であることを wc -l で確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
