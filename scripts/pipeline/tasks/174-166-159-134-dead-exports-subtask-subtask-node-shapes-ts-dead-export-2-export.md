---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 166-159-134-dead-exports-subtask-subtask
depends: none
summary: node-shapes.ts の dead export 2個を export 解除
---

## Description (subtask of 166-159-134-dead-exports-subtask-subtask)

- NODE_SHAPES 配列定数: export 解除（型 NodeShape の派生元として同ファイル内使用を確認）
  - isNodeShape 型ガード関数: export 解除
  pnpm build && pnpm test で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
