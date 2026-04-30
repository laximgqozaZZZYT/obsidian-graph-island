## Description (subtask of 1557-dead-exports)

`pnpm exec ts-prune` または `pnpm exec knip` を実行して 111 個の dead exports の完全リストを取得する。
  リストを `src/utils/` 配下と `src/parsers/` 配下のファイルに絞り込み、該当する export 宣言を削除する
  (該当 symbol がファイル内部でのみ使われている場合は `export` キーワードを外す。
  完全に未使用なら関数/定数ごと削除する)。
  作業手順:
  1. `pnpm exec ts-prune > /tmp/dead-exports.txt` で全リスト取得
  2. `src/utils/` `src/parsers/` を含む行のみ抽出
  3. 各 symbol について Grep で他ファイルからの import を再確認
  4. `export` 解除 or 削除
  5. `pnpm build && pnpm test` で型/テスト破壊がないことを確認
  この SUBTASK 単独で dead exports を 30 件以上削減することを目標とする。
  GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts は触らない (God Object 政策)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
