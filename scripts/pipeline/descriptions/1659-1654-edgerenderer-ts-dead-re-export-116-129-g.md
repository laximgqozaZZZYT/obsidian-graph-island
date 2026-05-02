## Description (subtask of 1654-autonomous-stalled-dirty-skip)

src/views/EdgeRenderer.ts の 116-129 行 (`// Re-export cable-tray types for external consumers` 以下の `export type { GroupPort, Trunk, TrunkCable, NodePort, IntraGroupCable, CableRouteOpts, GroupPerimInfo, PolarJunctionGrid, PortLaneInfo, PortColorLanes, CablePrepResult };` ブロック全14行) を削除する。
  これらの型の元定義は src/views/CableTrayRenderer.ts に残るため型情報は失われない。
  knip で外部 consumer ゼロを確認済み (grep 結果: src/ tests/ 内で EdgeRenderer 経由で import している箇所なし)。
  削除後の手順:
    1. `pnpm build` で TypeScript エラーなしを確認
    2. `pnpm test` で関連テスト (edge-renderer.test.ts 等) が PASS することを確認
    3. CLAUDE.md の GOD OBJECT Policy 表で `src/views/EdgeRenderer.ts` の Max Allowed を 2765 → 2751 に更新 (ratchet down)
    4. `pnpm lint` と `pnpm format:check` を通す
  影響範囲: EdgeRenderer.ts の type re-export 削除のみ。ロジック変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
