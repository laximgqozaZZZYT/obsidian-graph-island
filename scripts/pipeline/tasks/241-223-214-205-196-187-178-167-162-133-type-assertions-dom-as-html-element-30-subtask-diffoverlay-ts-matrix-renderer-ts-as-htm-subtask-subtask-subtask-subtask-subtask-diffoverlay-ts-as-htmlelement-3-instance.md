---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask
depends: none
summary: DiffOverlay.ts の as HTMLElement 3箇所を instanceof ガードに置換
---

## Description (subtask of 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask)

L369: items.forEach 内の (item as HTMLElement).style.background
    → if (item instanceof HTMLElement) item.style.background = "";
  L371: (items[this._navIndex] as HTMLElement).style.background
    → const active = items[this._navIndex]; if (active instanceof HTMLElement) active.style.background = "...";
  L372: (items[this._navIndex] as HTMLElement).scrollIntoView
    → 同上の active 変数で active.scrollIntoView({ block: "nearest" });
  pnpm test && pnpm lint で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
