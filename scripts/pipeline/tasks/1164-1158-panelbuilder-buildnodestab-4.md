---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1158-140-panelbuilder-buildnodestab-318
depends: subtask-2
summary: PanelBuilder._buildNodesTab を 4 関数へ委譲する形に縮小
---

## Description (subtask of 1158-140-panelbuilder-buildnodestab-318)

PanelBuilder.ts:1624-1942 の `_buildNodesTab` (318 行) を、
  subtask-1,2 で抽出した 4 関数を順に呼ぶだけの形に縮小 (<40 行)。
    - buildNodesFilterSection(tabEl, panel, ctx)
    - buildNodesDegreeSection(tabEl, panel, ctx)
    - buildNodesLabelSection(tabEl, panel, ctx)
    - buildNodesVisualSection(tabEl, panel, ctx)
  ctx オブジェクトは `_buildNodesTab` 内で組み立て、this bound な
  handler を wrap して渡す。元の inline code は全削除。
  `pnpm build` / `pnpm test` 通過を確認。PanelBuilder.ts の総行数が
  Max Allowed (2216) を超えないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
