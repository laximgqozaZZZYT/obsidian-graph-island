---
priority: high
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: types.ts の dead export 3件から export キーワードを削除（バッチ4: ソート/ontology）
---

## Description (subtask of 272-253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

以下3つの型/インターフェースから export キーワードを削除する:
  - SortKey (L304)
  - SortOrder (L305)
  - OntologyRule (L411)
  
  変更後 pnpm build && pnpm test で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
