---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 764-731-git-status-short-modified-1
depends: subtask-1
summary: 他ファイルへの副作用がないことを全体 git status で確認
---

## Description (subtask of 764-731-git-status-short-modified-1)

Bash で `git status --short`（パス指定なし）を実行。
  期待する出力は ` M docs/issues/<対象ファイル>` の1行のみ。
  他ファイルの M/A/D/?? が一切含まれていないことを確認する。
  含まれている場合、副作用ありとして該当ファイル一覧を報告し失敗扱い。
  副作用なしを確認したら「verification OK: 対象ファイルのみ modified, ステージなし、他ファイル変更なし」と報告して終了。
  add/commit/mv/restore は絶対に実行しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
