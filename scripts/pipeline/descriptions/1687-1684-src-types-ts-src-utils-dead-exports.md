## Description (subtask of 1684-dead-exports)

knip / ts-prune で src/types.ts (interface/type alias)、src/utils/、
  src/i18n.ts 等の残存ファイルから未使用 export を特定し削除する。
  type/interface の場合、内部使用のみであれば export 修飾子削除で十分。
  完了後、リポジトリ全体の dead exports カウントを再計測し、
  受入条件 (50 以下) を満たすか確認する。満たさない場合は次サイクルで残件処理。
  変更後に pnpm test, pnpm lint, pnpm build が通ること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
