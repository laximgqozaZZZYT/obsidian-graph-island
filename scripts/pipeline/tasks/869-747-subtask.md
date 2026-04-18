---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 747-725-claude-md-god-object-policy-ratchet-down
depends: none
summary: subtask
---

## Description (subtask of 747-725-claude-md-god-object-policy-ratchet-down)

`★ Insight ─────────────────────────────────────`
- このissueは既に leaf subtask (subtask-3) で、親issueの ratchet down ワークフローの一部。条件分岐 (N<8597) を含むため、測定→判定→編集の3段構造が自然。
- CLAUDE.md の GOD OBJECT Policy 表は「Max Allowed は絶対に増やさない」という単調性制約を持つ。ratchet pattern は CI/CD で品質指標が後退しないよう保証する典型的な仕組み。
- subtask-5 が単一コミット化を担うため、このタスク内ではコミットを作らず作業ツリーを変更するのみ。
`─────────────────────────────────────────────────`

以下、自律パイプライン向けのサブタスク分解です。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
