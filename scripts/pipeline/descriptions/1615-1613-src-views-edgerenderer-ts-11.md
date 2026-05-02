## Description (subtask of 1613-dead-exports)

knip が EdgeRenderer.ts で報告している 11 個の未参照型を削除する。
  対象 (exports なし、types のみ):
    GroupPort, Trunk, TrunkCable, NodePort, IntraGroupCable,
    CableRouteOpts, GroupPerimInfo, PolarJunctionGrid,
    PortLaneInfo, PortColorLanes, CablePrepResult
  手順:
  1. `grep -n "^export type \(GroupPort\|Trunk\|...\)" src/views/EdgeRenderer.ts` で該当行を特定
  2. 各型について `grep -rn "GroupPort" src/ tests/` で参照ゼロを再確認
     (knip 結果と一致するか自分で検証する)
  3. 参照ゼロのものだけ `export` を外す or 完全削除
  4. `pnpm test` と `pnpm lint` を実行、`pnpm build` で esbuild を通す
  5. `node scripts/check-dead-exports.mjs` で減少を確認 (期待: types -11)
  EdgeRenderer.ts は God Object (2765 行 / Max 2765) なので削除は許可、
  追加は禁止。行数が減ることを確認すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
