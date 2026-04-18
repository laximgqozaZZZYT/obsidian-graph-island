---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 771-760-
depends: subtask-1
summary: 親タスク 760-730 の frontmatter を status: done へ更新
---

## Description (subtask of 771-760-)

subtask-1 が "DONE" を出力した後、パイプラインの親issueファイルの
  frontmatter の `status:` を `in-progress` → `done` に書き換える。

  - 対象ファイルの M マーク以外に波及がある場合は status を `done` ではなく
    `needs-review` にして warnings 内容を description 末尾に追記
  - ファイルの本文（Description / Acceptance criteria）は変更しない
  - 変更は 1 ファイルのみ（兄弟 subtask ファイルには触らない）
  - git commit は行わない（commit担当の兄弟タスクへ委譲）

`★ Insight ─────────────────────────────────────`
- 元issueの Acceptance criteria に既に [x] が3つ付いている = **検証済み状態の最終出力のみが残っている**という解釈で、コード変更を伴わない2タスクに絞った
- 「git操作を兄弟タスクへ委譲」は CLAUDE.md の "Executing actions with care" 原則（共有状態への影響を伴う操作は明示的承認下でのみ実施）と整合する安全な境界設計
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
