---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 729-717-read-frontmatter
depends: none
summary: subtask
---

## Description (subtask of 729-717-read-frontmatter)

`★ Insight ─────────────────────────────────────`
- このissueは既に subtask-1 の後続として「ファイル検証」に特化しており、さらに細分化する余地は小さい
- 自律パイプラインでは「対象ファイルパスの入手」→「Read」→「frontmatter検証」→「判定分岐」が自然な粒度
- status が既に `done` の場合の no-op 終了は、後続サブタスクを無駄に起動させないゲート処理として独立させる価値がある
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
