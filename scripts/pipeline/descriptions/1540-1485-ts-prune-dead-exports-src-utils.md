## Description (subtask of 1485-dead-exports)

`pnpm exec ts-prune` (または `npx ts-prune --error`) でdead exports一覧を生成し、
  src/utils/ 配下のファイルに該当するexportを対象に以下を実施:
  - ファイル外部から未使用かつ内部でも未使用のexportは declaration ごと削除
  - 内部でのみ使用しているexportは `export` キーワードを外して module-private 化
  - 型エイリアス (`export type`) も同様に処理
  ts-prune の `(used in module)` マークが付いたものは module-private 化のみ。
  作業後 `pnpm test` `pnpm lint` `pnpm build` を実行して通ること。
  最終commit時点で ts-prune の dead exports件数を計測し、件数を
  commit message に記載 (例: "111 → 80 (-31)")。
  src/views/ 配下の God Object ファイルは本タスクでは触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
