---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 635-624-4-god-object-wc-l
depends: none
summary: subtask
---

## Description (subtask of 635-624-4-god-object-wc-l)

`★ Insight ─────────────────────────────────────`
- 元タスクは read-only な計測作業1ステップのみ。分解の余地がなく、単一サブタスクとして出力するのが正解
- `wc -l` 結果を一時ファイルに保存することで、後続のリファクタリング判断（GOD OBJECT Policy のラチェット値検証）に再利用可能
`─────────────────────────────────────────────────`

このissueは既に最小粒度（read-only計測のみ）なので、1サブタスクとして出力します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
