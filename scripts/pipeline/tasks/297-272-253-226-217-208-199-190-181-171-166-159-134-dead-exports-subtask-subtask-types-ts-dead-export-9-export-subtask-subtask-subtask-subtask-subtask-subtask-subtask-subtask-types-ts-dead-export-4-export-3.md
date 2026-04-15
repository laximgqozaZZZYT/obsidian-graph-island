---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: types.ts の dead export 4件から export キーワードを削除（バッチ3: 表示系型）
---

## Description (subtask of 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

以下4つの型/インターフェースから export キーワードを削除する:
  - CardRenderConfig (L660)
  - DonutDisplayConfig (L614)
  - ShapeFillKind (L184)
  - OntologyRelation (L409)
  
  変更後 pnpm build && pnpm test で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
