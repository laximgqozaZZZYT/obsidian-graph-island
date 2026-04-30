## Description (subtask of 1564-dead-exports)

knip 実測で src/views/export/ExportOrchestrator.ts に 10個、src/views/export-orchestrator.ts に 3個の dead exports。
  この2ファイルはパス類似 (export/ExportOrchestrator.ts vs export-orchestrator.ts) のため、まず関係を調査する:
  1. `Grep` で `from.*export-orchestrator` および `from.*export/ExportOrchestrator` を src/ tests/ 全域で検索
  2. src/views/export-orchestrator.ts が legacy ラッパー/再エクスポートのみで完全未参照なら、ファイル単位で削除を検討
  3. src/views/export/ExportOrchestrator.ts 側の dead exports は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
