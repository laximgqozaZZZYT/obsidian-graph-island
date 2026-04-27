## Description (subtask of 1380-dead-exports)

`tmp/dead-exports-report.md` の Category C のうち、views配下の panel/export/search 系シンボルを削除する。

  削除対象（completely unused 判定済み）:
  - src/views/SearchOrchestrator.ts: parseHopFilters, computeHopSet, filterBySearchExpr, countSearchMatches, expandLocalGraphNeighbors, capNodesByDegree, buildRichStatus, computePathfinderBFS, computeEntropyScores, computeCardHaloGeometry (10件)
  - src/views/ExportManager.ts: exportPng, exportFullGraph (2件)
  - src/views/export/ExportOrchestrator.ts: buildSvgExportArgs, buildPngExportArgs, buildPresetJson, safeExport (4件)
  - src/views/export-orchestrator.ts: orchestrateSvgExport (1件)
  - src/views/panel-sections-filter.ts: buildBookmarkSection, buildNodeDecorationSection, buildStructureAnalysisSection, buildDiscoverySection, buildInteractionSection, buildRenderThresholdsSection (6件)
  - src/views/panel-sections-filter-logic.ts: countActiveHoverHighlights (1件)
  - src/views/panel-sections-layout.ts: buildGraphSyncSection, buildPluginSettingsSection, buildCustomMappingsSection, buildTimelineControls, buildForceParameters, buildClusterGroupRules (6件)
  - src/views/panel-helpers.ts: setPanelValue, getPanelValue (2件)
  - src/views/PanelBuilder.ts: axisSourceToString, parseAxisSourceString の re-export 削除のみ（line 1719付近の export 文）。**PanelBuilder.ts の他のロジックは編集禁止（GOD OBJECT）。re-export 行の削除はファイル行数を減らす方向なので CLAUDE.md ratchet と整合。**

  手順:
  1. 各シンボルを Grep で参照ゼロを再確認
  2. シンボル削除（関連 helper のうち他で使われていないものも連鎖削除）
  3. PanelBuilder.ts から `parseAxisSourceString` `axisSourceToString` の re-export 行のみ削除
  4. `pnpm lint` `pnpm test` `pnpm build` PASS 確認
  5. `node scripts/list-dead-exports.mjs` で Category C が約30件以下になったことを記録

  注意: `panel-sections-*.ts` のセクションbuilderは **PanelBuilder本体から呼ばれていないか**を Grep で再確認すること（dynamic import や string-based dispatch がある場合は要注意）。参照が確認できたら削除せずスキップ。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
