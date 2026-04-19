---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1158-140-panelbuilder-buildnodestab-318
depends: subtask-1
summary: label/visual セクション抽出を panel-sections-nodes-tab.ts に追加
---

## Description (subtask of 1158-140-panelbuilder-buildnodestab-318)

subtask-1 で作成した `src/views/panel-sections-nodes-tab.ts` に
  残り 2 関数を純粋関数として export (各 40 行以下):
    - buildNodesLabelSection(tabEl, panel, ctx)
    - buildNodesVisualSection(tabEl, panel, ctx)
  ラベル関連 (showLabels, labelSize, labelFadeMode 等) と
  ビジュアル関連 (nodeOpacity, nodeRadius 等) のロジックを
  PanelBuilder.ts:1624-1942 から移植。NodesTabContext に不足する
  フィールドがあれば追加。`pnpm build` で型チェック通過を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
