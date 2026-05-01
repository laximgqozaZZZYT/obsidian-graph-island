## Description (subtask of 1619-dead-exports)

`pnpm exec ts-prune` または `pnpm exec knip` を実行して146個のdead exportsの一覧を取得し、
  `src/utils/` 配下の dead export を対象に約50件を処理する。
  処理方針:
  - 完全に未使用の関数/定数/型 → ファイルから削除
  - テストでのみ使用されている関数 → そのまま維持(ts-pruneは検出するがテストで参照されている)
  - 内部でのみ使用される関数 → `export` キーワードを外して module-private 化
  対象ファイル例(ts-prune結果に依存):
  - src/utils/query-expr.ts, src/utils/graph-filter.ts, src/utils/edge-geometry.ts などのヘルパー
  完了条件:
  - 50件以上の dead export を削除/unexport
  - `pnpm test` PASS
  - `pnpm build` PASS
  - `pnpm lint` PASS
  - 既存の export からテスト参照されているものは触らない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
