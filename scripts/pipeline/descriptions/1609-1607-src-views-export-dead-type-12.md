## Description (subtask of 1607-dead-exports)

以下の 12 個の type-only export について knip / ts-prune で参照状況を再確認し、subtask-1 と同じ方針(削除 or `export` 外し)で処理する。
  - src/views/export/ExportOrchestrator.ts L38-L202: SvgExportGraph, SvgExportSettings, SvgExportViewState, SvgExportArgs, PngExportCanvasLike, PngExportSettings, PngExportArgs, PresetMetadata, SafeExportResult (9個)
  - src/views/export-orchestrator.ts L32-L102: SvgExportOverrides, ResolvedSvgExportOptions, ExportCounts (3個)
  注意:
  - L32 の `exportGraphSVG` 関数 export は dead と検出されているが、tests からの import が tests/ 内にあるか grep で確認する。あれば残す。
  - 2ファイルとも export 系処理の純粋関数モジュールで、GOD OBJECT 対象外。
  完了条件:
  - `pnpm test` 全 PASS
  - `pnpm lint` PASS
  - `pnpm build` 成功
  - `node scripts/check-dead-exports.mjs` PASS (45以下を維持)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
