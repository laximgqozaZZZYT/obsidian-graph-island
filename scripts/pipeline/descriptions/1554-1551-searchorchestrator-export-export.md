## Description (subtask of 1551-dead-exports)

`tmp/dead-exports-report.md` Category C のうち以下を削除する。各シンボルが
  本当に未使用かを `grep -rn "<symbol>"` で確認してから削除する (テストファイルが
  参照していれば Category A 扱いで残す)。
  
  対象 (16個):
  - SearchOrchestrator.ts: parseHopFilters, computeHopSet, filterBySearchExpr,
    countSearchMatches, expandLocalGraphNeighbors, capNodesByDegree,
    buildRichStatus, computePathfinderBFS, computeEntropyScores,
    computeCardHaloGeometry
  - export-orchestrator.ts: orchestrateSvgExport
  - export/ExportOrchestrator.ts: buildSvgExportArgs, buildPngExportArgs,
    buildPresetJson, safeExport
  - ExportManager.ts: exportPng, exportFullGraph
  - snapshot/GraphSnapshot.ts: restoreState
  - SnapshotManager.ts: showSnapshotMenu, createAutoSnapshot
  
  手順:
  1. 各シンボルを参照検索 (テスト・src 両方) — テスト参照あれば残す
  2. 参照ゼロのものから順次削除
  3. 関連する型エイリアス・private ヘルパが孤立したら同時に削除
  4. `pnpm lint` / `pnpm test` / `pnpm build` 全通過
  5. GOD OBJECT には新規行追加しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
