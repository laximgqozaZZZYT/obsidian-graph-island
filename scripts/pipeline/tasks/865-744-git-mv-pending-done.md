---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 744-690-git-mv-pending-done
depends: subtask-1
summary: git mvでpending→doneに移動してコミット
---

## Description (subtask of 744-690-git-mv-pending-done)

1. subtask-1で特定した`<basename>`を使用
  2. `git mv issues/pending/<basename>.md issues/done/<basename>.md` を実行
  3. `git status --porcelain` で差分が「`R  issues/pending/<basename>.md -> issues/done/<basename>.md`」のみであることを確認(src/**やテストが含まれていたら`git restore --staged`でアンステージして中止)
  4. `git diff --cached --stat` で変更ファイル数が1であることを確認
  5. `git commit -m "chore: done <basename> — GVC test report appended"` でコミット(heredocでなく1行メッセージでOK、`--no-verify`は使わない)
  6. 検証: `git status` がクリーン、`git log -1 --pretty=%s` がコミットメッセージと完全一致、`ls issues/done/<basename>.md` が存在、`ls issues/pending/<basename>.md` が不在
  7. lint/test/buildは実行しない(CLAUDE.md品質ゲート対象外のファイル移動のみ)
  8. 失敗時: `git reset HEAD~1 --mixed` は実行せず、ユーザーに報告して停止

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
