---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: panel-sections.ts の as HTMLElement 型アサーション7箇所を型安全に置換
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

panel-sections.ts にある7箇所の as HTMLElement を型安全なコードに置換する。
  
  具体的な変更:
  - L800: (e.target as HTMLElement).tagName → instanceof HTMLElement ガード
  - L1011: querySelectorAll(".gi-node-row") as HTMLElement[] → querySelectorAll<HTMLElement>()
  - L1040-1042: (row as HTMLElement).dataset/.textContent/.style → 
    ループ変数の型を HTMLElement に（querySelectorAll<HTMLElement> の戻り値で自然に解決）
  - L1047-1048: querySelector(".gi-node-dir-body/span") as HTMLElement →
    querySelector<HTMLElement>() のジェネリック型引数を使用
  
  変更後 pnpm lint && pnpm test が通ること。
  行数は増減±0を目標（instanceof ガードで+1行程度は許容）。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
