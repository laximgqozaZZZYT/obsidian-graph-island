## Description (subtask of 1655-dead-exports)

ts-prune (もしくは `npx ts-prune` を pnpm dlx 経由で) を実行し、
  src/utils/ と src/parsers/ 配下に存在する dead exports を特定する。
  各 dead export に対して以下の判断を行う:
  - 実装内部でのみ使用されるユーティリティ → `export` キーワードを外す
  - どこからも参照されない関数/定数/型 → 関数本体ごと削除
  - テストでのみ参照されているもの → テスト側も含めて削除を検討、
    テストが価値ある仕様検証なら残して export を維持
  作業前後で `npx ts-prune | wc -l` の差分と、削除/unexport した識別子名のリストを
  PR description に記載すること。`pnpm test` と `pnpm lint` と `pnpm build` がすべて通る
  ことを確認してからコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
