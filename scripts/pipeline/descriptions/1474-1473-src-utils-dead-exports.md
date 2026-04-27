## Description (subtask of 1473-dead-exports)

`pnpm dlx knip --reporter json` 等で dead exports 一覧を生成し、
  src/utils/ 配下のものに限定して以下を実施:
  - 関数/定数/型が他ファイルから一切 import されていない場合は宣言ごと削除
  - 同ファイル内では使われているが他ファイルで未使用の場合は `export` キーワードのみ除去
  作業後に `pnpm build` `pnpm test` `pnpm lint` を通すこと。
  該当しない場合は本タスクを no-op として report-honesty に従い報告。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
