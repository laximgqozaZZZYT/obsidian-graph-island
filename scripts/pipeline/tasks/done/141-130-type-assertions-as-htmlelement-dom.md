---
priority: high
reported: 2026-04-15
status: done
source: decomposed
parent: 130-type-assertions
depends: none
summary: as HTMLElement を DOM型ガード/型注釈に置換
---

## Description (subtask of 130-type-assertions)

37箇所の `as HTMLElement` を以下で置換:
  
  1. querySelectorAll → querySelectorAll<HTMLElement> ジェネリクス指定
     例: `[...el.querySelectorAll<HTMLElement>(".gi-node-row")]`
  2. e.target → instanceof チェック
     例: `if (e.target instanceof HTMLElement && e.target.tagName === "INPUT")`
  3. children[i] → 型注釈付き変数
     例: `const child = children[i]; if (child instanceof HTMLElement) { ... }`
  4. containerEl.children[1] → querySelector<HTMLElement>(".class")
  
  削減見込み: ~35個
  テスト: pnpm test && pnpm lint
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
