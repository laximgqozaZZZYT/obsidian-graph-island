---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: DiffOverlay.ts の as HTMLElement 型アサーション3箇所を安全なナローイングに置換
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

DiffOverlay.ts 内の以下3箇所を修正:
  - L369: items.forEach内の (item as HTMLElement).style → instanceof ガード
  - L371-372: (items[idx] as HTMLElement).style/scrollIntoView → instanceof ガード
  Element配列をHTMLElement配列に安全にフィルタするヘルパーがあれば共用する。
  既存テストが通ることを確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
