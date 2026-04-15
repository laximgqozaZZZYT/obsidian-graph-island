---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask
depends: none
summary: matrix-renderer.ts の as HTMLElement 6箇所を instanceof ガードに置換
---

## Description (subtask of 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask)

L218, L234: (ev.target as HTMLElement).closest("td, th") as HTMLElement | null
    → const raw = ev.target; if (!(raw instanceof HTMLElement)) return; const target = raw.closest("td, th"); if (!(target instanceof HTMLElement)) return;
  L222, L238: (target as HTMLTableCellElement).cellIndex
    → target.dataset.col ?? (target instanceof HTMLTableCellElement ? target.cellIndex.toString() : undefined)
  L227, L243: r.children[ci + 1] as HTMLElement | undefined
    → const c = r.children[ci + 1]; if (c instanceof HTMLElement) c.classList.add/remove(...)
  mouseover/mouseout の2ハンドラで同パターン×2。
  pnpm test && pnpm lint で確認。
```

---

両タスクは依存なしで並列実行可能です。合計9箇所の `as HTMLElement` を型安全な `instanceof` チェックに置換します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
