---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1103-1081-issues-1014-993-subtask-md-status-done
depends: none
summary: issues/1014-993-subtask.md の status を done に遷移
---

## Description (subtask of 1103-1081-issues-1014-993-subtask-md-status-done)

`issues/1014-993-subtask.md` を1ファイルのみ編集する。

  変更内容:
  1. frontmatter の `status: in-progress` を `status: done` に置換
     - priority, reported, source, parent, depends, summary は変更しない
  2. Acceptance criteria セクションの未チェック `- [ ]` を全て `- [x]` に変換

  制約:
  - `git mv` 使用禁止
  - 編集対象は `issues/1014-993-subtask.md` のみ
  - `src/` 配下は触らない
  - 他の `issues/*.md` は変更しない

  検証手順:
  - `git diff --stat` → 変更1ファイルのみ
  - `grep '^status:' issues/1014-993-subtask.md` → `status: done`
  - `grep -c '^- \[ \]' issues/1014-993-subtask.md` → 0 (Acceptance criteria内に未チェックなし)

  コミット:
  - メッセージ: `chore: done 1014-993-subtask.md`
  - `pnpm test` / `pnpm lint` はスキップ可 (ドキュメントのみ)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
