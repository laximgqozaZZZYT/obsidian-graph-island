---
priority: high
reported: 2026-04-16
status: decomposed
source: decomposed
parent: 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask
depends: none
summary: DiffOverlay.ts と matrix-renderer.ts の as HTMLElement 型アサーションを型安全に置換
---

## Description (subtask of 223-214-205-196-187-178-167-162-133-type-assertions-dom-as-html-element-30-subtask-diffoverlay-ts-matrix-renderer-ts-as-htm-subtask-subtask-subtask-subtask-subtask)

以下の型アサーションを型ガードまたはジェネリック型パラメータに置換する。

  ### DiffOverlay.ts (3箇所, L369-372)
  - L369: items.forEach の item を instanceof HTMLElement ガードで保護
  - L371-372: items[this._navIndex] に instanceof HTMLElement ガード追加

  ### matrix-renderer.ts (6箇所, L218-243)
  - L218, L234: ev.target の closest 呼び出しを closest<HTMLElement>("td, th") に変更し、
    外側の `as HTMLElement` を除去
  - L222, L238: target as HTMLTableCellElement → instanceof ガードまたは
    HTMLTableCellElement の narrowing
  - L227, L243: r.children[ci + 1] → ガード付きまたは型安全なアクセス

  全変更後に pnpm build && pnpm test && pnpm lint が通ることを確認。
```

---

1タスクで完了する規模です。2ファイル9箇所の `as HTMLElement` を型ガードやジェネリクスに置き換えるのみで、ロジック変更は不要です。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
