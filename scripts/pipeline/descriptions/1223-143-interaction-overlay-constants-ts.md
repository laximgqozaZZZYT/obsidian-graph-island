
## Description (subtask of 143-scattered-constants)

View 層の Interaction/Overlay/Export/Snapshot 補助モジュールの定数を `constants.ts` に集約（約55個）。
  対象件数: InteractionManager(17), DiffOverlay(15), ExportOrchestrator(9), LayoutTransition(5), panel-defaults(4), inertia-pan(3), KeyboardHandler(2), SnapshotManager(2), ExportManager(2), export-orchestrator(2), snapshot/GraphSnapshot(2), animation-controller(1), SearchOrchestrator(1)。
  手順:
  1. `constants.ts` に `// ---- Interaction / Overlay / Export ----` セクション新設。
  2. 用途別プレフィクス（`INTERACTION_`, `DIFF_`, `LAYOUT_TRANS_`, `INERTIA_`, `KEY_`, `EXPORT_`, `SNAPSHOT_`, `PANEL_DEFAULT_`）で移動。
  3. 各ファイルで import 置換。
  4. `pnpm test`, `pnpm lint` 通過を確認。
  禁止: `PanelBuilder.ts`（GOD OBJECT）は触らない（その 2 定数は残す）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
