---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1103-1081-issues-1014-993-subtask-md-status-done
depends: none
summary: issues/1014-993-subtask.md の status を done に遷移
---

## Description (subtask of 1103-1081-issues-1014-993-subtask-md-status-done)

`issues/1014-993-subtask.md` の1ファイルのみを編集する。

  変更内容:
  1. frontmatter の `status: cancelled` を `status: done` に書き換える
     - priority, reported, source, parent, depends, summary は変更しない
  2. Acceptance criteria セクションの未チェック `- [ ]` をすべて `- [x]` に変更

  制約:
  - `git mv` 使用禁止
  - 編集対象は `issues/1014-993-subtask.md` のみ
  - `src/` 配下は触らない
  - 他の `issues/*.md` は変更しない

  検証:
  - `git diff --stat issues/1014-993-subtask.md` で1ファイルのみ変更
  - `grep '^status:' issues/1014-993-subtask.md` が `status: done` を返す
  - `grep -c '^- \[ \]' issues/1014-993-subtask.md` が 0 (Acceptance criteria 未チェックなし)

  コミット:
  - メッセージ: `chore: done 1014-993-subtask.md`
  - `pnpm test` / `pnpm lint` はスキップ可 (issues/ 配下ドキュメントのみ変更)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
