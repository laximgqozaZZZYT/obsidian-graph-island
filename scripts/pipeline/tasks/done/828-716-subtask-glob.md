---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 716-691-subtask-glob-read
depends: none
summary: 対象 subtask ファイルを Glob で列挙し候補リストを取得
---

## Description (subtask of 716-691-subtask-glob-read)

Glob ツールで `issues/pending/*639-626*subtask*.md` パターンにマッチするファイルを列挙する。
  結果を一時メモ (stdout) に候補リストとして出力する。
  マッチ0件の場合は stderr に警告を出して非0終了。
  マッチ1件の場合はそのまま

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
