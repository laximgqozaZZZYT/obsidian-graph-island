---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 1158-140-panelbuilder-buildnodestab-318
depends: none
summary: panel-sections-nodes-tab.ts を作成し filter/degree セクション抽出
---

## Description (subtask of 1158-140-panelbuilder-buildnodestab-318)

新規ファイル `src/views/panel-sections-nodes-tab.ts` を作成。
  PanelBuilder.ts:1624-1942 の `_buildNodesTab` から以下 2 関数を
  純粋関数として export (各 40 行以下):
    - buildNodesFilterSection(tabEl, panel, ctx)
    - buildNodesDegreeSection(tabEl, panel, ctx)
  ctx 型は同ファイル内に `NodesTabContext` interface として定義
  (plugin 参照、state mutation callback、redraw trigger 等を含む)。
  PanelBuilder.ts 側はまだ書き換えない (既存 inline code はそのまま)。
  新規ファイル単体での型チェック通過を確認 (`pnpm build`)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
