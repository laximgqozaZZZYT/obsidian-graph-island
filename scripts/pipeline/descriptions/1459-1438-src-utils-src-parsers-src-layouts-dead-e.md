## Description (subtask of 1438-dead-exports)

subtask-1 のレポートで カテゴリA/B に分類された名前のうち、
  src/utils/, src/parsers/, src/layouts/ 配下のものを処理する。
    - カテゴリA: export文ごと削除（関数/定数/クラスを丸ごと削除）
    - カテゴリB: `export` キーワードのみ削除してファイル内ローカルに格納
  各削除後に `pnpm typecheck` と `pnpm test` を通すこと。
  GOD OBJECT ファイル (GraphViewContainer.ts等) は本タスクでは触らない。
  完了時点で dead exports 件数を再計測してレポートに追記する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
