## Description (subtask of 1672-dead-exports)

`tmp/dead-exports-report.md` Category C のうち、`src/constants.ts` 以外で件数が多い小規模ファイルを 1 セッションでまとめて削除する。
  
  対象シンボル (report 時点):
  - src/layouts/timeline-types.ts: TimelineNode / TimelineEdge / TimelineChain / CycleBackEdge / HierarchyTree / TimelineLane / TimelinePlacement (lines 15-78)
  - src/views/CableTrayRenderer.ts: HIGHLIGHT_CABLE_TRUNK_WIDTH / CABLE_FAN_CROWD_THRESHOLD / CABLE_FAN_CROWD_MIN_FRACTION / MAX_CONDUIT_WIDTH (lines 151-158), computeCablePath (line 302)
  - src/views/export-orchestrator.ts: orchestrateSvgExport (line 132)
  - src/views/export/ExportOrchestrator.ts: buildSvgExportArgs (line 104), buildPngExportArgs (line 143)
  - src/utils/color.ts: adjustBrightness (line 22)
  - src/utils/git-status-emit.ts: emitGitStatusShortResult (line 34)
  - src/utils/gvc-helpers.ts: heatmapColor / COMMUNITY_PALETTE / findMatchingGroupPreset / resolveNodeColor (lines 103-139)
  - src/utils/node-grouping.ts: groupNodesByTag (line 70), expandGroup (line 237)
  - src/views/animation-controller.ts: cancelAllHandles (line 66), fadeNodeAlphaCancellable (line 88)
  
  手順:
  1. 各シンボルを `grep -rn "<NAME>" src/ tests/` で再確認。tests/ 参照があるものは Category A 誤判定として削除しない (commit log にその旨記載)。
  2. シンボル削除に伴って未使用になった import 文も削除。
  3. `pnpm test` / `pnpm lint` / `pnpm build` 通過を確認。
  4. `node scripts/list-dead-exports.mjs` 再生成し、before/after の件数差をコミットメッセージに残す。
  
  GOD OBJECT 制約に該当するファイル (CableTrayRenderer.ts は god list 外) のみ対象。新規ファイル作成は不要。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
