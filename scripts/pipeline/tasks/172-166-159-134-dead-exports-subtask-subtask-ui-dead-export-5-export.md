---
priority: high
reported: 2026-04-16
status: pending
source: decomposed
parent: 166-159-134-dead-exports-subtask-subtask
depends: none
summary: UI関連ファイルの dead export 5個を削除または export 解除
---

## Description (subtask of 166-159-134-dead-exports-subtask-subtask)

- setPanelValue, getPanelValue (panel-helpers.ts): 未使用なら export 解除
  - CARD_ICON, PLAIN_CARD (card-renderer.ts): 未使用なら export 解除
  - THUMBNAIL_MARGIN (gvc-constants.ts): 未使用なら export 解除
  各シンボルが同ファイル内で使われている場合は export のみ外す。
  完全未使用なら関数/定数ごと削除。
  pnpm build && pnpm test で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
