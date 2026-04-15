---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask
depends: none
summary: DiffOverlay.ts の as HTMLElement を型安全なジェネリック querySelectorAll に置換
---

## Description (subtask of 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask)

DiffOverlay.ts L368-372 の3箇所の `as HTMLElement` キャストを除去する。
  
  修正方法:
  - L368: `panel.querySelectorAll(".gi-diff-list-item")` を
    `panel.querySelectorAll<HTMLElement>(".gi-diff-list-item")` に変更。
    これにより `items` が `NodeListOf<HTMLElement>` になり、
    L369 の `(item as HTMLElement)` キャストが不要になる。
  - L370-372: `items[this._navIndex]` は既に `HTMLElement` 型なので
    `as HTMLElement` キャストを除去するだけ。
  
  変更後 `pnpm lint && pnpm build` で確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
