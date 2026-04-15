---
priority: medium
reported: 2026-04-15
status: in-progress
source: decomposed
parent: 132-e2e-smoke-fail
depends: none
summary: subtask
---

## Description (subtask of 132-e2e-smoke-fail)

分析は十分です。根本原因を特定しました。

`★ Insight ─────────────────────────────────────`
**根本原因**: `BASELINE` は `pixiNodes.size`（レンダリング済みノード数）で取得されますが、`renderAndCount` は `getGraphData().nodes.length`（データパイプライン出力）を返します。最近の自律改善セッションで GVC のフィルタパイプラインやノード管理に変更が入り、この2つの値に乖離が生じた可能性が高いです。`pixiNodes` にはデフォルト状態のレンダリング数が入っていますが、vault の状態変化やフィルタの適用順変更により `getGraphData().nodes.length >= pixiNodes.size` となり `showOrphans=false` でも BASELINE を下回らなくなっています。
`─────────────────────────────────────────────────`

---

## タスク分解

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
