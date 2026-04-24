---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1220-143-constants-ts
depends: none
summary: timeline.ts + timeline-layout.ts の定数(9個)を constants.ts へ TIMELINE_ プレフィクスで集約
---

## Description (subtask of 1220-143-constants-ts)

1. `src/constants.ts` に `// ---- Layout constants: Timeline ----` セクションを追加
  2. `src/layouts/timeline.ts` から SCREAMING_CASE 定数(8個)を grep で抽出し `TIMELINE_` プレフィクスを付与して移動（例: `STEP_WIDTH` → `TIMELINE_STEP_WIDTH`、`LANE_HEIGHT` → `TIMELINE_LANE_HEIGHT`、`BAR_H` → `TIMELINE_BAR_H` 等）
  3. `src/layouts/timeline-layout.ts` から SCREAMING_CASE 定数(1個)を同様に移動
  4. 両ファイル内部の参照箇所を新名称に置換
  5. `tests/timeline-*.test.ts` や `tests/layouts/timeline*.test.ts` が定数を import している場合は import 文も更新
  6. 除外: 当該ファイル内でのみ使用され、他ファイル・テストから参照されていない純ローカル定数は残す
  7. `pnpm test` と `pnpm lint` が通ることを確認
  8. GOD OBJECT 4ファイルへの定数移植は禁止

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
