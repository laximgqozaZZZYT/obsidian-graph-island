---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 167-162-133-type-assertions-dom-as-html-element-30-subtask
depends: none
summary: panel-sections.ts の as HTMLElement 型アサーション7箇所を型ガードに置換
---

## Description (subtask of 167-162-133-type-assertions-dom-as-html-element-30-subtask)

panel-sections.ts の7箇所を修正:

  - L800: (e.target as HTMLElement).tagName → instanceof HTMLElement ガード
  - L1011: querySelectorAll結果の as HTMLElement[] → Array.from + instanceof フィルタ or generic型パラメータ
  - L1040-1042: (row as HTMLElement) 3箇所 → ループ前に instanceof チェックして continue
  - L1047: querySelector as HTMLElement → instanceof ガード
  - L1048: querySelector as HTMLElement → instanceof ガード

  パターン: querySelectorAll の結果は querySelectorAll<HTMLElement>(sel) のジェネリクス指定で安全に型付けできる。
  event.target は instanceof HTMLElement ガードが適切。

  pnpm test && pnpm lint で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
