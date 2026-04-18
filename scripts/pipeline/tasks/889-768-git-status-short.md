---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 768-760-subtask
depends: none
summary: git status --short で作業ツリーの変更差分を収集
---

## Description (subtask of 768-760-subtask)

`git status --short` を実行し、Modified (M)、Added (A)、Deleted (D)、Untracked (??) を分類して
  tasks/760-730-git-status-short-modified.md の本文に以下を追記する:
  - 実行日時 (2026-04-19)
  - 変更ファイル総数
  - M/A/D/?? それぞれの件数
  - ファイル一覧 (先頭20件まで)
  新規ファイル作成・コード変更は禁止。tasks/ ディレクトリの当該ファイルのみ編集。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
