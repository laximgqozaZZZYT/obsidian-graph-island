## Description (subtask of 1561-dead-exports)

`tmp/dead-exports-report.md` Category C のうち、panel/label系の以下14個の未使用exportを削除する。
  PanelBuilder.ts の axisSource* は coord-panel.ts に同名のCategory A exportがあるため、PanelBuilder側の再exportのみ削除する想定。

  対象 (line番号 / シンボル):
  - panel-sections-filter.ts: 49 buildBookmarkSection, 206 buildNodeDecorationSection, 324 buildStructureAnalysisSection, 438 buildDiscoverySection, 522 buildInteractionSection, 872 buildRenderThresholdsSection
  - panel-sections-filter-logic.ts: 186 countActiveHoverHighlights
  - panel-sections-layout.ts: 89 buildGraphSyncSection, 141 buildPluginSettingsSection, 283 buildCustomMappingsSection, 557 buildTimelineControls, 776 buildForceParameters, 857 buildClusterGroupRules
  - panel-helpers.ts: 3 setPanelValue, 7 getPanelValue
  - PanelBuilder.ts: 1719 axisSourceToString, 1719 parseAxisSourceString (再export解除)
  - group-label-manager.ts: 630 parseGroupByFields
  - LabelManager.ts: 634 computePriorityScores, 763 selectLabelMode

  手順:
  1. 各シンボルを `grep -rn` で検索し、プロジェクト全域(src/, tests/)で参照ゼロを確認
  2. 参照ゼロなら関数定義またはexport宣言を削除（再exportのみの場合はexport行のみ削除）
  3. PanelBuilder.ts は GOD OBJECT (max 1719行) — exportキーワード削除/関数削除は **行数を減らす方向のみ** 許可
  4. ビルド/テスト確認: `pnpm test` / `pnpm lint` / `pnpm build`
  5. `node scripts/list-dead-exports.mjs` でCategory C件数が約14減少していることを確認

  注意: `buildXxxSection` 系は古いタブ実装の残骸の可能性が高いが、動的呼び出し(view-mode-mapなど)経由で使われていないかも確認すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
