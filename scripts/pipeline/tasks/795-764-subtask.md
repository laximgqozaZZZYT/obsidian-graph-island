---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 764-731-git-status-short-modified-1
depends: none
summary: subtask
---

## Description (subtask of 764-731-git-status-short-modified-1)

`★ Insight ─────────────────────────────────────`
- この親タスクは「検証のみ（read-only）」で add/commit/mv を禁止しているため、副作用がない＝分解粒度は小さくて済む
- `git status --short <path>` と `git status --short`（全体）は別用途: 前者は対象ファイルの状態確認、後者は副作用スキャン
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
