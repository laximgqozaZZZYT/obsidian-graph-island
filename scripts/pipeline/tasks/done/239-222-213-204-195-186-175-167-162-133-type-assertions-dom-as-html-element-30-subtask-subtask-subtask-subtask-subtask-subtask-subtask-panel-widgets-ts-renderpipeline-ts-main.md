---
priority: medium
reported: 2026-04-16
status: done
source: decomposed
parent: 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: panel-widgets.ts + RenderPipeline.ts + main.ts の as HTMLElement 各1箇所を修正
---

## Description (subtask of 222-213-204-195-186-175-167-162-133-type-assertions-dom-as-html-element-30-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

小規模ファイル3つの残存アサーションを修正:
  - panel-widgets.ts L222: (items[selected] as HTMLElement).textContent
    → instanceof HTMLElement ガード
  - RenderPipeline.ts L1735: querySelector結果の as HTMLElement | null
    → 既に | null 付きで比較的安全だが、instanceof ガードに統一
  - main.ts L126: as HTMLInputElement | null → 既に安全だが、
    instanceof HTMLInputElement ガードに統一可能
  God Object (RenderPipeline) の行数を増やさないよう、
  ガードは既存行のインライン置換で行う（if文展開で+1行程度まで許容）。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
