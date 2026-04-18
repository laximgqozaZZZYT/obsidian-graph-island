---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 712-699-639-626-subtask-issue-status-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 712-699-639-626-subtask-issue-status-done-git-mv)

`★ Insight ─────────────────────────────────────`
- 元issueは既に atomic（ファイル1つの status 更新 + git mv + commit）で、工程も直列依存。さらに分割すると session 間で「特定したファイル名」を受け渡す必要が生じ、かえって脆くなる
- 「0件なら no-op 終了」を含んでいるため、冪等性が担保されており単一セッションで安全に実行できる
- CLAUDE.md の God Object 制約や src/** 非変更制約に照らしても、issues/ ディレクトリ限定の作業はリスクが低く、分解インセンティブがない
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
