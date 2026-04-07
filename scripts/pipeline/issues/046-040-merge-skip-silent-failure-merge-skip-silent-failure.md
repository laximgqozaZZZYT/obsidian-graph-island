---
priority: high
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 040-merge-skip-silent-failure
depends: subtask-2
summary: merge-skip 時の silent failure 回帰テストを追加
---

## Description (subtask of 040-merge-skip-silent-failure)

新規シェルテスト `tests/pipeline/autonomous-improve-merge-skip.test.sh`:
  1. 一時 git repo を作成し autonomous-improve.sh をコピーして走らせる
  2. main を意図的に dirty にする (`echo x > main_dirty.txt`)
  3. worktree で dummy issue を done にしてコミット
  4. `autonomous-improve.sh` 相当の merge フェーズを実行
  5. 検証: main の HEAD に issue done コミットが **残っていない** こと
  6. 検証: issue ファイルの status が `done` になっていない こと
  `pnpm test` とは別枠 (bash test runner)。`scripts/pipeline/run-pipeline-tests.sh` から呼べるようにする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
