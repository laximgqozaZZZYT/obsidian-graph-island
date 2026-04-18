---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1048-1020-1014-993-subtask-issue-done
depends: none
summary: issues/1014-993-subtask.md の status を done に遷移
---

## Description (subtask of 1048-1020-1014-993-subtask-issue-done)

`issues/1014-993-subtask.md` を編集し、以下の2点のみ変更する。

  1. フロントマターの `status: in-progress` を `status: done` に書き換え
     (該当行以外の frontmatter フィールドは変更しない)
  2. Acceptance criteria セクションの未チェック `- [ ]` を `- [x]` に変更
     (全ての acceptance criteria 項目が実装済み前提)

  制約:
  - `git mv` は使用禁止 (ファイル名・パスは変更しない)
  - 編集対象は `issues/1014-993-subtask.md` の1ファイルのみ
  - `src/` 配下のコードには一切触れない
  - 他の issues/*.md は変更しない

  検証:
  - `git diff --stat` で変更が1ファイル (issues/1014-993-subtask.md) のみであること
  - `grep '^status:' issues/1014-993-subtask.md` が `status: done` を返すこと
  - 未チェックの `- [ ]` が acceptance criteria セクションに残っていないこと

  コミット:
  - メッセージ: `chore: done 1014-993-subtask.md`
  - `pnpm test` / `pnpm lint` は issues/ 配下ドキュメント変更のみなのでスキップ可

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
