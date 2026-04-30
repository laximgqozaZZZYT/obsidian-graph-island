## Description (subtask of 1438-dead-exports)

`tmp/dead-exports-report.md` Category C のうち以下を削除する:
  - `src/views/SearchOrchestrator.ts`: parseHopFilters, computeHopSet, filterBySearchExpr, countSearchMatches, expandLocalGraphNeighbors, capNodesByDegree, buildRichStatus, computePathfinderBFS, computeEntropyScores, computeCardHaloGeometry (10件)
  - `src/views/panel-sections-filter.ts`: buildBookmarkSection, buildNodeDecorationSection, buildStructureAnalysisSection, buildDiscoverySection, buildInteractionSection, buildRenderThresholdsSection (6件)
  - `src/views/panel-sections-layout.ts`: buildGraphSyncSection, buildPluginSettingsSection, buildCustomMappingsSection, buildTimelineControls, buildForceParameters, buildClusterGroupRules (6件)
  手順:
  1. 各シンボルについて `Grep -r` で参照確認 (テストファイルにのみ使われていればテストと一緒に削除、本体未使用ならテストも併せて削除)
  2. 関数本体を完全削除。関数内で呼んでいるヘルパが他で使われていない場合は連鎖的に削除
  3. `pnpm build` `pnpm lint` `pnpm test` `pnpm format:check` を通す
  4. CLAUDE.md の God Object Policy: `PanelBuilder.ts` の Max Allowed (1719) は本タスクでは触らない (削除のみで増やさない)
  5. コミットメッセージ例: `chore(views): remove unused SearchOrchestrator and panel-sections exports`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
