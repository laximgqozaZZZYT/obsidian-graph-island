---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: panel-sections.ts の as HTMLElement 型アサーション6箇所を安全なナローイングに置換
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

panel-sections.ts 内の以下6箇所の `as HTMLElement` を instanceof ガードまたは
  型安全なヘルパーに置換する:
  - L800: (e.target as HTMLElement).tagName → instanceof HTMLElement ガード
  - L1011: querySelectorAll結果の as HTMLElement[] → Array.from + instanceof フィルタ
  - L1040-1042: (row as HTMLElement).dataset/textContent/style → instanceof ガード
  - L1047-1048: querySelector結果の as HTMLElement → instanceof ガード後にアクセス
  既存テストが通ることを確認。行数純減または同等を維持。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
