---
priority: medium
reported: 2026-04-07
status: done
source: decomposed
parent: 040-merge-skip-silent-failure
depends: subtask-1
summary: verify-issue-done.sh のユニットテスト
---

## Description (subtask of 040-merge-skip-silent-failure)

`tests/pipeline/verify-issue-done.test.sh` を作成:
  ケース1: AC に存在するファイルパスのみ → exit 0
  ケース2: AC に存在しないファイルパスを含む → exit 1 + MISSING ログ
  ケース3: AC にファイルパス言及なし → exit 0 (skip)
  ケース4: バッククォートなしの裸パス → 検出しない (false positive 回避確認)
  fixture は `tests/pipeline/fixtures/issues/` に配置。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
