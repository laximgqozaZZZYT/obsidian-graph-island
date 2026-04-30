## Description (subtask of 1571-dead-exports)

`pnpm exec ts-prune` を実行して111件の dead exports 全リストを取得する。
  そのうち src/io/、src/core/ 配下にある dead export について、
  - 完全に未使用ならソース上から削除
  - 内部利用のみなら export を外す (named export → 非export化)
  以前のサブタスク (1568 utils, 1569 layouts/parsers, 1570 views/types) で扱われた
  ディレクトリは触らない。
  削除後に `pnpm build` と `pnpm test` がグリーンであることを確認する。
  `pnpm exec ts-prune | wc -l` の数値を変更前後でコミットメッセージに記録する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
