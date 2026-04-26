## Description (subtask of 1364-dead-exports)

`pnpm exec ts-prune` (もしくは既存設定ツール) を実行して dead exports 一覧を取得し、
  src/utils/, src/parsers/, src/layouts/ 配下のファイルに該当する項目を抽出する。
  各項目について以下のいずれかを実行:
  - 関数/型/定数本体も完全に未使用 → 定義ごと削除
  - ファイル内では使われているが外部未使用 → `export` キーワードのみ削除
  - 本当に外部公開が必要 (テストでのみ使用等) → 該当 import 元を確認
  注意:
  - tests/ からの参照は dead export ではないため、tests/ で使われている export は残す
  - 削除前に `pnpm test` を実行し regress なしを確認
  - 完了後 `pnpm build` で main.js が生成されることを確認
  - `git diff --stat` で変更ファイルが想定通りであることを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
