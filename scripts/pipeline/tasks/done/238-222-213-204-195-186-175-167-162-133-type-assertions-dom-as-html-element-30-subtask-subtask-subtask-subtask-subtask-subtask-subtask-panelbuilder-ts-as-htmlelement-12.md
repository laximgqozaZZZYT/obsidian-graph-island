---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: PanelBuilder.ts の as HTMLElement 12箇所を型安全に置換（行数増加禁止）
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

God Object (2218行上限) のため、行数を増やさずに型安全化する必要がある。
  
  戦略: querySelectorAll/querySelector のジェネリック型引数で対処し、
  ループ変数の型が自然に HTMLElement になるようにする。
  instanceof ガードは行数が増えるため最終手段。
  
  具体的な変更:
  - L1142-1143, L1151, L1153, L1156: children の型が HTMLCollection のため、
    Array.from<HTMLElement>(children) か for...of のキャストを1回に集約
  - L1698: querySelectorAll(".gi-node-row") as HTMLElement[] →
    querySelectorAll<HTMLElement>(".gi-node-row")
  - L1763: (e.target as HTMLElement).tagName → instanceof HTMLElement ガード
  - L1886-1888: (row as HTMLElement) 3連続 → ループ変数を HTMLElement に型付け
  - L1894-1895: querySelector as HTMLElement → querySelector<HTMLElement>()
  - L2060: (e.target as HTMLElement).closest → instanceof HTMLElement ガード
  
  変更後: pnpm lint && pnpm test 通過、かつファイル行数 ≤ 2218行を確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
