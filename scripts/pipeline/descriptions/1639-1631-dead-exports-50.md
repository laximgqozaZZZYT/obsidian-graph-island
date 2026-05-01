## Description (subtask of 1631-dead-exports)

subtask-2 完了時点の ts-prune 一覧をもとに、残った dead exports を処理して
  最終件数を 50 以下にする。対象は主に src/types.ts の未使用型, src/i18n.ts の
  未使用キー, トップレベルファイル等。
  Acceptance criteria の「dead exports を 50個以下に削減」を満たすため、
  最終的に `pnpm exec ts-prune | wc -l` の値を記録し、issue の DoD 確認に使う。
  `pnpm test` `pnpm lint` `pnpm build` `pnpm format:check` を全て通すこと。
  god object 4ファイルの行数が変わっていないことを `wc -l` で再確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
