---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 144-coverage-drop
depends: none
summary: export-orchestrator の純粋関数群に単体テストを追加
---

## Description (subtask of 144-coverage-drop)

`src/views/export-orchestrator.ts` は 8 エクスポート中 31.1% しかカバーされていない。
  以下の純粋関数を中心に新規テストファイル `tests/export-orchestrator.test.ts` を作成:
  - `DEFAULT_SVG_EXPORT_OPTIONS` 値の妥当性
  - `resolveSvgExportOptions(overrides?)` — undefined/部分オーバーライド/全置換/無関係キー無視
  - `buildExportTimestamp(date)` — 固定日付で `YYYYMMDD-HHMMSS` 形式確認
  - `buildExportFilename(kind, ext, date)` — timestamp の組込、拡張子に `.` が含まれる/含まれないケース
  - `resolveExportCounts(nodes, edges)` — 空配列/巨大配列/readonly 配列
  - `orchestrate{Svg,Png,Json}Export(host, overrides)` — host をスタブ化し呼び出されるメソッドを検証
  目標: 15〜20テストケース、このファイル stmts カバレッジを 31%→80%+ に。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
