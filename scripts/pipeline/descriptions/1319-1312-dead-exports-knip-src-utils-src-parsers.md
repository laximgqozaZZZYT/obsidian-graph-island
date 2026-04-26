## Description (subtask of 1312-dead-exports)

1. `npx knip --reporter json > /tmp/knip-dead.json` で未使用 export 一覧を取得
     (または `npx ts-prune`)。出力から「ファイル別 export 名」をリスト化する。
  2. リストのうち `src/utils/` と `src/parsers/` 配下の export について、各ファイルを
     読み、本当にプロジェクト内のどこからも import されていないことを Grep で再確認する。
     (テストからのみ参照されているものは「テストからのみ」と判定して残す。)
  3. 確認できた export を以下のいずれかで処理する:
     - 関数/型自体が他からも一切使われていない → 関数ごと削除
     - 関数自体は同ファイル内で使われている → `export` キーワードのみ外す
  4. 削除/unexport ごとに `pnpm test`、`pnpm lint`、`pnpm build` を実行して回帰なしを確認。
  5. 完了時点での dead export 件数を `npx knip` で再計測しコミットメッセージに記録する。
  対象は src/utils と src/parsers のみ。views/layouts には触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
