---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 865-744-git-mv-pending-done
depends: none
summary: git mv で pending→done に移動し staging 差分を検証
---

## Description (subtask of 865-744-git-mv-pending-done)

1. 親 issue 744-690 または先行 subtask-1 のメモから `<basename>` (GVC test report 関連の done 化対象ファイル名) を特定する。不明な場合は `git log --oneline -20` と `ls issues/pending/` から GVC test report に関する pending ファイルを特定して報告する。
  2. `git mv issues/pending/<basename>.md issues/done/<basename>.md` を実行。
  3. `git status --porcelain` を実行し、出力が `R  issues/pending/<basename>.md -> issues/done/<basename>.md` の 1 行のみであることを確認。
  4. `git diff --cached --stat` で変更ファイル数が 1、追加/削除行数がリネームに相当する値(0 insertions, 0 deletions もしくは極小)であることを確認。
  5. src/**, tests/**, *.ts, *.json 等が staging に含まれている場合は `git restore --staged <path>` でアンステージし、処理を中止してユーザーに報告。
  6. 検証成功したら

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
