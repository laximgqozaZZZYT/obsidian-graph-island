## Description (subtask of 1574-dead-exports)

`npx ts-prune --project tsconfig.json` を実行し、出力から `src/utils/` および
  `src/parsers/` 配下のファイルにある dead export を抽出する。
  各 dead export について:
    1. `Grep` でプロジェクト全体を検索し、本当に未使用かを再確認
       (テストファイル `tests/**` からの import も含めて確認)
    2. 完全に未使用 → そのシンボル(関数/型/定数/クラス)自体を削除
    3. 同一ファイル内のみで使われている → `export` キーワードのみ除去
    4. テストからのみ使われている → 変更しない (テストが import している実コード)
  作業後 `pnpm test` と `pnpm build` が成功することを確認。
  対象外: `src/types.ts` (型は別タスク), `src/views/` 配下 (GOD OBJECT配慮で別タスク)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
