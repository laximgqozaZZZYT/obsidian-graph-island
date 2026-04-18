---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 728-717-subtask
depends: subtask-1
summary: Edit で status: decomposed を status: done に置換
---

## Description (subtask of 728-717-subtask)

1. subtask-1 で特定したファイルを Read で再読込する (Edit ツールの前提条件)。
  2. Edit ツールで frontmatter の `status: decomposed` を `status: done` に1行のみ置換する。
  3. 他フィールド (priority / reported / parent / depends / summary / source) は一切変更しない。
  4. 本文 (## Description 以降、## Acceptance criteria 含む) は1文字も変更しない。
  5. この時点では git mv / git add / git commit は行わない (兄弟タスクに委譲)。
  6. Edit が成功したことのみ報告する (差分検証は subtask-3)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
