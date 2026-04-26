## Description (subtask of 1264-dead-exports)

1. `pnpm exec knip --reporter json` または `pnpm exec ts-prune` を実行して
     dead exports の完全なリスト (102件) をファイル/シンボル名つきで取得する。
     リストを `/tmp/dead-exports.txt` などに保存する。
  2. リストのうち src/utils/, src/parsers/, src/layouts/ 配下のものを精読する。
     - 各 export について、tests/ ディレクトリ内も grep で参照確認する
       (test 専用 export はこのタスクでは残す)。
     - 真に未使用 (src/, tests/ どちらからも参照なし) と確認できたものだけ
       `export` キーワードを削除して非公開関数/型に変える。
     - 関数本体ごと完全に未使用なら関数自体を削除する。
  3. `pnpm build` `pnpm test` `pnpm lint` を全て通すこと。
  4. このタスクの完了条件: dead exports カウントを再計測して、削減件数を
     コミットメッセージに事実ベースで記録 (例: "knip dead exports 102 → N")。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
