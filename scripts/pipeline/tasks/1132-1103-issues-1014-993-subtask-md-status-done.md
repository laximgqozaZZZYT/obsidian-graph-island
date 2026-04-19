---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1103-1081-issues-1014-993-subtask-md-status-done
depends: none
summary: issues/1014-993-subtask.md の status を done に遷移
---

## Description (subtask of 1103-1081-issues-1014-993-subtask-md-status-done)

`issues/1014-993-subtask.md` の1ファイルのみを編集する。

  変更内容:
  1. frontmatter の `status: in-progress` を `status: done` に書き換える
     - 他の frontmatter フィールド (priority, reported, source, parent, depends, summary) は一切変更しない
  2. Acceptance criteria セクションの未チェック `- [ ]` を全て `- [x]` に変更

  制約:
  - `git mv` 使用禁止
  - 編集対象は `issues/1014-993-subtask.md` の1ファイルのみ
  - `src/` 配下は触らない
  - 他の `issues/*.md` は変更しない
  - God Object ファイルには一切触らない

  検証手順:
  - `git diff --stat` で変更が1ファイルのみであることを確認
  - `grep '^status:' issues/1014-993-subtask.md` の出力が `status: done` であること
  - Acceptance criteria セクションに `- [ ]` が残っていないこと (`grep -c '\- \[ \]' issues/1014-993-subtask.md` が 0)

  コミット:
  - メッセージ: `chore: done 1014-993-subtask.md`
  - `pnpm test` / `pnpm lint` はスキップ可 (issues/ 配下ドキュメントのみ変更のため)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
