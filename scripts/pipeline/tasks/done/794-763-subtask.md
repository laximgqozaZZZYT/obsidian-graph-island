---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 763-731-git-diff-status
depends: none
summary: subtask
---

## Description (subtask of 763-731-git-diff-status)

で特定した対象ファイルに対し `git diff <path>` を実行。
  出力を以下の条件で検証:
    1. `-status:` で始まる行がちょうど 1 行存在
    2. `+status: done` で始まる行がちょうど 1 行存在
    3. 上記2行以外に `^[-+]` で始まる実変更行が存在しない (diff header `---`/`+++` は除外)
  Bash one-liner 例:
    `git diff <path> | grep -E '^[-+][^-+]' | grep -vE '^[-+]status:' | wc -l` が 0 であること。
  検証成功時は「OK: status-only diff」と出力。
  失敗時は差分全文を表示して `exit 1`。
  add/commit/mv は絶対に実行しない (検証のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
