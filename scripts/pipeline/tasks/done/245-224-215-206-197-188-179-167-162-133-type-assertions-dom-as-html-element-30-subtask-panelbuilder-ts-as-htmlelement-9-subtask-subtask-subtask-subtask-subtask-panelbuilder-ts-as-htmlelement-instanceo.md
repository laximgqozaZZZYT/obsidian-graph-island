---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask
depends: none
summary: PanelBuilder.ts ノード一覧フィルタの as HTMLElement をinstanceofガードに置換 (5箇所)
---

## Description (subtask of 224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask)

L1886-1895のノード一覧検索フィルタ処理で、キャストをinstanceofガードに置換。
  対象5箇所:
  - L1886: (row as HTMLElement).dataset.nodeId
  - L1887: (row as HTMLElement).textContent
  - L1888: (row as HTMLElement).style.display
  - L1894: body = dir.querySelector(...) as HTMLElement → const body = ...; if (!(body instanceof HTMLElement)) return;
  - L1895: arrow = dir.querySelector(...) as HTMLElement → 同上
  
  querySelectorAll結果は既にHTMLElementであることが確実だが、
  型安全のためinstanceofガードを入れる。
  pnpm test && pnpm lint で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
