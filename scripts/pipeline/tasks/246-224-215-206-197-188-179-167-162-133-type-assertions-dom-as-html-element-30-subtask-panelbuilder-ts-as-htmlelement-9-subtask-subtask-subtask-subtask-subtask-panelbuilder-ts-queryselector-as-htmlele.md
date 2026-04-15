---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask
depends: none
summary: PanelBuilder.ts イベントハンドラとquerySelectorの as HTMLElement を置換 (2箇所)
---

## Description (subtask of 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask)

残り2箇所のキャストを修正:
  - L1763: (e.target as HTMLElement).tagName === "INPUT"
    → if (e.target instanceof HTMLInputElement) return; (より具体的な型)
    または if (e.target instanceof HTMLElement && e.target.tagName === "INPUT")
  - L2060: (e.target as HTMLElement).closest(".gi-section-help")
    → if (e.target instanceof HTMLElement && e.target.closest(...)) return;
  
  L1698: [...querySelectorAll(".gi-node-row")] as HTMLElement[]
    → querySelectorAll<HTMLElement>(".gi-node-row") のジェネリック引数を使用
  
  pnpm test && pnpm lint で確認。全3箇所のas HTMLElementが0になることを
  grep " as HTML" src/views/PanelBuilder.ts で検証。
```

---

3タスクすべて独立（依存なし・別の行範囲）なので並列実行可能です。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
