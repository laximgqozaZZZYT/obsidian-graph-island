## Description (subtask of 1398-dead-exports)

`src/views/RenderPipeline.ts` で knip が dead と判定した 9 個のエクスポートを処理する。
  対象（関数4 + 定数5）:
  - 関数: computeGlowParams, computeLabelColors, isDensityTooClose, computeZonePlacementFromAngles
  - 定数: GLOW_ATTENUATE_THRESHOLD, GLOW_ATTENUATE_RANGE, GLOW_RADIUS_ATTENUATE_FACTOR,
    GLOW_P90_FRACTION, LABEL_Y_OFFSET_FACTOR

  手順:
  1. 各名前について `grep -rn "<Name>" src/ tests/` で参照を確認する
  2. 同ファイル内のみ参照 → `export` キーワードを削除して内部化する
  3. グロー定数は `RenderThresholds` に統合済みかも要確認 — 重複定義なら削除する
  4. テストで参照あり → `export` を保持して dead 判定を解消する別経路を検討する
  5. どこからも参照なし → 関数/定数ごと削除する
  6. `pnpm lint && pnpm test && node scripts/check-dead-exports.mjs` で検証
  7. `src/views/RenderPipeline.ts` の line count が 2657 を超えないこと (CLAUDE.md godobj policy)

  期待: exports 列が 17 → 8 程度に減少。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
