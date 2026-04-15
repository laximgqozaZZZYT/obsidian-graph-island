---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask
depends: none
summary: matrix-renderer.ts の as HTMLElement / as HTMLTableCellElement を型安全に置換
---

## Description (subtask of 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask)

matrix-renderer.ts L218,222,227,234,238,243 の型アサーションを安全にする。
  
  修正方法:
  - L218, L234: `(ev.target as HTMLElement).closest("td, th") as HTMLElement | null`
    → `ev.target instanceof HTMLElement ? ev.target.closest("td, th") as HTMLElement | null : null`
    または `closest<HTMLElement>` ジェネリックを使用。
  - L222, L238: `(target as HTMLTableCellElement).cellIndex`
    → `target` は既に L218 で `HTMLElement | null` と型付け済み。
    `target instanceof HTMLTableCellElement ? target.cellIndex : undefined` に変更、
    または `target` の型を `HTMLTableCellElement | null` に絞る。
  - L227, L243: `r.children[ci + 1] as HTMLElement | undefined`
    → `HTMLCollection` の要素は `Element` なので `as HTMLElement` は妥当だが、
    `instanceof` チェックに置換可能。ただし `classList` は `Element` にもあるため
    キャスト自体を除去して `Element | undefined` で十分。
  
  変更後 `pnpm lint && pnpm build` で確認。

---

2タスクのみ。両方 `depends: none` なので並列実行可能です。DiffOverlay.ts は3箇所の単純置換、matrix-renderer.ts は6箇所でやや判断が必要ですが、どちらも1セッションで完了するサイズです。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
