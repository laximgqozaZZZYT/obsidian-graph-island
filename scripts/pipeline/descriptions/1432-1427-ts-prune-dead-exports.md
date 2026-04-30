## Description (subtask of 1427-dead-exports)

pnpm に `ts-prune` を devDependency として追加し、`scripts/find-dead-exports.mjs` を作成する。
  このスクリプトは:
  1. `ts-prune` を起動し、`(used in module)` マーカー付きの行は除外する
  2. 結果を `.autonomous/dead-exports-list.md` に保存する。フォーマット:
     - ファイルパス: `src/...`
     - 行番号:列番号
     - export名
     - 分類タグ: [type] / [const] / [function] / [class] / [enum]
  3. ファイル別の件数サマリも同じファイル末尾に記載する
  package.json に `"find-dead-exports": "node scripts/find-dead-exports.mjs"` script を追加する。
  src/ 配下のコードは変更しない。リスト生成のみ。subtask-2/3 がこのリストを入力として使う。
  受け入れ基準: `pnpm find-dead-exports` 実行後 `.autonomous/dead-exports-list.md` に
  111±数件の export がリスト化されていること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
