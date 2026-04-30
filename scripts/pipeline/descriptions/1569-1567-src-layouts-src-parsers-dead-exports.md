## Description (subtask of 1567-dead-exports)

subtask-1完了後、再度 ts-prune を実行して残存リストを更新する。
  `src/layouts/` (cluster-force.ts, timeline-layout.ts, sunburst.ts等) と `src/parsers/` (metadata-parser.ts, query-expr.ts等) 配下の dead exports について、未使用を grep で再確認した上で:
  - 内部のみで使用されている: `export` キーワードを削除
  - どこからも使われていない: 関数/定数/型ごと削除
  テストファイル(tests/配下)で参照されている export は残す。
  `pnpm test` と `pnpm lint` が通ることを確認してコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
