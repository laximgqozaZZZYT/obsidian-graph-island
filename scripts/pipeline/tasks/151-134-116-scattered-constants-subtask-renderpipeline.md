---
priority: medium
reported: 2026-04-15
status: pending
source: decomposed
parent: 134-116-scattered-constants-subtask
depends: none
summary: RenderPipelineラベル定数をグループ化
---

## Description (subtask of 134-116-scattered-constants-subtask)

RenderPipeline.ts L135-165 のラベル関連定数（約15個）を
  論理グループの const オブジェクトにまとめる:
  
  const KB_FOCUS = {
    LINE_WIDTH: 2.5,
    LINE_ALPHA: 0.95,
  } as const;
  
  const LABEL_LAYOUT = {
    CHAR_WIDTH_FACTOR: 0.6,  ← subtask-2 で constants.ts に移動済みなら import
    LINE_HEIGHT_FACTOR: 1.3,
    EDGE_OFFSET: 2,
  } as const;
  
  const LABEL_PAD = {
    SUPER_X: 10, SUPER_Y: 4,
    REGULAR_X: 8, REGULAR_Y: 3,
    TAG_X: 4, TAG_Y: 1,
  } as const;
  
  ファイル内の全参照を新オブジェクト参照に更新。
  God Object（2337行）を肥大化させないよう行数は同等以下に保つ。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
