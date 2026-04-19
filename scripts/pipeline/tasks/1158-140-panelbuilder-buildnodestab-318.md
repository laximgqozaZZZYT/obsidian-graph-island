---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 140-giant-functions
depends: none
summary: PanelBuilder._buildNodesTab (318行) をセクション単位に分割
---

## Description (subtask of 140-giant-functions)

src/views/PanelBuilder.ts:1624-1942 の `_buildNodesTab` (318 行) を、
  新規ファイル `src/views/panel-sections-nodes-tab.ts` に抽出した
  純粋関数に委譲させる。GOD OBJECT Policy により PanelBuilder.ts を
  肥大化させてはならないため、外部ファイルへ抽出すること。
  以下のセクションをそれぞれ純粋関数 (40 行以下) として export:
    - buildNodesFilterSection(tabEl, panel, ctx)
    - buildNodesDegreeSection(tabEl, panel, ctx)
    - buildNodesLabelSection(tabEl, panel, ctx)
    - buildNodesVisualSection(tabEl, panel, ctx)
  元の `_buildNodesTab` はこれら 4 関数を順に呼ぶだけに縮小 (<40 行)。
  tests/views/panel-sections-nodes-tab.test.ts に DOM 組立の smoke test を追加。
  `pnpm test` / `pnpm build` が通ることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
