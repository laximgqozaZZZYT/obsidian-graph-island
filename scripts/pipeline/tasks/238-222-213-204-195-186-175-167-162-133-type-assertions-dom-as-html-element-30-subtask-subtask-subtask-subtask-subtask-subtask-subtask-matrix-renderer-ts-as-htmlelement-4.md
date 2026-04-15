---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: matrix-renderer.ts の as HTMLElement 型アサーション4箇所を安全なナローイングに置換
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

matrix-renderer.ts 内の以下を修正:
  - L218, L234: (ev.target as HTMLElement).closest() → instanceof ガード
  - L222, L238: (target as HTMLTableCellElement).cellIndex → 既に dataset.col フォールバックあり、
    instanceof HTMLTableCellElement ガードに置換
  - L227, L243: r.children[ci+1] as HTMLElement → instanceof ガード
  既存テストが通ることを確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
