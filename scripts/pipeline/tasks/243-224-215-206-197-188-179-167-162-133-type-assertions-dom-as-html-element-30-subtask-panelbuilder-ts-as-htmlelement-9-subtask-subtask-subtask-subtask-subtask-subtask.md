---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask)

`★ Insight ─────────────────────────────────────`
PanelBuilder.tsには **13箇所** の `as HTMLElement` 型アサーションが残っています。これらは主に3つのパターンに分類されます：
1. **`querySelectorAll` の結果** — `Element` を返すので `HTMLElement` にキャストが必要
2. **`event.target`** — `EventTarget | null` なので `HTMLElement` にキャスト
3. **`children`/子要素** — `Element` 型コレクション

安全な修正方法は `instanceof HTMLElement` チェックか、型ガード関数の導入です。
`─────────────────────────────────────────────────`

13箇所の型アサーションを機能的グループに分けて分解します。

---

## タスク分解結果

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
