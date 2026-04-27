## Description (subtask of 1390-dead-exports)

`src/utils/` および `src/parsers/` 配下の `.ts` ファイルを精読し、
  プロジェクト内のどこからも import されていない export 名を特定する。
  検出手順:
  1. `pnpm exec knip --reporter compact` または `pnpm exec ts-prune` を実行し、
     対象ディレクトリ配下の dead exports をリストアップする
     (knip/ts-prune が devDependencies に無ければ `pnpm dlx ts-prune` で代替)
  2. 各 dead export について、本当にどこからも参照されていないか
     `grep -rn "exportName" src/ tests/ e2e/` で再確認する
  3. `tests/` または `e2e/` でのみ参照されている export は保持する
     (テスト対象として export している純粋関数は残す)
  4. 完全に未参照の export 宣言を削除する
     - 関数/クラス/定数の場合: `export` キーワードのみ削除 (内部参照があれば残す)
     - 内部参照も無い場合: 宣言ごと削除
  対象範囲を `src/utils/` と `src/parsers/` に限定することで、
  GraphViewContainer.ts などの God Object には触れない。
  完了後 `pnpm build && pnpm test && pnpm lint` が通ることを確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
