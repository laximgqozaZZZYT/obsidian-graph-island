---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 678-664-639-626-subtask-issue-status-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 678-664-639-626-subtask-issue-status-done-git-mv)

`★ Insight ─────────────────────────────────────`
- この issue は「ファイル1つの frontmatter 書き換え + git mv + commit」の一連の原子的操作で、分割すると git 状態が中途半端になるリスクがあります
- 分解より「1セッションで完結」が安全 — pending/done 両方確認する no-op 分岐もあるので冪等性が担保されています
- CLAUDE.md の「src/** は変更しない」「lint/test/build 不要」制約があるため、god object policy への抵触はゼロです
`─────────────────────────────────────────────────`

この issue は既に atomic な git mv 操作のため、分解せず1タスクとして出力します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
