---
priority: medium
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 297-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-4-export-3
depends: none
summary: subtask
---

## Description (subtask of 297-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-4-export-3)

4つとも外部ファイルから `import` されています。**これらは dead export ではありません**。

- `ShapeFillKind` → `coordinate-engine.ts` が import
- `OntologyRelation` → `panel-widgets.ts` が import
- `DonutDisplayConfig` → `RenderPipeline.ts`, `PanelBuilder.ts` が import
- `CardRenderConfig` → `RenderPipeline.ts`, `PanelBuilder.ts`, `GraphViewContainer.ts` が import

**このタスクは実行不可能です。** 4件すべてが他ファイルから import されており、`export` を削除するとビルドが壊れます。

分解結果:

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
