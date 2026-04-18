---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 721-702-subtask
depends: none
summary: 親タスクで編集された issueファイルの frontmatter を再読込し status:done を検証
---

## Description (subtask of 721-702-subtask)

親タスク 702-691-edit-status で編集された issue ファイルの frontmatter を
  Read ツール (offset=0, limit=30) で再読込し、以下を確認する。

  1. `---` と `---` に挟まれた frontmatter ブロックを特定
  2. `status: done` が frontmatter 内に **1箇所だけ** 存在
  3. `status: pending` が frontmatter 内に **存在しない**
  4. `status: in-progress` が frontmatter 内に **存在しない**
  5. 以下のフィールドが元のまま保持されていること:
     - priority
     - reported
     - parent
     - depends
     - summary
     - source

  検証方法:
  - Read で offset=0, limit=30 → frontmatter 取得
  - Grep (path=同ファイル, pattern=`^status:`) で status 行の件数確認
  - 保持フィールドは Grep で各 key の存在確認

  変更なし (read-only verification)。コード編集は行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
