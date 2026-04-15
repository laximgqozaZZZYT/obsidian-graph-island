---
priority: medium
reported: 2026-04-15
status: done
source: decomposed
parent: 134-116-scattered-constants-subtask
depends: none
summary: card-renderer定数をオブジェクトにグループ化
---

## Description (subtask of 134-116-scattered-constants-subtask)

card-renderer.ts の15個のトップレベル定数を論理グループの
  const オブジェクトにまとめる（namespace化）:
  
  export const CARD_ICON = {
    SIZE_RATIO: 0.55,
    FOLD_RATIO: 0.28,
    OUTLINE_ALPHA: 0.7,
    FILL_ALPHA: 0.25,
    FOLD_ALPHA: 0.15,
  } as const;
  
  export const PLAIN_CARD = {
    TITLE_FONT_MIN: 3,
    BODY_FONT_MIN: 2,
    PAD: 4,
    BODY_LINE_HEIGHT: 1.4,
  } as const;
  
  既存の export 定数（CARD_FONT_FAMILY, CARD_SCALE_CAP,
  FULL_CARD_FONT_BASE 等）は外部参照があるため個別 export を維持。
  ファイル内の参照を新オブジェクト参照に更新する。
  既存テスト（card-renderer.test.ts）の更新も含む。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
