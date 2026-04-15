---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: GraphViewContainer.ts の as HTMLElement 8箇所を型安全に置換（行数増加禁止）
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

God Object (8612行上限) のため、行数を増やさない方針で進める。
  
  具体的な変更:
  - L903: containerEl.children[1] as HTMLElement → 
    children[1] instanceof HTMLElement ガード、または事前に型定義
  - L1174: (e.target as HTMLElement)?.tagName → instanceof HTMLElement ガード
  - L1849: children[i] as HTMLElement → instanceof HTMLElement ガード
  - L4128: row as HTMLElement → ループ変数の型を HTMLElement に
  - L4394: this.containerEl as HTMLElement | null → containerEl は既に HTMLElement なので
    キャスト不要の可能性を調査、不要なら削除
  - L4403: querySelector(sel) as HTMLElement | null → querySelector<HTMLElement>(sel)
  - L6870, L8472: (b as HTMLElement).dataset.mode → 
    querySelectorAll<HTMLElement> でループ変数の型を解決
  
  変更後: pnpm lint && pnpm test 通過、かつファイル行数 ≤ 8612行を確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
