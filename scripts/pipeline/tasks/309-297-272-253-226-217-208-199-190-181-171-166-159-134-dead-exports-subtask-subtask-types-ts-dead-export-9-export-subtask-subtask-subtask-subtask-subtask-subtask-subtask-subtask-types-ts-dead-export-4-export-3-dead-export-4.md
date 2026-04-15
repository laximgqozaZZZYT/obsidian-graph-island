---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 297-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-4-export-3
depends: none
summary: dead export 検証 — 4件すべてが外部参照あり、タスクをクローズ
---

## Description (subtask of 297-272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-types-ts-dead-export-4-export-3)

以下4型は外部ファイルから import されており dead export ではない:
  - ShapeFillKind → src/layouts/coordinate-engine.ts (L22)
  - OntologyRelation → src/views/panel-widgets.ts (L7)
  - DonutDisplayConfig → src/views/RenderPipeline.ts (L7), src/views/PanelBuilder.ts (L18)
  - CardRenderConfig → src/views/RenderPipeline.ts (L8), src/views/PanelBuilder.ts (L23)
  
  export を削除すると pnpm build が失敗する。
  このissueは誤検出のため、変更なしでクローズすべき。
```

---

親issueの dead export 分析が古いか、別ブランチの状態に基づいている可能性があります。現在の `main` / `fix/autofit-suppress-order` ブランチでは4件とも活きた export です。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
