---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 221-212-203-194-185-174-166-159-134-dead-exports-subtask-subtask-node-shapes-ts-dead-export-2-export-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 221-212-203-194-185-174-166-159-134-dead-exports-subtask-subtask-node-shapes-ts-dead-export-2-export-subtask-subtask-subtask-subtask-subtask)

`★ Insight ─────────────────────────────────────`
親issueの説明がレート制限エラー（「You've hit your limit」）で上書きされており、実質空です。しかし親issue名の `node-shapes-ts-dead-export-2-export` から、`node-shapes.ts` のデッドエクスポート除去タスクと特定できました。

調査結果:
- `NODE_SHAPES` — `src/` 内で直接importなし（`NodeShape`型の導出元だが、`ALL_SHAPES`と重複）
- `isNodeShape` — `src/` 内でimportなし（完全デッド）
- `getNodeDisplayConfig` — `src/` 内でimportなし（テストのみ）
`─────────────────────────────────────────────────`

`node-shapes.ts` のデッドエクスポートは3つ: `NODE_SHAPES`, `isNodeShape`, `getNodeDisplayConfig`。親issueタイトルの「dead-export-2-export」から、これらのうち2つが対象と思われます。

以下がタスク分解です：

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
