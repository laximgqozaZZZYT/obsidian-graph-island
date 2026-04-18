---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 863-740-issue-status-done
depends: none
summary: subtask
---

## Description (subtask of 863-740-issue-status-done)

の結果に従う)
  2. 移動後のファイルで frontmatter `status:` を `done` に書き換え (Edit tool使用)
  3. `git add <移動後パス>` で更新分をステージ
  4. `git commit -m "chore(issue): mark 740-723-subtask as done and move to done/"` で単一コミット
  検証:
  - `git log --follow --name-status -1` で `R` (rename) 検出されること (類似度100%に近い値)
  - `pnpm test` が通ること (コード変更なしなので影響なし想定)
  注意:
  - frontmatter編集と mv を別コミットにすると rename 類似度が下がり delete+add 扱いになる
  - `--no-verify` は使わない (pre-commit hook が走っても問題ないはず、コード変更なし)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
