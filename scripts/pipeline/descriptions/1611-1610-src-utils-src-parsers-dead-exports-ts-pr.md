## Description (subtask of 1610-dead-exports)

1. リポジトリルートで `pnpm exec ts-prune --project tsconfig.json` を実行して dead exports 一覧を取得 (出力をタスク内に貼り付け)。
  2. src/utils/ および src/parsers/ 配下の dead exports のみを対象に対応:
     - 同一ファイル内で参照されている場合: `export` キーワードを外す
     - どこからも参照されていない場合: 宣言ごと削除
     - テストファイルからのみ import されている場合: production コードからの未使用 export として削除し、テストもあわせて削除/書き換え
  3. `pnpm build` と `pnpm test` がグリーンであることを確認。
  4. 対応した export 数を実測値でコミットメッセージに記録 (例: `remove N dead exports in src/utils + src/parsers`)。
  GOD OBJECT (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は本タスクでは触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
