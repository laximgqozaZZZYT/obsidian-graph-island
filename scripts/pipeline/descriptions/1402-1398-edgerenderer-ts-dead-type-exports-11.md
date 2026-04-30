## Description (subtask of 1398-dead-exports)

`src/views/EdgeRenderer.ts` で knip が dead と判定した 11 個の型エクスポートを処理する。
  対象: GroupPort, Trunk, TrunkCable, NodePort, IntraGroupCable, CableRouteOpts,
  GroupPerimInfo, PolarJunctionGrid, PortLaneInfo, PortColorLanes, CablePrepResult。

  手順:
  1. 各型名について `grep -rn "<TypeName>" src/ tests/` で参照を確認する
  2. 同ファイル内のみ参照 → `export` キーワードを削除して内部型化する
  3. テストで参照あり → `export` を保持し、knip設定 (`knip.json` 新規作成 or `package.json`) で
     `tests/` を ignore せず includeEntries 追加で対応するか、テスト側の依存方法を見直す
  4. どこからも参照なし → 型定義ごと削除する
  5. `pnpm lint && pnpm test && node scripts/check-dead-exports.mjs` で検証
  6. `src/views/EdgeRenderer.ts` の line count が 2765 を超えないこと (CLAUDE.md godobj policy)

  期待: types 列が 40 → 29 程度に減少。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
