---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 764-731-git-status-short-modified-1
depends: none
summary: 対象ファイルの modified 状態を git status --short で確認
---

## Description (subtask of 764-731-git-status-short-modified-1)

Bash で `git status --short docs/issues/<対象ファイル>` を実行する。
  期待する出力は ` M docs/issues/<対象ファイル>` の1行のみ（先頭空白+M=worktree modified, not staged）。
  - 出力が0行: subtask-2 の edit が未反映 → 失敗として報告
  - 出力が `M ` で始まる（staged）: 誤って add されている → 失敗として報告
  - 出力が ` M` 以外の状態（?? untracked, A added, D deleted 等）: 予期しない状態 → 失敗として報告
  add/commit/mv/restore は絶対に実行しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
