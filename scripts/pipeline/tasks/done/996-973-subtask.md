---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 973-958-639-626-subtask-issue-1-pending-done-git
depends: none
summary: subtask
---

## Description (subtask of 973-958-639-626-subtask-issue-1-pending-done-git)

`★ Insight ─────────────────────────────────────`
- このissueは既に親タスクから分解された**アトミック単位**で、さらに細分化すると「Glob検索」「Edit」「git mv」「commit」が別タスクになり、単一の論理操作が複数セッションに分断されてしまう
- 自律パイプラインでは「1 issue = 1 commit」の原則があり、ファイル移動 + status書換 + コミットは不可分(git mvの前にstatus書換が必要、かつ1つのコミットに含めるべき)
- `replace_all: false` を明示することで frontmatter の `status:` が本文中にも出現した場合の誤置換を防ぐ — Obsidian markdown では本文に `status:` が書かれるケース(テンプレート説明等)がある
`─────────────────────────────────────────────────`

このissueは既に親タスクから分解済みの**アトミック単位**(1 Glob + 1 Edit + 1 git mv + 1 commit)のため、さらなる分解は不要と判断します。1タスクとして出力します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
