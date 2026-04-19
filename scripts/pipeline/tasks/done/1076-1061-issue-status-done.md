---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1061-1047-subtask
depends: none
summary: issueのstatusをdoneに更新
---

## Description (subtask of 1061-1047-subtask)

元issueはフロントマター1行の書き換えのみで完結するため、分解ルール#5により1タスクに集約。
  対象ファイル(`issues/` 配下の自身に該当するサブタスク.md)のフロントマター `status:` 行を
  `pending` または `in-progress` から `done` に更新する。
  
  変更範囲:
  - `issues/*.md` の `status:` 行のみ (1行)
  - `git mv` は使用しない (既存ファイルをEditで更新)
  
  受け入れ条件:
  - フロントマターの `status: done` への遷移が完了
  - 他のフィールド (priority, reported, source, parent, depends, summary) は変更しない
  - テスト/ビルドへの影響なし (コード変更を伴わない)
  - CLAUDE.mdのgod object/カバレッジ規約に抵触しないことを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
