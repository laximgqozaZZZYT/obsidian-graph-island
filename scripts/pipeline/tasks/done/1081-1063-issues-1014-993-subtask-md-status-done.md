---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1063-1048-issues-1014-993-subtask-md-status-done
depends: none
summary: issues/1014-993-subtask.md の status を done に遷移
---

## Description (subtask of 1063-1048-issues-1014-993-subtask-md-status-done)

`issues/1014-993-subtask.md` を編集する。

  変更内容:
  1. frontmatter の `status: decomposed` を `status: done` に書き換え
     - 他の frontmatter フィールド (priority, reported, source, parent, depends, summary) は一切変更しない
  2. Acceptance criteria セクションの未チェック `- [ ]` を全て `- [x]` に変更

  制約:
  - `git mv` 使用禁止
  - 編集対象は `issues/1014-993-subtask.md` の1ファイルのみ
  - `src/` 配下は触らない
  - 他の `issues/*.md` は変更しない

  検証:
  - `git diff --stat` で変更が1ファイルのみ
  - `grep '^status:' issues/1014-993-subtask.md` が `status: done`
  - acceptance criteria セクションに `- [ ]` が残っていない

  コミット:
  - メッセージ: `chore: done 1014-993-subtask.md`
  - `pnpm test` / `pnpm lint` はスキップ可 (issues/ 配下ドキュメントのみ変更)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
