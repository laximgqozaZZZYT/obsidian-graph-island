---
priority: medium
reported: 2026-04-16
status: done
source: decomposed
parent: 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask)

`★ Insight ─────────────────────────────────────`
PanelBuilder.tsの`as HTMLElement`は3パターンに分類できます：
1. **querySelectorAll結果** → `querySelectorAll<HTMLElement>()`ジェネリックで解決
2. **event.target** → `instanceof HTMLElement`型ガードで解決
3. **querySelector結果** → `querySelector<HTMLElement>()`ジェネリックで解決

いずれもDOM APIのジェネリック型パラメータを使えば、unsafeなキャストを排除できます。
`─────────────────────────────────────────────────`

全13箇所が1ファイルに集中しているため、2タスクに分解します：

---

## タスク分解結果

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
