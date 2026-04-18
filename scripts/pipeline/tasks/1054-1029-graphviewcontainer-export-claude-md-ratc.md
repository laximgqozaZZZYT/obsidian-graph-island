---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1029-1002-subtask
depends: subtask-1
summary: GraphViewContainer の export 呼び出しを置換 + CLAUDE.md ratchet
---

## Description (subtask of 1029-1002-subtask)

`GraphViewContainer.ts` 内の SVG/PNG/preset export 呼び出し箇所を `ExportOrchestrator` 経由に置換。
  - SVG export: `buildSvgExportArgs()` → `exportGraphSVG()` の流れに変更
  - PNG export: `buildPngExportArgs()` で引数組み立てを委譲
  - preset export: `buildPresetJson()` で整形を委譲
  - 既存のファイル書き出し (app.vault.create / Blob ダウンロード) のI/O層は残す
  置換後、`GraphViewContainer.ts` の行数を測定し、減少した行数分だけ `CLAUDE.md` の
  `src/views/GraphViewContainer.ts` の「Max Allowed」を新しい行数に ratchet down（テーブルの該当行を更新）。
  `pnpm test` / `pnpm lint` / `pnpm build` 通過を確認。
  既存E2E (もし該当あれば) がグリーンであること。
  注意: GraphViewContainer の行数を**増やさない**こと。置換のみで差分は純減にする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
