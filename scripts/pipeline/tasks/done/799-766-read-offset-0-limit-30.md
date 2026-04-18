---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 766-733-issue-read-frontmatter
depends: none
summary: Read ツールを offset=0, limit=30 で実行しログ出力
---

## Description (subtask of 766-733-issue-read-frontmatter)

701-691-glob-read から引き渡された絶対パス変数 ISSUE_PATH に対し、
  Read ツール (offset=0, limit=30) を実行する疑似コード／ログ行を追記。
  取得した生テキストを変数 RAW_HEAD に格納し、
  ログに `[frontmatter-read] read 30 lines: <path>` を出力する。
  コードファイルは一切変更せず、タスクファイル内の Description に
  実行トレース（期待ログ）を追記するのみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
