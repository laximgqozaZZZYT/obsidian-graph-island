---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: GVC の as HTMLElement 2件を instanceof ガードまたは型安全APIに置換
---

## Description (subtask of 247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask)

GraphViewContainer.ts に残る as HTMLElement を2件とも除去する。
  
  1. L903: `this.containerEl.children[1] as HTMLElement`
     → `this.containerEl.querySelector('.workspace-leaf-content') as never`
       ではなく、instanceof HTMLElement ガードで安全にアクセス:
       const root = this.containerEl.children[1];
       if (!(root instanceof HTMLElement)) return;
  
  2. L1848: `children[i] as HTMLElement`
     → _positionAnnotationEl の引数型を Element に変更するか、
       instanceof HTMLElement ガードを追加:
       const el = children[i];
       if (el instanceof HTMLElement) this._positionAnnotationEl(el, ...);
  
  注意: GVC は God Object (8612行上限)。行数を増やさないよう、
  既存の行を置換する形で修正すること。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
