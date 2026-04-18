---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 845-837-git-status
depends: none
summary: git status の after スナップショット取得
---

## Description (subtask of 845-837-git-status)

1. `git status --short > /tmp/git-status-after.txt` を実行してワークツリー状態を保存
  2. 事前に `/tmp/git-status-before.txt` が存在することを確認（無ければ親タスク 837 に差し戻しメモを記録）
  3. 生成された `/tmp/git-status-after.txt` の行数と内容サマリを出力に記録
  Acceptance: `/tmp/git-status-after.txt` が生成され、読み取り可能であること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
