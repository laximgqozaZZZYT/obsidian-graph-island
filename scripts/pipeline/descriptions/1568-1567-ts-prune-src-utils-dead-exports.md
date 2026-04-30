## Description (subtask of 1567-dead-exports)

`pnpm exec ts-prune --project tsconfig.json` を実行して111個のdead exportsの完全リストを取得する。
  リストのうち `src/utils/` 配下のエントリ(query-expr.ts, geometry.ts, color-utils.ts等)について、各export名がプロジェクト内で本当に未使用か grep で再確認した上で:
  - 内部のみで使用されている: `export` キーワードを削除
  - どこからも使われていない: 関数/定数/型ごと削除
  単体テストで参照されている export は残す。
  `pnpm test` と `pnpm lint` が通ることを確認してコミット。
  リストの全件を一度に処理する必要はない。最低でも src/utils/ 配下を完了させる。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
