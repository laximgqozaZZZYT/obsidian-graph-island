## Description (subtask of 1420-dead-exports)

サブタスク1で記録した dead exports リストを再度取得し、src/layouts/ と
  src/views/ 配下(godobj 4ファイルを除く)に該当する dead exports を
  関数定義ごと削除する、または export キーワードを除去する。
  godobj 4ファイルは本サブタスクでは対象外(サブタスク3で扱う)。
  テストファイル(tests/)が当該 export を import している場合は、テストが
  純粋な実装詳細を検証していないか確認し、実装詳細のみのテストなら
  当該テストごと削除する。実施後 `pnpm build && pnpm test && pnpm lint`
  を実行し緑であることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
