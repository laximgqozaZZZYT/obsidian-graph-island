---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 475-473-wheel-handler-scale-computezoomstep
depends: subtask-2
summary: 単体テスト実行と GOD OBJECT 上限遵守確認
---

## Description (subtask of 475-473-wheel-handler-scale-computezoomstep)

- `pnpm test` を実行し、既存テストが全て通ることを確認
  - `pnpm lint` と `pnpm format:check` を実行
  - `wc -l src/views/GraphViewContainer.ts` で行数が 8612 以下であることを確認
  - `pnpm build` でバンドル成功と 800KB 予算内であることを確認
  - 失敗した場合は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
