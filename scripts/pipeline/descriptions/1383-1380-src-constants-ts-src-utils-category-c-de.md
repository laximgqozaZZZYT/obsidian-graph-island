## Description (subtask of 1380-dead-exports)

`tmp/dead-exports-report.md` の Category C のうち、`src/constants.ts` と `src/utils/` 配下に該当する以下のシンボルを削除する。各シンボルは「完全未使用（プロジェクト全体で参照ゼロ）」と既に判定済み。

  src/constants.ts (削除対象シンボル):
  - VIEW_MODE_GRAPH / VIEW_MODE_SUNBURST / VIEW_MODE_TIMELINE / VIEW_MODE_TREE / VIEW_MODE_MATRIX (lines 50-54)
  - NODE_DECO_BADGE_RADIUS_PX / NODE_DECO_BADGE_MAX_COUNT / NODE_DECO_BADGE_PAD_FACTOR / NODE_DECO_RING_WIDTH / NODE_DECO_RING_PAD / NODE_DECO_RING_ALPHA / NODE_DECO_DASH_SEGMENTS / NODE_DECO_DASH_GAP_FRACTION / NODE_DECO_HALO_ALPHA_BASE / NODE_DECO_HALO_ALPHA_FACTOR / NODE_DECO_BOOKMARK_STAR_SPIKES (lines 395-415)
  - OUTLINE_PAD_MIN / OUTLINE_PAD_FACTOR / HULL_SAMPLES / OVERLAP_RECOMPUTE_FRAMES / SIZE_FADE_DIVISOR / FILL_ALPHA_BASE / FILL_ALPHA_OVERLAP / LABEL_COLLISION_MAX_ATTEMPTS / STROKE_ALPHA_NO_OVERLAP / STROKE_ALPHA_OVERLAP_MIN / STROKE_ALPHA_OVERLAP_BASE / STROKE_WIDTH_NO_OVERLAP / STROKE_WIDTH_OVERLAP_BASE / STROKE_WIDTH_OVERLAP_MIN / BORDER_OUTER_WIDTH / BORDER_OUTER_ALPHA_FACTOR / SIZE_FADE_MIN / FILL_ALPHA_VISIBILITY_THRESHOLD / LABEL_DARKEN_FACTOR / LABEL_PILL_PAD_X / LABEL_PILL_PAD_Y / COLLISION_ESCAPE_MARGIN / ZOOM_OUT_THRESHOLD (lines 466-510)
  - PATHFINDER_COLOR / PATHFINDER_COLOR_CSS / PATHFINDER_GLOW_STROKE_WIDTH / PATHFINDER_SOLID_STROKE_WIDTH / PATHFINDER_DOT_RADIUS / PATHFINDER_LABEL_FONT_SIZE (lines 735-753)

  src/utils/ (削除対象):
  - src/utils/color.ts: adjustBrightness (line 22)
  - src/utils/git-status-emit.ts: emitGitStatusShortResult (line 34)
  - src/utils/graph-helpers.ts: shiftHue (line 185), computeTimelineFilteredIds (line 998)
  - src/utils/gvc-helpers.ts: heatmapColor (line 103), COMMUNITY_PALETTE (line 112), findMatchingGroupPreset (line 121), resolveNodeColor (line 139)
  - src/utils/node-grouping.ts: groupNodesByTag (line 70), expandGroup (line 237)
  - src/utils/timeout-tracker.ts: TimeoutTracker class全体（ファイル削除可能なら削除）

  手順:
  1. 各シンボルを Grep で再確認（`Symbol\b` で参照ゼロを確認）
  2. シンボル定義と関連ヘルパ（プライベート関数のみ呼ばれる場合）を削除
  3. `pnpm lint` で未参照 import が残っていないか確認、あれば削除
  4. `pnpm test` PASS、`pnpm build` PASS を確認
  5. `node scripts/list-dead-exports.mjs` を実行し Category C が約60件以下になったことを記録

  禁止: GOD OBJECTファイル(`GraphViewContainer.ts` 等)を編集対象に含めないこと。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
