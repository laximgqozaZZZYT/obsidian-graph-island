---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: matrix-renderer.ts + DiffOverlay.ts + panel-widgets.ts の as HTMLElement 計8箇所を型安全に置換
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

3つの小ファイルの as HTMLElement を一括で型安全に置換する。

  matrix-renderer.ts (4箇所):
  - L218, L234: (ev.target as HTMLElement).closest() → instanceof HTMLElement ガードまたは
    closest<HTMLElement>() 利用
  - L222, L238: (target as HTMLTableCellElement).cellIndex → target が closest("td, th") の
    返り値なので HTMLTableCellElement の instanceof ガードに変更
  - L227, L243: r.children[ci + 1] as HTMLElement → children の型が HTMLCollection なので
    instanceof HTMLElement ガード追加
  
  DiffOverlay.ts (3箇所):
  - L369, L371, L372: (item as HTMLElement) / (items[idx] as HTMLElement) →
    items の取得時に querySelectorAll<HTMLElement>() を使うか、
    ループ内で instanceof HTMLElement ガード
  
  panel-widgets.ts (1箇所):
  - L222: (items[selected] as HTMLElement).textContent →
    instanceof HTMLElement ガードまたはジェネリック型引数
  
  変更後 pnpm lint && pnpm test が通ること。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
