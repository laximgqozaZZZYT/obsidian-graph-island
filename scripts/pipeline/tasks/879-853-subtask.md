---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 853-845-subtask
depends: none
summary: subtask
---

## Description (subtask of 853-845-subtask)

親タスク 853 は最小単位（単一 bash コマンド + 検証）まで分解済み。
これ以上分割すると overhead が価値を上回るため、1 subtask に留め `depends: none` で即実行可能とする。
タスク ID をパスに埋め込むパターン (`/tmp/git-status-853-before.txt`) は cron 並列実行時のファイル衝突回避策。

## Acceptance criteria
- [ ] 親タスク 853 の decompose 結果として 880-853-before.md が存在する
- [ ] 本ファイル自体の frontmatter が parser で読取可能
