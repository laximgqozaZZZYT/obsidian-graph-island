---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 763-731-git-diff-status
depends: none
summary: subtask
---

## Description (subtask of 763-731-git-diff-status)

`★ Insight ─────────────────────────────────────`
- この issue は **検証専用サブタスク** で、副作用なし (add/commit/mv なし)。自律パイプラインでは「ゲート」として機能し、後続タスクへ進む前のセーフティネット役
- 親 731-717-read-git-status の subtask-1 が `git status` で対象ファイルを特定した後、ここで `git diff` により「意図しない変更が混ざっていないか」を確認するステップ
- このような検証タスクは 1 セッションで完結するサイズなので、過度な分解より「対象特定」と「差分検証」の 2 ステップに留めるのが適切
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
