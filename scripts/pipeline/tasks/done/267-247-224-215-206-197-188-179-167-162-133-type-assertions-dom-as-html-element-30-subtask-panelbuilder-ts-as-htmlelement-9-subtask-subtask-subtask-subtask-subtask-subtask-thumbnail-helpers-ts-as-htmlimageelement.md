---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: thumbnail-helpers.ts の as HTMLImageElement を型安全に置換
---

## Description (subtask of 247-224-215-206-197-188-179-167-162-133-type-assertions-dom-as-html-element-30-subtask-panelbuilder-ts-as-htmlelement-9-subtask-subtask-subtask-subtask-subtask-subtask)

L29: `img.cloneNode() as HTMLImageElement`
  → cloneNode() は Node を返すため、型安全な代替手段を使う:
    const clone = img.cloneNode() as never;  ← NG
    
  推奨: Object.assign + document.createElement で新規生成、
  または instanceof ガード:
    const clone = img.cloneNode();
    if (!(clone instanceof HTMLImageElement)) throw new Error("unreachable");
  
  あるいは img.src を使って新しい HTMLImageElement を構築:
    const clone = new Image();
    clone.src = img.src;
  
  いずれの方法でも既存テストが通ることを確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
