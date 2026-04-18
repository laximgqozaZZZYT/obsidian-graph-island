---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1029-1002-subtask
depends: none
summary: ExportOrchestrator.ts 新規作成 + 単体テスト4件以上
---

## Description (subtask of 1029-1002-subtask)

新ディレクトリ `src/views/export/` を作成し `ExportOrchestrator.ts` を新規追加。
  以下の純粋関数/クラスメソッドを提供:
    - `buildSvgExportArgs(graph, settings, viewState)` — 既存 `exportGraphSVG` に渡す引数オブジェクトを組み立てる
    - `buildPngExportArgs(canvas, settings)` — PNG書き出し用の幅/高さ/背景色/scale を計算
    - `buildPresetJson(settings, viewState, metadata)` — preset JSON をシリアライズ前に整形
    - `safeExport(fn)` — try/catch ラッパーで成功 `{ ok: true, data }` / 失敗 `{ ok: false, error }` を返す
  既存の `exportGraphSVG` 純粋関数は import するだけで本体には触れない。
  GraphViewContainer はこのサブタスクでは変更しない（次サブタスクで置換）。
  単体テスト `tests/views/export/ExportOrchestrator.test.ts` に最低4件:
    1. `buildSvgExportArgs` が期待の形で引数を返す
    2. `buildPngExportArgs` が設定から幅/高さ/scale を正しく導出
    3. `buildPresetJson` が JSON 整形（キー順/改行）を保つ
    4. `safeExport` がthrow時に `{ ok: false, error }` を返す
  `pnpm test` / `pnpm lint` / `pnpm build` 通過を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
