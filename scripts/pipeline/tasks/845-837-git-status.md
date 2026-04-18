---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 837-834-git-diff-acceptance
depends: none
summary: git status スナップショット取得と差分検証
---

## Description (subtask of 837-834-git-diff-acceptance)

1. `git status --short > /tmp/git-status-after.txt` を実行
  2. `diff /tmp/git-status-before.txt /tmp/git-status-after.txt` を実行し、出力が空であることを確認
  3. 追加の untracked / modified ファイルが発生していないことを確認
  4. 結果（差分の有無、ファイル名）をテキストで記録
  Acceptance: diff 出力が空。追加変更ゼロを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
