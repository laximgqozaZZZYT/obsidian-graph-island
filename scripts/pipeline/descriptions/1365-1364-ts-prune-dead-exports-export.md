## Description (subtask of 1364-dead-exports)

1. `pnpm dlx ts-prune` (または `npx ts-prune`) を実行し、unused export 一覧を取得
     してファイルに保存 (例: `.dead-exports.txt`)。`(used in module)` 付きは除外。
  2. 一覧のうち `src/utils/` と `src/parsers/` 配下のものに対象を絞る。
  3. 各 export について、その名前を `Grep` で全 src/ から検索し、
     - 他ファイルから import されていない
     - test ファイル (tests/) からも import されていない
     - main.ts のエントリ経由でも参照されていない
     ことを確認した上で `export` キーワードを削除 (内部利用が残っている関数は
     非 export 化、完全未使用なら関数本体ごと削除)。
  4. `pnpm build` と `pnpm test` を実行し、両方パスすることを確認。
  5. 削除/非export化した件数をコミットメッセージに記載。
  対象は最大 25 件。残りは

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
