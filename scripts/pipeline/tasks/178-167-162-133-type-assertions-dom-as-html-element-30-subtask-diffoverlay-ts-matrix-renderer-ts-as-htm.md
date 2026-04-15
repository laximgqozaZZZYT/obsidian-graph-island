---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 167-162-133-type-assertions-dom-as-html-element-30-subtask
depends: none
summary: DiffOverlay.ts + matrix-renderer.ts の as HTMLElement 型アサーション9箇所を型ガードに置換
---

## Description (subtask of 167-162-133-type-assertions-dom-as-html-element-30-subtask)

DiffOverlay.ts（3箇所）:
  - L369: items.forEach内の (item as HTMLElement) → ループ内 instanceof ガード
  - L371-372: (items[idx] as HTMLElement) → インデックスアクセス後に instanceof チェック

  matrix-renderer.ts（6箇所）:
  - L218, L234: (ev.target as HTMLElement).closest() → instanceof HTMLElement ガード後に closest 呼び出し
  - L222, L238: (target as HTMLTableCellElement).cellIndex → target instanceof HTMLTableCellElement チェック
  - L227, L243: r.children[ci+1] as HTMLElement | undefined → instanceof ガード

  pnpm test && pnpm lint で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
