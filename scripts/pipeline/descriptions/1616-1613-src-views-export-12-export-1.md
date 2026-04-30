## Description (subtask of 1613-dead-exports)

knip 報告:
  - src/views/export/ExportOrchestrator.ts: exports=1 (exportGraphSVG),
    types=9 (SvgExportGraph, SvgExportSettings, SvgExportViewState,
             SvgExportArgs, PngExportCanvasLike, PngExportSettings,
             PngExportArgs, PresetMetadata, SafeExportResult)
  - src/views/export-orchestrator.ts: types=3
    (SvgExportOverrides, ResolvedSvgExportOptions, ExportCounts)
  手順:
  1. `exportGraphSVG` は実際に呼び出されているか確認:
     `grep -rn "exportGraphSVG" src/ tests/`
     - 利用箇所があれば knip の entry 設定漏れ。`knip.json` か package.json
       の knip entry を更新 (削除ではなく export 維持)。
     - ゼロなら `export` を外して内部関数化、もしくは関数ごと削除。
  2. 9+3=12 個の未参照型は同様に grep で参照ゼロを再確認してから
     `export` を外す or 削除。
  3. 2 ファイル (ExportOrchestrator.ts と export-orchestrator.ts) が
     重複ファイルでないかも確認 (片方が dead file の可能性)。
     重複なら片方を削除、ただし削除判断は慎重に (require/dynamic-import なし確認)。
  4. `pnpm test`, `pnpm lint`, `pnpm build` を全て pass させる。
  5. `node scripts/check-dead-exports.mjs` で減少を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
