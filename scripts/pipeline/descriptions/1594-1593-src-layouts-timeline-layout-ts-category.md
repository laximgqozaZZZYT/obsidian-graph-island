## Description (subtask of 1593-dead-exports)

`tmp/dead-exports-report.md` Category B のうち src/layouts/timeline-layout.ts に属する14シンボルの `export` キーワードを除去してモジュール内 private 化する。対象シンボル(行は report 時点の参考値):
  - timelinePartitionNodes (211)
  - timelineSortAndBuildSteps (280)
  - timelineComputeSpacing (306)
  - timelinePlaceTimedNodes (329)
  - timelineAlignHierarchy (393)
  - timelinePlaceUntimedNodes (429)
  - timelineCenterOffsets (451)
  - timelineAssignBarLanes (537)
  - timelineEnforceColumnGaps (603)
  - timelineRecenterY (644)
  - timelineBuildSequenceEdges (663)
  - buildLinkChainOrder (754)
  - buildHierarchyOrder (820)
  - resolveTimeKey (889)
  手順: 1) 各シンボルの `export` 修飾子のみ削除(関数本体・シグネチャは変更しない)。 2) `tests/` 配下で各シンボル名を grep して参照が無いことを確認(あれば対象から除外して理由を残す)。 3) `pnpm build` と `pnpm test` を実行して通ることを確認。 4) `node scripts/list-dead-exports.mjs` を実行し timeline-layout.ts の Category B エントリが減ったことを確認。
  CLAUDE.md ルール: god object 対象外ファイルなので問題なし。`RenderThresholds` 等への影響なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
