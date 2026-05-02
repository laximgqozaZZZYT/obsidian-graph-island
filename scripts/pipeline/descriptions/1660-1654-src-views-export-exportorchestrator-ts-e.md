## Description (subtask of 1654-autonomous-stalled-dirty-skip)

src/views/export/ExportOrchestrator.ts で knip が "Unused exported types" として検出した以下の 9 件を、`export interface` / `export type` から `interface` / `type` に変更し un-export 化する:
    - SvgExportGraph (line 38)
    - SvgExportSettings (line 43)
    - SvgExportViewState (line 50)
    - SvgExportArgs (line 58)
    - PngExportCanvasLike (line 71)
    - PngExportSettings (line 76)
    - PngExportArgs (line 81)
    - PresetMetadata (line 88)
    - SafeExportResult<T> (line 202)
  これらは同ファイル内の `buildSvgExportArgs` / `buildPngExportArgs` / `safeExport` の引数・戻り値型として使われているが、ファイル外からは import されていないことを確認済み (tests/views/export/ExportOrchestrator.test.ts は `buildSvgExportArgs` 関数のみ import)。
  手順:
    1. 各型定義から `export ` キーワードのみを削除 (型定義本体は変更しない)
    2. `pnpm build` で TypeScript エラーなしを確認
    3. `pnpm test tests/views/export/ExportOrchestrator.test.ts` が PASS することを確認
    4. `npx knip` で当該 9 件が消えたことを確認
  注意: 同ファイルの line 32 `export { exportGraphSVG };` (graph-helpers からの re-export) は触らない (knip 誤検知の可能性)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
