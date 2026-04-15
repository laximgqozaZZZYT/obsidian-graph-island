---
priority: medium
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 296-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-2
depends: none
summary: subtask
---

## Description (subtask of 296-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-5-export-2)

5つすべてが外部ファイルから `import` されている。`export` を削除するとビルドが壊れます。

これは **dead export ではない** — 全5件が外部で使用されています:

| Interface | 使用箇所 |
|---|---|
| `AxisConfig` | `coordinate-engine.ts`, `panel-sections-layout.ts`, `coord-panel.ts` |
| `GridAxisConfig` | `coordinate-engine.ts` |
| `NodeRule` | `panel-widgets.ts`, `PanelBuilder.ts` |
| `ClusterGravityConfig` | `PanelBuilder.ts` |
| `GraphTemplate` | `GraphViewContainer.ts` |

**このissueは無効です。** `export` を削除すると `pnpm build` が失敗します。

分解結果:

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
