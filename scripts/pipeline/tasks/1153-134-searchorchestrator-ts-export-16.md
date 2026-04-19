---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 134-dead-exports
depends: none
summary: `SearchOrchestrator.ts` とパネルファイルの未使用 export を削除 (16個)
---

## Description (subtask of 134-dead-exports)

3ファイルに存在する計16個の未参照 export を同手順で削除。
  `PanelBuilder` (god object) は**触らない**こと。panel-sections-*.ts は抽出済み純粋関数群なので削除/内部化OK。
  1. 各ファイルで ts-prune 出力を列挙
  2. `grep -rn` で実使用確認
  3. 未使用 export を削除、内部関数化
  4. `pnpm build && pnpm test && pnpm lint` グリーン

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
